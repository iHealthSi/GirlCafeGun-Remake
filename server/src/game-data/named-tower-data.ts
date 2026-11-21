/**
 * Event towers with a command set of their own and named-field requests:
 * the micro tower (MicroClimbTower), the armed survey (CoopClient), mixed
 * online, the buff tower, the Railgun linkage, the second anniversary tower and
 * its boss challenge.
 *
 * They share one flow: Enter (CallServer), Pass and Fail (GameManager.
 * SendInfoToServer, so DoSettle 252 wraps them), progress in task values. Each
 * family reads its own layout, copied from the constants at the top of its
 * 0.1.3 client script (the test named-tower-data.test.ts compares them with the
 * Lua when GCG_CLIENT_LUA_DIR points at the decrypted scripts). Level
 * prerequisites and opening dates stay on the client.
 *
 * Tables are in resources/tower (byte copies, see provenance.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import type { BaseAward } from "./chapter-config.js";
import {
  int,
  numbers,
  parseAwards,
  parseTable,
  parseWeighted,
  positional,
  whole,
  LUA_COMMAND_DO_SETTLE,
  type Row,
  type TowerLevel,
  type TowerPondSlot,
} from "./event-tower-data.js";
import { EVENT_MISSION_GROUP, parseMissionClaim } from "./event-mission-data.js";

export const NAMED_COMMAND = {
  microGet: 285,
  microEnter: 286,
  microPass: 287,
  microFail: 288,
  coopGet: 335,
  coopEnter: 336,
  coopPass: 337,
  coopFail: 338,
  coopSaveSp: 339,
  mixEnter: 451,
  mixPass: 452,
  mixFail: 453,
  mixSpCount: 454,
  mixBarrage: 455,
  linkageEnter: 401,
  linkagePass: 402,
  linkageFail: 403,
  linkageMission: 404,
  linkageGacha: 405,
  buffScoreAward: 376,
  buffEnter: 377,
  buffPass: 378,
  buffFail: 379,
  barrage2nd: 528,
  secondEnter: 529,
  secondPass: 530,
  secondFail: 531,
  bossEnter: 532,
  bossPass: 533,
  bossFail: 534,
  bossScoreAward: 535,
  coopEventApply: 260,
  coopEventReward: 261,
  reportLog: 223,
  rikiBgmLog: 282,
  musicEnter: 371,
  musicPass: 372,
  musicFail: 373,
  musicMission: 374,
  exchangeRefresh: 380,
  exchangeListing: 381,
  exchangeAward: 382,
  exchangeLog: 383,
  exchangeGive: 384,
  musicGameComplete: 388,
  musicGameRank: 389,
  musicGameFriendRank: 390,
  musicRelayLog: 391,
  fanList: 354,
  fanDaily: 357,
  monthMission: 436,
  chessEnter: 536,
  chessPass: 537,
  chessFail: 538,
  chessBoard: 539,
} as const;

/** ActivitiesLogic.ActivityType. */
export const ACTIVITY_TYPE = {
  microClimbTower: 12,
  coopClient: 17,
  musicTower: 19,
  buffTower: 20,
  musicInterest: 21,
  mixOnline: 24,
  linkage: 25,
  secondAnniversary: 27,
  bossChallenge: 28,
  warChess: 29,
} as const;

/** ActivitiesLogic.tbErrorCode values that these screens show. */
export const NAMED_ERROR = {
  invalid: 2,
  vigour: 5,
  point: 8,
  pondEmpty: 9,
  formation: 10,
  noAward: 12,
  gotAward: 13,
  /** The interest level has no fight left (tbErrorCode.Exhaust). */
  exhausted: 11,
  /** CoopClientEvent:OnEnterTower shows Error.20043 for 17. */
  noToken: 17,
} as const;

export type NamedFamilyKey =
  "micro" | "coop" | "mix" | "buff" | "linkage" | "second" | "boss" | "music" | "chess";

export interface NamedLevel extends TowerLevel {
  /** The difficulty column; 0 for tables without one. */
  diff: number;
  /** BossChallengeLevel.MaxScore. */
  maxScore: number;
  /** FirstAward with the sixth number kept: the concert interest levels pay by score, not by first clear. */
  firstScored: { award: BaseAward; score: number }[];
  /** CoopClientLevel.KillAward: [monster attribute, max kills, g-d-p-l-n of one kill]. */
  killAward: { attribute: number; max: number; award: BaseAward } | null;
  /** CoopClientLevel.OtherCost: [wallet id, count]. */
  otherCost: { moneyId: number; count: number } | null;
}

/** Where one family records progress. All keys are in group `group`. */
export interface NamedFamily {
  key: NamedFamilyKey;
  name: string;
  enter: number;
  pass: number;
  fail: number;
  activityType: number;
  group: number;
  /** Level table, relative to resources/tower. */
  levelFile: string;
  /** Request field with the tower (event) id; null when the request has none. */
  towerField: "nTowerId" | "nId" | null;
  /** Request fields the Enter reply echoes in tbData. */
  echo: readonly string[];
  /** The task that holds the clear record of a level. */
  recordKey: (level: NamedLevel) => number;
  /** The bit of that task a clear sets; -1 when the task counts clears. */
  recordBit: (level: NamedLevel) => number;
  /** The Enter reply echoes the request's nType (the music tower and its interest levels share 371). */
  echoRequestType?: boolean;
  /** Levels the family fights through Enter; others (relay, music select) are refused. */
  fought?: (level: NamedLevel) => boolean;
  /** Levels that send no formation (the concert's fixed-team levels). */
  noFormation?: (level: NamedLevel) => boolean;
}

export const MICRO_DIFF_MAX = 5;
export const MICRO_TASK = { pass: 100, score: 200, goals: 300, story: 403 } as const;
export const COOP_TASK = { maxScore: 5, pass: 10 } as const;
export const MIX_TASK = { currentId: 1001, nodes: 1002 } as const;
export const BUFF_TASK = {
  total: 5008,
  got: 5009,
  pass: 5100,
  score: 5200,
  diffCount: 6,
} as const;
export const LINKAGE_TASK = {
  actId: 3001,
  pass: 3002,
  gacha: 3200,
  pondSize: 20,
} as const;
export const SECOND_TASK = { pass: 30010 } as const;
export const BOSS_TASK = {
  got: 30104,
  pass: 30110,
  score: 30150,
  diffCount: 6,
} as const;

/** MusicActivityLogic: group 64, level records 4100 + LevelId (a bit per difficulty), relay choices 6000-6998. */
export const MUSIC_TASK = {
  group: 64,
  pass: 4100,
  relay: 6000,
  relayEnter: 6999,
} as const;
/** MusicActivityLogic.InterestTeamId: the formation of the interest levels (type 6). */
export const MUSIC_INTEREST_TEAM = 5000;
export const MUSIC_GAME_TASK = { group: 1, score: 3100, maxGameId: 100 } as const;
/** WarChessTower.lua: group 97, level records 110 + LevelId (clear count), the board 201-1000. */
export const CHESS_TASK = {
  group: 97,
  pass: 110,
  map: 201,
  steps: 202,
  fightCache: 203,
  teamHp: [204, 205],
  bossMove: 206,
  round: 207,
  freeze: 208,
  mapPass: 210,
  minRound: 250,
  bossHp: 300,
  mapScore: 320,
  grid: 500,
  gridEnd: 1000,
  maxMaps: 20,
} as const;
/** ChessMap sizes: the team formations of the war chess board. */
export const CHESS_TEAM_FORMATION = [5106, 5107] as const;

export const NAMED_FAMILIES: Readonly<Record<NamedFamilyKey, NamedFamily>> = {
  micro: {
    key: "micro",
    name: "micro tower",
    enter: NAMED_COMMAND.microEnter,
    pass: NAMED_COMMAND.microPass,
    fail: NAMED_COMMAND.microFail,
    activityType: ACTIVITY_TYPE.microClimbTower,
    group: 59,
    levelFile: "microtower/firsttower/firsttowerlevel.txt",
    towerField: "nTowerId",
    echo: ["nTowerId", "nLevelId", "nDiff"],
    recordKey: (l) => MICRO_TASK.pass + l.levelId * MICRO_DIFF_MAX + l.diff,
    recordBit: () => -1,
  },
  coop: {
    key: "coop",
    name: "armed survey",
    enter: NAMED_COMMAND.coopEnter,
    pass: NAMED_COMMAND.coopPass,
    fail: NAMED_COMMAND.coopFail,
    activityType: ACTIVITY_TYPE.coopClient,
    group: 68,
    levelFile: "coopclient/coopclientlevel.txt",
    towerField: "nId",
    echo: ["nType", "nId", "nLevelId"],
    recordKey: (l) => COOP_TASK.pass + l.levelId,
    recordBit: () => -1,
  },
  mix: {
    key: "mix",
    name: "mixed online",
    enter: NAMED_COMMAND.mixEnter,
    pass: NAMED_COMMAND.mixPass,
    fail: NAMED_COMMAND.mixFail,
    activityType: ACTIVITY_TYPE.mixOnline,
    group: 68,
    // The levels come through the node tables, see NamedTowerCatalog.mixNodes.
    levelFile: "mixonline/mixonlinelevel.txt",
    towerField: null,
    echo: ["nodeId"],
    recordKey: () => MIX_TASK.nodes,
    recordBit: (l) => l.node,
  },
  buff: {
    key: "buff",
    name: "buff tower",
    enter: NAMED_COMMAND.buffEnter,
    pass: NAMED_COMMAND.buffPass,
    fail: NAMED_COMMAND.buffFail,
    activityType: ACTIVITY_TYPE.buffTower,
    group: 64,
    levelFile: "bufftower/bufftowerlevel.txt",
    towerField: "nId",
    echo: ["nType", "nId", "nLevelId", "nDiff"],
    recordKey: (l) => BUFF_TASK.pass + l.levelId,
    recordBit: (l) => l.diff - 1,
  },
  linkage: {
    key: "linkage",
    name: "linkage",
    enter: NAMED_COMMAND.linkageEnter,
    pass: NAMED_COMMAND.linkagePass,
    fail: NAMED_COMMAND.linkageFail,
    activityType: ACTIVITY_TYPE.linkage,
    group: 63,
    levelFile: "linkageactivity/linkagelevel.txt",
    towerField: null,
    echo: ["nLevelId", "nDiff"],
    recordKey: (l) => LINKAGE_TASK.pass + l.levelId,
    recordBit: (l) => l.diff - 1,
  },
  second: {
    key: "second",
    name: "second anniversary tower",
    enter: NAMED_COMMAND.secondEnter,
    pass: NAMED_COMMAND.secondPass,
    fail: NAMED_COMMAND.secondFail,
    activityType: ACTIVITY_TYPE.secondAnniversary,
    group: 81,
    levelFile: "2ndanniversary/2ndanniversarytowerlevel.txt",
    towerField: "nId",
    echo: ["nType", "nId", "nLevelId"],
    recordKey: (l) => SECOND_TASK.pass + l.levelId,
    recordBit: (l) => l.tower - 1,
  },
  boss: {
    key: "boss",
    name: "boss challenge",
    enter: NAMED_COMMAND.bossEnter,
    pass: NAMED_COMMAND.bossPass,
    fail: NAMED_COMMAND.bossFail,
    activityType: ACTIVITY_TYPE.bossChallenge,
    group: 81,
    levelFile: "bosschallenge/bosschallengelevel.txt",
    towerField: "nId",
    echo: ["nId", "nLevelId", "nDiff"],
    recordKey: (l) => BOSS_TASK.pass + l.levelId,
    recordBit: (l) => l.diff - 1,
  },
  music: {
    key: "music",
    name: "concert tower",
    enter: NAMED_COMMAND.musicEnter,
    pass: NAMED_COMMAND.musicPass,
    fail: NAMED_COMMAND.musicFail,
    activityType: ACTIVITY_TYPE.musicTower,
    group: MUSIC_TASK.group,
    levelFile: "musicactivity/musiclevel.txt",
    towerField: null,
    echo: ["nType", "nLevelId", "nDiff"],
    recordKey: (l) => MUSIC_TASK.pass + l.levelId,
    recordBit: (l) => l.diff - 1,
    echoRequestType: true,
    // Types 5 (relay) and 7 (music select) are screens, 0 to 2, 4 and 6 are fought.
    fought: (l) => l.type !== 5 && l.type !== 7,
    noFormation: (l) => l.type === 4,
  },
  chess: {
    key: "chess",
    name: "war chess tower",
    enter: NAMED_COMMAND.chessEnter,
    pass: NAMED_COMMAND.chessPass,
    fail: NAMED_COMMAND.chessFail,
    activityType: ACTIVITY_TYPE.warChess,
    group: CHESS_TASK.group,
    levelFile: "warchesstower/warchesstowerlevel.txt",
    towerField: "nId",
    echo: ["nId", "nLevelId", "nFormationId"],
    recordKey: (l) => CHESS_TASK.pass + l.levelId,
    recordBit: () => -1,
  },
};

const FAMILY_OF_COMMAND = new Map<
  number,
  { family: NamedFamily; step: "enter" | "pass" | "fail" }
>();
for (const family of Object.values(NAMED_FAMILIES)) {
  FAMILY_OF_COMMAND.set(family.enter, { family, step: "enter" });
  FAMILY_OF_COMMAND.set(family.pass, { family, step: "pass" });
  FAMILY_OF_COMMAND.set(family.fail, { family, step: "fail" });
}

export function namedLevelKey(tower: number, levelId: number, diff: number): string {
  return `${tower}:${levelId}:${diff}`;
}

export interface MicroGoal {
  id: number;
  points: number;
  rewards: BaseAward[];
}

export interface ScoreAwardRow {
  index: number;
  score: number;
  awards: BaseAward[];
}

/** A TowerPond.txt row; Sp 1 marks the slots the gacha screen shows with an effect. */
export interface LinkagePondSlot extends TowerPondSlot {
  special: boolean;
}

/** ConcertExchange timelist.txt: one season of the collection exchange. */
export interface ExchangeSeason {
  id: number;
  /** [wallet id, count] of each of the four collection currencies. */
  collections: number[][];
  maxListing: number;
  /** The gift paid for giving a collection piece away. */
  award: BaseAward[];
}

export interface ExchangeReward {
  id: number;
  /** Rare rewards (type 1) carry a TaskId 1..; basic rewards (type 2) none. */
  taskId: number;
  type: number;
  award: BaseAward;
}

export interface ChessMap {
  id: number;
  mapId: number;
  diff: number;
  maxItems: number;
  columns: number;
  rows: number;
  /** [x, y] of the cells a team can start on. */
  birth: number[][];
  /** [x, y, ChessBoss id] of each boss, in boss order (boss index = position + 1). */
  bosses: number[][];
  walls: number[][];
  cafe: number[];
}

export interface ChessBoss {
  id: number;
  actId: number;
  levelId: number;
  spSkill: number;
}

export interface LinkageMissionRows {
  daily: number;
  /** States 1 to 4: the mission ids of each. */
  states: number[][];
}

function toLevel(row: Row, tower: number, levelId: number, diff: number): NamedLevel {
  const weights = (text: string | undefined, fallback: number) =>
    parseWeighted(text).map(({ award, weight }) => ({
      award,
      weight: weight ?? fallback,
    }));
  const kill = parseKillAward(row.KillAward);
  const cost = numbers(row.OtherCost);
  return {
    tower,
    levelId,
    type: int(row.LevelType),
    node: 0,
    cost: int(row.PreCost),
    masterExp: int(row.MasterExp),
    cardExp: int(row.CardExp),
    randDropNum: int(row.RandDropNum),
    firstAwards: parseAwards(row.FirstAward),
    fixedAwards: weights(row.FixAward, 10_000),
    randomAwards: weights(row.RandomAward, 0),
    diff,
    firstScored: parseWeighted(row.FirstAward).map(({ award, weight }) => ({
      award,
      score: weight ?? 0,
    })),
    maxScore: int(row.MaxScore),
    killAward: kill,
    otherCost: cost.length >= 2 ? { moneyId: cost[0]!, count: cost[1]! } : null,
  };
}

/** "[7,150,15-78-1-1-10]": monster attribute, most kills that count, the award of one kill. */
function parseKillAward(text: string | undefined): NamedLevel["killAward"] {
  const match = /\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)-(\d+)-(\d+)-(\d+)-(\d+)\s*\]/.exec(
    text ?? "",
  );
  if (!match) return null;
  const [, attribute, max, g, d, p, l, n] = match.map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  return { attribute, max, award: [g, d, p, l, n] };
}

export class NamedTowerCatalog {
  /** Levels by family, then "tower:level:diff" (mixed online: activity id, node id, 0). */
  readonly levels = new Map<NamedFamilyKey, Map<string, NamedLevel>>();
  /** MicroTowerGoal.txt by "tower:level:diff". */
  readonly microGoals = new Map<string, MicroGoal[]>();
  /** BuffTowerBuff.txt: the score of each buff by "id:level:diff", in row order (the client's position list). */
  readonly buffScores = new Map<string, number[]>();
  readonly buffAwards = new Map<number, ScoreAwardRow[]>();
  readonly bossAwards = new Map<number, ScoreAwardRow[]>();
  /** MixOnlineActivities.txt ids in table order. */
  readonly mixActivities: number[] = [];
  /** Cartoon nodes of mixed online by "activity:node" (also in levels.mix). */
  readonly mixCartoons = new Set<string>();
  readonly linkageIds: number[] = [];
  readonly linkageMissions = new Map<number, LinkageMissionRows>();
  /** The missions the map's mission nodes (LinkageLevel type 3, ExtendParam) wait for. */
  readonly linkageNodeMissions: number[] = [];
  readonly linkagePonds = new Map<number, LinkagePondSlot[]>();
  linkageToken: { times: number; cost: number; moneyId: number } | null = null;
  /** BarrageText.txt: how many texts each of the four columns has. */
  readonly barrageSizes: number[] = [0, 0, 0, 0];
  /** MusicTower.txt: the issue (MusicTowerTotal.Id) each level belongs to, main and sub levels. */
  readonly musicIssueOfLevel = new Map<number, number>();
  readonly exchangeSeasons = new Map<number, ExchangeSeason>();
  readonly exchangeRewards: ExchangeReward[] = [];
  /** "id:mapId:diff". */
  readonly chessMaps = new Map<string, ChessMap>();
  readonly chessBosses = new Map<number, ChessBoss>();
  /** SpItem.txt: "id:itemId" to the item and what it does (1 move once, 2 twice, 3 obstacle, 4 freeze). */
  readonly chessItems = new Map<string, { gdpl: number[]; skill: number }>();

  private constructor() {}

  static load(directory: string): NamedTowerCatalog {
    const read = (file: string): Row[] =>
      parseTable(readFileSync(path.join(directory, file), "utf8"));
    const catalog = new NamedTowerCatalog();

    const plain: NamedFamilyKey[] = [
      "micro",
      "coop",
      "buff",
      "linkage",
      "second",
      "boss",
      "music",
      "chess",
    ];
    for (const key of plain) {
      const family = NAMED_FAMILIES[key];
      const levels = new Map<string, NamedLevel>();
      for (const row of read(family.levelFile)) {
        const levelId = int(row.LevelId);
        if (levelId <= 0) continue;
        const tower = family.towerField ? int(row.Id) : 0;
        const diff = int(row.Diff);
        if (family.towerField && tower <= 0) continue;
        levels.set(
          namedLevelKey(tower, levelId, diff),
          toLevel(row, tower, levelId, diff),
        );
      }
      catalog.levels.set(key, levels);
    }

    for (const row of read("microtower/microtowergoal.txt")) {
      const key = namedLevelKey(int(row.Id), int(row.LevelId), int(row.Diff));
      const list = catalog.microGoals.get(key) ?? [];
      list.push({
        id: int(row.GoalID),
        points: int(row.GoalPoint),
        rewards: parseAwards(row.Reward),
      });
      catalog.microGoals.set(key, list);
    }

    const buffCount = new Map<string, number[]>();
    for (const row of read("bufftower/bufftowerbuff.txt")) {
      const id = int(row.Id);
      if (id <= 0) continue;
      const key = `${id}:${int(row.LevelId)}:${int(row.Diff)}`;
      const list = buffCount.get(key) ?? [];
      list.push(int(row.Score));
      buffCount.set(key, list);
    }
    for (const [key, list] of buffCount) catalog.buffScores.set(key, list);

    const scoreAwards = (file: string, into: Map<number, ScoreAwardRow[]>): void => {
      for (const row of read(file)) {
        const id = int(row.Id);
        if (id <= 0 || int(row.Score) <= 0) continue;
        const list = into.get(id) ?? [];
        list.push({
          index: int(row.Index, 1),
          score: int(row.Score),
          awards: parseAwards(row.Awards),
        });
        into.set(id, list);
      }
    };
    scoreAwards("bufftower/bufftoweraward.txt", catalog.buffAwards);
    scoreAwards("bosschallenge/bosschallengescore.txt", catalog.bossAwards);

    for (const row of read("mixonline/barragetext.txt"))
      for (let column = 0; column < 4; column++)
        if ((row[`Text${column + 1}`] ?? "").trim() !== "")
          catalog.barrageSizes[column]!++;

    catalog.#loadMix(read);
    catalog.#loadLinkage(read);
    catalog.#loadMusicAndChess(read);
    return catalog;
  }

  #loadMusicAndChess(read: (file: string) => Row[]): void {
    for (const row of read("musicactivity/musictower.txt")) {
      const issue = int(row.Id);
      if (issue <= 0) continue;
      // SubLevelIds "[[71],[17-6]]": every number is a level id.
      for (const id of [int(row.MainLevelId), ...numbers(row.SubLevelIds)])
        if (id > 0) this.musicIssueOfLevel.set(id, issue);
    }
    for (const row of read("concertexchange/timelist.txt")) {
      const id = int(row.ID);
      if (id <= 0) continue;
      this.exchangeSeasons.set(id, {
        id,
        collections: [1, 2, 3, 4]
          .map((column) => numbers(row[`Collection${column}`]))
          .filter((pair) => pair.length >= 2),
        maxListing: int(row.MaxListing),
        award: parseAwards(row.Award),
      });
    }
    for (const row of read("concertexchange/rewardlist.txt")) {
      const award = parseAwards(row.NormalAward)[0];
      if (int(row.ID) > 0 && award)
        this.exchangeRewards.push({
          id: int(row.ID),
          taskId: int(row.TaskId),
          type: int(row.Type),
          award,
        });
    }
    for (const row of read("warchesstower/chessmap.txt")) {
      const size = numbers(row.MapSize);
      if (
        int(row.Id) <= 0 ||
        int(row.MapId) <= 0 ||
        int(row.Diff) <= 0 ||
        size.length < 2
      )
        continue;
      const pairs = (text: string | undefined, width: number): number[][] => {
        const list = numbers(text);
        const result: number[][] = [];
        for (let at = 0; at + width <= list.length; at += width)
          result.push(list.slice(at, at + width));
        return result;
      };
      const map: ChessMap = {
        id: int(row.Id),
        mapId: int(row.MapId),
        diff: int(row.Diff),
        maxItems: int(row.MaxItemCount),
        columns: size[0]!,
        rows: size[1]!,
        birth: pairs(row.PlayerBirthPos, 2),
        bosses: pairs(row.BossBirthPos, 3),
        walls: pairs(row.UnmovablePos, 2),
        cafe: numbers(row.CafePos).slice(0, 2),
      };
      this.chessMaps.set(`${map.id}:${map.mapId}:${map.diff}`, map);
    }
    for (const row of read("warchesstower/chessboss.txt")) {
      const id = int(row.Id);
      if (id > 0)
        this.chessBosses.set(id, {
          id,
          actId: int(row.ActId),
          levelId: int(row.LevelId),
          spSkill: int(row.SpSkillId),
        });
    }
    for (const row of read("warchesstower/spitem.txt")) {
      if (int(row.Id) > 0 && int(row.ItemId) > 0)
        this.chessItems.set(`${int(row.Id)}:${int(row.ItemId)}`, {
          gdpl: numbers(row.GDPL),
          skill: int(row.SpSkill),
        });
    }
  }

  /**
   * Mixed online addresses a node, not a level: a node either plays a cartoon
   * (Type 1, paid with CartoonReward) or points at "id_level" of
   * MixOnlineLevel.txt. Type 3 nodes point at an online level (CoopLevel), which
   * this single-player server does not have.
   */
  #loadMix(read: (file: string) => Row[]): void {
    const levels = new Map<string, NamedLevel>();
    this.levels.set("mix", levels);
    const byKey = new Map<string, Row>();
    for (const row of read("mixonline/mixonlinelevel.txt")) {
      if (int(row.LevelId) > 0) byKey.set(`${int(row.Id)}:${int(row.LevelId)}`, row);
    }
    for (const activity of read("mixonline/mixonlineactivities.txt")) {
      const id = int(activity.Id);
      const file = (activity.NodeConf ?? "").trim().toLowerCase();
      if (id <= 0 || file === "") continue;
      this.mixActivities.push(id);
      for (const node of read(`mixonline/${file}`)) {
        const nodeId = int(node.NodeId);
        if (nodeId <= 0) continue;
        const type = int(node.Type);
        if (type === 1) {
          const cartoon = toLevel({}, id, nodeId, 0);
          cartoon.type = 2;
          cartoon.node = nodeId;
          cartoon.firstAwards = parseAwards(node.CartoonReward);
          levels.set(namedLevelKey(id, nodeId, 0), cartoon);
          this.mixCartoons.add(`${id}:${nodeId}`);
          continue;
        }
        if (type !== 2) continue;
        const target = (node.Level ?? "").split("_").map(Number);
        const row = byKey.get(`${target[0]}:${target[1]}`);
        if (!row) continue;
        const level = toLevel(row, id, nodeId, 0);
        level.node = nodeId;
        levels.set(namedLevelKey(id, nodeId, 0), level);
      }
    }
  }

  #loadLinkage(read: (file: string) => Row[]): void {
    for (const row of read("linkageactivity/linkagetower.txt")) {
      const id = int(row.Id);
      if (id > 0) this.linkageIds.push(id);
    }
    for (const row of read("linkageactivity/linkagemission.txt")) {
      const id = int(row.Id);
      if (id <= 0) continue;
      this.linkageMissions.set(id, {
        daily: int(row.DailyMission),
        states: [1, 2, 3, 4].map((state) => numbers(row[`State${state}Mission`])),
      });
    }
    for (const row of read("linkageactivity/linkagelevel.txt"))
      if (int(row.LevelType) === 3 && int(row.ExtendParam) > 0)
        this.linkageNodeMissions.push(int(row.ExtendParam));
    for (const row of read("linkageactivity/towerpond.txt")) {
      const pond = int(row.PondId);
      const award = parseAwards(row.Item)[0];
      if (pond <= 0 || !award) continue;
      const list = this.linkagePonds.get(pond) ?? [];
      list.push({
        award,
        key: false,
        loop: 0,
        special: int(row.Sp) === 1,
        weight: int(row.Weight),
        count: int(row.Count),
      });
      this.linkagePonds.set(pond, list);
    }
    const token = read("linkageactivity/towerpondtoken.txt")[0];
    if (token)
      this.linkageToken = {
        times: Math.max(1, int(token.LotteryTimes)),
        cost: int(token.CostCount),
        moneyId: int(token.CostType),
      };
  }

  static #default: NamedTowerCatalog | undefined;

  static loadDefault(): NamedTowerCatalog {
    return (NamedTowerCatalog.#default ??= NamedTowerCatalog.load(
      path.resolve(process.cwd(), "resources/tower"),
    ));
  }

  static #defaultMissing = false;

  /** Why the default tables could not be loaded (set once by tryLoadDefault); the gateway logs it. */
  static loadError: unknown = undefined;

  /** The default tables, or null when they cannot be loaded: the calls then stay unhandled. */
  static tryLoadDefault(): NamedTowerCatalog | null {
    if (NamedTowerCatalog.#defaultMissing) return null;
    try {
      return NamedTowerCatalog.loadDefault();
    } catch (error) {
      NamedTowerCatalog.#defaultMissing = true;
      NamedTowerCatalog.loadError = error;
      return null;
    }
  }

  level(
    key: NamedFamilyKey,
    tower: number,
    levelId: number,
    diff: number,
  ): NamedLevel | null {
    return this.levels.get(key)?.get(namedLevelKey(tower, levelId, diff)) ?? null;
  }

  /** The levels of one event (buff tower Id, boss challenge Id). */
  eventLevels(key: NamedFamilyKey, tower: number): NamedLevel[] {
    return [...(this.levels.get(key)?.values() ?? [])].filter((l) => l.tower === tower);
  }
}

// ================================================================ requests

export type NamedTowerRequest =
  | {
      kind: "enter" | "pass" | "fail";
      family: NamedFamilyKey;
      command: number;
      /** The event id from the request, 0 where the family has none (the server knows it). */
      towerId: number;
      levelId: number;
      diff: number;
      /** Mixed online: the node id. */
      node: number;
      formationId: number;
      /** The whole request body: Pass reads goals, buffs, kills and so on from it. */
      body: Record<string, unknown>;
    }
  | { kind: "echo"; command: number; field: "nTowerId" | "nId"; value: number }
  | { kind: "coopSaveSp"; command: number; save: boolean; maxDamage: number }
  | { kind: "scoreAward"; command: number; family: "buff" | "boss"; towerId: number }
  | { kind: "mixSpCount"; command: number }
  | { kind: "mixBarrage"; command: number; message: number[] | null }
  | { kind: "mixCartoon"; command: number; node: number }
  | { kind: "coopEventReward"; command: number }
  | { kind: "linkageMission"; command: number; stateId: number; missionId: number }
  | { kind: "linkageGacha"; command: number; pondId: number }
  | { kind: "secondBarrage"; command: number }
  | { kind: "mission"; command: number; group: number; type: number; ids: number[] }
  | {
      kind: "exchange";
      command: number;
      op: "refresh" | "listing" | "award" | "log" | "give";
      typeId: number;
      /** Give: the player asked to give to (no other players here). */
      roleId: number;
      /** Listing: Type 0 lists a collection piece, 1 cancels the listing. */
      cancel: boolean;
    }
  | {
      kind: "musicGame";
      command: number;
      op: "complete" | "rank" | "friendRank";
      gameId: number;
      score: number;
      rating: number;
    }
  /** FanEvent_GetList (354) and GetPreDaily (357): the exchange hub waits for the first. */
  | { kind: "fan"; command: number }
  | { kind: "chess"; command: number; body: Record<string, unknown> };

/** Commands the client sends and never waits for: accepted and logged, no reply. */
export const NAMED_LOG_COMMANDS: ReadonlySet<number> = new Set([
  NAMED_COMMAND.reportLog,
  NAMED_COMMAND.rikiBgmLog,
  NAMED_COMMAND.musicRelayLog,
]);

export interface NamedTowerCall {
  request: NamedTowerRequest;
  /** True when the request came inside DoSettle (252); the reply goes back the same way. */
  settled: boolean;
}

function fieldsOf(body: unknown): Record<string, unknown> {
  return typeof body === "object" && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * Reads a C2S LuaCall. Returns null for everything these families do not
 * answer, so those stay on the unhandled path. 223 (WriteReportLog) is not
 * here: the client waits for nothing, the gateway only accepts it.
 */
export function parseNamedTowerCall(
  parameters: unknown,
  tables?: NamedTowerCatalog,
): NamedTowerCall | null {
  if (typeof parameters !== "object" || parameters === null) return null;
  const catalog = tables ?? NamedTowerCatalog.tryLoadDefault();
  if (!catalog) return null;
  let envelope = parameters as Record<string, unknown>;
  let settled = false;
  if (Number(envelope.sCmd) === LUA_COMMAND_DO_SETTLE) {
    if (typeof envelope.tbParam !== "object" || envelope.tbParam === null) return null;
    envelope = envelope.tbParam as Record<string, unknown>;
    settled = true;
  }
  const command = whole(envelope.sCmd);
  if (command === null) return null;
  const body = fieldsOf(envelope.tbParam);
  const wrap = (request: NamedTowerRequest): NamedTowerCall => ({ request, settled });

  const step = FAMILY_OF_COMMAND.get(command);
  if (step) {
    const { family } = step;
    const node = family.key === "mix" ? (whole(body.nodeId) ?? 0) : 0;
    return wrap({
      kind: step.step,
      family: family.key,
      command,
      towerId: family.towerField ? (whole(body[family.towerField]) ?? 0) : 0,
      levelId: whole(body.nLevelId) ?? 0,
      diff: whole(body.nDiff) ?? 0,
      node,
      formationId: whole(body.nFormationId) ?? whole(body.formationId) ?? 0,
      body,
    });
  }

  switch (command) {
    case NAMED_COMMAND.microGet:
      return wrap({
        kind: "echo",
        command,
        field: "nTowerId",
        value: whole(body.nTowerId) ?? 0,
      });
    case NAMED_COMMAND.coopGet:
      return wrap({ kind: "echo", command, field: "nId", value: whole(body.nId) ?? 0 });
    case NAMED_COMMAND.coopSaveSp:
      return wrap({
        kind: "coopSaveSp",
        command,
        save: body.bSave === true,
        maxDamage: whole(body.maxDamage) ?? 0,
      });
    case NAMED_COMMAND.buffScoreAward:
      return wrap({
        kind: "scoreAward",
        command,
        family: "buff",
        towerId: whole(body.nId) ?? 0,
      });
    case NAMED_COMMAND.bossScoreAward:
      return wrap({
        kind: "scoreAward",
        command,
        family: "boss",
        towerId: whole(body.nId) ?? 0,
      });
    case NAMED_COMMAND.mixSpCount:
      return wrap({ kind: "mixSpCount", command });
    case NAMED_COMMAND.mixBarrage: {
      const list = positional(body.tbBarrage);
      const message =
        body.nType === 1 && list
          ? list.map((entry) => Math.max(1, whole(entry) ?? 1)).slice(0, 4)
          : null;
      return wrap({
        kind: "mixBarrage",
        command,
        message: message && message.length === 4 ? message : null,
      });
    }
    case NAMED_COMMAND.coopEventApply:
      return wrap({ kind: "mixCartoon", command, node: whole(body.idx) ?? 0 });
    case NAMED_COMMAND.coopEventReward:
      return wrap({ kind: "coopEventReward", command });
    case NAMED_COMMAND.linkageMission: {
      // ui_railgungacha sends {stateId, missionId} as a Lua array.
      const args = positional(envelope.tbParam) ?? [];
      return wrap({
        kind: "linkageMission",
        command,
        stateId: whole(args[0]) ?? 0,
        missionId: whole(args[1]) ?? 0,
      });
    }
    case NAMED_COMMAND.linkageGacha:
      return wrap({
        kind: "linkageGacha",
        command,
        pondId: whole(body.nPondId) ?? 0,
      });
    case NAMED_COMMAND.barrage2nd:
      return wrap({ kind: "secondBarrage", command });
    case NAMED_COMMAND.musicMission:
    case NAMED_COMMAND.monthMission: {
      const claim = parseMissionClaim(command, envelope.tbParam);
      return wrap({
        kind: "mission",
        command,
        group:
          command === NAMED_COMMAND.musicMission
            ? EVENT_MISSION_GROUP.music
            : EVENT_MISSION_GROUP.month,
        type: claim.type,
        ids: claim.ids,
      });
    }
    case NAMED_COMMAND.exchangeRefresh:
    case NAMED_COMMAND.exchangeListing:
    case NAMED_COMMAND.exchangeAward:
    case NAMED_COMMAND.exchangeLog:
    case NAMED_COMMAND.exchangeGive: {
      const ops = {
        [NAMED_COMMAND.exchangeRefresh]: "refresh",
        [NAMED_COMMAND.exchangeListing]: "listing",
        [NAMED_COMMAND.exchangeAward]: "award",
        [NAMED_COMMAND.exchangeLog]: "log",
        [NAMED_COMMAND.exchangeGive]: "give",
      } as const;
      return wrap({
        kind: "exchange",
        command,
        op: ops[command],
        typeId: whole(body.TypeId) ?? 0,
        roleId: whole(body.RoleId) ?? 0,
        cancel: whole(body.Type) === 1,
      });
    }
    case NAMED_COMMAND.musicGameComplete:
    case NAMED_COMMAND.musicGameRank:
    case NAMED_COMMAND.musicGameFriendRank:
      return wrap({
        kind: "musicGame",
        command,
        op:
          command === NAMED_COMMAND.musicGameComplete
            ? "complete"
            : command === NAMED_COMMAND.musicGameRank
              ? "rank"
              : "friendRank",
        gameId: whole(body.gameId) ?? whole(body.musicId) ?? 0,
        score: whole(body.score) ?? 0,
        rating: whole(body.type) ?? 0,
      });
    case NAMED_COMMAND.fanList:
    case NAMED_COMMAND.fanDaily:
      return wrap({ kind: "fan", command });
    case NAMED_COMMAND.chessBoard:
      return wrap({ kind: "chess", command, body });
    default:
      return null;
  }
}

/** Requests that read the save and change nothing (no store update, no task value push). */
export function namedTowerReadOnly(request: NamedTowerRequest): boolean {
  return (
    request.kind === "echo" ||
    request.kind === "mixSpCount" ||
    request.kind === "secondBarrage" ||
    request.kind === "coopEventReward" ||
    request.kind === "fan" ||
    (request.kind === "exchange" &&
      (request.op === "refresh" || request.op === "log")) ||
    (request.kind === "musicGame" && request.op !== "complete") ||
    (request.kind === "mixBarrage" && request.message === null)
  );
}

/** The error reply shape each command's client handler reads. */
export function namedTowerErrorReply(
  request: NamedTowerRequest,
  code: number,
): unknown {
  switch (request.kind) {
    case "fail":
      return {};
    case "enter":
      return { nError: code };
    case "pass":
      // CoopClientEvent:OnPassTower and MixOnlineLogic:OnPassLevel never read nError: they must find the
      // fields of a success reply, empty.
      return request.family === "coop" || request.family === "mix"
        ? {
            nError: code,
            tbData: [],
            nMasterExp: 0,
            nCardExp: 0,
            spKillNum: 0,
            curScore: 0,
          }
        : { nError: code };
    case "echo":
      return { [request.field]: request.value };
    case "coopSaveSp":
      // The client stores the whole reply as the list of awards (luacall.lua CoopClient_SaveSp).
      return [];
    case "mixSpCount":
      return { spCount: 0 };
    case "mixBarrage":
      return [];
    case "mixCartoon":
    case "coopEventReward":
      // Online_CoopEvent:OnResponse stores the list (empty: no reward screen);
      // EatingChicken:GotResponse shows "nothing to collect" for an empty one.
      return [];
    case "secondBarrage":
      return [];
    case "mission":
      // MissionManager shows ui.Error.<code> with the word "mission" or "achievement".
      return { Error: code, Type: request.type };
    case "exchange":
      return request.op === "refresh"
        ? { tbData: [] }
        : request.op === "log"
          ? { tbList: [] }
          : { Error: code, Type: request.cancel ? 1 : 0, TypeId: request.typeId };
    case "musicGame":
      return request.op === "friendRank" ? { musicId: request.gameId, tbList: [] } : [];
    case "fan":
      return request.command === NAMED_COMMAND.fanList
        ? { tbNewGirlList: [] }
        : { tbList: [] };
    case "chess":
      return { nType: whole(request.body.nType) ?? 0, nError: code };
    case "scoreAward":
    case "linkageMission":
    case "linkageGacha":
      return { nError: code };
  }
}

// ================================================================ run state

/**
 * One open or settled entry of these families, kept in the save beside the
 * event tower run of Tower.txt (a separate slot: a buff tower run "level 2"
 * must never match a Tower.txt settlement). The client resends a settlement
 * after a reconnect; a settlement without an open entry replays the stored
 * reply instead of paying again.
 */
export interface NamedTowerRunState {
  id: string;
  family: NamedFamilyKey;
  tower: number;
  level: number;
  diff: number;
  node: number;
  active: boolean;
  activityType: number;
  formationId: number;
  cardGuids: number[];
  /** The command that closed the run (pass or fail); 0 while it is open. */
  resultCmd: number;
  reply: unknown;
  /**
   * Armed survey SP level: the kills the pass counted and what saving pays,
   * until 339 settles them (once).
   */
  sp?: { kills: number; payout: BaseAward | null; settled: boolean };
}

export interface NamedTowerState {
  run?: NamedTowerRunState;
  /** Mixed online barrage messages this player sent: four text indexes each. */
  barrage?: number[][];
}

export function readNamedRun(
  state: NamedTowerState | undefined,
): NamedTowerRunState | null {
  const run = state?.run;
  if (
    !run ||
    typeof run.id !== "string" ||
    typeof run.family !== "string" ||
    !Number.isSafeInteger(run.tower) ||
    !Number.isSafeInteger(run.level) ||
    typeof run.active !== "boolean"
  )
    return null;
  return run;
}
