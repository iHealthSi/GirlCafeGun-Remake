/**
 * ¥: an offline wallet for the gift packs that the original game sold for real
 * money (Purchase/PurchaseIBShop.txt Currency -1, price in CNY).
 *
 * - The wallet is money id 95 (a MoneyDef row that the client recipe
 *   release/client/patch_yen.py adds) and the item 15-200-1-1
 *   (ItemNormalCoinAuto, ExtParam2 95, same recipe) carries it in mail.
 * - A pack costs its Cost column in ¥. The client shows that number next to
 *   the ¥ sprite UI/UI_Shop/charge15_Mul.png.
 * - Every Currency -1 row sells a gift box (IBGiftAuto, ExtParam1 = box id of
 *   Item/ItemBoxInfo.txt). The box is opened here, nested ItemBoxAuto boxes too,
 *   when every entry is Fix. A pack is sold only when every item it opens to has
 *   a rule on this server: genre-8 bag boxes stay in the inventory and are
 *   opened by LuaCall 75/76; BuyRecruitAuto (the 15-day recruit plan) and
 *   IBCycleGiftAuto have no rule, so those packs stay unsold.
 * - Only rows without an EndTime are sold: the other rows were limited-time
 *   offers that the client no longer shows (IBLogic:CheckTime).
 *
 * resources/shop/purchaseibshop.txt and itemboxinfo.txt are byte-exact copies
 * of the 0.1.3 release tables (resources/shop/provenance.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { AutoUseItemCatalog } from "./auto-use-item-data.js";
import type { BaseAward } from "./chapter-config.js";

export const MONEY_YEN = 95;
/** ItemList row 15-200-1-1 (ItemNormalCoinAuto, ExtParam1 1, ExtParam2 95). */
export const YEN_ITEM_DETAIL = 200;
export const YEN_ALLOWANCE = 1000;
export const YEN_ALLOWANCE_CAMPAIGN = "yen-allowance-v1";
export const YEN_ALLOWANCE_AWARD: BaseAward = [
  15,
  YEN_ITEM_DETAIL,
  1,
  1,
  YEN_ALLOWANCE,
];

/** Text keys that release/client/patch_yen.py adds to the language table. */
export const IB_SHOP_ERROR_NOT_ENOUGH_YEN = 20901;
export const IB_SHOP_ERROR_PACK_OFFLINE = 20902;

/** PurchaseIBShop LimitType: 1 day, 2 week, 3 month, 4 account (UI_Charge tbLimitDesc). */
export type YenLimitType = 0 | 1 | 2 | 3 | 4;

export interface YenPack {
  readonly id: number;
  /** ¥. */
  readonly cost: number;
  readonly limitType: YenLimitType;
  readonly limitTimes: number;
  readonly level: number;
  /** What the player gets, boxes opened; null when this server cannot grant it. */
  readonly contents: readonly BaseAward[] | null;
  /** Why contents is null. */
  readonly blocked?: string;
}

const BOX_CLASSES = new Set(["IBGiftAuto", "ItemBoxAuto"]);
/** Genre 15 wallets that awardMoneyId pays before any AutoUse rule (player-repository.ts). */
const WALLET_DETAILS = new Set([1, 2, 4, 10, 11, 20, YEN_ITEM_DETAIL]);

interface AutoUseRow {
  className: string;
  first: number | null;
}

function rows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .slice(3)
    .map((line) => line.split("\t"))
    .filter((fields) => /^\d+$/.test(fields[0] ?? ""));
}

function numbers(text: string): number[] {
  return [...text.matchAll(/\d+/g)].map((match) => Number(match[0]));
}

function key(genre: number, detail: number, particular: number, level: number): string {
  return `${genre}-${detail}-${particular}-${level}`;
}

export class YenPackCatalog {
  static #default: YenPackCatalog | undefined;
  readonly #packs = new Map<number, YenPack>();

  /**
   * @param rules the server's AutoUse rules: an AutoUse item is granted only
   *   when its row has a rule (not "none"), the same test grantAwards applies.
   */
  constructor(
    purchaseIbShop: string,
    itemBoxInfo: string,
    autoUse: string,
    rules: AutoUseItemCatalog,
  ) {
    const auto = new Map<string, AutoUseRow>();
    for (const [g, d, p, l, className, first] of rows(autoUse)) {
      const value = Number.parseInt(first ?? "", 10);
      auto.set(key(Number(g), Number(d), Number(p), Number(l)), {
        className: className ?? "",
        first: Number.isFinite(value) ? value : null,
      });
    }
    const boxes = new Map<number, { award: BaseAward; type: string }[]>();
    for (const [id, gdpln, , type] of rows(itemBoxInfo)) {
      const [g, d, p, l, n] = numbers(gdpln ?? "");
      if (n === undefined) continue;
      const entries = boxes.get(Number(id)) ?? [];
      entries.push({ award: [g!, d!, p!, l!, n], type: type ?? "" });
      boxes.set(Number(id), entries);
    }

    const open = (award: BaseAward, depth: number, out: BaseAward[]): string | null => {
      const [g, d, p, l, n] = award;
      const rule = auto.get(key(g, d, p, l));
      if (!rule) {
        out.push([g, d, p, l, n]);
        return null;
      }
      if (BOX_CLASSES.has(rule.className)) {
        const entries = rule.first === null ? undefined : boxes.get(rule.first);
        if (!entries || depth > 4)
          return `${rule.className} ${key(g, d, p, l)} has no box`;
        for (const entry of entries) {
          if (entry.type !== "Fix")
            return `box ${rule.first} is ${entry.type}, only Fix boxes open here`;
          for (let i = 0; i < n; i += 1) {
            const reason = open(entry.award, depth + 1, out);
            if (reason) return reason;
          }
        }
        return null;
      }
      const effect =
        g === 15 && WALLET_DETAILS.has(d) ? null : rules.effect(g, d, p, l);
      if (effect !== null && effect.kind === "none")
        return `${rule.className} ${key(g, d, p, l)} has no rule`;
      out.push([g, d, p, l, n]);
      return null;
    };

    for (const fields of rows(purchaseIbShop)) {
      // Columns (header row 3): 0 Id, 8 GDPL, 9 Currency, 10 Cost, 16 Level,
      // 19 EndTime, 20 LimitType, 21 LimitTimes.
      if (fields[9] !== "-1" || (fields[19] ?? "") !== "") continue;
      const id = Number(fields[0]);
      const cost = Number.parseInt(fields[10] ?? "", 10);
      const gdpl = numbers(fields[8] ?? "");
      if (!(cost > 0) || gdpl.length !== 5) continue;
      const contents: BaseAward[] = [];
      const blocked = open(gdpl as unknown as BaseAward, 0, contents);
      const limitType = Number.parseInt(fields[20] ?? "", 10);
      this.#packs.set(id, {
        id,
        cost,
        limitType: ([1, 2, 3, 4].includes(limitType) ? limitType : 0) as YenLimitType,
        limitTimes: Number.parseInt(fields[21] ?? "", 10) || 0,
        level: Number.parseInt(fields[16] ?? "", 10) || 0,
        contents: blocked ? null : mergeAwards(contents),
        ...(blocked ? { blocked } : {}),
      });
    }
  }

  static loadDefault(rules = AutoUseItemCatalog.loadDefault()): YenPackCatalog {
    if (YenPackCatalog.#default) return YenPackCatalog.#default;
    const read = (file: string): string =>
      readFileSync(path.resolve(process.cwd(), "resources", file), "utf8");
    YenPackCatalog.#default = new YenPackCatalog(
      read("shop/purchaseibshop.txt"),
      read("shop/itemboxinfo.txt"),
      read("item/autouse.txt"),
      rules,
    );
    return YenPackCatalog.#default;
  }

  pack(id: number): YenPack | undefined {
    return this.#packs.get(id);
  }

  packs(): YenPack[] {
    return [...this.#packs.values()];
  }
}

/** Adds up equal items so the reward window lists each once. */
function mergeAwards(awards: readonly BaseAward[]): BaseAward[] {
  const merged = new Map<string, BaseAward>();
  for (const [g, d, p, l, n] of awards) {
    const k = key(g, d, p, l);
    const old = merged.get(k);
    merged.set(k, [g, d, p, l, (old?.[4] ?? 0) + n]);
  }
  return [...merged.values()];
}
