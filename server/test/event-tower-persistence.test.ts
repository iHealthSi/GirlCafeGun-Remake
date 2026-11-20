import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  EventTowerCatalog,
  makeTowerTaskId,
  parseEventTowerCall,
  type EventTowerRequest,
} from "../src/game-data/event-tower-data.js";
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
const catalog = EventTowerCatalog.loadDefault();
const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function fixture(options: { level?: number; vigour?: number } = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-event-tower-"));
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
      name: "",
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
    player.level = options.level ?? 40;
    player.exp = 0;
    player.money = [{ id: 1, count: options.vigour ?? 100 }];
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

function request(command: number, body: unknown, settled = false): EventTowerRequest {
  const call = parseEventTowerCall(
    settled
      ? { sCmd: 252, tbParam: { sCmd: command, tbParam: body } }
      : { sCmd: command, tbParam: body },
  );
  if (!call) throw new Error(`Not an event tower request: ${command}`);
  return call.request;
}
const enter = (type: number, tower: number, level: number, node = 0, formation = 1) =>
  request(54, [type, tower, node, level, formation]);
const pass = (
  type: number,
  tower: number,
  level: number,
  report: unknown,
  stars = 0,
  node = 0,
) =>
  request(
    55,
    [type, tower, node, level, 1, report, stars === 0 ? null : stars, [], 0],
    true,
  );
const fail = (type: number, tower: number, level: number) =>
  request(56, [type, tower, 0, level, 1], true);

function task(player: Player, group: number, key: number): number {
  return player.taskValues[String(makeTowerTaskId(group, key))] ?? 0;
}
function money(player: Player, id: number): number {
  return player.money.find((entry) => entry.id === id)?.count ?? 0;
}
function current(repository: PlayerRepository): Player {
  return repository.get(account)!;
}

describe("event tower fights", () => {
  it("charges vigour at settlement, pays the awards once and replays the reply", async () => {
    const { repository } = await fixture();
    const entered = await repository.handleEventTowerRequest(account, enter(2, 1, 2));
    expect(entered.rejected).toBeNull();
    expect(entered.response).toEqual({
      tbData: [2, 1, 0, 2],
      tbDrop: [],
      tbDropItems: [],
    });
    // The check is at entry, the charge at settlement.
    expect(money(current(repository), 1)).toBe(100);

    const first = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 2, { nScore: 777 }),
    );
    expect(first.rejected).toBeNull();
    const player = current(repository);
    expect(money(player, 1)).toBe(90);
    expect(money(player, 3)).toBe(20); // first clear: 20 diamonds
    expect(money(player, 5)).toBe(9); // fixed: 9 small tokens (15-6 is wallet 5)
    expect(money(player, 6)).toBe(1);
    expect(task(player, 9, 1100 + 2)).toBe(777);
    expect(player.exp).toBe(10);
    expect(first.experienceUpdate?.addedExperience).toBe(10);
    expect(first.response).toMatchObject({
      tbData: [
        [15, 2, 1, 1, 20, 0],
        [15, 6, 1, 1, 9, 100],
        [15, 7, 1, 1, 1, 100],
      ],
      nMasterExp: 10,
      newGoalIds: [],
      nGetScore: 777,
    });
    expect(first.updatedMoney.map((m) => m.id).sort()).toEqual([1, 3, 5, 6]);

    // The client resends until it hears back: same reply, nothing paid twice.
    const before = JSON.stringify(current(repository));
    const again = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 2, { nScore: 777 }),
    );
    expect(again.response).toEqual(first.response);
    expect(again.rejected).toBeNull();
    expect(JSON.stringify(current(repository))).toBe(before);

    // A second clear keeps the best score and pays the fixed awards again, not the first-clear one.
    await repository.handleEventTowerRequest(account, enter(2, 1, 2));
    const second = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 2, { nScore: 500 }),
    );
    expect((second.response as { tbData: number[][] }).tbData).toEqual([
      [15, 6, 1, 1, 9, 100],
      [15, 7, 1, 1, 1, 100],
    ]);
    expect(task(current(repository), 9, 1102)).toBe(777);
    expect(money(current(repository), 5)).toBe(18);
    expect(money(current(repository), 1)).toBe(80);
  });

  it("charges what the client computes: half, rounded up, below commander level 35", async () => {
    // RewardActivityLogic:GetActivityEnergySale: level 2 of the small tower costs 10, 5 below level 35.
    const { repository } = await fixture({ level: 20, vigour: 12 });
    expect(
      (await repository.handleEventTowerRequest(account, enter(2, 1, 2))).rejected,
    ).toBeNull();
    await repository.handleEventTowerRequest(account, pass(2, 1, 2, { nScore: 1 }));
    expect(money(current(repository), 1)).toBe(7);
    const { repository: poor } = await fixture({ level: 20, vigour: 4 });
    expect(
      (await poor.handleEventTowerRequest(account, enter(2, 1, 2))).rejected?.code,
    ).toBe(5);
    // From level 35 on the full cost is due.
    const { repository: full } = await fixture({ level: 35, vigour: 9 });
    expect(
      (await full.handleEventTowerRequest(account, enter(2, 1, 2))).rejected?.code,
    ).toBe(5);
  });

  it("refuses an entry without level, formation or vigour and keeps the save", async () => {
    const { repository } = await fixture({ vigour: 5 });
    const before = JSON.stringify(current(repository));
    const cases: [EventTowerRequest, number][] = [
      [enter(2, 1, 99999), 2],
      [enter(2, 1, 2, 0, 0), 10],
      [enter(2, 1, 2, 0, 77), 10],
      [enter(2, 1, 2), 5],
    ];
    for (const [entry, code] of cases) {
      const result = await repository.handleEventTowerRequest(account, entry);
      expect(result.rejected?.code).toBe(code);
      expect(result.response).toEqual({ nError: code });
    }
    expect(JSON.stringify(current(repository))).toBe(before);
  });

  it("refuses a settlement with no matching entry without paying", async () => {
    const { repository } = await fixture();
    const before = JSON.stringify(current(repository));
    const none = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 2, { nScore: 9 }),
    );
    expect(none.rejected?.reason).toBe("no_matching_entry");
    await repository.handleEventTowerRequest(account, enter(2, 1, 3));
    const other = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 2, { nScore: 9 }),
    );
    expect(other.rejected?.code).toBe(2);
    const wrongTower = await repository.handleEventTowerRequest(
      account,
      pass(2, 201, 3, { nScore: 9 }),
    );
    expect(wrongTower.rejected?.code).toBe(2);
    // Only the open run was added.
    const after = current(repository);
    expect(after.money).toEqual(JSON.parse(before).money);
    expect(after.taskValues).toEqual({});
  });

  it("drops every change when the settlement cannot be charged", async () => {
    const { store, repository } = await fixture();
    await repository.handleEventTowerRequest(account, enter(2, 1, 2));
    await store.update((state) => {
      state.players[account]!.money = [{ id: 1, count: 3 }];
    });
    const before = JSON.stringify(current(repository));
    const result = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 2, { nScore: 5 }),
    );
    expect(result.rejected?.code).toBe(5);
    expect(JSON.stringify(current(repository))).toBe(before);
    // The run is still open: topping up the vigour lets the same settlement through.
    await store.update((state) => {
      state.players[account]!.money = [{ id: 1, count: 50 }];
    });
    const retry = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 2, { nScore: 5 }),
    );
    expect(retry.rejected).toBeNull();
    expect(money(current(repository), 1)).toBe(40);
  });

  it("charges a failed fight once and refuses a settlement of it", async () => {
    const { repository } = await fixture();
    await repository.handleEventTowerRequest(account, enter(2, 1, 2));
    const lost = await repository.handleEventTowerRequest(account, fail(2, 1, 2));
    expect(lost.response).toEqual({});
    expect(money(current(repository), 1)).toBe(90);
    // The client resends the failure: nothing more is charged.
    await repository.handleEventTowerRequest(account, fail(2, 1, 2));
    expect(money(current(repository), 1)).toBe(90);
    const late = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 2, { nScore: 9 }),
    );
    expect(late.rejected?.reason).toBe("entry_already_closed");
    expect(task(current(repository), 9, 1102)).toBe(0);
    // A failure with no entry answers with an empty reply.
    const stray = await repository.handleEventTowerRequest(account, fail(2, 1, 4));
    expect(stray.response).toEqual({});
    expect(stray.rejected).toBeNull();
  });

  it("needs no formation for a story level and pays its first award once", async () => {
    const { repository } = await fixture();
    const story = request(54, [2, 1, 0, 1, 0]);
    expect(
      (await repository.handleEventTowerRequest(account, story)).rejected,
    ).toBeNull();
    const first = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 1, true),
    );
    expect((first.response as { tbData: number[][] }).tbData).toEqual([
      [15, 2, 1, 1, 20, 0],
    ]);
    expect(money(current(repository), 3)).toBe(20);
    expect(money(current(repository), 1)).toBe(100);
    expect(task(current(repository), 9, 1101)).toBe(1);
    await repository.handleEventTowerRequest(account, story);
    const second = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 1, true),
    );
    expect((second.response as { tbData: number[][] }).tbData).toEqual([]);
    expect(money(current(repository), 3)).toBe(20);
  });

  it("pays star goal points and the thresholds they cross", async () => {
    const { repository } = await fixture();
    await repository.handleEventTowerRequest(account, enter(2, 1, 5));
    const first = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 5, [true, false, null, true, true, false]),
    );
    const player = current(repository);
    expect(first.response).toMatchObject({ newGoalIds: [1, 4, 5] });
    expect(task(player, 9, 10000 + 5)).toBe(30);
    expect(task(player, 9, 10000 + 5 * 100 + 1)).toBe(1);
    expect(task(player, 9, 10000 + 5 * 100 + 2)).toBe(0);
    expect(task(player, 9, 1100 + 5)).toBe(1);
    // Thresholds 10, 20 and 30 are crossed: three payments of 5 diamonds.
    expect(money(player, 3)).toBe(15);
    expect((first.response as { tbData: number[][] }).tbData).toHaveLength(3);

    await repository.handleEventTowerRequest(account, enter(2, 1, 5));
    const second = await repository.handleEventTowerRequest(
      account,
      pass(2, 1, 5, [true, true, true, true, true, false]),
    );
    expect(second.response).toMatchObject({ newGoalIds: [2, 3] });
    expect(task(current(repository), 9, 10000 + 5)).toBe(50);
    expect(money(current(repository), 3)).toBe(25);
  });

  it("keeps clear counts for the classes that read them", async () => {
    const { repository } = await fixture();
    // TenthTower: group 64, nTaskLevelPass = 2000 + 100.
    for (let n = 0; n < 2; n++) {
      await repository.handleEventTowerRequest(account, enter(2, 10, 3));
      await repository.handleEventTowerRequest(
        account,
        pass(2, 10, 3, { UseTime: 40 }),
      );
    }
    const player = current(repository);
    expect(task(player, 64, 2100 + 3)).toBe(2);
    // 15-46 is the tower's wallet currency (money 28); 15-47 feeds talent exp of warzone 1.
    expect(money(player, 28)).toBe(48);
    expect(task(player, 64, 2091)).toBe(20);
    expect(player.inventory.filter((item) => item.genre === 15)).toEqual([]);
  });

  it("writes the slot a variegated level occupies and the event currency earned", async () => {
    const { repository } = await fixture();
    const tower = catalog.towers.get(101)!;
    const level = [...catalog.levels.values()].find(
      (l) =>
        l.tower === 101 &&
        l.type === 0 &&
        l.fixedAwards.some(({ award }) => award.slice(0, 4).join("-") === "15-54-1-1"),
    )!;
    await repository.handleEventTowerRequest(account, enter(2, 101, level.levelId));
    await repository.handleEventTowerRequest(
      account,
      pass(2, 101, level.levelId, { UseTime: 1 }),
    );
    const earned = level.fixedAwards.find(
      ({ award }) => award.slice(0, 4).join("-") === "15-54-1-1",
    )!.award[4];
    const player = current(repository);
    expect(task(player, 64, catalog.levelKey(tower, level.levelId))).toBe(1);
    expect(task(player, 64, 2804)).toBe(earned);
    expect(money(player, 29)).toBe(earned);
    // VariegatedTowerLogic:OnGetTower is empty: no server score in the reply.
    const info = await repository.handleEventTowerRequest(
      account,
      request(53, [101, 2]),
    );
    expect(info.response).toEqual({ TowerId: 101 });
  });

  it("records node tower stars, the act score, SP records and finished nodes", async () => {
    const { repository } = await fixture({ vigour: 1_000 });
    const actLevels = [1, 2, 3];
    for (const id of actLevels) {
      await repository.handleEventTowerRequest(account, enter(4, 3, id, 1));
      await repository.handleEventTowerRequest(
        account,
        pass(4, 3, id, { nScore: 100 }, 8, 1),
      );
      if (id < 3) expect(task(current(repository), 9, 3000 + 50 + 1)).toBe(0);
    }
    let player = current(repository);
    expect(task(player, 9, 3100 + 1)).toBe(8);
    expect(task(player, 9, 3000 + 4)).toBe(300);
    expect(task(player, 9, 3000 + 50 + 1)).toBe(1);
    expect(money(player, 14)).toBe(2 + 4 + 7);

    // The SP nodes of the 0.1.3 tables hold star goal levels (type 3): goals pay as in a small tower.
    const goals = catalog.goals.get("3:18")!;
    expect(goals.length).toBeGreaterThan(0);
    await repository.handleEventTowerRequest(account, enter(4, 3, 18, 10));
    const goalResult = await repository.handleEventTowerRequest(
      account,
      pass(
        4,
        3,
        18,
        goals.map((_, index) => index === 0),
        0,
        10,
      ),
    );
    expect(goalResult.response).toMatchObject({ newGoalIds: [goals[0]!.id] });
    player = current(repository);
    expect(task(player, 9, 30000 + 18)).toBe(goals[0]!.points);
    expect(task(player, 9, 30000 + 18 * 100 + goals[0]!.id)).toBe(1);
    expect(task(player, 9, 3100 + 18)).toBe(1);
    expect(task(player, 9, 3000 + 50 + 10)).toBe(1);
  });

  it("keeps the best SP score and counts SP clears when a node tower level has type 1", async () => {
    const { repository } = await fixture({ vigour: 1_000 });
    // No level of type 1 exists in the 0.1.3 node tower tables; the Lua still reads these tasks.
    catalog.levels.set("3:900", {
      tower: 3,
      levelId: 900,
      type: 1,
      node: 99,
      cost: 0,
      masterExp: 0,
      cardExp: 0,
      randDropNum: 0,
      firstAwards: [],
      fixedAwards: [],
      randomAwards: [],
    });
    try {
      await repository.handleEventTowerRequest(account, enter(4, 3, 900, 99));
      const first = await repository.handleEventTowerRequest(
        account,
        pass(4, 3, 900, { nScore: 4000, nDamage: 9 }, 8, 99),
      );
      expect(first.response).toMatchObject({ nGetScore: 4000 });
      let player = current(repository);
      expect(task(player, 9, 3000 + 150 + 900)).toBe(4000);
      expect(task(player, 9, 3000 + 450 + 900)).toBe(1);
      expect(task(player, 9, 3000 + 4)).toBe(0); // SP score does not count towards the point rewards
      expect(task(player, 9, 3000 + 50 + 99)).toBe(1);
      await repository.handleEventTowerRequest(account, enter(4, 3, 900, 99));
      await repository.handleEventTowerRequest(
        account,
        pass(4, 3, 900, { nScore: 1500 }, 8, 99),
      );
      player = current(repository);
      expect(task(player, 9, 3000 + 150 + 900)).toBe(4000);
      expect(task(player, 9, 3000 + 450 + 900)).toBe(2);
    } finally {
      catalog.levels.delete("3:900");
    }
  });
});

describe("event tower score screens", () => {
  it("adds swimwear score and exp items to their task values and claims awards", async () => {
    const { store, repository } = await fixture();
    // Level 7: fixed 15-18 x54 (gun exp), 15-19 x18 (clothes exp), 15-17 x18 (score).
    await repository.handleEventTowerRequest(account, enter(7, 2, 7));
    await repository.handleEventTowerRequest(account, pass(7, 2, 7, { UseTime: 30 }));
    let player = current(repository);
    expect(task(player, 34, 102)).toBe(18);
    expect(task(player, 34, 104)).toBe(54);
    expect(task(player, 34, 103)).toBe(18);
    expect(task(player, 34, 7)).toBe(1);
    expect(player.inventory.some((item) => item.genre === 15)).toBe(false);

    const get = await repository.handleEventTowerRequest(account, request(53, [2, 7]));
    expect(get.response).toEqual({
      TowerId: 2,
      tbExpParam: { nSwimServerScore: 18, nAllSwimServerScore: 2_000_000_000 },
    });
    expect(
      (await repository.handleEventTowerRequest(account, request(61, { nTowerId: 2 })))
        .response,
    ).toEqual({
      nTowerId: 2,
      Score: 18,
    });

    const low = await repository.handleEventTowerRequest(
      account,
      request(62, { nTowerId: 2, Index: 1 }),
    );
    expect(low.rejected?.code).toBe(8);
    expect(low.response).toEqual({ nTowerId: 2, nError: 8 });
    const none = await repository.handleEventTowerRequest(
      account,
      request(62, { nTowerId: 2, Index: 0 }),
    );
    expect(none.rejected?.code).toBe(12);

    await store.update((state) => {
      state.players[account]!.taskValues[String(makeTowerTaskId(34, 102))] = 150;
    });
    const all = await repository.handleEventTowerRequest(
      account,
      request(62, { nTowerId: 2, Index: 0 }),
    );
    expect(all.rejected).toBeNull();
    // Orders 1 (60) and 2 (140) are reached.
    expect((all.response as { tbAward: number[][] }).tbAward).toEqual([
      [7, 2, 5, 1, 20, 100],
      [9, 16, 1, 1, 5, 100],
    ]);
    player = current(repository);
    expect(task(player, 34, 200 + 1)).toBe(1);
    expect(task(player, 34, 200 + 2)).toBe(1);
    expect(task(player, 34, 200 + 3)).toBe(0);
    const twice = await repository.handleEventTowerRequest(
      account,
      request(62, { nTowerId: 2, Index: 1 }),
    );
    expect(twice.rejected?.code).toBe(13);

    // The server-wide awards need floor(1000 * score / 2000000000) >= Score, as the client shows them.
    const server = await repository.handleEventTowerRequest(
      account,
      request(63, { nTowerId: 2, Index: 1 }),
    );
    expect(server.rejected?.code).toBe(8);
    await store.update((state) => {
      state.players[account]!.taskValues[String(makeTowerTaskId(34, 102))] =
        500_000_000;
    });
    const granted = await repository.handleEventTowerRequest(
      account,
      request(63, { nTowerId: 2, Index: 1 }),
    );
    expect(granted.rejected).toBeNull();
    expect(task(current(repository), 34, 150 + 1)).toBe(1);
    expect(money(current(repository), 3)).toBe(50);
  });

  it("refuses score awards for a tower without any", async () => {
    const { repository } = await fixture();
    const result = await repository.handleEventTowerRequest(
      account,
      request(62, { nTowerId: 1, Index: 1 }),
    );
    expect(result.rejected?.code).toBe(12);
  });

  it("claims node tower point rewards once, all reached or by id", async () => {
    const { store, repository } = await fixture();
    const nothing = await repository.handleEventTowerRequest(
      account,
      request(176, { activeId: 3 }),
    );
    expect(nothing.rejected?.code).toBe(12);
    expect(nothing.response).toEqual({ res: false });
    await store.update((state) => {
      state.players[account]!.taskValues[String(makeTowerTaskId(9, 3004))] = 3200;
    });
    const early = await repository.handleEventTowerRequest(
      account,
      request(176, { activeId: 3, rewardIds: [3] }),
    );
    expect(early.response).toEqual({ res: false });
    const one = await repository.handleEventTowerRequest(
      account,
      request(176, { activeId: 3, rewardIds: [2] }),
    );
    expect(one.response).toMatchObject({ res: true });
    expect(task(current(repository), 9, 3020 + 2)).toBe(1);
    const rest = await repository.handleEventTowerRequest(
      account,
      request(176, { activeId: 3 }),
    );
    // Rewards 1 (1000) and 3 would be 5000: only reward 1 is reached and unclaimed.
    expect((rest.response as { Reward: number[][] }).Reward).toEqual([
      [15, 1, 1, 1, 3000, 100],
    ]);
    expect(money(current(repository), 2)).toBe(3000);
    const empty = await repository.handleEventTowerRequest(
      account,
      request(176, { activeId: 3 }),
    );
    expect(empty.response).toEqual({ res: false });
  });
});

describe("event tower lottery", () => {
  async function withTokens(wallet: number, count = 1_000) {
    const made = await fixture();
    await made.store.update((state) => {
      state.players[account]!.money.push({ id: wallet, count });
    });
    return made;
  }
  const draw = (tower: number, type: number, pond: number) =>
    request(177, { TowerId: tower, nType: type, nPondId: pond });
  const reset = (tower: number, pond: number) =>
    request(178, { TowerId: tower, nPondId: pond });

  it("draws with the tower's own currency and records the slots", async () => {
    const { repository } = await withTokens(21);
    const result = await repository.handleEventTowerRequest(account, draw(7, 1, 1), {
      random: () => 0,
    });
    expect(result.rejected).toBeNull();
    // Slot 1 is the pool's key item.
    expect(result.response).toEqual({ nTowerId: 7, nPondId: 1, tbItem: [1] });
    const player = current(repository);
    expect(money(player, 21)).toBe(980);
    expect(task(player, 9, 3500 + 200 + 1)).toBe(1);
    const slots = catalog.pondSlots(7, 1)!;
    expect(
      player.inventory.some(
        (item) =>
          item.genre === slots[0]!.award[0] && item.detail === slots[0]!.award[1],
      ),
    ).toBe(true);

    const ten = await repository.handleEventTowerRequest(account, draw(7, 2, 1), {
      random: (max) => max - 1,
    });
    expect((ten.response as { tbItem: number[] }).tbItem).toHaveLength(10);
    expect(money(current(repository), 21)).toBe(780);
    const records = slots.map((_, index) =>
      task(current(repository), 9, 3500 + 200 + index + 1),
    );
    expect(records.reduce((a, b) => a + b, 0)).toBe(11);
    for (const [index, slot] of slots.entries())
      expect(records[index]).toBeLessThanOrEqual(slot.count);
  });

  it("refuses a wrong pool, too few tokens or an empty pool and keeps the save", async () => {
    const { store, repository } = await withTokens(14, 10);
    const before = JSON.stringify(current(repository));
    const cases: [EventTowerRequest, number][] = [
      [draw(3, 1, 2), 2],
      [draw(3, 3, 1), 2],
      [draw(3, 1, 1), 8], // costs 20, has 10
      [reset(3, 1), 2],
    ];
    for (const [entry, code] of cases) {
      const result = await repository.handleEventTowerRequest(account, entry);
      expect(result.rejected?.code).toBe(code);
      expect(result.response).toEqual({ nTowerId: 3, nError: code });
    }
    expect(JSON.stringify(current(repository))).toBe(before);

    await store.update((state) => {
      const player = state.players[account]!;
      player.money.find((m) => m.id === 14)!.count = 1_000;
      catalog.pondSlots(3, 1)!.forEach((slot, index) => {
        player.taskValues[String(makeTowerTaskId(9, 3000 + 200 + index + 1))] =
          slot.count;
      });
    });
    const empty = await repository.handleEventTowerRequest(account, draw(3, 1, 1));
    expect(empty.rejected?.code).toBe(9);
  });

  it("moves on to the next pool when the key item or the whole pool is drawn", async () => {
    const { repository } = await withTokens(14);
    const early = await repository.handleEventTowerRequest(account, reset(3, 1));
    expect(early.rejected?.code).toBe(2);
    await repository.handleEventTowerRequest(account, draw(3, 1, 1), {
      random: () => 0,
    });
    const next = await repository.handleEventTowerRequest(account, reset(3, 1));
    expect(next.response).toEqual({ nResult: 0, nPondId: 2 });
    expect(task(current(repository), 9, 3005)).toBe(2);
    // Pool 1 is no longer the current one.
    const stale = await repository.handleEventTowerRequest(account, draw(3, 1, 1));
    expect(stale.rejected?.code).toBe(2);
    const fresh = await repository.handleEventTowerRequest(account, draw(3, 1, 2), {
      random: () => 0,
    });
    expect(fresh.rejected).toBeNull();
    expect(task(current(repository), 9, 3000 + 200 + 20 + 1)).toBe(1);
  });

  it("repeats the last pool in place and counts the resets", async () => {
    const { store, repository } = await withTokens(14);
    const slots = catalog.pondSlots(3, 8)!;
    await store.update((state) => {
      const player = state.players[account]!;
      player.taskValues[String(makeTowerTaskId(9, 3005))] = 8;
      slots.forEach((slot, index) => {
        player.taskValues[String(makeTowerTaskId(9, 3000 + 200 + 7 * 20 + index + 1))] =
          slot.count;
      });
    });
    const again = await repository.handleEventTowerRequest(account, reset(3, 8));
    expect(again.response).toEqual({ nResult: 0, nPondId: 8 });
    const player = current(repository);
    expect(task(player, 9, 3005)).toBe(8);
    expect(task(player, 9, 3006)).toBe(1);
    expect(task(player, 9, 3000 + 200 + 7 * 20 + 1)).toBe(0);
    const drawn = await repository.handleEventTowerRequest(account, draw(3, 1, 8), {
      random: () => 0,
    });
    expect(drawn.rejected).toBeNull();
  });

  it("keeps the twentieth tower's pool in its own group and wallet", async () => {
    const { repository } = await withTokens(82, 5000);
    const result = await repository.handleEventTowerRequest(
      account,
      request(177, { TowerId: 20, nType: 1, nPondId: 1 }),
      { random: () => 0 },
    );
    expect(result.response).toEqual({ nTowerId: 20, nPondId: 1, tbItem: [1] });
    const player = current(repository);
    expect(money(player, 82)).toBe(4800);
    expect(task(player, 96, 1201 + 200 + 1)).toBe(1);
  });
});
