package com.zirenmidori.gcg.release;

import android.content.Context;
import java.io.*;
import java.util.*;
import org.json.*;

/**
 * Unattended data updates. A data delta copied into files/updates/auto (for example with adb push) applies at the
 * next cold start, before the local server and Unity run, without a prompt. Only offline data deltas signed with the
 * embedded publisher key qualify; packages apply in base order, so a chain (A to B, B to C) applies in one start.
 * A package that cannot apply moves to updates/auto/failed with its reason, so it never blocks the game. Each run
 * writes updates/auto/last-boot.json, which a PC can read without access to the app's private files.
 */
public final class ReleaseInbox {
    public static final String FOLDER="updates/auto",SUFFIX=".gcgupdate",RESULT="last-boot.json";
    private static final int MAX_ROUNDS=64;
    public interface Log { void line(String text); }
    private ReleaseInbox(){}
    public static File inbox(Context c)throws IOException{return ReleaseIO.dir(new File(ReleaseStore.external(c),FOLDER));}
    private static File[] packages(File inbox,Set<String> handled){
        File[] files=inbox.listFiles(f->f.isFile()&&f.getName().endsWith(SUFFIX)&&!handled.contains(f.getName()));
        if(files==null)return new File[0];
        Arrays.sort(files,Comparator.comparing(File::getName));return files;
    }
    private static String reason(Exception e){return e.getMessage()==null?e.getClass().getSimpleName():e.getMessage();}
    private static String stamp(){return new java.text.SimpleDateFormat("yyyyMMdd-HHmmss",Locale.ROOT).format(new Date());}
    /** Applies every qualifying package; throws only when the inbox itself or the result file is unusable. */
    public static JSONObject applyAll(Context c,ReleaseDownload.Progress progress,Log log)throws IOException{
        File inbox=inbox(c);Set<String> handled=new HashSet<>();
        JSONArray applied=new JSONArray(),failed=new JSONArray(),waiting=new JSONArray();
        JSONObject state=ReleaseStore.state(c);String before=state==null?null:state.optString("releaseId",null),current=before;
        try{
            if(current!=null)for(int round=0;round<MAX_ROUNDS;round++){
                File next=null;String id=null;
                for(File f:packages(inbox,handled)){
                    ReleaseManifest m;
                    try{
                        m=ReleaseEngine.inspect(c,f,false);
                        if(!m.kind.equals("delta")||!m.packs.isEmpty())throw new IOException("Not an offline data delta");
                        if(m.json.optJSONObject("apk")!=null)throw new IOException("APK updates need the Update screen");
                    }catch(IOException e){quarantine(inbox,f,e,handled,failed,log);continue;}
                    if(m.json.optString("baseReleaseId").equals(current)){next=f;id=m.releaseId;break;}
                }
                if(next==null)break;
                String name=next.getName();handled.add(name);
                progress.show("Applying update "+id+"…");log.line("applying "+name+": "+current+" -> "+id);
                try{
                    ReleaseEngine.importUpdate(c,next,false,progress);
                    JSONObject now=ReleaseStore.state(c);
                    if(now==null||!id.equals(now.optString("releaseId")))throw new IOException("Release marker did not move to "+id);
                    current=id;
                }catch(IOException e){handled.remove(name);quarantine(inbox,next,e,handled,failed,log);continue;}
                JSONObject row=new JSONObject().put("file",name).put("releaseId",id);
                try{File done=ReleaseIO.dir(new File(ReleaseStore.external(c),"updates/applied"));File target=new File(done,name);
                    if(target.exists()&&!target.delete())throw new IOException("Cannot replace "+target.getName());
                    ReleaseIO.rename(next,target);row.put("movedTo","updates/applied/"+name);
                }catch(IOException e){row.put("moveError",reason(e));log.line("applied "+name+" but could not move it: "+reason(e));}
                applied.put(row);log.line("applied "+name);
            }
            for(File f:packages(inbox,handled))waiting.put(f.getName());
            JSONObject result=new JSONObject().put("schemaVersion",1).put("time",System.currentTimeMillis())
                .put("before",before==null?JSONObject.NULL:before).put("after",current==null?JSONObject.NULL:current)
                .put("applied",applied).put("failed",failed).put("waiting",waiting);
            ReleaseStore.writeJson(new File(inbox,RESULT),result);
            return result;
        }catch(JSONException e){throw new IOException("Cannot record update inbox result",e);}
    }
    /** Moves a package that cannot apply out of the inbox, with its reason next to it. It stays only if the move fails. */
    private static void quarantine(File inbox,File f,Exception e,Set<String> handled,JSONArray failed,Log log)throws JSONException{
        String why=reason(e),name=f.getName();handled.add(name);log.line("failed "+name+": "+why);
        JSONObject row=new JSONObject().put("file",name).put("reason",why);
        try{
            File dir=ReleaseIO.dir(new File(inbox,"failed"));File target=new File(dir,stamp()+"-"+name);
            ReleaseIO.rename(f,target);ReleaseIO.atomic(new File(dir,target.getName()+".txt"),ReleaseIO.utf8(why+"\n"));
            row.put("movedTo",FOLDER+"/failed/"+target.getName());
        }catch(IOException moveError){row.put("moveError",reason(moveError));}
        failed.put(row);
    }
}
