import { readFileSync } from "node:fs";
import path from "node:path";

import type { BaseAward } from "./chapter-config.js";

/**
 * The club boss tables of the 0.1.3 setting.u (resources/club, byte copies; see
 * provenance.json): maps and levels of the ten stages, participation and rank
 * awards. ClubCommon.lua reads the same files on the client.
 */

export const CLUB_BOSS_STAGE_COUNT = 10;
/** ClubBossLevel LevelType: 1 fight, 2 story, 3 boss, 4 boss without a score cap. */
export const CLUB_BOSS_LEVEL_BOSS = 3;
export const CLUB_BOSS_LEVEL_UNLIMITED = 4;

export interface ClubBossGrid {
  id: number;
  levelId: number;
  around: readonly number[];
  preGridId: number;
  /** GridAward: paid to whoever completes the grid ([] = none). */
  award: readonly BaseAward[];
}

export interface ClubBossLevel {
  id: number;
  type: number;
  /** RemindScore: explore score at which the grid opens its neighbours (unknow_score). */
  remind: number;
  total: number;
  /** PassScore: the most one run can score (ClubCommon:Pass). */
  pass: number;
  buffId: number;
  /** PassAwards: every member may claim them once the grid is complete (10019). */
  passAwards: readonly BaseAward[];
}

export interface ClubBossParticipateAward {
  id: number;
  /** Runs the player has banked this season. */
  number: number;
  awards: readonly BaseAward[];
}

export interface ClubBossRankAward {
  id: number;
  /** Rank band: top `rankIndex` percent of the clubs. */
  rankIndex: number;
  awards: readonly BaseAward[];
}

export interface ClubBossStage {
  id: number;
  grids: ReadonlyMap<number, ClubBossGrid>;
  levels: ReadonlyMap<number, ClubBossLevel>;
  participateAwards: readonly ClubBossParticipateAward[];
  rankAwards: readonly ClubBossRankAward[];
  /**
   * The simulated clubmates' order of attack: the cheapest route to each
   * capped boss in turn, each boss, then every other capped grid, then the
   * uncapped boss. Every grid in it is open once the grids before it are
   * complete.
   */
  plan: readonly number[];
}

type Row = Record<string, string>;

function readTable(name: string, root: string): Row[] {
  const lines = readFileSync(path.resolve(root, name), "utf8").split(/\r?\n/);
  const columns = lines[2]?.split("\t") ?? [];
  const rows: Row[] = [];
  for (const line of lines.slice(3)) {
    if (!line.trim()) continue;
    const cells = line.split("\t");
    rows.push(Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? ""])));
  }
  return rows;
}

function integer(value: string | undefined): number {
  const parsed = Number((value ?? "").trim());
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

/** "[1,2,3]" -> [1, 2, 3]. */
function integers(value: string | undefined): number[] {
  return (value ?? "")
    .replace(/[[\]\s]/g, "")
    .split(",")
    .filter(Boolean)
    .map(Number)
    .filter((number) => Number.isSafeInteger(number));
}

/** "[15-1-1-1-50000,15-14-1-1-200]" -> two awards (Parse2ItemList). */
export function parseClubBossAwards(value: string | undefined): BaseAward[] {
  return (value ?? "")
    .replace(/[[\]\s]/g, "")
    .split(",")
    .filter(Boolean)
    .map((item) => item.split("-").map(Number))
    .filter(
      (parts) => parts.length >= 5 && parts.slice(0, 5).every(Number.isSafeInteger),
    )
    .map((parts) => [parts[0]!, parts[1]!, parts[2]!, parts[3]!, parts[4]!]);
}

/** ClubCommon:IsGridUnlock: one neighbour at its remind score, and the pre-grid too. */
export function isClubBossGridOpen(
  stage: Pick<ClubBossStage, "grids" | "levels">,
  gridId: number,
  score: (gridId: number) => number,
): boolean {
  const grid = stage.grids.get(gridId);
  if (!grid) return false;
  const reached = (id: number): boolean => {
    const other = stage.grids.get(id);
    const level = other && stage.levels.get(other.levelId);
    return level !== undefined && score(id) >= level.remind;
  };
  if (grid.around.length > 0 && !grid.around.some(reached)) return false;
  // The client checks the pre-grid only when the map holds it.
  return (
    grid.preGridId <= 0 || !stage.grids.has(grid.preGridId) || reached(grid.preGridId)
  );
}

function buildPlan(stage: Pick<ClubBossStage, "grids" | "levels">): number[] {
  const level = (gridId: number): ClubBossLevel =>
    stage.levels.get(stage.grids.get(gridId)!.levelId)!;
  const done = new Set<number>();
  const plan: number[] = [];
  const score = (id: number): number => (done.has(id) ? level(id).total : 0);
  const open = (id: number): boolean => isClubBossGridOpen(stage, id, score);
  const take = (id: number): void => {
    plan.push(id);
    done.add(id);
  };
  const capped = [...stage.grids.keys()].filter(
    (id) => level(id).type !== CLUB_BOSS_LEVEL_UNLIMITED,
  );
  const bosses = capped
    .filter((id) => level(id).type === CLUB_BOSS_LEVEL_BOSS)
    .sort((a, b) => level(a).id - level(b).id || a - b);
  /** Cheapest chain of grids (by total score) from the open ones to `target`. */
  const route = (target: number): number[] => {
    const cost = new Map<number, number>();
    const previous = new Map<number, number | null>();
    const queue: [number, number, number | null][] = [];
    for (const id of capped)
      if (!done.has(id) && open(id)) queue.push([level(id).total, id, null]);
    while (queue.length > 0) {
      queue.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const [distance, id, from] = queue.shift()!;
      if (cost.has(id)) continue;
      cost.set(id, distance);
      previous.set(id, from);
      if (id === target) break;
      for (const next of capped) {
        if (done.has(next) || cost.has(next)) continue;
        const grid = stage.grids.get(next)!;
        if (!grid.around.includes(id)) continue;
        // A pre-grid on the way must be complete already, or be this step.
        if (
          grid.preGridId > 0 &&
          stage.grids.has(grid.preGridId) &&
          !done.has(grid.preGridId) &&
          grid.preGridId !== id
        )
          continue;
        queue.push([distance + level(next).total, next, id]);
      }
    }
    if (!cost.has(target)) return [];
    const path: number[] = [];
    for (let id: number | null = target; id !== null; id = previous.get(id) ?? null)
      path.unshift(id);
    return path;
  };
  for (const boss of bosses) for (const id of route(boss)) take(id);
  // Everything else that is capped, nearest first, until nothing more opens.
  for (;;) {
    const next = capped
      .filter((id) => !done.has(id) && open(id))
      .sort((a, b) => level(a).total - level(b).total || a - b)[0];
    if (next === undefined) break;
    take(next);
  }
  for (const id of [...stage.grids.keys()].sort((a, b) => a - b))
    if (level(id).type === CLUB_BOSS_LEVEL_UNLIMITED && open(id)) take(id);
  return plan;
}

export function loadClubBossStage(stageId: number, root: string): ClubBossStage {
  const levels = new Map<number, ClubBossLevel>();
  for (const row of readTable(`clubbosslevel_${stageId}.txt`, root)) {
    const id = integer(row.LevelId);
    if (id <= 0) continue;
    const total = integer(row.TotalScore);
    levels.set(id, {
      id,
      type: integer(row.LevelType) || 1,
      // ClubCommon:LoadClubBossLevelConfig: an empty RemindScore is the total.
      remind: (row.RemindScore ?? "").trim() ? integer(row.RemindScore) : total,
      total,
      pass: integer(row.PassScore),
      buffId: integer(row.BuffID),
      passAwards: parseClubBossAwards(row.PassAwards),
    });
  }
  const grids = new Map<number, ClubBossGrid>();
  for (const row of readTable(`clubbossmap_${stageId}.txt`, root)) {
    const id = integer(row.GridId);
    const levelId = integer(row.LevelId);
    if (id <= 0 || levelId <= 0 || !levels.has(levelId)) continue;
    grids.set(id, {
      id,
      levelId,
      around: integers(row.AroundIds),
      preGridId: integer(row.PreGridId),
      award: parseClubBossAwards(row.GridAward),
    });
  }
  if (grids.size === 0) throw new Error(`Club boss stage ${stageId} has no grids`);
  const participateAwards = readTable("clubparticipateaward.txt", root)
    .filter((row) => integer(row.StageId) === stageId && integer(row.Id) > 0)
    .map((row) => ({
      id: integer(row.Id),
      number: integer(row.Number),
      awards: parseClubBossAwards(row.Award),
    }));
  const rankAwards = readTable("clubbossrankaward.txt", root)
    .filter((row) => integer(row.StageId) === stageId && integer(row.Id) > 0)
    .map((row) => ({
      id: integer(row.Id),
      rankIndex: integer(row.RankIndex),
      awards: parseClubBossAwards(row.AwardItem),
    }));
  const stage = { id: stageId, grids, levels, participateAwards, rankAwards };
  return { ...stage, plan: buildPlan(stage) };
}

const stages = new Map<number, ClubBossStage>();

/** Stage tables from resources/club of the working directory, read once. */
export function clubBossStage(stageId: number): ClubBossStage {
  let stage = stages.get(stageId);
  if (!stage) {
    stage = loadClubBossStage(stageId, path.resolve(process.cwd(), "resources/club"));
    stages.set(stageId, stage);
  }
  return stage;
}
