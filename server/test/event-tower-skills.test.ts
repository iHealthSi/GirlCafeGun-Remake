import { afterEach, describe, expect, it } from "vitest";

import {
  EventTowerCatalog,
  LUA_COMMAND_UPGRADE_TOWER_SKILL,
  TOWER_LAYOUTS,
  eventTowerErrorReply,
  parseEventTowerCall,
} from "../src/game-data/event-tower-data.js";
import {
  TowerFixture,
  account,
  giveStack,
  money,
  stack,
  task,
  towerRequest,
} from "./helpers/event-tower-fixture.js";

const catalog = EventTowerCatalog.loadDefault();
const fixtures = new TowerFixture();
afterEach(() => fixtures.cleanup());

const upgrade = (tower: number, skill: number) => towerRequest(527, [tower, skill]);

describe("tower skill tables and requests", () => {
  it("read the twentieth and twenty-first tower skills with their upgrade items and costs", () => {
    const twentieth = catalog.skills.get(20)!;
    const twentyFirst = catalog.skills.get(21)!;
    expect(twentieth.size).toBeGreaterThan(0);
    expect(twentyFirst.size).toBeGreaterThan(0);
    for (const skill of twentieth.values()) {
      expect(skill.item).toEqual([15, 121, 1, 1]);
      expect(skill.costs).toEqual([10, 20, 30, 40, 50]);
    }
    expect(twentyFirst.get(1)).toMatchObject({
      skillId: 18055,
      item: [15, 126, 1, 1],
      costs: [100, 200, 300, 400, 500],
    });
    // No other class has a skill table.
    expect([...catalog.skills.keys()].sort()).toEqual([20, 21]);
  });

  it("put the twenty-first tower in 96 / 1801 / 60000 like TwentyFirstTowerLogic and serve its id", () => {
    expect(TOWER_LAYOUTS.TwentyFirstTower).toMatchObject({
      group: 96,
      levelBase: 1801,
      goalBase: 60000,
      offset: 1701,
      progress: "score",
    });
    expect(catalog.towers.get(21)?.className).toBe("TwentyFirstTower");
    expect(parseEventTowerCall({ sCmd: 53, tbParam: [21, 4] })?.request).toEqual({
      command: 53,
      towerId: 21,
    });
  });

  it("keep every goal flag of the twenty-first tower inside the 16-bit task key", () => {
    for (const [key, goals] of catalog.goals) {
      const [tower, level] = key.split(":").map(Number);
      if (tower !== 21) continue;
      for (const goal of goals) {
        const flag = 60000 + level! * 100 + goal.id;
        expect(flag).toBeLessThanOrEqual(0xffff);
      }
    }
  });

  it("read 527 from the two skill screens only", () => {
    expect(parseEventTowerCall({ sCmd: 527, tbParam: [21, 3] })?.request).toEqual({
      command: LUA_COMMAND_UPGRADE_TOWER_SKILL,
      towerId: 21,
      skillId: 3,
    });
    expect(parseEventTowerCall({ sCmd: 527, tbParam: [20, 2] })?.request).toMatchObject(
      {
        towerId: 20,
      },
    );
    for (const tower of [19, 3, 999])
      expect(parseEventTowerCall({ sCmd: 527, tbParam: [tower, 1] })).toBeNull();
    expect(parseEventTowerCall({ sCmd: 527, tbParam: {} })).toBeNull();
    expect(eventTowerErrorReply(upgrade(21, 1), 8)).toEqual({ nError: 8 });
  });
});

describe("tower skill upgrades", () => {
  it("spend the upgrade item and raise the level, up to the end of the cost list", async () => {
    const { repository } = await fixtures.create({
      setup: (player) => giveStack(player, [15, 126, 1, 1], 1_600),
    });
    const levelKey = 1701 + 10 + 1;
    let paid = 0;
    for (const [level, cost] of [100, 200, 300, 400, 500].entries()) {
      const result = await repository.handleEventTowerRequest(account, upgrade(21, 1));
      expect(result.rejected).toBeNull();
      expect(result.response).toEqual({ isOk: 1, skillId: 1 });
      paid += cost;
      const player = repository.get(account)!;
      expect(task(player, 96, levelKey)).toBe(level + 1);
      expect(stack(player, [15, 126, 1, 1])).toBe(1_600 - paid);
      expect(result.updatedItems.map((item) => item.count)).toEqual([1_600 - paid]);
    }
    // At the top the screen shows "already at the top" and nothing is spent.
    const before = JSON.stringify(repository.get(account));
    const top = await repository.handleEventTowerRequest(account, upgrade(21, 1));
    expect(top.response).toEqual({ isOk: 3, skillId: 1 });
    expect(top.rejected).toBeNull();
    expect(JSON.stringify(repository.get(account))).toBe(before);
  });

  it("refuse without enough items or for an unknown skill, and keep the save", async () => {
    const { repository } = await fixtures.create({
      setup: (player) => giveStack(player, [15, 126, 1, 1], 99),
    });
    const before = JSON.stringify(repository.get(account));
    const short = await repository.handleEventTowerRequest(account, upgrade(21, 1));
    expect(short.rejected?.code).toBe(8);
    expect(short.response).toEqual({ nError: 8 });
    const unknown = await repository.handleEventTowerRequest(account, upgrade(21, 999));
    expect(unknown.rejected?.code).toBe(2);
    expect(unknown.response).toEqual({ nError: 2 });
    expect(JSON.stringify(repository.get(account))).toBe(before);
  });

  it("use the twentieth tower's own item and level slots (offset 1201)", async () => {
    const { repository } = await fixtures.create({
      setup: (player) => giveStack(player, [15, 121, 1, 1], 30),
    });
    const first = await repository.handleEventTowerRequest(account, upgrade(20, 1));
    expect(first.response).toEqual({ isOk: 1, skillId: 1 });
    const second = await repository.handleEventTowerRequest(account, upgrade(20, 1));
    expect(second.response).toEqual({ isOk: 1, skillId: 1 });
    const player = repository.get(account)!;
    expect(task(player, 96, 1201 + 10 + 1)).toBe(2);
    expect(task(player, 96, 1701 + 10 + 1)).toBe(0);
    expect(stack(player, [15, 121, 1, 1])).toBe(0);
  });
});

describe("twenty-first tower fights", () => {
  const enter = (level: number, formation = 1) =>
    towerRequest(54, [4, 21, 0, level, formation]);
  const pass = (level: number, report: unknown) =>
    towerRequest(55, [4, 21, 0, level, 1, report, null, [], 0], true);

  it("plays the opening story, an action level and a star goal level", async () => {
    const { repository } = await fixtures.create();
    // EP1 (type 2) needs no formation and pays only its first award.
    expect(
      (await repository.handleEventTowerRequest(account, enter(1, 0))).rejected,
    ).toBeNull();
    const story = await repository.handleEventTowerRequest(account, pass(1, true));
    expect(story.rejected).toBeNull();
    expect(task(repository.get(account)!, 96, 1801 + 1)).toBe(1);
    expect(money(repository.get(account)!, 3)).toBe(20);

    // ACT1 (level 2): vigour 10, FixAward 15-126 x10 (a plain stack) and 15-127 x15 (wallet 87).
    await repository.handleEventTowerRequest(account, enter(2));
    const act = await repository.handleEventTowerRequest(
      account,
      pass(2, { nScore: 321 }),
    );
    expect(act.rejected).toBeNull();
    const player = repository.get(account)!;
    expect(task(player, 96, 1801 + 2)).toBe(321);
    expect(money(player, 1)).toBe(90);
    expect(stack(player, [15, 126, 1, 1])).toBe(10);
    expect(money(player, 87)).toBe(15);

    // Level 18 is a star goal level: goal flags and points at 60000 + level * 100 + goal.
    await repository.handleEventTowerRequest(account, enter(18));
    const star = await repository.handleEventTowerRequest(
      account,
      pass(18, [true, false, true]),
    );
    expect(star.rejected).toBeNull();
    expect((star.response as { newGoalIds: number[] }).newGoalIds).toEqual([1, 3]);
    const after = repository.get(account)!;
    expect(task(after, 96, 60000 + 18 * 100 + 1)).toBe(1);
    expect(task(after, 96, 60000 + 18 * 100 + 2)).toBe(0);
    expect(task(after, 96, 60000 + 18 * 100 + 3)).toBe(1);
    expect(task(after, 96, 60000 + 18)).toBeGreaterThan(0);
  });
});
