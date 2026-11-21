import { describe, expect, it } from "vitest";

import { AutoUseItemCatalog } from "../src/game-data/auto-use-item-data.js";
import { towerItemWallet } from "../src/game-data/event-tower-data.js";
import { NamedTowerCatalog } from "../src/game-data/named-tower-data.js";
import {
  account,
  current,
  five,
  fixture,
  money,
  named,
  reply,
  task,
} from "./helpers/named-fixture.js";

const towerEnter = (event: number, level: number, formation = 1) =>
  named(426, { nType: 23, nId: event, nLevelId: level, nFormationId: formation });
const towerPass = (event: number, level: number) =>
  named(
    427,
    { nType: 23, nId: event, nLevelId: level, nFormationId: 1, tbKillMonster: {} },
    true,
  );
const discoveryEnter = (level: number, formation = 1, map = 1) =>
  named(421, {
    nType: 22,
    nId: 1,
    nLevelId: level,
    nFormationId: formation,
    nMapId: map,
  });
const discoveryPass = (level: number, goals?: unknown) =>
  named(
    422,
    {
      nType: 22,
      nId: 1,
      nLevelId: level,
      nFormationId: 1,
      tbKillMonster: {},
      tbScore: goals ?? {},
    },
    true,
  );

describe("first Anniversary levels", () => {
  const catalog = NamedTowerCatalog.loadDefault();

  it("splits the shared level file by level type", () => {
    // 70 rows: 12 action and 2 story levels for the tower, 16 SP and 40 fun levels for the map.
    expect(catalog.levels.get("anniversary")!.size).toBe(14);
    expect(catalog.levels.get("discovery")!.size).toBe(56);
    expect(catalog.level("anniversary", 1, 2, 0)?.type).toBe(0);
    expect(catalog.level("anniversary", 1, 1, 0)?.type).toBe(2);
    expect(catalog.level("anniversary", 1, 41, 0)).toBeNull();
    expect(catalog.level("discovery", 1, 41, 0)?.type).toBe(1);
    expect(catalog.level("discovery", 1, 11, 0)?.type).toBe(3);
    expect(catalog.level("discovery", 1, 2, 0)).toBeNull();
    expect(catalog.discoveryGoals.get("1:41")).toHaveLength(10);
    expect(catalog.discoveryGoalRewards.get("1:41")).toHaveLength(10);
  });

  it("pays every wallet currency of the levels: AutoUse coins, power (money 58) and skill points (59)", () => {
    const autoUse = AutoUseItemCatalog.loadDefault();
    const wallets = new Set<number>();
    for (const key of ["anniversary", "discovery"] as const)
      for (const level of catalog.levels.get(key)!.values())
        for (const award of level.fixedAwards.map((entry) => entry.award)) {
          if (award[0] !== 15) continue;
          const wallet = towerItemWallet(award);
          if (wallet !== null) {
            wallets.add(wallet);
            continue;
          }
          const effect = autoUse.effect(award[0], award[1], award[2], award[3]);
          expect(effect?.kind, award.join("-")).toBe("money");
          if (effect?.kind === "money") wallets.add(effect.moneyId);
        }
    // The two shop currencies of the events (AnniversaryTowerTotal MoneyType 56 and 57) and power, points.
    expect(wallets.has(56) && wallets.has(57)).toBe(true);
    expect(wallets.has(58) && wallets.has(59)).toBe(true);
  });

  it("keeps the two families apart: a level of the other family is refused", async () => {
    const { repository } = await fixture();
    const tower = await repository.handleNamedTowerRequest(account, towerEnter(1, 41));
    expect(tower.response).toEqual({ nError: 2 });
    const map = await repository.handleNamedTowerRequest(account, discoveryEnter(2));
    expect(map.response).toEqual({ nError: 2 });
  });
});

describe("anniversary tower, 426 to 428", () => {
  it("enters, charges vigour at the pass, pays power and points and sets the bit of the event", async () => {
    const { repository } = await fixture();
    const entered = await repository.handleNamedTowerRequest(account, towerEnter(1, 2));
    expect(entered.response).toEqual({
      tbData: { nType: 23, nId: 1, nLevelId: 2 },
      tbDrop: [],
      tbDropItems: [],
    });
    expect(money(current(repository), 1)).toBe(100);
    const passed = await repository.handleNamedTowerRequest(account, towerPass(1, 2));
    expect(passed.rejected).toBeNull();
    const player = current(repository);
    expect(money(player, 1)).toBe(90);
    // FixAward [15-84 x25, 15-87 x1, 15-86 x12] at 10000: money 56, skill point 59, power 58.
    expect(money(player, 56)).toBe(25);
    expect(money(player, 59)).toBe(1);
    expect(money(player, 58)).toBe(12);
    // The wallets are pushed with the reply (the discovery screen reads them) and nothing is a dead stack.
    expect([...passed.updatedMoney.map(({ id }) => id)].sort((a, b) => a - b)).toEqual([
      1, 52, 56, 58, 59,
    ]);
    expect(
      player.inventory.some((item) => item.genre === 15 && item.detail === 86),
    ).toBe(false);
    expect(task(player, 81, 1012)).toBe(0b01);
    expect(five(reply(passed).tbData)).toContainEqual([15, 80, 1, 1, 1]);

    // A resend replays the stored reply and pays nothing more.
    const resent = await repository.handleNamedTowerRequest(account, towerPass(1, 2));
    expect(resent.response).toEqual(passed.response);
    expect(money(current(repository), 58)).toBe(12);

    // The second run is no first clear.
    await repository.handleNamedTowerRequest(account, towerEnter(1, 2));
    const again = await repository.handleNamedTowerRequest(account, towerPass(1, 2));
    expect(five(reply(again).tbData)).not.toContainEqual([15, 80, 1, 1, 1]);
    expect(money(current(repository), 58)).toBe(24);
  });

  it("uses bit 1 of the same task for the second event and plays story levels without a formation", async () => {
    const { repository } = await fixture();
    // Level 1 of event 1 is a story: no formation, no vigour.
    const story = await repository.handleNamedTowerRequest(
      account,
      towerEnter(1, 1, 0),
    );
    expect(story.rejected).toBeNull();
    const done = await repository.handleNamedTowerRequest(account, towerPass(1, 1));
    expect(done.rejected).toBeNull();
    expect(five(reply(done).tbData)).toContainEqual([15, 2, 1, 1, 20]);
    expect(money(current(repository), 1)).toBe(100);
    expect(task(current(repository), 81, 1011)).toBe(0b01);

    await repository.handleNamedTowerRequest(account, towerEnter(2, 1));
    await repository.handleNamedTowerRequest(account, towerPass(2, 1));
    expect(task(current(repository), 81, 1011)).toBe(0b11);
  });

  it("answers a failed run with {} and charges the vigour once", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(account, towerEnter(1, 3));
    const failed = await repository.handleNamedTowerRequest(
      account,
      named(428, { nType: 23, nId: 1, nLevelId: 3, nFormationId: 1 }, true),
    );
    expect(failed.response).toEqual({});
    expect(money(current(repository), 1)).toBe(88);
    expect(task(current(repository), 81, 1013)).toBe(0);
  });

  it("refuses without vigour or a formation and leaves the save alone", async () => {
    const { repository } = await fixture({ vigour: 3 });
    const noFormation = await repository.handleNamedTowerRequest(
      account,
      towerEnter(1, 2, 99),
    );
    expect(noFormation.response).toEqual({ nError: 10 });
    const poor = await repository.handleNamedTowerRequest(account, towerEnter(1, 2));
    expect(poor.response).toEqual({ nError: 5 });
    expect(current(repository).namedTower?.run).toBeUndefined();
  });
});

describe("discovery levels, 421 to 423", () => {
  it("pays the goals of an SP level once, sums their points and pays the thresholds crossed", async () => {
    const { repository } = await fixture();
    const entered = await repository.handleNamedTowerRequest(
      account,
      discoveryEnter(41),
    );
    expect(entered.response).toMatchObject({
      tbData: { nType: 22, nId: 1, nLevelId: 41 },
    });
    // tbScore is what the client sends (a Lua array of booleans).
    const first = await repository.handleNamedTowerRequest(
      account,
      discoveryPass(41, [true, true, false, false]),
    );
    expect(first.rejected).toBeNull();
    expect(reply(first).newGoalIds).toEqual([1, 2]);
    const player = current(repository);
    // 81/3002 + 100 + 41: clears; 81/20000 + 41: points; 81/20000 + 41 * 100 + goal: flags.
    expect(task(player, 81, 3143)).toBe(1);
    expect(task(player, 81, 20041)).toBe(20);
    expect(task(player, 81, 24101)).toBe(1);
    expect(task(player, 81, 24102)).toBe(1);
    expect(task(player, 81, 24103)).toBe(0);
    // Thresholds 10 and 20 pay [15-2-1-1-5] each.
    expect(five(reply(first).tbData).filter((row) => row[1] === 2)).toEqual([
      [15, 2, 1, 1, 5],
      [15, 2, 1, 1, 5],
    ]);

    await repository.handleNamedTowerRequest(account, discoveryEnter(41));
    const second = await repository.handleNamedTowerRequest(
      account,
      discoveryPass(41, { 1: true, 2: true, 3: true }),
    );
    expect(reply(second).newGoalIds).toEqual([3]);
    expect(task(current(repository), 81, 20041)).toBe(30);
    expect(task(current(repository), 81, 3143)).toBe(2);
    expect(five(reply(second).tbData).filter((row) => row[1] === 2)).toEqual([
      [15, 2, 1, 1, 5],
    ]);
  });

  it("plays a fun level with the joy formation and pays its first awards once", async () => {
    const { repository } = await fixture();
    const missing = await repository.handleNamedTowerRequest(
      account,
      discoveryEnter(11, 77),
    );
    expect(missing.response).toEqual({ nError: 10 });
    await repository.handleNamedTowerRequest(account, discoveryEnter(11, 5000));
    const passed = await repository.handleNamedTowerRequest(account, discoveryPass(11));
    expect(passed.rejected).toBeNull();
    expect(task(current(repository), 81, 3113)).toBe(1);
    expect(five(reply(passed).tbData)).toContainEqual([15, 1, 1, 1, 5000]);
    const gold = money(current(repository), 2);
    await repository.handleNamedTowerRequest(account, discoveryEnter(11, 5000));
    await repository.handleNamedTowerRequest(account, discoveryPass(11));
    expect(task(current(repository), 81, 3113)).toBe(2);
    expect(money(current(repository), 2)).toBeGreaterThanOrEqual(gold);
  });
});
