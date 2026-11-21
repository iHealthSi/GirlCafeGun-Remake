import { describe, expect, it } from "vitest";

import {
  OPEN_EVENT_SHOPS,
  ShopCatalog,
  goodsOpenNow,
  isGoodsInWindow,
  isShopOpen,
  shopEndTime,
  shopOpenNow,
} from "../src/game-data/shop-data.js";
import { account, current, fixture, money } from "./helpers/named-fixture.js";

const catalog = ShopCatalog.loadDefault();
// Diamonds (3 free, 12 paid) and gold (2, 17): what an event shop must never ask for.
const COMMON_MONEY = new Set([2, 3, 12, 17]);
const NOW = new Date("2026-11-21T12:00:00+08:00").getTime();
const NOW_SECONDS = Math.floor(NOW / 1_000);

describe("event shops kept open (OPEN_EVENT_SHOPS)", () => {
  it("are event shops whose goods all cost tokens, never diamonds, gold or nothing", () => {
    expect(OPEN_EVENT_SHOPS.size).toBe(39);
    for (const shopId of OPEN_EVENT_SHOPS) {
      const tab = catalog.getTab(shopId);
      expect(tab, `tab ${shopId}`).not.toBeNull();
      expect(Math.floor(shopId / 10_000)).toBe(3);
      expect(tab!.onOff).toBe(1);
      const goods = catalog.goodsForShop(shopId);
      expect(goods.length, `goods of ${shopId}`).toBeGreaterThan(0);
      for (const config of goods) {
        expect(COMMON_MONEY.has(config.moneyType), `goods ${config.goodsId}`).toBe(
          false,
        );
        expect(config.sellingPrice.length).toBeGreaterThan(0);
        expect(
          Math.min(...config.sellingPrice),
          `goods ${config.goodsId}`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it("leaves the Concert shops closed: one goods of each costs 10 diamonds", () => {
    for (const shopId of [30_013, 30_014]) {
      expect(OPEN_EVENT_SHOPS.has(shopId)).toBe(false);
      const diamond = catalog
        .goodsForShop(shopId)
        .filter(({ moneyType }) => moneyType === 3);
      expect(
        diamond.map(({ goodsId, sellingPrice }) => [goodsId, sellingPrice]),
      ).toEqual([[shopId === 30_013 ? 31_301 : 31_401, [10]]]);
      expect(shopOpenNow(catalog.getTab(shopId)!, NOW_SECONDS)).toBe(false);
    }
    // The diamond and gold shop of the Lida supply activity stays closed too.
    expect(shopOpenNow(catalog.getTab(30_007)!, NOW_SECONDS)).toBe(false);
  });

  it("opens a past event shop and its dated goods, and runs its countdown 30 days ahead", () => {
    const tab = catalog.getTab(30_001)!;
    expect(isShopOpen(tab, NOW_SECONDS)).toBe(false);
    expect(shopOpenNow(tab, NOW_SECONDS)).toBe(true);
    expect(shopEndTime(tab, NOW_SECONDS)).toBe(NOW_SECONDS + 30 * 86_400);
    // Armed survey row 2: its tab starts in 2030.
    expect(shopOpenNow(catalog.getTab(30_012)!, NOW_SECONDS)).toBe(true);
    // First Anniversary goods with dates of their own.
    const dated = catalog.getGoods(32_017)!;
    expect(dated.shopId).toBe(30_020);
    expect(isGoodsInWindow(dated, NOW_SECONDS)).toBe(false);
    expect(goodsOpenNow(dated, NOW_SECONDS)).toBe(true);
    // Other shops keep their dates.
    const permanent = catalog.getTab(20_001)!;
    expect(shopEndTime(permanent, NOW_SECONDS)).toBe(permanent.end ?? 0);
  });

  it("lists and sells an event shop's goods for its token, and refuses the closed Concert shop", async () => {
    const { repository } = await fixture({ money: { 5: 1_000, 6: 1_000 } });
    const list = await repository.getShopGoodsList(account, catalog, 30_001, NOW);
    expect(list.isOpen).toBe(true);
    expect(list.goodsList).toHaveLength(catalog.goodsForShop(30_001).length);
    expect(list.endTime).toBe(NOW_SECONDS + 30 * 86_400);
    const anniversary = await repository.getShopGoodsList(
      account,
      catalog,
      30_020,
      NOW,
    );
    expect(anniversary.goodsList.map(({ goodsid }) => goodsid)).toContain(32_017);

    const goods = catalog
      .goodsForShop(30_001)
      .find(({ moneyType }) => moneyType === 5)!;
    const before = money(current(repository), 5);
    const bought = await repository.buyShopGoods(
      account,
      catalog,
      30_001,
      goods.goodsId,
      1,
      NOW,
    );
    expect(bought.result.isOpen).toBe(true);
    expect(money(current(repository), 5)).toBeLessThan(before);

    const concert = await repository.getShopGoodsList(account, catalog, 30_013, NOW);
    expect(concert).toMatchObject({ isOpen: false, goodsList: [] });
    await expect(
      repository.buyShopGoods(account, catalog, 30_013, 31_301, 1, NOW),
    ).rejects.toThrow();
  });
});
