import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  CLUB_BOSS_AWARD_SECONDS,
  CLUB_BOSS_CLOSED,
  CLUB_BOSS_FIGHT_SECONDS,
  CLUB_BOSS_GRID_AWARD_TASK_BASE,
  CLUB_BOSS_GRID_DONE,
  CLUB_BOSS_INVALID,
  CLUB_BOSS_LOCKED,
  CLUB_BOSS_NO_AWARD,
  CLUB_BOSS_NO_TRIES,
  CLUB_BOSS_NOT_JOINED,
  CLUB_BOSS_OK,
  CLUB_BOSS_PARTICIPATE_TASK_BASE,
  CLUB_BOSS_SEASON_ANCHOR,
  CLUB_BOSS_SEASON_SECONDS,
  CLUB_BOSS_TODAY_RUNS_TASK,
  CLUB_BOSS_TOTAL_RUNS_TASK,
  CLUBMATE_BOSS_DAILY_RUNS,
  clubBossCommand,
  clubBossPayload,
  clubBossRate,
  clubBossSeason,
  LUA_COMMAND_CLUB_BOSS_CHECK_IN,
  LUA_COMMAND_CLUB_BOSS_END,
  LUA_COMMAND_CLUB_BOSS_ENTER,
  LUA_COMMAND_CLUB_BOSS_FIGHTING,
  LUA_COMMAND_CLUB_BOSS_GRID_AWARD,
  LUA_COMMAND_CLUB_BOSS_PARTICIPATE_AWARD,
  LUA_COMMAND_CLUB_BOSS_RANK,
  LUA_COMMAND_CLUB_BOSS_SAVE,
  LUA_COMMAND_CLUB_BOSS_WAY_POINT,
  reconcileClubBoss,
} from "../src/game-data/club-boss-data.js";
import {
  CLUB_BOSS_LEVEL_BOSS,
  CLUB_BOSS_LEVEL_UNLIMITED,
  clubBossStage,
  isClubBossGridOpen,
  type ClubBossStage,
} from "../src/game-data/club-boss-tables.js";
import {
  clubMemberList,
  clubPayload,
  createClubState,
  parseCreateClubRequest,
  reconcileClub,
  type ClubPlayer,
  type ClubSelf,
} from "../src/game-data/club-data.js";

const DAY = 86_400_000;
const A = CLUB_BOSS_SEASON_ANCHOR * 1_000;
const SEASON = CLUB_BOSS_SEASON_SECONDS * 1_000;
/** One hour into the first day of a season (04:00 UTC+8 + 1 h). */
const seasonStart = (index: number): number => A + index * SEASON + 3_600_000;
const CREATE_REQUEST = { applylevel: 10, clubname: "GCG revival", autojoinlevel: 10 };

function withClub(now: number): ClubPlayer {
  const player: ClubPlayer = { roleId: 1, name: "HealthS", level: 23, taskValues: {} };
  player.club = createClubState(player, parseCreateClubRequest(CREATE_REQUEST), now);
  return player;
}

function self(player: ClubPlayer): ClubSelf {
  return {
    roleId: player.roleId,
    name: player.name,
    level: player.level,
    girlIconId: 3,
  };
}

/** What handleClubRequest does before every command. */
function upkeep(player: ClubPlayer, now: number): void {
  reconcileClub(player, now);
  reconcileClubBoss(player, now);
}

function command(player: ClubPlayer, id: number, parameters: unknown, now: number) {
  upkeep(player, now);
  return clubBossCommand(
    player,
    self(player),
    id,
    { sCmd: id, tbParam: parameters },
    () => clubMemberList(player.club!, self(player), now),
    now,
  );
}

function level(stage: ClubBossStage, gridId: number) {
  return stage.levels.get(stage.grids.get(gridId)!.levelId)!;
}

describe("club boss calendar", () => {
  it("matches the client recipe's moments (release/client/test_club_boss.py)", () => {
    const seconds = (ms: number): number => Math.floor(ms / 1_000);
    expect(clubBossSeason(seconds(A + 5 * DAY)).stage).toBe(1);
    expect(clubBossSeason(seconds(A + 14 * DAY + 60_000)).stage).toBe(2);
    expect(clubBossSeason(seconds(A - 1_000)).stage).toBe(10);
    expect(clubBossSeason(seconds(A + 140 * DAY + 3_600_000)).stage).toBe(1);
    expect(
      clubBossSeason(CLUB_BOSS_SEASON_ANCHOR + 3 * CLUB_BOSS_SEASON_SECONDS - 1).stage,
    ).toBe(3);
    expect(
      clubBossSeason(CLUB_BOSS_SEASON_ANCHOR + 3 * CLUB_BOSS_SEASON_SECONDS).stage,
    ).toBe(4);
    const first = clubBossSeason(seconds(A + 5 * DAY));
    expect(first).toEqual({
      index: 0,
      stage: 1,
      start: CLUB_BOSS_SEASON_ANCHOR,
      end: CLUB_BOSS_SEASON_ANCHOR + CLUB_BOSS_FIGHT_SECONDS,
      award: CLUB_BOSS_SEASON_ANCHOR + CLUB_BOSS_AWARD_SECONDS,
      clear: CLUB_BOSS_SEASON_ANCHOR + CLUB_BOSS_SEASON_SECONDS,
    });
    // 2026-11-16 04:00 in Shanghai
    expect(new Date(A).toISOString()).toBe("2026-11-15T20:00:00.000Z");
  });
});

describe("club boss tables", () => {
  it("loads every map row with a level, for all ten stages", () => {
    for (let stageId = 1; stageId <= 10; stageId += 1) {
      const stage = clubBossStage(stageId);
      const lines = readFileSync(
        path.resolve(process.cwd(), `resources/club/clubbossmap_${stageId}.txt`),
        "utf8",
      )
        .split(/\r?\n/)
        .slice(3)
        .filter((line) => line.trim());
      const withLevel = lines.filter((line) => Number(line.split("\t")[4]) > 0);
      expect(stage.grids.size, `stage ${stageId}`).toBe(withLevel.length);
      for (const grid of stage.grids.values())
        expect(stage.levels.has(grid.levelId), `stage ${stageId} grid ${grid.id}`).toBe(
          true,
        );
      expect(stage.participateAwards.map(({ id }) => id)).toEqual(
        stage.participateAwards.map((_, index) => index + 1),
      );
      expect(stage.rankAwards.map(({ id }) => id)).toEqual(
        stage.rankAwards.map((_, index) => index + 1),
      );
    }
  });

  it("orders the clubmates' plan so that each grid is open when its turn comes", () => {
    for (let stageId = 1; stageId <= 10; stageId += 1) {
      const stage = clubBossStage(stageId);
      const done = new Set<number>();
      for (const gridId of stage.plan) {
        const open = isClubBossGridOpen(stage, gridId, (id) =>
          done.has(id) ? level(stage, id).total : 0,
        );
        expect(open, `stage ${stageId} grid ${gridId}`).toBe(true);
        done.add(gridId);
      }
      const bosses = [...stage.grids.keys()].filter(
        (id) => level(stage, id).type === CLUB_BOSS_LEVEL_BOSS,
      );
      expect(bosses).toHaveLength(4);
      for (const boss of bosses) expect(stage.plan).toContain(boss);
      const last = stage.plan.at(-1)!;
      expect(level(stage, last).type).toBe(CLUB_BOSS_LEVEL_UNLIMITED);
    }
  });

  it("sends every grid in clubboss with integer numbers, for all ten stages", () => {
    for (let index = 0; index < 10; index += 1) {
      const now = seasonStart(index);
      const player = withClub(now);
      upkeep(player, now);
      const stage = clubBossStage(index + 1);
      const payload = clubPayload(player.club!, self(player), now) as {
        clubboss: {
          stageid: number;
          score: number;
          active_buff_list: unknown[];
          attack_path_list: unknown[];
          bosslist: Record<string, unknown>[];
        };
      };
      const boss = payload.clubboss;
      expect(boss.stageid).toBe(index + 1);
      expect(Number.isInteger(boss.score)).toBe(true);
      expect(Array.isArray(boss.active_buff_list)).toBe(true);
      expect(Array.isArray(boss.attack_path_list)).toBe(true);
      expect(boss.bosslist).toHaveLength(stage.grids.size);
      for (const entry of boss.bosslist) {
        for (const key of ["gridid", "levelid", "explore_score", "unknow_score"])
          expect(
            Number.isInteger(entry[key]),
            `${key} of ${String(entry.gridid)}`,
          ).toBe(true);
        expect(Array.isArray(entry.grid_log)).toBe(true);
      }
      // the clubmates' first day is in: their scores are in the log
      expect(boss.score).toBeGreaterThan(0);
    }
  });
});

describe("club boss season without the player's fights", () => {
  it("lets the clubmates defeat the four capped bosses by the end of the fights", () => {
    for (let index = 0; index < 10; index += 1) {
      const stage = clubBossStage(index + 1);
      const player = withClub(seasonStart(index));
      for (let day = 0; day < 11; day += 1)
        upkeep(player, seasonStart(index) + day * DAY);
      const state = player.club!.boss!;
      for (const [gridId] of stage.grids) {
        if (level(stage, gridId).type !== CLUB_BOSS_LEVEL_BOSS) continue;
        expect(
          state.grids[String(gridId)] ?? 0,
          `stage ${index + 1} boss ${gridId}`,
        ).toBeGreaterThanOrEqual(level(stage, gridId).total);
      }
      // no fights after the end: the twelfth day adds nothing
      const before = JSON.stringify(state.grids);
      upkeep(player, seasonStart(index) + 11 * DAY);
      expect(JSON.stringify(state.grids)).toBe(before);
      const rate = clubBossRate(state, stage);
      expect(rate).toBeGreaterThanOrEqual(1);
      expect(rate).toBeLessThanOrEqual(20);
    }
  });

  it("lets each clubmate fight three times a day and shows it in the member list", () => {
    const now = seasonStart(0);
    const player = withClub(now);
    upkeep(player, now);
    upkeep(player, now + DAY);
    const members = clubMemberList(player.club!, self(player), now + DAY);
    const mates = members.filter((member) => member.roleid !== 1);
    expect(mates).toHaveLength(6);
    for (const mate of mates) {
      expect(mate.clubboss_enter_times).toBe(2 * CLUBMATE_BOSS_DAILY_RUNS);
      expect(mate.today_clubboss_enter_times).toBe(CLUBMATE_BOSS_DAILY_RUNS);
      expect(mate.boss_explore_score).toBeGreaterThan(0);
    }
    const mine = members.find((member) => member.roleid === 1)!;
    expect(mine).toMatchObject({
      boss_explore_score: 0,
      clubboss_enter_times: 0,
      today_clubboss_enter_times: 0,
    });
    // the same day twice: no second fight
    const score = JSON.stringify(player.club!.boss!.scores);
    upkeep(player, now + DAY + 3_600_000);
    expect(JSON.stringify(player.club!.boss!.scores)).toBe(score);
  });
});

describe("club boss commands", () => {
  /** An open grid of LevelType 1 that is not complete. */
  function openGrid(player: ClubPlayer): { gridId: number; levelId: number } {
    const state = player.club!.boss!;
    const stage = clubBossStage(state.stage);
    for (const [gridId, grid] of [...stage.grids].sort((a, b) => a[0] - b[0])) {
      const info = level(stage, gridId);
      if (
        info.type === 1 &&
        (state.grids[String(gridId)] ?? 0) < info.total &&
        isClubBossGridOpen(stage, gridId, (id) => state.grids[String(id)] ?? 0)
      )
        return { gridId, levelId: grid.levelId };
    }
    throw new Error("no open grid");
  }

  function lockedGrid(player: ClubPlayer): { gridId: number; levelId: number } {
    const state = player.club!.boss!;
    const stage = clubBossStage(state.stage);
    for (const [gridId, grid] of stage.grids)
      if (!isClubBossGridOpen(stage, gridId, (id) => state.grids[String(id)] ?? 0))
        return { gridId, levelId: grid.levelId };
    throw new Error("no locked grid");
  }

  it("enters, scores, keeps the score and counts the tries", () => {
    const now = seasonStart(0);
    const player = withClub(now);
    upkeep(player, now);
    const checkIn = command(player, LUA_COMMAND_CLUB_BOSS_CHECK_IN, undefined, now)
      .response as {
      nError: number;
      clubboss: { stageid: number };
      memberlist: unknown[];
    };
    expect(checkIn.nError).toBe(CLUB_BOSS_OK);
    expect(checkIn.clubboss.stageid).toBe(1);
    expect(checkIn.memberlist).toHaveLength(7);

    const locked = lockedGrid(player);
    expect(
      command(
        player,
        LUA_COMMAND_CLUB_BOSS_ENTER,
        [locked.gridId, locked.levelId, 1],
        now,
      ).response,
    ).toEqual({ nError: CLUB_BOSS_LOCKED });
    const target = openGrid(player);
    expect(
      command(
        player,
        LUA_COMMAND_CLUB_BOSS_ENTER,
        [target.gridId, target.levelId + 1, 1],
        now,
      ).response,
    ).toEqual({ nError: CLUB_BOSS_INVALID });

    const stage = clubBossStage(1);
    let myTotal = 0;
    for (let run = 1; run <= 3; run += 1) {
      const grid = openGrid(player);
      // the Lua array also arrives as an object keyed "1", "2", "3"
      const enter =
        run === 2
          ? { 1: grid.gridId, 2: grid.levelId, 3: 1 }
          : [grid.gridId, grid.levelId, 1];
      expect(command(player, LUA_COMMAND_CLUB_BOSS_ENTER, enter, now).response).toEqual(
        {
          nError: CLUB_BOSS_OK,
        },
      );
      const before = player.club!.boss!.grids[String(grid.gridId)] ?? 0;
      const end = command(
        player,
        LUA_COMMAND_CLUB_BOSS_END,
        {
          bPass: true,
          nGridId: grid.gridId,
          nLevelId: grid.levelId,
          nScore: 10_000_000,
        },
        now,
      ).response as Record<string, unknown>;
      const total = level(stage, grid.gridId).total;
      const pass = level(stage, grid.gridId).pass;
      expect(end).toEqual({
        bPass: true,
        nScore: pass,
        nTotalScore: myTotal,
        nGridScore: Math.min(total, before + pass),
      });
      myTotal += pass;
      const saved = command(player, LUA_COMMAND_CLUB_BOSS_SAVE, true, now)
        .response as Record<string, unknown>;
      expect(saved).toMatchObject({ myScore: myTotal, nEnterTimes: run });
      expect(saved.clubboss).toBeDefined();
      expect(saved.memberlist).toBeDefined();
      expect(player.taskValues[CLUB_BOSS_TODAY_RUNS_TASK]).toBe(run);
      expect(player.taskValues[CLUB_BOSS_TOTAL_RUNS_TASK]).toBe(run);
      expect(player.club!.boss!.grids[String(grid.gridId)]).toBe(
        Math.min(total, before + pass),
      );
    }
    const last = openGrid(player);
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_ENTER, [last.gridId, last.levelId, 1], now)
        .response,
    ).toEqual({ nError: CLUB_BOSS_NO_TRIES });
    const mine = clubMemberList(player.club!, self(player), now).find(
      (member) => member.roleid === 1,
    );
    expect(mine).toMatchObject({
      boss_explore_score: myTotal,
      clubboss_enter_times: 3,
      today_clubboss_enter_times: 3,
    });

    // the next day: three tries again
    const tomorrow = now + DAY;
    const next = (upkeep(player, tomorrow), openGrid(player));
    expect(
      command(
        player,
        LUA_COMMAND_CLUB_BOSS_ENTER,
        [next.gridId, next.levelId, 1],
        tomorrow,
      ).response,
    ).toEqual({ nError: CLUB_BOSS_OK });
  });

  it("drops a run the player does not keep, and a pause exit gets no answer", () => {
    const now = seasonStart(0);
    const player = withClub(now);
    upkeep(player, now);
    const grid = openGrid(player);
    command(player, LUA_COMMAND_CLUB_BOSS_ENTER, [grid.gridId, grid.levelId, 1], now);
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_END, { bPauseExit: true }, now).response,
    ).toBeUndefined();
    // the run stays (no try used); the next enter replaces it
    expect(player.club!.boss!.run).toMatchObject({ gridId: grid.gridId, ended: false });

    const before = player.club!.boss!.grids[String(grid.gridId)] ?? 0;
    command(player, LUA_COMMAND_CLUB_BOSS_ENTER, [grid.gridId, grid.levelId, 1], now);
    const result = {
      bPass: false,
      nGridId: grid.gridId,
      nLevelId: grid.levelId,
      nScore: 500,
    };
    const failed = command(player, LUA_COMMAND_CLUB_BOSS_END, result, now)
      .response as Record<string, unknown>;
    expect(failed).toMatchObject({ bPass: false, nScore: 500 });
    // the client sends the same result again until DoSettle answers: same answer
    expect(command(player, LUA_COMMAND_CLUB_BOSS_END, result, now).response).toEqual(
      failed,
    );
    // a pause exit sent again later does not drop the ended run
    command(player, LUA_COMMAND_CLUB_BOSS_END, { bPauseExit: true }, now);
    expect(player.club!.boss!.run).toMatchObject({ ended: true, score: 500 });
    const saved = command(player, LUA_COMMAND_CLUB_BOSS_SAVE, false, now)
      .response as Record<string, unknown>;
    expect(saved).toMatchObject({ myScore: 0, nEnterTimes: 0 });
    expect(player.club!.boss!.grids[String(grid.gridId)] ?? 0).toBe(before);
    expect(player.taskValues[CLUB_BOSS_TODAY_RUNS_TASK]).toBe(0);
    // after 10025: the same result again gets no answer, another one an error
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_END, result, now).response,
    ).toBeUndefined();
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_END, { ...result, nScore: 1 }, now)
        .response,
    ).toEqual({ nError: CLUB_BOSS_INVALID });
    // 10025 is answered even with nothing to keep (it closes the end screen)
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_SAVE, true, now).response,
    ).toBeDefined();
    // the same result in a new run is that run's result
    command(player, LUA_COMMAND_CLUB_BOSS_ENTER, [grid.gridId, grid.levelId, 1], now);
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_END, result, now).response,
    ).toMatchObject({
      nScore: 500,
    });
  });

  it("refuses a complete grid, fights after the end, and grid rewards after the award days", () => {
    const now = seasonStart(0);
    const player = withClub(now);
    upkeep(player, now);
    const state = player.club!.boss!;
    const stage = clubBossStage(1);
    const done = stage.plan.find(
      (gridId) =>
        level(stage, gridId).type === 1 &&
        (state.grids[String(gridId)] ?? 0) >= level(stage, gridId).total,
    )!;
    expect(done).toBeDefined();
    expect(
      command(
        player,
        LUA_COMMAND_CLUB_BOSS_ENTER,
        [done, level(stage, done).id, 1],
        now,
      ).response,
    ).toEqual({ nError: CLUB_BOSS_GRID_DONE });

    const grid = openGrid(player);
    // ClubCommon:IsClubBossOpen counts the EndTime second as open
    const endSecond = A + CLUB_BOSS_FIGHT_SECONDS * 1_000;
    expect(
      command(
        player,
        LUA_COMMAND_CLUB_BOSS_ENTER,
        [grid.gridId, grid.levelId, 1],
        endSecond,
      ).response,
    ).toEqual({ nError: CLUB_BOSS_OK });
    const afterEnd = endSecond + 1_000;
    expect(
      command(
        player,
        LUA_COMMAND_CLUB_BOSS_ENTER,
        [grid.gridId, grid.levelId, 1],
        afterEnd,
      ).response,
    ).toEqual({ nError: CLUB_BOSS_CLOSED });
    const afterAward = A + CLUB_BOSS_AWARD_SECONDS * 1_000 + 3_600_000;
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_GRID_AWARD, {}, afterAward).response,
    ).toEqual({
      nError: CLUB_BOSS_CLOSED,
    });
  });

  it("pays participation and pass rewards once a season, again in the next one", () => {
    let now = seasonStart(0);
    const player = withClub(now);
    upkeep(player, now);
    const claimAll = (at: number) => {
      const state = player.club!.boss!;
      const stage = clubBossStage(state.stage);
      for (const [gridId] of stage.grids)
        state.grids[String(gridId)] = level(stage, gridId).total;
      state.runs["1"] = 40;
      const participate = command(
        player,
        LUA_COMMAND_CLUB_BOSS_PARTICIPATE_AWARD,
        undefined,
        at,
      );
      const grids = command(player, LUA_COMMAND_CLUB_BOSS_GRID_AWARD, {}, at);
      return { stage, participate, grids };
    };
    const first = claimAll(now);
    expect(first.participate.response).toMatchObject({ nError: CLUB_BOSS_OK });
    expect(first.participate.playerAwards.length).toBe(
      3 * first.stage.participateAwards.length,
    );
    const gridReply = first.grids.response as {
      nError: number;
      tbAward: unknown[];
      tbGrid: number[];
    };
    expect(gridReply.nError).toBe(CLUB_BOSS_OK);
    const levels = new Set(
      [...first.stage.grids.values()]
        .map((grid) => first.stage.levels.get(grid.levelId)!)
        .filter((info) => info.passAwards.length > 0)
        .map((info) => info.id),
    );
    expect(gridReply.tbGrid).toHaveLength(levels.size);
    for (const id of levels)
      expect(
        player.taskValues[String((1 << 16) | (CLUB_BOSS_GRID_AWARD_TASK_BASE + id))],
      ).toBe(1);
    expect(
      player.taskValues[String((1 << 16) | (CLUB_BOSS_PARTICIPATE_TASK_BASE + 1))],
    ).toBe(1);
    // claimed: nothing more this season
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_PARTICIPATE_AWARD, undefined, now).response,
    ).toEqual({
      nError: 4,
    });
    expect(command(player, LUA_COMMAND_CLUB_BOSS_GRID_AWARD, {}, now).response).toEqual(
      {
        nError: CLUB_BOSS_NO_AWARD,
      },
    );

    // the next season clears the flags (to 0) and starts a new map
    now = seasonStart(1);
    upkeep(player, now);
    expect(player.club!.boss!.stage).toBe(2);
    expect(
      player.taskValues[String((1 << 16) | (CLUB_BOSS_PARTICIPATE_TASK_BASE + 1))],
    ).toBe(0);
    for (const id of levels)
      expect(
        player.taskValues[String((1 << 16) | (CLUB_BOSS_GRID_AWARD_TASK_BASE + id))],
      ).toBe(0);
    expect(player.taskValues[CLUB_BOSS_TOTAL_RUNS_TASK] ?? 0).toBe(0);
    const second = claimAll(now);
    // a club dissolved and made again in the same season keeps the claims
    player.club = createClubState(
      player,
      parseCreateClubRequest(CREATE_REQUEST),
      now + DAY,
    );
    upkeep(player, now + DAY);
    const again = claimAll(now + DAY);
    expect(again.participate.response).toEqual({ nError: CLUB_BOSS_NO_AWARD });
    expect(again.grids.response).toEqual({ nError: CLUB_BOSS_NO_AWARD });
    expect(second.participate.response).toMatchObject({ nError: CLUB_BOSS_OK });
    expect(second.grids.response).toMatchObject({ nError: CLUB_BOSS_OK });
  });

  it("answers rank, grid taps and way points; a player without a club gets nError 2", () => {
    const now = seasonStart(0);
    const player = withClub(now);
    upkeep(player, now);
    const rank = command(player, LUA_COMMAND_CLUB_BOSS_RANK, undefined, now)
      .response as {
      rate: number;
    };
    expect(Number.isInteger(rank.rate)).toBe(true);
    expect(rank.rate).toBeGreaterThanOrEqual(1);
    expect(rank.rate).toBeLessThanOrEqual(100);

    const stage = clubBossStage(1);
    const first = stage.plan[0]!;
    const tap = command(player, LUA_COMMAND_CLUB_BOSS_FIGHTING, { nGridId: first }, now)
      .response as {
      gridid: number;
      grid_log: { name: string; score: number }[];
      roleidlist: [];
    };
    expect(tap.gridid).toBe(first);
    expect(tap.grid_log.length).toBeGreaterThan(0);
    expect(tap.grid_log[0]!.name).toBeTypeOf("string");
    expect(tap.roleidlist).toEqual([]);
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_FIGHTING, { nGridId: 999_999 }, now)
        .response,
    ).toEqual({ gridid: 999_999, roleidlist: [] });

    const path = [{ index: 1, girdid_list: stage.plan.slice(0, 3) }];
    expect(
      command(player, LUA_COMMAND_CLUB_BOSS_WAY_POINT, { attack_path_list: path }, now)
        .response,
    ).toEqual({ attack_path_list: path });
    expect(
      (
        clubBossPayload(player.club!, self(player), now) as {
          attack_path_list: unknown;
        }
      ).attack_path_list,
    ).toEqual(path);
    expect(
      command(
        player,
        LUA_COMMAND_CLUB_BOSS_WAY_POINT,
        { attack_path_list: [{ index: 1, girdid_list: [999_999] }] },
        now,
      ).response,
    ).toEqual({ nError: CLUB_BOSS_INVALID });

    const lonely: ClubPlayer = { roleId: 2, name: "Solo", level: 10, taskValues: {} };
    const reply = clubBossCommand(
      lonely,
      { roleId: 2, name: "Solo", level: 10, girlIconId: 1 },
      LUA_COMMAND_CLUB_BOSS_CHECK_IN,
      undefined,
      () => [],
      now,
    );
    expect(reply.response).toEqual({ nError: CLUB_BOSS_NOT_JOINED });
  });
});
