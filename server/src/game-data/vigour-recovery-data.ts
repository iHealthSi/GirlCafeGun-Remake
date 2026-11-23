import { getPlayerMaxVigour } from "./player-level-data.js";

export const VIGOUR_RECOVERY_TIME_TASK_ID = (1 << 16) | 16;
export const VIGOUR_RECOVERY_INTERVAL_SECONDS = 360;
export const ENERGY_EXCHANGE_COUNT_TASK_ID = (1 << 16) | 12;
export const GOLD_EXCHANGE_COUNT_TASK_ID = (1 << 16) | 13;

export const MAX_VIGOUR = 9_999;
export const MAX_GOLD = 999_999_999;
export const MONEY_RIKI_COIN = 61;

export const MONEY_EXCHANGE_ERROR_NONE = 0;
export const MONEY_EXCHANGE_ERROR_INVALID = 1;
export const MONEY_EXCHANGE_ERROR_NOT_ENOUGH_DIAMOND = 20_013;
export const MONEY_EXCHANGE_ERROR_NO_TIMES = 20_020;
export const MONEY_EXCHANGE_ERROR_GOLD_MAX = 20_022;
export const MONEY_EXCHANGE_ERROR_VIGOUR_MAX = 20_025;

export interface ExchangeStep {
  readonly cost: number;
  readonly gain: number;
}

/**
 * Exact EnergyExchange.txt tiers (1-indexed purchase count 1..20).
 */
export const ENERGY_EXCHANGE_TIERS: readonly ExchangeStep[] = [
  { cost: 25, gain: 60 },
  { cost: 25, gain: 60 },
  { cost: 50, gain: 60 },
  { cost: 50, gain: 60 },
  { cost: 75, gain: 90 },
  { cost: 75, gain: 90 },
  { cost: 100, gain: 120 },
  { cost: 100, gain: 120 },
  { cost: 100, gain: 120 },
  { cost: 100, gain: 120 },
  ...Array.from({ length: 10 }, () => ({ cost: 120, gain: 120 })),
];

/**
 * Exact GoldExchange.txt tiers (1-indexed purchase count 1..20).
 */
export const GOLD_EXCHANGE_TIERS: readonly ExchangeStep[] = Array.from(
  { length: 20 },
  () => ({ cost: 20, gain: 15_000 }),
);

/**
 * Exact ItemList.txt ExtParam2 values for energy restore consumables (10-1-1-L).
 */
export const ENERGY_ITEM_VIGOUR_BY_LEVEL: Readonly<Record<number, number>> = {
  1: 10,
  2: 30,
  3: 60,
};

export interface VigourRecoveryTarget {
  level: number;
  money: { id: number; count: number }[];
  taskValues: Record<string, number>;
}

export interface VigourRecoveryResult {
  recoveredVigour: number;
  taskChanged: boolean;
}

/**
 * Reconciles passive Power regeneration (1 Power per 360s up to level maxVigour)
 * and keeps client countdown task (1, 16) synchronized.
 */
export function reconcileVigourRecovery(
  player: VigourRecoveryTarget,
  moneyVigourId: number,
  now = Date.now(),
): VigourRecoveryResult {
  const nowSec = Math.floor(now / 1_000);
  const maxVigour = getPlayerMaxVigour(player.level);
  let vigour = player.money.find(({ id }) => id === moneyVigourId);
  if (!vigour) {
    vigour = { id: moneyVigourId, count: 0 };
    player.money.push(vigour);
  }
  const taskKey = String(VIGOUR_RECOVERY_TIME_TASK_ID);
  const lastTick = player.taskValues[taskKey] ?? 0;

  if (vigour.count >= maxVigour) {
    if (lastTick !== 0) {
      player.taskValues[taskKey] = 0;
      return { recoveredVigour: 0, taskChanged: true };
    }
    return { recoveredVigour: 0, taskChanged: false };
  }

  if (lastTick <= 0 || lastTick > nowSec) {
    player.taskValues[taskKey] = nowSec;
    return { recoveredVigour: 0, taskChanged: true };
  }

  const ticks = Math.floor((nowSec - lastTick) / VIGOUR_RECOVERY_INTERVAL_SECONDS);
  if (ticks <= 0) {
    return { recoveredVigour: 0, taskChanged: false };
  }

  const recoveredVigour = Math.min(maxVigour - vigour.count, ticks);
  vigour.count += recoveredVigour;
  player.taskValues[taskKey] =
    vigour.count >= maxVigour
      ? 0
      : lastTick + recoveredVigour * VIGOUR_RECOVERY_INTERVAL_SECONDS;
  return { recoveredVigour, taskChanged: true };
}
