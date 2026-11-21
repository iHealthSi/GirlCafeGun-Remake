/**
 * The side games of the first Anniversary hub (UI_AnniversaryMain): the discovery map (GridActLogic.lua), the thank-you
 * board (AnniversaryBoard.lua), the girl stories and gift (AnniversaryMainLogic.lua), the capsule machine
 * (UI_AnniversaryGame), the puzzle (PuzzleLogic.lua) and the guessing tournament (AnniversaryGuess.lua). The tower and
 * the map's fights go through the named-field families of named-tower-data.ts.
 *
 * Progress lives in task values; each layout is copied from the 0.1.3 client script that reads it (the test
 * anniversary-data.test.ts compares them with the Lua when GCG_CLIENT_LUA_DIR points at the decrypted scripts).
 * Opening dates stay on the client. Tables are in resources/tower (byte copies, see provenance.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { BaseAward } from "./chapter-config.js";
import {
  int,
  numbers,
  parseAwards,
  parseTable,
  positional,
  whole,
  type Row,
} from "./event-tower-data.js";
import { NAMED_COMMAND } from "./named-tower-data.js";

// ---------------------------------------------------------------- task layouts

/** GridActLogic: visits in group 80 (offset (map - 1) * 200 + grid), everything else in group 81. */
export const GRID_TASK = {
  visitGroup: 80,
  visitStride: 200,
  group: 81,
  /** Task 81/<map id> holds the grid the team stands on. */
  attribute: 4000,
  processReward: 19000,
  processStride: 3,
  /** The attribute's exp per skill point and per level (GridActLogic ExpAdd, ExpCost). */
  expAdd: 50,
  expCost: 100,
  power: 58,
  points: 59,
} as const;

/** AnniversaryMainLogic: capsule pond 1901, drawn counts 1902+, girl love 2001+, story bits 2501+. */
export const MAIN_TASK = {
  group: 81,
  pondId: 1901,
  pondCount: 1902,
  love: 2001,
  story: 2501,
  maxLove: 3,
} as const;
/** AnniversaryMainLogic.LoveItem: the gift. */
export const LOVE_ITEM = [15, 88, 1, 1] as const;

/** AnniversaryBoard: group 83. */
export const BOARD_TASK = {
  group: 83,
  letterOpened: 1,
  photos: 2,
  awardTaken: 3,
  lastDay: 4,
  photoCount: 14,
} as const;
/** The reward the board screen previews (ui_anniversaryboard: UI_RewardCheck {6, 28, 55, 4, 1}). */
export const BOARD_AWARD: BaseAward = [6, 28, 55, 4, 1];

/** PuzzleLogic: group 86, one task per board (bits 1-18 pieces, 21-24 awards taken). */
export const PUZZLE_TASK = {
  group: 86,
  pieces: 18,
  awardBit: 21,
  awards: 4,
} as const;

/** AnniversaryGuess: group 84. */
export const GUESS_TASK = {
  group: 84,
  phase: 1,
  turn: 2,
  daily: 3,
  join: 4,
  current: 7,
  rateSum: 9,
  girl: 10,
  awardFlags: 31,
} as const;
/** A round has six opponents (UI_AnniversaryGuessMain draws six slots); a match is best of three. */
export const GUESS_ROUND_SIZE = 6;
export const GUESS_MATCH_TRIES = 3;
export const GUESS_LOG_ROUNDS = 20;

/** ui.Error codes these screens show. */
export const ANNIVERSARY_ERROR = {
  /** Not open: nothing to play or claim. */
  closed: 20045,
  /** Not enough tries, gold fingers, tickets, gifts or coins. */
  short: 20043,
} as const;

// ---------------------------------------------------------------- state

export interface GuessLogEntry {
  nRound: number;
  tbGirls: { Girlid: number; tbResult: number[] }[];
}

/** What the side games keep outside task values. */
export interface AnniversaryState {
  /** missionDay of the last guess call: the free tries start again at 04:00 Shanghai. */
  guessDay?: number;
  /** The six opponents of the round in play (the client reads them from the 430 reply). */
  guessGirls?: number[];
  /** The last twenty rounds, newest last (433). */
  guessLog?: GuessLogEntry[];
}

// ---------------------------------------------------------------- tables

export interface GridCell {
  id: number;
  x: number;
  y: number;
  /** MapEvents id; -1 marks the start cell. */
  event: number;
}

export interface DiscoveryMap {
  id: number;
  /** ProcessPoint: per mille of the exploratory degree for each of the three rewards. */
  processPoints: number[];
  rewards: BaseAward[][];
  cells: Map<number, GridCell>;
  /** The start cell (event -1). */
  start: number;
}

export interface MapEvent {
  id: number;
  type: number;
  awards: BaseAward[];
  degree: number;
  /** Hinder (type 101) needs: the levels of strength, spirit and technique. */
  conditions: number[];
  /** [event id, level id] of the AnniversaryTowerLevel row a fight cell plays. */
  levelInfo: number[];
}

export interface PondItem {
  award: BaseAward;
  weight: number;
  count: number;
}

export interface GachaPool {
  id: number;
  limited: number;
  limitless: number;
  cost: BaseAward | null;
  /** Pond id to its limited items in table order (the drawn counts are tasks by position). */
  ponds: Map<number, PondItem[]>;
  endless: PondItem[];
}

export interface GirlStoryRow {
  girlId: number;
  loveLevel: number;
  skillLevels: number[];
  towerLevel: number[];
  rewards: BaseAward[];
  noGift: boolean;
}

export interface PuzzleBoard {
  id: number;
  moneyId: number;
  awards: { count: number; rewards: BaseAward[] }[];
}

export interface GuessAward {
  type: number;
  index: number;
  /** Type 1: [bouts], 2: [girl, wins], 3: [wins]. */
  limit: number[];
  items: BaseAward[];
}

export interface GuessConfig {
  /** Free tries a day, tries a throw costs, the gold finger wallet and the extra tries wallet. */
  dailyNum: number;
  useNum: number;
  goldId: number;
  moneyId: number;
  /** girlconfig.txt order: the position of a girl is the offset of her task. */
  girls: number[];
  /** "bout:girl" to the fist (1 rock, 2 scissors, 3 paper) RoundList fixes. */
  forced: Map<string, number>;
  rules: Map<number, { type: number; rate: number }>;
  awards: GuessAward[];
}

export class AnniversaryCatalog {
  readonly maps = new Map<number, DiscoveryMap>();
  readonly events = new Map<number, MapEvent>();
  readonly pools = new Map<number, GachaPool>();
  /** Story rows of each girl in table order: the position is the storyIdx the client sends. */
  readonly stories = new Map<number, GirlStoryRow[]>();
  readonly puzzles = new Map<number, PuzzleBoard>();
  guess: GuessConfig | null = null;
  /** The most any hinder or story asks of one attribute: the cap of 429. */
  readonly attributeCap = [0, 0, 0];

  private constructor() {}

  static load(directory: string): AnniversaryCatalog {
    const read = (file: string): Row[] =>
      parseTable(readFileSync(path.join(directory, file), "utf8"));
    const catalog = new AnniversaryCatalog();
    const activity = (file: string): string => `anniversaryactivity/${file}`;

    for (const row of read(activity("mapevents.txt"))) {
      if ((row.ID ?? "").trim() === "") continue;
      catalog.events.set(int(row.ID), {
        id: int(row.ID),
        type: int(row.EventType),
        awards: parseAwards(row.FirstAward),
        degree: int(row.ExploratoryDegree, 1),
        conditions: numbers(row.Conditions),
        levelInfo: numbers(row.LevelInfo),
      });
    }
    for (const event of catalog.events.values())
      event.conditions.forEach((need, index) => {
        if (index < 3)
          catalog.attributeCap[index] = Math.max(catalog.attributeCap[index]!, need);
      });

    for (const row of read(activity("anniversarydiscovery.txt"))) {
      const id = int(row.ID);
      if (id <= 0) continue;
      const cells = new Map<number, GridCell>();
      let start = 0;
      for (const cell of read(activity(`gridmap${id}.txt`))) {
        if ((cell.ID ?? "").trim() === "") continue;
        const entry: GridCell = {
          id: int(cell.ID),
          x: int(cell.PosX),
          y: int(cell.PosY),
          event: int(cell.Event),
        };
        cells.set(entry.id, entry);
        if (entry.event === -1) start = entry.id;
      }
      catalog.maps.set(id, {
        id,
        processPoints: numbers(row.ProcessPoint),
        rewards: [1, 2, 3].map((index) => parseAwards(row[`Reward${index}`])),
        cells,
        start,
      });
    }

    for (const row of read(activity("gachagame.txt"))) {
      const id = int(row.Id);
      if (id <= 0) continue;
      catalog.pools.set(id, {
        id,
        limited: int(row.LimitCount),
        limitless: int(row.LimitlessCount),
        cost: parseAwards(row.CostItem)[0] ?? null,
        ponds: new Map(),
        endless: [],
      });
    }
    for (const row of read(activity("gachagamepool.txt"))) {
      const pool = catalog.pools.get(int(row.Id));
      const award = parseAwards(row.OtherItem)[0];
      if (!pool || !award) continue;
      const item: PondItem = { award, weight: int(row.Weight), count: int(row.Count) };
      if (int(row.Limitless) === 1) pool.endless.push(item);
      else {
        const list = pool.ponds.get(int(row.PondId)) ?? [];
        list.push(item);
        pool.ponds.set(int(row.PondId), list);
      }
    }

    for (const row of read(activity("girlstory.txt"))) {
      const girlId = int(row.GirlId);
      if (girlId <= 0) continue;
      const story: GirlStoryRow = {
        girlId,
        loveLevel: int(row.LoveLevel),
        skillLevels: numbers(row.SkillLevel),
        towerLevel: numbers(row.TowerLevel),
        rewards: parseAwards(row.Reward),
        noGift: int(row.NoGift) === 1,
      };
      const list = catalog.stories.get(girlId) ?? [];
      list.push(story);
      catalog.stories.set(girlId, list);
      story.skillLevels.forEach((need, index) => {
        if (index < 3)
          catalog.attributeCap[index] = Math.max(catalog.attributeCap[index]!, need);
      });
    }

    for (const row of read(activity("puzzlecfg.txt"))) {
      const id = int(row.ID);
      if (id <= 0) continue;
      catalog.puzzles.set(id, {
        id,
        moneyId: int(row.MONEY),
        awards: [1, 2, 3, 4].map((index) => ({
          count: int(row[`COUNT${index}`]),
          rewards: parseAwards(row[`AWARD${index}`]),
        })),
      });
    }

    const time = read("anniversaryguess/timelist.txt")[0];
    if (time) {
      const guess: GuessConfig = {
        dailyNum: int(time.DailyNum),
        useNum: Math.max(1, int(time.UseNum, 1)),
        goldId: int(time.GoldID),
        moneyId: int(time.MoneyID),
        girls: [],
        forced: new Map(),
        rules: new Map(),
        awards: [],
      };
      for (const row of read("anniversaryguess/girlconfig.txt"))
        if (int(row.girlId) > 0) guess.girls.push(int(row.girlId));
      for (const row of read("anniversaryguess/roundlist.txt"))
        for (const girl of numbers(row.Girls))
          guess.forced.set(`${int(row.Round)}:${girl}`, int(row.Fist));
      for (const row of read("anniversaryguess/roundrate.txt"))
        guess.rules.set(int(row.GirlId), { type: int(row.Type), rate: int(row.Rate) });
      for (const row of read("anniversaryguess/awardlist.txt"))
        guess.awards.push({
          type: int(row.Type),
          index: int(row.Index),
          limit: numbers(row.LimitNum),
          items: parseAwards(row.Item),
        });
      catalog.guess = guess;
    }
    return catalog;
  }

  static #default: AnniversaryCatalog | undefined;
  static #defaultMissing = false;
  /** Why the default tables could not be loaded (set once by tryLoadDefault); the gateway logs it. */
  static loadError: unknown = undefined;

  static loadDefault(): AnniversaryCatalog {
    return (AnniversaryCatalog.#default ??= AnniversaryCatalog.load(
      path.resolve(process.cwd(), "resources/tower"),
    ));
  }

  /** The default tables, or null when they cannot be loaded: the calls then stay unhandled. */
  static tryLoadDefault(): AnniversaryCatalog | null {
    if (AnniversaryCatalog.#defaultMissing) return null;
    try {
      return AnniversaryCatalog.loadDefault();
    } catch (error) {
      AnniversaryCatalog.#defaultMissing = true;
      AnniversaryCatalog.loadError = error;
      return null;
    }
  }

  /** The exploratory degree of a map: the whole and what the visited cells give (GridActLogic.GetExploratoryDegree). */
  degree(map: DiscoveryMap, visited: (cell: GridCell) => boolean): [number, number] {
    let total = 0;
    let done = 0;
    for (const cell of map.cells.values()) {
      if (cell.event === -1) continue;
      const degree = this.events.get(cell.event)?.degree ?? 1;
      total += degree;
      if (visited(cell)) done += degree;
    }
    return [total, done];
  }
}

// ---------------------------------------------------------------- requests

export type AnniversaryRequest =
  /** 418 (add power) and 419 (reset a map) are test commands: accepted, nothing changes, no reply. */
  | { kind: "ignored"; command: number }
  | { kind: "move"; command: number; mapId: number; path: number[] }
  | { kind: "strengthen"; command: number; attribute: number }
  | { kind: "processReward"; command: number; mapId: number; index: number }
  | { kind: "boardOpen"; command: number }
  | { kind: "boardAward"; command: number }
  | {
      kind: "love";
      command: number;
      type: number;
      girlId: number;
      storyIdx: number;
    }
  | { kind: "gacha"; command: number; poolId: number }
  | {
      kind: "puzzle";
      command: number;
      op: "open" | "box";
      /** The request as the client sent it: the reply echoes it. */
      body: Record<string, unknown>;
      group: number;
      index: number;
    }
  | { kind: "guessRefresh"; command: number }
  | {
      kind: "guessFist";
      command: number;
      /** 1 rock, 2 scissors, 3 paper; null when the client timed out. */
      fist: number | null;
      gold: boolean;
      timeout: boolean;
      /** The throw the client hinted (RoundRate types 2 and 3). */
      hint: number | null;
    }
  | { kind: "guessAward"; command: number; type: number; index: number }
  | { kind: "guessLog"; command: number }
  /** FanEvent_Support (355) and FanEvent_Reward (356): the idol vote is not served. */
  | { kind: "fan"; command: number }
  /** Challenge_Award_Some (206): the ranking tower is not served. */
  | { kind: "challengeAward"; command: number };

function fieldsOf(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * Reads a C2S LuaCall of the Anniversary hub (all are CallServer, none comes inside DoSettle). Returns null for
 * everything else, which stays on the unhandled path. The families of named-tower-data.ts (421-423, 426-428) are
 * not here.
 */
export function parseAnniversaryCall(
  parameters: unknown,
  tables?: AnniversaryCatalog,
): AnniversaryRequest | null {
  if (typeof parameters !== "object" || parameters === null) return null;
  if (!(tables ?? AnniversaryCatalog.tryLoadDefault())) return null;
  const envelope = parameters as Record<string, unknown>;
  const command = whole(envelope.sCmd);
  if (command === null) return null;
  const body = fieldsOf(envelope.tbParam);
  switch (command) {
    case NAMED_COMMAND.gridPower:
    case NAMED_COMMAND.gridReset:
      return { kind: "ignored", command };
    case NAMED_COMMAND.gridMove:
      return {
        kind: "move",
        command,
        mapId: whole(body.MapID) ?? 0,
        path: (positional(body.Path) ?? [])
          .map((entry) => whole(entry) ?? 0)
          .filter((id) => id > 0),
      };
    case NAMED_COMMAND.strengthen:
      return { kind: "strengthen", command, attribute: whole(body.AttrIdx) ?? 0 };
    case NAMED_COMMAND.processReward:
      return {
        kind: "processReward",
        command,
        mapId: whole(body.MapID) ?? 0,
        index: whole(body.RewardIdx) ?? 0,
      };
    case NAMED_COMMAND.boardOpen:
      return { kind: "boardOpen", command };
    case NAMED_COMMAND.boardAward:
      return { kind: "boardAward", command };
    case NAMED_COMMAND.love:
      return {
        kind: "love",
        command,
        type: whole(body.nType) ?? 0,
        girlId: whole(body.girlId) ?? 0,
        storyIdx: whole(body.storyIdx) ?? 0,
      };
    case NAMED_COMMAND.gacha:
      return { kind: "gacha", command, poolId: whole(body.nId) ?? 0 };
    case NAMED_COMMAND.puzzleOpen:
    case NAMED_COMMAND.puzzleBox:
      return {
        kind: "puzzle",
        command,
        op: command === NAMED_COMMAND.puzzleOpen ? "open" : "box",
        body,
        group: whole(body.nGroup) ?? 0,
        index: whole(body.nIndex) ?? 0,
      };
    case NAMED_COMMAND.guessRefresh:
      return { kind: "guessRefresh", command };
    case NAMED_COMMAND.guessFist: {
      const fist = whole(body.nType);
      const hint = whole(body.nFist);
      return {
        kind: "guessFist",
        command,
        fist: fist !== null && fist >= 1 && fist <= 3 ? fist : null,
        gold: body.bGold === true,
        timeout: body.bTimeOut === true,
        hint: hint !== null && hint >= 1 && hint <= 3 ? hint : null,
      };
    }
    case NAMED_COMMAND.guessAward:
      return {
        kind: "guessAward",
        command,
        type: whole(body.nType) ?? 0,
        index: whole(body.nIndex) ?? 0,
      };
    case NAMED_COMMAND.guessLog:
      return { kind: "guessLog", command };
    case NAMED_COMMAND.fanSupport:
    case NAMED_COMMAND.fanReward:
      return { kind: "fan", command };
    case NAMED_COMMAND.challengeAwardSome:
      return { kind: "challengeAward", command };
    default:
      return null;
  }
}

/** Requests that change nothing: no store update and no task value push. */
export function anniversaryReadOnly(request: AnniversaryRequest): boolean {
  return (
    request.kind === "ignored" ||
    request.kind === "fan" ||
    request.kind === "challengeAward"
  );
}

/**
 * The reply a refused request gets, or undefined where the client has no handler or the answer would change
 * its screen (418 and 419 have no client handler; 424 refused is silent: `[]` would animate photo 1).
 */
export function anniversaryErrorReply(
  request: AnniversaryRequest,
  code: number,
): unknown {
  switch (request.kind) {
    case "ignored":
    case "boardOpen":
      return undefined;
    case "move":
      // MoveRsp moves the team on Err 0 and shows a tip on 1; any other value does nothing.
      return { Err: code === 1 ? 1 : 2, TeamPos: 0 };
    case "strengthen":
    case "processReward":
      // The client reads nError > 0 as a refusal.
      return { nError: code > 0 ? code : 1 };
    case "boardAward":
      // GetAwardRsp shows the reward only for a list of exactly five numbers.
      return [];
    case "love":
      return { nError: code };
    case "gacha":
      // UI_AnniversaryGame plays its animation for any answer, with the list of rewards (here none).
      return [];
    case "puzzle":
      // The server of these commands answers `tbRet = tbParam` with nRet; a negative one shows Puzzle.Error<N>.
      return { ...request.body, nRet: code };
    case "guessRefresh":
    case "guessFist":
    case "guessAward":
    case "guessLog":
      return { Error: code };
    case "fan":
      return { Error: ANNIVERSARY_ERROR.closed };
    case "challengeAward":
      return { res: false };
  }
}

// ---------------------------------------------------------------- GameRankMsg

/**
 * The ranking lists of the event screens (the music game, war chess, concert, idol vote, boss challenge ...) come
 * through GameRankLogic:SendToGetRankData: a SendCmd "GameRankMsg" with the array [top, mid, 1, first, [start,
 * limit]], answered by the S2C call ServerRankMsg. No other player is here, so every list is empty and the player
 * is not ranked.
 */
export interface GameRankRequest {
  /** The rank type: the three numbers the reply repeats in tbId. */
  id: [number, number, number];
}

export function parseGameRankCall(parameters: unknown): GameRankRequest | null {
  const list = positional(parameters);
  if (!list) return null;
  const top = whole(list[0]);
  const mid = whole(list[1]);
  if (top === null || mid === null || top < 0 || mid < 0) return null;
  return { id: [top, mid, whole(list[2]) ?? 1] };
}

/** GameRankLogic:ClientRankMsg reads tbData.tbId, max (entries), me (own place, 0 = none) and other (the list). */
export function gameRankReply(request: GameRankRequest): unknown {
  return { tbData: { tbId: request.id, max: 0, me: 0, other: [] } };
}
