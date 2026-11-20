import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AutoUseItemCatalog } from "../src/game-data/auto-use-item-data.js";
import { parseTable, int, numbers } from "../src/game-data/event-tower-data.js";
import {
  BOSS_TASK,
  BUFF_TASK,
  COOP_TASK,
  LINKAGE_TASK,
  MICRO_DIFF_MAX,
  MICRO_TASK,
  MIX_TASK,
  NAMED_COMMAND,
  NAMED_FAMILIES,
  NamedTowerCatalog,
  SECOND_TASK,
  namedTowerErrorReply,
  parseNamedTowerCall,
  type NamedFamilyKey,
} from "../src/game-data/named-tower-data.js";

const catalog = NamedTowerCatalog.loadDefault();

describe("named-field event tower tables", () => {
  it("are byte copies of the setting.u tables recorded in provenance.json", () => {
    const directory = path.resolve("resources/tower");
    const provenance = JSON.parse(
      readFileSync(path.join(directory, "provenance.json"), "utf8"),
    ) as { files: Record<string, { source: string; sha256: string; bytes: number }> };
    const wanted = [
      "microtower/microtower.txt",
      "microtower/firsttower/firsttowerlevel.txt",
      "microtower/microtowergoal.txt",
      "coopclient/coopclientactivities.txt",
      "coopclient/coopclientlevel.txt",
      "mixonline/mixonlineactivities.txt",
      "mixonline/mixonlinelevel.txt",
      "mixonline/christmasnode.txt",
      "mixonline/3p9cnode.txt",
      "mixonline/barragetext.txt",
      "bufftower/bufftower.txt",
      "bufftower/bufftowerlevel.txt",
      "bufftower/bufftowerbuff.txt",
      "bufftower/bufftoweraward.txt",
      "linkageactivity/linkagetower.txt",
      "linkageactivity/linkagelevel.txt",
      "linkageactivity/linkagemission.txt",
      "linkageactivity/towerpond.txt",
      "linkageactivity/towerpondtoken.txt",
      "2ndanniversary/2ndanniversarytowertotal.txt",
      "2ndanniversary/2ndanniversarytowerlevel.txt",
      "bosschallenge/bosschallenge.txt",
      "bosschallenge/bosschallengelevel.txt",
      "bosschallenge/bosschallengescore.txt",
    ];
    for (const name of wanted) {
      const entry = provenance.files[name];
      expect(entry, name).toBeDefined();
      const data = readFileSync(path.join(directory, name));
      expect(data.length, name).toBe(entry!.bytes);
      expect(createHash("sha256").update(data).digest("hex"), name).toBe(entry!.sha256);
      expect(entry!.source).toBe(
        `setting.u:assets/_game/settinggen/activities/${name}`,
      );
    }
  });

  it("give every family its levels", () => {
    const sizes = Object.fromEntries(
      [...catalog.levels].map(([key, levels]) => [key, levels.size]),
    );
    expect(sizes).toEqual({
      micro: 30,
      coop: 43,
      buff: 108,
      linkage: 30,
      second: 40,
      boss: 9,
      mix: 17,
    });
  });

  it("find the mixed online nodes of both events: cartoons pay CartoonReward, online nodes are missing", () => {
    expect(catalog.mixActivities).toEqual([1, 2]);
    // Christmas: cartoon nodes 1, 5, 7, 9, 11-15, level nodes 2, 3, 4, 6; node 8 is an online level.
    const christmas = [...catalog.levels.get("mix")!.values()].filter(
      (l) => l.tower === 1,
    );
    expect(christmas.map((l) => l.node).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 9, 11, 12, 13, 14, 15,
    ]);
    expect(catalog.level("mix", 1, 8, 0)).toBeNull();
    const cartoon = catalog.level("mix", 1, 1, 0)!;
    expect(cartoon.type).toBe(2);
    expect(cartoon.firstAwards).toEqual([[15, 2, 1, 1, 20]]);
    expect(catalog.mixCartoons.has("1:1")).toBe(true);
    // Node 2 of the Christmas event is level 1 of MixOnlineLevel Id 1.
    expect(catalog.level("mix", 1, 2, 0)).toMatchObject({ cost: 10, type: 0, node: 2 });
    expect(catalog.level("mix", 2, 2, 0)).toMatchObject({ cost: 10, type: 0, node: 2 });
    expect(catalog.barrageSizes).toEqual([50, 50, 50, 50]);
  });

  it("read the armed survey SP level: kill award, other cost and type", () => {
    const sp = catalog.level("coop", 4, 5, 0)!;
    expect(sp.type).toBe(3);
    expect(sp.killAward).toEqual({ attribute: 7, max: 150, award: [15, 78, 1, 1, 10] });
    expect(sp.otherCost).toEqual({ moneyId: 51, count: 60 });
    expect(catalog.level("coop", 1, 2, 0)).toMatchObject({ cost: 12, killAward: null });
  });

  it("keep the buff scores in the order of the client's position list", () => {
    expect(catalog.buffScores.get("1:1:1")).toEqual([10, 10, 20]);
    expect(catalog.buffAwards.get(1)![0]).toMatchObject({ index: 1, score: 10 });
    expect(catalog.bossAwards.get(1)!.length).toBe(20);
    expect(catalog.level("boss", 1, 1, 3)!.maxScore).toBe(6000);
  });

  it("read the linkage ponds, token and mission lists", () => {
    expect([...catalog.linkagePonds.keys()]).toEqual([1, 2, 3, 4, 5]);
    expect(catalog.linkageToken).toEqual({ times: 1, cost: 1, moneyId: 88 });
    expect(catalog.linkageIds).toEqual([1]);
    const missions = catalog.linkageMissions.get(1)!;
    expect(missions.daily).toBe(5700);
    expect(missions.states.map((ids) => ids.length)).toEqual([10, 10, 10, 10]);
    expect(catalog.linkagePonds.get(1)![0]).toMatchObject({ special: true, count: 1 });
  });

  it("pays each family's event currency into the wallet its top table names", () => {
    const autoUse = AutoUseItemCatalog.loadDefault();
    const read = (file: string) =>
      parseTable(readFileSync(path.resolve("resources/tower", file), "utf8"));
    /** Wallet ids a top table names per event id. */
    const wallets = new Map<string, Set<number>>();
    for (const row of read("coopclient/coopclientactivities.txt"))
      wallets.set(`coop:${int(row.Id)}`, new Set(numbers(row.MoneyIDs)));
    for (const row of read("mixonline/mixonlineactivities.txt"))
      wallets.set(`mix:${int(row.Id)}`, new Set(numbers(row.MoneyType)));
    for (const row of read("2ndanniversary/2ndanniversarytowertotal.txt"))
      wallets.set(`second:${int(row.Id)}`, new Set(numbers(row.MoneyType)));
    for (const row of read("linkageactivity/linkagetower.txt"))
      wallets.set(`linkage:0`, new Set(numbers(row.MoneyType)));
    let checked = 0;
    const orphans = new Set<string>();
    for (const [key, levels] of catalog.levels)
      for (const level of levels.values())
        for (const { award } of level.fixedAwards) {
          if (award[0] !== 15) continue;
          const effect = autoUse.effect(award[0], award[1], award[2], award[3]);
          const allowed = wallets.get(`${key}:${level.tower}`);
          if (!allowed) {
            orphans.add(`${key}:${level.tower}`);
            continue;
          }
          expect(effect?.kind, `${key} ${level.tower}:${award.join("-")}`).toBe(
            "money",
          );
          expect(
            allowed!.has(effect!.kind === "money" ? effect.moneyId : -1),
            `${key} ${level.tower}:${award.join("-")}`,
          ).toBe(true);
          checked++;
        }
    expect(checked).toBeGreaterThan(40);
    // CoopClientLevel has an event 6 that CoopClientActivities.txt never lists: it can not be opened.
    expect([...orphans]).toEqual(["coop:6"]);
  });

  it("shares these records between events, as the client's keys carry no event id", () => {
    // Armed survey: seven events share 68/10 + level. Buff tower: 64/5008, 5009, 5100+, 5200+.
    // Mixed online: two events share 68/1002 bits. Second anniversary: one bit per event in one task.
    const slot = (key: NamedFamilyKey, tower: number, levelId: number, diff = 0) =>
      NAMED_FAMILIES[key].recordKey(catalog.level(key, tower, levelId, diff)!);
    expect(slot("coop", 1, 2)).toBe(slot("coop", 8, 2));
    expect(slot("buff", 1, 1, 1)).toBe(slot("buff", 7, 1, 1));
    expect(slot("mix", 1, 2)).toBe(slot("mix", 2, 2));
    expect(slot("second", 1, 2)).toBe(slot("second", 2, 2));
    const second = (tower: number) =>
      NAMED_FAMILIES.second.recordBit(catalog.level("second", tower, 2, 0)!);
    expect([second(1), second(2)]).toEqual([0, 1]);
    // Boss challenge and second anniversary tower are both in group 81 but use different keys.
    expect(slot("boss", 1, 1, 1)).not.toBe(slot("second", 1, 2));
  });
});

describe("named-field event tower requests", () => {
  const call = (parameters: unknown) => parseNamedTowerCall(parameters);

  it("reads Enter as CallServer and Pass and Fail inside DoSettle, with the fields of each family", () => {
    expect(
      call({
        sCmd: 286,
        tbParam: { nTowerId: 1, nLevelId: 3, nDiff: 2, nFormationId: 4 },
      }),
    ).toMatchObject({
      settled: false,
      request: {
        kind: "enter",
        family: "micro",
        towerId: 1,
        levelId: 3,
        diff: 2,
        formationId: 4,
      },
    });
    const wrapped = call({
      sCmd: 252,
      tbParam: {
        sCmd: 287,
        tbParam: { nTowerId: 1, nLevelId: 1, nDiff: 1, tbGoals: { 1: true } },
      },
    });
    expect(wrapped).toMatchObject({
      settled: true,
      request: { kind: "pass", family: "micro" },
    });
    // Mixed online names a node and calls the formation formationId; fail sends nEquipId.
    expect(
      call({ sCmd: 451, tbParam: { nType: 24, nodeId: 3, formationId: 2 } }),
    ).toMatchObject({
      request: { kind: "enter", family: "mix", node: 3, formationId: 2 },
    });
    // Buff, boss and linkage Fail carry no event id.
    expect(
      call({
        sCmd: 252,
        tbParam: {
          sCmd: 379,
          tbParam: { nType: 20, nLevelId: 2, nDiff: 1, nFormationId: 1 },
        },
      }),
    ).toMatchObject({ request: { kind: "fail", family: "buff", towerId: 0 } });
    expect(
      call({ sCmd: 401, tbParam: { nLevelId: 4, nDiff: 1, nFormationId: 1 } }),
    ).toMatchObject({
      request: { kind: "enter", family: "linkage", towerId: 0, levelId: 4 },
    });
  });

  it("reads the single calls: echoes, score awards, mission claim as an array, gacha, barrage", () => {
    expect(call({ sCmd: 285, tbParam: { nTowerId: 1 } })?.request).toEqual({
      kind: "echo",
      command: 285,
      field: "nTowerId",
      value: 1,
    });
    expect(call({ sCmd: 335, tbParam: { nId: 5 } })?.request).toMatchObject({
      kind: "echo",
      field: "nId",
      value: 5,
    });
    expect(
      call({ sCmd: 339, tbParam: { bSave: true, maxDamage: 77 } })?.request,
    ).toMatchObject({
      kind: "coopSaveSp",
      save: true,
      maxDamage: 77,
    });
    expect(call({ sCmd: 339, tbParam: { bSave: false } })?.request).toMatchObject({
      save: false,
    });
    expect(call({ sCmd: 376, tbParam: { nId: 2 } })?.request).toMatchObject({
      kind: "scoreAward",
      family: "buff",
      towerId: 2,
    });
    expect(call({ sCmd: 535, tbParam: { nId: 1 } })?.request).toMatchObject({
      kind: "scoreAward",
      family: "boss",
    });
    expect(call({ sCmd: 404, tbParam: [2, 5711] })?.request).toMatchObject({
      kind: "linkageMission",
      stateId: 2,
      missionId: 5711,
    });
    expect(
      call({ sCmd: 405, tbParam: { nPondId: 3, nType: 1 } })?.request,
    ).toMatchObject({
      kind: "linkageGacha",
      pondId: 3,
    });
    expect(call({ sCmd: 455, tbParam: {} })?.request).toMatchObject({
      kind: "mixBarrage",
      message: null,
    });
    expect(
      call({ sCmd: 455, tbParam: { nType: 1, tbBarrage: [3, 2, 1, 4] } })?.request,
    ).toMatchObject({ message: [3, 2, 1, 4] });
    expect(call({ sCmd: 260, tbParam: { idx: 5 } })?.request).toMatchObject({
      kind: "mixCartoon",
      node: 5,
    });
    for (const command of [261, 454, 528])
      expect(call({ sCmd: command, tbParam: {} })).not.toBeNull();
  });

  it("leaves everything else on the unhandled path", () => {
    // 223 is accepted by the gateway without a reply; the ranking, music and chess calls are not here.
    for (const command of [223, 53, 54, 250, 371, 426, 536, 539, 999])
      expect(call({ sCmd: command, tbParam: {} }), String(command)).toBeNull();
    expect(call(null)).toBeNull();
    expect(call({ sCmd: 252, tbParam: null })).toBeNull();
    expect(call({ sCmd: "x" })).toBeNull();
  });

  it("answers every family's refusal in the shape its client handler reads", () => {
    const enter = call({ sCmd: 286, tbParam: {} })!.request;
    const fail = call({ sCmd: 288, tbParam: {} })!.request;
    expect(namedTowerErrorReply(enter, 5)).toEqual({ nError: 5 });
    expect(namedTowerErrorReply(fail, 5)).toEqual({});
    expect(namedTowerErrorReply(call({ sCmd: 376, tbParam: {} })!.request, 13)).toEqual(
      {
        nError: 13,
      },
    );
    expect(namedTowerErrorReply(call({ sCmd: 339, tbParam: {} })!.request, 2)).toEqual({
      tbAward: [],
    });
    expect(namedTowerErrorReply(call({ sCmd: 260, tbParam: {} })!.request, 2)).toEqual(
      [],
    );
  });

  it("names every command of the families once", () => {
    const commands = Object.values(NAMED_COMMAND);
    expect(new Set(commands).size).toBe(commands.length);
  });
});

/**
 * The layouts are copied from the 0.1.3 client scripts. Run with
 * GCG_CLIENT_LUA_DIR=<folder with the decrypted *.lua.txt> to compare them.
 */
const luaDirectory = process.env.GCG_CLIENT_LUA_DIR ?? "";
describe.skipIf(!luaDirectory || !existsSync(luaDirectory))(
  "named-field event tower layouts against the client Lua",
  () => {
    const lua = (name: string): string =>
      readFileSync(path.join(luaDirectory, `${name}.lua.txt`), "utf8");
    /** The number a Lua line assigns, "Class.name = 12" or "task_offset + 8". */
    const value = (source: string, pattern: RegExp): number => {
      const match = source.match(pattern);
      if (!match) throw new Error(`Not found: ${pattern}`);
      return Number(match[1]);
    };

    it("micro tower: group 59, five difficulties, pass 100, score 200, goals 300, story flag 403", () => {
      const source = lua("microclimbtower");
      expect(NAMED_FAMILIES.micro.group).toBe(
        value(source, /MicroClimbTower\.nGroupId\s*=\s*(\d+)/),
      );
      expect(MICRO_DIFF_MAX).toBe(
        value(source, /FirstTowerLogic\.DIFF_MAX\s*=\s*(\d+)/),
      );
      const start = value(source, /FirstTowerLogic\.nTaskId_START\s*=\s*(\d+)/);
      expect(MICRO_TASK.pass).toBe(
        start +
          value(
            source,
            /nTaskId_LevelPass\s*=\s*FirstTowerLogic\.nTaskId_START \+ (\d+)/,
          ),
      );
      expect(MICRO_TASK.score).toBe(
        start +
          value(
            source,
            /nTaskId_LevelScore\s*=\s*FirstTowerLogic\.nTaskId_START \+ (\d+)/,
          ),
      );
      expect(MICRO_TASK.goals).toBe(
        start +
          value(
            source,
            /nTaskId_LevelGoals\s*=\s*FirstTowerLogic\.nTaskId_START \+ (\d+)/,
          ),
      );
      expect(MICRO_TASK.story).toBe(
        start +
          value(
            source,
            /nTaskId_PlayStore\s*=\s*FirstTowerLogic\.nTaskId_START \+ (\d+)/,
          ),
      );
    });

    it("armed survey and mixed online share group 68", () => {
      const coop = lua("coopclientevent");
      expect(NAMED_FAMILIES.coop.group).toBe(
        value(coop, /tbEvent\.TaskGroup\s*=\s*(\d+)/),
      );
      expect(COOP_TASK.maxScore).toBe(value(coop, /nTask_MaxScore\s*=\s*(\d+)/));
      expect(COOP_TASK.pass).toBe(value(coop, /nTask_PassLevel\s*=\s*(\d+)/));
      const mix = lua("mixonlinelogic");
      expect(NAMED_FAMILIES.mix.group).toBe(value(mix, /nTask_Group\s*=\s*(\d+)/));
      expect(MIX_TASK.currentId).toBe(value(mix, /nTask_Id\s*=\s*(\d+)/));
      expect(MIX_TASK.nodes).toBe(value(mix, /nTask_NodeState\s*=\s*(\d+)/));
    });

    it("buff tower: group 64 at offset 5000", () => {
      const source = lua("bufftowerlogic");
      const offset = value(source, /local task_offset\s*=\s*(\d+)/);
      expect(NAMED_FAMILIES.buff.group).toBe(
        value(source, /tbLogic\.nGroup\s*=\s*(\d+)/),
      );
      expect(BUFF_TASK.total).toBe(
        offset + value(source, /nTask_TotalScore\s*=\s*task_offset \+ (\d+)/),
      );
      expect(BUFF_TASK.got).toBe(
        offset + value(source, /nTask_ScoreAward\s*=\s*task_offset \+ (\d+)/),
      );
      expect(BUFF_TASK.pass).toBe(
        offset + value(source, /nTask_LevelPass\s*=\s*task_offset \+ (\d+)/),
      );
      expect(BUFF_TASK.score).toBe(
        offset + value(source, /nTask_LevelScore\s*=\s*task_offset \+ (\d+)/),
      );
      expect(BUFF_TASK.diffCount).toBe(value(source, /tbLogic\.DiffCount\s*=\s*(\d+)/));
    });

    it("linkage: group 63, event id 3001, passes 3002, gacha 3200, pond size 20", () => {
      const source = lua("linkageactivitylogic");
      expect(NAMED_FAMILIES.linkage.group).toBe(
        value(source, /nTask_Group\s*=\s*(\d+)/),
      );
      expect(LINKAGE_TASK.actId).toBe(value(source, /nTask_ActId\s*=\s*(\d+)/));
      expect(LINKAGE_TASK.pass).toBe(value(source, /nTask_LevelPass\s*=\s*(\d+)/));
      expect(LINKAGE_TASK.gacha).toBe(value(source, /nTask_Gacha\s*=\s*(\d+)/));
      expect(LINKAGE_TASK.pondSize).toBe(value(source, /nPondSize\s*=\s*(\d+)/));
    });

    it("second anniversary tower and boss challenge: group 81", () => {
      const second = lua("secondanniversarytower");
      expect(NAMED_FAMILIES.second.group).toBe(value(second, /nTaskGroup\s*=\s*(\d+)/));
      expect(SECOND_TASK.pass).toBe(value(second, /nTask_LevelPass\s*=\s*(\d+)/));
      const boss = lua("bosschallengelogic");
      expect(NAMED_FAMILIES.boss.group).toBe(value(boss, /nTaskGroup\s*=\s*(\d+)/));
      expect(BOSS_TASK.got).toBe(value(boss, /nTask_GotScore\s*=\s*(\d+)/));
      expect(BOSS_TASK.pass).toBe(value(boss, /nTask_LevelPass\s*=\s*(\d+)/));
      expect(BOSS_TASK.score).toBe(value(boss, /nTask_LevelScore\s*=\s*(\d+)/));
      expect(BOSS_TASK.diffCount).toBe(value(boss, /local maxDiff\s*=\s*(\d+)/));
    });

    it("sends the commands the families name", () => {
      const source = lua("luacall");
      const id = (name: string): number =>
        value(source, new RegExp(`LuaCall\\.${name}\\s*=\\s*(\\d+)`));
      expect(NAMED_COMMAND.microEnter).toBe(id("MicroTower_EnterTower"));
      expect(NAMED_COMMAND.coopSaveSp).toBe(id("CoopClient_SaveSp"));
      expect(NAMED_COMMAND.mixBarrage).toBe(id("MixOnline_Barrage"));
      expect(NAMED_COMMAND.linkageGacha).toBe(id("Linkage_Gacha"));
      expect(NAMED_COMMAND.buffScoreAward).toBe(id("BuffTower_GetScoreAward"));
      expect(NAMED_COMMAND.secondEnter).toBe(id("SecondAnniversaryTower_EnterTower"));
      expect(NAMED_COMMAND.bossScoreAward).toBe(id("BossChallenge_GetScoreAward"));
      expect(NAMED_COMMAND.barrage2nd).toBe(id("AnniversaryBarrage"));
      expect(NAMED_COMMAND.coopEventApply).toBe(id("ApplyCompleteCoopEvent"));
      expect(NAMED_COMMAND.reportLog).toBe(id("WriteReportLog"));
    });
  },
);
