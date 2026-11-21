import android.content.Context;
import com.zirenmidori.gcg.release.*;
import java.io.*;
import java.security.*;
import java.util.*;
import org.json.*;

/** Unattended boot updates from files/updates/auto, run on the production ReleaseInbox and ReleaseEngine. */
final class InboxHostChecks {
    static final ReleaseInbox.Log QUIET=line->{};
    static File drop(Context c,String name,JSONObject doc,Map<String,byte[]> contents,KeyPair signer)throws Exception{
        Map<String,byte[]> entries=new LinkedHashMap<>(contents);byte[] raw=UpdaterHostTest.b(doc.toString());
        entries.put("manifest.json",raw);entries.put("manifest.sig",UpdaterHostTest.sign(raw,signer));entries.put("publisher.der",signer.getPublic().getEncoded());
        File f=new File(ReleaseInbox.inbox(c),name);UpdaterHostTest.zip(f,entries);return f;
    }
    static JSONObject delta(String release,String base,String file,String body)throws Exception{
        JSONObject d=UpdaterHostTest.doc(release,base);d.getJSONArray("files").put(UpdaterHostTest.row(file,UpdaterHostTest.b(body)));return d;
    }
    static Map<String,byte[]> content(String file,String body){return Collections.singletonMap("files/"+file,UpdaterHostTest.b(body));}
    static JSONObject result(Context c)throws Exception{return ReleaseStore.readJson(new File(ReleaseInbox.inbox(c),ReleaseInbox.RESULT));}
    static int count(File dir,String suffix){File[] f=dir.listFiles(x->x.getName().endsWith(suffix));return f==null?0:f.length;}
    static void run(KeyPairGenerator generator)throws Exception{
        KeyPair keys=UpdaterHostTest.keys;
        UpdaterHostTest.test("boot inbox applies a chain in base order, not name order",()->{
            Context c=UpdaterHostTest.context("inbox-chain");UpdaterHostTest.state(c,"0.1.0");UpdaterHostTest.write(UpdaterHostTest.external(c,"a.u"),UpdaterHostTest.b("old"));
            drop(c,"a-second.gcgupdate",delta("0.1.2","0.1.1","a.u","two"),content("a.u","two"),keys);
            drop(c,"z-first.gcgupdate",delta("0.1.1","0.1.0","a.u","one"),content("a.u","one"),keys);
            List<String> shown=new ArrayList<>();JSONObject r=ReleaseInbox.applyAll(c,shown::add,QUIET);
            UpdaterHostTest.yes(ReleaseStore.state(c).getString("releaseId").equals("0.1.2"),"chain committed");
            UpdaterHostTest.yes(UpdaterHostTest.text(UpdaterHostTest.external(c,"a.u")).equals("two"),"last resource wins");
            UpdaterHostTest.yes(r.getJSONArray("applied").length()==2&&r.getJSONArray("applied").getJSONObject(0).getString("releaseId").equals("0.1.1"),"applied in base order");
            UpdaterHostTest.yes(r.getString("before").equals("0.1.0")&&r.getString("after").equals("0.1.2"),"before and after recorded");
            UpdaterHostTest.yes(count(ReleaseInbox.inbox(c),".gcgupdate")==0&&count(UpdaterHostTest.external(c,"updates/applied"),".gcgupdate")==2,"both moved to applied");
            UpdaterHostTest.yes(shown.contains("Applying update 0.1.1…")&&shown.contains("Applying update 0.1.2…"),"boot screen names each update");
            UpdaterHostTest.yes(result(c).getJSONArray("applied").length()==2,"result file written");
        });
        UpdaterHostTest.test("boot inbox sets bad packages aside and still applies the good one",()->{
            Context c=UpdaterHostTest.context("inbox-bad");UpdaterHostTest.state(c,"0.1.0");UpdaterHostTest.write(UpdaterHostTest.external(c,"a.u"),UpdaterHostTest.b("old"));
            drop(c,"a-bad-sha.gcgupdate",delta("0.1.1","0.1.0","a.u","new"),content("a.u","BAD"),keys);
            drop(c,"b-foreign.gcgupdate",delta("0.1.1","0.1.0","a.u","new"),content("a.u","new"),generator.generateKeyPair());
            JSONObject apk=delta("0.1.1","0.1.0","a.u","new");apk.put("apk",new JSONObject());drop(c,"c-apk.gcgupdate",apk,content("a.u","new"),keys);
            drop(c,"d-good.gcgupdate",delta("0.1.1","0.1.0","a.u","new"),content("a.u","new"),keys);
            JSONObject r=ReleaseInbox.applyAll(c,s->{},QUIET);
            UpdaterHostTest.yes(ReleaseStore.state(c).getString("releaseId").equals("0.1.1")&&UpdaterHostTest.text(UpdaterHostTest.external(c,"a.u")).equals("new"),"good package applied");
            UpdaterHostTest.yes(r.getJSONArray("failed").length()==3,"three set aside: "+r.getJSONArray("failed"));
            File failed=new File(ReleaseInbox.inbox(c),"failed");
            UpdaterHostTest.yes(count(failed,".gcgupdate")==3&&count(failed,".gcgupdate.txt")==3,"each failed package kept with its reason");
            UpdaterHostTest.yes(count(ReleaseInbox.inbox(c),".gcgupdate")==0,"inbox empty");
            UpdaterHostTest.yes(!new File(ReleaseStore.root(c),"journal.json").exists(),"no open transaction");
        });
        UpdaterHostTest.test("boot inbox leaves a package for another base waiting",()->{
            Context c=UpdaterHostTest.context("inbox-wait");UpdaterHostTest.state(c,"0.1.0");
            drop(c,"later.gcgupdate",delta("0.1.6","0.1.5","a.u","x"),content("a.u","x"),keys);
            JSONObject r=ReleaseInbox.applyAll(c,s->{},QUIET);
            UpdaterHostTest.yes(ReleaseStore.state(c).getString("releaseId").equals("0.1.0"),"release unchanged");
            UpdaterHostTest.yes(r.getJSONArray("waiting").length()==1&&r.getJSONArray("failed").length()==0&&new File(ReleaseInbox.inbox(c),"later.gcgupdate").isFile(),"waiting, not failed");
        });
        UpdaterHostTest.test("boot inbox ignores partial copies and records an empty run",()->{
            Context c=UpdaterHostTest.context("inbox-empty");UpdaterHostTest.state(c,"0.1.0");
            UpdaterHostTest.write(new File(ReleaseInbox.inbox(c),".x.gcgupdate.part"),UpdaterHostTest.b("half"));
            JSONObject r=ReleaseInbox.applyAll(c,s->{},QUIET);
            UpdaterHostTest.yes(r.getJSONArray("applied").length()==0&&r.getJSONArray("failed").length()==0&&r.getJSONArray("waiting").length()==0,"nothing to do");
            UpdaterHostTest.yes(new File(ReleaseInbox.inbox(c),".x.gcgupdate.part").isFile(),"a copy in progress is not touched");
        });
    }
}
