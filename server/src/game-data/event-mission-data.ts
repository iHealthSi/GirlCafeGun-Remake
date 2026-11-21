/**
 * The event missions of the concert (MusicMission.lua, task group 70, LuaCall 374)
 * and of the anniversary events (MonthMission.lua, task group 85, LuaCall 436).
 *
 * Both screens read one task value per mission: group, key = missionId, value =
 * progress * 2 + claimed (MissionManager:GetTaskPro / GetTaskAward). A mission is
 * done when progress reaches missionMax[assistparam[1]] (CheckInfoState). The
 * server answers the claim, and it raises the progress of the missions whose
 * AchieveType (Mission/AchieveType.txt) the tower code can feed: counters in
 * `player.eventMissions`, bumped by the music and anniversary fights and by shop
 * purchases, read here. A daily mission (missionType 1) starts again at 04:00
 * Shanghai time. Date windows (startTime/endTime) stay on the client.
 *
 * Tables are in resources/tower/eventmission (byte copies, see provenance.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { AutoUseItemCatalog } from "./auto-use-item-data.js";
import type { BaseAward } from "./chapter-config.js";
import {
  int,
  numbers,
  parseAwards,
  parseTable,
  positional,
  whole,
} from "./event-tower-data.js";

export const LUA_COMMAND_MUSIC_MISSION = 374;
export const LUA_COMMAND_MONTH_MISSION = 436;

export const EVENT_MISSION_GROUP = { music: 70, month: 85 } as const;

/** ui.Error.<code>: "%s is not completed", "%s has claimed the reward", "%s doesn't exist". */
export const MISSION_ERROR = {
  missing: 20002,
  notDone: 20003,
  claimed: 20005,
} as const;

export interface EventMissionRow {
  group: number;
  id: number;
  /** MusicMission missionType: 1 daily, 2 pressing, 3 once. MonthMission: 1 daily, 2 once. */
  kind: number;
  daily: boolean;
  /** AchieveType.txt id. */
  type: number;
  counts: number[];
  assist: number[];
  /** missionMax[assistparam[1]]. */
  required: number;
  awards: BaseAward[];
}

/** What the counters hold, per player. `today` is the part since the last 04:00 (Shanghai). */
export interface EventMissionState {
  day: number;
  total: Record<string, number>;
  today: Record<string, number>;
  /** The day the concert exchange listing counter (task 74/4) was last reset. */
  exchangeDay?: number;
  /** The day the linkage daily mission (AchievementOther) was last reset. */
  linkageDay?: number;
}

export class EventMissionCatalog {
  /** "group:id" to the row. */
  readonly rows = new Map<string, EventMissionRow>();
  /** Money ids that a mission of AchieveType 259 counts spending of (the shops bump only these). */
  readonly spentMoney = new Set<number>();

  private constructor() {}

  static load(directory: string): EventMissionCatalog {
    const catalog = new EventMissionCatalog();
    const files: [string, number][] = [
      ["eventmission/musicmission.txt", EVENT_MISSION_GROUP.music],
      ["eventmission/monthmission.txt", EVENT_MISSION_GROUP.month],
    ];
    for (const [file, group] of files) {
      for (const row of parseTable(readFileSync(path.join(directory, file), "utf8"))) {
        const id = int(row.missionId);
        if (id <= 0) continue;
        const counts = numbers(row.missionMax);
        const assist = numbers(row.assistparam);
        const kind = int(row.missionType);
        const key = assist[0] !== undefined && assist[0] >= 1 ? assist[0] : 1;
        catalog.rows.set(missionKey(group, id), {
          group,
          id,
          kind,
          daily: kind === 1,
          type: int(row.achieveType),
          counts,
          assist,
          required: counts[key - 1] ?? Number.POSITIVE_INFINITY,
          awards: parseAwards(row.awardsList),
        });
        if (int(row.achieveType) === 259 && counts[1] !== undefined)
          catalog.spentMoney.add(counts[1]);
      }
    }
    return catalog;
  }

  static #default: EventMissionCatalog | undefined;

  static loadDefault(): EventMissionCatalog {
    return (EventMissionCatalog.#default ??= EventMissionCatalog.load(
      path.resolve(process.cwd(), "resources/tower"),
    ));
  }

  static #missing = false;

  /** The default tables, or null when they cannot be loaded. */
  static tryLoadDefault(): EventMissionCatalog | null {
    if (EventMissionCatalog.#missing) return null;
    try {
      return EventMissionCatalog.loadDefault();
    } catch {
      EventMissionCatalog.#missing = true;
      return null;
    }
  }

  mission(group: number, id: number): EventMissionRow | null {
    return this.rows.get(missionKey(group, id)) ?? null;
  }
}

export function missionKey(group: number, id: number): string {
  return `${group}:${id}`;
}

/** The mission day changes at 04:00 Shanghai time (UTC+8), that is 20:00 UTC. */
export function missionDay(nowMs: number): number {
  return Math.floor((nowMs / 1000 + 4 * 3600) / 86_400);
}

/** The progress counters this server keeps for the event missions. */
export const MISSION_COUNTER = {
  /** Vigour, kills and level difficulties are counted per mission group: the concert missions (group 70)
   * and the anniversary missions (group 85) belong to different events that share level ids. */
  vigour: (group: number): string => `vigour:${group}`,
  musicGame: "musicgame",
  clear: (issue: number, type: number): string => `clear:${issue}:${type}`,
  special: (issue: number, type: number): string => `sp:${issue}:${type}`,
  level: (issue: number, type: number, level: number): string =>
    `level:${issue}:${type}:${level}`,
  diff: (group: number, level: number, diff: number): string =>
    `diff:${group}:${level}:${diff}`,
  kills: (group: number, issue: number): string => `kills:${group}:${issue}`,
  gain: (money: number): string => `gain:${money}`,
  spent: (money: number): string => `spent:${money}`,
  interest: (issue: number): string => `interest:${issue}`,
  rating: (rating: number): string => `rating:${rating}`,
} as const;

/** The counter a mission of AchieveType `type` reads, or null when it reads a task value or nothing. */
export function missionCounterKey(row: EventMissionRow): string | null {
  const [a = 0, b = 0, c = 0] = row.counts;
  switch (row.type) {
    case 24:
      return MISSION_COUNTER.vigour(row.group);
    case 192:
      return MISSION_COUNTER.clear(a, b);
    case 181:
      return MISSION_COUNTER.special(a, b);
    case 219:
      return MISSION_COUNTER.level(a, b, c);
    case 184:
      return MISSION_COUNTER.diff(row.group, a, b);
    case 183:
      return MISSION_COUNTER.kills(row.group, b);
    case 176:
      return MISSION_COUNTER.gain(b);
    case 259:
      return MISSION_COUNTER.spent(b);
    case 177:
      return MISSION_COUNTER.interest(b);
    case 178:
      return MISSION_COUNTER.musicGame;
    case 191:
      return MISSION_COUNTER.rating(a);
    default:
      return null;
  }
}

export interface EventMissionPlayer {
  eventMissions?: EventMissionState;
  taskValues: Record<string, number>;
  money: { id: number; count: number }[];
  inventory: {
    genre: number;
    detail: number;
    particular: number;
    templateLevel: number;
    count: number;
  }[];
}

export function missionState(player: EventMissionPlayer): EventMissionState {
  return (player.eventMissions ??= { day: 0, total: {}, today: {} });
}

export function bumpMission(player: EventMissionPlayer, key: string, amount = 1): void {
  if (!(amount > 0)) return;
  const state = missionState(player);
  state.total[key] = (state.total[key] ?? 0) + amount;
  state.today[key] = (state.today[key] ?? 0) + amount;
}

/** Counts the money that came in or went out between two wallet snapshots. */
export function bumpWalletChange(
  player: EventMissionPlayer,
  before: ReadonlyMap<number, number>,
): void {
  for (const { id, count } of player.money) {
    const delta = count - (before.get(id) ?? 0);
    if (delta > 0) bumpMission(player, MISSION_COUNTER.gain(id), delta);
  }
}

export function walletSnapshot(player: EventMissionPlayer): Map<number, number> {
  return new Map(player.money.map(({ id, count }) => [id, count]));
}

export function taskKey(group: number, id: number): string {
  return String((group << 16) | id);
}

/** The task value of a mission: progress * 2 + claimed. */
export function missionTaskValue(progress: number, claimed: boolean): number {
  return (
    Math.max(0, Math.min(0x3fffffff, Math.trunc(progress))) * 2 + (claimed ? 1 : 0)
  );
}

export function parseMissionClaim(
  command: number,
  body: unknown,
): { command: number; type: number; ids: number[] } {
  const fields =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  const list = positional(fields.tbList);
  const ids = list
    ? list.map((entry) => whole(entry) ?? 0).filter((id) => id > 0)
    : [whole(fields.nId) ?? 0];
  return { command, type: whole(fields.Type) ?? 1, ids };
}

/** Interest level scores and fight counters live in group 1: First 554-556, Next 557-559. */
export const INTEREST_TASK = {
  first: { gained: 554, played: 555, best: 556 },
  next: { gained: 557, played: 558, best: 559 },
} as const;
export const CONCERT_EXCHANGE_TASK = { group: 74, awardCount: 2 } as const;

function taskNumber(player: EventMissionPlayer, group: number, id: number): number {
  return player.taskValues[taskKey(group, id)] ?? 0;
}

/**
 * What the server can say about a mission's progress, or null when nothing here feeds its type
 * (179 idol support, 180 and 187 and 188 collection trading: those missions stay as they are).
 */
export function missionProgress(
  player: EventMissionPlayer,
  row: EventMissionRow,
): number | null {
  const state = missionState(player);
  const counters = row.daily ? state.today : state.total;
  const key = missionCounterKey(row);
  if (key !== null) return counters[key] ?? 0;
  const [a = 0, b = 0, c = 0, d = 0, e = 0] = row.counts;
  switch (row.type) {
    case 186: {
      // [issue, score]: the best interest score of that issue.
      const interest = a === 1 ? INTEREST_TASK.first : INTEREST_TASK.next;
      return taskNumber(player, 1, interest.best);
    }
    case 189:
      return taskNumber(
        player,
        CONCERT_EXCHANGE_TASK.group,
        CONCERT_EXCHANGE_TASK.awardCount,
      );
    case 45: {
      // [count, G, D, P, L]: wallet currencies (AutoUse coins) count by what came in and what is left.
      const effect = AutoUseItemCatalog.loadDefault().effect(b, c, d, e);
      if (effect?.kind === "money") {
        const wallet = player.money.find(({ id }) => id === effect.moneyId)?.count ?? 0;
        const gained = state.total[MISSION_COUNTER.gain(effect.moneyId)] ?? 0;
        return Math.max(Math.floor(wallet / effect.perItem), gained);
      }
      return player.inventory
        .filter(
          (item) =>
            item.genre === b &&
            item.detail === c &&
            item.particular === d &&
            item.templateLevel === e,
        )
        .reduce((total, item) => total + Math.max(0, item.count), 0);
    }
    default:
      return null;
  }
}

/**
 * Starts the new mission day (counters of the day to zero, daily mission values to zero) and raises
 * every mission's stored progress to what the counters show. Never lowers progress, never touches a
 * claim mark of a mission that did not reset. Returns true when a task value changed.
 */
export function refreshEventMissions(
  player: EventMissionPlayer,
  catalog: EventMissionCatalog,
  nowMs: number = Date.now(),
): boolean {
  const state = missionState(player);
  const day = missionDay(nowMs);
  let changed = false;
  if (state.day !== day) {
    const reset = state.day !== 0;
    state.day = day;
    state.today = {};
    if (reset) {
      for (const row of catalog.rows.values()) {
        const id = taskKey(row.group, row.id);
        if (row.daily && (player.taskValues[id] ?? 0) !== 0) {
          player.taskValues[id] = 0;
          changed = true;
        }
      }
    }
  }
  for (const row of catalog.rows.values()) {
    const derived = missionProgress(player, row);
    if (derived === null) continue;
    const id = taskKey(row.group, row.id);
    const stored = player.taskValues[id] ?? 0;
    const progress = Math.max(stored >>> 1, derived);
    const next = missionTaskValue(progress, (stored & 1) === 1);
    if (next !== stored) {
      player.taskValues[id] = next;
      changed = true;
    }
  }
  return changed;
}
