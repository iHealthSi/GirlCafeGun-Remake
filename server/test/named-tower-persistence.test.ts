import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  EventTowerCatalog,
  makeTowerTaskId,
  parseEventTowerCall,
} from "../src/game-data/event-tower-data.js";
import {
  parseNamedTowerCall,
  type NamedTowerRequest,
} from "../src/game-data/named-tower-data.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  makeInitialState,
  PlayerRepository,
  type Player,
} from "../src/persistence/player-repository.js";
import { mkdtemp } from "./helpers/temp.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};

const account = "tester";
const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function fixture(
  options: { vigour?: number; money?: Record<number, number> } = {},
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-named-tower-"));
  directories.push(directory);
  const store = new JsonStore({
    filePath: path.join(directory, "state.json"),
    initialState: makeInitialState(),
    logger,
  });
  await store.initialize();
  const repository = new PlayerRepository({
    store,
    defaults: {
      name: "Tester",
      level: 1,
      exp: 0,
      fightPower: 0,
      serverZone: 8,
      firstLevelComplete: false,
    },
    logger,
  });
  await repository.getOrCreate(account);
  await store.update((state) => {
    const player = state.players[account]!;
    player.level = 40;
    player.exp = 0;
    player.money = [
      { id: 1, count: options.vigour ?? 100 },
      ...Object.entries(options.money ?? {}).map(([id, count]) => ({
        id: Number(id),
        count,
      })),
    ];
    player.inventory = [
      {
        guid: 11,
        genre: 1,
        detail: 1,
        particular: 1,
        templateLevel: 1,
        count: 1,
        createTime: 1,
        enhanceLevel: 1,
        enhanceExp: 0,
        breakLevel: 0,
        lockOn: 0,
      },
    ];
    player.nextItemGuid = 1_000;
    player.formations = [
      {
        id: 1,
        title: "one",
        fightCards: [
          {
            mainCardGuid: 11,
            secondaryCardGuids: [],
            usedCardGuid: 0,
            weaponGuid: 0,
            runeItemGuids: [],
          },
        ],
      },
    ];
    player.taskValues = {};
  });
  return { store, repository };
}

function named(command: number, body: unknown, settled = false): NamedTowerRequest {
  const call = parseNamedTowerCall(
    settled
      ? { sCmd: 252, tbParam: { sCmd: command, tbParam: body } }
      : { sCmd: command, tbParam: body },
  );
  if (!call) throw new Error(`Not a named tower request: ${command}`);
  return call.request;
}

function task(player: Player, group: number, key: number): number {
  return player.taskValues[String(makeTowerTaskId(group, key))] ?? 0;
}
function money(player: Player, id: number): number {
  return player.money.find((entry) => entry.id === id)?.count ?? 0;
}
function current(repository: PlayerRepository): Player {
  return repository.get(account)!;
}
const snapshot = (repository: PlayerRepository): string =>
  JSON.stringify(current(repository));

type Reply = Record<string, unknown>;
const body = (result: { response: unknown }): Reply => result.response as Reply;
/** The tbData rows by their item and count; the sixth value is the roll's weight. */
const five = (rows: unknown): number[][] =>
  (rows as number[][]).map((row) => row.slice(0, 5));

// ---- families

const microEnter = (level: number, diff = 1, formation = 1) =>
  named(286, { nTowerId: 1, nLevelId: level, nDiff: diff, nFormationId: formation });
const microPass = (level: number, diff = 1, goals: unknown = {}) =>
  named(
    287,
    {
      nTowerId: 1,
      nLevelId: level,
      nDiff: diff,
      nFormationId: 1,
      nUseTime: 30,
      tbGoals: goals,
    },
    true,
  );
const secondEnter = (tower: number, level: number) =>
  named(529, { nType: 27, nId: tower, nLevelId: level, nFormationId: 1 });
const secondPass = (tower: number, level: number) =>
  named(530, { nType: 27, nId: tower, nLevelId: level, nFormationId: 1 }, true);

describe("micro tower", () => {
  it("echoes the entry, refuses a bad level or formation and leaves the save alone", async () => {
    const { repository } = await fixture();
    const before = snapshot(repository);
    const unknown = await repository.handleNamedTowerRequest(account, microEnter(99));
    expect(unknown.rejected?.code).toBe(2);
    expect(unknown.response).toEqual({ nError: 2 });
    const formation = await repository.handleNamedTowerRequest(
      account,
      microEnter(1, 1, 99),
    );
    expect(formation.response).toEqual({ nError: 10 });
    expect(snapshot(repository)).toBe(before);

    const entered = await repository.handleNamedTowerRequest(account, microEnter(2, 3));
    expect(entered.response).toEqual({
      tbData: { nTowerId: 1, nLevelId: 2, nDiff: 3 },
      tbDrop: [],
      tbDropItems: [],
    });
    expect(current(repository).namedTower?.run).toMatchObject({
      family: "micro",
      level: 2,
      diff: 3,
      active: true,
    });
  });

  it("counts the clear, pays each goal once and replays a resent settlement", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(account, microEnter(1));
    const passed = await repository.handleNamedTowerRequest(
      account,
      microPass(1, 1, { 1: true, 2: true, 5: false }),
    );
    const reply = body(passed);
    expect(reply.newGoalIds).toEqual([1, 2]);
    // Micro reads tbAwards, the others tbData: both are arrays of awards.
    expect(reply.tbAwards).toEqual(reply.tbData);
    expect(five(reply.tbData)).toContainEqual([15, 1, 1, 1, 2000]);
    expect(reply.isPass).toBe(true);
    const player = current(repository);
    // 59/100 + level * 5 + diff: clears; 200 +: score (10 per goal); 300 +: goal bits.
    expect(task(player, 59, 106)).toBe(1);
    expect(task(player, 59, 206)).toBe(20);
    expect(task(player, 59, 306)).toBe(0b110);
    expect(money(player, 2)).toBe(2000);

    const resent = await repository.handleNamedTowerRequest(
      account,
      microPass(1, 1, { 1: true, 2: true }),
    );
    expect(resent.response).toEqual(passed.response);
    expect(money(current(repository), 2)).toBe(2000);

    // A second run: goal 2 is paid already, goal 3 is new; the clear counter goes to 2.
    await repository.handleNamedTowerRequest(account, microEnter(1));
    const again = await repository.handleNamedTowerRequest(
      account,
      microPass(1, 1, [true, true, true]),
    );
    expect(body(again).newGoalIds).toEqual([3]);
    expect(task(current(repository), 59, 106)).toBe(2);
    expect(task(current(repository), 59, 206)).toBe(30);
    expect(task(current(repository), 59, 306)).toBe(0b1110);
  });

  it("answers the echo of 285 and keeps its run apart from a Tower.txt run", async () => {
    const { repository } = await fixture();
    const echo = await repository.handleNamedTowerRequest(
      account,
      named(285, { nTowerId: 1 }),
    );
    expect(echo.response).toEqual({ nTowerId: 1 });

    // An open run of the swimwear tower (Tower.txt id 2) ...
    const towerCall = (command: number, args: unknown[]) => {
      const call = parseEventTowerCall({ sCmd: command, tbParam: args });
      if (!call) throw new Error("not a tower call");
      return call.request;
    };
    expect(EventTowerCatalog.loadDefault().towers.has(2)).toBe(true);
    await repository.handleEventTowerRequest(account, towerCall(54, [2, 1, 0, 2, 1]));
    // ... is not touched by the micro tower, and a micro settlement never matches it.
    await repository.handleNamedTowerRequest(account, microEnter(1));
    await repository.handleNamedTowerRequest(account, microPass(1));
    expect(current(repository).eventTower?.run).toMatchObject({
      tower: 1,
      level: 2,
      active: true,
    });
    expect(current(repository).namedTower?.run).toMatchObject({
      family: "micro",
      active: false,
    });
    // A buff tower run on "tower 1, level 1" is not the micro run either.
    const wrong = await repository.handleNamedTowerRequest(
      account,
      named(
        378,
        { nType: 20, nId: 1, nLevelId: 1, nDiff: 1, nFormationId: 1, tbBuffs: [] },
        true,
      ),
    );
    expect(wrong.rejected?.code).toBe(2);
  });
});

describe("second anniversary tower", () => {
  it("charges vigour at the pass, sets one bit per event in the shared record and pays once", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(account, secondEnter(1, 2));
    expect(money(current(repository), 1)).toBe(100);
    const first = await repository.handleNamedTowerRequest(account, secondPass(1, 2));
    expect(first.rejected).toBeNull();
    expect(five(body(first).tbData)).toContainEqual([15, 1, 1, 1, 5000]);
    expect(money(current(repository), 1)).toBe(90);
    expect(task(current(repository), 81, 30012)).toBe(0b01);
    // Event 2 uses bit 1 of the same task.
    await repository.handleNamedTowerRequest(account, secondEnter(2, 2));
    await repository.handleNamedTowerRequest(account, secondPass(2, 2));
    expect(task(current(repository), 81, 30012)).toBe(0b11);
    // A resend replays and pays nothing.
    const gold = money(current(repository), 2);
    const resent = await repository.handleNamedTowerRequest(account, secondPass(2, 2));
    expect(resent.rejected).toBeNull();
    expect(money(current(repository), 2)).toBe(gold);
    // The second clear of event 1 is no first clear: no first award.
    await repository.handleNamedTowerRequest(account, secondEnter(1, 2));
    const repeat = await repository.handleNamedTowerRequest(account, secondPass(1, 2));
    expect(five(body(repeat).tbData)).not.toContainEqual([15, 1, 1, 1, 5000]);
  });

  it("charges what the client computes below commander level 35: half, rounded up", async () => {
    const { repository, store } = await fixture();
    await store.update((state) => {
      state.players[account]!.level = 20;
    });
    // Level 2 costs 10: 5 at level 20 (the cost the panel shows).
    await repository.handleNamedTowerRequest(account, secondEnter(1, 2));
    await repository.handleNamedTowerRequest(account, secondPass(1, 2));
    expect(money(current(repository), 1)).toBe(95);
    await store.update((state) => {
      state.players[account]!.money = [{ id: 1, count: 4 }];
    });
    expect(
      (await repository.handleNamedTowerRequest(account, secondEnter(1, 5))).response,
    ).toEqual({ nError: 5 });
  });

  it("is all or nothing: a pass without the vigour changes nothing", async () => {
    const { repository, store } = await fixture();
    await repository.handleNamedTowerRequest(account, secondEnter(1, 2));
    await store.update((state) => {
      state.players[account]!.money = [{ id: 1, count: 3 }];
    });
    const before = snapshot(repository);
    const refused = await repository.handleNamedTowerRequest(account, secondPass(1, 2));
    expect(refused.rejected?.code).toBe(5);
    expect(refused.response).toEqual({ nError: 5 });
    expect(snapshot(repository)).toBe(before);
  });

  it("refuses an entry without vigour or formation, and a pass without an entry", async () => {
    const { repository } = await fixture({ vigour: 4 });
    const poor = await repository.handleNamedTowerRequest(account, secondEnter(1, 2));
    expect(poor.response).toEqual({ nError: 5 });
    const lost = await repository.handleNamedTowerRequest(account, secondPass(1, 2));
    expect(lost.response).toEqual({ nError: 2 });
    // Story levels need neither vigour nor formation.
    const story = await repository.handleNamedTowerRequest(
      account,
      named(529, { nType: 27, nId: 1, nLevelId: 1, nFormationId: 0 }),
    );
    expect(story.rejected).toBeNull();
    const done = await repository.handleNamedTowerRequest(account, secondPass(1, 1));
    expect(done.rejected).toBeNull();
    expect(five(body(done).tbData)).toEqual([[15, 2, 1, 1, 20]]);
    expect(money(current(repository), 3)).toBe(20);
  });

  it("answers Fail without charging twice, and a late pass is refused", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(account, secondEnter(1, 2));
    const fail = named(531, { nType: 27, nId: 1, nLevelId: 2, nFormationId: 1 }, true);
    const lost = await repository.handleNamedTowerRequest(account, fail);
    expect(lost.response).toEqual({});
    expect(money(current(repository), 1)).toBe(90);
    await repository.handleNamedTowerRequest(account, fail);
    expect(money(current(repository), 1)).toBe(90);
    const late = await repository.handleNamedTowerRequest(account, secondPass(1, 2));
    expect(late.response).toEqual({ nError: 2 });
    // A Fail with nothing open still answers.
    const none = await repository.handleNamedTowerRequest(
      account,
      named(531, { nType: 27, nId: 1, nLevelId: 5 }, true),
    );
    expect(none.response).toEqual({});
  });

  it("takes the fixed-team level (type 4) like any fight", async () => {
    const { repository } = await fixture();
    const noTeam = await repository.handleNamedTowerRequest(
      account,
      named(529, { nType: 27, nId: 1, nLevelId: 3, nFormationId: 0 }),
    );
    expect(noTeam.response).toEqual({ nError: 10 });
    const entered = await repository.handleNamedTowerRequest(
      account,
      secondEnter(1, 3),
    );
    expect(entered.response).toMatchObject({
      tbData: { nType: 27, nId: 1, nLevelId: 3 },
    });
    const passed = await repository.handleNamedTowerRequest(account, secondPass(1, 3));
    expect(five(body(passed).tbData)).toContainEqual([10, 1, 1, 2, 2]);
  });

  it("answers the barrage poll with an empty list", async () => {
    const { repository } = await fixture();
    const barrage = await repository.handleNamedTowerRequest(account, named(528, {}));
    expect(barrage.response).toEqual([]);
  });
});

describe("buff tower", () => {
  const enter = (level: number, diff: number, buffs: number[] = []) =>
    named(377, {
      nType: 20,
      nId: 1,
      nLevelId: level,
      nDiff: diff,
      nFormationId: 1,
      tbBuffs: buffs,
    });
  const pass = (level: number, diff: number, buffs: number[]) =>
    named(
      378,
      {
        nType: 20,
        nId: 1,
        nLevelId: level,
        nDiff: diff,
        nFormationId: 1,
        tbBuffs: buffs,
      },
      true,
    );

  it("scores a clear by the chosen buffs, keeps the best and the total", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(account, enter(1, 1, [1, 3]));
    const passed = await repository.handleNamedTowerRequest(
      account,
      pass(1, 1, [1, 3]),
    );
    expect(body(passed).tbData).toEqual([]);
    expect(body(passed).newGoalIds).toEqual([]);
    let player = current(repository);
    // 64/5100 + level: bit per difficulty; 5200 + (level - 1) * 6 + diff: score; 5008: total.
    expect(task(player, 64, 5101)).toBe(0b1);
    expect(task(player, 64, 5201)).toBe(30);
    expect(task(player, 64, 5008)).toBe(30);
    // A lower score does not replace the best; a higher one raises the total by the difference.
    await repository.handleNamedTowerRequest(account, enter(1, 1));
    await repository.handleNamedTowerRequest(account, pass(1, 1, [1]));
    expect(task(current(repository), 64, 5201)).toBe(30);
    await repository.handleNamedTowerRequest(account, enter(1, 2));
    await repository.handleNamedTowerRequest(account, pass(1, 2, []));
    player = current(repository);
    expect(task(player, 64, 5101)).toBe(0b11);
    expect(task(player, 64, 5008)).toBe(30);
  });

  it("answers Fail without an event id from the open run", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(account, enter(1, 1));
    const failed = await repository.handleNamedTowerRequest(
      account,
      named(379, { nType: 20, nLevelId: 1, nDiff: 1, nFormationId: 1 }, true),
    );
    expect(failed.response).toEqual({});
    expect(current(repository).namedTower?.run).toMatchObject({
      active: false,
      resultCmd: 379,
    });
  });

  it("pays the score awards in order, once", async () => {
    const { repository, store } = await fixture();
    const claim = () =>
      repository.handleNamedTowerRequest(account, named(376, { nId: 1 }));
    expect((await claim()).response).toEqual({ nError: 13 });
    await store.update((state) => {
      state.players[account]!.taskValues[String(makeTowerTaskId(64, 5008))] = 35;
    });
    const paid = await claim();
    // Thresholds 10 and 30 are reached; the got-score task records the highest paid.
    expect(paid.rejected).toBeNull();
    expect((body(paid).tbAward as number[][]).length).toBeGreaterThanOrEqual(2);
    expect(task(current(repository), 64, 5009)).toBe(30);
    expect((await claim()).response).toEqual({ nError: 8 });
    expect(
      (await repository.handleNamedTowerRequest(account, named(376, { nId: 99 })))
        .response,
    ).toEqual({
      nError: 2,
    });
  });
});

describe("boss challenge", () => {
  const enter = (level: number, diff: number) =>
    named(532, { nId: 1, nLevelId: level, nDiff: diff, nFormationId: 1 });
  const pass = (level: number, diff: number, extra: Record<string, unknown>) =>
    named(
      533,
      { nType: 28, nId: 1, nLevelId: level, nDiff: diff, nFormationId: 1, ...extra },
      true,
    );

  it("answers the result tuple, records the best score and pays score awards once", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(account, enter(1, 1));
    const first = await repository.handleNamedTowerRequest(
      account,
      pass(1, 1, { useTime: 42, leftHpRate: 0.5 }),
    );
    // [INFER] half of MaxScore (3000) for the clear, the rest by the health left.
    expect(body(first).tbRet).toEqual([42, 0.5, 2250, true]);
    expect(Array.isArray(body(first).tbData)).toBe(true);
    expect(task(current(repository), 81, 30151)).toBe(2250);
    expect(task(current(repository), 81, 30111)).toBe(1);

    await repository.handleNamedTowerRequest(account, enter(1, 1));
    const worse = await repository.handleNamedTowerRequest(
      account,
      pass(1, 1, { useTime: 50, leftHpRate: 0 }),
    );
    expect(body(worse).tbRet).toEqual([50, 0, 1500, false]);
    expect(task(current(repository), 81, 30151)).toBe(2250);

    // Total 2250: the awards at 500, 1000, 1500 and 2000 are due.
    const claimed = await repository.handleNamedTowerRequest(
      account,
      named(535, { nId: 1 }),
    );
    expect((body(claimed).tbAward as number[][]).length).toBe(4);
    expect(task(current(repository), 81, 30104)).toBe(2000);
    const again = await repository.handleNamedTowerRequest(
      account,
      named(535, { nId: 1 }),
    );
    expect(again.response).toEqual({ nError: 8 });
  });

  it("closes a Fail that has no event id", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(account, enter(2, 3));
    const failed = await repository.handleNamedTowerRequest(
      account,
      named(534, { nType: 28, nLevelId: 2, nDiff: 3, nFormationId: 1 }, true),
    );
    expect(failed.response).toEqual({});
    expect(current(repository).namedTower?.run?.resultCmd).toBe(534);
  });
});

describe("armed survey", () => {
  const enter = (tower: number, level: number) =>
    named(336, { nType: 17, nId: tower, nLevelId: level, nFormationId: 1 });
  const pass = (tower: number, level: number, kills: number[] = []) =>
    named(
      337,
      {
        nType: 17,
        nId: tower,
        nLevelId: level,
        nFormationId: 1,
        nUseTime: 60,
        tbKillMonster: { tbKillMonster: kills },
        nAssistId: 0,
      },
      true,
    );

  it("plays the story level without a formation and clears it in the shared record", async () => {
    const { repository } = await fixture();
    const echo = await repository.handleNamedTowerRequest(
      account,
      named(335, { nId: 1 }),
    );
    expect(echo.response).toEqual({ nId: 1 });
    const entered = await repository.handleNamedTowerRequest(
      account,
      named(336, { nType: 17, nId: 1, nLevelId: 1, nFormationId: 0 }),
    );
    expect(entered.response).toEqual({
      tbData: { nType: 17, nId: 1, nLevelId: 1 },
      tbDrop: [],
      tbDropItems: [],
    });
    const passed = await repository.handleNamedTowerRequest(account, pass(1, 1));
    expect(five(body(passed).tbData)).toEqual([[15, 2, 1, 1, 20]]);
    // 68/10 + level is the clear record the client reads, shared by every event.
    expect(task(current(repository), 68, 11)).toBe(1);
    // A stage with a cost and a currency fixed award (event 1 pays money 35).
    await repository.handleNamedTowerRequest(account, enter(1, 2));
    await repository.handleNamedTowerRequest(account, pass(1, 2));
    expect(money(current(repository), 35)).toBe(14);
    expect(money(current(repository), 1)).toBe(88);
    expect(task(current(repository), 68, 12)).toBe(1);
  });

  it("counts the SP kills at the pass and pays them once when 339 saves", async () => {
    const { repository } = await fixture({ money: { 51: 100 } });
    // SP level 5 of event 4 costs 60 of money 51 (error 17 when short).
    const short = await fixture({ money: { 51: 10 } });
    const refused = await short.repository.handleNamedTowerRequest(
      account,
      enter(4, 5),
    );
    expect(refused.response).toEqual({ nError: 17 });

    await repository.handleNamedTowerRequest(account, enter(4, 5));
    const kills = new Array<number>(20).fill(0);
    kills[7] = 30;
    const passed = await repository.handleNamedTowerRequest(account, pass(4, 5, kills));
    expect(body(passed).spKillNum).toBe(30);
    expect(typeof body(passed).curScore).toBe("number");
    expect(money(current(repository), 51)).toBe(40);

    // Saving pays 10 x kills; the second save pays nothing; the damage record keeps the best.
    const saved = await repository.handleNamedTowerRequest(
      account,
      named(339, { bSave: true, maxDamage: 1234 }),
    );
    expect(body(saved).tbAward).toEqual([[15, 78, 1, 1, 300]]);
    expect(money(current(repository), 50)).toBe(300);
    expect(task(current(repository), 68, 5)).toBe(1234);
    const twice = await repository.handleNamedTowerRequest(
      account,
      named(339, { bSave: true, maxDamage: 9999 }),
    );
    expect(body(twice).tbAward).toEqual([]);
    expect(money(current(repository), 50)).toBe(300);
    expect(task(current(repository), 68, 5)).toBe(1234);
  });

  it("pays nothing when the player gives the SP result up, and caps the counted kills", async () => {
    const { repository } = await fixture({ money: { 51: 200 } });
    await repository.handleNamedTowerRequest(account, enter(4, 5));
    const kills = new Array<number>(20).fill(0);
    kills[7] = 400;
    await repository.handleNamedTowerRequest(account, pass(4, 5, kills));
    const dropped = await repository.handleNamedTowerRequest(
      account,
      named(339, { bSave: false }),
    );
    expect(body(dropped).tbAward).toEqual([]);
    expect(money(current(repository), 50)).toBe(0);
    // Nothing to save any more; with no open SP result 339 still answers.
    const nothing = await repository.handleNamedTowerRequest(
      account,
      named(339, { bSave: true, maxDamage: 5 }),
    );
    expect(nothing.response).toEqual({ tbAward: [] });
    // The cap is 150 kills: a new run pays 1500.
    await repository.handleNamedTowerRequest(account, enter(4, 5));
    await repository.handleNamedTowerRequest(account, pass(4, 5, kills));
    const capped = await repository.handleNamedTowerRequest(
      account,
      named(339, { bSave: true, maxDamage: 1 }),
    );
    expect(body(capped).tbAward).toEqual([[15, 78, 1, 1, 1500]]);
  });

  it("answers 260, 261 and the online lobby calls this event does not use", async () => {
    const { repository } = await fixture();
    expect(
      (await repository.handleNamedTowerRequest(account, named(261, { id: 1 })))
        .response,
    ).toEqual([]);
    // 260 names a node of the mixed event; with no such cartoon node it answers an empty list.
    expect(
      (await repository.handleNamedTowerRequest(account, named(260, { idx: 99 })))
        .response,
    ).toEqual([]);
  });
});

describe("mixed online", () => {
  const enter = (node: number) =>
    named(451, { nType: 24, nodeId: node, formationId: 1 });
  const pass = (node: number) =>
    named(
      452,
      { nType: 24, nodeId: node, nFormationId: 1, nUseTime: 5, tbKillMonster: {} },
      true,
    );

  it("plays a cartoon node, then a level node, and marks the bits in 68/1002", async () => {
    const { repository } = await fixture();
    const entered = await repository.handleNamedTowerRequest(account, enter(1));
    expect(entered.response).toEqual({
      tbData: { nodeId: 1 },
      tbDrop: [],
      tbDropItems: [],
    });
    const story = await repository.handleNamedTowerRequest(account, pass(1));
    expect(five(body(story).tbData)).toEqual([[15, 2, 1, 1, 20]]);
    expect(task(current(repository), 68, 1002)).toBe(0b10);
    await repository.handleNamedTowerRequest(account, enter(2));
    const level = await repository.handleNamedTowerRequest(account, pass(2));
    expect(five(body(level).tbData)).toContainEqual([15, 92, 1, 1, 40]);
    expect(task(current(repository), 68, 1002)).toBe(0b110);
    expect(money(current(repository), 92)).toBe(40);
    expect(money(current(repository), 1)).toBe(90);
    // The online TSP node of the Christmas event has no level here.
    expect(
      (await repository.handleNamedTowerRequest(account, enter(8))).response,
    ).toEqual({ nError: 2 });
    // Fail sends nEquipId and no node; it closes the open run.
    await repository.handleNamedTowerRequest(account, enter(3));
    const failed = await repository.handleNamedTowerRequest(
      account,
      named(453, { nType: 24, nodeId: 3, nEquipId: 1 }, true),
    );
    expect(failed.response).toEqual({});
  });

  it("takes the event from task 68/1001 and finds the node tables of the second one", async () => {
    const { repository, store } = await fixture();
    await store.update((state) => {
      state.players[account]!.taskValues[String(makeTowerTaskId(68, 1001))] = 2;
    });
    await repository.handleNamedTowerRequest(account, enter(2));
    const passed = await repository.handleNamedTowerRequest(account, pass(2));
    // 3P9C node 2 is level 1 of MixOnlineLevel Id 2: its currency is money 66.
    expect(five(body(passed).tbData)).toContainEqual([15, 98, 1, 1, 60]);
    expect(money(current(repository), 66)).toBe(60);
  });

  it("pays a cartoon node played in the event screen (260) once", async () => {
    const { repository } = await fixture();
    const paid = await repository.handleNamedTowerRequest(
      account,
      named(260, { idx: 5 }),
    );
    expect(paid.response).toEqual([[15, 2, 1, 1, 20]]);
    expect(money(current(repository), 3)).toBe(20);
    expect(task(current(repository), 68, 1002)).toBe(0b100000);
    const again = await repository.handleNamedTowerRequest(
      account,
      named(260, { idx: 5 }),
    );
    expect(again.response).toEqual([]);
    expect(money(current(repository), 3)).toBe(20);
    // A level node is not a cartoon.
    expect(
      (await repository.handleNamedTowerRequest(account, named(260, { idx: 2 })))
        .response,
    ).toEqual([]);
  });

  it("keeps the barrage messages, polls them and ignores a text that does not exist", async () => {
    const { repository } = await fixture();
    const empty = await repository.handleNamedTowerRequest(account, named(455, {}));
    expect(empty.response).toEqual([]);
    const sent = await repository.handleNamedTowerRequest(
      account,
      named(455, { nType: 1, tbBarrage: [1, 2, 3, 50] }),
    );
    expect(sent.response).toEqual([
      {
        roleid: current(repository).roleId,
        rolename: "Tester",
        content: [1, 2, 3, 50],
      },
    ]);
    const bad = await repository.handleNamedTowerRequest(
      account,
      named(455, { nType: 1, tbBarrage: [1, 2, 3, 51] }),
    );
    expect((bad.response as unknown[]).length).toBe(1);
    expect(
      (await repository.handleNamedTowerRequest(account, named(454, {}))).response,
    ).toEqual({ spCount: 0 });
  });
});

describe("linkage", () => {
  const enter = (level: number, formation = 1) =>
    named(401, { nLevelId: level, nDiff: 1, nFormationId: formation });
  const pass = (level: number) =>
    named(
      402,
      { nLevelId: level, nDiff: 1, nFormationId: 1, nScore: 9, tbKillMonster: {} },
      true,
    );

  it("seeds the event id and the mixed event id at login, once", async () => {
    const { repository, store } = await fixture();
    await repository.getOrCreate(account);
    expect(task(current(repository), 63, 3001)).toBe(1);
    expect(task(current(repository), 68, 1001)).toBe(1);
    await store.update((state) => {
      state.players[account]!.taskValues[String(makeTowerTaskId(68, 1001))] = 2;
    });
    await repository.getOrCreate(account);
    await repository.markLogin(account);
    expect(task(current(repository), 68, 1001)).toBe(2);
    expect(task(current(repository), 63, 3001)).toBe(1);
  });

  it("plays story, fixed-team and action levels, and refuses the mission nodes", async () => {
    const { repository } = await fixture();
    expect(
      (await repository.handleNamedTowerRequest(account, enter(16))).response,
    ).toEqual({
      nError: 2,
    });
    const story = await repository.handleNamedTowerRequest(account, enter(1, 0));
    expect(story.response).toEqual({
      tbData: { nLevelId: 1, nDiff: 1 },
      tbDrop: [],
      tbDropItems: [],
    });
    expect(
      five(body(await repository.handleNamedTowerRequest(account, pass(1))).tbData),
    ).toEqual([[15, 2, 1, 1, 20]]);
    expect(task(current(repository), 63, 3003)).toBe(1);
    await repository.handleNamedTowerRequest(account, enter(2));
    const team = await repository.handleNamedTowerRequest(account, pass(2));
    expect(team.rejected).toBeNull();
    expect(task(current(repository), 63, 3004)).toBe(1);
    await repository.handleNamedTowerRequest(account, enter(4));
    const action = await repository.handleNamedTowerRequest(account, pass(4));
    expect(five(body(action).tbData)).toContainEqual([15, 102, 1, 1, 18]);
    expect(money(current(repository), 70)).toBe(18);
    expect(money(current(repository), 1)).toBe(90);
  });

  it("claims a mission once its fights are counted, and keeps a state shut until the one before is claimed", async () => {
    const { repository } = await fixture();
    const claim = (state: number, mission: number) =>
      repository.handleNamedTowerRequest(account, named(404, [state, mission]));
    // 5701: clear any action level 5 times.
    expect((await claim(1, 5701)).response).toEqual({ nError: 12 });
    for (let run = 0; run < 5; run++) {
      await repository.handleNamedTowerRequest(account, enter(4));
      await repository.handleNamedTowerRequest(account, pass(4));
    }
    const paid = await claim(1, 5701);
    expect(paid.response).toEqual({
      tbReward: [
        [15, 128, 1, 1, 3],
        [15, 96, 1, 1, 2],
      ],
    });
    expect((await claim(1, 5701)).response).toEqual({ nError: 13 });
    // 5705: 150 vigour spent, and the 50 spent so far do not reach it. State 2 is shut.
    expect((await claim(1, 5705)).response).toEqual({ nError: 12 });
    expect((await claim(2, 5711)).response).toEqual({ nError: 12 });
    // A mission that is not in the event's lists.
    expect((await claim(1, 5)).response).toEqual({ nError: 2 });
  });

  it("claims the map's mission nodes through GetConverAchieveAward once the counters are met", async () => {
    const { repository } = await fixture({ vigour: 300 });
    // 5743: affection level 10 of girl 202; 5741: 300 vigour spent.
    await expect(
      repository.claimOtherAchievementAward(account, 5743),
    ).rejects.toThrow();
    await repository.handleNamedTowerRequest(account, enter(4));
    await repository.handleNamedTowerRequest(account, pass(4));
    await expect(
      repository.claimOtherAchievementAward(account, 5742),
    ).rejects.toThrow();
    // 5742 needs 20 action clears: write the progress through the claim path's own counter.
    for (let run = 0; run < 19; run++) {
      await repository.handleNamedTowerRequest(account, enter(4));
      await repository.handleNamedTowerRequest(account, pass(4));
    }
    const claimed = await repository.claimOtherAchievementAward(account, 5742);
    expect(claimed.awards).toEqual([[15, 2, 1, 1, 10]]);
    expect(money(current(repository), 3)).toBeGreaterThanOrEqual(10);
  });

  it("draws from the ponds one token at a time and locks the last pond until the others are empty", async () => {
    const { repository } = await fixture({ money: { 88: 3 } });
    const draw = (pond: number) =>
      repository.handleNamedTowerRequest(
        account,
        named(405, { nPondId: pond, nType: 1 }),
        {
          random: () => 0,
        },
      );
    expect((await draw(5)).response).toEqual({ nError: 9 });
    expect((await draw(99)).response).toEqual({ nError: 9 });
    const first = await draw(1);
    const item = (body(first).tbItem as number[][])[0]!;
    // Slot 1 of pond 1 is the special one (Sp 1): its tuple has a sixth value.
    expect(item).toEqual([21, 2, 3, 3, 1, 1]);
    expect(money(current(repository), 88)).toBe(2);
    expect(task(current(repository), 63, 3201)).toBe(1);
    // With the random draw fixed, slot 1 (count 1) is used up; the next draw takes slot 2.
    const second = await draw(1);
    expect((body(second).tbItem as number[][])[0]).toEqual([15, 2, 1, 1, 20, 1]);
    expect(task(current(repository), 63, 3202)).toBe(1);
    await draw(1);
    expect(money(current(repository), 88)).toBe(0);
    const poor = await draw(1);
    expect(poor.response).toEqual({ nError: 8 });
  });
});
