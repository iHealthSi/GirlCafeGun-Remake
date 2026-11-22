import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp } from "./helpers/temp.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  ENERGY_EXCHANGE_COUNT_TASK_ID,
  GOLD_EXCHANGE_COUNT_TASK_ID,
  MONEY_COFFEE_COIN,
  MONEY_DIAMOND,
  MONEY_GOLD,
  MONEY_RIKI_COIN,
  MONEY_VIGOUR,
  PlayerRepository,
  VIGOUR_RECOVERY_TIME_TASK_ID,
  makeInitialState,
} from "../src/persistence/player-repository.js";
import {
  MAX_VIGOUR,
  MONEY_EXCHANGE_ERROR_NONE,
  MONEY_EXCHANGE_ERROR_NO_TIMES,
  MONEY_EXCHANGE_ERROR_NOT_ENOUGH_DIAMOND,
  MONEY_EXCHANGE_ERROR_VIGOUR_MAX,
} from "../src/game-data/vigour-recovery-data.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  while (tempDirectories.length > 0) {
    const dir = tempDirectories.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function createRepo() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "gcg-vigour-test-"));
  tempDirectories.push(dir);
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
    async close() {},
  };
  const store = new JsonStore({
    filePath: path.join(dir, "state.json"),
    initialState: makeInitialState(),
    logger,
  });
  await store.initialize();
  const repository = new PlayerRepository({
    store,
    defaults: {
      name: "Commander",
      level: 1,
      exp: 0,
      fightPower: 1000,
      serverZone: 8,
      firstLevelComplete: false,
    },
    logger,
    welcomeGifts: false,
  });
  return { repository, store };
}

describe("starter formation and energy generation", () => {
  it("equips only Irene in slot 1 on a new account while keeping all 3 starter cards", async () => {
    const { repository } = await createRepo();
    const player = await repository.getOrCreate("starter");

    expect(player.inventory.filter((item) => item.genre === 1)).toHaveLength(3);
    expect(player.formations[0]?.fightCards.map((slot) => slot.mainCardGuid)).toEqual([
      10_001, 0, 0,
    ]);
  });

  it("recovers 1 Power every 360 seconds up to level maxVigour and preserves partial tick progress", async () => {
    const { repository } = await createRepo();
    const t0 = Date.UTC(2026, 10, 22, 10, 0, 0);
    const created = await repository.getOrCreate("regen", t0);

    expect(created.money.find((m) => m.id === MONEY_VIGOUR)?.count).toBe(28);
    expect(created.taskValues[String(VIGOUR_RECOVERY_TIME_TASK_ID)] ?? 0).toBe(0);

    const afterSpend = await repository.chargeLevelVigour("regen", 8, t0);
    expect(afterSpend.money.find((m) => m.id === MONEY_VIGOUR)?.count).toBe(20);
    expect(afterSpend.taskValues[String(VIGOUR_RECOVERY_TIME_TASK_ID)]).toBe(
      Math.floor(t0 / 1_000),
    );

    const beforeFirstTick = await repository.syncVigourRecovery("regen", t0 + 359_000);
    expect(beforeFirstTick.recoveredVigour).toBe(0);
    expect(beforeFirstTick.taskChanged).toBe(false);

    // 3 full ticks (1080s) + 120s partial progress
    const afterThreeTicks = await repository.syncVigourRecovery(
      "regen",
      t0 + 1_200_000,
    );
    expect(afterThreeTicks.recoveredVigour).toBe(3);
    expect(afterThreeTicks.taskChanged).toBe(true);
    expect(afterThreeTicks.player.money.find((m) => m.id === MONEY_VIGOUR)?.count).toBe(
      23,
    );
    expect(
      afterThreeTicks.player.taskValues[String(VIGOUR_RECOVERY_TIME_TASK_ID)],
    ).toBe(Math.floor(t0 / 1_000) + 1_080);

    // Long elapsed time clamps to level 1 maxVigour (28) and clears countdown task
    const full = await repository.syncVigourRecovery("regen", t0 + 10_000_000);
    expect(full.recoveredVigour).toBe(5);
    expect(full.player.money.find((m) => m.id === MONEY_VIGOUR)?.count).toBe(28);
    expect(full.player.taskValues[String(VIGOUR_RECOVERY_TIME_TASK_ID)]).toBe(0);
  });

  it("consumes energy restore items (10-1-1-1/2/3) and respects MAX_VIGOUR", async () => {
    const { repository, store } = await createRepo();
    const t0 = Date.UTC(2026, 10, 22, 10, 0, 0);
    await repository.getOrCreate("items", t0);
    await repository.chargeLevelVigour("items", 10, t0);

    await store.update((state) => {
      const player = state.players.items!;
      player.inventory.push(
        {
          guid: 30_001,
          genre: 10,
          detail: 1,
          particular: 1,
          templateLevel: 1,
          count: 2,
          createTime: Math.floor(t0 / 1_000),
          enhanceLevel: 0,
          enhanceExp: 0,
          breakLevel: 0,
          lockOn: 0,
        },
        {
          guid: 30_002,
          genre: 10,
          detail: 1,
          particular: 1,
          templateLevel: 3,
          count: 1,
          createTime: Math.floor(t0 / 1_000),
          enhanceLevel: 0,
          enhanceExp: 0,
          breakLevel: 0,
          lockOn: 0,
        },
      );
    });

    const small = await repository.useEnergyItem("items", 30_001, t0 + 10_000);
    expect(small?.error).toBe(MONEY_EXCHANGE_ERROR_NONE);
    expect(small?.addedVigour).toBe(10);
    expect(small?.player.money.find((m) => m.id === MONEY_VIGOUR)?.count).toBe(28);
    expect(small?.player.inventory.find((i) => i.guid === 30_001)?.count).toBe(1);
    expect(small?.player.taskValues[String(VIGOUR_RECOVERY_TIME_TASK_ID)]).toBe(0);

    const large = await repository.useEnergyItem("items", 30_002, t0 + 20_000);
    expect(large?.error).toBe(MONEY_EXCHANGE_ERROR_NONE);
    expect(large?.addedVigour).toBe(60);
    expect(large?.player.money.find((m) => m.id === MONEY_VIGOUR)?.count).toBe(88);
    expect(large?.player.inventory.find((i) => i.guid === 30_002)?.count).toBe(0);

    await store.update((state) => {
      state.players.items!.money.find((m) => m.id === MONEY_VIGOUR)!.count = MAX_VIGOUR;
    });
    const capped = await repository.useEnergyItem("items", 30_001, t0 + 30_000);
    expect(capped?.error).toBe(MONEY_EXCHANGE_ERROR_VIGOUR_MAX);
    expect(capped?.addedVigour).toBe(0);
    expect(capped?.player.inventory.find((i) => i.guid === 30_001)?.count).toBe(1);
  });

  it("handles diamond-to-power, diamond-to-gold, and coffee-to-riki exchanges with daily rollover", async () => {
    const { repository, store } = await createRepo();
    const day1 = Date.UTC(2026, 10, 22, 6, 0, 0);
    const day2 = Date.UTC(2026, 10, 23, 6, 0, 0);
    await repository.getOrCreate("exchange", day1);
    await store.update((state) => {
      const player = state.players.exchange!;
      player.money.find((m) => m.id === MONEY_DIAMOND)!.count = 100;
      player.money.push({ id: MONEY_COFFEE_COIN, count: 2_500 });
    });

    // Power purchase #1 (25 diamonds -> +60 power) and #2+#3 (25+50=75 diamonds -> +120 power)
    const buy1 = await repository.exchangeMoney("exchange", MONEY_VIGOUR, 1, day1);
    expect(buy1.error).toBe(MONEY_EXCHANGE_ERROR_NONE);
    expect(buy1.player.money.find((m) => m.id === MONEY_DIAMOND)?.count).toBe(75);
    expect(buy1.player.money.find((m) => m.id === MONEY_VIGOUR)?.count).toBe(88);
    expect(buy1.player.taskValues[String(ENERGY_EXCHANGE_COUNT_TASK_ID)]).toBe(1);

    const buy23 = await repository.exchangeMoney("exchange", MONEY_VIGOUR, 2, day1);
    expect(buy23.error).toBe(MONEY_EXCHANGE_ERROR_NONE);
    expect(buy23.player.money.find((m) => m.id === MONEY_DIAMOND)?.count).toBe(0);
    expect(buy23.player.money.find((m) => m.id === MONEY_VIGOUR)?.count).toBe(208);
    expect(buy23.player.taskValues[String(ENERGY_EXCHANGE_COUNT_TASK_ID)]).toBe(3);

    const noDiamonds = await repository.exchangeMoney(
      "exchange",
      MONEY_VIGOUR,
      1,
      day1,
    );
    expect(noDiamonds.error).toBe(MONEY_EXCHANGE_ERROR_NOT_ENOUGH_DIAMOND);

    const overDailyLimit = await repository.exchangeMoney(
      "exchange",
      MONEY_VIGOUR,
      18,
      day1,
    );
    expect(overDailyLimit.error).toBe(MONEY_EXCHANGE_ERROR_NO_TIMES);

    // Gold exchange (20 diamonds -> +15,000 gold)
    await store.update((state) => {
      state.players.exchange!.money.find((m) => m.id === MONEY_DIAMOND)!.count = 40;
    });
    const buyGold = await repository.exchangeMoney("exchange", MONEY_GOLD, 2, day1);
    expect(buyGold.error).toBe(MONEY_EXCHANGE_ERROR_NONE);
    expect(buyGold.player.money.find((m) => m.id === MONEY_GOLD)?.count).toBe(30_000);
    expect(buyGold.player.taskValues[String(GOLD_EXCHANGE_COUNT_TASK_ID)]).toBe(2);

    // Riki Coin exchange (1000 coffee coins -> +5 riki coins)
    const buyRiki = await repository.exchangeMoney(
      "exchange",
      MONEY_RIKI_COIN,
      2,
      day1,
    );
    expect(buyRiki.error).toBe(MONEY_EXCHANGE_ERROR_NONE);
    expect(buyRiki.player.money.find((m) => m.id === MONEY_COFFEE_COIN)?.count).toBe(
      500,
    );
    expect(buyRiki.player.money.find((m) => m.id === MONEY_RIKI_COIN)?.count).toBe(10);

    // Daily rollover resets tasks (1, 12) and (1, 13)
    const nextDay = await repository.markLogin("exchange", day2);
    expect(nextDay.taskValues[String(ENERGY_EXCHANGE_COUNT_TASK_ID)]).toBe(0);
    expect(nextDay.taskValues[String(GOLD_EXCHANGE_COUNT_TASK_ID)]).toBe(0);
  });
});
