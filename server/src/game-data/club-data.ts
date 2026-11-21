import type { BaseAward } from "./chapter-config.js";
import { dailySignUpOperationalDate } from "./daily-sign-up-data.js";

/**
 * Offline clubs (clans). The player creates a club that lives in the save; six
 * simulated clubmates keep it alive. Reply shapes follow the client Lua
 * (ClubCommon, LuaCall Club_* handlers, UI_Club*, MissionManager).
 */

export const LUA_COMMAND_CLUB_CREATE = 10_001;
export const LUA_COMMAND_CLUB_INFO = 10_002;
export const LUA_COMMAND_CLUB_DISCOVER = 10_003;
export const LUA_COMMAND_CLUB_FIND = 10_004;
export const LUA_COMMAND_CLUB_APPLY = 10_005;
export const LUA_COMMAND_CLUB_AGREE = 10_006;
export const LUA_COMMAND_CLUB_IGNORE = 10_007;
export const LUA_COMMAND_CLUB_NOTICE = 10_008;
export const LUA_COMMAND_CLUB_CHANGE_POSITION = 10_009;
export const LUA_COMMAND_CLUB_HEADER_CHANGE = 10_010;
export const LUA_COMMAND_CLUB_KICK = 10_011;
export const LUA_COMMAND_CLUB_QUIT = 10_012;
export const LUA_COMMAND_CLUB_MODIFY_APPLY = 10_014;
export const LUA_COMMAND_CLUB_DAILY_AWARD = 10_020;
export const LUA_COMMAND_CLUB_DISSOLVE = 10_022;
export const LUA_COMMAND_CLUB_SEND_MAIL = 10_026;
export const LUA_COMMAND_CLUB_MEMBERS = 10_027;
export const LUA_COMMAND_CLUB_APPLY_LIST = 10_028;
export const LUA_COMMAND_CLUB_LOG = 10_029;
export const LUA_COMMAND_CLUB_CANCEL_APPLY = 10_100;

/** Club boss commands: ClubBossTime has ended, so the client never sends them. */
export const CLUB_BOSS_COMMANDS: ReadonlySet<number> = new Set([
  10_015, 10_016, 10_017, 10_018, 10_019, 10_023, 10_024, 10_025, 10_032,
]);

export const CLUB_COMMANDS: ReadonlySet<number> = new Set([
  LUA_COMMAND_CLUB_CREATE,
  LUA_COMMAND_CLUB_INFO,
  LUA_COMMAND_CLUB_DISCOVER,
  LUA_COMMAND_CLUB_FIND,
  LUA_COMMAND_CLUB_APPLY,
  LUA_COMMAND_CLUB_AGREE,
  LUA_COMMAND_CLUB_IGNORE,
  LUA_COMMAND_CLUB_NOTICE,
  LUA_COMMAND_CLUB_CHANGE_POSITION,
  LUA_COMMAND_CLUB_HEADER_CHANGE,
  LUA_COMMAND_CLUB_KICK,
  LUA_COMMAND_CLUB_QUIT,
  LUA_COMMAND_CLUB_MODIFY_APPLY,
  LUA_COMMAND_CLUB_DAILY_AWARD,
  LUA_COMMAND_CLUB_DISSOLVE,
  LUA_COMMAND_CLUB_SEND_MAIL,
  LUA_COMMAND_CLUB_MEMBERS,
  LUA_COMMAND_CLUB_APPLY_LIST,
  LUA_COMMAND_CLUB_LOG,
  LUA_COMMAND_CLUB_CANCEL_APPLY,
]);

/** sFunction names of UI_ClubTask (MissionManager:ReqGetAward), answered with MissionMgrMsg. */
export const CLUB_MISSION_CLAIM_METHOD = "ClubMissionGetAward";
export const CLUB_TIER_CLAIM_METHOD = "ClubProgressGetAward";
/** MissionMgrMsg nMission values of the two claims (MissionManager.lua:663). */
export const CLUB_MISSION_REPLY_TYPE = 5;
export const CLUB_TIER_REPLY_TYPE = 6;
/** ui.Error.<code> texts the client formats with "Mission". */
export const CLUB_MISSION_ERROR_UNKNOWN = 20_002;
export const CLUB_MISSION_ERROR_NOT_DONE = 20_003;
export const CLUB_MISSION_ERROR_CLAIMED = 20_005;

/** Money 11: club coin, item 15-14 (UI_ItemNormal shows me:GetMoney(11)); the club shop 20006 prices are 11|N. */
export const MONEY_CLUB_COIN = 11;
export const CLUB_COIN_ITEM_DETAIL = 14;
/** ClubLevels CreateFee "03|250": 250 diamonds (the client also counts paid diamonds). */
export const CLUB_CREATE_FEE = 250;

const ITEM_GENRE_MONEY = 15;
/** 15-12 ClubActivePointAuto: weekly activity points of the club (primary.weektaskvalue). */
const ACTIVE_POINT_ITEM_DETAIL = 12;
/** 15-13 ClubExpAuto: club exp. */
const CLUB_EXP_ITEM_DETAIL = 13;
/** 15-36 ItemAddClubBossFightTimeAuto: task (1, 552). */
const BOSS_TIMES_ITEM_DETAIL = 36;

export const CLUB_MISSION_TASK_GROUP = 5;
/** MissionManager.ClubCompleteAward_TaskId: bits 1..5 = weekly tiers claimed. */
export const CLUB_TIER_TASK_ID = 51_001;
/** Task (1, 28): time the player last left a club (UI_Search rejoin countdown). */
export const CLUB_QUIT_TIME_TASK_ID = (1 << 16) | 28;
/** Task (1, 40): time of the dissolve request. */
export const CLUB_DISSOLVE_TIME_TASK_ID = (1 << 16) | 40;
/** Task (1, 552): extra club boss attempts today. */
export const CLUB_BOSS_TIMES_TASK_ID = (1 << 16) | 552;
/** Task (1, 35): day of the last daily reward; the client writes it (UI_ClubReward:76). */
export const CLUB_DAILY_AWARD_DAY_TASK_ID = (1 << 16) | 35;
/** LuaCall.RequestPlayerInfo: UI_ClubMember sends it when a member's head is tapped. */
export const LUA_COMMAND_REQUEST_PLAYER_INFO = 101;
/** LuaCall.ItemBox_Open: server push of the "items received" popup, [[G, D, P, L, N], ...]. */
export const LUA_COMMAND_ITEM_BOX_OPEN = 75;
/** Achievement 2050 "create or join any club" (achieveType 106, group 6). */
export const CLUB_ACHIEVEMENT_TYPE = 106;

/** ClubCommon.lua:8 and UI_ClubMember: the dissolve countdown is 3 days minus one second. */
export const CLUB_DISSOLVE_WAIT_SECONDS = 86_400 * 3 - 1;

export const CLUB_POSITION_HEADER = 9;
export const CLUB_POSITION_VICE = 8;
export const CLUB_POSITION_MEMBER = 0;
const MAX_VICES = 2;
const MAX_LOG_ENTRIES = 50;
const MAX_NOTICE_LENGTH = 200;
const MAX_NAME_WIDTH = 24;

export const CLUB_LOG_CREATED = 1;
export const CLUB_LOG_AUTO_JOINED = 2;
export const CLUB_LOG_KICKED = 5;
export const CLUB_LOG_POSITION = 6;
export const CLUB_LOG_NOTICE = 8;
export const CLUB_LOG_LEVEL = 10;
export const CLUB_LOG_DISSOLVE_REQUESTED = 11;
export const CLUB_LOG_DISSOLVE_CANCELLED = 12;

export interface ClubLevelDefinition {
  level: number;
  /** Cumulative exp needed to reach this level. */
  exp: number;
  memberLimit: number;
  dailyAwards: readonly BaseAward[];
}

/** ClubLevels.txt of the 0.1.3 setting.u (same bytes as EN 1.0.9). */
export const CLUB_LEVELS: readonly ClubLevelDefinition[] = [
  {
    level: 1,
    exp: 0,
    memberLimit: 30,
    dailyAwards: [
      [15, 14, 1, 1, 5],
      [15, 1, 1, 1, 2_000],
    ],
  },
  {
    level: 2,
    exp: 10_000,
    memberLimit: 32,
    dailyAwards: [
      [15, 14, 1, 1, 5],
      [15, 1, 1, 1, 3_000],
    ],
  },
  {
    level: 3,
    exp: 20_000,
    memberLimit: 34,
    dailyAwards: [
      [15, 14, 1, 1, 6],
      [15, 1, 1, 1, 3_000],
    ],
  },
  {
    level: 4,
    exp: 30_000,
    memberLimit: 36,
    dailyAwards: [
      [15, 14, 1, 1, 6],
      [15, 1, 1, 1, 4_000],
    ],
  },
  {
    level: 5,
    exp: 50_000,
    memberLimit: 38,
    dailyAwards: [
      [15, 14, 1, 1, 7],
      [15, 1, 1, 1, 4_000],
    ],
  },
  {
    level: 6,
    exp: 70_000,
    memberLimit: 40,
    dailyAwards: [
      [15, 14, 1, 1, 7],
      [15, 1, 1, 1, 5_000],
    ],
  },
  {
    level: 7,
    exp: 90_000,
    memberLimit: 43,
    dailyAwards: [
      [15, 14, 1, 1, 8],
      [15, 1, 1, 1, 5_000],
    ],
  },
  {
    level: 8,
    exp: 110_000,
    memberLimit: 45,
    dailyAwards: [
      [15, 14, 1, 1, 8],
      [15, 1, 1, 1, 6_000],
    ],
  },
  {
    level: 9,
    exp: 130_000,
    memberLimit: 47,
    dailyAwards: [
      [15, 14, 1, 1, 9],
      [15, 1, 1, 1, 6_000],
    ],
  },
  {
    level: 10,
    exp: 150_000,
    memberLimit: 50,
    dailyAwards: [
      [15, 14, 1, 1, 9],
      [15, 1, 1, 1, 7_000],
    ],
  },
];

export interface ClubMissionDefinition {
  id: number;
  target: number;
  awards: readonly BaseAward[];
}

export const CLUB_MISSION_VIGOUR = 50_004;
export const CLUB_MISSION_KILLS = 50_008;
export const CLUB_MISSION_ELITES = 50_009;
export const CLUB_MISSION_BOUNTY = 50_010;
export const CLUB_MISSION_COFFEE = 50_011;
export const CLUB_MISSION_CARD_DRAWS = 50_012;
export const CLUB_MISSION_WEAPON_DRAWS = 50_013;
export const CLUB_MISSION_GIFTS = 50_014;
export const CLUB_MISSION_ACTIVE_100 = 50_019;
export const CLUB_MISSION_DAILY_AWARD = 50_024;

/**
 * The weekly ClubMission.txt rows of the 0.1.3 setting.u that the client lists
 * (missionType 0 and no end date). 50024 is not in EN 1.0.9.
 */
export const CLUB_MISSIONS: readonly ClubMissionDefinition[] = [
  {
    id: 50_004,
    target: 1_500,
    awards: [
      [15, 14, 1, 1, 15],
      [15, 12, 1, 1, 30],
      [15, 13, 1, 1, 30],
    ],
  },
  {
    id: 50_008,
    target: 4_000,
    awards: [
      [15, 14, 1, 1, 15],
      [15, 12, 1, 1, 30],
      [15, 13, 1, 1, 30],
    ],
  },
  {
    id: 50_009,
    target: 200,
    awards: [
      [15, 14, 1, 1, 15],
      [15, 12, 1, 1, 30],
      [15, 13, 1, 1, 30],
    ],
  },
  {
    id: 50_010,
    target: 15,
    awards: [
      [15, 14, 1, 1, 25],
      [15, 12, 1, 1, 50],
      [15, 13, 1, 1, 50],
    ],
  },
  {
    id: 50_011,
    target: 3_000,
    awards: [
      [15, 14, 1, 1, 15],
      [15, 12, 1, 1, 30],
      [15, 13, 1, 1, 30],
    ],
  },
  {
    id: 50_012,
    target: 10,
    awards: [
      [15, 14, 1, 1, 10],
      [15, 12, 1, 1, 10],
      [15, 13, 1, 1, 10],
    ],
  },
  {
    id: 50_013,
    target: 10,
    awards: [
      [15, 14, 1, 1, 10],
      [15, 12, 1, 1, 10],
      [15, 13, 1, 1, 10],
    ],
  },
  {
    id: 50_014,
    target: 20,
    awards: [
      [15, 14, 1, 1, 10],
      [15, 12, 1, 1, 20],
      [15, 13, 1, 1, 20],
    ],
  },
  {
    id: 50_019,
    target: 4,
    awards: [
      [15, 14, 1, 1, 20],
      [15, 12, 1, 1, 40],
      [15, 13, 1, 1, 40],
    ],
  },
  {
    id: 50_024,
    target: 5,
    awards: [
      [7, 2, 7, 5, 1],
      [15, 12, 1, 1, 20],
      [15, 13, 1, 1, 20],
    ],
  },
];

export interface ClubTierDefinition {
  id: number;
  points: number;
  awards: readonly BaseAward[];
}

/** ClubMissionAward.txt: weekly activity tiers, claimed bit n of task (5, 51001). */
export const CLUB_TIERS: readonly ClubTierDefinition[] = [
  { id: 1, points: 500, awards: [[15, 1, 1, 1, 20_000]] },
  { id: 2, points: 1_200, awards: [[15, 14, 1, 1, 30]] },
  { id: 3, points: 2_000, awards: [[15, 14, 1, 1, 60]] },
  { id: 4, points: 3_000, awards: [[15, 14, 1, 1, 100]] },
  { id: 5, points: 4_000, awards: [[15, 2, 1, 1, 100]] },
];

/**
 * Daily points (and club exp) of the simulated clubmates, one value per
 * clubmate, on each operational day the player plays. 540 a day: seven days
 * give 3,780, so tiers 1-4 come from playing every day and tier 5 (4,000) also
 * needs most of the player's own club missions (about 270 a week).
 */
export const CLUBMATE_DAILY_POINTS = [70, 80, 90, 90, 100, 110] as const;
export const CLUBMATE_COUNT = CLUBMATE_DAILY_POINTS.length;

const CLUBMATE_NAMES = [
  "Mika",
  "Hana",
  "Rei",
  "Yuki",
  "Kana",
  "Nao",
  "Aya",
  "Emi",
  "Saki",
  "Rin",
  "Toma",
  "Kai",
  "Jun",
  "Shin",
  "Yuu",
  "Ken",
] as const;
/** Offline time ladder: avoids 0 ("2 months ago") and exactly 3 or 7 days (no text). */
const CLUBMATE_OFFLINE_SECONDS = [
  900, 5_400, 30_000, 100_000, 250_000, 500_000,
] as const;
/** Playable girls 1-16: UI icons exist for every one (CardCommon girl icon). */
const CLUBMATE_GIRL_IDS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
] as const;
const CLUBMATE_ROLE_ID_BASE = 8_800_000;
const CLUB_ID_BASE = 100_000;

export interface ClubMemberState {
  roleId: number;
  name: string;
  /** Added to the player's level for display; clubmates grow with the player. */
  levelOffset: number;
  pos: number;
  girlIconId: number;
  dailyPoints: number;
  weekPoints: number;
  offlineSeconds: number;
  joinTime: number;
}

export interface ClubLogEntry {
  type: number;
  strlist: string[];
  time: number;
}

export interface ClubState {
  id: number;
  name: string;
  notice: string;
  level: number;
  exp: number;
  applyLevel: number;
  autoJoinLevel: number;
  createTime: number;
  /** Operational date (YYYY-MM-DD) of the Monday that starts the current club week. */
  week: string;
  weekTaskValue: number;
  selfWeekPoints: number;
  /** Operational dates of this week on which the clubmates already added points. */
  simulatedDates: string[];
  dailyAwardDate: string;
  reqDissolveTime: number;
  nextMemberIndex: number;
  members: ClubMemberState[];
  log: ClubLogEntry[];
}

export interface ClubPlayer {
  roleId: number;
  name: string;
  level: number;
  taskValues: Record<string, number>;
  club?: ClubState;
  clubEverJoined?: boolean;
}

export class ClubError extends Error {
  constructor(
    readonly reason: string,
    /** Text key for CallClientTip, or null for a silent refusal. */
    readonly tip: string | null = "ui.NotOpen",
  ) {
    super(reason);
    this.name = "ClubError";
  }
}

export function clubTaskId(taskId: number): number {
  return (CLUB_MISSION_TASK_GROUP << 16) | taskId;
}

const CLUB_MISSIONS_BY_ID = new Map(
  CLUB_MISSIONS.map((mission) => [mission.id, mission]),
);
const CLUB_TIERS_BY_ID = new Map(CLUB_TIERS.map((tier) => [tier.id, tier]));

export function clubMission(id: number): ClubMissionDefinition | null {
  return CLUB_MISSIONS_BY_ID.get(id) ?? null;
}

export function clubTier(id: number): ClubTierDefinition | null {
  return CLUB_TIERS_BY_ID.get(id) ?? null;
}

export function clubMissionProgress(value: number): number {
  return Math.max(0, Math.trunc(value / 2));
}

export function hasClaimedClubMission(value: number): boolean {
  return (value & 1) === 1;
}

function clubMissionValue(progress: number, claimed: boolean): number {
  const safe = Math.max(0, Math.min(0x3fffffff, Math.trunc(progress)));
  return safe * 2 + (claimed ? 1 : 0);
}

export function clubOperationalDate(now: number): string {
  return dailySignUpOperationalDate(now);
}

/** The Monday (operational date) of the week that holds this moment. */
export function clubWeek(now: number): string {
  const date = new Date(`${clubOperationalDate(now)}T00:00:00Z`);
  const daysSinceMonday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return date.toISOString().slice(0, 10);
}

export function clubLevelForExp(exp: number): number {
  let level = 1;
  for (const definition of CLUB_LEVELS) {
    if (exp >= definition.exp) level = definition.level;
  }
  return level;
}

export function clubLevelDefinition(level: number): ClubLevelDefinition {
  return (
    CLUB_LEVELS.find((definition) => definition.level === level) ?? CLUB_LEVELS[0]!
  );
}

/** UI_Search GetStringLen: ASCII counts 1, any other character 2. */
export function clubNameWidth(name: string): number {
  let width = 0;
  for (const character of name) width += character.charCodeAt(0) < 0x80 ? 1 : 2;
  return width;
}

function seededIndex(seed: number, salt: number, size: number): number {
  let value =
    (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) + Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
  value ^= value >>> 13;
  value = Math.imul(value, 0x27d4eb2d) >>> 0;
  value ^= value >>> 15;
  // `^` returns a signed 32-bit value: make it unsigned before the modulo.
  return (value >>> 0) % size;
}

function log(club: ClubState, type: number, strlist: string[], time: number): void {
  club.log.push({ type, strlist, time });
  if (club.log.length > MAX_LOG_ENTRIES)
    club.log.splice(0, club.log.length - MAX_LOG_ENTRIES);
}

function makeClubmate(
  club: Pick<ClubState, "id" | "members" | "nextMemberIndex">,
  dailyPoints: number,
  time: number,
): ClubMemberState {
  const index = club.nextMemberIndex++;
  const usedNames = new Set(club.members.map(({ name }) => name));
  const usedGirls = new Set(club.members.map(({ girlIconId }) => girlIconId));
  const names = CLUBMATE_NAMES.filter((name) => !usedNames.has(name));
  const girls = CLUBMATE_GIRL_IDS.filter((girl) => !usedGirls.has(girl));
  return {
    roleId: CLUBMATE_ROLE_ID_BASE + index + 1,
    name: names[seededIndex(club.id, index, names.length)] ?? `Member ${index + 1}`,
    levelOffset: seededIndex(club.id, index + 100, 16) - 5,
    pos: CLUB_POSITION_MEMBER,
    girlIconId: girls[seededIndex(club.id, index + 200, girls.length)] ?? 1,
    dailyPoints,
    weekPoints: 0,
    offlineSeconds: CLUBMATE_OFFLINE_SECONDS[index % CLUBMATE_OFFLINE_SECONDS.length]!,
    joinTime: time,
  };
}

/** Fills the club up to six clubmates; a kicked clubmate is replaced at the next week. */
function recruitClubmates(club: ClubState, time: number, logJoins: boolean): void {
  const used = club.members.map(({ dailyPoints }) => dailyPoints);
  for (const points of CLUBMATE_DAILY_POINTS) {
    const at = used.indexOf(points);
    if (at >= 0) {
      used.splice(at, 1);
      continue;
    }
    if (club.members.length >= CLUBMATE_COUNT) break;
    const member = makeClubmate(club, points, time);
    club.members.push(member);
    if (logJoins) log(club, CLUB_LOG_AUTO_JOINED, [member.name], time);
  }
}

export function addClubExp(club: ClubState, amount: number, time: number): void {
  if (!Number.isFinite(amount) || amount <= 0) return;
  club.exp += Math.trunc(amount);
  const level = clubLevelForExp(club.exp);
  while (club.level < level) {
    club.level += 1;
    log(club, CLUB_LOG_LEVEL, [String(club.level)], time);
  }
}

function resetClubWeek(
  player: ClubPlayer,
  club: ClubState,
  week: string,
  time: number,
): void {
  club.week = week;
  club.weekTaskValue = 0;
  club.selfWeekPoints = 0;
  club.simulatedDates = [];
  for (const member of club.members) member.weekPoints = 0;
  clearClubMissionTasks(player);
  // UI_ClubMember allows dissolve and cancel only for a one-member club: no
  // refill while a dissolve is pending, or the player could not cancel it.
  if (club.reqDissolveTime === 0) recruitClubmates(club, time, true);
}

/**
 * Zeroes the weekly mission values and tier bits. They are set to 0, not
 * deleted: the task sync only sends keys that exist, so a deleted key would
 * keep its old value on the client.
 */
function clearClubMissionTasks(player: ClubPlayer): void {
  for (const mission of CLUB_MISSIONS)
    player.taskValues[String(clubTaskId(mission.id))] = 0;
  player.taskValues[String(clubTaskId(CLUB_TIER_TASK_ID))] = 0;
}

/** Weekly reset only: safe to run inside any progress hook. */
export function reconcileClubWeek(player: ClubPlayer, now: number): boolean {
  const club = player.club;
  if (!club) return false;
  const week = clubWeek(now);
  if (club.week === week) return false;
  resetClubWeek(player, club, week, Math.floor(now / 1_000));
  return true;
}

export type ClubReconcileResult = "unchanged" | "changed" | "dissolved";

/**
 * Daily upkeep at every club reply: weekly reset, the dissolve timer, and the
 * clubmates' points for today (once per operational day the player plays).
 */
export function reconcileClub(player: ClubPlayer, now: number): ClubReconcileResult {
  const club = player.club;
  if (!club) return "unchanged";
  const time = Math.floor(now / 1_000);
  if (
    club.reqDissolveTime > 0 &&
    time >= club.reqDissolveTime + CLUB_DISSOLVE_WAIT_SECONDS
  ) {
    delete player.club;
    player.taskValues[String(CLUB_QUIT_TIME_TASK_ID)] = time;
    player.taskValues[String(CLUB_DISSOLVE_TIME_TASK_ID)] = 0;
    clearClubMissionTasks(player);
    return "dissolved";
  }
  let changed = reconcileClubWeek(player, now);
  const today = clubOperationalDate(now);
  if (!club.simulatedDates.includes(today)) {
    club.simulatedDates.push(today);
    let total = 0;
    for (const member of club.members) {
      member.weekPoints += member.dailyPoints;
      total += member.dailyPoints;
    }
    club.weekTaskValue += total;
    addClubExp(club, total, time);
    changed = true;
  }
  return changed ? "changed" : "unchanged";
}

/** Adds progress to one weekly club mission; nothing without a club. */
export function recordClubMissionProgress(
  player: ClubPlayer,
  missionId: number,
  amount: number,
  now: number,
): boolean {
  if (!player.club) return false;
  const mission = clubMission(missionId);
  if (!mission || !Number.isFinite(amount) || amount <= 0) return false;
  reconcileClubWeek(player, now);
  const key = String(clubTaskId(mission.id));
  const value = player.taskValues[key] ?? 0;
  const progress = clubMissionProgress(value);
  const next = Math.min(mission.target, progress + Math.trunc(amount));
  if (next === progress) return false;
  player.taskValues[key] = clubMissionValue(next, hasClaimedClubMission(value));
  return true;
}

export interface CreateClubRequest {
  name: string;
  applyLevel: number;
  autoJoinLevel: number;
}

function nonNegativeInteger(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0
    ? Math.min(number, 9_999)
    : fallback;
}

function parameterObject(parameters: unknown): Record<string, unknown> {
  if (typeof parameters !== "object" || parameters === null) return {};
  const envelope = parameters as Record<string, unknown>;
  const value = envelope.tbParam ?? parameters;
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function clubParameters(parameters: unknown): Record<string, unknown> {
  return parameterObject(parameters);
}

export function parseCreateClubRequest(parameters: unknown): CreateClubRequest {
  const request = parameterObject(parameters);
  const name = typeof request.clubname === "string" ? request.clubname.trim() : "";
  if (name.length === 0 || clubNameWidth(name) > MAX_NAME_WIDTH)
    throw new ClubError("invalid_name", "ui.Club.namedes");
  return {
    name,
    applyLevel: nonNegativeInteger(request.applylevel, 0),
    autoJoinLevel: nonNegativeInteger(request.autojoinlevel, 0),
  };
}

export function createClubState(
  player: ClubPlayer,
  request: CreateClubRequest,
  now: number,
): ClubState {
  const time = Math.floor(now / 1_000);
  const club: ClubState = {
    id: CLUB_ID_BASE + player.roleId,
    name: request.name,
    notice: "",
    level: 1,
    exp: 0,
    applyLevel: request.applyLevel,
    autoJoinLevel: request.autoJoinLevel,
    createTime: time,
    week: clubWeek(now),
    weekTaskValue: 0,
    selfWeekPoints: 0,
    simulatedDates: [],
    dailyAwardDate: "",
    reqDissolveTime: 0,
    nextMemberIndex: 0,
    members: [],
    log: [],
  };
  log(club, CLUB_LOG_CREATED, [player.name], time);
  recruitClubmates(club, time, false);
  return club;
}

export function setClubNotice(
  player: ClubPlayer,
  notice: unknown,
  now: number,
): string {
  const club = player.club;
  if (!club) throw new ClubError("no_club", "ui.Club.NoClubData");
  if (typeof notice !== "string") throw new ClubError("invalid_notice");
  club.notice = notice.slice(0, MAX_NOTICE_LENGTH);
  log(club, CLUB_LOG_NOTICE, [player.name, club.notice], Math.floor(now / 1_000));
  return club.notice;
}

export function setClubApplyLevels(player: ClubPlayer, parameters: unknown): void {
  const club = player.club;
  if (!club) throw new ClubError("no_club", "ui.Club.NoClubData");
  const request = parameterObject(parameters);
  club.applyLevel = nonNegativeInteger(request.applylevel, club.applyLevel);
  club.autoJoinLevel = nonNegativeInteger(request.autojoinlevel, club.autoJoinLevel);
}

export function changeClubPosition(
  player: ClubPlayer,
  parameters: unknown,
  now: number,
): void {
  const club = player.club;
  if (!club) throw new ClubError("no_club", "ui.Club.NoClubData");
  const request = parameterObject(parameters);
  const member = club.members.find(({ roleId }) => roleId === Number(request.memberid));
  const destination = Number(request.dstpos);
  if (!member) throw new ClubError("unknown_member");
  if (destination !== CLUB_POSITION_VICE && destination !== CLUB_POSITION_MEMBER)
    throw new ClubError("invalid_position");
  if (member.pos === destination) throw new ClubError("same_position");
  if (
    destination === CLUB_POSITION_VICE &&
    club.members.filter(({ pos }) => pos === CLUB_POSITION_VICE).length >= MAX_VICES
  )
    throw new ClubError("vice_limit");
  const source = member.pos;
  member.pos = destination;
  log(
    club,
    CLUB_LOG_POSITION,
    [player.name, member.name, String(source), String(destination)],
    Math.floor(now / 1_000),
  );
}

export function kickClubMember(
  player: ClubPlayer,
  parameters: unknown,
  now: number,
): void {
  const club = player.club;
  if (!club) throw new ClubError("no_club", "ui.Club.NoClubData");
  const roleId = Number(parameterObject(parameters).kickroleid);
  const index = club.members.findIndex((member) => member.roleId === roleId);
  if (index < 0) throw new ClubError("unknown_member");
  const [member] = club.members.splice(index, 1);
  log(club, CLUB_LOG_KICKED, [member!.name, player.name], Math.floor(now / 1_000));
}

/** 10022: dissoslve 1 starts the 3-day countdown, 0 cancels it. */
export function requestClubDissolve(
  player: ClubPlayer,
  parameters: unknown,
  now: number,
): void {
  const club = player.club;
  if (!club) throw new ClubError("no_club", "ui.Club.NoClubData");
  const dissolve = Number(parameterObject(parameters).dissoslve) === 1;
  const time = Math.floor(now / 1_000);
  if (dissolve) {
    if (club.reqDissolveTime > 0) throw new ClubError("already_requested");
    club.reqDissolveTime = time;
    player.taskValues[String(CLUB_DISSOLVE_TIME_TASK_ID)] = time;
    log(club, CLUB_LOG_DISSOLVE_REQUESTED, [player.name], time);
  } else {
    if (club.reqDissolveTime === 0) throw new ClubError("not_requested");
    club.reqDissolveTime = 0;
    player.taskValues[String(CLUB_DISSOLVE_TIME_TASK_ID)] = 0;
    log(club, CLUB_LOG_DISSOLVE_CANCELLED, [player.name], time);
  }
}

export interface ClubAwardSplit {
  normal: BaseAward[];
  activePoints: number;
  exp: number;
  bossTimes: number;
}

/** 15-12, 15-13 and 15-36 change the club or a task; never put them in the bag. */
export function splitClubAwards(awards: readonly BaseAward[]): ClubAwardSplit {
  const split: ClubAwardSplit = { normal: [], activePoints: 0, exp: 0, bossTimes: 0 };
  for (const award of awards) {
    const [genre, detail, particular, templateLevel, count] = award;
    const index = genre === ITEM_GENRE_MONEY && particular === 1 && templateLevel === 1;
    if (index && detail === ACTIVE_POINT_ITEM_DETAIL) split.activePoints += count;
    else if (index && detail === CLUB_EXP_ITEM_DETAIL) split.exp += count;
    else if (index && detail === BOSS_TIMES_ITEM_DETAIL) split.bossTimes += count;
    else split.normal.push(award);
  }
  return split;
}

/** Applies the club part of a split award; returns the awards left for the normal grant. */
export function applyClubAwards(
  player: ClubPlayer,
  awards: readonly BaseAward[],
  now: number,
): BaseAward[] {
  const club = player.club;
  const split = splitClubAwards(awards);
  if (club) {
    club.weekTaskValue += split.activePoints;
    club.selfWeekPoints += split.activePoints;
    addClubExp(club, split.exp, Math.floor(now / 1_000));
  }
  if (split.bossTimes > 0) {
    const key = String(CLUB_BOSS_TIMES_TASK_ID);
    player.taskValues[key] = (player.taskValues[key] ?? 0) + split.bossTimes;
  }
  return split.normal;
}

/** Marks a weekly club mission claimed and returns its awards. */
export function claimClubMission(
  player: ClubPlayer,
  missionId: number,
  now: number,
): BaseAward[] {
  if (!player.club) throw new ClubError("no_club", null);
  const mission = clubMission(missionId);
  if (!mission) throw new ClubError("unknown_mission", null);
  reconcileClubWeek(player, now);
  const key = String(clubTaskId(mission.id));
  const value = player.taskValues[key] ?? 0;
  if (hasClaimedClubMission(value)) throw new ClubError("already_claimed", null);
  if (clubMissionProgress(value) < mission.target)
    throw new ClubError("not_finished", null);
  player.taskValues[key] = clubMissionValue(clubMissionProgress(value), true);
  return [...mission.awards];
}

export function hasClaimedClubTier(player: ClubPlayer, tierId: number): boolean {
  const mask = player.taskValues[String(clubTaskId(CLUB_TIER_TASK_ID))] ?? 0;
  return (mask & (1 << tierId)) !== 0;
}

/** Marks a weekly activity tier claimed and returns its awards. */
export function claimClubTier(
  player: ClubPlayer,
  tierId: number,
  now: number,
): BaseAward[] {
  const club = player.club;
  if (!club) throw new ClubError("no_club", null);
  const tier = clubTier(tierId);
  if (!tier) throw new ClubError("unknown_mission", null);
  reconcileClubWeek(player, now);
  if (hasClaimedClubTier(player, tier.id)) throw new ClubError("already_claimed", null);
  if (club.weekTaskValue < tier.points) throw new ClubError("not_finished", null);
  const key = String(clubTaskId(CLUB_TIER_TASK_ID));
  player.taskValues[key] = (player.taskValues[key] ?? 0) | (1 << tier.id);
  return [...tier.awards];
}

export function clubMissionErrorCode(error: ClubError): number {
  if (error.reason === "already_claimed") return CLUB_MISSION_ERROR_CLAIMED;
  if (error.reason === "not_finished") return CLUB_MISSION_ERROR_NOT_DONE;
  return CLUB_MISSION_ERROR_UNKNOWN;
}

/** 10020: the club's daily welfare, once per server operational day. */
export function claimClubDailyAward(
  player: ClubPlayer,
  now: number,
): BaseAward[] | null {
  const club = player.club;
  if (!club) return null;
  const today = clubOperationalDate(now);
  if (club.dailyAwardDate === today) return null;
  club.dailyAwardDate = today;
  recordClubMissionProgress(player, CLUB_MISSION_DAILY_AWARD, 1, now);
  return [...clubLevelDefinition(club.level).dailyAwards];
}

export interface ClubSelf {
  roleId: number;
  name: string;
  level: number;
  girlIconId: number;
}

function memberPayload(
  member: ClubMemberState,
  playerLevel: number,
  time: number,
): Record<string, unknown> {
  return {
    roleid: member.roleId,
    name: member.name,
    level: Math.max(1, Math.min(120, playerLevel + member.levelOffset)),
    pos: member.pos,
    state: 0,
    girliconid: member.girlIconId,
    headframeid: 0,
    listskinid: 0,
    last7_contribute: member.weekPoints,
    daily_contribute: member.dailyPoints,
    off_times: time - member.offlineSeconds,
    join_date: member.joinTime,
    boss_explore_score: 0,
    clubboss_enter_times: 0,
    today_clubboss_enter_times: 0,
  };
}

function selfPayload(
  club: ClubState,
  self: ClubSelf,
  time: number,
): Record<string, unknown> {
  return {
    roleid: self.roleId,
    name: self.name,
    level: Math.max(1, self.level),
    pos: CLUB_POSITION_HEADER,
    state: 1,
    girliconid: self.girlIconId,
    headframeid: 0,
    listskinid: 0,
    last7_contribute: club.selfWeekPoints,
    daily_contribute: 0,
    off_times: time,
    join_date: club.createTime,
    boss_explore_score: 0,
    clubboss_enter_times: 0,
    today_clubboss_enter_times: 0,
  };
}

export function clubMemberList(
  club: ClubState,
  self: ClubSelf,
  now: number,
): Record<string, unknown>[] {
  const time = Math.floor(now / 1_000);
  return [
    selfPayload(club, self, time),
    ...club.members.map((member) => memberPayload(member, self.level, time)),
  ];
}

/** The full `primary` of ClubCommon.MyClubInfo; 10014 replaces it whole. */
export function clubPrimary(club: ClubState, self: ClubSelf): Record<string, unknown> {
  const vices = club.members.filter(({ pos }) => pos === CLUB_POSITION_VICE);
  return {
    id: club.id,
    name: club.name,
    level: club.level,
    exp: club.exp,
    weektaskvalue: club.weekTaskValue,
    headerid: self.roleId,
    headername: self.name,
    notice: club.notice,
    reqdissolvetime: club.reqDissolveTime,
    applylevel: club.applyLevel,
    autojoinlevel: club.autoJoinLevel,
    send_mail_times: 0,
    count: club.members.length + 1,
    status: 0,
    vice1id: vices[0]?.roleId ?? 0,
    vice2id: vices[1]?.roleId ?? 0,
    data_day: 0,
    data_week: 0,
  };
}

/** Club object of 10001, 10002, 10009, 10011 and 10022; no `clubboss` (the boss is over). */
export function clubPayload(
  club: ClubState,
  self: ClubSelf,
  now: number,
): Record<string, unknown> {
  return {
    primary: clubPrimary(club, self),
    memberlist: clubMemberList(club, self, now),
    applylist: [],
  };
}

/** Newest first, as a log book reads. */
/**
 * Task values for a club reply, without (1, 35): the client writes that day
 * itself right after it sends 10020, and the server's older value in the
 * reply would show the Get button again.
 */
export function clubTaskSyncValues(
  taskValues: Readonly<Record<string, number>>,
): Record<string, number> {
  const values = { ...taskValues };
  delete values[String(CLUB_DAILY_AWARD_DAY_TASK_ID)];
  return values;
}

/** A simulated clubmate has no player card to show. */
export function isClubmateRoleId(
  player: Pick<ClubPlayer, "club">,
  roleId: unknown,
): boolean {
  return (
    player.club?.members.some((member) => member.roleId === Number(roleId)) ?? false
  );
}

export function clubLogPayload(club: ClubState): Record<string, unknown>[] {
  return [...club.log].reverse().map((entry) => ({
    type: entry.type,
    strlist: [...entry.strlist],
    time: entry.time,
  }));
}
