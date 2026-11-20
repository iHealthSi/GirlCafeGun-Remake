import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { AutoUseItemCatalog } from "../src/game-data/auto-use-item-data.js";
import {
  EventTowerCatalog,
  LUA_COMMAND_NODE_POINT_REWARD,
  LUA_COMMAND_POND_DRAW,
  LUA_COMMAND_POND_RESET,
  LUA_COMMAND_SWIMWEAR_SCORE_AWARD,
  LUA_COMMAND_TOWER_ENTER,
  LUA_COMMAND_TOWER_FAIL,
  LUA_COMMAND_TOWER_GET,
  LUA_COMMAND_TOWER_PASS,
  TOWER_ITEM_TASKS,
  TOWER_LAYOUTS,
  effectiveTowerCost,
  eventTowerErrorReply,
  makeTowerTaskId,
  nextLevelRecord,
  parseEventTowerCall,
  pickPondSlot,
  reachedGoal,
  reportScore,
  rollTowerAwards,
} from "../src/game-data/event-tower-data.js";

const catalog = EventTowerCatalog.loadDefault();
const SERVED_IDS = [
  1, 2, 3, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 101, 102, 103,
  104, 105, 106, 107, 201, 303,
];

describe("event tower tables", () => {
  it("are byte copies of the setting.u tables recorded in provenance.json", () => {
    const directory = path.resolve("resources/tower");
    const provenance = JSON.parse(
      readFileSync(path.join(directory, "provenance.json"), "utf8"),
    ) as {
      sourceSettingSha256: string;
      files: Record<string, { source: string; sha256: string; bytes: number }>;
    };
    expect(provenance.sourceSettingSha256).toBe(
      "f0c6351ce9be11296c75c3b7cef1c3775080798219e0fb2b06c722647afe4ab2",
    );
    const names = Object.keys(provenance.files);
    expect(names).toContain("tower.txt");
    for (const layout of Object.values(TOWER_LAYOUTS))
      expect(names).toContain(layout.levelFile);
    for (const name of names) {
      const data = readFileSync(path.join(directory, name));
      expect(data.length, name).toBe(provenance.files[name]!.bytes);
      expect(createHash("sha256").update(data).digest("hex"), name).toBe(
        provenance.files[name]!.sha256,
      );
      expect(provenance.files[name]!.source).toBe(
        `setting.u:assets/_game/settinggen/activities/smalltower/${name}`,
      );
    }
  });

  it("serve the 20 classes: every Tower.txt id of them and no other", () => {
    expect([...catalog.towers.keys()].sort((a, b) => a - b)).toEqual(SERVED_IDS);
    expect(new Set([...catalog.towers.values()].map((t) => t.className))).toEqual(
      new Set(Object.keys(TOWER_LAYOUTS)),
    );
    // Animalize (4) and EighthTower (8) are card towers with their own catalog.
    for (const id of [4, 8]) expect(catalog.towers.has(id)).toBe(false);
  });

  it("give every served tower its levels", () => {
    for (const id of SERVED_IDS)
      expect(
        [...catalog.levels.values()].filter((l) => l.tower === id).length,
        `tower ${id}`,
      ).toBeGreaterThan(0);
    expect(catalog.levels.size).toBe(534 + 22);
  });

  it("keep every task key inside the 16 bits of a task id", () => {
    for (const level of catalog.levels.values()) {
      const tower = catalog.towers.get(level.tower)!;
      expect(catalog.levelKey(tower, level.levelId)).toBeLessThanOrEqual(0xffff);
      if (level.type === 3 && tower.layout.goalBase > 0) {
        const goals = catalog.goals.get(`${level.tower}:${level.levelId}`) ?? [];
        for (const goal of goals)
          expect(
            tower.layout.goalBase + level.levelId * 100 + goal.id,
            `${level.tower}:${level.levelId}`,
          ).toBeLessThanOrEqual(0xffff);
      }
    }
    expect(makeTowerTaskId(96, 1301)).toBe((96 << 16) | 1301);
  });

  it("share task slots between towers of one class, and the ninth and thirteenth", () => {
    // The task keys hold no tower id, so every tower of a class writes the same records.
    const owners = new Map<string, Set<number>>();
    const add = (group: number, key: number, tower: number): void => {
      const id = `${group}:${key}`;
      owners.set(id, (owners.get(id) ?? new Set<number>()).add(tower));
    };
    for (const level of catalog.levels.values()) {
      const tower = catalog.towers.get(level.tower)!;
      const { group, goalBase } = tower.layout;
      add(group, catalog.levelKey(tower, level.levelId), tower.id);
      if (level.type === 3 && goalBase > 0) {
        add(group, goalBase + level.levelId, tower.id);
        for (const goal of catalog.goals.get(`${tower.id}:${level.levelId}`) ?? [])
          add(group, goalBase + level.levelId * 100 + goal.id, tower.id);
      }
    }
    for (const tower of catalog.towers.values())
      if (tower.layout.scoreTask)
        add(tower.layout.group, tower.layout.scoreTask, tower.id);
    const shared = new Set<string>();
    for (const towers of owners.values())
      if (towers.size > 1) shared.add([...towers].sort((a, b) => a - b).join(","));
    expect([...shared].sort()).toEqual(
      [
        "1,201", // two SmallTower rows, one level table
        "9,13", // 0.1.3 thirteenth tower script = ninth tower slots
        "101,102,103,104,105,106,107,303", // the score task 2804 of every variegated tower
        "101,103,106,107,303",
        "101,107",
        "102,104,105",
        "102,105,106",
        "103,104,303",
      ].sort(),
    );
  });

  it("derive the pond wallet from Money1GDPL, not from a default", () => {
    const money = (tower: number) => catalog.tokens.get(`${tower}:1`)?.moneyId;
    // NodeTowerLogic checks eMoneyType_Lottery, Seventh and Eleventh their own currencies.
    expect([money(3), money(7), money(11), money(20)]).toEqual([14, 21, 44, 82]);
    expect(catalog.tokens.get("3:2")).toEqual({ times: 10, cost: 200, moneyId: 14 });
    expect(catalog.tokens.get("20:2")).toEqual({ times: 10, cost: 2000, moneyId: 82 });
  });

  it("read the node point rewards, pools and the last repeating pool", () => {
    for (const tower of [3, 7, 11]) {
      expect(catalog.pointRewards.get(tower)).toHaveLength(30);
      expect(catalog.pondSlots(tower, 1)!.some((slot) => slot.key)).toBe(true);
      // Pool 8 has Loop 0 (UI_Lottery then counts pond id + resets) and no key.
      expect(catalog.pondSlots(tower, 8)![0]!.loop).toBe(0);
      expect(catalog.pondSlots(tower, 8)!.some((slot) => slot.key)).toBe(false);
      expect(catalog.pondSlots(tower, 9)).toBeNull();
    }
    expect(catalog.pondSlots(20, 8)).not.toBeNull();
    expect(catalog.pointRewards.get(3)![0]).toEqual({
      id: 1,
      goal: 1000,
      rewards: [[15, 1, 1, 1, 3000]],
    });
  });

  it("read the swimwear score awards and the score the client divides by", () => {
    expect(catalog.scoreAwards.get(2)).toHaveLength(100);
    expect(catalog.serverAwards.get(2)!.map((a) => a.score)).toEqual([
      250, 500, 750, 1000,
    ]);
    expect(catalog.allServiceScore.get(2)).toBe(2_000_000_000);
    expect(catalog.allServiceScore.get(6)).toBe(200_000_000);
  });

  it("number variegated levels as area * 20 + position, with empty areas counted", () => {
    const tower = catalog.towers.get(101)!;
    // LevelArea2 = [1..8], LevelArea3 = [9..16]
    expect(catalog.levelKey(tower, 1)).toBe(2600 + 2 * 20 + 1);
    expect(catalog.levelKey(tower, 9)).toBe(2600 + 3 * 20 + 1);
    // 102 starts at area 4.
    expect(catalog.levelKey(catalog.towers.get(102)!, 21)).toBe(2600 + 4 * 20 + 1);
  });

  it("treat FixAward weights as chances out of 10000 and add first clear awards once", () => {
    const level = catalog.level(1, 2)!;
    expect(level.fixedAwards).toEqual([
      { award: [15, 6, 1, 1, 9], weight: 10000 },
      { award: [15, 7, 1, 1, 1], weight: 10000 },
    ]);
    const first = rollTowerAwards(level, true, "seed");
    expect(first).toEqual([
      [15, 2, 1, 1, 20, 0],
      [15, 6, 1, 1, 9, 100],
      [15, 7, 1, 1, 1, 100],
    ]);
    expect(rollTowerAwards(level, false, "seed")).toEqual(first.slice(1));
    // A weight of 0 never drops.
    const never = {
      ...level,
      fixedAwards: [{ award: [15, 6, 1, 1, 9] as never, weight: 0 }],
    };
    expect(rollTowerAwards(never, false, "seed")).toEqual([]);
  });

  it("charge half the vigour below commander level 35, rounded up", () => {
    expect(effectiveTowerCost(15, 34)).toBe(8);
    expect(effectiveTowerCost(15, 35)).toBe(15);
    expect(effectiveTowerCost(0, 1)).toBe(0);
  });
});

describe("event tower item rules", () => {
  const autoUse = AutoUseItemCatalog.loadDefault();

  it("name an AutoUse class and warzone for each score and exp item, as the Lua reads them", () => {
    const expected: Record<string, [string, number | null]> = {
      "15-17-1-1": ["ItemSwimwearScoreAuto", null],
      "15-18-1-1": ["ItemSwimwearGunExpAuto", null],
      "15-19-1-1": ["ItemSwimwearClothesExpAuto", null],
      "15-30-1-1": ["ItemAbsorbPeakScoreAuto", null],
      "15-31-1-1": ["ItemAbsorbPeakOneExpAuto", null],
      "15-32-1-1": ["ItemAbsorbPeakTwoExpAuto", null],
      "15-47-1-1": ["ItemTenTalentExpAuto", 1],
      "15-48-1-1": ["ItemTenTalentExpAuto", 2],
      "15-49-1-1": ["ItemTenTalentExpAuto", 3],
      "15-50-1-1": ["ItemTenTalentExpAuto", 4],
      "15-105-1-1": ["ItemFifteenthTowerExpAuto", 2],
      "15-106-1-1": ["ItemFifteenthTowerExpAuto", 1],
    };
    const table = readFileSync(path.resolve("resources/item/autouse.txt"), "utf8")
      .split(/\r?\n/)
      .slice(3)
      .map((line) => line.split("\t"));
    expect([...TOWER_ITEM_TASKS.keys()].sort()).toEqual(Object.keys(expected).sort());
    for (const [key, [className, warzone]] of Object.entries(expected)) {
      const row = table.find((cells) => cells.slice(0, 4).join("-") === key)!;
      expect(row[4], key).toBe(className);
      if (warzone !== null) expect(Number(row[6]), key).toBe(warzone);
    }
    // Tenth tower 2000 + 90 + warzone, fifteenth tower 3601 + 90 + warzone.
    expect(TOWER_ITEM_TASKS.get("15-49-1-1")).toEqual({ group: 64, key: 2093 });
    expect(TOWER_ITEM_TASKS.get("15-105-1-1")).toEqual({
      group: 64,
      key: 3601 + 90 + 2,
    });
    // Gun exp is ExpType 1 (offset + 104), clothes exp ExpType 2 (offset + 103).
    expect(TOWER_ITEM_TASKS.get("15-18-1-1")!.key).toBe(104);
    expect(TOWER_ITEM_TASKS.get("15-19-1-1")!.key).toBe(103);
  });

  it("leave only three wallet-less event items as plain stacks (known gap)", () => {
    const walletIds = new Set([1, 2, 4, 10, 11, 20]);
    const stacks = new Set<string>();
    const awards: number[][] = [];
    for (const level of catalog.levels.values()) {
      awards.push(...level.firstAwards, ...level.fixedAwards.map((f) => f.award));
      for (const rewards of catalog.goalRewards.values())
        for (const reward of rewards) awards.push(...reward.rewards);
    }
    for (const list of [...catalog.pointRewards.values()])
      for (const r of list) awards.push(...r.rewards);
    for (const list of [
      ...catalog.scoreAwards.values(),
      ...catalog.serverAwards.values(),
    ])
      for (const a of list) awards.push(...a.awards);
    for (const slots of catalog.ponds.values())
      for (const s of slots) awards.push(s.award);
    for (const award of awards) {
      if (award[0] !== 15 || walletIds.has(award[1]!)) continue;
      const effect = autoUse.effect(award[0]!, award[1]!, award[2]!, award[3]!);
      if (effect?.kind === "money") continue;
      if (TOWER_ITEM_TASKS.has(award.slice(0, 4).join("-"))) continue;
      stacks.add(award.slice(0, 4).join("-"));
    }
    expect([...stacks].sort()).toEqual(["15-121-1-1", "15-122-1-1", "15-126-1-1"]);
  });
});

describe("event tower request parsing", () => {
  const wrapped = (command: number, body: unknown) => ({
    sCmd: 252,
    tbParam: { sCmd: command, tbParam: body },
  });

  it("reads 53 for a served tower and leaves the ranking tower and other ids unhandled", () => {
    expect(parseEventTowerCall({ sCmd: 53, tbParam: [3, 4] })?.request).toEqual({
      command: LUA_COMMAND_TOWER_GET,
      towerId: 3,
    });
    // GetTower can send one element.
    expect(parseEventTowerCall({ sCmd: 53, tbParam: [1] })?.request.towerId).toBe(1);
    expect(parseEventTowerCall({ sCmd: 53, tbParam: [350, 6] })).toBeNull();
    expect(parseEventTowerCall({ sCmd: 53, tbParam: [5, 6] })).toBeNull();
    for (const id of [22, 999]) {
      expect(parseEventTowerCall({ sCmd: 53, tbParam: [id, 2] })).toBeNull();
      expect(parseEventTowerCall({ sCmd: 54, tbParam: [9, id, 0, 1, 1] })).toBeNull();
    }
    expect(parseEventTowerCall({ sCmd: 53, tbParam: {} })).toBeNull();
    expect(parseEventTowerCall(null)).toBeNull();
    expect(parseEventTowerCall({ sCmd: 76, tbParam: [3, 4] })).toBeNull();
  });

  it("reads 54 as sent by CallServer and 55 and 56 inside DoSettle", () => {
    const enter = parseEventTowerCall({ sCmd: 54, tbParam: [4, 3, 2, 5, 7] })!;
    expect(enter.settled).toBe(false);
    expect(enter.request).toMatchObject({
      command: LUA_COMMAND_TOWER_ENTER,
      activityType: 4,
      towerId: 3,
      node: 2,
      levelId: 5,
      formationId: 7,
    });
    // Argument 7 is a hole in the Lua array; the client's JSON encoder writes null there.
    const pass = parseEventTowerCall(
      wrapped(55, [4, 3, 2, 5, 7, { nScore: 321 }, 8, { x: 1 }, 0]),
    )!;
    expect(pass.settled).toBe(true);
    expect(pass.request).toMatchObject({
      command: LUA_COMMAND_TOWER_PASS,
      report: { nScore: 321 },
      stars: 8,
    });
    const hole = parseEventTowerCall(
      wrapped(55, [2, 1, 0, 5, 7, [true, null, false], null, [], 0]),
    )!;
    expect(hole.request).toMatchObject({
      command: 55,
      stars: 0,
      report: [true, null, false],
    });
    const fail = parseEventTowerCall(wrapped(56, [2, 1, 0, 2, 7]))!;
    expect(fail.request).toMatchObject({
      command: LUA_COMMAND_TOWER_FAIL,
      towerId: 1,
      levelId: 2,
    });
    // The same request in the other form is read too and answered in its own form.
    expect(
      parseEventTowerCall({ sCmd: 55, tbParam: [2, 1, 0, 2, 7, true] })?.settled,
    ).toBe(false);
  });

  it("reads a positional list that arrives as an object with numeric keys", () => {
    const call = parseEventTowerCall({
      sCmd: 54,
      tbParam: { "1": 2, "2": 1, "3": 0, "4": 3, "5": 9 },
    })!;
    expect(call.request).toMatchObject({ towerId: 1, levelId: 3, formationId: 9 });
  });

  it("never reads the ranking tower inside 54, 55 and 56", () => {
    for (const command of [54, 55, 56])
      expect(parseEventTowerCall(wrapped(command, [6, 1, 0, 1, 1]))).toBeNull();
  });

  it("reads the swimwear, point reward and pond requests by their field names", () => {
    expect(
      parseEventTowerCall({ sCmd: 62, tbParam: { nTowerId: 2, Index: 0 } })?.request,
    ).toEqual({
      command: LUA_COMMAND_SWIMWEAR_SCORE_AWARD,
      towerId: 2,
      index: 0,
    });
    expect(
      parseEventTowerCall({ sCmd: 176, tbParam: { activeId: 3, rewardIds: [1, 2] } })
        ?.request,
    ).toEqual({
      command: LUA_COMMAND_NODE_POINT_REWARD,
      towerId: 3,
      rewardIds: [1, 2],
    });
    expect(
      parseEventTowerCall({ sCmd: 176, tbParam: { activeId: 3 } })?.request,
    ).toEqual({
      command: LUA_COMMAND_NODE_POINT_REWARD,
      towerId: 3,
      rewardIds: null,
    });
    expect(
      parseEventTowerCall({ sCmd: 177, tbParam: { TowerId: 7, nType: 2, nPondId: 4 } })
        ?.request,
    ).toEqual({ command: LUA_COMMAND_POND_DRAW, towerId: 7, type: 2, pondId: 4 });
    expect(
      parseEventTowerCall({ sCmd: 178, tbParam: { TowerId: 11, nPondId: 8 } })?.request,
    ).toEqual({ command: LUA_COMMAND_POND_RESET, towerId: 11, pondId: 8 });
    expect(parseEventTowerCall({ sCmd: 177, tbParam: { TowerId: 4 } })).toBeNull();
  });

  it("answers every refusal in the shape of its client handler", () => {
    const reply = (cmd: number, extra: object = {}) =>
      eventTowerErrorReply(
        {
          command: cmd,
          towerId: 3,
          activityType: 4,
          node: 0,
          levelId: 1,
          formationId: 1,
          report: null,
          stars: 0,
          index: 0,
          rewardIds: null,
          type: 1,
          pondId: 1,
          ...extra,
        } as never,
        5,
      );
    expect(reply(54)).toEqual({ nError: 5 });
    expect(reply(55)).toEqual({ nError: 5 });
    expect(reply(56)).toEqual({});
    expect(reply(61)).toEqual({ nTowerId: 3, Score: 0 });
    expect(reply(62)).toEqual({ nTowerId: 3, nError: 5 });
    expect(reply(176)).toEqual({ res: false });
    expect(reply(177)).toEqual({ nTowerId: 3, nError: 5 });
    expect(reply(178)).toEqual({ nTowerId: 3, nError: 5 });
  });
});

describe("event tower records", () => {
  it("writes the record each class reads", () => {
    expect(nextLevelRecord("score", 0, 0, 0)).toBe(1);
    expect(nextLevelRecord("score", 500, 300, 0)).toBe(500);
    expect(nextLevelRecord("score", 500, 900, 0)).toBe(900);
    expect(nextLevelRecord("passCount", 2, 0, 0)).toBe(3);
    expect(nextLevelRecord("stars", 0, 0, 0)).toBe(1);
    expect(nextLevelRecord("stars", 1, 0, 8)).toBe(8);
    expect(nextLevelRecord("stars", 8, 0, 4)).toBe(8);
  });

  it("reads the score and the goal flags the client sends", () => {
    expect(reportScore({ nScore: 120.7, nDamage: 5 })).toBe(120);
    expect(reportScore(true)).toBe(0);
    expect(reportScore([1])).toBe(0);
    expect(reportScore({ nScore: -4 })).toBe(0);
    expect(reachedGoal([true, false, null, true], 1)).toBe(true);
    expect(reachedGoal([true, false, null, true], 3)).toBe(false);
    expect(reachedGoal([true, false, null, true], 4)).toBe(true);
    expect(reachedGoal({ "2": true }, 2)).toBe(true);
    expect(reachedGoal(true, 1)).toBe(false);
  });

  it("draws pond slots by weight and skips slots with nothing left", () => {
    const slots = [
      { award: [1, 1, 1, 1, 1], key: false, weight: 10, count: 1, loop: 1 },
      { award: [1, 1, 1, 2, 1], key: false, weight: 30, count: 2, loop: 1 },
    ] as never;
    expect(pickPondSlot(slots, [0, 0], () => 5)).toBe(0);
    expect(pickPondSlot(slots, [0, 0], () => 10)).toBe(1);
    expect(pickPondSlot(slots, [1, 0], () => 0)).toBe(1);
    expect(pickPondSlot(slots, [1, 2], () => 0)).toBe(-1);
  });
});

/**
 * The layouts are copied from the 0.1.3 client scripts. Run with
 * GCG_CLIENT_LUA_DIR=<folder with the decrypted *.lua.txt> to compare them.
 */
const luaDirectory = process.env.GCG_CLIENT_LUA_DIR ?? "";
describe.skipIf(!luaDirectory || !existsSync(luaDirectory))(
  "event tower layouts against the client Lua",
  () => {
    const LOGIC: Record<string, string> = {
      SmallTower: "smalltowerlogic",
      ChessTower: "chesstowerlogic",
      NinthTower: "ninthtowerlogic",
      TwelfthTower: "twelfthtowerlogic",
      ThirteenthTower: "thirteenthtowerlogic",
      FourteenthTower: "fourteenthtowerlogic",
      SeventeenthTower: "seventeenthtowerlogic",
      EighteenthTower: "eighteenthtowerlogic",
      NineteenthTower: "nineteenthtowerlogic",
      TwentiethTower: "twentiethtowerlogic",
      TwentyFirstTower: "twentyfirsttowerlogic",
      TenthTower: "tenthtowerlogic",
      FifteenthTower: "fifteenthtowerlogic",
      SixteenthTower: "sixteenthtowerlogic",
      Swimwear: "swimwearlogic",
      AbsorbPeak: "absorbpeaklogic",
      VariegatedTower: "variegatedtowerlogic",
      NodeTower: "nodetowerlogic",
      SeventhTower: "seventhtowerlogic",
      EleventhTower: "eleventhtowerlogic",
    };

    function constants(source: string) {
      const first = (pattern: RegExp): number | null => {
        const match = source.match(pattern);
        return match ? Number(match[1]) : null;
      };
      const offset = first(/(?:local nTaskOffset|tbLogic\.nTaskOffset)\s*=\s*(\d+)/);
      const evaluate = (expression: string): number =>
        expression
          .split("+")
          .map((part) => part.trim())
          .reduce(
            (total, part) =>
              total + (/^\d+$/.test(part) ? Number(part) : (offset ?? Number.NaN)),
            0,
          );
      const assignment = (name: string): number | null => {
        const match = source.match(new RegExp(`${name}\\s*=\\s*([^\\n;-]+)`));
        return match ? evaluate(match[1]!) : null;
      };
      const levelBase =
        assignment("nTaskSTLevel") ??
        assignment("nTaskLevelPass") ??
        assignment("nTaskSTPassCount") ??
        assignment("nSwimwearLevel") ??
        assignment("nV_TaskIdLevel") ??
        assignment("nTaskNTLevel");
      return {
        offset,
        group:
          first(/\bnTaskGroup\w*\s*=\s*(\d+)/) ??
          first(/\bnGroupVariegated\s*=\s*(\d+)/),
        goalBase:
          first(/nTask(?:SmallTower|NodeTower|SwimwearTower)GoalBase\s*=\s*(\d+)/) ?? 0,
        levelBase,
        scoreTask: assignment("nSwimwearTaskIdScore") ?? assignment("nV_TaskIdScore"),
      };
    }

    for (const [className, file] of Object.entries(LOGIC)) {
      it(`${className} matches ${file}`, () => {
        const lua = readFileSync(path.join(luaDirectory, `${file}.lua.txt`), "utf8");
        const found = constants(lua);
        const layout = TOWER_LAYOUTS[className]!;
        expect(layout.group, "group").toBe(found.group);
        expect(layout.levelBase, "level base").toBe(found.levelBase);
        expect(layout.goalBase, "goal base").toBe(found.goalBase);
        if (layout.offset) expect(layout.offset, "offset").toBe(found.offset);
        if (layout.scoreTask)
          expect(layout.scoreTask, "score task").toBe(found.scoreTask);
        // Level records use the task the class reads: a clear count or a score.
        const reads =
          /GetLevelPassCount|IsLevelPass|nTaskLevelPass|nSwimwearLevel|nTaskSTPassCount|nV_TaskIdLevel/.test(
            lua,
          );
        if (layout.progress === "passCount")
          expect(reads, "pass count class").toBe(true);
      });
    }

    it("shows that the 0.1.3 thirteenth tower shares the ninth tower's slots", () => {
      const ninth = TOWER_LAYOUTS.NinthTower!;
      const thirteenth = TOWER_LAYOUTS.ThirteenthTower!;
      expect([thirteenth.group, thirteenth.levelBase, thirteenth.goalBase]).toEqual([
        ninth.group,
        ninth.levelBase,
        ninth.goalBase,
      ]);
    });
  },
);
