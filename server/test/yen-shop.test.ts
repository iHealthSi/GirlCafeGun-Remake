import { rm } from "node:fs/promises";
import { mkdtemp } from "./helpers/temp.js";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AutoUseItemCatalog } from "../src/game-data/auto-use-item-data.js";
import { makeIBShopTaskId } from "../src/game-data/ib-shop-data.js";
import { itemBoxCatalog } from "../src/game-data/item-box-data.js";
import {
  IB_SHOP_ERROR_NOT_ENOUGH_YEN,
  IB_SHOP_ERROR_PACK_OFFLINE,
  MONEY_YEN,
  YEN_ALLOWANCE,
  YEN_ALLOWANCE_CAMPAIGN,
  YEN_ITEM_DETAIL,
  YenPackCatalog,
} from "../src/game-data/yen-shop-data.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  IBShopError,
  makeInitialState,
  PlayerRepository,
} from "../src/persistence/player-repository.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createRepository(welcomeGifts = true): Promise<PlayerRepository> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-yen-"));
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
    welcomeGifts,
  });
  await repository.getOrCreate("tester");
  return repository;
}

const NOW = new Date("2026-11-17T12:00:00+08:00").getTime();
const yen = (repository: PlayerRepository): number =>
  repository.get("tester")!.money.find(({ id }) => id === MONEY_YEN)?.count ?? 0;

function allowanceMails(repository: PlayerRepository) {
  return (repository.get("tester")!.mail?.messages ?? []).filter((message) =>
    message.attachments.some(([g, d]) => g === 15 && d === YEN_ITEM_DETAIL),
  );
}

async function claimAllowance(repository: PlayerRepository): Promise<void> {
  const [mail] = allowanceMails(repository);
  await repository.updateMailbox(
    "tester",
    { kind: "claim", ids: [mail!.id], autoDelete: true },
    [],
    NOW,
  );
}

describe("yen pack catalog", () => {
  const catalog = YenPackCatalog.loadDefault();

  it("sells the real-money packs without an end time, and only those", () => {
    const ids = catalog.packs().map(({ id }) => id);
    expect(ids).toHaveLength(22);
    expect(ids).toContain(3);
    expect(ids).not.toContain(12); // free daily pack: Currency -2
    expect(ids).not.toContain(1001); // dress shop
  });

  it("opens the gift box into its items", () => {
    expect(catalog.pack(3)).toMatchObject({
      cost: 128,
      limitType: 4,
      limitTimes: 1,
      contents: [
        [9, 13, 1, 1, 1],
        [7, 10, 1, 4, 1],
      ],
    });
  });

  it("does not sell what this server cannot grant", () => {
    const blocked = catalog
      .packs()
      .filter(({ contents }) => contents === null)
      .map(({ id }) => id)
      .sort((a, b) => a - b);
    expect(blocked).toEqual([131, 181]);
    expect(catalog.pack(131)?.blocked).toMatch(/BuyRecruitAuto/);
    const boxes = itemBoxCatalog();
    for (const id of [1, 89, 172, 173]) {
      expect(
        catalog
          .pack(id)
          ?.contents?.some(
            ([g, d, p, l]) => g === 8 && boxes.boxId([g, d, p, l]) !== null,
          ),
        `${id}: sells an openable bag box`,
      ).toBe(true);
    }
  });
});

describe("yen allowance mail", () => {
  it("arrives once and pays the allowance into the yen wallet", async () => {
    const repository = await createRepository();
    expect(allowanceMails(repository)).toHaveLength(1);
    await repository.getOrCreate("tester", NOW);
    expect(allowanceMails(repository)).toHaveLength(1);
    await claimAllowance(repository);
    expect(yen(repository)).toBe(YEN_ALLOWANCE);
    expect(allowanceMails(repository)).toHaveLength(0);
    await repository.getOrCreate("tester", NOW + 86_400_000);
    expect(allowanceMails(repository)).toHaveLength(0);
    expect(repository.get("tester")!.mail?.deliveredCampaigns).toContain(
      YEN_ALLOWANCE_CAMPAIGN,
    );
  });

  it("reaches an existing save that has no allowance yet", async () => {
    const repository = await createRepository();
    const mailbox = repository.get("tester")!.mail!;
    expect(mailbox.deliveredCampaigns).toContain(YEN_ALLOWANCE_CAMPAIGN);
  });

  it("is not sent without the release welcome gifts", async () => {
    const repository = await createRepository(false);
    expect(allowanceMails(repository)).toHaveLength(0);
  });
});

describe("yen pack purchase", () => {
  it("takes the price, grants the items and counts the purchase", async () => {
    const repository = await createRepository();
    await claimAllowance(repository);
    const result = await repository.buyYenPack("tester", 3, NOW);
    expect(result.yen).toBe(YEN_ALLOWANCE - 128);
    expect(yen(repository)).toBe(YEN_ALLOWANCE - 128);
    expect(result.contents).toEqual([
      [9, 13, 1, 1, 1],
      [7, 10, 1, 4, 1],
    ]);
    expect(result.updatedMoney.map(({ id }) => id)).toContain(MONEY_YEN);
    expect(result.updatedItems.length).toBeGreaterThan(0);
    expect(result.player.taskValues[String(makeIBShopTaskId(3))]).toBe(1);
  });

  it("refuses a second buy of a once-per-account pack, and takes nothing", async () => {
    const repository = await createRepository();
    await claimAllowance(repository);
    await repository.buyYenPack("tester", 3, NOW);
    const before = yen(repository);
    await expect(repository.buyYenPack("tester", 3, NOW)).rejects.toMatchObject({
      reason: "limit_reached",
      clientError: 20075,
    });
    expect(yen(repository)).toBe(before);
  });

  it("refuses when the wallet is short, and takes nothing", async () => {
    const repository = await createRepository();
    const inventory = repository.get("tester")!.inventory.length;
    await expect(repository.buyYenPack("tester", 3, NOW)).rejects.toMatchObject({
      reason: "not_enough_yen",
      clientError: IB_SHOP_ERROR_NOT_ENOUGH_YEN,
    });
    expect(yen(repository)).toBe(0);
    expect(repository.get("tester")!.inventory.length).toBe(inventory);
  });

  it("refuses a pack this server cannot grant, before any change", async () => {
    const repository = await createRepository();
    await claimAllowance(repository);
    await expect(repository.buyYenPack("tester", 131, NOW)).rejects.toMatchObject({
      reason: "pack_offline",
      clientError: IB_SHOP_ERROR_PACK_OFFLINE,
    });
    expect(yen(repository)).toBe(YEN_ALLOWANCE);
    await expect(repository.buyYenPack("tester", 99_999, NOW)).rejects.toBeInstanceOf(
      IBShopError,
    );
  });

  it("resets a monthly limit in the next month", async () => {
    const repository = await createRepository();
    await claimAllowance(repository);
    await repository.buyYenPack("tester", 7, NOW);
    await expect(repository.buyYenPack("tester", 7, NOW)).rejects.toMatchObject({
      reason: "limit_reached",
    });
    const nextMonth = new Date("2026-12-02T12:00:00+08:00").getTime();
    // The client checks the count before it sends a purchase: the login resets it.
    const relogged = await repository.getOrCreate("tester", nextMonth);
    expect(relogged.taskValues[String(makeIBShopTaskId(7))]).toBe(0);
    const result = await repository.buyYenPack("tester", 7, nextMonth);
    expect(result.purchaseCount).toBe(1);
    expect(yen(repository)).toBe(YEN_ALLOWANCE - 2 * 108);
  });

  it("resets a weekly limit at the first login of the next week", async () => {
    const repository = await createRepository();
    await claimAllowance(repository);
    await repository.buyYenPack("tester", 88, NOW);
    const sameWeek = new Date("2026-11-19T12:00:00+08:00").getTime();
    expect(
      (await repository.getOrCreate("tester", sameWeek)).taskValues[
        String(makeIBShopTaskId(88))
      ],
    ).toBe(1);
    const nextWeek = new Date("2026-11-24T12:00:00+08:00").getTime();
    expect(
      (await repository.getOrCreate("tester", nextWeek)).taskValues[
        String(makeIBShopTaskId(88))
      ],
    ).toBe(0);
  });

  it("puts every item of a sellable pack in a wallet, the bag or an AutoUse rule", () => {
    const rules = AutoUseItemCatalog.loadDefault();
    const boxes = itemBoxCatalog();
    for (const pack of YenPackCatalog.loadDefault().packs()) {
      for (const [g, d, p, l] of pack.contents ?? []) {
        const effect = rules.effect(g, d, p, l);
        if (g === 8 && effect === null) {
          expect(
            boxes.boxId([g, d, p, l]),
            `${pack.id}: bag box ${g}-${d}-${p}-${l}`,
          ).not.toBeNull();
          continue;
        }
        if (g === 15 && [1, 2, 4, 10, 11, 20].includes(d)) continue;
        expect(effect?.kind, `${pack.id}: ${g}-${d}-${p}-${l}`).not.toBe("none");
      }
    }
  });

  it("grants every sellable pack with no item left unhandled", async () => {
    const catalog = YenPackCatalog.loadDefault();
    for (const pack of catalog.packs()) {
      if (!pack.contents) continue;
      const repository = await createRepository();
      const player = repository.get("tester")!;
      expect(player).toBeDefined();
      await claimAllowance(repository);
      const result = await repository.buyYenPack("tester", pack.id, NOW);
      expect(result.yen).toBe(YEN_ALLOWANCE - pack.cost);
    }
  });
});
