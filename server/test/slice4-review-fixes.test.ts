import { describe, expect, it } from "vitest";

import { missionDay } from "../src/game-data/event-mission-data.js";
import { NamedTowerCatalog } from "../src/game-data/named-tower-data.js";
import { ShopCatalog } from "../src/game-data/shop-data.js";
import {
  account,
  current,
  fixture,
  money,
  named,
  reply,
  task,
} from "./helpers/named-fixture.js";

const catalog = NamedTowerCatalog.loadDefault();
const slotKey = (pond: number, index: number): string =>
  String((63 << 16) | (3200 + (pond - 1) * 20 + index + 1));
const gacha = (pond: number) => named(405, { nPondId: pond, nType: 1 });

describe("linkage ponds: stock left counts unlimited slots", () => {
  const token = catalog.linkageToken!;
  const last = Math.max(...catalog.linkagePonds.keys());

  it("draws from a pond whose slots are all unlimited", async () => {
    const lastSlots = catalog.linkagePonds.get(last)!;
    expect(lastSlots.every((slot) => slot.count < 0)).toBe(true);
    const { repository, store } = await fixture({ money: { [token.moneyId]: 50 } });
    // Every earlier pond is drawn out, so the last one is open.
    await store.update((state) => {
      for (const [pond, slots] of catalog.linkagePonds)
        if (pond !== last)
          slots.forEach((slot, index) => {
            state.players[account]!.taskValues[slotKey(pond, index)] = slot.count;
          });
    });
    const result = await repository.handleNamedTowerRequest(account, gacha(last), {
      random: () => 0,
    });
    expect(result.rejected).toBeNull();
    expect((result.response as { tbItem: unknown[] }).tbItem).toHaveLength(1);
    expect(money(current(repository), token.moneyId)).toBe(50 - token.cost);
  });

  it("keeps the last pond locked while an earlier pond has stock, even when only its last slot is drawn out", async () => {
    const { repository, store } = await fixture({ money: { [token.moneyId]: 50 } });
    await store.update((state) => {
      for (const [pond, slots] of catalog.linkagePonds)
        if (pond !== last)
          state.players[account]!.taskValues[slotKey(pond, slots.length - 1)] =
            slots.at(-1)!.count;
    });
    const locked = await repository.handleNamedTowerRequest(account, gacha(last));
    expect(locked.response).toEqual({ nError: 9 });
    expect(locked.rejected?.reason).toBe("pond_locked");
  });

  it("draws from pond 1 when only its last slot is drawn out", async () => {
    const { repository, store } = await fixture({ money: { [token.moneyId]: 50 } });
    const slots = catalog.linkagePonds.get(1)!;
    await store.update((state) => {
      state.players[account]!.taskValues[slotKey(1, slots.length - 1)] =
        slots.at(-1)!.count;
    });
    const result = await repository.handleNamedTowerRequest(account, gacha(1), {
      random: () => 0,
    });
    expect(result.rejected).toBeNull();
    expect(task(current(repository), 63, 3201)).toBe(1);
  });

  it("refuses a pond with nothing left", async () => {
    const { repository, store } = await fixture({ money: { [token.moneyId]: 50 } });
    const slots = catalog.linkagePonds.get(1)!;
    await store.update((state) => {
      slots.forEach((slot, index) => {
        state.players[account]!.taskValues[slotKey(1, index)] = slot.count;
      });
    });
    const empty = await repository.handleNamedTowerRequest(account, gacha(1));
    expect(empty.response).toEqual({ nError: 9 });
  });
});

describe("war chess boss moves", () => {
  const start = { nType: 1, id: 1, mapId: 2, diff: 1, team1: 10, team2: 33 };

  it("answers a boss move onto another boss as done and leaves both bosses in place", async () => {
    const { repository } = await fixture();
    const board = (body: unknown) =>
      repository.handleNamedTowerRequest(account, named(539, body));
    expect(reply(await board(start)).nError).toBeUndefined();
    await board({ nType: 4 });
    // Boss 1 stands on grid 24, boss 2 on grid 23.
    const before = [
      task(current(repository), 97, 500 + 24),
      task(current(repository), 97, 500 + 23),
    ];
    expect(before).toEqual([6, 7]);
    const move = await board({
      nType: 5,
      tbMove: { bossIdx: 1, fromGrid: 24, aimGrid: 23 },
    });
    expect(reply(move).nError).toBeUndefined();
    expect(move.rejected).toBeNull();
    expect([
      task(current(repository), 97, 500 + 24),
      task(current(repository), 97, 500 + 23),
    ]).toEqual(before);
    // Boss 1 counts as moved: boss 2 can move now and the round can end.
    expect(task(current(repository), 97, 206) & (1 << 1)).toBe(2);
    const second = await board({
      nType: 5,
      tbMove: { bossIdx: 2, fromGrid: 23, aimGrid: 18 },
    });
    expect(reply(second).nError).toBeUndefined();
  });
});

describe("event mission counters", () => {
  const concertPass = (level: number) =>
    named(
      372,
      {
        nType: 19,
        nLevelId: level,
        nDiff: 1,
        nFormationId: 1,
        tbKillMonster: { totalkillMonster: 7 },
      },
      true,
    );
  const concertEnter = (level: number) =>
    named(371, { nType: 19, nLevelId: level, nDiff: 1, nFormationId: 1 });

  it("counts the first fight after 04:00 in an open session", async () => {
    const { repository, store } = await fixture();
    await store.update((state) => {
      state.players[account]!.eventMissions = {
        day: missionDay(Date.now()) - 1,
        total: {},
        today: { "clear:1:19": 2 },
      };
    });
    await repository.handleNamedTowerRequest(account, concertEnter(13));
    await repository.handleNamedTowerRequest(account, concertPass(13));
    const missions = current(repository).eventMissions!;
    expect(missions.today["clear:1:19"]).toBe(1);
    expect(missions.today["vigour:70"]).toBeGreaterThan(0);
  });

  it("does not pay a concert challenge mission for a boss challenge clear, but for a buff tower clear", async () => {
    const { repository } = await fixture();
    const claim = () =>
      repository.handleNamedTowerRequest(account, named(374, { Type: 1, nId: 52 }));
    await repository.handleNamedTowerRequest(
      account,
      named(532, { nId: 1, nLevelId: 1, nDiff: 1, nFormationId: 1 }),
    );
    await repository.handleNamedTowerRequest(
      account,
      named(
        533,
        { nType: 28, nId: 1, nLevelId: 1, nDiff: 1, nFormationId: 1, leftHpRate: 1 },
        true,
      ),
    );
    const early = await claim();
    expect(early.rejected?.code).toBe(20003);
    const counters = current(repository).eventMissions!.total;
    expect(counters["diff:85:1:1"]).toBe(1);
    expect(counters["diff:70:1:1"]).toBeUndefined();

    // The concert challenge is the buff tower event 1.
    await repository.handleNamedTowerRequest(
      account,
      named(377, {
        nType: 20,
        nId: 1,
        nLevelId: 1,
        nDiff: 1,
        nFormationId: 1,
        tbBuffs: [],
      }),
    );
    await repository.handleNamedTowerRequest(
      account,
      named(
        378,
        { nType: 20, nId: 1, nLevelId: 1, nDiff: 1, nFormationId: 1, tbBuffs: [] },
        true,
      ),
    );
    const paid = await claim();
    expect(paid.rejected).toBeNull();
    expect(reply(paid)).toEqual({
      Type: 1,
      tbItem: [
        [15, 2, 1, 1, 20],
        [7, 2, 3, 1, 30],
      ],
    });
  });

  it("pushes the mission tasks after a shop spend", async () => {
    const shops = ShopCatalog.loadDefault();
    // The shop that sells for money 85 (the second anniversary token the missions 18-20 count).
    let shopId = 0;
    for (let id = 30_000; id < 31_000 && shopId === 0; id++)
      if (shops.goodsForShop(id).some((entry) => entry.moneyType === 85)) shopId = id;
    expect(shopId).toBeGreaterThan(0);
    const goods = shops
      .goodsForShop(shopId)
      .find((entry) => entry.moneyType === 85 && (entry.sellingPrice[0] ?? 0) > 0);
    expect(goods).toBeDefined();
    const { repository } = await fixture({ money: { 85: 1_000_000 } });
    const result = await repository.buyShopGoods(
      account,
      shops,
      shopId,
      goods!.goodsId,
      1,
      new Date("2021-12-01T12:00:00+08:00").getTime(),
    );
    expect(result.taskValuesChanged).toBe(true);
    expect(result.price).toBeGreaterThan(0);
    const total = current(repository).eventMissions!.total["spent:85"];
    expect(total).toBe(result.price);
    // Mission 18 (spend 20 of money 85) shows the progress now, not at the next fight.
    expect(task(current(repository), 85, 18) >>> 1).toBe(Math.min(total!, 20) || total);
  });
});

describe("concert exchange listing counter", () => {
  it("starts again with the day when the hub opens, without a 381", async () => {
    const { repository, store } = await fixture();
    await store.update((state) => {
      const player = state.players[account]!;
      player.eventMissions = { day: missionDay(Date.now()) - 1, total: {}, today: {} };
      player.taskValues[String((74 << 16) | 4)] = 5;
      (player.eventMissions as { exchangeDay?: number }).exchangeDay =
        missionDay(Date.now()) - 1;
    });
    const refreshed = await repository.handleNamedTowerRequest(account, named(380, {}));
    expect(refreshed.response).toEqual({ tbData: [] });
    expect(task(current(repository), 74, 4)).toBe(0);
  });
});

describe("war chess: a lost team leaves the grid", () => {
  it("removes the team of a lost fight so no boss targets it again", async () => {
    const { repository } = await fixture();
    const chess = (body: Record<string, unknown>) =>
      repository.handleNamedTowerRequest(account, named(539, body));
    await chess({ nType: 1, id: 1, mapId: 1, diff: 1, team1: 15, team2: 29 });
    await chess({ nType: 3, teamId: 1, gridId: 16 });
    await chess({ nType: 4 });
    // The boss at grid 12 attacks team 1 at grid 16 and the server pushes the fight.
    await chess({ nType: 5, tbMove: { bossIdx: 1, fromGrid: 12, aimGrid: 16 } });
    expect(task(current(repository), 97, 500 + 16)).toBe(3);
    const lost = await repository.handleNamedTowerRequest(
      account,
      named(538, { nId: 2, nLevelId: 25, nFormationId: 5106, bossLeftHp: 40 }, true),
    );
    expect(lost.rejected).toBeNull();
    const player = current(repository);
    expect(task(player, 97, 204)).toBe(0);
    expect(task(player, 97, 300 + 1)).toBe(40);
    expect(task(player, 97, 500 + 16)).toBe(0);
    // Team 2 is still on the board.
    expect(task(player, 97, 500 + 29)).toBe(4);
  });
});
