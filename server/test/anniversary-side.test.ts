import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  AnniversaryCatalog,
  anniversaryErrorReply,
  anniversaryReadOnly,
  gameRankReply,
  parseAnniversaryCall,
  parseGameRankCall,
  BOARD_TASK,
  GRID_TASK,
  GUESS_TASK,
  LOVE_ITEM,
  MAIN_TASK,
  PUZZLE_TASK,
  type AnniversaryRequest,
} from "../src/game-data/anniversary-data.js";
import { ANNIVERSARY_TASK, NAMED_COMMAND } from "../src/game-data/named-tower-data.js";
import {
  account,
  current,
  fixture,
  money,
  task,
  type Reply,
} from "./helpers/named-fixture.js";

const catalog = AnniversaryCatalog.loadDefault();

function call(command: number, body: unknown): AnniversaryRequest {
  const request = parseAnniversaryCall({ sCmd: command, tbParam: body });
  if (!request) throw new Error(`Not an anniversary request: ${command}`);
  return request;
}

type Repository = Awaited<ReturnType<typeof fixture>>["repository"];
const send = (
  repository: Repository,
  request: AnniversaryRequest,
  options: { random?: (max: number) => number; now?: number } = {},
) => repository.handleAnniversaryRequest(account, request, options);
const snapshot = (repository: Repository): string =>
  JSON.stringify(current(repository));
const body = (result: { response: unknown }): Reply => result.response as Reply;

const map1 = catalog.maps.get(1)!;
const cellWith = (test: (type: number, levelInfo: number[]) => boolean) =>
  [...map1.cells.values()].find((cell) => {
    const event = catalog.events.get(cell.event);
    return event ? test(event.type, event.levelInfo) : false;
  })!;

async function addItem(
  store: Awaited<ReturnType<typeof fixture>>["store"],
  gdpl: number[],
  count: number,
) {
  await store.update((state) => {
    state.players[account]!.inventory.push({
      guid: 500 + gdpl[1]!,
      genre: gdpl[0]!,
      detail: gdpl[1]!,
      particular: gdpl[2]!,
      templateLevel: gdpl[3]!,
      count,
      createTime: 1,
      enhanceLevel: 1,
      enhanceExp: 0,
      breakLevel: 0,
      lockOn: 0,
    });
  });
}

describe("anniversary tables and requests", () => {
  it("loads the map, pond, story, puzzle and guess tables", () => {
    expect(catalog.maps.size).toBe(8);
    expect(map1.processPoints).toEqual([300, 600, 1000]);
    expect(map1.cells.size).toBe(101);
    expect(map1.start).toBe(1);
    expect(catalog.events.get(5)?.type).toBe(3);
    expect(catalog.pools.get(1)).toMatchObject({
      limited: 1,
      limitless: 1,
      cost: [15, 89, 1, 1, 1],
    });
    expect(catalog.pools.get(1)!.ponds.get(1)!.length).toBeGreaterThan(3);
    expect(catalog.stories.get(1)).toHaveLength(3);
    expect(catalog.puzzles.get(1)).toMatchObject({ moneyId: 52 });
    expect(catalog.guess).toMatchObject({
      dailyNum: 18,
      useNum: 1,
      goldId: 55,
      moneyId: 54,
    });
    expect(catalog.guess!.girls).toHaveLength(14);
    expect(catalog.guess!.awards).toHaveLength(20);
    expect(catalog.attributeCap.every((cap) => cap > 0)).toBe(true);
  });

  it("reads each request and leaves the families and unknown commands alone", () => {
    expect(call(420, { MapID: 1, Path: [2, 3] })).toMatchObject({
      kind: "move",
      path: [2, 3],
    });
    expect(call(418, { Val: 99, Reason: 3 }).kind).toBe("ignored");
    expect(call(431, { nType: 2, bGold: true, nFist: 3 })).toMatchObject({
      kind: "guessFist",
      fist: 2,
      gold: true,
      hint: 3,
    });
    expect(call(431, { bTimeOut: true })).toMatchObject({ fist: null, timeout: true });
    for (const command of [421, 426, 53, 436, 999])
      expect(
        parseAnniversaryCall({ sCmd: command, tbParam: {} }),
        String(command),
      ).toBeNull();
    expect(parseAnniversaryCall(null)).toBeNull();
    expect(anniversaryReadOnly(call(418, {}))).toBe(true);
    expect(anniversaryReadOnly(call(420, { MapID: 1, Path: [] }))).toBe(false);
    expect(anniversaryErrorReply(call(424, {}), 2)).toBeUndefined();
    expect(anniversaryErrorReply(call(420, { MapID: 1, Path: [2] }), 1)).toMatchObject({
      Err: 1,
    });
  });

  it("answers the ranking lists with an empty list and the type it was asked for", () => {
    const rank = parseGameRankCall([12, 3, 1, true, [0, 10]]);
    expect(rank).toEqual({ id: [12, 3, 1] });
    expect(gameRankReply(rank!)).toEqual({
      tbData: { tbId: [12, 3, 1], max: 0, me: 0, other: [] },
    });
    expect(parseGameRankCall([12])).toBeNull();
    expect(parseGameRankCall("x")).toBeNull();
  });

  it("answers the leftover calls with what the client handles", async () => {
    const { repository } = await fixture();
    const before = snapshot(repository);
    expect(body(await send(repository, call(355, { nId: 1 })))).toEqual({
      Error: 20045,
    });
    expect(body(await send(repository, call(356, { nId: 1 })))).toEqual({
      Error: 20045,
    });
    expect(body(await send(repository, call(206, {})))).toEqual({ res: false });
    expect(snapshot(repository)).toBe(before);
  });
});

describe("discovery map, 418 to 420, 429 and 480", () => {
  // Map 1 starts at cell 1 (7,0); cells 2-21 are one corridor in id order, with the fight cell 11 (level 1/11) on
  // it, the hinder 24 (needs 5/5/0) off cell 21 and the hinder 66 (needs 10/10/10) off cell 60.
  const corridor = (from: number, to: number): number[] => {
    const cells: number[] = [];
    const step = from <= to ? 1 : -1;
    for (let id = from; id !== to + step; id += step) cells.push(id);
    return cells;
  };
  const passDiscoveryLevel = (
    store: Awaited<ReturnType<typeof fixture>>["store"],
    eventId: number,
    levelId: number,
  ) =>
    store.update((state) => {
      state.players[account]!.taskValues[
        String((81 << 16) | (ANNIVERSARY_TASK.discoveryPass + eventId * 100 + levelId))
      ] = 1;
    });

  it("walks the map: one power per new cell, first arrival pays the event once", async () => {
    // Cells 5 and 7 hold type 3 events (first awards).
    const { repository } = await fixture({ money: { 58: 8 } });
    const path = corridor(2, 7);
    const first = await send(repository, call(420, { MapID: 1, Path: path }));
    expect(first.rejected).toBeNull();
    const reply = body(first);
    expect(reply).toMatchObject({ Err: 0, TeamPos: 7, LastPower: 2 });
    const player = current(repository);
    expect(money(player, 58)).toBe(2);
    expect(task(player, 81, 1)).toBe(7);
    for (const id of path) expect(task(player, 80, id)).toBe(1);
    expect(first.updatedMoney.map(({ id }) => id)).toContain(58);
    // The same cells again, back and forth, cost nothing and pay nothing.
    const wallet = JSON.stringify(current(repository).money);
    const items = JSON.stringify(current(repository).inventory);
    const again = await send(
      repository,
      call(420, { MapID: 1, Path: [...corridor(6, 2), ...corridor(3, 7)] }),
    );
    expect(body(again)).toMatchObject({ Err: 0, TeamPos: 7 });
    expect(JSON.stringify(current(repository).money)).toBe(wallet);
    expect(JSON.stringify(current(repository).inventory)).toBe(items);
  });

  it("refuses a path the power cannot pay whole, and unknown cells", async () => {
    const { repository } = await fixture({ money: { 58: 1 } });
    const before = snapshot(repository);
    const poor = await send(repository, call(420, { MapID: 1, Path: [2, 3, 4] }));
    expect(poor.rejected?.code).toBe(1);
    expect(body(poor).Err).toBe(1);
    const unknown = await send(repository, call(420, { MapID: 1, Path: [2, 9999] }));
    expect(body(unknown).Err).toBe(2);
    const badMap = await send(repository, call(420, { MapID: 77, Path: [2] }));
    expect(body(badMap).Err).toBe(2);
    expect(snapshot(repository)).toBe(before);
  });

  it("stops at a hinder until the attributes are high enough", async () => {
    const { repository, store } = await fixture({ money: { 58: 40 } });
    const hinder = cellWith((type) => type === 101);
    expect(hinder.id).toBe(24);
    const need = catalog.events.get(hinder.event)!.conditions;
    await passDiscoveryLevel(store, 1, 11);
    const blocked = await send(
      repository,
      call(420, { MapID: 1, Path: [...corridor(2, 21), 24, 25] }),
    );
    expect(body(blocked)).toMatchObject({ Err: 0, TeamPos: 21 });
    expect(money(current(repository), 58)).toBe(20);
    expect(task(current(repository), 80, 24)).toBe(0);
    await store.update((state) => {
      // 100 exp is one level: level = exp / 100 + 1.
      need.forEach((level, index) => {
        state.players[account]!.taskValues[String((81 << 16) | (4001 + index))] =
          (level - 1) * 100;
      });
    });
    const passed = await send(repository, call(420, { MapID: 1, Path: [24, 25] }));
    expect(body(passed)).toMatchObject({ Err: 0, TeamPos: 25 });
    expect(money(current(repository), 58)).toBe(18);
  });

  it("lets the team onto a fight cell, then only back until the fight is won", async () => {
    const { repository, store } = await fixture({ money: { 58: 40 } });
    const fight = map1.cells.get(11)!;
    expect(catalog.events.get(fight.event)!.levelInfo).toEqual([1, 11]);
    // A path through the fight cell stops on it.
    const through = await send(
      repository,
      call(420, { MapID: 1, Path: corridor(2, 13) }),
    );
    expect(body(through)).toMatchObject({ Err: 0, TeamPos: 11 });
    expect(money(current(repository), 58)).toBe(30);
    expect(task(current(repository), 80, 12)).toBe(0);
    // Standing on it, a step forward, alone or behind the cell itself, ends where the team stands.
    const before = snapshot(repository);
    for (const path of [[12], [11, 12], [12, 13]]) {
      const forward = await send(repository, call(420, { MapID: 1, Path: path }));
      expect(forward.rejected).toBeNull();
      expect(body(forward)).toMatchObject({
        Err: 0,
        TeamPos: 11,
        LastPower: 30,
      });
    }
    expect(snapshot(repository)).toBe(before);
    // Back onto cells it has been on is open.
    const back = await send(repository, call(420, { MapID: 1, Path: [10, 9] }));
    expect(body(back)).toMatchObject({ Err: 0, TeamPos: 9, LastPower: 30 });
    // Once the level is passed, the walk goes on through the cell.
    await passDiscoveryLevel(store, 1, 11);
    const won = await send(repository, call(420, { MapID: 1, Path: corridor(10, 13) }));
    expect(body(won)).toMatchObject({ Err: 0, TeamPos: 13, LastPower: 28 });
  });

  it("ends the walk at a step onto a cell that does not touch the team", async () => {
    const { repository } = await fixture({ money: { 58: 40 } });
    // From the start (cell 1): cell 7 is 6 cells away, 21 lies behind hinder 24, 60 behind hinder 66.
    for (const target of [7, 21, 60]) {
      const jump = await send(repository, call(420, { MapID: 1, Path: [target] }));
      expect(jump.rejected).toBeNull();
      expect(body(jump)).toMatchObject({ Err: 0, TeamPos: 1, LastPower: 40 });
    }
    // No cell visited and the team still on the start cell (task 81/1 unset).
    const gridTasks = Object.keys(current(repository).taskValues).filter((key) =>
      [80, 81].includes(Number(key) >>> 16),
    );
    expect(gridTasks).toEqual([]);
    // A gap in the middle keeps the cells before it. Cells 6 (3,1) and 8 (2,2) touch only at a corner.
    const gap = await send(
      repository,
      call(420, { MapID: 1, Path: [2, 3, 4, 5, 6, 8, 9] }),
    );
    expect(body(gap)).toMatchObject({ Err: 0, TeamPos: 6, LastPower: 35 });
    expect(task(current(repository), 80, 8)).toBe(0);
    // A path that lists the cell the team stands on first is read from the next cell.
    const fromHere = await send(repository, call(420, { MapID: 1, Path: [6, 7, 8] }));
    expect(body(fromHere)).toMatchObject({ Err: 0, TeamPos: 8, LastPower: 33 });
  });

  it("418 and 419 change nothing and send nothing", async () => {
    const { repository } = await fixture();
    const before = snapshot(repository);
    for (const request of [
      call(418, { Val: 100, Reason: 3 }),
      call(419, { MapID: 1 }),
    ]) {
      const result = await send(repository, request);
      expect(result.response).toBeUndefined();
      expect(result.rejected).toBeNull();
    }
    expect(snapshot(repository)).toBe(before);
  });

  it("raises an attribute by 50 exp per skill point, up to the cap", async () => {
    const { repository } = await fixture({ money: { 59: 2 } });
    const first = await send(repository, call(429, { AttrIdx: 2 }));
    expect(body(first)).toEqual({ nError: 0 });
    expect(task(current(repository), 81, 4002)).toBe(50);
    expect(money(current(repository), 59)).toBe(1);
    const bad = await send(repository, call(429, { AttrIdx: 4 }));
    expect(body(bad).nError).toBeGreaterThan(0);
    await send(repository, call(429, { AttrIdx: 1 }));
    const none = await send(repository, call(429, { AttrIdx: 1 }));
    expect(body(none).nError).toBeGreaterThan(0);
    expect(task(current(repository), 81, 4001)).toBe(50);
  });

  it("pays an exploration reward when complete / total * 1000 reaches the point, once", async () => {
    const { repository, store } = await fixture();
    const refused = await send(repository, call(480, { MapID: 1, RewardIdx: 1 }));
    expect(body(refused).nError).toBeGreaterThan(0);
    await store.update((state) => {
      for (const cell of map1.cells.values())
        if (cell.event !== -1)
          state.players[account]!.taskValues[String((80 << 16) | cell.id)] = 1;
    });
    const paid = await send(repository, call(480, { MapID: 1, RewardIdx: 1 }));
    expect(body(paid)).toEqual({ nError: 0, nMapId: 1, nRewardIdx: 1 });
    expect(task(current(repository), 81, 19001)).toBe(1);
    expect(money(current(repository), 2)).toBeGreaterThan(0);
    const gold = money(current(repository), 2);
    const twice = await send(repository, call(480, { MapID: 1, RewardIdx: 1 }));
    expect(body(twice).nError).toBeGreaterThan(0);
    expect(money(current(repository), 2)).toBe(gold);
  });
});

describe("thank-you board, 424 and 425", () => {
  const day = 4 * 86_400_000 * 5000;

  it("unlocks one photo a day, answers only when something unlocks and marks the letter", async () => {
    const { repository } = await fixture();
    const now = 1_700_000_000_000;
    const first = await send(repository, call(424, {}), { now });
    expect(first.response).toEqual([0]);
    expect(task(current(repository), 83, 1)).toBe(1);
    expect(task(current(repository), 83, 2)).toBe(1);
    const same = await send(repository, call(424, {}), { now: now + 3600_000 });
    expect(same.response).toBeUndefined();
    const next = await send(repository, call(424, {}), { now: now + 86_400_000 });
    expect(next.response).toEqual([1]);
    void day;
  });

  it("pays the previewed item after fourteen photos, once", async () => {
    const { repository, store } = await fixture();
    const early = await send(repository, call(425, {}));
    expect(early.rejected).not.toBeNull();
    expect(early.response).toEqual([]);
    await store.update((state) => {
      state.players[account]!.taskValues[String((83 << 16) | 2)] = 14;
    });
    const paid = await send(repository, call(425, {}));
    expect(paid.response).toEqual([6, 28, 55, 4, 1]);
    expect(task(current(repository), 83, 3)).toBe(1);
    // 6-28-55 is head frame 55 (ItemHeadFrameAuto): owned when task 11/55 holds the time of receipt.
    expect(task(current(repository), 11, 55)).toBeGreaterThan(0);
    const twice = await send(repository, call(425, {}));
    expect(twice.rejected).not.toBeNull();
  });
});

describe("girl stories and gifts, 437", () => {
  it("claims a story once and only when its love level is reached", async () => {
    const { repository, store } = await fixture();
    await store.update((state) => {
      state.players[account]!.girls.push({ girlId: 1 } as never);
    });
    const locked = await send(
      repository,
      call(437, { nType: 2, girlId: 1, storyIdx: 1 }),
    );
    expect(locked.rejected).not.toBeNull();
    expect(body(locked).nError).toBeGreaterThan(0);
    await store.update((state) => {
      state.players[account]!.taskValues[String((81 << 16) | 2002)] = 1;
    });
    const paid = await send(
      repository,
      call(437, { nType: 2, girlId: 1, storyIdx: 1 }),
    );
    expect(body(paid)).toEqual({ nType: 2, tbReward: [[15, 2, 1, 1, 5]] });
    expect(task(current(repository), 81, 2502)).toBe(0b10);
    const twice = await send(
      repository,
      call(437, { nType: 2, girlId: 1, storyIdx: 1 }),
    );
    expect(twice.rejected).not.toBeNull();
    // A girl the player does not own, and a story without love level (story 2 needs 2).
    const stranger = await send(
      repository,
      call(437, { nType: 2, girlId: 2, storyIdx: 1 }),
    );
    expect(stranger.rejected).not.toBeNull();
  });

  it("spends a gift for a love level up to the maximum", async () => {
    const { repository, store } = await fixture();
    await store.update((state) => {
      state.players[account]!.girls.push({ girlId: 1 } as never);
    });
    await addItem(store, [15, 88, 1, 1], 2);
    const gift = await send(repository, call(437, { nType: 1, girlId: 1 }));
    expect(body(gift)).toEqual({ nType: 1, tbReward: [] });
    expect(task(current(repository), 81, 2002)).toBe(1);
    expect(
      current(repository).inventory.find((item) => item.detail === 88)?.count,
    ).toBe(1);
    const second = await send(repository, call(437, { nType: 1, girlId: 1 }));
    expect(second.rejected).toBeNull();
    const none = await send(repository, call(437, { nType: 1, girlId: 1 }));
    expect(none.rejected).not.toBeNull();
    expect(task(current(repository), 81, 2002)).toBe(2);
  });
});

describe("capsule machine, 438", () => {
  it("takes the coin, draws one limited and one endless reward and tracks the pond in tasks", async () => {
    const { repository, store } = await fixture();
    const none = await send(repository, call(438, { nId: 1 }));
    expect(none.rejected).not.toBeNull();
    expect(none.response).toEqual([]);
    await addItem(store, [15, 89, 1, 1], 3);
    const result = await send(repository, call(438, { nId: 1 }), { random: () => 0 });
    expect(result.rejected).toBeNull();
    const rewards = result.response as number[][];
    expect(rewards).toHaveLength(2);
    const pond = catalog.pools.get(1)!.ponds.get(1)!;
    expect(rewards[0]).toEqual([...pond[0]!.award]);
    expect(task(current(repository), 81, 1902)).toBe(1);
    expect(
      current(repository).inventory.find((item) => item.detail === 89)?.count,
    ).toBe(2);
  });

  it("starts the next pond when a pond is drawn out", async () => {
    const { repository, store } = await fixture();
    await addItem(store, [15, 89, 1, 1], 100);
    const pond = catalog.pools.get(1)!.ponds.get(1)!;
    const stock = pond.reduce((sum, item) => sum + item.count, 0);
    for (let draw = 0; draw < stock; draw++)
      await send(repository, call(438, { nId: 1 }), { random: () => 0 });
    expect(task(current(repository), 81, 1901)).toBe(2);
    expect(task(current(repository), 81, 1902)).toBe(0);
  });
});

describe("puzzle, 440 and 441", () => {
  it("flips pieces for the board's token and echoes the request with nRet", async () => {
    const { repository } = await fixture({ money: { 52: 2 } });
    const opened = await send(repository, call(440, { nGroup: 1, nIndex: 5 }));
    expect(body(opened)).toEqual({ nGroup: 1, nIndex: 5, nRet: 0 });
    expect(task(current(repository), 86, 1)).toBe(1 << 5);
    expect(money(current(repository), 52)).toBe(1);
    const again = await send(repository, call(440, { nGroup: 1, nIndex: 5 }));
    expect(body(again)).toMatchObject({ nRet: -1 });
    await send(repository, call(440, { nGroup: 1, nIndex: 6 }));
    const poor = await send(repository, call(440, { nGroup: 1, nIndex: 7 }));
    expect(body(poor)).toMatchObject({ nRet: -5 });
    expect(task(current(repository), 86, 1)).toBe((1 << 5) | (1 << 6));
  });

  it("pays a box when enough pieces are open, once", async () => {
    const { repository, store } = await fixture();
    const early = await send(repository, call(441, { nGroup: 1, nIndex: 1 }));
    expect(body(early).nRet).toBe(-1);
    await store.update((state) => {
      let bits = 0;
      for (let piece = 1; piece <= 3; piece++) bits |= 1 << piece;
      state.players[account]!.taskValues[String((86 << 16) | 1)] = bits;
    });
    const paid = await send(repository, call(441, { nGroup: 1, nIndex: 1 }));
    expect(body(paid)).toEqual({ nGroup: 1, nIndex: 1, nRet: 0 });
    expect(task(current(repository), 86, 1) >>> 21).toBe(1);
    expect(current(repository).inventory.length).toBeGreaterThan(1);
    const twice = await send(repository, call(441, { nGroup: 1, nIndex: 1 }));
    expect(body(twice).nRet).toBe(-1);
  });
});

describe("guessing tournament, 430 to 433", () => {
  const rock = 1;
  const fixedRandom = (max: number): number => Math.min(max - 1, 0);

  it("starts a round of six opponents and keeps the bout in task 7", async () => {
    const { repository } = await fixture();
    const refresh = await send(repository, call(430, {}), { random: fixedRandom });
    const reply = body(refresh);
    expect(reply.Error).toBe(0);
    const girls = (reply.tbGirl as number[][]).map((entry) => entry[0]!);
    expect(girls).toHaveLength(6);
    expect(new Set(girls).size).toBe(6);
    const player = current(repository);
    expect(task(player, 84, 2)).toBe(1);
    expect(task(player, 84, 7) >>> 20).toBe(girls[0]);
    expect((task(player, 84, 7) >>> 16) & 0xf).toBe(1);
    // Asking again keeps the round.
    const again = await send(repository, call(430, {}), { random: fixedRandom });
    expect(body(again).tbGirl).toEqual(reply.tbGirl);
    expect(task(current(repository), 84, 2)).toBe(1);
  });

  it("plays a match: the gold finger wins, tries are charged, two wins finish the girl", async () => {
    const { repository } = await fixture({ money: { 55: 5, 54: 0 } });
    await send(repository, call(430, {}), { random: fixedRandom });
    const girl = (task(current(repository), 84, 7) >>> 20) & 0xfff;
    const first = await send(repository, call(431, { nType: rock, bGold: true }));
    expect(body(first)).toMatchObject({
      Error: 0,
      nType: rock,
      ServerFist: 2,
      bGold: true,
    });
    expect(money(current(repository), 55)).toBe(4);
    expect(task(current(repository), 84, 3)).toBe(1);
    // The decided bout is in the low bits of task 7, the girl is still the same.
    const mid = task(current(repository), 84, 7);
    expect(mid & 3).toBe(2);
    expect((mid >>> 20) & 0xfff).toBe(girl);
    const second = await send(repository, call(431, { nType: rock, bGold: true }));
    expect(body(second).Error).toBe(0);
    const player = current(repository);
    // The match is over: the next girl is up, one more join, one win against the girl.
    expect((task(player, 84, 7) >>> 16) & 0xf).toBe(2);
    expect(task(player, 84, 4)).toBe(1);
    const slot = catalog.guess!.girls.indexOf(girl) + 1;
    expect(task(player, 84, 10 + slot) & 0xffff).toBe(1);
    expect(task(player, 84, 10 + slot) >>> 16).toBe(1);
    const log = body(await send(repository, call(433, {}))).tbLog as {
      nRound: number;
      tbGirls: { Girlid: number; tbResult: number[] }[];
    }[];
    expect(log.at(-1)).toEqual({
      nRound: 1,
      tbGirls: [{ Girlid: girl, tbResult: [2, 2, 0] }],
    });
  });

  it("loses a match on two losses and on a timeout, and refuses without tries or gold fingers", async () => {
    const { repository, store } = await fixture();
    await send(repository, call(430, {}), { random: fixedRandom });
    const timeout = await send(repository, call(431, { bTimeOut: true }));
    expect(body(timeout)).toEqual({ Error: 0, bTimeOut: true });
    expect(task(current(repository), 84, 7) & 3).toBe(1);
    const noGold = await send(repository, call(431, { nType: rock, bGold: true }));
    expect(noGold.rejected?.code).toBe(20043);
    expect(body(noGold)).toEqual({ Error: 20043 });
    await store.update((state) => {
      state.players[account]!.taskValues[String((84 << 16) | 3)] = 18;
    });
    const before = snapshot(repository);
    const noTries = await send(repository, call(431, { nType: rock }));
    expect(body(noTries)).toEqual({ Error: 20043 });
    expect(snapshot(repository)).toBe(before);
    // The free tries come back at 04:00: a later day opens the counter again.
    const later = await send(repository, call(431, { nType: rock }), {
      now: Date.now() + 2 * 86_400_000,
      random: fixedRandom,
    });
    expect(later.rejected).toBeNull();
    expect(task(current(repository), 84, 3)).toBe(1);
  });

  it("ends a round after six matches, adds its win rate and starts the next one", async () => {
    const { repository } = await fixture({ money: { 55: 50 } });
    await send(repository, call(430, {}), { random: fixedRandom });
    for (let throwNo = 0; throwNo < 12; throwNo++)
      await send(repository, call(431, { nType: rock, bGold: true }), {
        random: fixedRandom,
      });
    const player = current(repository);
    expect(task(player, 84, 2)).toBe(2);
    expect(task(player, 84, 4)).toBe(6);
    expect(task(player, 84, 9)).toBe(100);
    expect((task(player, 84, 7) >>> 16) & 0xf).toBe(1);
    const log = body(await send(repository, call(433, {}))).tbLog as unknown[];
    expect(log).toHaveLength(2);
  });

  it("pays award rows by bouts, wins against a girl and wins against all, once", async () => {
    const { repository, store } = await fixture();
    const early = await send(repository, call(432, { nType: 1, nIndex: 1 }));
    expect(early.rejected?.code).toBe(20043);
    await store.update((state) => {
      state.players[account]!.taskValues[String((84 << 16) | 4)] = 20;
    });
    const paid = await send(repository, call(432, { nType: 1, nIndex: 1 }));
    expect(body(paid)).toEqual({ Error: 0, Items: [[7, 4, 1, 3, 1]] });
    expect(task(current(repository), 84, 31)).toBe(1 << 1);
    const twice = await send(repository, call(432, { nType: 1, nIndex: 1 }));
    expect(twice.rejected).not.toBeNull();
    // Type 2: girl 1 needs 3 wins (task 11 low half).
    const girlAward = await send(repository, call(432, { nType: 2, nIndex: 1 }));
    expect(girlAward.rejected).not.toBeNull();
    await store.update((state) => {
      state.players[account]!.taskValues[String((84 << 16) | 11)] = 3;
    });
    const girlPaid = await send(repository, call(432, { nType: 2, nIndex: 1 }));
    expect(girlPaid.rejected).toBeNull();
    expect(task(current(repository), 84, 32)).toBe(1 << 1);
  });
});

/**
 * The layouts are copied from the 0.1.3 client scripts. Run with
 * GCG_CLIENT_LUA_DIR=<folder with the decrypted *.lua.txt> to compare them.
 */
const luaDirectory = process.env.GCG_CLIENT_LUA_DIR ?? "";
describe.skipIf(!luaDirectory || !existsSync(luaDirectory))(
  "first Anniversary layouts against the client Lua",
  () => {
    const lua = (name: string): string =>
      readFileSync(path.join(luaDirectory, `${name}.lua.txt`), "utf8");
    const value = (source: string, pattern: RegExp): number => {
      const match = source.match(pattern);
      if (!match) throw new Error(`Not found: ${pattern}`);
      return Number(match[1]);
    };

    it("tower, discovery levels, stories and capsules", () => {
      const main = lua("anniversarymainlogic");
      expect(ANNIVERSARY_TASK.group).toBe(value(main, /nGroup\s*=\s*(\d+)/));
      expect(ANNIVERSARY_TASK.pass).toBe(value(main, /nTask_LevelPass\s*=\s*(\d+)/));
      expect(MAIN_TASK.pondId).toBe(value(main, /nTaskIdPondId\s*=\s*(\d+)/));
      expect(MAIN_TASK.pondCount).toBe(value(main, /nTaskIdOffset\s*=\s*(\d+)/));
      expect(MAIN_TASK.love).toBe(value(main, /nTask_GirlLove\s*=\s*(\d+)/));
      expect(MAIN_TASK.story).toBe(value(main, /nTask_GirlStory\s*=\s*(\d+)/));
      expect(MAIN_TASK.maxLove).toBe(value(main, /MaxLoveLevel\s*=\s*(\d+)/));
      expect(LOVE_ITEM.join(",")).toBe(/LoveItem\s*=\s*\{([\d,]+)\}/.exec(main)![1]);
    });

    it("discovery map", () => {
      const grid = lua("gridactlogic");
      expect(GRID_TASK.visitGroup).toBe(value(grid, /GridPowerGroup\s*=\s*(\d+)/));
      expect(GRID_TASK.group).toBe(value(grid, /GridLastPointGroup\s*=\s*(\d+)/));
      expect(ANNIVERSARY_TASK.discoveryPass).toBe(
        value(grid, /LevelPassOffset\s*=\s*(\d+)/),
      );
      expect(GRID_TASK.processReward).toBe(
        value(grid, /nProcessRewardOffset\s*=\s*(\d+)/),
      );
      expect(ANNIVERSARY_TASK.goalBase).toBe(
        value(grid, /nTaskTowerGoalBase\s*=\s*(\d+)/),
      );
      expect(GRID_TASK.expAdd).toBe(value(grid, /ExpAdd\s*=\s*(\d+)/));
      expect(GRID_TASK.expCost).toBe(value(grid, /ExpCost\s*=\s*(\d+)/));
      expect(GRID_TASK.attribute).toBe(value(grid, /local task_offset\s*=\s*(\d+)/));
      expect(value(grid, /nTask_Strength\s*=\s*task_offset \+ (\d+)/)).toBe(1);
      const money = lua("moneylogic");
      expect(GRID_TASK.power).toBe(
        value(money, /eMoneyType_Anniversary_Power\s*=\s*(\d+)/),
      );
      expect(GRID_TASK.points).toBe(
        value(money, /eMoneyType_Anniversary_Point\s*=\s*(\d+)/),
      );
    });

    it("board, puzzle and guess", () => {
      const board = lua("anniversaryboard");
      expect(BOARD_TASK.group).toBe(value(board, /TaskGroup\s*=\s*(\d+)/));
      expect(BOARD_TASK.letterOpened).toBe(
        value(board, /HasOpenLetterTaskId\s*=\s*(\d+)/),
      );
      expect(BOARD_TASK.photos).toBe(value(board, /PhotoUnLockNumTaskId\s*=\s*(\d+)/));
      expect(BOARD_TASK.awardTaken).toBe(value(board, /HasGetAwardTaskId\s*=\s*(\d+)/));
      expect(BOARD_TASK.lastDay).toBe(value(board, /LastOpenLetterDay\s*=\s*(\d+)/));
      expect(BOARD_TASK.photoCount).toBe(value(board, /< (\d+) then/));
      const puzzle = lua("puzzlelogic");
      expect(PUZZLE_TASK.group).toBe(value(puzzle, /nTaskGroup\s*=\s*(\d+)/));
      expect(PUZZLE_TASK.pieces).toBe(value(puzzle, /nPuzzleNum\s*=\s*(\d+)/));
      expect(PUZZLE_TASK.awards).toBe(value(puzzle, /nAwardNum\s*=\s*(\d+)/));
      expect(PUZZLE_TASK.awardBit).toBe(value(puzzle, /nPuzzleAward\s*=\s*(\d+)/));
      const guess = lua("anniversaryguess");
      expect(GUESS_TASK.group).toBe(value(guess, /Task_Group\s*=\s*(\d+)/));
      expect(GUESS_TASK.turn).toBe(value(guess, /TurnNum_Task\s*=\s*(\d+)/));
      expect(GUESS_TASK.daily).toBe(value(guess, /DailyNum_Task\s*=\s*(\d+)/));
      expect(GUESS_TASK.join).toBe(value(guess, /JoinNum_Task\s*=\s*(\d+)/));
      expect(GUESS_TASK.current).toBe(value(guess, /CurRound_Task\s*=\s*(\d+)/));
      expect(GUESS_TASK.rateSum).toBe(value(guess, /AllRoundRate_Task\s*=\s*(\d+)/));
      expect(GUESS_TASK.girl).toBe(value(guess, /GirlNum_Task\s*=\s*(\d+)/));
      expect(GUESS_TASK.awardFlags).toBe(value(guess, /AwardJoin_Task\s*=\s*(\d+)/));
    });

    it("sends the commands the screens name", () => {
      const source = lua("luacall");
      const id = (name: string): number =>
        value(source, new RegExp(String.raw`LuaCall\.${name}\s*=\s*(\d+)`));
      expect(NAMED_COMMAND.gridPower).toBe(id("Anniversary_GridAct_GetPower"));
      expect(NAMED_COMMAND.gridReset).toBe(id("Anniversary_GridAct_ResetMap"));
      expect(NAMED_COMMAND.gridMove).toBe(id("Anniversary_GridAct_Move"));
      expect(NAMED_COMMAND.discoveryEnter).toBe(id("Anniversary_Discovery_EnterTower"));
      expect(NAMED_COMMAND.anniversaryEnter).toBe(id("Anniversary_EnterTower"));
      expect(NAMED_COMMAND.strengthen).toBe(id("Anniversary_Discovery_StrengthenAttr"));
      expect(NAMED_COMMAND.processReward).toBe(
        id("Anniversary_Discovery_Process_Reward"),
      );
      expect(NAMED_COMMAND.boardOpen).toBe(id("Anniversary_BoardOpen"));
      expect(NAMED_COMMAND.boardAward).toBe(id("Anniversary_GetAward"));
      expect(NAMED_COMMAND.love).toBe(id("Anniversary_Love"));
      expect(NAMED_COMMAND.gacha).toBe(id("Anniversary_Gacha"));
      expect(NAMED_COMMAND.puzzleOpen).toBe(id("Puzzle_Open"));
      expect(NAMED_COMMAND.puzzleBox).toBe(id("Puzzle_Box"));
      expect(NAMED_COMMAND.guessRefresh).toBe(id("Guess_Refresh"));
      expect(NAMED_COMMAND.guessFist).toBe(id("Guess_Fist"));
      expect(NAMED_COMMAND.guessAward).toBe(id("Guess_Award"));
      expect(NAMED_COMMAND.guessLog).toBe(id("Guess_Log"));
      expect(NAMED_COMMAND.fanSupport).toBe(id("FanEvent_Support"));
      expect(NAMED_COMMAND.fanReward).toBe(id("FanEvent_Reward"));
      expect(NAMED_COMMAND.challengeAwardSome).toBe(id("Challenge_Award_Some"));
    });
  },
);
