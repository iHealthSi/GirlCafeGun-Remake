import type { BaseAward } from "./chapter-config.js";
import {
  CLUB_BOSS_LEVEL_UNLIMITED,
  CLUB_BOSS_STAGE_COUNT,
  clubBossStage,
  isClubBossGridOpen,
  type ClubBossStage,
} from "./club-boss-tables.js";
import type { ClubMemberState, ClubSelf, ClubState } from "./club-data.js";
import { dailySignUpOperationalDate } from "./daily-sign-up-data.js";

/**
 * Club boss "Dark Sphere Exploration" for the offline club. Reply shapes
 * follow the client Lua (ClubCommon, LuaCall Club_* handlers, UI_ClubBoss*,
 * ClubBossMain, UI_MissionSuccess); the C# offline server's ClubBossHandler
 * was the first draft. The season calendar is the one of
 * release/client/patch_club_boss.py: the client computes it the same way.
 */

export const LUA_COMMAND_CLUB_BOSS_CHECK_IN = 10_015;
export const LUA_COMMAND_CLUB_BOSS_ENTER = 10_016;
export const LUA_COMMAND_CLUB_BOSS_END = 10_017;
export const LUA_COMMAND_CLUB_BOSS_PARTICIPATE_AWARD = 10_018;
export const LUA_COMMAND_CLUB_BOSS_GRID_AWARD = 10_019;
export const LUA_COMMAND_CLUB_BOSS_RANK = 10_023;
export const LUA_COMMAND_CLUB_BOSS_FIGHTING = 10_024;
export const LUA_COMMAND_CLUB_BOSS_SAVE = 10_025;
export const LUA_COMMAND_CLUB_BOSS_WAY_POINT = 10_032;
/** LuaCall.DoSettle: GameManager.SendInfoToServer wraps 10017 in it. */
export const LUA_COMMAND_DO_SETTLE = 252;

export const CLUB_BOSS_COMMANDS: ReadonlySet<number> = new Set([
  LUA_COMMAND_CLUB_BOSS_CHECK_IN,
  LUA_COMMAND_CLUB_BOSS_ENTER,
  LUA_COMMAND_CLUB_BOSS_END,
  LUA_COMMAND_CLUB_BOSS_PARTICIPATE_AWARD,
  LUA_COMMAND_CLUB_BOSS_GRID_AWARD,
  LUA_COMMAND_CLUB_BOSS_RANK,
  LUA_COMMAND_CLUB_BOSS_FIGHTING,
  LUA_COMMAND_CLUB_BOSS_SAVE,
  LUA_COMMAND_CLUB_BOSS_WAY_POINT,
]);

/** ClubCommon.tbErrorCode. */
export const CLUB_BOSS_OK = 0;
export const CLUB_BOSS_INVALID = 1;
export const CLUB_BOSS_NOT_JOINED = 2;
export const CLUB_BOSS_LOCKED = 3;
export const CLUB_BOSS_NO_AWARD = 4;
export const CLUB_BOSS_CLOSED = 8;
export const CLUB_BOSS_NO_TRIES = 9;
export const CLUB_BOSS_GRID_DONE = 10;

/** Task group 1 keys of ClubCommon.lua:13-24. */
const task = (id: number): string => String((1 << 16) | id);
export const CLUB_BOSS_TOTAL_RUNS_TASK = task(44);
export const CLUB_BOSS_TODAY_RUNS_TASK = task(45);
export const CLUB_BOSS_RUN_DAY_TASK = task(46);
/** 47 + ClubParticipateAward Id: claimed (1..100). */
export const CLUB_BOSS_PARTICIPATE_TASK_BASE = 47;
/** 148 + ClubBossLevel LevelId: pass award claimed (LevelId < 400). */
export const CLUB_BOSS_GRID_AWARD_TASK_BASE = 148;
export const CLUB_BOSS_EXTRA_RUNS_TASK = task(552);
/** Set by the client when it shows the boss (no red dot again today). */
export const CLUB_BOSS_SEEN_TODAY_TASK = task(553);

/** ClubCommon.MAX_TODAY_ENTER_TIME. */
export const CLUB_BOSS_DAILY_RUNS = 3;

/** Calendar: 14-day seasons from Monday 2026-11-16 04:00 UTC+8 (patch_club_boss.py). */
export const CLUB_BOSS_SEASON_ANCHOR = 1_794_772_800;
export const CLUB_BOSS_SEASON_SECONDS = 14 * 86_400;
/** Fights stop (EndTime). */
export const CLUB_BOSS_FIGHT_SECONDS = 11 * 86_400;
/** Grid rewards stop (AwardTime). */
export const CLUB_BOSS_AWARD_SECONDS = 13 * 86_400;

/**
 * Boss score each clubmate adds per day the player plays, per club point of
 * its daily share (CLUBMATE_DAILY_POINTS 70..110): 378,000 a day for six.
 * The route to the last capped boss costs about 1.9 million and the whole
 * capped map about 4.7 million, so the bosses fall on day 5 or 6 and a player
 * who plays every day of the 11 sees about nine tenths of the map explored.
 */
export const CLUBMATE_BOSS_SCORE_PER_POINT = 700;
/** Each simulated clubmate fights three times on each day it plays. */
export const CLUBMATE_BOSS_DAILY_RUNS = 3;

export interface ClubBossSeason {
  index: number;
  stage: number;
  /** Seconds: Show and Begin. */
  start: number;
  /** End of the fights. */
  end: number;
  /** End of grid-reward claims. */
  award: number;
  /** Start of the next season. */
  clear: number;
}

export function clubBossSeason(time: number): ClubBossSeason {
  const index = Math.floor((time - CLUB_BOSS_SEASON_ANCHOR) / CLUB_BOSS_SEASON_SECONDS);
  const start = CLUB_BOSS_SEASON_ANCHOR + index * CLUB_BOSS_SEASON_SECONDS;
  return {
    index,
    stage:
      (((index % CLUB_BOSS_STAGE_COUNT) + CLUB_BOSS_STAGE_COUNT) %
        CLUB_BOSS_STAGE_COUNT) +
      1,
    start,
    end: start + CLUB_BOSS_FIGHT_SECONDS,
    award: start + CLUB_BOSS_AWARD_SECONDS,
    clear: start + CLUB_BOSS_SEASON_SECONDS,
  };
}

export interface ClubBossRun {
  gridId: number;
  levelId: number;
  /** Set by 10017; banked by 10025 true. */
  ended: boolean;
  pass: boolean;
  score: number;
  /** The 10017 request and its answer: a resend of it gets the same answer. */
  endKey?: string;
  endReply?: Record<string, unknown>;
}

export interface ClubBossPath {
  index: number;
  girdid_list: number[];
}

/** The club's map for one season (in ClubState.boss). Keys are role ids. */
export interface ClubBossState {
  season: number;
  stage: number;
  /** Grid id -> explore score. */
  grids: Record<string, number>;
  /** Grid id -> role id -> score added to the grid (grid_log). */
  log: Record<string, Record<string, number>>;
  /** Role id -> season score (boss_explore_score). */
  scores: Record<string, number>;
  /** Role id -> banked runs this season (clubboss_enter_times). */
  runs: Record<string, number>;
  /** Operational date of todayRuns. */
  todayDate: string;
  /** Role id -> runs on todayDate (today_clubboss_enter_times). */
  todayRuns: Record<string, number>;
  /** ClubBossBuff ids of the completed buff grids. */
  buffs: number[];
  /** The leader's way points (attack_path_list). */
  paths: ClubBossPath[];
  /** Operational dates on which the clubmates fought. */
  simulatedDates: string[];
  run?: ClubBossRun;
  /** The 10017 request of the last run that 10025 closed: a late resend gets no answer. */
  lastEndKey?: string;
}

/** What a boss command or the upkeep asks the club code to apply. */
export interface ClubBossOutcome {
  /** The LuaCall tbParam; undefined = no reply. */
  response: unknown;
  /** Awards for the player (participation and pass awards). */
  playerAwards: BaseAward[];
  /** GridAward of every grid completed (club exp): applied to the club only. */
  clubAwards: BaseAward[];
}

interface BossPlayer {
  roleId: number;
  taskValues: Record<string, number>;
  club?: ClubState;
  /**
   * Season of the claim flags (tasks (1, 44..548)). Kept on the player, not
   * the club: a club dissolved and created again in the same season keeps
   * its claims.
   */
  clubBossFlagsSeason?: number;
}

function newState(season: ClubBossSeason, today: string): ClubBossState {
  return {
    season: season.index,
    stage: season.stage,
    grids: {},
    log: {},
    scores: {},
    runs: {},
    todayDate: today,
    todayRuns: {},
    buffs: [],
    paths: [],
    simulatedDates: [],
  };
}

function operationalDay(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
}

/** The season's state, or a blank one when the club has none for it (no write). */
function currentState(
  club: ClubState,
  season: ClubBossSeason,
  today: string,
): ClubBossState {
  return club.boss?.season === season.index ? club.boss : newState(season, today);
}

function add(
  record: Record<string, number>,
  key: number | string,
  amount: number,
): void {
  record[String(key)] = (record[String(key)] ?? 0) + amount;
}

function isCapped(type: number): boolean {
  // ClubCommon: only LevelType 1 and 2 stop at TotalScore (GridPassed); bosses
  // (3) keep their score going past it, the last one (4) has no cap at all.
  return type < 3;
}

/**
 * Adds score to a grid and returns the GridAward when it reaches its total.
 * The buff of a completed grid becomes active for the club.
 */
function scoreGrid(
  state: ClubBossState,
  stage: ClubBossStage,
  gridId: number,
  roleId: number,
  amount: number,
): { added: number; awards: BaseAward[] } {
  const grid = stage.grids.get(gridId)!;
  const level = stage.levels.get(grid.levelId)!;
  const before = state.grids[String(gridId)] ?? 0;
  const after = isCapped(level.type)
    ? Math.min(level.total, before + amount)
    : before + amount;
  const added = after - before;
  if (added <= 0) return { added: 0, awards: [] };
  state.grids[String(gridId)] = after;
  add((state.log[String(gridId)] ??= {}), roleId, added);
  if (before >= level.total || after < level.total) return { added, awards: [] };
  if (level.buffId > 0 && !state.buffs.includes(level.buffId))
    state.buffs.push(level.buffId);
  return { added, awards: grid.award.map((award) => [...award] as BaseAward) };
}

/**
 * The clubmates' fights of one day: each spends its budget along the stage's
 * plan, finishing grids in order; the last boss takes what is left.
 */
function simulateClubmates(
  state: ClubBossState,
  stage: ClubBossStage,
  members: readonly ClubMemberState[],
): BaseAward[] {
  const awards: BaseAward[] = [];
  for (const member of members) {
    let budget = member.dailyPoints * CLUBMATE_BOSS_SCORE_PER_POINT;
    add(state.runs, member.roleId, CLUBMATE_BOSS_DAILY_RUNS);
    state.todayRuns[String(member.roleId)] = CLUBMATE_BOSS_DAILY_RUNS;
    for (const gridId of stage.plan) {
      if (budget <= 0) break;
      const level = stage.levels.get(stage.grids.get(gridId)!.levelId)!;
      const explored = state.grids[String(gridId)] ?? 0;
      const want =
        level.type === CLUB_BOSS_LEVEL_UNLIMITED
          ? budget
          : Math.min(budget, Math.max(0, level.total - explored));
      if (want <= 0) continue;
      const result = scoreGrid(state, stage, gridId, member.roleId, want);
      add(state.scores, member.roleId, result.added);
      budget -= result.added;
      awards.push(...result.awards);
    }
  }
  return awards;
}

/**
 * Season and daily upkeep of the boss; runs at every club request, after the
 * club's own upkeep. A new season starts a new map and clears the claim flags
 * of the last one (set to 0: the task sync only sends keys that exist). Daily:
 * the try counters, then the clubmates fight once per day the player plays.
 * Returns the GridAwards the clubmates earned (club exp).
 */
export function reconcileClubBoss(player: BossPlayer, now: number): BaseAward[] {
  const club = player.club;
  if (!club) return [];
  const time = Math.floor(now / 1_000);
  const season = clubBossSeason(time);
  const today = dailySignUpOperationalDate(now);
  if (club.boss?.season !== season.index) club.boss = newState(season, today);
  if (player.clubBossFlagsSeason !== season.index) {
    player.clubBossFlagsSeason = season.index;
    for (const key of Object.keys(player.taskValues)) {
      const id = Number(key);
      const group = id >>> 16;
      const index = id & 0xffff;
      if (
        group === 1 &&
        index >= CLUB_BOSS_PARTICIPATE_TASK_BASE &&
        index <= CLUB_BOSS_GRID_AWARD_TASK_BASE + 400 &&
        player.taskValues[key] !== 0
      )
        player.taskValues[key] = 0;
    }
    if ((player.taskValues[CLUB_BOSS_TOTAL_RUNS_TASK] ?? 0) !== 0)
      player.taskValues[CLUB_BOSS_TOTAL_RUNS_TASK] = 0;
  }
  const state = club.boss;
  const day = operationalDay(today);
  if (player.taskValues[CLUB_BOSS_RUN_DAY_TASK] !== day) {
    player.taskValues[CLUB_BOSS_RUN_DAY_TASK] = day;
    player.taskValues[CLUB_BOSS_TODAY_RUNS_TASK] = 0;
    player.taskValues[CLUB_BOSS_EXTRA_RUNS_TASK] = 0;
    player.taskValues[CLUB_BOSS_SEEN_TODAY_TASK] = 0;
  }
  if (state.todayDate !== today) {
    state.todayDate = today;
    state.todayRuns = {};
  }
  if (time >= season.end || state.simulatedDates.includes(today)) return [];
  state.simulatedDates.push(today);
  return simulateClubmates(state, clubBossStage(season.stage), club.members);
}

function sumScore(state: ClubBossState): number {
  return Object.values(state.grids).reduce((sum, score) => sum + score, 0);
}

function gridLog(
  state: ClubBossState,
  gridId: number,
  club: ClubState,
  self: ClubSelf,
): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  for (const [roleId, score] of Object.entries(state.log[String(gridId)] ?? {})) {
    const id = Number(roleId);
    const member = club.members.find((mate) => mate.roleId === id);
    // A kicked clubmate's score stays on the grid, not in the log.
    if (id !== self.roleId && !member) continue;
    entries.push({
      roleid: id,
      name: id === self.roleId ? self.name : member!.name,
      score,
      headframeid: 0,
      girliconid: id === self.roleId ? self.girlIconId : member!.girlIconId,
    });
  }
  return entries.sort((a, b) => (b.score as number) - (a.score as number));
}

/** `clubboss` of every club object: the client loads the stage from it. */
export function clubBossPayload(
  club: ClubState,
  self: ClubSelf,
  now: number,
): Record<string, unknown> {
  const season = clubBossSeason(Math.floor(now / 1_000));
  const state = currentState(club, season, dailySignUpOperationalDate(now));
  const stage = clubBossStage(season.stage);
  const bosslist = [...stage.grids.values()]
    .sort((a, b) => a.id - b.id)
    .map((grid) => ({
      gridid: grid.id,
      levelid: grid.levelId,
      explore_score: state.grids[String(grid.id)] ?? 0,
      unknow_score: stage.levels.get(grid.levelId)!.remind,
      grid_log: gridLog(state, grid.id, club, self),
    }));
  return {
    stageid: season.stage,
    bosslist,
    score: sumScore(state),
    attack_path_list: state.paths.map((path) => ({
      index: path.index,
      girdid_list: [...path.girdid_list],
    })),
    active_buff_list: [...state.buffs],
  };
}

/** The boss numbers of one member row (UI_ClubBossMember, UI_ClubBossMap). */
export function clubBossMemberFields(
  club: ClubState,
  roleId: number,
  now: number,
): Record<string, number> {
  const season = clubBossSeason(Math.floor(now / 1_000));
  const today = dailySignUpOperationalDate(now);
  const state = club.boss?.season === season.index ? club.boss : undefined;
  const key = String(roleId);
  return {
    boss_explore_score: state?.scores[key] ?? 0,
    clubboss_enter_times: state?.runs[key] ?? 0,
    today_clubboss_enter_times:
      state && state.todayDate === today ? (state.todayRuns[key] ?? 0) : 0,
  };
}

/** Request tbParam: LuaCall {sCmd, tbParam} or the inner table of DoSettle. */
export function clubBossParameter(parameters: unknown): unknown {
  if (
    typeof parameters === "object" &&
    parameters !== null &&
    !Array.isArray(parameters) &&
    "tbParam" in parameters
  )
    return (parameters as Record<string, unknown>).tbParam;
  return parameters;
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** A positional Lua array: JSON array, or an object with keys "1", "2"... */
function position(value: unknown, index: number): number {
  const raw = Array.isArray(value) ? value[index] : field(value, String(index + 1));
  const number = Number(raw);
  return Number.isSafeInteger(number) ? number : 0;
}

function integerField(value: unknown, key: string): number {
  const number = Number(field(value, key));
  return Number.isFinite(number) ? Math.trunc(number) : 0;
}

function triesLeft(player: BossPlayer): number {
  return (
    CLUB_BOSS_DAILY_RUNS +
    (player.taskValues[CLUB_BOSS_EXTRA_RUNS_TASK] ?? 0) -
    (player.taskValues[CLUB_BOSS_TODAY_RUNS_TASK] ?? 0)
  );
}

function reply(response: unknown): ClubBossOutcome {
  return { response, playerAwards: [], clubAwards: [] };
}

/**
 * Every boss command. The player's club upkeep and reconcileClubBoss ran
 * first. Never throws for a refusal: the client reads nError (an empty reply
 * to 10016 would load the fight).
 */
export function clubBossCommand(
  player: BossPlayer,
  self: ClubSelf,
  command: number,
  parameters: unknown,
  memberList: () => Record<string, unknown>[],
  now: number,
): ClubBossOutcome {
  const club = player.club;
  const time = Math.floor(now / 1_000);
  const season = clubBossSeason(time);
  const parameter = clubBossParameter(parameters);
  const state = club?.boss?.season === season.index ? club.boss : undefined;
  const stage = clubBossStage(season.stage);
  const view = (): Record<string, unknown> => ({
    clubboss: clubBossPayload(club!, self, now),
    memberlist: memberList(),
  });
  switch (command) {
    case LUA_COMMAND_CLUB_BOSS_CHECK_IN:
      // 10015: 2 = "not available" (ClubCommon:OnEnterBossScene).
      if (!club || !state) return reply({ nError: CLUB_BOSS_NOT_JOINED });
      return reply({ nError: CLUB_BOSS_OK, ...view() });
    case LUA_COMMAND_CLUB_BOSS_ENTER: {
      if (!club || !state) return reply({ nError: CLUB_BOSS_NOT_JOINED });
      // ClubCommon:IsClubBossOpen counts EndTime itself as open.
      if (time < season.start || time > season.end)
        return reply({ nError: CLUB_BOSS_CLOSED });
      const gridId = position(parameter, 0);
      const levelId = position(parameter, 1);
      const grid = stage.grids.get(gridId);
      const level = grid && stage.levels.get(grid.levelId);
      if (!grid || !level || grid.levelId !== levelId)
        return reply({ nError: CLUB_BOSS_INVALID });
      if (!isClubBossGridOpen(stage, gridId, (id) => state.grids[String(id)] ?? 0))
        return reply({ nError: CLUB_BOSS_LOCKED });
      if (isCapped(level.type) && (state.grids[String(gridId)] ?? 0) >= level.total)
        return reply({ nError: CLUB_BOSS_GRID_DONE });
      if (triesLeft(player) <= 0) return reply({ nError: CLUB_BOSS_NO_TRIES });
      state.run = { gridId, levelId, ended: false, pass: false, score: 0 };
      return reply({ nError: CLUB_BOSS_OK });
    }
    case LUA_COMMAND_CLUB_BOSS_END: {
      // A pause exit leaves the map at once: an answer would open the end
      // screen (or an error box) on the map the player went back to. The
      // run stays (it used no try; the next 10016 replaces it), so a pause
      // exit the client sends again later cannot drop a newer run.
      if (field(parameter, "bPauseExit") === true) return reply(undefined);
      if (!club) return reply({ nError: CLUB_BOSS_NOT_JOINED });
      const run = state?.run;
      // GameManager.SendInfoToServer sends the result again until an answer
      // in DoSettle clears it: the same request gets the same answer, and one
      // for a run that 10025 already closed gets none.
      const key = JSON.stringify(parameter ?? null);
      if (run?.ended && run.endKey === key) return reply(run.endReply);
      if ((!run || run.ended) && state?.lastEndKey === key) return reply(undefined);
      if (
        !state ||
        !run ||
        run.ended ||
        run.gridId !== integerField(parameter, "nGridId") ||
        run.levelId !== integerField(parameter, "nLevelId")
      )
        return reply({ nError: CLUB_BOSS_INVALID });
      const grid = stage.grids.get(run.gridId)!;
      const level = stage.levels.get(grid.levelId)!;
      // ClubCommon:Pass tops out at PassScore: more did not come from a run.
      run.score = Math.max(0, Math.min(level.pass, integerField(parameter, "nScore")));
      run.pass = field(parameter, "bPass") === true;
      run.ended = true;
      const explored = state.grids[String(run.gridId)] ?? 0;
      run.endKey = key;
      run.endReply = {
        bPass: run.pass,
        nScore: run.score,
        nTotalScore: state.scores[String(self.roleId)] ?? 0,
        nGridScore: isCapped(level.type)
          ? Math.min(level.total, explored + run.score)
          : explored + run.score,
      };
      return reply({ ...run.endReply });
    }
    case LUA_COMMAND_CLUB_BOSS_SAVE: {
      // Always answered: OnSaveDataCallback is what leaves the end screen.
      if (!club || !state) return reply({});
      const run = state.run;
      delete state.run;
      if (run?.endKey) state.lastEndKey = run.endKey;
      const clubAwards: BaseAward[] = [];
      if (parameter === true && run?.ended) {
        const result = scoreGrid(state, stage, run.gridId, self.roleId, run.score);
        clubAwards.push(...result.awards);
        add(state.scores, self.roleId, run.score);
        add(state.runs, self.roleId, 1);
        add(state.todayRuns, self.roleId, 1);
        player.taskValues[CLUB_BOSS_TOTAL_RUNS_TASK] = state.runs[String(self.roleId)]!;
        player.taskValues[CLUB_BOSS_TODAY_RUNS_TASK] =
          (player.taskValues[CLUB_BOSS_TODAY_RUNS_TASK] ?? 0) + 1;
      }
      return {
        response: {
          ...view(),
          myScore: state.scores[String(self.roleId)] ?? 0,
          nEnterTimes: state.runs[String(self.roleId)] ?? 0,
        },
        playerAwards: [],
        clubAwards,
      };
    }
    case LUA_COMMAND_CLUB_BOSS_PARTICIPATE_AWARD: {
      if (!club || !state) return reply({ nError: CLUB_BOSS_NOT_JOINED });
      const runs = state.runs[String(self.roleId)] ?? 0;
      const awards: BaseAward[] = [];
      for (const row of stage.participateAwards) {
        const key = task(CLUB_BOSS_PARTICIPATE_TASK_BASE + row.id);
        if (runs < row.number || (player.taskValues[key] ?? 0) !== 0) continue;
        player.taskValues[key] = 1;
        awards.push(...row.awards.map((award) => [...award] as BaseAward));
      }
      if (awards.length === 0) return reply({ nError: CLUB_BOSS_NO_AWARD });
      return {
        response: { nError: CLUB_BOSS_OK, tbAward: awards.map((award) => [...award]) },
        playerAwards: awards,
        clubAwards: [],
      };
    }
    case LUA_COMMAND_CLUB_BOSS_GRID_AWARD: {
      if (!club || !state) return reply({ nError: CLUB_BOSS_NOT_JOINED });
      if (time >= season.award) return reply({ nError: CLUB_BOSS_CLOSED });
      const only = integerField(parameter, "nGridId");
      const awards: BaseAward[] = [];
      const paid: number[] = [];
      for (const grid of [...stage.grids.values()].sort((a, b) => a.id - b.id)) {
        if (only > 0 && grid.id !== only) continue;
        const level = stage.levels.get(grid.levelId)!;
        // Flagged by level, as the client reads it: a level on two grids pays once.
        const key = task(CLUB_BOSS_GRID_AWARD_TASK_BASE + level.id);
        if (
          level.passAwards.length === 0 ||
          (state.grids[String(grid.id)] ?? 0) < level.total ||
          (player.taskValues[key] ?? 0) !== 0
        )
          continue;
        player.taskValues[key] = 1;
        awards.push(...level.passAwards.map((award) => [...award] as BaseAward));
        paid.push(grid.id);
      }
      if (paid.length === 0) return reply({ nError: CLUB_BOSS_NO_AWARD });
      return {
        response: {
          nError: CLUB_BOSS_OK,
          tbAward: awards.map((award) => [...award]),
          tbGrid: paid,
        },
        playerAwards: awards,
        clubAwards: [],
      };
    }
    case LUA_COMMAND_CLUB_BOSS_RANK:
      // UI_ClubBossReward reads only `rate` ("top N%"); no club, no screen.
      if (!club) return reply(undefined);
      return reply({ rate: clubBossRate(state, stage) });
    case LUA_COMMAND_CLUB_BOSS_FIGHTING: {
      const gridId = integerField(parameter, "nGridId");
      if (!club || !state || !stage.grids.has(gridId))
        return reply({ gridid: gridId, roleidlist: [] });
      return reply({
        gridid: gridId,
        explore_score: state.grids[String(gridId)] ?? 0,
        grid_log: gridLog(state, gridId, club, self),
        sumScore: sumScore(state),
        active_buff_list: [...state.buffs],
        roleidlist: [],
      });
    }
    case LUA_COMMAND_CLUB_BOSS_WAY_POINT: {
      const paths = parsePaths(field(parameter, "attack_path_list"), stage);
      if (!club || !state || !paths) return reply({ nError: CLUB_BOSS_INVALID });
      for (const path of paths) {
        const at = state.paths.findIndex(({ index }) => index === path.index);
        if (at >= 0) state.paths[at] = path;
        else state.paths.push(path);
      }
      return reply({ attack_path_list: paths.map((path) => ({ ...path })) });
    }
    default:
      return reply(undefined);
  }
}

function parsePaths(value: unknown, stage: ClubBossStage): ClubBossPath[] | null {
  const list = Array.isArray(value)
    ? value
    : typeof value === "object" && value !== null
      ? Object.values(value)
      : null;
  if (!list || list.length === 0 || list.length > 10) return null;
  const paths: ClubBossPath[] = [];
  for (const entry of list) {
    const index = integerField(entry, "index");
    const raw = field(entry, "girdid_list");
    const ids = Array.isArray(raw)
      ? raw
      : typeof raw === "object" && raw !== null
        ? Object.values(raw)
        : [];
    const girdid_list = ids.map(Number);
    if (
      index <= 0 ||
      girdid_list.length > stage.grids.size ||
      girdid_list.some((id) => !stage.grids.has(id))
    )
      return null;
    paths.push({ index, girdid_list });
  }
  return paths;
}

/**
 * "Top N %" of UI_ClubBossReward: how much of the capped map the club has
 * explored. There are no other clubs, so the share explored stands in for
 * the share of clubs beaten: a fully explored map is the top 1 %.
 */
export function clubBossRate(
  state: ClubBossState | undefined,
  stage: ClubBossStage,
): number {
  let total = 0;
  let explored = 0;
  for (const grid of stage.grids.values()) {
    const level = stage.levels.get(grid.levelId)!;
    if (level.type === CLUB_BOSS_LEVEL_UNLIMITED) continue;
    total += level.total;
    explored += Math.min(level.total, state?.grids[String(grid.id)] ?? 0);
  }
  if (total <= 0) return 100;
  return Math.max(1, Math.min(100, Math.ceil(100 * (1 - explored / total))));
}
