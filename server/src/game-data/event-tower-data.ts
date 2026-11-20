/**
 * Past event towers (Tower.txt, ActivitiesLogic.GetTower/EnterTower/PassTower/
 * FailTower and the node tower, lottery and swimwear score screens).
 *
 * The client keeps every tower's progress in task values. Each class has its own
 * layout; the constants below are copied from the top of its *Logic.lua in the
 * 0.1.3 client (the test event-tower-data.test.ts compares them with the Lua
 * when GCG_CLIENT_LUA_DIR points at the decrypted scripts). Level prerequisites
 * stay on the client: it reads these values to decide what to show, and the
 * server only has to write what it reads.
 *
 * Tables are in resources/tower (byte copies, see provenance.json).
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { AutoUseItemCatalog } from "./auto-use-item-data.js";
import {
  rollChapterAwards,
  type Award,
  type BaseAward,
  type ChapterLevelConfig,
} from "./chapter-config.js";

export const LUA_COMMAND_TOWER_GET = 53;
export const LUA_COMMAND_TOWER_ENTER = 54;
export const LUA_COMMAND_TOWER_PASS = 55;
export const LUA_COMMAND_TOWER_FAIL = 56;
export const LUA_COMMAND_SWIMWEAR_SERVER_SCORE = 61;
export const LUA_COMMAND_SWIMWEAR_SCORE_AWARD = 62;
export const LUA_COMMAND_SWIMWEAR_SERVER_AWARD = 63;
export const LUA_COMMAND_NODE_POINT_REWARD = 176;
export const LUA_COMMAND_POND_DRAW = 177;
export const LUA_COMMAND_POND_RESET = 178;
/** LuaCall.UpgradeTowerSkill: the twentieth and twenty-first tower skill screens. */
export const LUA_COMMAND_UPGRADE_TOWER_SKILL = 527;
/** LuaCall.BossRush_*: the sixteenth tower's SP stage (boss pick, teams, reset, result). */
export const LUA_COMMAND_BOSS_RUSH_SELECT = 510;
export const LUA_COMMAND_BOSS_RUSH_FORMATION = 511;
export const LUA_COMMAND_BOSS_RUSH_RESET = 512;
export const LUA_COMMAND_BOSS_RUSH_RESULT = 513;
/** LuaCall.DoSettle: GameManager.SendInfoToServer wraps 55 and 56 in it. */
export const LUA_COMMAND_DO_SETTLE = 252;

/** ActivitiesLogic.ActivityType.Challenge: the ranking tower, not served here. */
export const ACTIVITY_TYPE_CHALLENGE = 6;

/** ActivitiesLogic.tbErrorCode; the client shows UI_Activities.Tips<code>. */
export const TOWER_ERROR = {
  invalid: 2,
  vigour: 5,
  point: 8,
  pondEmpty: 9,
  formation: 10,
  noAward: 12,
  gotAward: 13,
} as const;

export type TowerProgress = "score" | "passCount" | "stars";

/** Where one tower class records its progress (group = task group). */
export interface TowerLayout {
  /** Level table, relative to resources/tower. */
  levelFile: string;
  group: number;
  /** Task key of a level is levelBase + LevelId (variegated: + slot). */
  levelBase: number;
  /** Goal points of a type 3 level: goalBase + LevelId; flags: goalBase + LevelId * 100 + GoalID. 0 = none. */
  goalBase: number;
  progress: TowerProgress;
  /** The class's task offset (node family and swimwear/absorb peak records are relative to it). */
  offset: number;
  /** Node family only. */
  pointFile?: string;
  pondFile?: string;
  tokenFile?: string;
  /** Skill table (twentieth and twenty-first tower); levels are at offset + SKILL_TASK_OFFSET + Id. */
  skillFile?: string;
  /** Personal score task key (swimwear, absorb peak, variegated). */
  scoreTask?: number;
}

/**
 * Every class of this slice. Values come from the 0.1.3 Lua, not from the
 * EN 1.0.9 build: ThirteenthTower there uses group 64 / 9100, the 0.1.3 script
 * uses the same slots as NinthTower (group 9, offset 2400, goals 60000).
 */
export const TOWER_LAYOUTS: Readonly<Record<string, TowerLayout>> = {
  SmallTower: layout("smalltower/smalltowerlevel.txt", 9, 1100, 10000, "score"),
  ChessTower: layout("chesstower/chesstowerlevel.txt", 9, 1500, 20000, "score"),
  NinthTower: layout("ninthtower/ninthtowerlevel.txt", 9, 2500, 60000, "score"),
  TwelfthTower: layout("twelfthtower/twelfthtowerlevel.txt", 64, 8201, 30000, "score"),
  ThirteenthTower: layout(
    "thirteenthtower/thirteenthtowerlevel.txt",
    9,
    2500,
    60000,
    "score",
  ),
  FourteenthTower: layout(
    "fourteenthtower/fourteenthtowerlevel.txt",
    96,
    101,
    10000,
    "score",
  ),
  SeventeenthTower: layout(
    "seventeenthtower/seventeenthtowerlevel.txt",
    96,
    401,
    20000,
    "score",
  ),
  EighteenthTower: layout(
    "eighteenthtower/eighteenthtowerlevel.txt",
    96,
    701,
    30000,
    "score",
  ),
  NineteenthTower: layout(
    "nineteenthtower/nineteenthtowerlevel.txt",
    96,
    1001,
    40000,
    "score",
  ),
  TwentiethTower: layout(
    "twentiethtower/twentiethtowerlevel.txt",
    96,
    1301,
    50000,
    "score",
    {
      offset: 1201,
      pondFile: "twentiethtower/towerpond.txt",
      tokenFile: "twentiethtower/towerpondtoken.txt",
      skillFile: "twentiethtower/towerskill.txt",
    },
  ),
  /** TwentyFirstTowerLogic: nTaskOffset 1701, nTaskSTLevel = offset + 100, goals 60000; no lottery. */
  TwentyFirstTower: layout(
    "twentyfirsttower/twentyfirsttowerlevel.txt",
    96,
    1801,
    60000,
    "score",
    { offset: 1701, skillFile: "twentyfirsttower/towerskill.txt" },
  ),
  TenthTower: layout("tenthtower/tenthtowerlevel.txt", 64, 2100, 10000, "passCount"),
  FifteenthTower: layout(
    "fifteenthtower/fifteenthtowerlevel.txt",
    64,
    3701,
    50000,
    "passCount",
  ),
  SixteenthTower: layout(
    "sixteenthtower/sixteenthtowerlevel.txt",
    64,
    60100,
    0,
    "passCount",
  ),
  Swimwear: layout("swimwear/swimwearlevel.txt", 34, 0, 0, "passCount", {
    scoreTask: 102,
  }),
  AbsorbPeak: layout("absorbpeak/absorbpeaklevel.txt", 34, 2000, 20000, "passCount", {
    offset: 2000,
    scoreTask: 2102,
  }),
  VariegatedTower: layout(
    "variegatedtower/variegatedtowerlevel.txt",
    64,
    2600,
    0,
    "passCount",
    { offset: 2600, scoreTask: 2804 },
  ),
  NodeTower: layout("nodetower/nodetowerlevel.txt", 9, 3100, 30000, "stars", {
    offset: 3000,
    pointFile: "nodetower/nodepointreward.txt",
    pondFile: "nodetower/nodetowerpond.txt",
    tokenFile: "nodetower/nodetowerpondtoken.txt",
  }),
  SeventhTower: layout("seventhtower/seventhtowerlevel.txt", 9, 3600, 50000, "stars", {
    offset: 3500,
    pointFile: "seventhtower/seventhpointreward.txt",
    pondFile: "seventhtower/seventhtowerpond.txt",
    tokenFile: "seventhtower/seventhtowerpondtoken.txt",
  }),
  EleventhTower: layout(
    "eleventhtower/eleventhtowerlevel.txt",
    64,
    7100,
    20000,
    "stars",
    {
      offset: 7000,
      pointFile: "eleventhtower/eleventhpointreward.txt",
      pondFile: "eleventhtower/eleventhtowerpond.txt",
      tokenFile: "eleventhtower/eleventhtowerpondtoken.txt",
    },
  ),
};

function layout(
  levelFile: string,
  group: number,
  levelBase: number,
  goalBase: number,
  progress: TowerProgress,
  extra: Partial<TowerLayout> = {},
): TowerLayout {
  return { levelFile, group, levelBase, goalBase, progress, offset: 0, ...extra };
}

/** Node family task offsets, relative to TowerLayout.offset (NodeTowerLogic.lua nTaskNT*). */
export const NODE_TASK = {
  score: 4,
  pondId: 5,
  pondResets: 6,
  pointAward: 20,
  nodePass: 50,
  spLevelScore: 150,
  pondRecord: 200,
  spPassCount: 450,
} as const;
/** SwimwearLogic.lua nSwimwearTaskIdAllServiceScoreAward / ...ScoreAward, relative to the offset. */
export const SWIMWEAR_TASK = { serverAward: 150, scoreAward: 200 } as const;
/** nPondSize: a pool has 20 slots. */
export const POND_SIZE = 20;
/** Tower.txt id of SixteenthTower, the boss rush. */
export const BOSS_RUSH_TOWER = 16;
/** SixteenthTowerLogic.lua, group 64 (the layout's group). */
export const BOSS_RUSH_TASK = {
  /** nTask_SaveFormation: 1 once the five teams are saved. */
  saved: 60003,
  /** nTask_PlayerHp / nTask_PlayerShield + team (1..5): percent left. */
  hp: 60010,
  shield: 60020,
  /** nTask_SpLevelId + LevelId: the picked SpLevel.txt Idx. */
  spLevel: 60200,
  /** nTask_SpPassTime + LevelId: seconds; 0 = not passed. */
  spTime: 60300,
} as const;
export const BOSS_RUSH_TEAMS = 5;
/** TwentiethTowerLogic / TwentyFirstTowerLogic nTaskNTSkillLevel = offset + 10; the key is that + the skill's Id. */
export const SKILL_TASK_OFFSET = 10;

/**
 * Event score and exp items that ItemList marks AutoUse. The original server
 * used them up on arrival and added to a task value; each entry names the
 * reader of that value (all in the 0.1.3 Lua):
 * - 15-17 swimwear score: SwimwearLogic nSwimwearTaskIdScore (offset + 102).
 * - 15-18 / 15-19 swimwear gun / clothes exp: offset + 104 / + 103 (ExpType 1 / 2).
 * - 15-30 absorb peak score: 2000 + 102. 15-31 / 15-32 ("OneExp" / "TwoExp") feed
 *   ExpType 1 / 2, that is 2000 + 104 / 2000 + 103. The pairing by name is INFERRED.
 * - 15-47..50 tenth tower talent exp of warzone ExtParam2: TenthTowerLogic
 *   GetTalentxp = 2000 + 90 + warzone.
 * - 15-105 / 15-106 fifteenth tower exp of warzone ExtParam2 (2 / 1): 3601 + 90 + warzone.
 */
export const TOWER_ITEM_TASKS: ReadonlyMap<string, { group: number; key: number }> =
  new Map([
    ["15-17-1-1", { group: 34, key: 102 }],
    ["15-18-1-1", { group: 34, key: 104 }],
    ["15-19-1-1", { group: 34, key: 103 }],
    ["15-30-1-1", { group: 34, key: 2102 }],
    ["15-31-1-1", { group: 34, key: 2104 }],
    ["15-32-1-1", { group: 34, key: 2103 }],
    ["15-47-1-1", { group: 64, key: 2091 }],
    ["15-48-1-1", { group: 64, key: 2092 }],
    ["15-49-1-1", { group: 64, key: 2093 }],
    ["15-50-1-1", { group: 64, key: 2094 }],
    ["15-105-1-1", { group: 64, key: 3693 }],
    ["15-106-1-1", { group: 64, key: 3692 }],
  ]);

export function towerItemTask(
  award: readonly number[],
): { group: number; key: number } | null {
  return (
    TOWER_ITEM_TASKS.get(`${award[0]}-${award[1]}-${award[2]}-${award[3]}`) ?? null
  );
}

export function makeTowerTaskId(group: number, key: number): number {
  return (group << 16) | key;
}

export interface TowerInfo {
  id: number;
  className: string;
  layout: TowerLayout;
  /** Tower.txt Money1GDPL, the event currency, when it is a wallet currency or a score item. */
  money1: readonly [number, number, number, number] | null;
  /** Wallet id of the event currency (autouse.txt ExtParam2), null for score items. */
  moneyId: number | null;
}

export interface TowerLevel {
  tower: number;
  levelId: number;
  /** 0 action, 1 SP challenge, 2 story, 3 star goals. */
  type: number;
  node: number;
  cost: number;
  masterExp: number;
  cardExp: number;
  randDropNum: number;
  firstAwards: BaseAward[];
  fixedAwards: { award: BaseAward; weight: number }[];
  randomAwards: { award: BaseAward; weight: number }[];
}

export interface TowerGoal {
  id: number;
  points: number;
}
export interface TowerGoalReward {
  points: number;
  rewards: BaseAward[];
}
export interface TowerPointReward {
  id: number;
  goal: number;
  rewards: BaseAward[];
}
export interface TowerPondSlot {
  award: BaseAward;
  key: boolean;
  weight: number;
  count: number;
  loop: number;
}
export interface TowerPondToken {
  times: number;
  cost: number;
  moneyId: number;
}
export interface TowerScoreAward {
  order: number;
  score: number;
  awards: BaseAward[];
}
/** One row of towerskill.txt: the upgrade item and the cost of each next level. */
export interface TowerSkill {
  /** The table's Id: the client's nId, the key suffix and the reply's skillId. */
  id: number;
  skillId: number;
  bindType: number;
  item: readonly [number, number, number, number];
  /** costs[level] is the price of level + 1, so the maximum level is costs.length. */
  costs: readonly number[];
}

type Row = Record<string, string>;

function parseTable(text: string): Row[] {
  const lines = text.split(/\r?\n/);
  const columns = (lines[2] ?? "").split("\t");
  const rows: Row[] = [];
  for (const line of lines.slice(3)) {
    if (line.trim() === "") continue;
    const cells = line.split("\t");
    const row: Row = {};
    columns.forEach((column, index) => {
      if (column) row[column] = cells[index] ?? "";
    });
    rows.push(row);
  }
  return rows;
}

function int(value: string | undefined, fallback = 0): number {
  const text = (value ?? "").trim();
  if (text === "") return fallback;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

/** "[15-6-1-1-9-10000,7-9-1-1-1-10000]": G-D-P-L-N with an optional weight. */
function parseWeighted(
  text: string | undefined,
): { award: BaseAward; weight?: number }[] {
  const result: { award: BaseAward; weight?: number }[] = [];
  for (const match of (text ?? "").matchAll(/\d+(?:-\d+){4,5}/g)) {
    const parts = match[0].split("-").map(Number);
    result.push({
      award: [parts[0]!, parts[1]!, parts[2]!, parts[3]!, parts[4]!],
      ...(parts[5] !== undefined ? { weight: parts[5] } : {}),
    });
  }
  return result;
}

function parseAwards(text: string | undefined): BaseAward[] {
  return parseWeighted(text).map(({ award }) => award);
}

function numbers(text: string | undefined): number[] {
  return [...(text ?? "").matchAll(/\d+/g)].map((match) => Number(match[0]));
}

export const ATTEMPT_KEY = (tower: number, level: number): string =>
  `${tower}:${level}`;

export class EventTowerCatalog {
  readonly towers = new Map<number, TowerInfo>();
  readonly levels = new Map<string, TowerLevel>();
  readonly goals = new Map<string, TowerGoal[]>();
  readonly goalRewards = new Map<string, TowerGoalReward[]>();
  /** VariegatedTowerLogic:GetLevelIndex: area * 20 + position, areas 1..5 counted even when empty. */
  readonly variegatedSlots = new Map<string, number>();
  readonly pointRewards = new Map<number, TowerPointReward[]>();
  readonly ponds = new Map<string, TowerPondSlot[]>();
  readonly tokens = new Map<string, TowerPondToken>();
  readonly scoreAwards = new Map<number, TowerScoreAward[]>();
  readonly serverAwards = new Map<number, TowerScoreAward[]>();
  /** Skills by tower id, then by the table's Id. */
  readonly skills = new Map<number, Map<number, TowerSkill>>();
  /** SpLevel.txt Idx values: the bosses the player may pick for each SP level of the boss rush. */
  readonly bossRushBosses = new Set<number>();
  /** SwimwearServerScore.txt: the score the client divides the server score by. */
  readonly allServiceScore = new Map<number, number>();

  private constructor() {}

  static load(directory: string): EventTowerCatalog {
    const read = (file: string): Row[] =>
      parseTable(readFileSync(path.join(directory, file), "utf8"));
    const catalog = new EventTowerCatalog();
    const autoUse = AutoUseItemCatalog.loadDefault();

    for (const row of read("tower.txt")) {
      const id = int(row.Id);
      const layoutOfClass = TOWER_LAYOUTS[row.ClassName ?? ""];
      if (id <= 0 || !layoutOfClass) continue;
      const gdpl = numbers(row.Money1GDPL);
      const money1 =
        gdpl.length === 4 ? ([gdpl[0]!, gdpl[1]!, gdpl[2]!, gdpl[3]!] as const) : null;
      const effect = money1 ? autoUse.effect(...money1) : null;
      catalog.towers.set(id, {
        id,
        className: row.ClassName!,
        layout: layoutOfClass,
        money1,
        moneyId: effect?.kind === "money" ? effect.moneyId : null,
      });
    }

    const levelFiles = new Set(
      [...catalog.towers.values()].map((t) => t.layout.levelFile),
    );
    for (const file of levelFiles) {
      for (const row of read(file)) {
        const tower = int(row.Id || row.TowerId);
        const levelId = int(row.LevelId);
        if (!catalog.towers.has(tower) || levelId <= 0) continue;
        const weights = (text: string | undefined, fallback: number) =>
          parseWeighted(text).map(({ award, weight }) => ({
            award,
            weight: weight ?? fallback,
          }));
        catalog.levels.set(ATTEMPT_KEY(tower, levelId), {
          tower,
          levelId,
          type: int(row.LevelType),
          node: int(row.NodeId),
          cost: int(row.PreCost),
          masterExp: int(row.MasterExp),
          cardExp: int(row.CardExp),
          randDropNum: int(row.RandDropNum),
          firstAwards: parseAwards(row.FirstAward),
          fixedAwards: weights(row.FixAward, 10_000),
          randomAwards: weights(row.RandomAward, 0),
        });
      }
    }

    for (const row of read("towergoal.txt")) {
      const key = ATTEMPT_KEY(int(row.Id), int(row.LevelId));
      const list = catalog.goals.get(key) ?? [];
      list.push({ id: int(row.GoalID), points: int(row.GoalPoint) });
      catalog.goals.set(key, list);
    }
    for (const row of read("towergoalreward.txt")) {
      const key = ATTEMPT_KEY(int(row.Id), int(row.LevelId));
      const list = catalog.goalRewards.get(key) ?? [];
      list.push({ points: int(row.GoalPoint), rewards: parseAwards(row.Reward) });
      catalog.goalRewards.set(key, list);
    }

    for (const row of read("variegatedtower/variegatedtower.txt")) {
      const tower = int(row.TowerId);
      for (let area = 1; area <= 5; area++) {
        numbers(row[`LevelArea${area}`]).forEach((levelId, position) => {
          catalog.variegatedSlots.set(
            ATTEMPT_KEY(tower, levelId),
            area * 20 + position + 1,
          );
        });
      }
    }

    for (const tower of catalog.towers.values()) catalog.#loadNodeFamily(tower, read);
    for (const tower of catalog.towers.values()) catalog.#loadSkills(tower, read);
    for (const row of read("sixteenthtower/splevel.txt")) {
      const idx = int(row.Idx);
      if (idx > 0) catalog.bossRushBosses.add(idx);
    }
    catalog.#loadScoreAwards(read);
    return catalog;
  }

  static #default: EventTowerCatalog | undefined;

  static loadDefault(): EventTowerCatalog {
    return (EventTowerCatalog.#default ??= EventTowerCatalog.load(
      path.resolve(process.cwd(), "resources/tower"),
    ));
  }

  static #defaultMissing = false;

  /** Why the default tables could not be loaded (set once, by tryLoadDefault); the gateway logs it. */
  static loadError: unknown = undefined;

  /**
   * The default tables, or null when they cannot be loaded (resources/tower is
   * not there in a phone package built without it, or a table is broken): the
   * tower calls then stay unhandled and every other call keeps working. The
   * reason is kept in loadError.
   */
  static tryLoadDefault(): EventTowerCatalog | null {
    if (EventTowerCatalog.#defaultMissing) return null;
    try {
      return EventTowerCatalog.loadDefault();
    } catch (error) {
      EventTowerCatalog.#defaultMissing = true;
      EventTowerCatalog.loadError = error;
      return null;
    }
  }

  /** Loads a table folder; on failure returns the error instead of throwing. */
  static tryLoad(
    directory: string,
  ): { catalog: EventTowerCatalog } | { error: unknown } {
    try {
      return { catalog: EventTowerCatalog.load(directory) };
    } catch (error) {
      return { error };
    }
  }

  #loadNodeFamily(tower: TowerInfo, read: (file: string) => Row[]): void {
    const { pointFile, pondFile, tokenFile } = tower.layout;
    if (pointFile) {
      this.pointRewards.set(
        tower.id,
        read(pointFile)
          .filter((row) => int(row.ActivityId) === tower.id)
          .map((row) => ({
            id: int(row.RewardId),
            goal: int(row.Gold),
            rewards: parseAwards(row.Rewards),
          })),
      );
    }
    if (pondFile) {
      for (const row of read(pondFile)) {
        // The twentieth tower's table carries no tower column.
        if (row.ActivityId !== undefined && int(row.ActivityId) !== tower.id) continue;
        const award = parseAwards(row.OtherItem)[0];
        if (!award) continue;
        const key = ATTEMPT_KEY(tower.id, int(row.PondId));
        const list = this.ponds.get(key) ?? [];
        list.push({
          award,
          key: int(row.Key) === 1,
          weight: int(row.Weight, 1),
          count: int(row.Count, 1),
          loop: int(row.Loop, 1),
        });
        this.ponds.set(key, list);
      }
    }
    if (tokenFile) {
      for (const row of read(tokenFile)) {
        if (row.ActivityId !== undefined && int(row.ActivityId) !== tower.id) continue;
        const moneyId = int(row.CostType, tower.moneyId ?? 0);
        if (moneyId <= 0) continue;
        this.tokens.set(ATTEMPT_KEY(tower.id, int(row.Type)), {
          times: int(row.LotteryTimes, 1),
          cost: int(row.CastCount),
          moneyId,
        });
      }
    }
  }

  #loadSkills(tower: TowerInfo, read: (file: string) => Row[]): void {
    const { skillFile } = tower.layout;
    if (!skillFile) return;
    const skills = new Map<number, TowerSkill>();
    for (const row of read(skillFile)) {
      const id = int(row.Id);
      const item = numbers(row.UpgradeItem);
      if (id <= 0 || item.length !== 4) continue;
      skills.set(id, {
        id,
        skillId: int(row.SkillId),
        bindType: int(row.BindType),
        item: [item[0]!, item[1]!, item[2]!, item[3]!],
        costs: numbers(row.UpgradeCost),
      });
    }
    this.skills.set(tower.id, skills);
  }

  #loadScoreAwards(read: (file: string) => Row[]): void {
    const load = (file: string, into: Map<number, TowerScoreAward[]>): void => {
      for (const row of read(file)) {
        const tower = int(row.Id);
        const list = into.get(tower) ?? [];
        list.push({
          order: int(row.OrderId),
          score: int(row.Score),
          awards: parseAwards(row.Awards),
        });
        into.set(tower, list);
      }
    };
    load("swimwear/swimwearscoreaward.txt", this.scoreAwards);
    load("absorbpeak/absorbpeakscoreaward.txt", this.scoreAwards);
    load("swimwear/swimwearallservicescoreaward.txt", this.serverAwards);
    load("absorbpeak/absorbpeakallservicescoreaward.txt", this.serverAwards);
    for (const file of [
      "swimwear/swimwearserverscore.txt",
      "absorbpeak/absorbpeakserverscore.txt",
    ])
      for (const row of read(file))
        this.allServiceScore.set(int(row.Id), int(row.Score));
  }

  level(tower: number, levelId: number): TowerLevel | null {
    return this.levels.get(ATTEMPT_KEY(tower, levelId)) ?? null;
  }

  /** Task key of a level's record. */
  levelKey(tower: TowerInfo, levelId: number): number {
    const slot = this.variegatedSlots.get(ATTEMPT_KEY(tower.id, levelId));
    return tower.layout.levelBase + (slot ?? levelId);
  }

  /** The SP levels (LevelType 1) of the boss rush, in level order. */
  bossRushSpLevels(): TowerLevel[] {
    return [...this.levels.values()]
      .filter((l) => l.tower === BOSS_RUSH_TOWER && l.type === 1)
      .sort((a, b) => a.levelId - b.levelId);
  }

  /** The level rows of one node, for "every level of the node is cleared". */
  nodeLevels(tower: number, node: number): TowerLevel[] {
    return [...this.levels.values()].filter(
      (l) => l.tower === tower && l.node === node,
    );
  }

  pondSlots(tower: number, pondId: number): TowerPondSlot[] | null {
    return this.ponds.get(ATTEMPT_KEY(tower, pondId)) ?? null;
  }
}

/** A level as rollChapterAwards wants it: first clear, FixAward by weight, RandomAward by weight. */
export function rollTowerAwards(
  level: TowerLevel,
  firstClear: boolean,
  seed: string,
): Award[] {
  const config: ChapterLevelConfig = {
    chapter: 0,
    index: level.levelId,
    difficulty: 0,
    name: "",
    storyOnly: false,
    preCost: level.cost,
    vigour: 0,
    randDropNum: level.randDropNum,
    firstAwards: level.firstAwards,
    fixedAwards: level.fixedAwards,
    randomAwards: level.randomAwards,
    masterExp: level.masterExp,
    cardExp: level.cardExp,
  };
  return rollChapterAwards(config, firstClear, seed);
}

// ================================================================ requests

/** The client's JSON encoder writes a Lua array with holes as [..., null, ...]. */
function positional(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (typeof value !== "object" || value === null) return null;
  // An object with numeric keys "1".."n" is read the same way.
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || !entries.every(([key]) => /^[1-9]\d*$/.test(key)))
    return null;
  const list: unknown[] = [];
  for (const [key, entry] of entries) list[Number(key) - 1] = entry;
  return list;
}

function whole(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export type EventTowerRequest =
  | { command: typeof LUA_COMMAND_TOWER_GET; towerId: number }
  | {
      command:
        | typeof LUA_COMMAND_TOWER_ENTER
        | typeof LUA_COMMAND_TOWER_PASS
        | typeof LUA_COMMAND_TOWER_FAIL;
      activityType: number;
      towerId: number;
      node: number;
      levelId: number;
      formationId: number;
      /** Argument 6 of 55: a score table, goal flags, or true for a story level. */
      report: unknown;
      /** Argument 7 of 55: node tower star bits. */
      stars: number;
    }
  | {
      command:
        | typeof LUA_COMMAND_SWIMWEAR_SERVER_SCORE
        | typeof LUA_COMMAND_SWIMWEAR_SCORE_AWARD
        | typeof LUA_COMMAND_SWIMWEAR_SERVER_AWARD;
      towerId: number;
      index: number;
    }
  | {
      command: typeof LUA_COMMAND_NODE_POINT_REWARD;
      towerId: number;
      rewardIds: number[] | null;
    }
  | {
      command: typeof LUA_COMMAND_POND_DRAW;
      towerId: number;
      type: number;
      pondId: number;
    }
  | { command: typeof LUA_COMMAND_POND_RESET; towerId: number; pondId: number }
  | {
      command: typeof LUA_COMMAND_UPGRADE_TOWER_SKILL;
      towerId: number;
      skillId: number;
    }
  | {
      command: typeof LUA_COMMAND_BOSS_RUSH_SELECT;
      towerId: typeof BOSS_RUSH_TOWER;
      levelId: number;
      boss: number;
    }
  | {
      command:
        typeof LUA_COMMAND_BOSS_RUSH_FORMATION | typeof LUA_COMMAND_BOSS_RUSH_RESET;
      towerId: typeof BOSS_RUSH_TOWER;
    }
  | {
      command: typeof LUA_COMMAND_BOSS_RUSH_RESULT;
      towerId: typeof BOSS_RUSH_TOWER;
      /** bSave: only a result the player keeps is written. */
      save: boolean;
      levelId: number;
      /** GameUsedTime in seconds, possibly fractional; 0 when missing. */
      passTime: number;
      /** Health percent per team index (1..5 on the client); null = that team did not fight. */
      blood: (number | null)[];
      shield: number;
    };

export interface EventTowerCall {
  request: EventTowerRequest;
  /** True when the request came inside DoSettle (252); the reply then goes back the same way. */
  settled: boolean;
}

/**
 * Reads a C2S LuaCall. Returns null for everything this slice does not serve
 * (other commands, tower ids outside Tower.txt or outside the 19 classes, the
 * ranking tower), so those stay on the unhandled path.
 */
export function parseEventTowerCall(
  parameters: unknown,
  tables?: EventTowerCatalog,
): EventTowerCall | null {
  if (typeof parameters !== "object" || parameters === null) return null;
  const catalog = tables ?? EventTowerCatalog.tryLoadDefault();
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
  const body = envelope.tbParam;

  const wanted = (towerId: number | null): towerId is number =>
    towerId !== null && catalog.towers.has(towerId);

  switch (command) {
    case LUA_COMMAND_TOWER_GET: {
      const args = positional(body);
      const towerId = whole(args?.[0]);
      if (!wanted(towerId) || whole(args?.[1]) === ACTIVITY_TYPE_CHALLENGE) return null;
      return { request: { command, towerId }, settled };
    }
    case LUA_COMMAND_TOWER_ENTER:
    case LUA_COMMAND_TOWER_PASS:
    case LUA_COMMAND_TOWER_FAIL: {
      // 54 comes straight from CallServer; 55 and 56 through DoSettle. Both
      // forms are read, and the reply goes back in the form it came in.
      const args = positional(body);
      const activityType = whole(args?.[0]);
      const towerId = whole(args?.[1]);
      if (
        !wanted(towerId) ||
        activityType === null ||
        activityType === ACTIVITY_TYPE_CHALLENGE
      )
        return null;
      return {
        request: {
          command,
          activityType,
          towerId,
          node: whole(args?.[2]) ?? 0,
          levelId: whole(args?.[3]) ?? 0,
          formationId: whole(args?.[4]) ?? 0,
          report: args?.[5] ?? null,
          stars: whole(args?.[6]) ?? 0,
        },
        settled,
      };
    }
    case LUA_COMMAND_SWIMWEAR_SERVER_SCORE:
    case LUA_COMMAND_SWIMWEAR_SCORE_AWARD:
    case LUA_COMMAND_SWIMWEAR_SERVER_AWARD: {
      const fields = (typeof body === "object" && body !== null ? body : {}) as Record<
        string,
        unknown
      >;
      const towerId = whole(fields.nTowerId);
      if (!wanted(towerId)) return null;
      return {
        request: { command, towerId, index: whole(fields.Index) ?? 0 },
        settled,
      };
    }
    case LUA_COMMAND_NODE_POINT_REWARD: {
      const fields = (typeof body === "object" && body !== null ? body : {}) as Record<
        string,
        unknown
      >;
      const towerId = whole(fields.activeId);
      if (!wanted(towerId)) return null;
      const list = Array.isArray(fields.rewardIds)
        ? fields.rewardIds.map(whole).filter((id): id is number => id !== null)
        : positional(fields.rewardIds)
            ?.map(whole)
            .filter((id): id is number => id !== null);
      return {
        request: { command, towerId, rewardIds: list ?? null },
        settled,
      };
    }
    case LUA_COMMAND_POND_DRAW:
    case LUA_COMMAND_POND_RESET: {
      const fields = (typeof body === "object" && body !== null ? body : {}) as Record<
        string,
        unknown
      >;
      const towerId = whole(fields.TowerId);
      if (!wanted(towerId)) return null;
      const pondId = whole(fields.nPondId) ?? 0;
      return {
        request:
          command === LUA_COMMAND_POND_DRAW
            ? { command, towerId, type: whole(fields.nType) ?? 0, pondId }
            : { command, towerId, pondId },
        settled,
      };
    }
    case LUA_COMMAND_UPGRADE_TOWER_SKILL: {
      // CallServer(UpgradeTowerSkill, {towerId, skillId}), sent by the two skill screens.
      const args = positional(body);
      const towerId = whole(args?.[0]);
      if (!wanted(towerId) || !catalog.skills.has(towerId)) return null;
      return { request: { command, towerId, skillId: whole(args?.[1]) ?? 0 }, settled };
    }
    case LUA_COMMAND_BOSS_RUSH_SELECT: {
      // CallServer(BossRush_SelectSpBoss, {levelId, i}) from UI_SixteenthTower:ShowSpSelect.
      const args = positional(body);
      return {
        request: {
          command,
          towerId: BOSS_RUSH_TOWER,
          levelId: whole(args?.[0]) ?? 0,
          boss: whole(args?.[1]) ?? 0,
        },
        settled,
      };
    }
    case LUA_COMMAND_BOSS_RUSH_FORMATION:
    case LUA_COMMAND_BOSS_RUSH_RESET:
      return { request: { command, towerId: BOSS_RUSH_TOWER }, settled };
    case LUA_COMMAND_BOSS_RUSH_RESULT: {
      // CallServer(BossRush_SaveSpResult, {tbResult = {blood, shield, passTime, LevelId, ...}, bSave}).
      const fields = (typeof body === "object" && body !== null ? body : {}) as Record<
        string,
        unknown
      >;
      const result = (
        typeof fields.tbResult === "object" && fields.tbResult !== null
          ? fields.tbResult
          : {}
      ) as Record<string, unknown>;
      const bloodList = positional(result.blood) ?? [];
      const decimal = (value: unknown): number | null => {
        if (value === null || value === undefined || typeof value === "boolean")
          return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      return {
        request: {
          command,
          towerId: BOSS_RUSH_TOWER,
          save: fields.bSave === true,
          levelId: whole(result.LevelId) ?? 0,
          passTime: decimal(result.passTime) ?? 0,
          // A Lua array with holes arrives with nulls (or as an object keyed "1".."n").
          blood: Array.from({ length: bloodList.length }, (_, index) =>
            decimal(bloodList[index]),
          ),
          shield: decimal(result.shield) ?? 0,
        },
        settled,
      };
    }
    default:
      return null;
  }
}

/** The error reply shape each command's client handler reads. */
export function eventTowerErrorReply(
  request: EventTowerRequest,
  code: number,
): unknown {
  switch (request.command) {
    case LUA_COMMAND_TOWER_GET:
      return { TowerId: request.towerId };
    case LUA_COMMAND_TOWER_ENTER:
    case LUA_COMMAND_TOWER_PASS:
      return { nError: code };
    case LUA_COMMAND_TOWER_FAIL:
      return {};
    case LUA_COMMAND_SWIMWEAR_SERVER_SCORE:
      return { nTowerId: request.towerId, Score: 0 };
    case LUA_COMMAND_NODE_POINT_REWARD:
      // UI_TowerScoreInfo only reacts to res == true; it never shows an error.
      return { res: false };
    case LUA_COMMAND_UPGRADE_TOWER_SKILL:
      // OnUpgradeRsp shows UI_Activities.Tips<nError>.
      return { nError: code };
    case LUA_COMMAND_BOSS_RUSH_SELECT:
    case LUA_COMMAND_BOSS_RUSH_FORMATION:
    case LUA_COMMAND_BOSS_RUSH_RESET:
    case LUA_COMMAND_BOSS_RUSH_RESULT:
      // The client only redraws on the reply and has no error branch.
      return {};
    default:
      return { nTowerId: request.towerId, nError: code };
  }
}

/** What a pass writes into the level record (see TowerProgress). */
export function nextLevelRecord(
  progress: TowerProgress,
  before: number,
  score: number,
  stars: number,
): number {
  if (progress === "score") return Math.max(before, Math.max(1, score));
  if (progress === "passCount") return before + 1;
  return Math.max(before, Math.max(1, stars));
}

/** Combat reports nScore inside a table; story levels report a bare true; some report nothing. */
export function reportScore(report: unknown): number {
  if (typeof report !== "object" || report === null || Array.isArray(report)) return 0;
  const score = Number((report as Record<string, unknown>).nScore);
  return Number.isFinite(score) && score > 0
    ? Math.min(Math.trunc(score), 0x7fffffff)
    : 0;
}

/** Goal flags: tbFinish[goalid] arrives as an array (holes are null) or as an object. */
export function reachedGoal(report: unknown, goalId: number): boolean {
  if (Array.isArray(report)) return report[goalId - 1] === true;
  if (typeof report === "object" && report !== null)
    return (report as Record<string, unknown>)[String(goalId)] === true;
  return false;
}

/** Whole-weight draw over slots with stock left; index of the slot, or -1 when none is left. */
export function pickPondSlot(
  slots: readonly TowerPondSlot[],
  records: readonly number[],
  random: (maxExclusive: number) => number,
): number {
  let total = 0;
  for (let i = 0; i < slots.length; i++)
    if ((records[i] ?? 0) < slots[i]!.count) total += Math.max(1, slots[i]!.weight);
  if (total === 0) return -1;
  let roll = random(total);
  for (let i = 0; i < slots.length; i++) {
    if ((records[i] ?? 0) >= slots[i]!.count) continue;
    roll -= Math.max(1, slots[i]!.weight);
    if (roll < 0) return i;
  }
  return -1;
}

// ================================================================ run state

/**
 * One open or settled entry, kept in the save: the client resends a settlement
 * after a reconnect, and a settlement without an open entry must replay the
 * stored reply instead of paying again.
 */
export interface EventTowerRunState {
  id: string;
  tower: number;
  level: number;
  active: boolean;
  activityType: number;
  node: number;
  formationId: number;
  cardGuids: number[];
  /** The command that closed the run (55 or 56); 0 while it is open. */
  resultCmd: number;
  reply: unknown;
}

export interface EventTowerState {
  run?: EventTowerRunState;
}

export function readEventTowerRun(
  state: EventTowerState | undefined,
): EventTowerRunState | null {
  const run = state?.run;
  if (
    !run ||
    typeof run.id !== "string" ||
    !Number.isSafeInteger(run.tower) ||
    !Number.isSafeInteger(run.level) ||
    typeof run.active !== "boolean"
  )
    return null;
  return run;
}
