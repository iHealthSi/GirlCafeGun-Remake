import { MAX_PLAYER_LEVEL } from "./player-level-data.js";

/**
 * Natural vigour recovery. The client estimates the time to a full bar as
 * six minutes per missing point (Notification.lua, "6 * (LevelMaxSpirit -
 * vigour - 1)"), so the server recovers one point every six minutes.
 *
 * Adapted from World.RecoverVigour and PlayerExpTable in the MIT-licensed
 * SssjServer (see LICENSES/SssjServer-MIT.txt).
 */
export const VIGOUR_RECOVERY_SECONDS = 6 * 60;

/**
 * Exact Spirit column from Player/PlayerExp.txt: the vigour cap of a level.
 * From level 90 onward the value is 150.
 */
const PLAYER_MAX_VIGOUR: readonly number[] = [
  28,
  31,
  34,
  36,
  38,
  40,
  42,
  43,
  45,
  46,
  47,
  49,
  51,
  53,
  55,
  56,
  58,
  60,
  62,
  64,
  66,
  67,
  69,
  71,
  73,
  75,
  76,
  78,
  80,
  82,
  84,
  86,
  87,
  89,
  91,
  93,
  95,
  96,
  98,
  100,
  102,
  104,
  106,
  107,
  109,
  111,
  113,
  115,
  117,
  120,
  121,
  122,
  123,
  124,
  125,
  126,
  127,
  128,
  129,
  130,
  131,
  132,
  133,
  134,
  135,
  136,
  137,
  138,
  139,
  140,
  140,
  141,
  141,
  142,
  142,
  143,
  143,
  144,
  144,
  145,
  145,
  146,
  146,
  147,
  147,
  148,
  148,
  149,
  149,
  ...Array<number>(211).fill(150),
];

if (PLAYER_MAX_VIGOUR.length !== MAX_PLAYER_LEVEL) {
  throw new Error("Invalid embedded PlayerExp vigour configuration");
}

/** Vigour cap for a commander level; out-of-range levels clamp to the table. */
export function maximumVigour(level: number): number {
  const index = Math.min(
    MAX_PLAYER_LEVEL,
    Math.max(1, Number.isSafeInteger(level) ? level : 1),
  );
  return PLAYER_MAX_VIGOUR[index - 1]!;
}

export interface VigourRecoveryResult {
  /** Vigour after recovery. */
  count: number;
  /** Unix seconds up to which recovery has been paid out. */
  recoveredAt: number;
  /** Points added by this call. */
  gained: number;
}

/**
 * Pays out the whole six-minute periods since `recoveredAt`.
 *
 * - At or above the cap nothing is added and the clock restarts, so recovery
 *   after the next spend starts from that spend. Vigour above the cap (level-up
 *   refills, rewards) is never reduced.
 * - A save without a clock, or with a clock in the future, starts counting now.
 * - The unused part of a period is kept for the next call.
 */
export function recoverVigour(
  count: number,
  level: number,
  recoveredAt: number | undefined,
  nowSeconds: number,
): VigourRecoveryResult {
  const maximum = maximumVigour(level);
  if (count >= maximum) return { count, recoveredAt: nowSeconds, gained: 0 };
  if (
    recoveredAt === undefined ||
    !Number.isSafeInteger(recoveredAt) ||
    recoveredAt <= 0 ||
    recoveredAt >= nowSeconds
  ) {
    return { count, recoveredAt: nowSeconds, gained: 0 };
  }

  const periods = Math.floor((nowSeconds - recoveredAt) / VIGOUR_RECOVERY_SECONDS);
  if (periods <= 0) return { count, recoveredAt, gained: 0 };

  const gained = Math.min(periods, maximum - count);
  const next = count + gained;
  return {
    count: next,
    recoveredAt:
      next >= maximum ? nowSeconds : recoveredAt + periods * VIGOUR_RECOVERY_SECONDS,
    gained,
  };
}
