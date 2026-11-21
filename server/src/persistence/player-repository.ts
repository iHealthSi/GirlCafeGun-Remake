import {
  PromiseCatalog,
  parsePromiseRequest,
  type PromiseGirlData,
  type PromiseTaskConfig,
  type PromiseTaskData,
} from "../game-data/girl-promise-data.js";
import type { AppConfig } from "../config.js";
import { isRotationSelectionTaskId } from "../game-data/recruitment-policy.js";
import {
  rotationSelectorCatalog,
  RotationSelectorError,
} from "../game-data/rotation-selector-data.js";
import {
  consumeHeadpatCharge,
  HEADPAT_AFFECTION_EXPERIENCE,
  isHeadpatInteractionType,
  isHeadpatTaskId,
  reconcileHeadpatCharges,
  type HeadpatResponse,
} from "../game-data/headpat-data.js";
import { createDefaultActivityEngine } from "../activities/default-activity-engine.js";
import type { DomainEvent } from "../activities/domain-events.js";
import {
  addCardExperience,
  CARD_EXP_MATERIALS,
  type CardEnhancementMaterial,
} from "../game-data/card-enhancement-data.js";
import {
  BOUNTY_DAILY_REWARD_COUNT,
  bountyOperationalDate,
  effectiveBountyEnergyCost,
  makeBountyDailyTaskId,
  makeBountyPassTaskId,
  type BountyEventType,
  type BountyLevelConfig,
} from "../game-data/bounty-data.js";
import { randomInt, randomUUID } from "node:crypto";
import {
  BOSS_RUSH_TASK,
  BOSS_RUSH_TEAMS,
  BUFF_EFFECT,
  BUFF_SLOTS,
  CARD_CHOICES,
  CARD_RESET_VIGOUR,
  CARD_SLOTS,
  CARD_STATE,
  CARD_TASK,
  CARD_TYPE,
  EventTowerCatalog,
  LUA_COMMAND_CARD_ACHIEVE_AWARD,
  LUA_COMMAND_CARD_CHOOSE_CARD,
  LUA_COMMAND_CARD_CHOOSE_DIFF,
  LUA_COMMAND_CARD_CLICK_CARD,
  LUA_COMMAND_CARD_NEXT_STAGE,
  LUA_COMMAND_CARD_RESET,
  LUA_COMMAND_BOSS_RUSH_FORMATION,
  LUA_COMMAND_BOSS_RUSH_RESET,
  LUA_COMMAND_BOSS_RUSH_RESULT,
  LUA_COMMAND_BOSS_RUSH_SELECT,
  LUA_COMMAND_NODE_POINT_REWARD,
  LUA_COMMAND_POND_DRAW,
  LUA_COMMAND_POND_RESET,
  LUA_COMMAND_SWIMWEAR_SCORE_AWARD,
  LUA_COMMAND_SWIMWEAR_SERVER_AWARD,
  LUA_COMMAND_SWIMWEAR_SERVER_SCORE,
  LUA_COMMAND_TOWER_ENTER,
  LUA_COMMAND_TOWER_FAIL,
  LUA_COMMAND_TOWER_GET,
  LUA_COMMAND_TOWER_PASS,
  LUA_COMMAND_UPGRADE_TOWER_SKILL,
  NODE_TASK,
  POND_SIZE,
  SKILL_TASK_OFFSET,
  SWIMWEAR_TASK,
  TOWER_ERROR,
  encodeBuff,
  eventTowerErrorReply,
  makeTowerTaskId,
  pickCardChoices,
  nextLevelRecord,
  pickPondSlot,
  positional,
  readEventTowerRun,
  reachedGoal,
  reportScore,
  rollTowerAwards,
  towerItemTask,
  whole,
  type CardTowerBuff,
  type CardTowerCard,
  type CardTowerInfo,
  type EventTowerRequest,
  type EventTowerRunState,
  type EventTowerState,
  type TowerInfo,
} from "../game-data/event-tower-data.js";
import {
  EventMissionCatalog,
  MISSION_COUNTER,
  MISSION_ERROR,
  bumpMission,
  bumpWalletChange,
  missionDay,
  missionState,
  missionTaskValue,
  refreshEventMissions,
  taskKey as missionTaskKey,
  walletSnapshot,
  type EventMissionState,
} from "../game-data/event-mission-data.js";
import {
  ACTIVITY_TYPE,
  BOSS_TASK,
  CHESS_TASK,
  CHESS_TEAM_FORMATION,
  MUSIC_GAME_TASK,
  BUFF_TASK,
  COOP_TASK,
  LINKAGE_TASK,
  MICRO_DIFF_MAX,
  MICRO_TASK,
  MIX_TASK,
  NAMED_ERROR,
  NAMED_FAMILIES,
  NamedTowerCatalog,
  namedLevelKey,
  namedTowerErrorReply,
  namedTowerReadOnly,
  readNamedRun,
  type ChessMap,
  type LinkagePondSlot,
  type NamedFamily,
  type NamedLevel,
  type NamedTowerRequest,
  type NamedTowerState,
} from "../game-data/named-tower-data.js";
import {
  characterCardDecompositionReward,
  MAX_CARD_DECOMPOSITION_COUNT,
} from "../game-data/card-decomposition-data.js";
import {
  characterCardModelId,
  isPlayableGirlId,
} from "../game-data/character-card-data.js";
import { weaponRarityOf } from "../game-data/weapon-skill-data.js";
import {
  mutateRune,
  parseRuneRequest,
  reconcileRuneSkills,
} from "../game-data/rune-progression-data.js";
import {
  WeaponBreakthroughCatalog,
  WeaponBreakthroughError,
  isWeaponBreakthroughMaterial,
} from "../game-data/weapon-breakthrough-data.js";
import {
  addWeaponExperience,
  sacrificedWeaponValue,
  weaponExperienceMaterial,
  weaponMaximumLevel,
  type WeaponEnhancementMaterial,
} from "../game-data/weapon-enhancement-data.js";
import {
  MAX_WEAPON_DECOMPOSITION_COUNT,
  weaponDecompositionReward,
} from "../game-data/weapon-decomposition-data.js";
import { INITIAL_COFFEE_TASK_VALUES, type CafeCoffee } from "../game-data/cafe-data.js";
import { reconcileStarterCafe } from "../game-data/cafe-starter.js";
import {
  currentEnergyWindow,
  energyActivityTaskId,
  isEnergyActivityTaskId,
  reconcileEnergyActivity,
  type EnergyActivityState,
} from "../game-data/energy-activity-data.js";
import { CafeCatalog } from "../game-data/cafe-catalog.js";
import { CafePetCatalog } from "../game-data/cafe-pet-catalog.js";
import {
  CafePetRuntime,
  isCafePetTaskId,
  type CafePetState,
  type CafePetRuntimeHooks,
} from "../game-data/cafe-pets.js";
import {
  CafeFurnitureCommerce,
  materializeCafeFurniture as materializeOwnedCafeFurniture,
} from "../game-data/cafe-furniture-commerce.js";
import {
  isNativeFixedHouseObjectId,
  completeHouseRooms,
  type HouseChanges,
  type HouseData,
  type HouseRoomState,
  type HouseThemeState,
  type HouseMusicState,
} from "../game-data/house-data.js";
import {
  CafeRuntime,
  CafeOperationError,
  type CafeBusinessState,
  type CafeNotification,
  type CafeRuntimeHooks,
} from "../game-data/cafe-runtime.js";
export { CafeOperationError } from "../game-data/cafe-runtime.js";
import {
  FREE_GIFT_PACK_AWARD,
  FREE_GIFT_PACK_DAILY_LIMIT,
  FREE_GIFT_PACK_ID,
  makeIBItemTaskId,
  makeIBShopTaskId,
  makeMonthCardTaskId,
  MONTH_CARD_DAYS,
  MONTH_CARD_DIAMONDS,
  MONTH_CARD_ITEM_ID,
  MONTH_CARD_LIMIT_DAYS,
} from "../game-data/ib-shop-data.js";
import {
  isGoodsInWindow,
  isShopOpen,
  nextPriceIndex,
  refreshFee,
  rollShelf,
  shopOperationalDate,
  shopOperationalWeek,
  shopShelfKey,
  unitPrice,
  type GoodsConfig,
  type ShopCatalog,
  type ShopTabConfig,
} from "../game-data/shop-data.js";
import {
  defaultGirlFetterCatalog,
  GIRL_CARD_STORY_EVENT_OFFSET,
  GIRL_FETTER_EVENT_OFFSET,
  GIRL_MAIN_STORY_OFFSET,
  isGirlMainStoryTaskId,
} from "../game-data/girl-fetter-data.js";
import type {
  Award,
  BaseAward,
  ChapterLevelConfig,
} from "../game-data/chapter-config.js";
import {
  chapterStarAward,
  chapterStarClaimedMask,
  chapterStarTaskProgress,
  chapterStarTaskValue,
  chapterTotalStars,
  hasClaimedChapterStarAward,
  makeChapterStarTaskId,
  markChapterStarAwardClaimed,
} from "../game-data/chapter-star-award-data.js";
import {
  dailySignUpOperationalDate,
  dailySignUpReward,
  makeDailySignUpTaskId,
  DAILY_SIGN_UP_MONTH_DIAMOND_TASK,
  DAILY_SIGN_UP_MONTH_ENERGY_TASK,
  DAILY_SIGN_UP_TODAY_TASK,
  DAILY_SIGN_UP_TOTAL_TASK,
  MONTH_CARD_DAILY_DIAMOND_AWARD,
  MONTH_CARD_DAILY_ENERGY_AWARD,
} from "../game-data/daily-sign-up-data.js";
import {
  activeAwardsWithoutBattlePass,
  claimableDailyMissionActiveAwards,
  dailyMission,
  dailyMissionActiveAward,
  dailyMissionActivePoints,
  dailyMissionProgress,
  hasClaimedDailyMission,
  hasClaimedDailyMissionActiveAward,
  incrementDailyMissionProgress,
  isDailyMissionTaskValueId,
  makeDailyMissionTaskId,
  makeDailyMissionTaskValue,
  markDailyMissionActiveAwardClaimed,
  reconcileDailyMissions,
  DAILY_MISSIONS,
  DAILY_MISSION_ACTIVE_POINT_MAX,
  DAILY_MISSION_ACTIVE_POINT_TASK_ID,
  type DailyMissionState,
} from "../game-data/daily-mission-data.js";
import { AutoUseItemCatalog } from "../game-data/auto-use-item-data.js";
import {
  ACHIEVEMENT_TASK_GROUP,
  achievementProgress,
  ACTIVITY_ACHIEVEMENT_TASK_GROUP,
  ActivityAchievementCatalog,
  hasClaimedAchievement,
  makeAchievementTaskId,
  makeAchievementTaskValue,
  projectAchievementProgress,
  requiredAchievementCount,
} from "../game-data/activity-achievement-data.js";
import {
  EIGHT_DAY_SIGN_UP_REWARDS,
  eightDaySignUpProgress,
  eightDaySignUpReward,
  hasClaimedEightDaySignUpReward,
  makeEightDaySignUpTaskId,
  makeEightDaySignUpTaskValue,
} from "../game-data/eight-day-sign-up-data.js";
import type {
  GachaAward,
  GachaPool,
  GachaRollResult,
  Gdpl,
  Gdpln,
} from "../game-data/gacha-data.js";
import {
  completedGuideMissionCount,
  guideMission,
  guideMissionProgress,
  guideProgressAward,
  hasClaimedGuideMission,
  hasClaimedGuideProgressAward,
  makeGuideMissionTaskValue,
  makeGuideTaskId,
  markGuideProgressAwardClaimed,
} from "../game-data/guide-mission-data.js";
import { maximumFormationPower } from "../game-data/formation-power-data.js";
import {
  addGirlAffection,
  favoriteGiftSecretIds,
  FIT_LOVE_SECRET_LEVELS,
  girlGiftExperience,
  girlAffectionMaxLevel,
  girlLevelAwardIndex,
  handworkGiftState,
  isFavoriteGift,
  type GirlAffectionGain,
} from "../game-data/girl-gift-data.js";
import {
  DEFAULT_TRAINING_OUTDOOR_ID,
  getGirlTrainingConfig,
  MAX_CONCURRENT_GIRL_TRAINING,
} from "../game-data/girl-training-data.js";
import { addPlayerExperience } from "../game-data/player-level-data.js";
import {
  RUNE_GENRE,
  RUNE_SLOT_COUNT,
  runeTemplateCatalog,
} from "../game-data/rune-data.js";
import {
  applyMailAction,
  makeMailbox,
  reconcileDailyPullMail,
  reconcileWelcomeMail,
  type MailAction,
  type MailboxState,
} from "../game-data/mail-data.js";
import {
  eligiblePhoneTopics,
  loadPhoneEvents,
  normalizePhoneStoryPath,
} from "../game-data/phone-event-data.js";
import {
  getPhoneLetterDefinition,
  isPhoneLetterComplete,
  makePhoneReplyId,
  phoneLetterAffection,
  reconcilePhoneLetters,
} from "../game-data/phone-message-data.js";
import {
  applyMomentSelection,
  getMomentDefinition,
  isMomentComplete,
  reconcileMoments,
  type MomentsState,
} from "../game-data/moments-data.js";
import type { Logger } from "../logger.js";
import type { JsonStore } from "./json-store.js";

export const FIRST_LEVEL_TASK_ID = (1 << 16) | 15;
export const MONEY_VIGOUR = 1;
export const MONEY_GOLD = 2;
export const MONEY_COFFEE_COIN = 7;
export const MONEY_DIAMOND = 3;
export const MONEY_CARD_DECOMPOSITION_TOKEN = 10;
export const MONEY_PAY_DIAMOND = 12;
export const MONEY_WEAPON_DECOMPOSITION_TOKEN = 16;
export const MONEY_PAY_GOLD = 17;
export const GACHA_TASK_GROUP = 15;
export const MAIN_GIRL_TASK_ID = (2 << 16) | 2;
export const SAVE_SCHEMA_VERSION = 1 as const;

const GIRL_STATE_TASK_GROUP = 3;
const GIRL_SUIT_TASK_GROUP = 4;
interface CustomGirlOutfit {
  requiredCard: Gdpl;
  stockModelId: number;
}

const CUSTOM_GIRL_OUTFITS = new Map<number, CustomGirlOutfit>([
  [9101, { requiredCard: [1, 7, 13, 4], stockModelId: 13 }], // Nocturne Officer
  [9103, { requiredCard: [1, 27, 1, 1], stockModelId: 1 }], // Neptune
]);
const RETIRED_SILVER_DISCIPLINE_MODEL_ID = 9102;
const GIRL_CARD_TASK_GROUP = 7;
const GIRL_TASK_STRIDE = 2_000;
const GIRL_CAFE_POSITION_OFFSET = 3;
const GIRL_FIGHT_MODEL_OFFSET = 9;
const GIRL_TRAIN_POSITION_OFFSET = 11;
const GIRL_TRAIN_END_TIME_OFFSET = 12;
const GIRL_TRAIN_OUTDOOR_ID_OFFSET = 16;
const GIRL_SECRET_OFFSET = 100;
const GIRL_LEVEL_AWARD_OFFSET = 500;
const LINK_GIRL_ID = 200;
const LINK_GIRL_MIN_ID = 201;
const LINK_GIRL_MAX_ID = 204;

export function makeGachaTaskId(taskId: number): number {
  return (GACHA_TASK_GROUP << 16) | taskId;
}

export interface InventoryEntryState {
  guid: number;
  genre: number;
  detail: number;
  particular: number;
  templateLevel: number;
  count: number;
  createTime: number;
  enhanceLevel: number;
  enhanceExp: number;
  breakLevel: number;
  lockOn: number;
  cardSkillLevels?: [number, number, number, number];
  runeSkills?: number[];
  runePendingSkills?: number[];
}

export type CharacterCardState = InventoryEntryState;
export type InventoryItemState = InventoryEntryState;

const INSTANCE_GENRES = new Set([1, 2, 3, 4]);

export function isCharacterCard(
  entry: InventoryEntryState,
): entry is CharacterCardState {
  return entry.genre === 1;
}

export function isWeapon(entry: InventoryEntryState): boolean {
  return entry.genre === 2;
}

export function isInventoryInstance(entry: InventoryEntryState): boolean {
  return INSTANCE_GENRES.has(entry.genre);
}

export interface MoneyState {
  id: number;
  count: number;
}

export interface GirlState {
  girlId: number;
  level: number;
  exp: number;
  modelId: number;
  moodValue: number;
  vigor: number;
  flag: number;
}

export interface FightCardState {
  mainCardGuid: number;
  secondaryCardGuids: number[];
  usedCardGuid: number;
  weaponGuid: number;
  runeItemGuids: number[];
}

export interface FormationState {
  id: number;
  fightCards: FightCardState[];
  title: string;
}

export interface LevelState {
  id: number;
  star: number;
}

export interface CafeFurnitureState {
  templateId: number;
  objId: number;
  parentId: number;
  roomId: number;
  pose: {
    templateId: number;
    parentTemplateId: number;
    place: number;
    posX: number;
    posY: number;
    rotate: number;
  };
  status: number;
  isNew: boolean;
  bizcount: number;
}

export interface CafeState {
  starterVersion?: number;
  pets?: CafePetState;
  business?: CafeBusinessState;
  rooms?: HouseRoomState[];
  themes?: HouseThemeState[];
  music?: HouseMusicState;
  roomGirlsList?: { girlId: number; modelId: number }[][];
  coffees: CafeCoffee[];
  furniture?: CafeFurnitureState[];
  level?: number;
}

export interface PhoneLetterState {
  topicId: number;
  initiator: number;
  createTime: number;
  replyIds: number[];
  awardClaimed?: boolean;
}

export interface PhoneState {
  letters: PhoneLetterState[];
  letterTitles?: Record<string, string>;
  deletedLetterTopicIds?: number[];
  completedDeletedLetterTopicIds?: number[];
  storyPaths?: string[];
  moments?: MomentsState;
}

export interface PendingGachaState {
  poolId: number;
  ten: boolean;
  awards: GachaAward[];
  pity: number;
  upPity: number;
  total: number;
}

export interface GachaState {
  pending: PendingGachaState | null;
}

export interface DailySignUpState {
  cycle: string;
  lastOperationalDate: string | null;
}

export interface EightDaySignUpState {
  cumulativeDays: number;
  lastOperationalDate: string | null;
}

export interface BountyState {
  operationalDate: string;
  completionCounts: Record<string, number>;
}

export interface Player {
  account: string;
  roleId: number;
  name: string;
  level: number;
  exp: number;
  fightPower: number;
  serverZone: number;
  registerTime: number;
  lastLoginAt: string | null;
  live2dEnableLevel: number;
  live2dHX: boolean;
  taskValues: Record<string, number>;
  inventory: InventoryEntryState[];
  nextItemGuid: number;
  money: MoneyState[];
  girls: GirlState[];
  formations: FormationState[];
  levels: LevelState[];
  cafe: CafeState;
  phone: PhoneState;
  mail?: MailboxState;
  gacha: GachaState;
  dailyMissions?: DailyMissionState;
  dailySignUp: DailySignUpState;
  energyActivity?: EnergyActivityState;
  eightDaySignUp: EightDaySignUpState;
  bounty?: BountyState;
  ibShop?: IBShopState;
  shops?: Record<string, ShopState>;
  promise?: PromiseState;
  /** The open or last event tower run (resent settlements replay its reply). */
  eventTower?: EventTowerState;
  /** The same for the named-field event towers (micro, armed survey, mixed online, buff, linkage, anniversary). */
  namedTower?: NamedTowerState;
  /** Counters behind the concert and anniversary missions (event-mission-data.ts). */
  eventMissions?: EventMissionState;
}

export interface PersistedState {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  nextRoleId: number;
  players: Record<string, Player>;
  updatedAt: string | null;
}

export interface TaskChange {
  id: number;
  value: number;
}

export interface ChapterSettlement {
  player: Player;
  energyCost: number;
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
  experienceUpdate: PlayerExperienceUpdate;
}

export interface BountySettlement {
  player: Player;
  energyCost: number;
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
  experienceUpdate: PlayerExperienceUpdate;
}

export interface EventTowerResult {
  player: Player;
  /** The reply body for the client (an error reply when rejected). */
  response: unknown;
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
  experienceUpdate: PlayerExperienceUpdate | null;
  /** Set when the request was refused; the save is unchanged then. */
  rejected: { code: number; reason: string } | null;
  /** Replies the server sends on its own after the answer (the war chess board starts a fight this way). */
  pushes?: { command: number; body: unknown }[];
}

export interface ChapterStarAwardResult {
  player: Player;
  awards: readonly BaseAward[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
}

export interface PlayerExperienceUpdate {
  previousLevel: number;
  previousExperience: number;
  addedExperience: number;
  level: number;
  experience: number;
  levelsGained: number;
  vigourRecovery: number;
}

export interface GirlAppearanceResult {
  player: Player;
  girl: GirlState;
}

export class CustomGirlOutfitUnavailableError extends Error {
  constructor(modelId: number, reason: string) {
    super("Custom outfit " + modelId + " " + reason);
    this.name = "CustomGirlOutfitUnavailableError";
  }
}

export interface GirlTrainingResult {
  player: Player;
  girlId: number;
  position: number;
  endTime: number;
  outdoorId: number;
}

export interface GirlTrainingEndResult {
  player: Player;
  girl: GirlState;
  girlId: number;
  position: number;
  gold: number;
  updatedMoney: MoneyState[];
  addedExperience: number;
  oldExperience: number;
  newExperience: number;
  oldLevel: number;
  newLevel: number;
  unlockedSecretIds: number[];
  fetterUnlocks: GirlFetterUnlock[];
}

export class GirlTrainingError extends Error {
  constructor(
    readonly reason:
      | "girl_not_owned"
      | "invalid_position"
      | "girl_already_training"
      | "position_occupied"
      | "training_limit"
      | "not_training"
      | "training_not_finished",
    readonly clientError: 5 | 6 = 5,
  ) {
    super(`Girl training error: ${reason}`);
    this.name = "GirlTrainingError";
  }
}

export interface GirlGiftResult {
  player: Player;
  girl: GirlState;
  consumedItem: InventoryItemState;
  girlId: number;
  item: Gdpl;
  count: number;
  loved: boolean;
  activityGift: boolean;
  specialActivityGift: boolean;
  addedExperience: number;
  oldExperience: number;
  newExperience: number;
  oldLevel: number;
  newLevel: number;
  reachedMaxLevel: boolean;
  unlockedSecretIds: number[];
  fetterUnlocks: GirlFetterUnlock[];
}

export class GirlGiftError extends Error {
  constructor(
    readonly reason:
      | "invalid_request"
      | "gift_not_found"
      | "insufficient_gift"
      | "girl_not_owned"
      | "max_level",
    readonly clientError: 1 | 2 | 3 | 4 = reason === "girl_not_owned"
      ? 3
      : reason === "max_level"
        ? 4
        : reason === "invalid_request"
          ? 1
          : 2,
  ) {
    super(`Girl gift error: ${reason}`);
    this.name = "GirlGiftError";
  }
}

export class GirlLevelAwardError extends Error {
  constructor(readonly reason: "girl_not_owned" | "invalid_level") {
    super(`Girl level award error: ${reason}`);
    this.name = "GirlLevelAwardError";
  }
}

export class GirlViewStoryError extends Error {
  constructor(
    readonly reason:
      "girl_not_owned" | "story_not_found" | "story_locked" | "invalid_request",
  ) {
    super(`Girl view story error: ${reason}`);
    this.name = "GirlViewStoryError";
  }
}

export interface GirlViewStoryResult {
  player: Player;
  awards: BaseAward[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  alreadyRead: boolean;
}

export interface IBShopState {
  operationalDate: string;
}

export interface ShopShelfEntry {
  goodsId: number;
  discount: number;
  bought: number;
}

export interface ShopGoodsCounters {
  daily: number;
  week: number;
  total: number;
  shelf: number;
}

export interface ShopState {
  operationalDate: string;
  weekId: string;
  refreshCount: number;
  shelfKey: string | null;
  shelf: ShopShelfEntry[];
  counters: Record<string, ShopGoodsCounters>;
}

export type ShopGoodsListEntry = Record<string, number> & { goodsid: number };

export interface ShopGoodsListResult {
  shopId: number;
  isOpen: boolean;
  refreshCount: number;
  goodsList: ShopGoodsListEntry[];
  endTime: number;
}

export class ShopError extends Error {
  constructor(
    readonly reason:
      | "unknown_shop"
      | "shop_closed"
      | "unknown_goods"
      | "not_on_shelf"
      | "limit_reached"
      | "insufficient_funds"
      | "invalid_amount",
    readonly clientErrorKey: string = reason === "limit_reached"
      ? "Error.20075"
      : reason === "insufficient_funds"
        ? "Error.20013"
        : "Error.20074",
  ) {
    super(`shop error: ${reason}`);
    this.name = "ShopError";
  }
}

export interface IBShopFreePackResult {
  player: Player;
  item: InventoryEntryState;
  purchaseCount: number;
}

export interface IBItemFreeResult {
  player: Player;
  updatedMoney: MoneyState[];
  purchaseCount: number;
  monthCardEndTime: number;
  diamonds: number;
}

export class IBShopError extends Error {
  constructor(
    readonly reason: "unknown_item" | "limit_reached",
    readonly clientError: number = reason === "limit_reached" ? 20075 : 20074,
  ) {
    super(`IB shop error: ${reason}`);
    this.name = "IBShopError";
  }
}

export interface CardEnhancementResult {
  player: Player;
  card: CharacterCardState;
  consumedItems: InventoryItemState[];
  addedExperience: number;
  coinCost: number;
  updatedMoney: MoneyState[];
}

export interface ItemLockResult {
  player: Player;
  item: InventoryItemState;
}

export interface CharacterCardDecompositionResult {
  player: Player;
  removedCards: CharacterCardState[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
  itemList: Gdpln[];
  gold: number;
}

export interface WeaponDecompositionResult {
  player: Player;
  removedWeapons: InventoryItemState[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  itemList: Gdpln[];
  gold: number;
}

export interface WeaponEnhancementResult {
  player: Player;
  weapon: InventoryItemState;
  consumedItems: InventoryItemState[];
  addedExperience: number;
  coinCost: number;
  updatedMoney: MoneyState[];
}

export interface GachaCommitResult {
  player: Player;
  awards: GachaAward[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
  getItem: Gdpln | null;
}

export interface RotationSelectorOpenResult {
  player: Player;
  awards: (number | boolean)[][];
  updatedItems: InventoryItemState[];
  updatedGirls: GirlState[];
}

export interface DailySignUpResult {
  player: Player;
  awards: BaseAward[];
  fresh: boolean;
  cumulativeCount: number;
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
}

export interface EightDaySignUpAwardResult {
  player: Player;
  achievementId: number;
  awards: readonly BaseAward[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
}

export interface AchievementAwardResult {
  player: Player;
  group: number;
  achievementId: number;
  awards: readonly BaseAward[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
}

export interface GuideAwardResult {
  player: Player;
  id: number;
  awards: readonly BaseAward[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
}

export interface DailyMissionClaimResult {
  player: Player;
  claimedMissionIds: number[];
  claimedActiveAwardIds: number[];
  activeAwardItems: BaseAward[];
  updatedItems: InventoryItemState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
}

export class DailyMissionError extends Error {
  constructor(
    readonly reason:
      | "unknown_mission"
      | "unknown_active_award"
      | "not_completed"
      | "already_claimed"
      | "insufficient_active_points"
      | "nothing_to_claim",
  ) {
    super(`Daily mission error: ${reason}`);
    this.name = "DailyMissionError";
  }
}

export class InsufficientVigourError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`Insufficient vigour: required ${required}, available ${available}`);
    this.name = "InsufficientVigourError";
  }
}

/** A refused event tower request; code is the client's ActivitiesLogic.tbErrorCode. */
export class EventTowerError extends Error {
  constructor(
    readonly code: number,
    readonly reason: string,
  ) {
    super(`Event tower request refused: ${reason}`);
    this.name = "EventTowerError";
  }
}

export class BountySettlementError extends Error {
  constructor(readonly reason: "key_not_owned") {
    super(`Bounty settlement error: ${reason}`);
    this.name = "BountySettlementError";
  }
}

export class InsufficientGoldError extends Error {
  constructor(
    readonly required: number,
    readonly available: number,
  ) {
    super(`Insufficient gold: required ${required}, available ${available}`);
    this.name = "InsufficientGoldError";
  }
}

export class InsufficientGachaCurrencyError extends Error {
  constructor(readonly poolId: number) {
    super(`Insufficient currency for gacha pool ${poolId}`);
    this.name = "InsufficientGachaCurrencyError";
  }
}

export class CharacterCardDecompositionError extends Error {
  constructor(
    readonly reason:
      | "card_not_owned"
      | "card_locked"
      | "card_in_formation"
      | "oath_card"
      | "unknown_rarity"
      | "invalid_request",
    readonly guid: number,
  ) {
    super(`Character card decomposition error: ${reason} (${guid})`);
    this.name = "CharacterCardDecompositionError";
  }
}

export class WeaponDecompositionError extends Error {
  constructor(
    readonly reason:
      | "weapon_not_owned"
      | "weapon_locked"
      | "weapon_equipped"
      | "unknown_rarity"
      | "invalid_request",
    readonly guid: number,
  ) {
    super(`Weapon decomposition error: ${reason} (${guid})`);
    this.name = "WeaponDecompositionError";
  }
}

export class EightDaySignUpError extends Error {
  constructor(
    readonly reason: "unknown_achievement" | "not_completed" | "already_claimed",
  ) {
    super(`Eight-day sign-up error: ${reason}`);
    this.name = "EightDaySignUpError";
  }
}

export class AchievementAwardError extends Error {
  constructor(
    readonly reason:
      | "unknown_achievement"
      | "not_in_activity"
      | "unsupported_award"
      | "no_award"
      | "not_completed"
      | "already_claimed",
  ) {
    super(`Achievement award error: ${reason}`);
    this.name = "AchievementAwardError";
  }
}

export class GuideMissionError extends Error {
  constructor(
    readonly reason:
      | "unknown_mission"
      | "unknown_progress_award"
      | "prerequisite_not_claimed"
      | "not_completed"
      | "already_claimed",
  ) {
    super(`Guide mission error: ${reason}`);
    this.name = "GuideMissionError";
  }
}

export class ChapterStarAwardError extends Error {
  constructor(readonly reason: "unknown_award" | "not_completed" | "already_claimed") {
    super(`Chapter star award error: ${reason}`);
    this.name = "ChapterStarAwardError";
  }
}

interface PlayerRepositoryOptions {
  store: JsonStore<PersistedState>;
  defaults: AppConfig["playerDefaults"];
  logger: Logger;
  welcomeGifts?: boolean;
}

function unixTime(): number {
  return Math.floor(Date.now() / 1000);
}

function makeInitialCafeState(): CafeState {
  return { coffees: [] };
}

function makeInitialPhoneState(): PhoneState {
  return { letters: [] };
}

function reconcilePlayerPhoneEvents(player: Player, now: number, storyPath?: string) {
  const letterEvents = loadPhoneEvents("letter");
  const momentEvents = loadPhoneEvents("bbs");
  const phone = player.phone;
  let recordedStory = false;
  if (storyPath) {
    const normalized = normalizePhoneStoryPath(storyPath);
    const configured = [letterEvents, momentEvents].some((events) =>
      events.some(({ conditions }) =>
        conditions.some(
          ({ type, value }) =>
            type === 1 && normalizePhoneStoryPath(value) === normalized,
        ),
      ),
    );
    if (configured && !phone.storyPaths?.includes(normalized)) {
      (phone.storyPaths ??= []).push(normalized);
      recordedStory = true;
    }
  }

  const letters = reconcilePhoneLetters(
    phone,
    eligiblePhoneTopics(
      letterEvents,
      player,
      (topicId) => getPhoneLetterDefinition(topicId)?.initiator,
      new Set([
        ...phone.letters.filter(isPhoneLetterComplete).map(({ topicId }) => topicId),
        ...(phone.completedDeletedLetterTopicIds ?? []),
      ]),
      now,
      new Set([
        ...phone.letters.map(({ topicId }) => topicId),
        ...(phone.deletedLetterTopicIds ?? []),
      ]),
    ),
    now,
  );
  const currentMoments = phone.moments?.topics ?? [];
  const moments = reconcileMoments(
    phone,
    eligiblePhoneTopics(
      momentEvents,
      player,
      (topicId) => getMomentDefinition(topicId)?.initiator,
      new Set(currentMoments.filter(isMomentComplete).map(({ topicId }) => topicId)),
      now,
      new Set([
        ...currentMoments.map(({ topicId }) => topicId),
        ...(phone.moments?.publishableIds ?? []),
      ]),
    ),
    now,
  );
  return { letters, moments, recordedStory };
}

function makeInitialGachaState(): GachaState {
  return { pending: null };
}

function makeInitialBountyState(now = Date.now()): BountyState {
  return {
    operationalDate: bountyOperationalDate(now),
    completionCounts: {},
  };
}

function reconcileBounty(player: Player, now = Date.now()): void {
  player.bounty ??= makeInitialBountyState(now);
  player.bounty.completionCounts ??= {};
  const operationalDate = bountyOperationalDate(now);
  const dailyReset = player.bounty.operationalDate !== operationalDate;
  if (dailyReset) player.bounty.operationalDate = operationalDate;
  for (const eventType of [1, 2, 4, 5] satisfies BountyEventType[]) {
    const taskId = String(makeBountyDailyTaskId(eventType));
    if (dailyReset || player.taskValues[taskId] === undefined) {
      player.taskValues[taskId] = BOUNTY_DAILY_REWARD_COUNT;
    }
  }
}

function reconcileInventoryLockState(player: Player): void {
  for (const item of player.inventory) {
    item.lockOn = item.lockOn === 1 ? 1 : 0;
  }
}

function reconcileRuneState(player: Player): void {
  for (const item of player.inventory) {
    if (item.genre === RUNE_GENRE && item.enhanceLevel < 1) {
      item.enhanceLevel = 1;
      item.enhanceExp = 0;
    }
  }
  const inventory = new Map(player.inventory.map((item) => [item.guid, item]));
  const catalog = runeTemplateCatalog();
  for (const formation of player.formations) {
    for (const fightCard of formation.fightCards) {
      const oldSlots = fightCard.runeItemGuids;
      const normalized = Array<number>(RUNE_SLOT_COUNT).fill(0);
      for (let index = 0; index < RUNE_SLOT_COUNT; index += 1) {
        const guid = oldSlots[index] ?? 0;
        const item = inventory.get(guid);
        if (item && catalog.acceptsSlot(item, index)) normalized[index] = guid;
      }
      // Earlier saves compressed zero placeholders. Recover those runes by
      // detail, which is the client's canonical 1-based slot number.
      for (const guid of oldSlots) {
        if (guid <= 0 || normalized.includes(guid)) continue;
        const item = inventory.get(guid);
        if (!item || item.genre !== RUNE_GENRE) continue;
        const index = item.detail - 1;
        if (catalog.acceptsSlot(item, index) && normalized[index] === 0) {
          normalized[index] = guid;
        }
      }
      fightCard.runeItemGuids = normalized;
    }
  }
}

function reconcileChapterStarTaskValues(player: Player): void {
  const coordinates = new Set<string>();
  for (const level of player.levels) {
    const chapter = level.id >>> 16;
    const difficulty = level.id & 0xff;
    if (chapter > 0 && (difficulty === 1 || difficulty === 2)) {
      coordinates.add(`${chapter}:${difficulty}`);
    }
  }

  for (const coordinate of coordinates) {
    const [chapter, difficulty] = coordinate.split(":").map(Number);
    const taskId = makeChapterStarTaskId(chapter!, difficulty!);
    const currentValue = player.taskValues[String(taskId)] ?? 0;
    player.taskValues[String(taskId)] = chapterStarTaskValue(
      chapterTotalStars(player.levels, chapter!, difficulty!),
      chapterStarClaimedMask(currentValue),
    );
  }
}

function makeGirlTaskId(group: number, girlId: number, offset: number): number {
  let taskGroup = group;
  let taskGirlId = girlId;
  if (girlId >= LINK_GIRL_MIN_ID && girlId <= LINK_GIRL_MAX_ID) {
    taskGroup =
      group === GIRL_STATE_TASK_GROUP
        ? 90
        : group === GIRL_SUIT_TASK_GROUP
          ? 91
          : group === GIRL_CARD_TASK_GROUP
            ? 92
            : group;
    taskGirlId -= LINK_GIRL_ID;
  }
  return (taskGroup << 16) | ((taskGirlId - 1) * GIRL_TASK_STRIDE + offset);
}

/**
 * Unlocks the Secret.txt FitLove secrets crossed by an affection level-up
 * (girls 1-16 only; link girls have no level-gated secrets). Returns the
 * newly unlocked secret ids.
 */
function unlockGirlLevelSecrets(
  player: Player,
  girlId: number,
  oldLevel: number,
  newLevel: number,
): number[] {
  const unlocked: number[] = [];
  if (girlId < 1 || girlId > 16) return unlocked;
  for (const { secretId, level } of FIT_LOVE_SECRET_LEVELS) {
    if (level <= oldLevel || level > newLevel) continue;
    const key = String(
      makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_SECRET_OFFSET + secretId - 1),
    );
    if ((player.taskValues[key] ?? 0) === 0) {
      player.taskValues[key] = 1;
      unlocked.push(secretId);
    }
  }
  return unlocked;
}

export interface GirlFetterUnlock {
  girlId: number;
  index: number;
}

// 羁绊支线节点（UI_GirlLove 圆形节点）的第二道解锁门：好感等级与 SubCond
// 附加条件（类型 1 = 通关指定章节关卡）都满足时，把组 3 的 ELevel 任务位
// （偏移 300+index-1）置 1。客户端读该位决定节点是可播放还是只弹条件提示。
function reconcileGirlFetterUnlocks(
  player: Player,
  onlyGirlId?: number,
): GirlFetterUnlock[] {
  const catalog = defaultGirlFetterCatalog();
  const unlocked: GirlFetterUnlock[] = [];
  for (const girl of player.girls) {
    if (onlyGirlId !== undefined && girl.girlId !== onlyGirlId) continue;
    const nodes = catalog.nodes(girl.girlId);
    if (nodes.length === 0) continue;
    for (const node of nodes) {
      if (node.unavailable || girl.level < node.requiredLevel) continue;
      const key = String(
        makeGirlTaskId(
          GIRL_STATE_TASK_GROUP,
          girl.girlId,
          GIRL_FETTER_EVENT_OFFSET + node.index - 1,
        ),
      );
      if ((player.taskValues[key] ?? 0) !== 0) continue;
      if (node.cond) {
        const levelId = makeLevelId(
          node.cond.chapter,
          node.cond.index,
          node.cond.difficulty,
        );
        const cleared = player.levels.some(
          (level) => level.id === levelId && level.star > 0,
        );
        if (!cleared) continue;
      }
      player.taskValues[key] = 1;
      unlocked.push({ girlId: girl.girlId, index: node.index });
    }
    reconcileGirlMainStoryProgress(player, girl.girlId);
  }
  return unlocked;
}

// Older saves contain read ELevel flags but lack the separate main-story cursor.
// Repair it from consecutive completed main chapters without paying any awards.
function reconcileGirlMainStoryProgress(player: Player, girlId: number): number {
  const stories = defaultGirlFetterCatalog().mainStories(girlId);
  const key = String(
    makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_MAIN_STORY_OFFSET),
  );
  if (!stories.length) return player.taskValues[key] ?? 0;
  let completed = 0;
  for (const story of stories) {
    const readKey = String(
      makeGirlTaskId(
        GIRL_STATE_TASK_GROUP,
        girlId,
        GIRL_FETTER_EVENT_OFFSET + story.index - 1,
      ),
    );
    if ((player.taskValues[readKey] ?? 0) < 2) break;
    completed += 1;
  }
  const progress = Math.max(player.taskValues[key] ?? 0, completed);
  if (progress > 0) player.taskValues[key] = progress;
  return progress;
}

function fixGirlModelTaskOffset(modelId: number): number {
  if (!Number.isSafeInteger(modelId) || modelId <= 0) {
    throw new Error(`Invalid girl model id: ${modelId}`);
  }
  if (modelId < 2_000) return modelId;
  if (modelId >= 8_001 && modelId <= 8_003) return modelId - 6_200;
  if (modelId >= 3_000) {
    const suffix = modelId % 100;
    if (suffix <= 29) {
      return suffix + Math.floor(modelId / 1_000) * 30 + 1_500;
    }
  }
  throw new Error(`Invalid girl model id: ${modelId}`);
}

interface GirlRosterReconciliation {
  updatedGirlIds: Set<number>;
  tasksChanged: boolean;
}

function ownsCustomGirlOutfit(
  player: Player,
  girlId: number,
  outfit: CustomGirlOutfit,
): boolean {
  const [genre, detail, particular, templateLevel] = outfit.requiredCard;
  return (
    girlId === detail &&
    player.inventory.some(
      (card) =>
        card.count > 0 &&
        card.genre === genre &&
        card.detail === detail &&
        card.particular === particular &&
        card.templateLevel === templateLevel,
    )
  );
}

function reconcileCustomGirlOutfits(player: Player): GirlState[] {
  const changed: GirlState[] = [];
  for (const girl of player.girls) {
    // Saves from the combined playtest may still select Silver Discipline.
    if (girl.girlId === 9 && girl.modelId === RETIRED_SILVER_DISCIPLINE_MODEL_ID) {
      girl.modelId = 1;
      changed.push(girl);
      continue;
    }
    const outfit = CUSTOM_GIRL_OUTFITS.get(girl.modelId);
    if (!outfit || ownsCustomGirlOutfit(player, girl.girlId, outfit)) continue;
    const stockModel = player.inventory
      .filter((card) => card.count > 0 && card.detail === girl.girlId)
      .map(characterCardModelId)
      .find((model) => model !== null && !CUSTOM_GIRL_OUTFITS.has(model));
    girl.modelId = stockModel ?? 1;
    changed.push(girl);
  }
  return changed;
}

function reconcileGirlAppearanceState(
  player: Player,
  newlyAwardedItemGuids: ReadonlySet<number> = new Set<number>(),
): GirlRosterReconciliation {
  const updatedGirlIds = new Set(
    reconcileCustomGirlOutfits(player).map(({ girlId }) => girlId),
  );
  let tasksChanged = false;
  const setTaskValue = (taskId: number, value: number): void => {
    const key = String(taskId);
    if (player.taskValues[key] === value) return;
    player.taskValues[key] = value;
    tasksChanged = true;
  };

  const ownedModelsByGirl = new Map<number, number[]>();
  const ownedCardCounts = new Map<number, number>();
  for (const card of player.inventory.filter(isCharacterCard)) {
    if (!isPlayableGirlId(card.detail)) continue;
    const modelId = characterCardModelId(card);
    if (modelId === null) continue;

    let ownedModels = ownedModelsByGirl.get(card.detail);
    if (!ownedModels) {
      ownedModels = [];
      ownedModelsByGirl.set(card.detail, ownedModels);
    }
    if (!ownedModels.includes(modelId)) ownedModels.push(modelId);

    const cardTaskId = makeGirlTaskId(
      GIRL_CARD_TASK_GROUP,
      card.detail,
      card.particular * 20 + card.templateLevel,
    );
    ownedCardCounts.set(
      cardTaskId,
      (ownedCardCounts.get(cardTaskId) ?? 0) + Math.max(1, card.count),
    );

    const suitTaskId = makeGirlTaskId(
      GIRL_SUIT_TASK_GROUP,
      card.detail,
      fixGirlModelTaskOffset(modelId),
    );
    const suitTaskKey = String(suitTaskId);
    if ((player.taskValues[suitTaskKey] ?? 0) <= 0) {
      setTaskValue(suitTaskId, newlyAwardedItemGuids.has(card.guid) ? 1 : 2);
    }
  }

  for (const [cardTaskId, count] of ownedCardCounts) {
    setTaskValue(cardTaskId, count);
  }

  for (const [girlId, ownedModels] of ownedModelsByGirl) {
    if (
      girlId === 27 &&
      !(
        player.taskValues[
          String(makeGirlTaskId(GIRL_SUIT_TASK_GROUP, 27, fixGirlModelTaskOffset(9103)))
        ]! > 0
      )
    ) {
      setTaskValue(
        makeGirlTaskId(GIRL_SUIT_TASK_GROUP, 27, fixGirlModelTaskOffset(9103)),
        1,
      );
    }
    let girl = player.girls.find((candidate) => candidate.girlId === girlId);
    // Custom outfits were checked against inventory above and have no stock suit task.
    if (girl && CUSTOM_GIRL_OUTFITS.has(girl.modelId)) continue;
    if (!girl) {
      girl = {
        girlId,
        level: 1,
        exp: 0,
        modelId: ownedModels[0] ?? 1,
        moodValue: 100,
        vigor: 100,
        flag: 0,
      };
      player.girls.push(girl);
      updatedGirlIds.add(girlId);
    } else if (!ownedModels.includes(girl.modelId)) {
      girl.modelId = ownedModels[0] ?? 1;
      updatedGirlIds.add(girlId);
    }

    // The currently worn suit is no longer "new".
    setTaskValue(
      makeGirlTaskId(
        GIRL_SUIT_TASK_GROUP,
        girlId,
        fixGirlModelTaskOffset(girl.modelId),
      ),
      2,
    );
  }

  // Preserve explicit girl states that do not currently have a corresponding
  // card, while keeping their selected model usable.
  for (const girl of player.girls) {
    if (ownedModelsByGirl.has(girl.girlId)) continue;
    const modelId = Math.max(1, girl.modelId);
    if (girl.modelId !== modelId) {
      girl.modelId = modelId;
      updatedGirlIds.add(girl.girlId);
    }
    setTaskValue(
      makeGirlTaskId(
        GIRL_SUIT_TASK_GROUP,
        girl.girlId,
        fixGirlModelTaskOffset(modelId),
      ),
      2,
    );
  }

  const mainGirlId = player.taskValues[String(MAIN_GIRL_TASK_ID)] ?? 0;
  if (!player.girls.some(({ girlId }) => girlId === mainGirlId)) {
    const fallback = player.girls[0]?.girlId;
    if (fallback !== undefined) {
      setTaskValue(MAIN_GIRL_TASK_ID, fallback);
    }
  }

  return { updatedGirlIds, tasksChanged };
}

function applyPlayerExperience(
  player: Player,
  addedExperience: number,
): PlayerExperienceUpdate {
  const previousLevel = player.level;
  const previousExperience = player.exp;
  const result = addPlayerExperience(
    previousLevel,
    previousExperience,
    addedExperience,
  );
  player.level = result.level;
  player.exp = result.experience;

  if (result.vigourRecovery > 0) {
    let vigour = player.money.find(({ id }) => id === MONEY_VIGOUR);
    if (!vigour) {
      vigour = { id: MONEY_VIGOUR, count: 0 };
      player.money.push(vigour);
    }
    vigour.count += result.vigourRecovery;
  }

  return {
    previousLevel,
    previousExperience,
    addedExperience: Math.max(
      0,
      Number.isSafeInteger(addedExperience) ? addedExperience : 0,
    ),
    ...result,
  };
}

function makeInitialDailySignUpState(now = Date.now()): DailySignUpState {
  const operationalDate = dailySignUpOperationalDate(now);
  return {
    cycle: operationalDate.slice(0, 7),
    lastOperationalDate: null,
  };
}

function makeInitialEightDaySignUpState(): EightDaySignUpState {
  return {
    cumulativeDays: 0,
    lastOperationalDate: null,
  };
}

function reconcileDailySignUp(player: Player, now = Date.now()): void {
  const operationalDate = dailySignUpOperationalDate(now);
  const cycle = operationalDate.slice(0, 7);
  const todayTaskId = String(makeDailySignUpTaskId(DAILY_SIGN_UP_TODAY_TASK));
  const totalTaskId = String(makeDailySignUpTaskId(DAILY_SIGN_UP_TOTAL_TASK));
  const monthDiamondTaskId = String(
    makeDailySignUpTaskId(DAILY_SIGN_UP_MONTH_DIAMOND_TASK),
  );
  const monthEnergyTaskId = String(
    makeDailySignUpTaskId(DAILY_SIGN_UP_MONTH_ENERGY_TASK),
  );
  if (player.dailySignUp.cycle !== cycle) {
    player.dailySignUp.cycle = cycle;
    player.dailySignUp.lastOperationalDate = null;
    player.taskValues[totalTaskId] = 0;
    player.taskValues[todayTaskId] = 0;
    player.taskValues[monthDiamondTaskId] = 0;
    player.taskValues[monthEnergyTaskId] = 0;
  } else if (player.dailySignUp.lastOperationalDate !== operationalDate) {
    player.taskValues[todayTaskId] = 0;
    player.taskValues[monthDiamondTaskId] = 0;
    player.taskValues[monthEnergyTaskId] = 0;
  }
}

function reconcileEightDaySignUp(
  player: Player,
  now = Date.now(),
  recordLogin = false,
): void {
  const operationalDate = dailySignUpOperationalDate(now);
  if (recordLogin && player.eightDaySignUp.lastOperationalDate !== operationalDate) {
    player.eightDaySignUp.cumulativeDays = Math.min(
      8,
      player.eightDaySignUp.cumulativeDays + 1,
    );
    player.eightDaySignUp.lastOperationalDate = operationalDate;
  }

  for (const { achievementId } of EIGHT_DAY_SIGN_UP_REWARDS) {
    const taskId = String(makeEightDaySignUpTaskId(achievementId));
    const current = player.taskValues[taskId] ?? 0;
    if (player.eightDaySignUp.cumulativeDays === 0 && current === 0) continue;
    player.taskValues[taskId] = makeEightDaySignUpTaskValue(
      player.eightDaySignUp.cumulativeDays,
      hasClaimedEightDaySignUpReward(current),
    );
  }
}

function initialEnhanceLevel(genre: number): number {
  return genre === 1 || genre === 2 || genre === RUNE_GENRE ? 1 : 0;
}

function makeStarterRoster(
  createTime: number,
): Pick<Player, "inventory" | "girls" | "formations"> {
  const inventory: CharacterCardState[] = [
    {
      guid: 10_001,
      genre: 1,
      detail: 7,
      particular: 1,
      templateLevel: 1,
      count: 1,
      createTime,
      enhanceLevel: 1,
      enhanceExp: 0,
      breakLevel: 0,
      lockOn: 0,
    },
    {
      guid: 10_002,
      genre: 1,
      detail: 9,
      particular: 1,
      templateLevel: 3,
      count: 1,
      createTime,
      enhanceLevel: 1,
      enhanceExp: 0,
      breakLevel: 0,
      lockOn: 0,
    },
    {
      guid: 10_003,
      genre: 1,
      detail: 2,
      particular: 1,
      templateLevel: 1,
      count: 1,
      createTime,
      enhanceLevel: 1,
      enhanceExp: 0,
      breakLevel: 0,
      lockOn: 0,
    },
  ];
  const girls: GirlState[] = [7, 9, 2].map((girlId) => ({
    girlId,
    level: 1,
    exp: 0,
    modelId: 1,
    moodValue: 100,
    vigor: 100,
    flag: 0,
  }));
  const formations: FormationState[] = [
    {
      id: 1,
      title: "Initial Formation",
      fightCards: inventory.map((card) => ({
        mainCardGuid: card.guid,
        secondaryCardGuids: [],
        usedCardGuid: card.guid,
        weaponGuid: 0,
        runeItemGuids: [],
      })),
    },
  ];
  return { inventory, girls, formations };
}

export function makeLevelId(
  chapter: number,
  index: number,
  difficulty: number,
): number {
  return (chapter << 16) | (index << 8) | difficulty;
}

function addInventoryAward(
  player: Player,
  award: readonly [number, number, number, number, number],
  updatedItemGuids: Set<number>,
): void {
  const [genre, detail, particular, templateLevel, rawCount] = award;
  const count = Math.max(0, rawCount);
  if (count === 0) return;
  if (INSTANCE_GENRES.has(genre)) {
    for (let index = 0; index < count; index++) {
      const item: InventoryEntryState = {
        guid: player.nextItemGuid++,
        genre,
        detail,
        particular,
        templateLevel,
        count: 1,
        createTime: unixTime(),
        enhanceLevel: initialEnhanceLevel(genre),
        enhanceExp: 0,
        breakLevel: 0,
        lockOn: 0,
      };
      player.inventory.push(item);
      updatedItemGuids.add(item.guid);
    }
    return;
  }

  let item = player.inventory.find(
    (candidate) =>
      !isInventoryInstance(candidate) &&
      candidate.genre === genre &&
      candidate.detail === detail &&
      candidate.particular === particular &&
      candidate.templateLevel === templateLevel,
  );
  if (!item) {
    item = {
      guid: player.nextItemGuid++,
      genre,
      detail,
      particular,
      templateLevel,
      count: 0,
      createTime: unixTime(),
      enhanceLevel: 0,
      enhanceExp: 0,
      breakLevel: 0,
      lockOn: 0,
    };
    player.inventory.push(item);
  }
  item.count += count;
  updatedItemGuids.add(item.guid);
}

function awardMoneyId(genre: number, detail: number): number | null {
  return genre === 15 && detail === 1
    ? MONEY_GOLD
    : genre === 15 && detail === 2
      ? MONEY_DIAMOND
      : genre === 15 && detail === 4
        ? MONEY_VIGOUR
        : genre === 15 && detail === 10
          ? MONEY_COFFEE_COIN
          : genre === 15 && detail === 11
            ? MONEY_CARD_DECOMPOSITION_TOKEN
            : genre === 15 && detail === 20
              ? MONEY_WEAPON_DECOMPOSITION_TOKEN
              : null;
}

/**
 * A claim must not pay an AutoUse item that this server has no rule for: it
 * would stay in the inventory as a stack that does nothing.
 */
function isGrantableAward([genre, detail, particular, level]: BaseAward): boolean {
  if (awardMoneyId(genre, detail) !== null) return true;
  const effect = AutoUseItemCatalog.loadDefault().effect(
    genre,
    detail,
    particular,
    level,
  );
  return effect === null || effect.kind !== "none";
}

function addMoney(
  player: Player,
  moneyId: number,
  count: number,
  updatedMoneyIds: Set<number>,
): void {
  let money = player.money.find(({ id }) => id === moneyId);
  if (!money) {
    money = { id: moneyId, count: 0 };
    player.money.push(money);
  }
  money.count += count;
  updatedMoneyIds.add(moneyId);
}

/**
 * Uses up an AutoUse item on receipt, as ItemList asks: a currency goes to
 * its wallet, a profile decoration or gallery entry is unlocked through its
 * task value. Returns false when the item belongs in the inventory.
 */
function applyAutoUseAward(
  player: Player,
  [genre, detail, particular, level, count]: BaseAward,
  updatedMoneyIds: Set<number>,
): boolean {
  const effect = AutoUseItemCatalog.loadDefault().effect(
    genre,
    detail,
    particular,
    level,
  );
  switch (effect?.kind) {
    case "money":
      addMoney(player, effect.moneyId, count * effect.perItem, updatedMoneyIds);
      return true;
    case "unlock-time":
      for (const taskId of effect.taskIds)
        player.taskValues[String(taskId)] = unixTime();
      return true;
    case "unlock-flag":
      for (const taskId of effect.taskIds) player.taskValues[String(taskId)] = 1;
      return true;
    default:
      return false;
  }
}

function grantAwards(
  player: Player,
  awards: readonly BaseAward[],
  updatedItemGuids: Set<number>,
  updatedMoneyIds: Set<number>,
): void {
  for (const [genre, detail, particular, templateLevel, rawCount] of awards) {
    const count = Math.max(0, rawCount);
    if (count === 0) continue;

    const moneyId = awardMoneyId(genre, detail);
    if (moneyId !== null) {
      addMoney(player, moneyId, count, updatedMoneyIds);
      continue;
    }
    if (
      applyAutoUseAward(
        player,
        [genre, detail, particular, templateLevel, count],
        updatedMoneyIds,
      )
    ) {
      continue;
    }

    addInventoryAward(
      player,
      [genre, detail, particular, templateLevel, count],
      updatedItemGuids,
    );
  }
}

// ================================================================ event towers

interface TowerOutcome {
  response: unknown;
  pushes?: { command: number; body: unknown }[];
  itemGuids: Set<number>;
  moneyIds: Set<number>;
  girlIds: Set<number>;
  experience: PlayerExperienceUpdate | null;
}

function towerTask(player: Player, group: number, key: number): number {
  return player.taskValues[String(makeTowerTaskId(group, key))] ?? 0;
}

function setTowerTask(player: Player, group: number, key: number, value: number): void {
  if (key < 0 || key > 0xffff)
    throw new Error(`Task key out of range: ${group}/${key}`);
  player.taskValues[String(makeTowerTaskId(group, key))] = Math.min(
    Math.max(0, Math.trunc(value)),
    0x7fffffff,
  );
}

/**
 * Awards for an event tower. Score and exp items that ItemList marks AutoUse
 * add to a task value (TOWER_ITEM_TASKS); everything else is granted as usual.
 */
function grantTowerAwards(
  player: Player,
  awards: readonly (readonly number[])[],
  outcome: TowerOutcome,
): void {
  for (const award of awards) {
    const count = Math.max(0, award[4] ?? 0);
    if (count === 0) continue;
    const effect = towerItemTask(award);
    if (effect) {
      setTowerTask(
        player,
        effect.group,
        effect.key,
        towerTask(player, effect.group, effect.key) + count,
      );
      continue;
    }
    grantAwards(
      player,
      [[award[0]!, award[1]!, award[2]!, award[3]!, count]],
      outcome.itemGuids,
      outcome.moneyIds,
    );
  }
}

function fightRoster(player: Player, formationId: number): number[] {
  const formation = player.formations.find((entry) => entry.id === formationId);
  if (!formation) return [];
  const owned = new Set(
    player.inventory.filter(isCharacterCard).map((card) => card.guid),
  );
  const guids = formation.fightCards
    .map((card) => card.mainCardGuid)
    .filter((guid) => guid > 0);
  if (guids.length === 0 || guids.some((guid) => !owned.has(guid))) return [];
  return [...new Set(guids)];
}

function spendTowerVigour(
  player: Player,
  cost: number,
  outcome: TowerOutcome,
  strict: boolean,
): void {
  let amount = cost;
  if (amount <= 0) return;
  let vigour = player.money.find(({ id }) => id === MONEY_VIGOUR);
  const available = vigour?.count ?? 0;
  if (available < amount) {
    if (strict) throw new EventTowerError(TOWER_ERROR.vigour, "insufficient_vigour");
    amount = available;
    if (amount <= 0) return;
  }
  if (!vigour) {
    vigour = { id: MONEY_VIGOUR, count: 0 };
    player.money.push(vigour);
  }
  vigour.count -= amount;
  outcome.moneyIds.add(MONEY_VIGOUR);
  incrementDailyMissionProgress(player, 109, amount);
}

function refuse(code: number, reason: string): EventTowerError {
  return new EventTowerError(code, reason);
}

/** Takes count of one item from its plain stacks; false (nothing taken) when the player has fewer. */
function takeTowerItem(
  player: Player,
  gdpl: readonly number[],
  count: number,
  outcome: TowerOutcome,
): boolean {
  const stacks = player.inventory.filter(
    (item) =>
      !isInventoryInstance(item) &&
      item.genre === gdpl[0] &&
      item.detail === gdpl[1] &&
      item.particular === gdpl[2] &&
      item.templateLevel === gdpl[3] &&
      item.count > 0,
  );
  if (stacks.reduce((total, item) => total + item.count, 0) < count) return false;
  let remaining = count;
  for (const item of stacks) {
    const take = Math.min(item.count, remaining);
    item.count -= take;
    remaining -= take;
    outcome.itemGuids.add(item.guid);
    if (remaining === 0) break;
  }
  return true;
}

function pondSlotKey(tower: TowerInfo, pondId: number, slot: number): number {
  return tower.layout.offset + NODE_TASK.pondRecord + (pondId - 1) * POND_SIZE + slot;
}

function currentPond(player: Player, tower: TowerInfo): number {
  const pond = towerTask(
    player,
    tower.layout.group,
    tower.layout.offset + NODE_TASK.pondId,
  );
  return pond === 0 ? 1 : pond;
}

/**
 * Applies one event tower request to the player. Throws EventTowerError for a
 * refusal; the caller's store update then drops every change made here.
 */
function applyEventTowerRequest(
  player: Player,
  request: EventTowerRequest,
  catalog: EventTowerCatalog,
  random: (maxExclusive: number) => number,
): TowerOutcome {
  const outcome: TowerOutcome = {
    response: {},
    itemGuids: new Set(),
    moneyIds: new Set(),
    girlIds: new Set(),
    experience: null,
  };
  const cardTower = catalog.cardTowers.get(request.towerId);
  if (cardTower)
    return applyCardTowerRequest(player, request, cardTower, catalog, random, outcome);
  const tower = catalog.towers.get(request.towerId);
  if (!tower) throw refuse(TOWER_ERROR.invalid, "unknown_tower");
  const { group, offset } = tower.layout;

  const finishAwards = (): void => {
    const reconciliation = reconcileGirlAppearanceState(player, outcome.itemGuids);
    for (const girlId of reconciliation.updatedGirlIds) outcome.girlIds.add(girlId);
    reconcileGirlFetterUnlocks(player);
  };
  const awardList = (awards: readonly (readonly number[])[]): number[][] =>
    awards.map((award) => [...award.slice(0, 5), 100]);

  switch (request.command) {
    case LUA_COMMAND_TOWER_GET: {
      // Only SwimwearLogic and AbsorbPeakLogic read the server score from this reply.
      const personal =
        tower.layout.scoreTask && catalog.serverAwards.has(tower.id)
          ? towerTask(player, group, tower.layout.scoreTask)
          : null;
      outcome.response =
        personal === null
          ? { TowerId: tower.id }
          : {
              TowerId: tower.id,
              tbExpParam: {
                nSwimServerScore: personal,
                nAllSwimServerScore: catalog.allServiceScore.get(tower.id) ?? 0,
              },
            };
      return outcome;
    }

    case LUA_COMMAND_TOWER_ENTER: {
      const level = catalog.level(tower.id, request.levelId);
      if (!level) throw refuse(TOWER_ERROR.invalid, "unknown_level");
      let cardGuids: number[] = [];
      if (level.type !== 2) {
        if (
          request.formationId <= 0 ||
          !player.formations.some(({ id }) => id === request.formationId)
        )
          throw refuse(TOWER_ERROR.formation, "unknown_formation");
        const cost = towerEnergyCost(player, level.cost);
        const available =
          player.money.find(({ id }) => id === MONEY_VIGOUR)?.count ?? 0;
        if (available < cost) throw refuse(TOWER_ERROR.vigour, "insufficient_vigour");
        cardGuids = fightRoster(player, request.formationId);
      }
      // A resent request while the same fight is open keeps its run.
      const open = readEventTowerRun(player.eventTower);
      if (!open?.active || open.tower !== tower.id || open.level !== level.levelId) {
        player.eventTower = {
          run: {
            id: randomUUID(),
            tower: tower.id,
            level: level.levelId,
            active: true,
            activityType: request.activityType,
            node: request.node,
            formationId: request.formationId,
            cardGuids,
            resultCmd: 0,
            reply: null,
          },
        };
      }
      outcome.response = {
        tbData: [request.activityType, tower.id, request.node, level.levelId],
        tbDrop: [],
        tbDropItems: [],
      };
      return outcome;
    }

    case LUA_COMMAND_TOWER_PASS: {
      const level = catalog.level(tower.id, request.levelId);
      if (!level) throw refuse(TOWER_ERROR.invalid, "unknown_level");
      const run = readEventTowerRun(player.eventTower);
      if (!run || run.tower !== tower.id || run.level !== level.levelId)
        throw refuse(TOWER_ERROR.invalid, "no_matching_entry");
      if (!run.active) {
        // The client resends a settlement until it hears back: replay, never pay twice.
        if (run.resultCmd !== LUA_COMMAND_TOWER_PASS || run.reply === null)
          throw refuse(TOWER_ERROR.invalid, "entry_already_closed");
        outcome.response = structuredClone(run.reply);
        return outcome;
      }

      const cost = level.type === 2 ? 0 : towerEnergyCost(player, level.cost);
      spendTowerVigour(player, cost, outcome, true);

      const key = catalog.levelKey(tower, level.levelId);
      const before = towerTask(player, group, key);
      const score = reportScore(request.report);
      const awards: number[][] = rollTowerAwards(level, before <= 0, run.id);
      grantTowerAwards(player, awards, outcome);
      setTowerTask(
        player,
        group,
        key,
        nextLevelRecord(tower.layout.progress, before, score, request.stars),
      );

      if (tower.layout.progress === "stars") {
        if (level.type === 0 && score > 0)
          setTowerTask(
            player,
            group,
            offset + NODE_TASK.score,
            towerTask(player, group, offset + NODE_TASK.score) + score,
          );
        if (level.type === 1) {
          const spKey = offset + NODE_TASK.spLevelScore + level.levelId;
          setTowerTask(
            player,
            group,
            spKey,
            Math.max(towerTask(player, group, spKey), score),
          );
          const passKey = offset + NODE_TASK.spPassCount + level.levelId;
          setTowerTask(player, group, passKey, towerTask(player, group, passKey) + 1);
        }
        if (level.node > 0) {
          const complete = catalog
            .nodeLevels(tower.id, level.node)
            .every(
              (entry) =>
                towerTask(player, group, catalog.levelKey(tower, entry.levelId)) > 0,
            );
          const nodeKey = offset + NODE_TASK.nodePass + level.node;
          if (complete && towerTask(player, group, nodeKey) === 0)
            setTowerTask(player, group, nodeKey, 1);
        }
      }

      // Star goals: the level's score is the sum of the reached goals' points.
      const newGoalIds: number[] = [];
      const goals = catalog.goals.get(`${tower.id}:${level.levelId}`);
      if (level.type === 3 && tower.layout.goalBase > 0 && goals) {
        const base = tower.layout.goalBase;
        const previous = towerTask(player, group, base + level.levelId);
        for (const goal of goals) {
          const flag = base + level.levelId * 100 + goal.id;
          if (
            !reachedGoal(request.report, goal.id) ||
            towerTask(player, group, flag) > 0
          )
            continue;
          setTowerTask(player, group, flag, 1);
          newGoalIds.push(goal.id);
        }
        const reached = goals
          .filter(
            (goal) =>
              towerTask(player, group, base + level.levelId * 100 + goal.id) > 0,
          )
          .reduce((total, goal) => total + goal.points, 0);
        const total = Math.max(previous, reached);
        setTowerTask(player, group, base + level.levelId, total);
        const thresholds =
          catalog.goalRewards.get(`${tower.id}:${level.levelId}`) ?? [];
        for (const threshold of thresholds) {
          if (threshold.points <= previous || threshold.points > total) continue;
          grantTowerAwards(player, threshold.rewards, outcome);
          awards.push(...awardList(threshold.rewards));
        }
      }

      // Variegated towers keep a lifetime score of the event currency earned.
      if (tower.layout.scoreTask && tower.money1 && !towerItemTask(tower.money1)) {
        const [g, d, p, l] = tower.money1;
        const earned = awards
          .filter((a) => a[0] === g && a[1] === d && a[2] === p && a[3] === l)
          .reduce((total, a) => total + (a[4] ?? 0), 0);
        if (earned > 0)
          setTowerTask(
            player,
            group,
            tower.layout.scoreTask,
            towerTask(player, group, tower.layout.scoreTask) + earned,
          );
      }

      if (level.masterExp > 0) {
        outcome.experience = applyPlayerExperience(player, level.masterExp);
        if (outcome.experience.vigourRecovery > 0) outcome.moneyIds.add(MONEY_VIGOUR);
      }
      if (level.type !== 2 && run.cardGuids.length > 0) {
        try {
          promiseFightProgress(
            player,
            {
              kind: "tower",
              runId: run.id,
              formationId: run.formationId,
              cardGuids: run.cardGuids,
              activityId: run.activityType,
            },
            Date.now(),
            PromiseCatalog.loadDefault(),
          );
        } catch (error) {
          if (!(error instanceof PromiseOperationError)) throw error;
        }
      }
      finishAwards();

      const response = {
        tbData: awards,
        nMasterExp: level.masterExp,
        nCardExp: level.cardExp,
        newGoalIds,
        nGetScore: score,
        nCardAddScore: 0,
        nPetAddScore: 0,
      };
      run.active = false;
      run.resultCmd = LUA_COMMAND_TOWER_PASS;
      run.reply = response;
      outcome.response = response;
      return outcome;
    }

    case LUA_COMMAND_TOWER_FAIL: {
      // The client shows defeat on its own and ignores the reply. Vigour stays
      // spent, as for a failed chapter.
      const run = readEventTowerRun(player.eventTower);
      const level = catalog.level(tower.id, request.levelId);
      if (
        run?.active &&
        level &&
        run.tower === tower.id &&
        run.level === level.levelId
      ) {
        const cost = level.type === 2 ? 0 : towerEnergyCost(player, level.cost);
        spendTowerVigour(player, cost, outcome, false);
        run.active = false;
        run.resultCmd = LUA_COMMAND_TOWER_FAIL;
        run.reply = {};
      }
      outcome.response = {};
      return outcome;
    }

    case LUA_COMMAND_SWIMWEAR_SERVER_SCORE: {
      // On a private server the whole server is this player.
      outcome.response = {
        nTowerId: tower.id,
        Score: tower.layout.scoreTask
          ? towerTask(player, group, tower.layout.scoreTask)
          : 0,
      };
      return outcome;
    }

    case LUA_COMMAND_SWIMWEAR_SCORE_AWARD:
    case LUA_COMMAND_SWIMWEAR_SERVER_AWARD: {
      const personal = request.command === LUA_COMMAND_SWIMWEAR_SCORE_AWARD;
      const scoreTask = tower.layout.scoreTask;
      const list = (personal ? catalog.scoreAwards : catalog.serverAwards).get(
        tower.id,
      );
      if (!scoreTask || tower.layout.progress !== "passCount" || !list)
        throw refuse(TOWER_ERROR.noAward, "no_award_table");
      const flagBase =
        offset + (personal ? SWIMWEAR_TASK.scoreAward : SWIMWEAR_TASK.serverAward);
      const score = towerTask(player, group, scoreTask);
      // UI_SecondTowerReward: a server award shows when floor(1000 * serverScore / allServiceScore) >= Score.
      const reached = (needed: number): boolean => {
        if (personal) return score >= needed;
        const all = catalog.allServiceScore.get(tower.id) ?? 0;
        return all > 0 && Math.floor((1000 * score) / all) >= needed;
      };
      // Index 0 is the "claim all" button of the personal list.
      const wanted =
        request.index === 0 && personal
          ? list.filter(
              (entry) =>
                towerTask(player, group, flagBase + entry.order) === 0 &&
                reached(entry.score),
            )
          : list.filter((entry) => entry.order === request.index);
      if (wanted.length === 0) throw refuse(TOWER_ERROR.noAward, "no_such_award");
      const granted: number[][] = [];
      for (const entry of wanted) {
        if (towerTask(player, group, flagBase + entry.order) > 0)
          throw refuse(TOWER_ERROR.gotAward, "already_claimed");
        if (!reached(entry.score)) throw refuse(TOWER_ERROR.point, "score_too_low");
        grantTowerAwards(player, entry.awards, outcome);
        setTowerTask(player, group, flagBase + entry.order, 1);
        granted.push(...awardList(entry.awards));
      }
      finishAwards();
      outcome.response = { nTowerId: tower.id, tbAward: granted };
      return outcome;
    }

    case LUA_COMMAND_NODE_POINT_REWARD: {
      const list = catalog.pointRewards.get(tower.id);
      if (!list) throw refuse(TOWER_ERROR.invalid, "no_point_rewards");
      const score = towerTask(player, group, offset + NODE_TASK.score);
      const wanted = request.rewardIds ? new Set(request.rewardIds) : null;
      const due = list.filter(
        (entry) =>
          entry.goal <= score &&
          (!wanted || wanted.has(entry.id)) &&
          towerTask(player, group, offset + NODE_TASK.pointAward + entry.id) === 0,
      );
      if (due.length === 0) throw refuse(TOWER_ERROR.noAward, "nothing_to_claim");
      const granted: number[][] = [];
      for (const entry of due) {
        grantTowerAwards(player, entry.rewards, outcome);
        setTowerTask(player, group, offset + NODE_TASK.pointAward + entry.id, 1);
        granted.push(...awardList(entry.rewards));
      }
      finishAwards();
      // UI_TowerScoreInfo compares res with == true, so it must be a real boolean.
      outcome.response = { res: true, Reward: granted };
      return outcome;
    }

    case LUA_COMMAND_POND_DRAW: {
      const token = catalog.tokens.get(`${tower.id}:${request.type}`);
      const slots = catalog.pondSlots(tower.id, request.pondId);
      if (!token || !slots || currentPond(player, tower) !== request.pondId)
        throw refuse(TOWER_ERROR.invalid, "unknown_pond");
      const wallet = player.money.find(({ id }) => id === token.moneyId);
      if ((wallet?.count ?? 0) < token.cost)
        throw refuse(TOWER_ERROR.point, "not_enough_tokens");
      const records = slots.map((_, index) =>
        towerTask(player, group, pondSlotKey(tower, request.pondId, index + 1)),
      );
      const left = slots.reduce(
        (total, slot, index) => total + Math.max(0, slot.count - records[index]!),
        0,
      );
      if (left < Math.max(1, token.times))
        throw refuse(TOWER_ERROR.pondEmpty, "pond_exhausted");
      if (wallet) wallet.count -= token.cost;
      outcome.moneyIds.add(token.moneyId);
      const drawn: number[] = [];
      for (let n = 0; n < token.times; n++) {
        const slot = pickPondSlot(slots, records, random);
        if (slot < 0) throw refuse(TOWER_ERROR.pondEmpty, "pond_exhausted");
        records[slot] = records[slot]! + 1;
        drawn.push(slot + 1);
        grantTowerAwards(player, [slots[slot]!.award], outcome);
        setTowerTask(
          player,
          group,
          pondSlotKey(tower, request.pondId, slot + 1),
          records[slot]!,
        );
      }
      finishAwards();
      outcome.response = { nTowerId: tower.id, nPondId: request.pondId, tbItem: drawn };
      return outcome;
    }

    case LUA_COMMAND_POND_RESET: {
      const slots = catalog.pondSlots(tower.id, request.pondId);
      if (!slots || currentPond(player, tower) !== request.pondId)
        throw refuse(TOWER_ERROR.invalid, "unknown_pond");
      const records = slots.map((_, index) =>
        towerTask(player, group, pondSlotKey(tower, request.pondId, index + 1)),
      );
      const keyDrawn = slots.some((slot, index) => slot.key && records[index]! > 0);
      const emptied = slots.every((slot, index) => records[index]! >= slot.count);
      if (!keyDrawn && !emptied) throw refuse(TOWER_ERROR.invalid, "pond_not_finished");
      const resetsKey = offset + NODE_TASK.pondResets;
      if (slots[0]!.loop === 0) {
        // The last pool repeats (Loop 0): clear it in place; the title counts the resets.
        slots.forEach((_, index) =>
          setTowerTask(player, group, pondSlotKey(tower, request.pondId, index + 1), 0),
        );
        setTowerTask(player, group, resetsKey, towerTask(player, group, resetsKey) + 1);
        outcome.response = { nResult: 0, nPondId: request.pondId };
      } else if (catalog.pondSlots(tower.id, request.pondId + 1)) {
        setTowerTask(player, group, offset + NODE_TASK.pondId, request.pondId + 1);
        outcome.response = { nResult: 0, nPondId: request.pondId + 1 };
      } else {
        outcome.response = { nResult: 1, nPondId: request.pondId };
      }
      return outcome;
    }

    case LUA_COMMAND_UPGRADE_TOWER_SKILL: {
      // The reply is read by OnUpgradeRsp of UI_TwentiethSkill and UI_21sttowerSkill:
      // nError -> Tips<nError>, isOk 1 refresh, 3 "already at the top".
      const skill = catalog.skills.get(tower.id)?.get(request.skillId);
      if (!skill) throw refuse(TOWER_ERROR.invalid, "unknown_skill");
      const key = offset + SKILL_TASK_OFFSET + skill.id;
      const level = towerTask(player, group, key);
      const cost = skill.costs[level];
      if (cost === undefined) {
        outcome.response = { isOk: 3, skillId: skill.id };
        return outcome;
      }
      if (!takeTowerItem(player, skill.item, cost, outcome))
        throw refuse(TOWER_ERROR.point, "not_enough_upgrade_items");
      setTowerTask(player, group, key, level + 1);
      outcome.response = { isOk: 1, skillId: skill.id };
      return outcome;
    }

    // The boss rush SP stage (SixteenthTowerLogic): the client redraws on an empty reply.
    case LUA_COMMAND_BOSS_RUSH_SELECT: {
      const spLevels = catalog.bossRushSpLevels();
      if (
        !spLevels.some((entry) => entry.levelId === request.levelId) ||
        !catalog.bossRushBosses.has(request.boss)
      )
        throw refuse(TOWER_ERROR.invalid, "unknown_sp_boss");
      // The pick is locked once the teams are saved (the screen only offers it before).
      if (towerTask(player, group, BOSS_RUSH_TASK.saved) === 1)
        throw refuse(TOWER_ERROR.invalid, "teams_already_saved");
      setTowerTask(
        player,
        group,
        BOSS_RUSH_TASK.spLevel + request.levelId,
        request.boss,
      );
      return outcome;
    }

    case LUA_COMMAND_BOSS_RUSH_FORMATION: {
      const picked = catalog
        .bossRushSpLevels()
        .every(
          (entry) =>
            towerTask(player, group, BOSS_RUSH_TASK.spLevel + entry.levelId) > 0,
        );
      if (!picked) throw refuse(TOWER_ERROR.invalid, "sp_bosses_not_picked");
      // Saving the teams starts the gauntlet at full health; a resent request keeps the health.
      if (towerTask(player, group, BOSS_RUSH_TASK.saved) !== 1) {
        setTowerTask(player, group, BOSS_RUSH_TASK.saved, 1);
        fullTeamHealth(player, group);
      }
      return outcome;
    }

    case LUA_COMMAND_BOSS_RUSH_RESET: {
      setTowerTask(player, group, BOSS_RUSH_TASK.saved, 0);
      fullTeamHealth(player, group);
      // Only the SP levels: 60310 is the time of the TSP level, which is not part of the reset.
      for (const entry of catalog.bossRushSpLevels()) {
        setTowerTask(player, group, BOSS_RUSH_TASK.spLevel + entry.levelId, 0);
        setTowerTask(player, group, BOSS_RUSH_TASK.spTime + entry.levelId, 0);
      }
      return outcome;
    }

    case LUA_COMMAND_BOSS_RUSH_RESULT: {
      // SaveSpTeamBlood: the health carries on only when the player keeps the result.
      if (!request.save) return outcome;
      if (
        !catalog.bossRushSpLevels().some((entry) => entry.levelId === request.levelId)
      )
        throw refuse(TOWER_ERROR.invalid, "unknown_sp_level");
      const percent = (value: number): number =>
        Math.min(100, Math.max(0, Math.round(value)));
      // blood has one slot per saved team; a team that did not fight is a hole, not 0.
      request.blood.slice(0, BOSS_RUSH_TEAMS).forEach((blood, index) => {
        if (blood === null) return;
        setTowerTask(player, group, BOSS_RUSH_TASK.hp + index + 1, percent(blood));
        setTowerTask(
          player,
          group,
          BOSS_RUSH_TASK.shield + index + 1,
          percent(request.shield),
        );
      });
      // 0 means "not passed", so a clear shorter than a second still counts.
      setTowerTask(
        player,
        group,
        BOSS_RUSH_TASK.spTime + request.levelId,
        Math.max(1, Math.ceil(request.passTime)),
      );
      return outcome;
    }

    default:
      // The card run (64 to 69) belongs to the card towers only.
      throw refuse(TOWER_ERROR.invalid, "not_a_tower_call");
  }
}

/** Award rows as the client lists them (the sixth number is 100, 0 marks a first clear). */
function towerAwardRows(awards: readonly (readonly number[])[]): number[][] {
  return awards.map((award) => [...award.slice(0, 5), 100]);
}

/**
 * What the client charges for an event level: RewardActivityLogic:GetActivityEnergySale
 * cuts 50% below commander level 35 (the support plan; only the en_US and ko_KR
 * clients skip it, this client is zh_CN) and rounds up, then the card-buff
 * discount of the Animalize/Eighth towers comes off (`buffSale`).
 */
function towerEnergyCost(player: Player, cost: number, buffSale = 0): number {
  const sale = player.level < 35 ? 0.5 : 0;
  return Math.max(0, Math.ceil(cost - cost * sale) - buffSale);
}

function towerVigour(player: Player): number {
  return player.money.find(({ id }) => id === MONEY_VIGOUR)?.count ?? 0;
}

/** Counts a won tower fight for the oath tasks (a refusal there never fails the settlement). */
function recordTowerFight(player: Player, run: EventTowerRunState): void {
  if (run.cardGuids.length === 0) return;
  try {
    promiseFightProgress(
      player,
      {
        kind: "tower",
        runId: run.id,
        formationId: run.formationId,
        cardGuids: run.cardGuids,
        activityId: run.activityType,
      },
      Date.now(),
      PromiseCatalog.loadDefault(),
    );
  } catch (error) {
    if (!(error instanceof PromiseOperationError)) throw error;
  }
}

/**
 * The card towers, Animalize (4) and EighthTower (8): AnimalizeLogic.lua and
 * UI_Roguelike.lua / UI_EighthTower.lua of the 0.1.3 client. The whole run lives in
 * task values (CARD_TASK), so the screens rebuild themselves from them.
 *
 * A round: the opening story of its stage (difficulty 0 levels, LevelId = round), pick a
 * difficulty (64), then draw three cards at a time: choose one (65), open it (66).
 * Box and fate cards pay or add a buff and deal again; act and SP cards open a level
 * that is fought through 54 to 56, and a won act level deals again. Winning the SP
 * (boss) level ends the round: its difficulty award is paid, the next difficulty opens
 * and 67 starts the next round. 69 gives the round up for 5 vigour.
 *
 * [INFER] Nothing in the client or the tables says when the boss card turns up (see
 * pickCardChoices); the unlock bit, the story order and the buff turns are read from
 * what the screens do with the values.
 */
function applyCardTowerRequest(
  player: Player,
  request: EventTowerRequest,
  info: CardTowerInfo,
  catalog: EventTowerCatalog,
  random: (maxExclusive: number) => number,
  outcome: TowerOutcome,
): TowerOutcome {
  const { group, offset } = info.layout;
  const get = (field: number): number => towerTask(player, group, offset + field);
  const set = (field: number, value: number): void =>
    setTowerTask(player, group, offset + field, value);
  const cards = catalog.cardCards.get(info.id)!;
  const buffs = catalog.cardBuffs.get(info.id)!;

  const stage = (): number => Math.max(1, get(CARD_TASK.stage));
  const diff = (): number => Math.max(1, get(CARD_TASK.diff));
  const unlocked = (): number => Math.max(1, get(CARD_TASK.unlockDiff) >> 1);
  const epBit = (level: TowerLevelRef): boolean =>
    ((get(CARD_TASK.epLevelState + level.diff) >>> level.levelId) & 1) === 1;
  const setEpBit = (level: TowerLevelRef): void =>
    set(
      CARD_TASK.epLevelState + level.diff,
      get(CARD_TASK.epLevelState + level.diff) | (1 << level.levelId),
    );
  const storyDue = (round: number): boolean => {
    const story = catalog.cardLevel(info.id, 0, round);
    return story?.type === 2 && !epBit({ diff: 0, levelId: round });
  };

  const activeBuffs = () => {
    const list: { slot: number; value: number; buff: CardTowerBuff }[] = [];
    for (let slot = 0; slot < BUFF_SLOTS; slot++) {
      const value = get(CARD_TASK.buffs + slot);
      const buff = buffs.get(value & 0xffff);
      if (buff) list.push({ slot, value, buff });
    }
    return list;
  };
  const addBuff = (buffId: number): void => {
    const buff = buffs.get(buffId);
    if (!buff) return;
    for (let slot = 0; slot < BUFF_SLOTS; slot++)
      if (get(CARD_TASK.buffs + slot) === 0) {
        set(CARD_TASK.buffs + slot, encodeBuff(buff));
        return;
      }
  };
  /** Turns of the buffs that last "the next Count draws" (2) or "fights" (3). */
  const consumeBuffs = (effectTime: number): void => {
    for (const { slot, value, buff } of activeBuffs()) {
      if (buff.effectTime !== effectTime) continue;
      const left = (value >>> 16) - 1;
      set(CARD_TASK.buffs + slot, left > 0 ? buff.id | (left << 16) : 0);
    }
  };
  const energySale = (): number =>
    activeBuffs()
      .filter(({ buff }) => buff.effectType === BUFF_EFFECT.energy)
      .reduce((total, { buff }) => total + buff.energy, 0);

  const chosen = (): CardTowerCard | null => {
    for (let index = 0; index < CARD_CHOICES; index++) {
      const value = get(CARD_TASK.choices + index);
      if ((value & 1) === 1) return cards.get(value >> 1) ?? null;
    }
    return null;
  };
  /** Always three entries: the client reads all of them without a nil check. */
  const choicesJson = (): { CardId: number; Type: number }[] =>
    Array.from({ length: CARD_CHOICES }, (_, index) => {
      const value = get(CARD_TASK.choices + index);
      return { CardId: value >> 1, Type: value & 1 };
    });

  const deal = (): void => {
    const draws = get(CARD_TASK.drawCount) + 1;
    set(CARD_TASK.drawCount, draws);
    const forceSp = activeBuffs().some(
      ({ buff }) => buff.effectType === BUFF_EFFECT.forceSp,
    );
    const round = diff();
    const pool = [...cards.values()].filter(
      (card) =>
        (card.type !== CARD_TYPE.act && card.type !== CARD_TYPE.sp) ||
        catalog.cardLevel(info.id, round, card.levelId) !== null,
    );
    const picks = pickCardChoices(pool, { draws, forceSp }, random);
    for (let index = 0; index < CARD_CHOICES; index++)
      set(CARD_TASK.choices + index, picks[index] ? picks[index]!.id << 1 : 0);
    consumeBuffs(2);
    set(CARD_TASK.state, CARD_STATE.randCard);
  };
  const clearRun = (): void => {
    for (let index = 0; index < CARD_CHOICES; index++)
      set(CARD_TASK.choices + index, 0);
    for (let slot = 0; slot < CARD_SLOTS; slot++) set(CARD_TASK.cards + slot, 0);
    for (let slot = 0; slot < BUFF_SLOTS; slot++) set(CARD_TASK.buffs + slot, 0);
    set(CARD_TASK.drawCount, 0);
    set(CARD_TASK.energyCount, 0);
    set(CARD_TASK.moneyCount, 0);
    set(CARD_TASK.diffAwardFlag, 0);
    set(CARD_TASK.state, CARD_STATE.diff);
  };
  /** The score items of a payout also count as "tokens won this round". */
  const countMoney = (rows: readonly (readonly number[])[]): void => {
    const money = info.money1;
    if (!money) return;
    const earned = rows
      .filter((row) => money.every((part, index) => row[index] === part))
      .reduce((total, row) => total + (row[4] ?? 0), 0);
    if (earned > 0) set(CARD_TASK.moneyCount, get(CARD_TASK.moneyCount) + earned);
  };
  const closeOpenRun = (): void => {
    const run = readEventTowerRun(player.eventTower);
    if (run?.active && run.tower === info.id) {
      run.active = false;
      run.resultCmd = LUA_COMMAND_TOWER_FAIL;
      run.reply = {};
    }
  };
  const finishAwards = (): void => {
    const reconciliation = reconcileGirlAppearanceState(player, outcome.itemGuids);
    for (const girlId of reconciliation.updatedGirlIds) outcome.girlIds.add(girlId);
    reconcileGirlFetterUnlocks(player);
  };
  /** The boss level is won: pay the difficulty, open the next one, show the round's summary. */
  const endRound = (playedDiff: number): void => {
    const award = catalog.cardDiffAwards.get(info.id)?.get(playedDiff) ?? [];
    grantTowerAwards(player, award, outcome);
    countMoney(towerAwardRows(award));
    if (playedDiff >= unlocked() && playedDiff < catalog.cardMaxDiff(info.id))
      set(CARD_TASK.unlockDiff, (playedDiff + 1) << 1);
    set(CARD_TASK.diffAwardFlag, 1);
    set(CARD_TASK.state, CARD_STATE.stageEnd);
  };

  switch (request.command) {
    case LUA_COMMAND_TOWER_GET:
      outcome.response = { TowerId: info.id };
      return outcome;

    case LUA_COMMAND_TOWER_ENTER: {
      const level = catalog.cardLevel(info.id, request.node, request.levelId);
      if (!level) throw refuse(TOWER_ERROR.invalid, "unknown_level");
      let cardGuids: number[] = [];
      if (level.type === 2) {
        // Only the story of the round that is due (the memory screen plays the others itself).
        if (
          get(CARD_TASK.state) !== CARD_STATE.ep ||
          level.node !== 0 ||
          level.levelId !== stage()
        )
          throw refuse(TOWER_ERROR.invalid, "story_not_due");
      } else {
        // A fight is reached only through the opened card.
        const card = chosen();
        if (
          get(CARD_TASK.state) !== CARD_STATE.cardDetails ||
          !card ||
          card.levelId !== level.levelId ||
          level.node !== diff()
        )
          throw refuse(TOWER_ERROR.invalid, "level_not_drawn");
        if (
          request.formationId <= 0 ||
          !player.formations.some(({ id }) => id === request.formationId)
        )
          throw refuse(TOWER_ERROR.formation, "unknown_formation");
        if (towerVigour(player) < towerEnergyCost(player, level.cost, energySale()))
          throw refuse(TOWER_ERROR.vigour, "insufficient_vigour");
        cardGuids = fightRoster(player, request.formationId);
      }
      const open = readEventTowerRun(player.eventTower);
      if (
        !open?.active ||
        open.tower !== info.id ||
        open.level !== level.levelId ||
        open.node !== level.node
      ) {
        player.eventTower = {
          run: {
            id: randomUUID(),
            tower: info.id,
            level: level.levelId,
            active: true,
            activityType: request.activityType,
            node: level.node,
            formationId: request.formationId,
            cardGuids,
            resultCmd: 0,
            reply: null,
          },
        };
      }
      outcome.response = {
        tbData: [request.activityType, info.id, level.node, level.levelId],
        tbDrop: [],
        tbDropItems: [],
      };
      return outcome;
    }

    case LUA_COMMAND_TOWER_PASS: {
      const level = catalog.cardLevel(info.id, request.node, request.levelId);
      if (!level) throw refuse(TOWER_ERROR.invalid, "unknown_level");
      const run = readEventTowerRun(player.eventTower);
      if (
        !run ||
        run.tower !== info.id ||
        run.level !== level.levelId ||
        run.node !== level.node
      )
        throw refuse(TOWER_ERROR.invalid, "no_matching_entry");
      if (!run.active) {
        if (run.resultCmd !== LUA_COMMAND_TOWER_PASS || run.reply === null)
          throw refuse(TOWER_ERROR.invalid, "entry_already_closed");
        outcome.response = structuredClone(run.reply);
        return outcome;
      }

      const awards: number[][] = [];
      const first = !epBit({ diff: level.node, levelId: level.levelId });
      if (level.type === 2) {
        awards.push(...rollTowerAwards(level, first, run.id));
        grantTowerAwards(player, awards, outcome);
        setEpBit({ diff: 0, levelId: level.levelId });
        // The story is seen: the difficulty screen follows.
        set(CARD_TASK.state, CARD_STATE.diff);
      } else {
        const cost = towerEnergyCost(player, level.cost, energySale());
        spendTowerVigour(player, cost, outcome, true);
        set(CARD_TASK.energyCount, get(CARD_TASK.energyCount) + cost);
        awards.push(...rollTowerAwards(level, first, run.id));
        for (const { buff } of activeBuffs())
          if (buff.effectType === BUFF_EFFECT.items)
            awards.push(...towerAwardRows(buff.items));
        grantTowerAwards(player, awards, outcome);
        countMoney(awards);
        setEpBit({ diff: level.node, levelId: level.levelId });
        consumeBuffs(3);
        recordTowerFight(player, run);
        if (chosen()?.type === CARD_TYPE.sp) endRound(level.node);
        else deal();
      }
      if (level.masterExp > 0) {
        outcome.experience = applyPlayerExperience(player, level.masterExp);
        if (outcome.experience.vigourRecovery > 0) outcome.moneyIds.add(MONEY_VIGOUR);
      }
      finishAwards();

      const response = {
        tbData: awards,
        nMasterExp: level.masterExp,
        nCardExp: level.cardExp,
        newGoalIds: [],
        nGetScore: 0,
        nCardAddScore: 0,
        nPetAddScore: 0,
      };
      run.active = false;
      run.resultCmd = LUA_COMMAND_TOWER_PASS;
      run.reply = response;
      outcome.response = response;
      return outcome;
    }

    case LUA_COMMAND_TOWER_FAIL: {
      const run = readEventTowerRun(player.eventTower);
      const level = catalog.cardLevel(info.id, request.node, request.levelId);
      if (
        run?.active &&
        level &&
        run.tower === info.id &&
        run.level === level.levelId &&
        run.node === level.node
      ) {
        const before = towerVigour(player);
        spendTowerVigour(
          player,
          level.type === 2 ? 0 : towerEnergyCost(player, level.cost, energySale()),
          outcome,
          false,
        );
        set(
          CARD_TASK.energyCount,
          get(CARD_TASK.energyCount) + before - towerVigour(player),
        );
        consumeBuffs(3);
        run.active = false;
        run.resultCmd = LUA_COMMAND_TOWER_FAIL;
        run.reply = {};
      }
      outcome.response = {};
      return outcome;
    }

    case LUA_COMMAND_CARD_CHOOSE_DIFF: {
      if (
        get(CARD_TASK.state) !== CARD_STATE.diff ||
        request.diff < 1 ||
        request.diff > unlocked() ||
        request.diff > catalog.cardMaxDiff(info.id)
      )
        throw refuse(TOWER_ERROR.invalid, "difficulty_not_open");
      set(CARD_TASK.diff, request.diff);
      // Picking the newest difficulty shows its unlock as seen.
      set(CARD_TASK.unlockDiff, (unlocked() << 1) | 1);
      deal();
      outcome.response = { Error: 0, Diff: request.diff, tbRandom: choicesJson() };
      return outcome;
    }

    case LUA_COMMAND_CARD_CHOOSE_CARD: {
      const value = get(CARD_TASK.choices + request.index - 1);
      if (
        get(CARD_TASK.state) !== CARD_STATE.randCard ||
        request.index < 1 ||
        request.index > CARD_CHOICES ||
        value >> 1 === 0
      )
        throw refuse(TOWER_ERROR.invalid, "no_card_to_choose");
      set(CARD_TASK.choices + request.index - 1, value | 1);
      for (let slot = 0; slot < CARD_SLOTS; slot++)
        if (get(CARD_TASK.cards + slot) === 0) {
          set(CARD_TASK.cards + slot, value | 1);
          break;
        }
      set(CARD_TASK.state, CARD_STATE.cardDetails);
      outcome.response = choicesJson();
      return outcome;
    }

    case LUA_COMMAND_CARD_CLICK_CARD: {
      const card = chosen();
      if (get(CARD_TASK.state) !== CARD_STATE.cardDetails || !card)
        throw refuse(TOWER_ERROR.invalid, "no_card_opened");
      if (card.type === CARD_TYPE.act || card.type === CARD_TYPE.sp) {
        // The client opens the level panel; the fight goes through 54.
        outcome.response = { bNextRandom: false, cardId: card.id };
        return outcome;
      }
      const rows: number[][] = [];
      if (card.type === CARD_TYPE.box && card.award) {
        grantTowerAwards(player, [card.award], outcome);
        rows.push(...towerAwardRows([card.award]));
        countMoney(rows);
        finishAwards();
      }
      if (card.type === CARD_TYPE.fate)
        for (const buffId of card.buffIds) addBuff(buffId);
      deal();
      outcome.response = { bNextRandom: true, tbAward: rows };
      return outcome;
    }

    case LUA_COMMAND_CARD_NEXT_STAGE: {
      if (get(CARD_TASK.state) !== CARD_STATE.stageEnd)
        throw refuse(TOWER_ERROR.invalid, "round_not_over");
      const next = stage() + 1;
      set(CARD_TASK.stage, next);
      clearRun();
      set(CARD_TASK.state, storyDue(next) ? CARD_STATE.ep : CARD_STATE.diff);
      outcome.response = { nError: 0 };
      return outcome;
    }

    case LUA_COMMAND_CARD_ACHIEVE_AWARD: {
      // The memory screen's one button. The achievement table of the client is never loaded
      // (tbAnimalizeAchievement is not assigned), so only the score awards exist.
      const score = get(CARD_TASK.score);
      const granted: number[][] = [];
      for (const entry of catalog.cardScoreAwards.get(info.id) ?? []) {
        if (score < entry.score || get(CARD_TASK.scoreAward + entry.id) !== 0) continue;
        grantTowerAwards(player, entry.awards, outcome);
        set(CARD_TASK.scoreAward + entry.id, 1);
        granted.push(...towerAwardRows(entry.awards));
      }
      if (granted.length === 0) throw refuse(TOWER_ERROR.noAward, "nothing_to_claim");
      finishAwards();
      outcome.response = { tbAward: granted };
      return outcome;
    }

    case LUA_COMMAND_CARD_RESET: {
      const state = get(CARD_TASK.state);
      if (state !== CARD_STATE.randCard && state !== CARD_STATE.cardDetails)
        throw refuse(TOWER_ERROR.invalid, "no_round_to_give_up");
      spendTowerVigour(player, CARD_RESET_VIGOUR, outcome, true);
      closeOpenRun();
      clearRun();
      outcome.response = { nError: 0 };
      return outcome;
    }

    default:
      throw refuse(TOWER_ERROR.invalid, "not_a_card_tower_call");
  }
}

interface TowerLevelRef {
  diff: number;
  levelId: number;
}

// ================================================================ named-field event towers

/**
 * The micro tower, armed survey, mixed online, buff tower, linkage, second
 * anniversary tower and boss challenge (named-tower-data.ts): MicroClimbTower.lua,
 * CoopClientEvent.lua, MixOnlineLogic.lua, BuffTowerLogic.lua,
 * LinkageActivityLogic.lua, SecondAnniversaryTower.lua and BossChallengeLogic.lua
 * of the 0.1.3 client. Enter, Pass and Fail work like 54 to 56; the open run is
 * kept in player.namedTower.
 */
type NamedStep = Extract<NamedTowerRequest, { kind: "enter" | "pass" | "fail" }>;

function namedState(player: Player): NamedTowerState {
  return (player.namedTower ??= {});
}

/** The mixed online event the server serves: task 68/1001, or the first one. */
function mixActivityId(player: Player, catalog: NamedTowerCatalog): number {
  const stored = towerTask(player, 68, MIX_TASK.currentId);
  return catalog.mixActivities.includes(stored)
    ? stored
    : (catalog.mixActivities[0] ?? 0);
}

/** The Railgun event the client opens: task 63/3001, or the first one. */
function linkageActivityId(player: Player, catalog: NamedTowerCatalog): number {
  const stored = towerTask(player, 63, LINKAGE_TASK.actId);
  return catalog.linkageIds.includes(stored) ? stored : (catalog.linkageIds[0] ?? 0);
}

function resolveNamedLevel(
  player: Player,
  catalog: NamedTowerCatalog,
  request: NamedStep,
): NamedLevel | null {
  if (request.family === "mix")
    return catalog.level("mix", mixActivityId(player, catalog), request.node, 0);
  const level = catalog.level(
    request.family,
    request.towerId,
    request.levelId,
    request.diff,
  );
  // The mission nodes of the linkage map (LevelType 3) are claimed, not fought.
  return level && !(request.family === "linkage" && level.type === 3) ? level : null;
}

function namedRecordFirst(
  player: Player,
  family: NamedFamily,
  level: NamedLevel,
): { first: boolean; before: number } {
  const before = towerTask(player, family.group, family.recordKey(level));
  const bit = family.recordBit(level);
  return {
    before,
    first: bit >= 0 ? ((before >>> bit) & 1) === 0 : before <= 0,
  };
}

/** Raises the stored progress of linkage missions (AchievementOther) from what the player state shows. */
function refreshLinkageMissions(
  player: Player,
  catalog: NamedTowerCatalog,
  bump: { clears?: number; vigour?: number } = {},
): void {
  const rows = catalog.linkageMissions.get(linkageActivityId(player, catalog));
  if (!rows) return;
  const achievements = ActivityAchievementCatalog.loadDefault();
  // The daily mission can be claimed once per day (04:00 Shanghai, like the rest of the game).
  const missions = missionState(player);
  const today = missionDay(Date.now());
  if (missions.linkageDay !== today) {
    // The first sight of a save only marks the day; later days start the mission again.
    if (missions.linkageDay !== undefined)
      delete player.taskValues[
        String(makeAchievementTaskId(ACTIVITY_ACHIEVEMENT_TASK_GROUP, rows.daily))
      ];
    missions.linkageDay = today;
  }
  const ids = [rows.daily, ...rows.states.flat(), ...catalog.linkageNodeMissions];
  for (const id of ids) {
    const config = achievements.achievement(ACTIVITY_ACHIEVEMENT_TASK_GROUP, id);
    if (!config) continue;
    const key = String(makeAchievementTaskId(ACTIVITY_ACHIEVEMENT_TASK_GROUP, id));
    const stored = player.taskValues[key] ?? 0;
    let progress = achievementProgress(stored);
    // Mission types 110 (clears of an activity, counts [n, activity type]) and 24 (vigour spent) have no
    // other source; [INFER] they count this event's fights.
    if (config.type === 110 && config.counts[1] === ACTIVITY_TYPE.linkage)
      progress += bump.clears ?? 0;
    if (config.type === 24) progress += bump.vigour ?? 0;
    // 135: affection level of one girl [level, girl]; 45: owning one card [genre, detail, particular, ...].
    if (config.type === 135) {
      const girl = player.girls.find(({ girlId }) => girlId === config.counts[1]);
      progress = Math.max(progress, girl?.level ?? 0);
    }
    if (config.type === 45) {
      // AchieveType 45: [count, genre, detail, particular, level]; the first number is the count wanted.
      const [, genre, detail, particular, level] = config.counts;
      const owned = player.inventory
        .filter(
          (item) =>
            item.genre === genre &&
            item.detail === detail &&
            item.particular === particular &&
            item.templateLevel === level,
        )
        .reduce((total, item) => total + Math.max(0, item.count), 0);
      progress = Math.max(progress, owned);
    }
    if (progress === achievementProgress(stored)) continue;
    player.taskValues[key] = makeAchievementTaskValue(
      progress,
      hasClaimedAchievement(stored),
    );
  }
}

/**
 * Seeds the tasks the client (or the family code) reads before any call: the
 * linkage event id 63/3001, without which the client never shows the tile, and
 * the mixed online event id 68/1001. Idempotent; does nothing when the tables
 * are not loaded.
 */
function reconcileNamedTowerSeeds(player: Player): void {
  const catalog = NamedTowerCatalog.tryLoadDefault();
  if (!catalog) return;
  const linkage = catalog.linkageIds[0];
  if (linkage && towerTask(player, 63, LINKAGE_TASK.actId) === 0)
    setTowerTask(player, 63, LINKAGE_TASK.actId, linkage);
  const mix = catalog.mixActivities[0];
  if (mix && towerTask(player, 68, MIX_TASK.currentId) === 0)
    setTowerTask(player, 68, MIX_TASK.currentId, mix);
  refreshLinkageMissions(player, catalog);
  // The concert exchange season the client reads (task 74/1): the first, unless the page chose another.
  const exchange = [...catalog.exchangeSeasons.keys()][0];
  if (exchange && towerTask(player, 74, 1) === 0) setTowerTask(player, 74, 1, exchange);
  refreshMissions(player);
}

function fieldRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function namedAwardRows(awards: readonly (readonly number[])[]): number[][] {
  return awards.map((award) => award.slice(0, 5));
}

// ---------------------------------------------------------------- event missions (374, 436), concert fights

/** The families whose fights feed the event missions. */
const EXCHANGE_TASK = {
  group: 74,
  season: 1,
  awardCount: 2,
  listingFlags: 3,
  listingCount: 4,
  rare: 10,
} as const;
/** ui.Error.20045 (event window) and 20043 (insufficient tokens). */
const EXCHANGE_ERROR = { window: 20045, tokens: 20043 } as const;

const MISSION_FAMILIES: ReadonlySet<string> = new Set(["music", "second", "boss"]);

function refreshMissions(player: Player): void {
  const missions = EventMissionCatalog.tryLoadDefault();
  if (missions) refreshEventMissions(player, missions);
}

/**
 * Counts one won fight for the missions. The "issue" of a concert level is the MusicTowerTotal row it
 * hangs under, that of the anniversary and boss challenge levels their event id (Id column).
 */
function recordMissionPass(
  player: Player,
  catalog: NamedTowerCatalog,
  family: NamedFamily,
  level: NamedLevel,
  body: Record<string, unknown>,
  vigour: number,
): void {
  bumpMission(player, MISSION_COUNTER.vigour, vigour);
  const issue =
    family.key === "music"
      ? (catalog.musicIssueOfLevel.get(level.levelId) ?? 0)
      : level.tower;
  const type = family.activityType;
  if (level.type === 2) return;
  if (level.type === 0) {
    bumpMission(player, MISSION_COUNTER.clear(issue, type));
    const kills = whole(fieldRecord(body.tbKillMonster).totalkillMonster) ?? 0;
    bumpMission(player, MISSION_COUNTER.kills(issue), kills);
  }
  if (level.type === 1) bumpMission(player, MISSION_COUNTER.special(issue, type));
  bumpMission(player, MISSION_COUNTER.level(issue, type, level.levelId));
  bumpMission(player, MISSION_COUNTER.diff(level.levelId, level.diff));
}

/** Interest level 71 belongs to the first concert issue (tasks 1/554-556), 72 to the next (557-559). */
function interestTasks(levelId: number): {
  gained: number;
  played: number;
  best: number;
} {
  return levelId === 71
    ? { gained: 554, played: 555, best: 556 }
    : { gained: 557, played: 558, best: 559 };
}

function interestChances(player: Player, levelId: number): number {
  const tasks = interestTasks(levelId);
  return towerTask(player, 1, tasks.gained) - towerTask(player, 1, tasks.played);
}

/** One interest fight used up: the played counter, the mission counter and the best score. */
function settleInterest(player: Player, level: NamedLevel, score: number): void {
  const tasks = interestTasks(level.levelId);
  setTowerTask(player, 1, tasks.played, towerTask(player, 1, tasks.played) + 1);
  if (score > towerTask(player, 1, tasks.best))
    setTowerTask(player, 1, tasks.best, score);
  bumpMission(player, MISSION_COUNTER.interest(level.levelId === 71 ? 1 : 2));
}

/** FirstAward of an interest level: [g-d-p-l-n-score] paid every run for the score reached (LevelManager:GetScoreReward). */
function interestScoreAwards(level: NamedLevel, score: number): number[][] {
  const paid: number[][] = [];
  if (score <= 0) return paid;
  for (const award of level.firstScored) {
    if (score < award.score) break;
    const same = paid.find(
      (entry) => entry.slice(0, 4).join("-") === award.award.slice(0, 4).join("-"),
    );
    if (same) same[4]! += award.award[4];
    else paid.push([...award.award]);
  }
  return paid;
}

// ---------------------------------------------------------------- war chess board (539)

/**
 * The board of WarChessTower.lua lives in task group 97: the map and its cells (tasks 500-1000, one per
 * cell, GridStates), steps, round, boss moves, team health and boss health. The client finds the boss
 * paths itself and the server applies each move. [INFER] Nothing in the client or the tables says how
 * many steps a team gets in a round (one here, items add more), what a boss reaching the cafe costs (the
 * map is lost) or how the score of a hard map is worked out (1000 less 50 per round and 20 per item).
 */
const CHESS_CELL = {
  empty: 0,
  cafe: 1,
  team: [3, 4],
  boss: 5,
  wall: 11,
  obstacle: 12,
} as const;
const CHESS_PHASE = { shift: 29, boss: 1, won: 2, lost: 3 } as const;
/** WarChessTower.Error. */
const CHESS_ERROR = { lock: 1, init: 2, birth: 3, move: 4, team: 5 } as const;
const CHESS_FULL_TEAM = 100 | (100 << 8) | (100 << 16) | (100 << 24);

function chessGrid(map: ChessMap, x: number, y: number): number {
  return x + 1 + y * (map.columns + 1);
}

function chessCells(map: ChessMap): number {
  return (map.columns + 1) * (map.rows + 1);
}

function chessTask(player: Player, key: number): number {
  return towerTask(player, CHESS_TASK.group, key);
}

function chessSet(player: Player, key: number, value: number): void {
  setTowerTask(player, CHESS_TASK.group, key, value);
}

function chessCurrentMap(player: Player, catalog: NamedTowerCatalog): ChessMap | null {
  const value = chessTask(player, CHESS_TASK.map);
  return (
    catalog.chessMaps.get(
      `${value & 0x3ff}:${(value >> 10) & 0x3ff}:${(value >> 20) & 0xfff}`,
    ) ?? null
  );
}

function chessPhase(player: Player): number {
  return chessTask(player, CHESS_TASK.bossMove) >>> CHESS_PHASE.shift;
}

function chessClearBoard(player: Player): void {
  for (let key = CHESS_TASK.grid; key <= CHESS_TASK.gridEnd; key++)
    chessSet(player, key, 0);
  for (let boss = 1; boss <= 6; boss++) chessSet(player, CHESS_TASK.bossHp + boss, 0);
  for (const key of [
    CHESS_TASK.map,
    CHESS_TASK.steps,
    CHESS_TASK.fightCache,
    ...CHESS_TASK.teamHp,
    CHESS_TASK.bossMove,
    CHESS_TASK.round,
    CHESS_TASK.freeze,
  ])
    chessSet(player, key, 0);
}

function chessSteps(player: Player, team: number): number {
  const value = chessTask(player, CHESS_TASK.steps);
  return team === 1 ? value & 0xffff : value >>> 16;
}

function chessSetSteps(player: Player, team: number, steps: number): void {
  const value = chessTask(player, CHESS_TASK.steps);
  const other = team === 1 ? value >>> 16 : value & 0xffff;
  chessSet(
    player,
    CHESS_TASK.steps,
    team === 1 ? steps | (other << 16) : other | (steps << 16),
  );
}

function chessTeamAlive(player: Player, team: number): boolean {
  return chessTask(player, CHESS_TASK.teamHp[team - 1]!) !== 0;
}

function chessCellOf(player: Player, map: ChessMap, state: number): number {
  for (let cell = 1; cell <= chessCells(map); cell++)
    if (chessTask(player, CHESS_TASK.grid + cell) === state) return cell;
  return 0;
}

function chessMinRoundInfo(
  player: Player,
  catalog: NamedTowerCatalog,
): Record<string, number> {
  const info: Record<string, number> = {};
  for (const map of catalog.chessMaps.values()) {
    const best = chessTask(
      player,
      CHESS_TASK.minRound + map.mapId + (map.diff - 1) * CHESS_TASK.maxMaps,
    );
    if (best > 0) info[`${map.mapId}_${map.diff}`] = best;
  }
  return info;
}

function chessMapEnded(
  player: Player,
  catalog: NamedTowerCatalog,
  outcome: TowerOutcome,
): void {
  (outcome.pushes ??= []).push({
    command: NAMED_FAMILIES.chess.enter + 3,
    body: { nType: 6, tbInfo: chessMinRoundInfo(player, catalog) },
  });
}

function chessWin(player: Player, map: ChessMap): void {
  const round = chessTask(player, CHESS_TASK.round);
  const rounds = round & 0xffff;
  const items = round >>> 16;
  chessSet(player, CHESS_TASK.bossMove, CHESS_PHASE.won * 2 ** CHESS_PHASE.shift);
  const passKey = CHESS_TASK.mapPass + map.mapId;
  chessSet(player, passKey, (chessTask(player, passKey) | (1 << map.diff)) >>> 0);
  const bestKey = CHESS_TASK.minRound + map.mapId + (map.diff - 1) * CHESS_TASK.maxMaps;
  if (chessTask(player, bestKey) === 0 || rounds < chessTask(player, bestKey))
    chessSet(player, bestKey, rounds);
  if (map.diff > 1) {
    const scoreKey = CHESS_TASK.mapScore + map.mapId;
    const score = Math.max(0, 1000 - 50 * rounds - 20 * items);
    if (score > chessTask(player, scoreKey)) chessSet(player, scoreKey, score);
  }
}

function chessLose(player: Player): void {
  chessSet(player, CHESS_TASK.bossMove, CHESS_PHASE.lost * 2 ** CHESS_PHASE.shift);
}

/** The boss fight a move starts: 536 is pushed to the client, which loads the level with the team's formation. */
function chessStartFight(
  player: Player,
  catalog: NamedTowerCatalog,
  map: ChessMap,
  team: number,
  boss: number,
  byBoss: boolean,
  outcome: TowerOutcome,
): boolean {
  const bossRow = catalog.chessBosses.get(map.bosses[boss - 1]?.[2] ?? 0);
  const level = bossRow
    ? catalog.level("chess", bossRow.actId, bossRow.levelId, 0)
    : null;
  const formationId = CHESS_TEAM_FORMATION[team - 1];
  if (!level || !formationId || !player.formations.some(({ id }) => id === formationId))
    return false;
  chessSet(player, CHESS_TASK.fightCache, (byBoss ? 1 : 0) | (team << 1) | (boss << 6));
  namedState(player).run = {
    id: randomUUID(),
    family: "chess",
    tower: level.tower,
    level: level.levelId,
    diff: 0,
    node: 0,
    active: true,
    activityType: ACTIVITY_TYPE.warChess,
    formationId,
    cardGuids: fightRoster(player, formationId),
    resultCmd: 0,
    reply: null,
  };
  (outcome.pushes ??= []).push({
    command: NAMED_FAMILIES.chess.enter,
    body: {
      tbData: { nId: level.tower, nLevelId: level.levelId, nFormationId: formationId },
      tbDrop: [],
      tbDropItems: [],
    },
  });
  return true;
}

/** A won boss fight (537 of a type 1 level): the team takes the boss's cell, the boss is gone. */
function chessBossWon(
  player: Player,
  catalog: NamedTowerCatalog,
  body: Record<string, unknown>,
  outcome: TowerOutcome,
): void {
  const cache = chessTask(player, CHESS_TASK.fightCache);
  const team = (cache >> 1) & 0x1f;
  const boss = (cache >> 6) & 0x1f;
  const map = chessCurrentMap(player, catalog);
  if (!map || (team !== 1 && team !== 2) || boss === 0) return;
  const state = positional(body.tbTeamState);
  if (state && state.length >= 4) {
    const byte = (index: number): number =>
      Math.max(0, Math.min(100, whole(state[index]) ?? 0));
    chessSet(
      player,
      CHESS_TASK.teamHp[team - 1]!,
      byte(0) | (byte(1) << 8) | (byte(2) << 16) | (byte(3) << 24),
    );
  }
  chessSet(player, CHESS_TASK.bossHp + boss, 0);
  const mine = CHESS_CELL.team[team - 1]!;
  let bossesLeft = false;
  for (let cell = 1; cell <= chessCells(map); cell++) {
    const key = CHESS_TASK.grid + cell;
    const value = chessTask(player, key);
    if (value === CHESS_CELL.boss + boss) chessSet(player, key, mine);
    else if (value === mine) chessSet(player, key, CHESS_CELL.empty);
    else if (value > CHESS_CELL.boss && value <= CHESS_CELL.boss + 5) bossesLeft = true;
  }
  chessSet(player, CHESS_TASK.fightCache, 0);
  if (!bossesLeft) {
    chessWin(player, map);
    chessMapEnded(player, catalog, outcome);
  }
}

/** A lost boss fight (538): the boss keeps the health it has left, the team is out. */
function chessBossFailed(
  player: Player,
  catalog: NamedTowerCatalog,
  body: Record<string, unknown>,
  outcome: TowerOutcome,
): void {
  const cache = chessTask(player, CHESS_TASK.fightCache);
  const team = (cache >> 1) & 0x1f;
  const boss = (cache >> 6) & 0x1f;
  if ((team !== 1 && team !== 2) || boss === 0) return;
  const left = Number(body.bossLeftHp);
  if (Number.isFinite(left))
    chessSet(player, CHESS_TASK.bossHp + boss, Math.max(0, Math.min(100, left)));
  chessSet(player, CHESS_TASK.teamHp[team - 1]!, 0);
  chessSet(player, CHESS_TASK.fightCache, 0);
  const map = chessCurrentMap(player, catalog);
  if (map && !chessTeamAlive(player, 1) && !chessTeamAlive(player, 2)) {
    chessLose(player);
    chessMapEnded(player, catalog, outcome);
  }
}

/** One LuaCall 539: the sub-command is nType. The reply is { nType, nError? } (WarChessTower:OnServerRsp). */
function applyChessBoard(
  player: Player,
  body: Record<string, unknown>,
  catalog: NamedTowerCatalog,
  outcome: TowerOutcome,
): void {
  const type = whole(body.nType) ?? 0;
  const reply: Record<string, unknown> = { nType: type };
  outcome.response = reply;
  const fail = (code: number): void => {
    reply.nError = code;
  };
  const map = type === 1 ? null : chessCurrentMap(player, catalog);
  const ended = (): boolean => chessPhase(player) >= CHESS_PHASE.won;

  switch (type) {
    case 1: {
      const id = whole(body.id) ?? 0;
      const mapId = whole(body.mapId) ?? 0;
      const diff = whole(body.diff) ?? 0;
      const team1 = whole(body.team1) ?? 0;
      const team2 = whole(body.team2) ?? 0;
      const config = catalog.chessMaps.get(`${id}:${mapId}:${diff}`);
      if (!config) return fail(CHESS_ERROR.init);
      if (
        diff > 1 &&
        ((chessTask(player, CHESS_TASK.mapPass + mapId) >>> (diff - 1)) & 1) === 0
      )
        return fail(CHESS_ERROR.lock);
      const births = config.birth.map(([x, y]) => chessGrid(config, x!, y!));
      if (team1 === team2 || !births.includes(team1) || !births.includes(team2))
        return fail(CHESS_ERROR.birth);
      chessClearBoard(player);
      chessSet(player, CHESS_TASK.map, id | (mapId << 10) | (diff << 20));
      for (const [x, y] of config.walls)
        chessSet(player, CHESS_TASK.grid + chessGrid(config, x!, y!), CHESS_CELL.wall);
      config.bosses.forEach(([x, y], index) => {
        chessSet(
          player,
          CHESS_TASK.grid + chessGrid(config, x!, y!),
          CHESS_CELL.boss + index + 1,
        );
        chessSet(player, CHESS_TASK.bossHp + index + 1, 100);
      });
      if (config.cafe.length >= 2)
        chessSet(
          player,
          CHESS_TASK.grid + chessGrid(config, config.cafe[0]!, config.cafe[1]!),
          CHESS_CELL.cafe,
        );
      chessSet(player, CHESS_TASK.grid + team1, CHESS_CELL.team[0]);
      chessSet(player, CHESS_TASK.grid + team2, CHESS_CELL.team[1]);
      chessSet(player, CHESS_TASK.teamHp[0]!, CHESS_FULL_TEAM);
      chessSet(player, CHESS_TASK.teamHp[1]!, CHESS_FULL_TEAM);
      chessSet(player, CHESS_TASK.round, 1);
      chessSet(player, CHESS_TASK.steps, 1 | (1 << 16));
      return;
    }
    case 2:
      chessClearBoard(player);
      return;
    case 3: {
      const team = whole(body.teamId) ?? 0;
      const cell = whole(body.gridId) ?? 0;
      if (!map || (team !== 1 && team !== 2) || ended() || chessPhase(player) !== 0)
        return fail(CHESS_ERROR.move);
      if (chessSteps(player, team) < 1 || cell < 1 || cell > chessCells(map))
        return fail(CHESS_ERROR.move);
      const from = chessCellOf(player, map, CHESS_CELL.team[team - 1]!);
      const width = map.columns + 1;
      const distance =
        Math.abs(((from - 1) % width) - ((cell - 1) % width)) +
        Math.abs(Math.floor((from - 1) / width) - Math.floor((cell - 1) / width));
      const target = chessTask(player, CHESS_TASK.grid + cell);
      const bossIndex = target - CHESS_CELL.boss;
      const attack = bossIndex >= 1 && bossIndex <= 5;
      if (from === 0 || distance !== 1 || (!attack && target !== CHESS_CELL.empty))
        return fail(CHESS_ERROR.move);
      if (attack) {
        if (!chessStartFight(player, catalog, map, team, bossIndex, false, outcome))
          return fail(CHESS_ERROR.team);
        chessSetSteps(player, team, chessSteps(player, team) - 1);
        return;
      }
      chessSetSteps(player, team, chessSteps(player, team) - 1);
      chessSet(player, CHESS_TASK.grid + from, CHESS_CELL.empty);
      chessSet(player, CHESS_TASK.grid + cell, CHESS_CELL.team[team - 1]!);
      return;
    }
    case 4:
      if (!map || ended() || chessPhase(player) !== 0) return fail(CHESS_ERROR.move);
      chessSet(player, CHESS_TASK.bossMove, CHESS_PHASE.boss * 2 ** CHESS_PHASE.shift);
      return;
    case 5: {
      if (!map || ended()) return fail(CHESS_ERROR.move);
      const move = body.tbMove;
      if (typeof move !== "object" || move === null) {
        // Every boss has moved: the next player round starts.
        chessSet(player, CHESS_TASK.bossMove, 0);
        chessSet(player, CHESS_TASK.freeze, 0);
        chessSet(player, CHESS_TASK.round, chessTask(player, CHESS_TASK.round) + 1);
        chessSet(
          player,
          CHESS_TASK.steps,
          (chessTeamAlive(player, 1) ? 1 : 0) |
            ((chessTeamAlive(player, 2) ? 1 : 0) << 16),
        );
        return;
      }
      const fields = move as Record<string, unknown>;
      const boss = whole(fields.bossIdx) ?? 0;
      const from = whole(fields.fromGrid) ?? 0;
      const aim = whole(fields.aimGrid) ?? 0;
      if (
        chessPhase(player) !== CHESS_PHASE.boss ||
        boss < 1 ||
        boss > 5 ||
        chessTask(player, CHESS_TASK.grid + from) !== CHESS_CELL.boss + boss ||
        aim < 1 ||
        aim > chessCells(map)
      )
        return fail(CHESS_ERROR.move);
      const target = chessTask(player, CHESS_TASK.grid + aim);
      const moved = chessTask(player, CHESS_TASK.bossMove) | (1 << boss);
      if (target === CHESS_CELL.cafe) {
        chessLose(player);
        reply.nType = 6;
        reply.tbInfo = chessMinRoundInfo(player, catalog);
        return;
      }
      const team = CHESS_CELL.team.indexOf(target as 3 | 4) + 1;
      if (team > 0) {
        // The boss catches a team: that fight is played before the round goes on.
        if (!chessStartFight(player, catalog, map, team, boss, true, outcome))
          return fail(CHESS_ERROR.team);
        chessSet(
          player,
          CHESS_TASK.bossMove,
          moved | (CHESS_PHASE.boss * 2 ** CHESS_PHASE.shift),
        );
        return;
      }
      if (target !== CHESS_CELL.empty) return fail(CHESS_ERROR.move);
      chessSet(
        player,
        CHESS_TASK.bossMove,
        moved | (CHESS_PHASE.boss * 2 ** CHESS_PHASE.shift),
      );
      chessSet(player, CHESS_TASK.grid + from, CHESS_CELL.empty);
      chessSet(player, CHESS_TASK.grid + aim, CHESS_CELL.boss + boss);
      return;
    }
    case 7: {
      if (!map || ended() || chessPhase(player) !== 0) return fail(CHESS_ERROR.move);
      const item = catalog.chessItems.get(`${map.id}:${whole(body.itemId) ?? 0}`);
      const round = chessTask(player, CHESS_TASK.round);
      if (!item || (map.maxItems > 0 && round >>> 16 >= map.maxItems))
        return fail(CHESS_ERROR.team);
      const team = whole(body.teamIdx) ?? 0;
      const bossIdx = whole(body.bossIdx) ?? 0;
      const cell = whole(body.gridId) ?? 0;
      const bossCell = chessCellOf(player, map, CHESS_CELL.boss + bossIdx);
      if (
        (item.skill <= 2 && team !== 1 && team !== 2) ||
        (item.skill === 3 &&
          (cell < 1 ||
            cell > chessCells(map) ||
            chessTask(player, CHESS_TASK.grid + cell) !== CHESS_CELL.empty)) ||
        (item.skill === 4 && (bossIdx < 1 || bossCell === 0))
      )
        return fail(CHESS_ERROR.move);
      if (!takeTowerItem(player, item.gdpl, 1, outcome)) return fail(CHESS_ERROR.team);
      chessSet(player, CHESS_TASK.round, round + (1 << 16));
      if (item.skill <= 2)
        chessSetSteps(player, team, chessSteps(player, team) + item.skill);
      else if (item.skill === 3)
        chessSet(player, CHESS_TASK.grid + cell, CHESS_CELL.obstacle);
      else
        chessSet(
          player,
          CHESS_TASK.freeze,
          (chessTask(player, CHESS_TASK.freeze) | (1 << bossIdx)) >>> 0,
        );
      return;
    }
    case 8:
      reply.tbInfo = chessMinRoundInfo(player, catalog);
      return;
    default:
      return fail(CHESS_ERROR.init);
  }
}

/** Applies one request of these families. Throws EventTowerError for a refusal. */
function applyNamedTowerRequest(
  player: Player,
  request: NamedTowerRequest,
  catalog: NamedTowerCatalog,
  random: (maxExclusive: number) => number,
): TowerOutcome {
  const outcome: TowerOutcome = {
    response: {},
    itemGuids: new Set(),
    moneyIds: new Set(),
    girlIds: new Set(),
    experience: null,
  };
  const finishAwards = (): void => {
    const reconciliation = reconcileGirlAppearanceState(player, outcome.itemGuids);
    for (const girlId of reconciliation.updatedGirlIds) outcome.girlIds.add(girlId);
    reconcileGirlFetterUnlocks(player);
  };
  const state = namedState(player);

  switch (request.kind) {
    case "echo":
      outcome.response = { [request.field]: request.value };
      return outcome;

    case "mixSpCount":
      // [INFER] no client code or table says what the SP count counts.
      outcome.response = { spCount: 0 };
      return outcome;

    case "secondBarrage":
    case "coopEventReward":
      outcome.response = [];
      return outcome;

    case "mixBarrage": {
      const sizes = catalog.barrageSizes;
      if (
        request.message &&
        request.message.every((index, column) => index <= (sizes[column] ?? 0))
      ) {
        const list = (state.barrage ??= []);
        list.push(request.message);
        if (list.length > 100) list.shift();
      }
      outcome.response = (state.barrage ?? []).map((content) => ({
        roleid: player.roleId,
        rolename: player.name,
        content,
      }));
      return outcome;
    }

    case "mixCartoon": {
      // UI_CoopEventInfoSP plays a cartoon node of the mixed event itself and tells the server afterwards.
      const activity = mixActivityId(player, catalog);
      const level = catalog.level("mix", activity, request.node, 0);
      const family = NAMED_FAMILIES.mix;
      if (!level || !catalog.mixCartoons.has(`${activity}:${request.node}`)) {
        outcome.response = [];
        return outcome;
      }
      const { first, before } = namedRecordFirst(player, family, level);
      if (!first) {
        outcome.response = [];
        return outcome;
      }
      grantTowerAwards(player, level.firstAwards, outcome);
      setTowerTask(
        player,
        family.group,
        family.recordKey(level),
        (before | (1 << family.recordBit(level))) >>> 0,
      );
      finishAwards();
      outcome.response = namedAwardRows(level.firstAwards);
      return outcome;
    }

    case "coopSaveSp": {
      const run = readNamedRun(state);
      const sp = run?.family === "coop" ? run.sp : undefined;
      if (!sp || sp.settled) {
        outcome.response = [];
        return outcome;
      }
      sp.settled = true;
      const paid: number[][] = [];
      if (request.save) {
        if (sp.payout && sp.payout[4] > 0) {
          grantTowerAwards(player, [sp.payout], outcome);
          paid.push([...sp.payout]);
        }
        const best = towerTask(player, 68, COOP_TASK.maxScore);
        if (request.maxDamage > best)
          setTowerTask(player, 68, COOP_TASK.maxScore, request.maxDamage);
      }
      finishAwards();
      outcome.response = paid;
      return outcome;
    }

    case "scoreAward": {
      const awards = (
        request.family === "buff" ? catalog.buffAwards : catalog.bossAwards
      ).get(request.towerId);
      if (!awards) throw refuse(NAMED_ERROR.invalid, "no_score_awards");
      const group = NAMED_FAMILIES[request.family].group;
      const gotKey = request.family === "buff" ? BUFF_TASK.got : BOSS_TASK.got;
      let total: number;
      if (request.family === "buff") {
        total = towerTask(player, group, BUFF_TASK.total);
      } else {
        // BossChallengeLogic:GetTotalScore: the best score of each level over its difficulties, summed.
        const best = new Map<number, number>();
        for (const level of catalog.eventLevels("boss", request.towerId)) {
          const score = towerTask(
            player,
            group,
            BOSS_TASK.score + (level.levelId - 1) * BOSS_TASK.diffCount + level.diff,
          );
          best.set(level.levelId, Math.max(best.get(level.levelId) ?? 0, score));
        }
        total = [...best.values()].reduce((sum, score) => sum + score, 0);
      }
      const got = towerTask(player, group, gotKey);
      const due = awards.filter((row) => row.score > got && row.score <= total);
      if (due.length === 0)
        throw refuse(
          total <= got ? NAMED_ERROR.gotAward : NAMED_ERROR.point,
          total <= got ? "nothing_new" : "score_too_low",
        );
      const granted: number[][] = [];
      for (const row of due) {
        grantTowerAwards(player, row.awards, outcome);
        granted.push(...namedAwardRows(row.awards));
      }
      setTowerTask(player, group, gotKey, Math.max(...due.map((row) => row.score)));
      finishAwards();
      outcome.response = { tbAward: granted };
      return outcome;
    }

    case "linkageMission": {
      const rows = catalog.linkageMissions.get(linkageActivityId(player, catalog));
      const achievements = ActivityAchievementCatalog.loadDefault();
      const config = achievements.achievement(
        ACTIVITY_ACHIEVEMENT_TASK_GROUP,
        request.missionId,
      );
      const listed =
        rows &&
        (request.missionId === rows.daily ||
          (request.stateId >= 1 &&
            request.stateId <= 4 &&
            rows.states[request.stateId - 1]!.includes(request.missionId)));
      if (!rows || !config || !listed)
        throw refuse(NAMED_ERROR.invalid, "unknown_mission");
      // IsMissionStateComp: a state opens when every mission of the states before it is claimed.
      // The daily mission is not part of a state: the client lets every tab send it.
      for (
        let state = 1;
        state < request.stateId && request.missionId !== rows.daily;
        state++
      )
        for (const id of rows.states[state - 1]!) {
          const value =
            player.taskValues[
              String(makeAchievementTaskId(ACTIVITY_ACHIEVEMENT_TASK_GROUP, id))
            ] ?? 0;
          if (!hasClaimedAchievement(value))
            throw refuse(NAMED_ERROR.noAward, "state_locked");
        }
      refreshLinkageMissions(player, catalog);
      const key = String(
        makeAchievementTaskId(ACTIVITY_ACHIEVEMENT_TASK_GROUP, config.id),
      );
      const value = player.taskValues[key] ?? 0;
      if (hasClaimedAchievement(value))
        throw refuse(NAMED_ERROR.gotAward, "already_claimed");
      if (achievementProgress(value) < requiredAchievementCount(config))
        throw refuse(NAMED_ERROR.noAward, "not_completed");
      if (!config.awards) throw refuse(NAMED_ERROR.invalid, "unsupported_award");
      // 15-96 (richman points) has no AutoUse rule here and stays an inventory stack.
      grantTowerAwards(player, config.awards, outcome);
      player.taskValues[key] = makeAchievementTaskValue(
        achievementProgress(value),
        true,
      );
      finishAwards();
      outcome.response = { tbReward: namedAwardRows(config.awards) };
      return outcome;
    }

    case "linkageGacha": {
      // The pond draw of the Railgun gacha screen: one token per draw, slots of TowerPond.txt.
      const slots = catalog.linkagePonds.get(request.pondId);
      const token = catalog.linkageToken;
      if (!slots || !token) throw refuse(NAMED_ERROR.pondEmpty, "unknown_pond");
      const slotKey = (pond: number, position: number): number =>
        LINKAGE_TASK.gacha + (pond - 1) * LINKAGE_TASK.pondSize + position;
      const left = (pond: number, list: readonly LinkagePondSlot[]): number =>
        list.reduce(
          (total, slot, index) =>
            total +
              // A negative Count is unlimited (the client treats it so in GetPondLeftNum).
              slot.count <
            0
              ? Number.POSITIVE_INFINITY
              : Math.max(
                  0,
                  slot.count - towerTask(player, 63, slotKey(pond, index + 1)),
                ),
          0,
        );
      // LinkageActivityLogic:IsPondUnlock: the last pond opens when every earlier one is empty.
      const lastPond = Math.max(...catalog.linkagePonds.keys());
      if (request.pondId === lastPond)
        for (const [pond, list] of catalog.linkagePonds)
          if (pond !== lastPond && left(pond, list) > 0)
            throw refuse(NAMED_ERROR.pondEmpty, "pond_locked");
      const wallet = player.money.find(({ id }) => id === token.moneyId);
      if (left(request.pondId, slots) === 0)
        throw refuse(NAMED_ERROR.pondEmpty, "pond_exhausted");
      if ((wallet?.count ?? 0) < token.cost)
        throw refuse(NAMED_ERROR.point, "not_enough_tokens");
      if (wallet) wallet.count -= token.cost;
      outcome.moneyIds.add(token.moneyId);
      const records = slots.map((_, index) =>
        towerTask(player, 63, slotKey(request.pondId, index + 1)),
      );
      const items: number[][] = [];
      for (let draw = 0; draw < token.times; draw++) {
        const pick = pickPondSlot(slots, records, random);
        if (pick < 0) break;
        records[pick] = records[pick]! + 1;
        setTowerTask(player, 63, slotKey(request.pondId, pick + 1), records[pick]!);
        const slot = slots[pick]!;
        grantTowerAwards(player, [slot.award], outcome);
        // UI_RailgunGacha:OnGachaRsp treats a sixth value as "special" for its effect.
        items.push(slot.special ? [...slot.award, 1] : [...slot.award]);
      }
      finishAwards();
      outcome.response = { tbItem: items };
      return outcome;
    }

    case "fan":
      // The concert exchange hub opens through FanEvent_GetList (354) and waits for it: no idol vote here.
      outcome.response = namedTowerErrorReply(request, 0);
      return outcome;

    case "chess":
      applyChessBoard(player, request.body, catalog, outcome);
      return outcome;

    case "musicGame": {
      if (request.op === "friendRank") {
        // The client puts the player into the list itself (UI_MusicSelect:OnFriendRankDataResponse).
        outcome.response = { musicId: request.gameId, tbList: [] };
        return outcome;
      }
      if (request.op === "rank") {
        // Indexed by game id (the client reads tb[Id]); pos 0 shows "not ranked": no other players.
        const list: unknown[] = [];
        for (let id = 1; id <= MUSIC_GAME_TASK.maxGameId; id++) {
          const score = towerTask(
            player,
            MUSIC_GAME_TASK.group,
            MUSIC_GAME_TASK.score + id,
          );
          if (score > 0) list[id - 1] = { pos: 0, score };
        }
        outcome.response = Array.from(list, (entry) => entry ?? null);
        return outcome;
      }
      outcome.response = {};
      if (
        request.gameId < 1 ||
        request.gameId > MUSIC_GAME_TASK.maxGameId ||
        request.score <= 0
      )
        return outcome;
      const key = MUSIC_GAME_TASK.score + request.gameId;
      if (request.score > towerTask(player, MUSIC_GAME_TASK.group, key))
        setTowerTask(player, MUSIC_GAME_TASK.group, key, request.score);
      bumpMission(player, MISSION_COUNTER.musicGame);
      // Ratings 1 C, 2 B, 3 A, 4 S: a play counts for every rating up to its own (AchieveType 191).
      for (let rating = 1; rating <= Math.min(4, request.rating); rating++)
        bumpMission(player, MISSION_COUNTER.rating(rating));
      refreshMissions(player);
      return outcome;
    }

    case "mission": {
      const missions = EventMissionCatalog.tryLoadDefault();
      if (!missions) throw refuse(MISSION_ERROR.missing, "no_mission_tables");
      refreshEventMissions(player, missions);
      const ids = [...new Set(request.ids)];
      const paid: number[][] = [];
      let claimedCount = 0;
      for (const id of ids) {
        const row = missions.mission(request.group, id);
        const alone = ids.length === 1;
        const value = row
          ? (player.taskValues[missionTaskKey(row.group, row.id)] ?? 0)
          : 0;
        // A single claim says why it fails; a claim of a list pays what is ready.
        if (!row) {
          if (alone) throw refuse(MISSION_ERROR.missing, "unknown_mission");
          continue;
        }
        if ((value & 1) === 1) {
          if (alone) throw refuse(MISSION_ERROR.claimed, "already_claimed");
          continue;
        }
        if (value >>> 1 < row.required) {
          if (alone) throw refuse(MISSION_ERROR.notDone, "not_completed");
          continue;
        }
        grantTowerAwards(player, row.awards, outcome);
        player.taskValues[missionTaskKey(row.group, row.id)] = missionTaskValue(
          value >>> 1,
          true,
        );
        paid.push(...namedAwardRows(row.awards));
        claimedCount++;
      }
      if (claimedCount === 0)
        throw refuse(
          ids.length === 0 ? MISSION_ERROR.missing : MISSION_ERROR.notDone,
          "nothing_to_claim",
        );
      refreshEventMissions(player, missions);
      finishAwards();
      outcome.response = { Type: request.type, tbItem: paid };
      return outcome;
    }

    case "exchange": {
      const group = EXCHANGE_TASK.group;
      const season = catalog.exchangeSeasons.get(
        towerTask(player, group, EXCHANGE_TASK.season),
      );
      switch (request.op) {
        case "refresh":
          // Nobody else lists collection pieces here: the board stays empty.
          outcome.response = { tbData: [] };
          return outcome;
        case "log":
          outcome.response = { tbList: [] };
          return outcome;
        case "give":
          // Unreachable with an empty board; the answer the client uses when a piece is gone.
          outcome.response = {
            Error: 20122,
            TypeId: request.typeId,
            RoleId: request.roleId,
          };
          return outcome;
        case "listing": {
          if (!season || request.typeId < 1 || request.typeId > 4)
            throw refuse(EXCHANGE_ERROR.window, "no_season");
          const mission = missionState(player);
          const day = missionDay(Date.now());
          if (mission.exchangeDay !== day) {
            mission.exchangeDay = day;
            setTowerTask(player, group, EXCHANGE_TASK.listingCount, 0);
          }
          const flags = towerTask(player, group, EXCHANGE_TASK.listingFlags);
          const bit = 1 << request.typeId;
          if (request.cancel) {
            setTowerTask(player, group, EXCHANGE_TASK.listingFlags, flags & ~bit);
          } else {
            const count = towerTask(player, group, EXCHANGE_TASK.listingCount);
            if ((flags & bit) !== 0 || count >= season.maxListing)
              throw refuse(EXCHANGE_ERROR.window, "cannot_list");
            setTowerTask(player, group, EXCHANGE_TASK.listingFlags, flags | bit);
            setTowerTask(player, group, EXCHANGE_TASK.listingCount, count + 1);
          }
          outcome.response = {
            Error: 0,
            Type: request.cancel ? 1 : 0,
            TypeId: request.typeId,
          };
          return outcome;
        }
        case "award": {
          // [INFER] A full set of the four collection currencies pays the first rare reward not yet
          // received (TaskId order) and one basic reward; the client holds no such rule.
          if (!season || season.collections.length === 0)
            throw refuse(EXCHANGE_ERROR.window, "no_season");
          const wallets = season.collections.map(([moneyId, count]) => ({
            money: player.money.find(({ id }) => id === moneyId),
            count: count!,
          }));
          if (wallets.some(({ money, count }) => (money?.count ?? 0) < count))
            throw refuse(EXCHANGE_ERROR.tokens, "incomplete_collection");
          for (const { money, count } of wallets) {
            money!.count -= count;
            outcome.moneyIds.add(money!.id);
          }
          const rewards = catalog.exchangeRewards.filter(({ id }) => id === season.id);
          const received = (taskId: number): boolean =>
            ((towerTask(player, group, EXCHANGE_TASK.rare + Math.floor(taskId / 30)) >>>
              (taskId % 30)) &
              1) ===
            1;
          const rare = rewards
            .filter(({ type }) => type === 1)
            .sort((left, right) => left.taskId - right.taskId)
            .find(({ taskId }) => !received(taskId));
          const basic = rewards.filter(({ type }) => type === 2);
          const items: BaseAward[] = [];
          if (rare) {
            items.push(rare.award);
            const key = EXCHANGE_TASK.rare + Math.floor(rare.taskId / 30);
            setTowerTask(
              player,
              group,
              key,
              (towerTask(player, group, key) | (1 << (rare.taskId % 30))) >>> 0,
            );
          }
          if (basic.length > 0) items.push(basic[random(basic.length)]!.award);
          grantTowerAwards(player, items, outcome);
          setTowerTask(
            player,
            group,
            EXCHANGE_TASK.awardCount,
            towerTask(player, group, EXCHANGE_TASK.awardCount) + 1,
          );
          refreshMissions(player);
          finishAwards();
          outcome.response = { Items: namedAwardRows(items) };
          return outcome;
        }
      }
      return outcome;
    }

    case "enter": {
      const family = NAMED_FAMILIES[request.family];
      const level = resolveNamedLevel(player, catalog, request);
      if (!level || (family.fought && !family.fought(level)))
        throw refuse(NAMED_ERROR.invalid, "unknown_level");
      // The concert interest levels (type 6) cost no vigour: the tickets of task 1/554-559 are the limit.
      if (
        family.key === "music" &&
        level.type === 6 &&
        interestChances(player, level.levelId) < 1
      )
        throw refuse(NAMED_ERROR.exhausted, "no_interest_fight_left");
      let cardGuids: number[] = [];
      if (level.type !== 2 && !family.noFormation?.(level)) {
        if (
          request.formationId <= 0 ||
          !player.formations.some(({ id }) => id === request.formationId)
        )
          throw refuse(NAMED_ERROR.formation, "unknown_formation");
        if (towerVigour(player) < towerEnergyCost(player, level.cost))
          throw refuse(NAMED_ERROR.vigour, "insufficient_vigour");
        const cost = level.otherCost;
        if (
          cost &&
          (player.money.find(({ id }) => id === cost.moneyId)?.count ?? 0) < cost.count
        )
          throw refuse(NAMED_ERROR.noToken, "insufficient_tokens");
        cardGuids = fightRoster(player, request.formationId);
      }
      // A resent request while the same fight is open keeps its run.
      const open = readNamedRun(state);
      if (
        !open?.active ||
        open.family !== family.key ||
        open.tower !== level.tower ||
        open.level !== level.levelId ||
        open.diff !== level.diff
      ) {
        state.run = {
          id: randomUUID(),
          family: family.key,
          tower: level.tower,
          level: level.levelId,
          diff: level.diff,
          node: level.node,
          active: true,
          activityType: family.activityType,
          formationId: request.formationId,
          cardGuids,
          resultCmd: 0,
          reply: null,
        };
      }
      const data: Record<string, number> = {};
      for (const field of family.echo) {
        data[field] =
          field === "nType"
            ? family.echoRequestType
              ? (whole(request.body.nType) ?? family.activityType)
              : family.activityType
            : (whole(request.body[field]) ?? (field === "nodeId" ? request.node : 0));
      }
      outcome.response = { tbData: data, tbDrop: [], tbDropItems: [] };
      return outcome;
    }

    case "pass": {
      const family = NAMED_FAMILIES[request.family];
      const level = resolveNamedLevel(player, catalog, request);
      if (!level) throw refuse(NAMED_ERROR.invalid, "unknown_level");
      const run = readNamedRun(state);
      if (
        !run ||
        run.family !== family.key ||
        run.tower !== level.tower ||
        run.level !== level.levelId ||
        run.diff !== level.diff
      )
        throw refuse(NAMED_ERROR.invalid, "no_matching_entry");
      if (!run.active) {
        // The client resends a settlement until it hears back: replay, never pay twice.
        if (run.resultCmd !== family.pass || run.reply === null)
          throw refuse(NAMED_ERROR.invalid, "entry_already_closed");
        outcome.response = structuredClone(run.reply);
        return outcome;
      }

      const wallet = walletSnapshot(player);
      const cost = level.type === 2 ? 0 : towerEnergyCost(player, level.cost);
      spendTowerVigour(player, cost, outcome, true);
      if (level.otherCost) {
        const wallet = player.money.find(({ id }) => id === level.otherCost!.moneyId);
        if (!wallet || wallet.count < level.otherCost.count)
          throw refuse(NAMED_ERROR.noToken, "insufficient_tokens");
        wallet.count -= level.otherCost.count;
        outcome.moneyIds.add(wallet.id);
      }

      const { first, before } = namedRecordFirst(player, family, level);
      // An interest level (concert type 6) pays by score on every run, not by first clear.
      const interest = family.key === "music" && level.type === 6;
      const score = whole(request.body.nScore) ?? 0;
      const awards: number[][] = rollTowerAwards(
        interest ? { ...level, firstAwards: [] } : level,
        first,
        run.id,
      );
      if (interest) awards.push(...interestScoreAwards(level, score));
      grantTowerAwards(player, awards, outcome);
      const bit = family.recordBit(level);
      setTowerTask(
        player,
        family.group,
        family.recordKey(level),
        bit >= 0 ? (before | (1 << bit)) >>> 0 : before + 1,
      );

      const reply: Record<string, unknown> = {
        nMasterExp: level.masterExp,
        nCardExp: level.cardExp,
        newGoalIds: [] as number[],
        isPass: true,
      };

      switch (family.key) {
        case "micro": {
          // Goal flags are bits of 59/300 + level * 5 + diff; the level's score sums the reached goals' points.
          const slot = level.levelId * MICRO_DIFF_MAX + level.diff;
          const goals =
            catalog.microGoals.get(
              namedLevelKey(level.tower, level.levelId, level.diff),
            ) ?? [];
          let bits = towerTask(player, family.group, MICRO_TASK.goals + slot);
          let score = towerTask(player, family.group, MICRO_TASK.score + slot);
          const fresh: number[] = [];
          for (const goal of goals) {
            if (
              ((bits >>> goal.id) & 1) === 1 ||
              !reachedGoal(request.body.tbGoals, goal.id)
            )
              continue;
            bits = (bits | (1 << goal.id)) >>> 0;
            score += goal.points;
            grantTowerAwards(player, goal.rewards, outcome);
            awards.push(...goal.rewards.map((award) => [...award, 100]));
            fresh.push(goal.id);
          }
          setTowerTask(player, family.group, MICRO_TASK.goals + slot, bits);
          setTowerTask(player, family.group, MICRO_TASK.score + slot, score);
          reply.newGoalIds = fresh;
          break;
        }
        case "coop": {
          // OtherCost levels are the SP levels: the pass counts the kills, 339 pays them once.
          const kill = level.killAward;
          const kills = kill
            ? (whole(
                positional(fieldRecord(request.body.tbKillMonster).tbKillMonster)?.[
                  kill.attribute
                ],
              ) ?? 0)
            : 0;
          if (level.type === 3 && kill) {
            const count = Math.min(kills, kill.max);
            run.sp = {
              kills,
              payout:
                count > 0
                  ? [
                      kill.award[0],
                      kill.award[1],
                      kill.award[2],
                      kill.award[3],
                      kill.award[4] * count,
                    ]
                  : null,
              settled: false,
            };
          }
          reply.spKillNum = kills;
          reply.curScore = kills;
          break;
        }
        case "buff": {
          // A level's score is the points of the buffs chosen for the run (positions in BuffTowerBuff), kept at its best.
          const scores =
            catalog.buffScores.get(`${level.tower}:${level.levelId}:${level.diff}`) ??
            [];
          const chosen = positional(request.body.tbBuffs) ?? [];
          let score = 0;
          for (const entry of chosen) score += scores[(whole(entry) ?? 0) - 1] ?? 0;
          const key =
            BUFF_TASK.score + (level.levelId - 1) * BUFF_TASK.diffCount + level.diff;
          const best = towerTask(player, family.group, key);
          if (score > best) {
            setTowerTask(player, family.group, key, score);
            setTowerTask(
              player,
              family.group,
              BUFF_TASK.total,
              towerTask(player, family.group, BUFF_TASK.total) + score - best,
            );
          }
          break;
        }
        case "boss": {
          // [INFER] no client code holds the formula: half of MaxScore for a clear, the rest by the health left.
          const rate = Math.min(1, Math.max(0, Number(request.body.leftHpRate) || 0));
          const score = Math.round(level.maxScore * (0.5 + 0.5 * rate));
          const key =
            BOSS_TASK.score + (level.levelId - 1) * BOSS_TASK.diffCount + level.diff;
          const isNew = score > towerTask(player, family.group, key);
          if (isNew) setTowerTask(player, family.group, key, score);
          reply.tbRet = [Number(request.body.useTime) || 0, rate, score, isNew];
          break;
        }
        case "linkage":
          if (level.type !== 2)
            refreshLinkageMissions(player, catalog, {
              clears: level.type === 0 ? 1 : 0,
              vigour: cost,
            });
          break;
        case "music":
          if (interest) settleInterest(player, level, score);
          break;
        case "chess":
          if (level.type === 1) chessBossWon(player, catalog, request.body, outcome);
          break;
        default:
          break;
      }
      if (MISSION_FAMILIES.has(family.key)) {
        bumpWalletChange(player, wallet);
        recordMissionPass(player, catalog, family, level, request.body, cost);
        refreshMissions(player);
      }

      if (level.masterExp > 0) {
        outcome.experience = applyPlayerExperience(player, level.masterExp);
        if (outcome.experience.vigourRecovery > 0) outcome.moneyIds.add(MONEY_VIGOUR);
      }
      if (level.type !== 2 && run.cardGuids.length > 0)
        recordTowerFight(player, {
          id: run.id,
          tower: run.tower,
          level: run.level,
          active: false,
          activityType: run.activityType,
          node: run.node,
          formationId: run.formationId,
          cardGuids: run.cardGuids,
          resultCmd: family.pass,
          reply: null,
        });
      finishAwards();

      // Micro reads tbAwards, every other family tbData; both are always arrays.
      reply.tbData = awards;
      reply.tbAwards = awards;
      run.active = false;
      run.resultCmd = family.pass;
      run.reply = reply;
      outcome.response = reply;
      return outcome;
    }

    case "fail": {
      // Several Fail requests carry no event id, so the open run of the family decides.
      const family = NAMED_FAMILIES[request.family];
      const run = readNamedRun(state);
      if (run?.active && run.family === family.key) {
        const level = catalog.level(run.family, run.tower, run.level, run.diff);
        const cost =
          !level || level.type === 2 ? 0 : towerEnergyCost(player, level.cost);
        spendTowerVigour(player, cost, outcome, false);
        run.active = false;
        run.resultCmd = family.fail;
        run.reply = {};
        if (level && family.key === "music" && level.type === 6)
          settleInterest(player, level, 0);
        if (level && family.key === "chess" && level.type === 1)
          chessBossFailed(player, catalog, request.body, outcome);
      }
      outcome.response = {};
      return outcome;
    }
  }
}

function fullTeamHealth(player: Player, group: number): void {
  for (let team = 1; team <= BOSS_RUSH_TEAMS; team++) {
    setTowerTask(player, group, BOSS_RUSH_TASK.hp + team, 100);
    setTowerTask(player, group, BOSS_RUSH_TASK.shield + team, 100);
  }
}

function reconcileMaximumFightPower(player: Player): boolean {
  const maximum = maximumFormationPower(player);
  if (maximum <= player.fightPower) return false;
  player.fightPower = maximum;
  return true;
}

function deductGachaCost(
  player: Player,
  pool: GachaPool,
  ten: boolean,
  updatedItemGuids: Set<number>,
  updatedMoneyIds: Set<number>,
): void {
  const itemCost = ten ? pool.costTen : pool.costOne;
  if (itemCost) {
    const [genre, detail, particular, templateLevel, count] = itemCost;
    const ticket = player.inventory.find(
      (item) =>
        item.genre === genre &&
        item.detail === detail &&
        item.particular === particular &&
        item.templateLevel === templateLevel &&
        item.count >= count,
    );
    if (ticket) {
      ticket.count -= count;
      updatedItemGuids.add(ticket.guid);
      return;
    }
    if (pool.cashType === 1) {
      throw new InsufficientGachaCurrencyError(pool.id);
    }
  }

  if (pool.cashType === 0) {
    const required = pool.exchangeRate * (ten ? 10 : 1);
    const free = player.money.find(({ id }) => id === MONEY_DIAMOND);
    const paid = player.money.find(({ id }) => id === MONEY_PAY_DIAMOND);
    const freeCost = pool.canUseFreeDiamond ? Math.min(free?.count ?? 0, required) : 0;
    const paidCost = required - freeCost;
    if ((paid?.count ?? 0) < paidCost) {
      throw new InsufficientGachaCurrencyError(pool.id);
    }
    if (freeCost > 0 && free) {
      free.count -= freeCost;
      updatedMoneyIds.add(MONEY_DIAMOND);
    }
    if (paidCost > 0 && paid) {
      paid.count -= paidCost;
      updatedMoneyIds.add(MONEY_PAY_DIAMOND);
    }
    return;
  }

  if (pool.cashType > 1) {
    const required = ten ? pool.moneyCostTen : pool.moneyCostOne;
    const money = player.money.find(({ id }) => id === pool.cashType);
    if (!money || money.count < required) {
      throw new InsufficientGachaCurrencyError(pool.id);
    }
    money.count -= required;
    updatedMoneyIds.add(pool.cashType);
    return;
  }

  throw new InsufficientGachaCurrencyError(pool.id);
}

/**
 * 客户端对钻石（免费 3 / 付费 12）与金币（免费 2 / 付费 17）按合并余额扣费，
 * 免费部分优先。其它货币只扣对应 id。
 */
const SHOP_MONEY_COMBOS: ReadonlyMap<number, readonly number[]> = new Map([
  [MONEY_GOLD, [MONEY_GOLD, MONEY_PAY_GOLD]],
  [MONEY_PAY_GOLD, [MONEY_GOLD, MONEY_PAY_GOLD]],
  [MONEY_DIAMOND, [MONEY_DIAMOND, MONEY_PAY_DIAMOND]],
  [MONEY_PAY_DIAMOND, [MONEY_DIAMOND, MONEY_PAY_DIAMOND]],
]);

function deductShopMoney(
  player: Player,
  moneyId: number,
  amount: number,
  updatedMoneyIds: Set<number>,
): void {
  const combo = SHOP_MONEY_COMBOS.get(moneyId) ?? [moneyId];
  const total = combo.reduce(
    (sum, id) => sum + (player.money.find((money) => money.id === id)?.count ?? 0),
    0,
  );
  if (total < amount) throw new ShopError("insufficient_funds");
  let remaining = amount;
  for (const id of combo) {
    if (remaining === 0) break;
    const money = player.money.find((entry) => entry.id === id);
    if (!money || money.count <= 0) continue;
    const taken = Math.min(money.count, remaining);
    money.count -= taken;
    remaining -= taken;
    updatedMoneyIds.add(id);
  }
}

/** RefreshRule=1 的常驻商店使用随机货架；其余规则直接全量上架。 */
function shopUsesShelf(tab: ShopTabConfig): boolean {
  return tab.refreshRule === 1;
}

function rerollShelf(
  catalog: ShopCatalog,
  tab: ShopTabConfig,
  shopState: ShopState,
  now: number,
  manual: boolean,
): void {
  const nowSeconds = Math.floor(now / 1_000);
  const pool = catalog
    .goodsForShop(tab.shopId)
    .filter((config) => isGoodsInWindow(config, nowSeconds));
  const stock = rollShelf(pool, tab.columns);
  shopState.shelf = stock.map((entry) => ({
    goodsId: entry.goodsId,
    discount: entry.discount,
    bought: 0,
  }));
  const baseKey = shopShelfKey(tab, now);
  shopState.shelfKey = manual ? `${baseKey}#m${shopState.refreshCount}` : baseKey;
}

/**
 * 使商店状态对齐当前时间：跨运营日重置手动刷新次数与每日计数，跨运营周重置
 * 每周计数，随机货架过槽位则重掷。
 */
function reconcileShopState(
  player: Player,
  catalog: ShopCatalog,
  tab: ShopTabConfig,
  now: number,
): ShopState {
  player.shops ??= {};
  const operationalDate = shopOperationalDate(now);
  const weekId = shopOperationalWeek(now);
  let shopState = player.shops[String(tab.shopId)];
  if (!shopState) {
    shopState = {
      operationalDate,
      weekId,
      refreshCount: 0,
      shelfKey: null,
      shelf: [],
      counters: {},
    };
    player.shops[String(tab.shopId)] = shopState;
  }
  if (shopState.operationalDate !== operationalDate) {
    shopState.operationalDate = operationalDate;
    shopState.refreshCount = 0;
    for (const counters of Object.values(shopState.counters)) {
      counters.daily = 0;
    }
  }
  if (shopState.weekId !== weekId) {
    shopState.weekId = weekId;
    for (const counters of Object.values(shopState.counters)) {
      counters.week = 0;
    }
  }
  if (shopUsesShelf(tab)) {
    const baseKey = shopShelfKey(tab, now);
    const currentBase = shopState.shelfKey?.split("#")[0] ?? null;
    if (currentBase !== baseKey) {
      rerollShelf(catalog, tab, shopState, now, false);
    }
  }
  return shopState;
}

function buildShopGoodsEntry(
  config: GoodsConfig,
  shopState: ShopState,
  shelfEntry: ShopShelfEntry | null,
): ShopGoodsListEntry {
  const counters = shopState.counters[String(config.goodsId)];
  const entry: ShopGoodsListEntry = {
    goodsid: config.goodsId,
    buynum: counters?.total ?? 0,
  };
  if (config.refreshLimitNum !== null) {
    entry.refreshbuynum = shelfEntry?.bought ?? 0;
  }
  if (config.dailyLimitNum !== null) {
    entry.dailybuynum = counters?.daily ?? 0;
  }
  if (config.weekLimitNum !== null) {
    entry.weekbuynum = counters?.week ?? 0;
  }
  if (config.totalLimitNum !== null) {
    entry.totalbuynum = counters?.total ?? 0;
  }
  if (config.shelfLifeLmt !== null) {
    entry.shelfbuynum = shelfEntry?.bought ?? counters?.shelf ?? 0;
  }
  // 客户端对未下发 discount 的商品回退到 DiscountList 第一条，而该列为空时
  // 解析结果是 0（显示免费）；为避免客户端价格与服务端扣费不一致，所有商品
  // 都显式下发折扣：货架商品用货架掷出的折扣，其余用配置第一条（无配置时
  // parseDiscountList 已兜底 100）。
  entry.discount = shelfEntry?.discount ?? config.discountList[0]!.discount;
  return entry;
}

function buildShopGoodsList(
  player: Player,
  catalog: ShopCatalog,
  shopId: number,
  now: number,
): ShopGoodsListResult {
  const tab = catalog.getTab(shopId);
  const nowSeconds = Math.floor(now / 1_000);
  if (!tab || !isShopOpen(tab, nowSeconds)) {
    return {
      shopId,
      isOpen: false,
      refreshCount: 0,
      goodsList: [],
      endTime: tab?.end ?? 0,
    };
  }
  const shopState = reconcileShopState(player, catalog, tab, now);
  const goodsList: ShopGoodsListEntry[] = [];
  if (shopUsesShelf(tab)) {
    for (const shelfEntry of shopState.shelf) {
      const config = catalog.getGoods(shelfEntry.goodsId);
      if (!config || !isGoodsInWindow(config, nowSeconds)) continue;
      goodsList.push(buildShopGoodsEntry(config, shopState, shelfEntry));
    }
  } else {
    for (const config of catalog.goodsForShop(shopId)) {
      if (!isGoodsInWindow(config, nowSeconds)) continue;
      goodsList.push(buildShopGoodsEntry(config, shopState, null));
    }
  }
  return {
    shopId,
    isOpen: true,
    refreshCount: shopState.refreshCount,
    goodsList,
    endTime: tab.end ?? 0,
  };
}

/** Oath data is separate from UI task groups44 and exchange counters60. */
export interface PromiseGirlProgress extends PromiseGirlData {
  enteredAtMs: number;
  timeCarryMs: Record<string, number>;
}
export interface PromiseState {
  version: 1;
  girls: Record<string, PromiseGirlProgress>;
  assignments: Record<string, "work" | "rest">;
  clockMs: number;
  seenFightRuns: string[];
}
export interface PromiseFightEvent {
  kind: "chapter" | "bounty" | "pvp" | "tower";
  runId: string;
  formationId: number;
  cardGuids: readonly number[];
  chapter?: number;
  index?: number;
  difficulty?: number;
  eventType?: number;
  activityId?: number;
  mapId?: number;
}
export interface PromiseOperationResult {
  player: Player;
  response: unknown;
  updatedItems: InventoryEntryState[];
  updatedMoney: MoneyState[];
  updatedGirls: GirlState[];
  completedTaskIds: number[];
}
export class PromiseOperationError extends Error {
  constructor(
    readonly reason: string,
    readonly clientError = 29998,
  ) {
    super(`Fantasy Oath: ${reason}`);
    this.name = "PromiseOperationError";
  }
}
function promiseState(player: Player, now: number): PromiseState {
  return (player.promise ??= {
    version: 1,
    girls: {},
    assignments: {},
    clockMs: now,
    seenFightRuns: [],
  });
}
function promiseUnlocked(player: Player): boolean {
  return (
    (player.levels.find((level) => level.id === makeLevelId(6, 12, 1))?.star ?? 0) > 0
  );
}
function promiseDto(girl: PromiseGirlProgress): PromiseGirlData {
  return {
    girlid: girl.girlid,
    step: girl.step,
    cardguid: girl.cardguid,
    rewardstep: girl.rewardstep,
    rewardlist: [...girl.rewardlist],
    taskdatas: girl.taskdatas.map((task) => ({ ...task })),
  };
}
function promiseSetStage(
  girl: PromiseGirlProgress,
  step: number,
  catalog: PromiseCatalog,
  now: number,
): void {
  const config = catalog.getStep(girl.girlid, step);
  if (!config) throw new PromiseOperationError("invalid_stage");
  girl.step = step;
  girl.enteredAtMs = now;
  girl.timeCarryMs = {};
  girl.taskdatas = config.tasklist.map((id) => ({ id, count: 0, status: 0 }));
}
function promiseItemCount(player: Player, gdpl: readonly number[]): number {
  return player.inventory
    .filter(
      (item) =>
        item.genre === gdpl[0] &&
        item.detail === gdpl[1] &&
        item.particular === gdpl[2] &&
        item.templateLevel === gdpl[3],
    )
    .reduce((sum, item) => sum + Math.max(0, item.count), 0);
}
function promiseConsume(
  player: Player,
  gdpl: readonly number[],
  count: number,
  updated: Set<number>,
): void {
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    gdpl.length < 4 ||
    promiseItemCount(player, gdpl) < count
  )
    throw new PromiseOperationError("insufficient_items");
  let remaining = count;
  for (const item of player.inventory) {
    if (remaining === 0) break;
    if (
      item.genre !== gdpl[0] ||
      item.detail !== gdpl[1] ||
      item.particular !== gdpl[2] ||
      item.templateLevel !== gdpl[3] ||
      item.count <= 0
    )
      continue;
    const take = Math.min(item.count, remaining);
    item.count -= take;
    remaining -= take;
    updated.add(item.guid);
  }
}
function promiseReady(
  task: PromiseTaskData,
  config: PromiseTaskConfig,
  count: number,
): void {
  if (task.status === 2) return;
  task.count = Math.min(config.count, Math.max(0, Math.floor(count)));
  task.status = task.count >= config.count ? 1 : 0;
}
/** Accrue only the interval during which an assignment was actually active. */
function reconcilePromise(player: Player, catalog: PromiseCatalog, now: number): void {
  const state = player.promise;
  if (!state) return;
  const effectiveNow = Math.max(state.clockMs, now);
  const elapsed = effectiveNow - state.clockMs;
  const timeBuffs = new Map<number, { weight: number; multiplier: number }>();
  for (const buff of CafePetCatalog.loadDefault().petBuffs()) {
    if (
      buff.System !== 1 ||
      ![2, 3, 4].includes(buff.BuffType) ||
      player.taskValues[String((49 << 16) | (1410 + buff.Id))] !== 1
    )
      continue;
    const previous = timeBuffs.get(buff.BuffType);
    if (!previous || buff.Weight > previous.weight)
      timeBuffs.set(buff.BuffType, {
        weight: buff.Weight,
        multiplier: buff.Param1 / 100,
      });
  }
  for (const girl of Object.values(state.girls)) {
    if (catalog.isSimple(girl.girlid)) continue;
    for (const task of girl.taskdatas) {
      const config = catalog.task(task.id);
      if (!config || task.status === 2) continue;
      switch (config.strtype) {
        case "FriendLevel":
          promiseReady(
            task,
            config,
            player.girls.find((entry) => entry.girlId === config.girlid)?.level ?? 0,
          );
          break;
        case "CardCount": {
          const suits = new Set(
            player.inventory
              .filter(
                (entry) =>
                  entry.genre === 1 &&
                  entry.detail === config.girlid &&
                  entry.count > 0 &&
                  entry.enhanceLevel >= (config.lvlmt ?? 0),
              )
              .map((entry) => entry.particular),
          );
          promiseReady(task, config, suits.size);
          break;
        }
        case "ReduceItem":
          promiseReady(task, config, promiseItemCount(player, config.gdpl ?? []));
          break;
        case "ReduceMoney":
          promiseReady(
            task,
            config,
            player.money.find((entry) => entry.id === config.moneytype)?.count ?? 0,
          );
          break;
        case "GreeterTime":
        case "CafeTime":
        case "RestTime": {
          const active =
            config.strtype === "GreeterTime"
              ? player.taskValues[String(MAIN_GIRL_TASK_ID)] === config.girlid
              : state.assignments[String(config.girlid)] ===
                (config.strtype === "CafeTime" ? "work" : "rest");
          if (active && elapsed > 0) {
            const kind =
              config.strtype === "GreeterTime"
                ? 2
                : config.strtype === "RestTime"
                  ? 3
                  : 4;
            const multiplier = timeBuffs.get(kind)?.multiplier ?? 1;
            const total =
              (girl.timeCarryMs[String(task.id)] ?? 0) + elapsed * multiplier;
            girl.timeCarryMs[String(task.id)] = total % 60_000;
            promiseReady(task, config, task.count + Math.floor(total / 60_000));
          }
          break;
        }
      }
    }
  }
  state.clockMs = effectiveNow;
}
function promiseIncrement(
  player: Player,
  type: string,
  girlId: number,
  amount: number,
  accepts: (config: PromiseTaskConfig) => boolean = () => true,
): number[] {
  if (!player.promise || amount <= 0) return [];
  const catalog = PromiseCatalog.loadDefault();
  const completed: number[] = [];
  for (const girl of Object.values(player.promise.girls))
    for (const task of girl.taskdatas) {
      const config = catalog.task(task.id);
      if (
        !config ||
        config.strtype !== type ||
        config.girlid !== girlId ||
        task.status === 2 ||
        !accepts(config)
      )
        continue;
      const before = task.status;
      promiseReady(task, config, task.count + amount);
      if (before === 0 && task.status === 1) completed.push(task.id);
    }
  return completed;
}
function promiseFightProgress(
  player: Player,
  event: PromiseFightEvent,
  now: number,
  catalog: PromiseCatalog,
): number[] {
  if (!player.promise) return [];
  if (
    !event.runId ||
    event.runId.length > 160 ||
    !Number.isSafeInteger(event.formationId) ||
    !event.cardGuids.length
  )
    throw new PromiseOperationError("invalid_fight_context");
  const state = player.promise;
  if (state.seenFightRuns.includes(event.runId)) return [];
  // Gateway validated these main-card GUIDs at entry. Formation edits during a
  // run must not roll back otherwise valid combat settlement.
  const cards = event.cardGuids.map((guid) =>
    player.inventory.find(
      (item) => item.guid === guid && item.genre === 1 && item.count > 0,
    ),
  );
  if (cards.some((card) => !card))
    throw new PromiseOperationError("fight_card_not_owned");
  reconcilePromise(player, catalog, now);
  state.seenFightRuns.push(event.runId);
  // Identifiers are server-issued and unique. Persist the bounded replay window across restarts.
  if (state.seenFightRuns.length > 4096)
    state.seenFightRuns.splice(0, state.seenFightRuns.length - 4096);
  const main = new Set(event.cardGuids);
  const completed: number[] = [];
  const matches = (
    expected: readonly number[] | undefined,
    values: readonly (number | undefined)[],
  ) => !expected || expected.every((v, i) => v < 0 || v === values[i]);
  for (const girl of Object.values(state.girls))
    for (const task of girl.taskdatas) {
      const config = catalog.task(task.id);
      if (!config || task.status === 2) continue;
      const infight = config.infight ?? -1;
      if (
        !cards.some(
          (card) =>
            card &&
            card.detail === config.girlid &&
            (infight < 0 || main.has(card.guid)) &&
            (infight <= 1 || card.particular === 17),
        )
      )
        continue;
      const match =
        config.strtype === "ArbitraryFight" ||
        (config.strtype === "ChapterFight" &&
          event.kind === "chapter" &&
          matches(config.lvpara, [event.chapter, event.index, event.difficulty])) ||
        (config.strtype === "EventFight" &&
          event.kind === "bounty" &&
          matches(config.lvpara, [event.eventType, event.difficulty])) ||
        (config.strtype === "PvpFight" &&
          event.kind === "pvp" &&
          matches(config.lvpara, [event.activityId, event.difficulty])) ||
        (config.strtype === "TowerFight" &&
          event.kind === "tower" &&
          matches(config.lvpara, [event.activityId]));
      if (match) {
        const previous = task.status;
        promiseReady(task, config, task.count + 1);
        if (previous === 0 && task.status === 1) completed.push(task.id);
      }
    }
  return completed;
}
function promiseCardReward(
  player: Player,
  girl: PromiseGirlProgress,
  catalog: PromiseCatalog,
  items: Set<number>,
  girls: Set<number>,
): void {
  const step = catalog.getStep(girl.girlid, girl.step);
  if (!step || step.cardgdpl.length !== 4) return;
  let card = player.inventory.find(
    (item) =>
      item.guid === girl.cardguid &&
      item.count > 0 &&
      item.genre === 1 &&
      item.detail === girl.girlid &&
      item.particular === 17,
  );
  card ??= player.inventory
    .filter(
      (item) =>
        item.genre === 1 &&
        item.detail === girl.girlid &&
        item.particular === 17 &&
        item.count > 0,
    )
    .sort(
      (a, b) =>
        b.templateLevel - a.templateLevel ||
        b.enhanceLevel - a.enhanceLevel ||
        a.guid - b.guid,
    )[0];
  if (!card) {
    const guid = player.nextItemGuid;
    addInventoryAward(
      player,
      [step.cardgdpl[0]!, step.cardgdpl[1]!, step.cardgdpl[2]!, step.cardgdpl[3]!, 1],
      items,
    );
    card = player.inventory.find((entry) => entry.guid === guid)!;
  }
  // A development grant or legitimate prior upgrade must never be downgraded.
  card.templateLevel = Math.max(card.templateLevel, step.cardgdpl[3]!);
  card.enhanceLevel = Math.max(card.enhanceLevel, step.cardlv);
  card.breakLevel = Math.max(card.breakLevel, step.cardbreaklv);
  const alreadyOwnedStage = catalog
    .getSteps(girl.girlid)
    .filter(
      (config) =>
        config.cardgdpl.length === 4 &&
        config.cardgdpl[3]! <= card!.templateLevel &&
        config.cardlv <= card!.enhanceLevel &&
        config.cardbreaklv <= card!.breakLevel,
    )
    .at(-1);
  card.cardSkillLevels = [0, 1, 2, 3].map((index) =>
    Math.max(
      card!.cardSkillLevels?.[index] ?? 1,
      step.cardskilllv[index] ?? 1,
      alreadyOwnedStage?.cardskilllv[index] ?? 1,
    ),
  ) as [number, number, number, number];
  girl.cardguid = card.guid;
  items.add(card.guid);
  const changed = reconcileGirlAppearanceState(player, items);
  for (const id of changed.updatedGirlIds) girls.add(id);
}
function promiseResult(
  player: Player,
  response: unknown,
  items = new Set<number>(),
  money = new Set<number>(),
  girls = new Set<number>(),
  completedTaskIds: number[] = [],
): PromiseOperationResult {
  const snapshot = structuredClone(player);
  return {
    player: snapshot,
    response,
    updatedItems: snapshot.inventory.filter((item) => items.has(item.guid)),
    updatedMoney: snapshot.money.filter((entry) => money.has(entry.id)),
    updatedGirls: snapshot.girls.filter((entry) => girls.has(entry.girlId)),
    completedTaskIds,
  };
}

function cafePetHooks(
  player: Player,
  items: Set<number>,
  money: Set<number>,
  now: number,
): CafePetRuntimeHooks {
  return {
    beforeBuffChange: () => reconcilePromise(player, PromiseCatalog.loadDefault(), now),
    chargeMoney: (id, count) => {
      if (count > 0) deductShopMoney(player, id, count, money);
    },
    consumeItem: (gdpl, count) => promiseConsume(player, gdpl, count, items),
    inventory: (gdpl) => promiseItemCount(player, gdpl),
    itemByGuid: (guid) => {
      const item = player.inventory.find((entry) => entry.guid === guid);
      return item
        ? {
            gdpl: [item.genre, item.detail, item.particular, item.templateLevel],
            count: item.count,
          }
        : undefined;
    },
    grant: (awards) => grantAwards(player, awards, items, money),
  };
}

function applyCafeStaff(player: Player, rows: unknown, now: number): number[][][] {
  if (
    !Array.isArray(rows) ||
    rows.length !== 3 ||
    rows.some((row) => !Array.isArray(row))
  )
    throw new PromiseOperationError("invalid_waiter_list");
  const seen = new Set<number>();
  const assignments: Record<string, "work" | "rest"> = {};
  const normalized = (rows as unknown[][]).map((row, index) =>
    row.map((value) => {
      if (
        !value ||
        typeof value !== "object" ||
        (Array.isArray(value) && value.length !== 2)
      )
        throw new PromiseOperationError("invalid_waiter");
      // Active NCafeNet sends { {girlId, modelId}, ... } Lua tuples.
      // Keep accepting prior local-server object saves/requests for migration.
      const entry: Record<string, unknown> = Array.isArray(value)
        ? { girlId: value[0], modelId: value[1] }
        : (value as Record<string, unknown>);
      const girlId = entry.girlId;
      // Neptune has no supported cafe worker model in the release client.
      if (girlId === 27) throw new PromiseOperationError("invalid_waiter");
      if (
        typeof girlId !== "number" ||
        !Number.isSafeInteger(girlId) ||
        seen.has(girlId)
      )
        throw new PromiseOperationError("invalid_waiter");
      const girl = player.girls.find((candidate) => candidate.girlId === girlId);
      if (!girl) throw new PromiseOperationError("girl_not_owned");
      const requestedModel =
        entry.modelId === undefined || entry.modelId === 0
          ? girl.modelId
          : entry.modelId;
      if (
        typeof requestedModel !== "number" ||
        !Number.isSafeInteger(requestedModel) ||
        requestedModel <= 0
      )
        throw new PromiseOperationError("invalid_waiter_model");
      if (requestedModel === RETIRED_SILVER_DISCIPLINE_MODEL_ID)
        throw new PromiseOperationError("waiter_model_not_owned");
      let modelId = requestedModel;
      const outfit = CUSTOM_GIRL_OUTFITS.get(modelId);
      if (outfit) {
        if (!ownsCustomGirlOutfit(player, girlId, outfit))
          throw new PromiseOperationError("waiter_model_not_owned");
        // The café roster uses the stock 3D model.
        modelId = outfit.stockModelId;
      } else {
        const modelTask = String(
          makeGirlTaskId(GIRL_SUIT_TASK_GROUP, girlId, fixGirlModelTaskOffset(modelId)),
        );
        if (modelId !== girl.modelId && !(player.taskValues[modelTask]! > 0))
          throw new PromiseOperationError("waiter_model_not_owned");
      }
      if (
        (player.taskValues[
          String(
            makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_TRAIN_POSITION_OFFSET),
          )
        ] ?? 0) > 0
      )
        throw new PromiseOperationError("girl_already_training");
      seen.add(girlId);
      assignments[String(girlId)] = index === 0 ? "work" : "rest";
      return { girlId, modelId };
    }),
  );
  promiseState(player, now);
  reconcilePromise(player, PromiseCatalog.loadDefault(), now);
  player.promise!.assignments = assignments;
  player.cafe.roomGirlsList = normalized;
  player.cafe.rooms = completeHouseRooms(player.cafe.rooms);
  for (const [index, room] of player.cafe.rooms.entries())
    room.girlIds = normalized[index]!.map((girl) => girl.girlId);
  return normalized.map((row) => row.map(({ girlId, modelId }) => [girlId, modelId]));
}

export class HeadpatError extends Error {
  constructor(
    readonly reason: string,
    readonly clientError = 1,
  ) {
    super(`Headpat rejected: ${reason}`);
    this.name = "HeadpatError";
  }
}
export class HouseOperationError extends Error {
  constructor(readonly reason: string) {
    super(`House change rejected: ${reason}`);
    this.name = "HouseOperationError";
  }
}
export interface HouseMutationResult extends PromiseOperationResult {
  house: HouseData;
  updatedRooms: HouseRoomState[];
  updatedFurniture: CafeFurnitureState[];
  updatedThemes: HouseThemeState[];
}

export interface CafeOperationResult extends PromiseOperationResult {
  updatedFurniture: CafeFurnitureState[];
  updatedThemes: HouseThemeState[];
  notifications: CafeNotification[];
  taskValuesChanged: boolean;
}

export interface CafePetOperationResult extends PromiseOperationResult {
  notifications: CafeNotification[];
  taskValuesChanged: boolean;
}

export interface GirlHeadpatResult extends PromiseOperationResult {
  response: HeadpatResponse;
}

export class MomentSelectionError extends Error {
  constructor() {
    super("Invalid or already answered Moments topic");
    this.name = "MomentSelectionError";
  }
}

export class PlayerRepository {
  readonly #store: JsonStore<PersistedState>;
  readonly #defaults: AppConfig["playerDefaults"];
  readonly #logger: Logger;
  readonly #welcomeGifts: boolean;
  readonly #activities = createDefaultActivityEngine();
  readonly #cafePresence = new Map<string, number>();

  constructor({
    store,
    defaults,
    logger,
    welcomeGifts = false,
  }: PlayerRepositoryOptions) {
    this.#store = store;
    this.#defaults = defaults;
    this.#logger = logger;
    this.#welcomeGifts = welcomeGifts;
  }

  /** Pet time advances on requests; unchanged polling never writes the save. */
  async handleCafePetRequest(
    account: string,
    parameters: unknown,
    now = Date.now(),
    catalog = CafePetCatalog.loadDefault(),
  ): Promise<CafePetOperationResult> {
    const run = (player: Player): CafePetOperationResult => {
      const items = new Set<number>(),
        money = new Set<number>();
      const beforeTasks = JSON.stringify(player.taskValues);
      const pets = new CafePetRuntime(
        player,
        catalog,
        now,
        cafePetHooks(player, items, money, now),
      );
      const result = pets.operate(parameters);
      return {
        ...promiseResult(player, result.response, items, money),
        notifications: result.notifications,
        taskValuesChanged: beforeTasks !== JSON.stringify(player.taskValues),
      };
    };
    const current = this.get(account);
    if (!current) throw new Error("Unknown café pet account");
    const preview = structuredClone(current);
    let result = run(preview);
    if (JSON.stringify(preview) !== JSON.stringify(current)) {
      await this.#store.update((state) => {
        const player = state.players[account];
        if (!player) throw new Error("Unknown café pet account");
        result = run(player);
      });
    }
    return result;
  }

  async handlePromiseRequest(
    account: string,
    command: number,
    parameters: unknown,
    now = Date.now(),
    catalog = PromiseCatalog.loadDefault(),
  ): Promise<PromiseOperationResult> {
    const request = parsePromiseRequest(command, parameters);
    if (!request || !Number.isFinite(now))
      throw new PromiseOperationError("invalid_request");
    if (request.command === 230 || request.command === 232) {
      const player = this.get(account);
      if (!player) throw new PromiseOperationError("player_not_found");
      const released = catalog.releasedGirls(now);
      return promiseResult(
        player,
        request.command === 230
          ? { PromiseIsOpen: released.length > 0 }
          : { OpenGirlList: [...released] },
      );
    }
    let result: PromiseOperationResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new PromiseOperationError("player_not_found");
      const promise = promiseState(player, now);
      reconcilePromise(player, catalog, now);
      const items = new Set<number>(),
        money = new Set<number>(),
        girls = new Set<number>();
      let response: unknown;
      const released = catalog.releasedGirls(now);
      if (request.command === 230) response = { PromiseIsOpen: released.length > 0 };
      else if (request.command === 231)
        response = Object.values(promise.girls)
          .sort((a, b) => a.girlid - b.girlid)
          .map(promiseDto);
      else if (request.command === 232) response = { OpenGirlList: [...released] };
      else {
        if (!promiseUnlocked(player)) throw new PromiseOperationError("chapter_locked");
        if (request.command === 229) {
          const config = catalog.exchange(request.Id);
          if (!config || request.Num > 1_000_000)
            throw new PromiseOperationError("invalid_exchange");
          const taskKey = String((60 << 16) | (100 + config.Id));
          const bought = player.taskValues[taskKey] ?? 0;
          if (config.LimitNum > 0 && bought + request.Num > config.LimitNum)
            throw new PromiseOperationError("exchange_limit");
          if (config.tbSubItem.length === 5)
            promiseConsume(
              player,
              config.tbSubItem,
              config.tbSubItem[4]! * request.Num,
              items,
            );
          else if (config.tbMoney.length === 2) {
            try {
              deductShopMoney(
                player,
                config.tbMoney[0]!,
                config.tbMoney[1]! * request.Num,
                money,
              );
            } catch {
              throw new PromiseOperationError("insufficient_money");
            }
          } else throw new PromiseOperationError("invalid_exchange_cost");
          const award = [...config.tbAwardItem] as BaseAward;
          award[4] *= request.Num;
          grantAwards(player, [award], items, money);
          player.taskValues[taskKey] = bought + request.Num;
          response = { Error: 0, tbAwardItem: [award] };
        } else {
          const girlId =
            request.command === 228
              ? request.girlId
              : "girlid" in request
                ? request.girlid
                : 0;
          if (
            !released.includes(girlId) ||
            !player.girls.some((girl) => girl.girlId === girlId)
          )
            throw new PromiseOperationError("girl_not_available");
          let girl = promise.girls[String(girlId)];
          if (request.command === 233) {
            if (!girl) {
              const cost = catalog.activationCost(girlId);
              if (!cost) throw new PromiseOperationError("invalid_activation_cost");
              promiseConsume(player, cost, cost[4], items);
              const existing = player.inventory
                .filter(
                  (item) =>
                    item.genre === 1 &&
                    item.detail === girlId &&
                    item.particular === 17 &&
                    item.count > 0,
                )
                .sort(
                  (a, b) =>
                    b.templateLevel - a.templateLevel ||
                    b.enhanceLevel - a.enhanceLevel ||
                    a.guid - b.guid,
                )[0];
              girl = {
                girlid: girlId,
                step: 1,
                cardguid: existing?.guid ?? 0,
                rewardstep: 0,
                rewardlist: [0],
                taskdatas: [],
                enteredAtMs: now,
                timeCarryMs: {},
              };
              promise.girls[String(girlId)] = girl;
              promiseSetStage(girl, 1, catalog, now);
            }
            reconcilePromise(player, catalog, now);
            response = promiseDto(girl);
          } else {
            if (!girl) throw new PromiseOperationError("girl_not_activated");
            if (request.command === 228) {
              if (
                !catalog.isSimple(girlId) ||
                request.step > catalog.maxStep(girlId) + 1 ||
                request.step > girl.step + 1
              )
                throw new PromiseOperationError("invalid_simple_stage");
              if (request.step === girl.step + 1) {
                girl.rewardstep = girl.step;
                girl.step = request.step;
                girl.enteredAtMs = now;
              }
              response = promiseDto(girl);
            } else if (request.command === 234) {
              const task = girl.taskdatas.find((entry) => entry.id === request.taskid);
              const config = catalog.task(request.taskid);
              if (!task || !config || task.status === 0)
                throw new PromiseOperationError("task_not_ready");
              if (task.status !== 2) {
                if (config.strtype === "ReduceItem")
                  promiseConsume(player, config.gdpl ?? [], config.count, items);
                if (config.strtype === "ReduceMoney") {
                  try {
                    deductShopMoney(player, config.moneytype ?? 0, config.count, money);
                  } catch {
                    throw new PromiseOperationError("insufficient_money");
                  }
                }
                task.count = config.count;
                task.status = 2;
              }
              response = { ...task };
            } else if (request.command === 235) {
              if (
                catalog.isSimple(girlId) ||
                girl.taskdatas.some((task) => task.status !== 2)
              )
                throw new PromiseOperationError("stage_not_ready");
              if (girl.step <= 6 && girl.rewardstep < girl.step) {
                promiseCardReward(player, girl, catalog, items, girls);
                girl.rewardstep = girl.step;
              }
              if (girl.step < catalog.maxStep(girlId))
                promiseSetStage(girl, girl.step + 1, catalog, now);
              reconcilePromise(player, catalog, now);
              response = promiseDto(girl);
            } else if (request.command === 239) {
              if (request.step !== 7 || girl.step !== 7 || catalog.isSimple(girlId))
                throw new PromiseOperationError("invalid_reward_stage");
              const config = catalog.getStep(girlId, request.step)!;
              const claimed = girl.rewardlist[0] ?? 0;
              const completed = girl.taskdatas.filter(
                (task) => task.status === 2,
              ).length;
              const awards: BaseAward[] = config.rewards
                .filter((award) => award[5] > claimed && award[5] <= completed)
                .map((award) => [award[0], award[1], award[2], award[3], award[4]]);
              grantAwards(player, awards, items, money);
              girl.rewardlist[0] = Math.max(claimed, completed);
              if (completed === girl.taskdatas.length) girl.rewardstep = 7;
              const changed = reconcileGirlAppearanceState(player, items);
              for (const id of changed.updatedGirlIds) girls.add(id);
              response = {
                girlid: girlId,
                step: 7,
                ncompletedtasknum: girl.rewardlist[0],
                errid: 0,
                tbaward: awards,
              };
            }
          }
        }
      }
      result = promiseResult(player, response, items, money, girls);
    });
    return result!;
  }

  async recordPromiseFight(
    account: string,
    event: PromiseFightEvent,
    now = Date.now(),
  ): Promise<PromiseOperationResult> {
    const current = this.get(account);
    if (!current) throw new PromiseOperationError("player_not_found");
    if (!current.promise || Object.keys(current.promise.girls).length === 0)
      return promiseResult(current, undefined);
    let result: PromiseOperationResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new PromiseOperationError("player_not_found");
      const completed = promiseFightProgress(
        player,
        event,
        now,
        PromiseCatalog.loadDefault(),
      );
      result = promiseResult(
        player,
        undefined,
        undefined,
        undefined,
        undefined,
        completed,
      );
    });
    return result!;
  }

  /** One accepted gameplay interaction commits stock, affection and missions together. */
  async headpatGirl(
    account: string,
    girlId: number,
    nType: number,
    now = Date.now(),
  ): Promise<GirlHeadpatResult> {
    if (
      !Number.isSafeInteger(girlId) ||
      girlId <= 0 ||
      !isHeadpatInteractionType(nType) ||
      !Number.isSafeInteger(now) ||
      now < 0
    )
      throw new HeadpatError("invalid_request");
    let result: GirlHeadpatResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      const girl = player?.girls.find((candidate) => candidate.girlId === girlId);
      if (!player || !girl) throw new HeadpatError("girl_not_owned");
      // The tutorial forcibly enables its gesture even with zero stock. Its
      // callback advances CartoonMgr. No original reward/consumption rule was
      // recovered, so preserve the narrative ACK without gameplay credit.
      if (nType === 2) {
        result = {
          ...promiseResult(player, undefined),
          response: { sCmd: "HeadTouched", nId: girlId, nType },
        };
        return;
      }
      if (!consumeHeadpatCharge(player.taskValues, now))
        throw new HeadpatError("no_charges", 2);
      const alreadyAtCap = girl.level >= girlAffectionMaxLevel(girlId);
      const oldLevel = girl.level,
        oldExperience = girl.exp;
      const gain = addGirlAffection(
        girlId,
        oldLevel,
        oldExperience,
        HEADPAT_AFFECTION_EXPERIENCE,
      );
      const updatedGirlIds = new Set<number>();
      reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      if (gain) {
        girl.level = gain.newLevel;
        girl.exp = gain.newExperience;
        unlockGirlLevelSecrets(player, girlId, gain.oldLevel, gain.newLevel);
        reconcileGirlFetterUnlocks(player, girlId);
        updatedGirlIds.add(girlId);
      }
      incrementDailyMissionProgress(player, 105, 1, now);
      const completedTaskIds = promiseIncrement(player, "TouchHead", girlId, 1);
      reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      const response: HeadpatResponse = {
        sCmd: "HeadTouched",
        nId: girlId,
        nType,
        ...(alreadyAtCap ? { nIsMaxlevel: true } : {}),
        nAddExp: gain?.addedExperience ?? 0,
        nOldExp: oldExperience,
        nNewExp: girl.exp,
        nOldLevel: oldLevel,
        nNewLevel: girl.level,
      };
      result = {
        ...promiseResult(
          player,
          response,
          undefined,
          undefined,
          updatedGirlIds,
          completedTaskIds,
        ),
        response,
      };
    });
    return result!;
  }

  async recordPromiseHeadTouch(
    account: string,
    girlId: number,
    now = Date.now(),
  ): Promise<PromiseOperationResult> {
    const current = this.get(account);
    if (!current || !current.girls.some((girl) => girl.girlId === girlId))
      throw new PromiseOperationError("girl_not_owned");
    if (!current.promise || Object.keys(current.promise.girls).length === 0)
      return promiseResult(current, undefined);
    let result: PromiseOperationResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player || !player.girls.some((girl) => girl.girlId === girlId))
        throw new PromiseOperationError("girl_not_owned");
      reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      result = promiseResult(
        player,
        undefined,
        undefined,
        undefined,
        undefined,
        promiseIncrement(player, "TouchHead", girlId, 1),
      );
    });
    return result!;
  }

  /** Preserve the client\'s three room rows; rows1/2 both accumulate rest time. */
  async persistHouseChanges(
    account: string,
    changes: HouseChanges,
    now = Date.now(),
    catalog = CafeCatalog.loadDefault(),
  ): Promise<HouseMutationResult> {
    let result: HouseMutationResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player || (changes.roleId !== 0 && changes.roleId !== player.roleId))
        throw new HouseOperationError("house_not_owned");
      const integer = (value: number) =>
        Number.isSafeInteger(value) && value >= 0 && value <= 0xffff_ffff;
      const furniture = (player.cafe.furniture ??= []);
      const rooms = (player.cafe.rooms ??= [1, 2, 6].map((roomId) => ({
        roomId,
        girlIds: [],
        friendGirlId: 0,
        themeId: 0,
        furnitureIds: [],
      })));
      for (const roomId of [1, 2, 6])
        if (!rooms.some((room) => room.roomId === roomId))
          rooms.push({
            roomId,
            girlIds: [],
            friendGirlId: 0,
            themeId: 0,
            furnitureIds: [],
          });
      const themes = (player.cafe.themes ??= []);
      const seen = new Set<number>();
      for (const change of changes.furniture) {
        if (
          !integer(change.objId) ||
          change.objId === 0 ||
          seen.has(change.objId) ||
          !catalog.furniture(change.templateId)
        )
          throw new HouseOperationError("invalid_furniture");
        seen.add(change.objId);
        let current = furniture.find((item) => item.objId === change.objId);
        if (!current) {
          if (
            !isNativeFixedHouseObjectId(change.objId) ||
            change.templateId !== change.objId
          )
            throw new HouseOperationError("furniture_not_owned");
          current = {
            templateId: change.templateId,
            objId: change.objId,
            parentId: 0,
            roomId: 0,
            pose: {
              templateId: change.templateId,
              parentTemplateId: 0,
              place: 0,
              posX: 0,
              posY: 0,
              rotate: 0,
            },
            status: 0,
            isNew: false,
            bizcount: 0,
          };
          furniture.push(current);
        }
        if (current.templateId !== change.templateId)
          throw new HouseOperationError("furniture_identity_changed");
        for (const key of ["parentId", "roomId", "status", "bizcount"] as const)
          if (change[key] !== undefined) {
            if (!integer(change[key]!))
              throw new HouseOperationError("invalid_furniture_value");
            current[key] = change[key]!;
          }
        if (![0, 1, 2, 6].includes(current.roomId))
          throw new HouseOperationError("invalid_furniture_room");
        if (change.isNew !== undefined) current.isNew = change.isNew;
        if (change.pose) {
          for (const [key, value] of Object.entries(change.pose))
            if (!Number.isSafeInteger(value))
              throw new HouseOperationError(`invalid_pose_${key}`);
          current.pose = { ...current.pose, ...change.pose };
          if (current.pose.templateId !== current.templateId)
            throw new HouseOperationError("pose_template_mismatch");
        }
        if (current.parentId === 0) current.roomId = 0;
        else {
          const placement = catalog.furniture(current.templateId)!.DicPlace;
          if (placement.length === 1 && [1, 2, 6].includes(placement[0]!))
            current.roomId = placement[0]!;
        }
        if (current.roomId === 0) current.status = 0;
      }
      const known = new Map(furniture.map((item) => [item.objId, item]));
      for (const item of furniture) {
        if (!item.parentId) continue;
        if (
          item.parentId === item.objId ||
          (!known.has(item.parentId) && !isNativeFixedHouseObjectId(item.parentId))
        )
          throw new HouseOperationError("invalid_parent");
        let parent = known.get(item.parentId);
        const visited = new Set([item.objId]);
        while (parent) {
          if (visited.has(parent.objId)) throw new HouseOperationError("parent_cycle");
          visited.add(parent.objId);
          parent = known.get(parent.parentId);
        }
      }
      const changedRooms = new Set<number>();
      for (const change of changes.rooms) {
        if (![1, 2, 6].includes(change.roomId) || changedRooms.has(change.roomId))
          throw new HouseOperationError("invalid_room");
        changedRooms.add(change.roomId);
        const room = rooms.find((room) => room.roomId === change.roomId)!;
        if (change.girlIds !== undefined) {
          if (
            new Set(change.girlIds).size !== change.girlIds.length ||
            change.girlIds.some(
              (id) => !player.girls.some((girl) => girl.girlId === id),
            )
          )
            throw new HouseOperationError("room_girl_not_owned");
          room.girlIds = [...change.girlIds];
        }
        if (change.friendGirlId !== undefined) room.friendGirlId = change.friendGirlId;
        if (change.themeId !== undefined) room.themeId = change.themeId;
        // Incoming furnitureIds describe changed members only. Never replace
        // the saved room membership with this partial client delta.
      }
      const changedThemes: HouseThemeState[] = [];
      for (const change of changes.themes) {
        let theme = change.themeId
          ? themes.find((theme) => theme.themeId === change.themeId)
          : undefined;
        if (!theme && change.newGenerate === false && !change.themeId) {
          const matches = themes.filter(
            (theme) => theme.name === change.name && theme.roomtype === change.roomtype,
          );
          if (matches.length !== 1)
            throw new HouseOperationError("ambiguous_theme_identity");
          theme = matches[0];
        }
        if (!theme) {
          if (change.themeId && change.newGenerate !== true)
            throw new HouseOperationError("theme_not_owned");
          const themeId = Math.max(0, ...themes.map((theme) => theme.themeId)) + 1;
          theme = {
            themeId,
            templateThemeId: 0,
            name: "",
            poses: [],
            newGenerate: true,
            roomtype: 1,
            createtime: Math.floor(now / 1_000),
          };
          themes.push(theme);
        }
        if (change.roomtype !== undefined) {
          if (![1, 2, 6].includes(change.roomtype))
            throw new HouseOperationError("invalid_theme_room");
          theme.roomtype = change.roomtype;
        }
        if (change.name !== undefined) {
          if (change.name.length > 256)
            throw new HouseOperationError("invalid_theme_name");
          theme.name = change.name;
        }
        if (change.templateThemeId !== undefined)
          theme.templateThemeId = change.templateThemeId;
        if (change.poses !== undefined) {
          for (const pose of change.poses)
            if (
              !catalog.furniture(pose.templateId) ||
              Object.values(pose).some((value) => !Number.isSafeInteger(value))
            )
              throw new HouseOperationError("invalid_theme_pose");
          theme.poses = structuredClone(change.poses);
        }
        changedThemes.push(theme);
      }
      for (const room of rooms)
        room.furnitureIds = furniture
          .filter((item) => item.roomId === room.roomId)
          .map((item) => item.objId)
          .sort((a, b) => a - b);
      const snapshot = structuredClone(player);
      result = {
        ...promiseResult(player, undefined),
        house: {
          rooms: snapshot.cafe.rooms!,
          furniture: snapshot.cafe.furniture!,
          themes: snapshot.cafe.themes!,
        },
        updatedRooms: snapshot.cafe.rooms!,
        updatedFurniture: snapshot.cafe.furniture!.filter((item) =>
          seen.has(item.objId),
        ),
        updatedThemes: snapshot.cafe.themes!.filter((theme) =>
          changedThemes.some((changed) => changed.themeId === theme.themeId),
        ),
      };
    });
    return result!;
  }

  async materializeCafeFurniture(
    account: string,
    templateIds: readonly number[],
    catalog = CafeCatalog.loadDefault(),
  ): Promise<CafeOperationResult> {
    let result: CafeOperationResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new HouseOperationError("player_not_found");
      const items = new Set<number>();
      const furniture = materializeOwnedCafeFurniture(player, templateIds, catalog, {
        consumeItem: (gdpl, count) => promiseConsume(player, gdpl, count, items),
      });
      result = {
        ...promiseResult(player, undefined, items),
        updatedFurniture: structuredClone(furniture),
        updatedThemes: [],
        notifications: [],
        taskValuesChanged: false,
      };
    });
    return result!;
  }

  async buyPredefinedCafeTheme(
    account: string,
    templateThemeId: number,
    templateIds?: readonly number[],
    now = Date.now(),
    catalog = CafeCatalog.loadDefault(),
  ): Promise<CafeOperationResult & { theme: HouseThemeState }> {
    let result: (CafeOperationResult & { theme: HouseThemeState }) | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new HouseOperationError("player_not_found");
      const items = new Set<number>(),
        money = new Set<number>();
      const commerce = new CafeFurnitureCommerce(player, catalog, now, {
        chargeMoney: (id, count) => {
          if (count > 0) deductShopMoney(player, id, count, money);
        },
        consumeItem: (gdpl, count) => promiseConsume(player, gdpl, count, items),
        grant: (awards) => grantAwards(player, awards, items, money),
        updatedGirl() {},
      });
      const purchase = commerce.buyPredefinedTheme(templateThemeId, templateIds);
      result = {
        ...promiseResult(player, purchase.theme, items, money),
        theme: structuredClone(purchase.theme),
        updatedFurniture: structuredClone(commerce.updatedFurniture),
        updatedThemes: structuredClone(commerce.updatedThemes),
        notifications: [],
        taskValuesChanged: false,
      };
    });
    return result!;
  }

  async deleteHouseTheme(
    account: string,
    themeId: number,
  ): Promise<HouseMutationResult> {
    let result: HouseMutationResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new HouseOperationError("player_not_found");
      const index = (player.cafe.themes ?? []).findIndex(
        (theme) => theme.themeId === themeId,
      );
      if (index < 0) throw new HouseOperationError("theme_not_owned");
      player.cafe.themes!.splice(index, 1);
      for (const room of player.cafe.rooms ?? [])
        if (room.themeId === themeId) room.themeId = 0;
      const snapshot = structuredClone(player);
      result = {
        ...promiseResult(player, undefined),
        house: {
          rooms: snapshot.cafe.rooms ?? [],
          furniture: snapshot.cafe.furniture ?? [],
          themes: snapshot.cafe.themes ?? [],
        },
        updatedRooms: snapshot.cafe.rooms ?? [],
        updatedFurniture: [],
        updatedThemes: [],
      };
    });
    return result!;
  }

  /** Cached-table, event-driven café commands. No write for unchanged polling reads. */
  async handleCafeRequest(
    account: string,
    command: number,
    parameters: unknown,
    now = Date.now(),
    catalog = CafeCatalog.loadDefault(),
  ): Promise<CafeOperationResult> {
    if (!Number.isSafeInteger(now) || now < 0)
      throw new CafeOperationError("invalid_clock", command);
    const values =
      parameters && typeof parameters === "object" && "tbParam" in parameters
        ? (parameters as { tbParam: unknown }).tbParam
        : parameters;
    const present = this.#cafePresence.get(account);
    const offline = present === undefined || now - present > 60_000;
    const run = (player: Player): CafeOperationResult => {
      const items = new Set<number>(),
        money = new Set<number>(),
        girls = new Set<number>();
      const beforeTasks = JSON.stringify(player.taskValues);
      const automaticFurniture: number[] = [];
      const hooks: CafeRuntimeHooks = {
        chargeMoney: (id, count) => {
          if (count > 0) deductShopMoney(player, id, count, money);
        },
        consumeItem: (gdpl, count) => promiseConsume(player, gdpl, count, items),
        grant: (awards) => {
          grantAwards(player, awards, items, money);
          for (const award of awards)
            if (award[0] === 11 && award[4] > 0) {
              const config = catalog
                .furnitureItems()
                .find((row) => row.ItemInfo.join("-") === award.slice(0, 4).join("-"));
              if (!config)
                throw new CafeOperationError("unknown_furniture_award", command);
              for (let count = 0; count < award[4]; count++)
                automaticFurniture.push(config.Id);
            }
        },
        updatedGirl: (id) => {
          girls.add(id);
        },
        coffeeSold: (_id, count) => {
          const mission = guideMission(40_017)!;
          const key = String(makeGuideTaskId(mission.id)),
            value = player.taskValues[key] ?? 0;
          const old = guideMissionProgress(value);
          player.taskValues[key] = makeGuideMissionTaskValue(
            Math.max(old, Math.min(mission.target, old + count)),
            hasClaimedGuideMission(value),
          );
        },
        isTraining: (id) =>
          (player.taskValues[
            String(
              makeGirlTaskId(GIRL_STATE_TASK_GROUP, id, GIRL_TRAIN_POSITION_OFFSET),
            )
          ] ?? 0) > 0,
      };
      const runtime = new CafeRuntime(player, catalog, now, hooks);
      if (command === 112) {
        const pets = new CafePetRuntime(
          player,
          CafePetCatalog.fromCafeCatalog(catalog),
          now,
          cafePetHooks(player, items, money, now),
        );
        pets.download();
      }
      const commerce = new CafeFurnitureCommerce(player, catalog, now, hooks);
      if (offline) runtime.reconcileOffline();
      else runtime.reconcileMood(runtime.now);
      if (player.promise && now - player.promise.clockMs >= 60_000) {
        const pendingTime = Object.values(player.promise.girls).some((girl) =>
          girl.taskdatas.some((task) => {
            if (task.status === 2) return false;
            const config = PromiseCatalog.loadDefault().task(task.id);
            if (!config) return false;
            if (config.strtype === "GreeterTime")
              return player.taskValues[String(MAIN_GIRL_TASK_ID)] === config.girlid;
            if (config.strtype === "CafeTime")
              return player.promise!.assignments[String(config.girlid)] === "work";
            if (config.strtype === "RestTime")
              return player.promise!.assignments[String(config.girlid)] === "rest";
            return false;
          }),
        );
        if (pendingTime) reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      }
      let response: unknown;
      let commerceHandled = false;
      if (command === 113) {
        if (!Array.isArray(values) || values.length !== 3)
          throw new CafeOperationError("invalid_waiter_list", command, []);
        const limits = [
          runtime.level.CafeUnlockNum,
          runtime.level.RestUnlockNum,
          runtime.level.DormUnlockNum,
        ];
        for (let index = 0; index < 3; index++)
          if (
            !Array.isArray(values[index]) ||
            (values[index] as unknown[]).length > limits[index]!
          )
            throw new CafeOperationError("waiter_capacity", command, []);
        response = applyCafeStaff(player, values, now);
        for (const girl of player.girls) {
          const key = String(girl.girlId);
          runtime.business.moodAt[key] = runtime.now;
          runtime.business.moodCarry[key] = 0;
          const assignment = player.promise?.assignments[key];
          player.taskValues[String((41 << 16) | girl.girlId)] =
            assignment === "rest" ? runtime.now : 0;
          player.taskValues[String((41 << 16) | (10_000 + girl.girlId))] =
            assignment === "work" ? runtime.now : 0;
        }
      } else {
        const extra = commerce.operate(command, values);
        if (extra) {
          commerceHandled = true;
          response = extra.response;
          runtime.notifications.push(...extra.notifications);
          if (command === 14) incrementDailyMissionProgress(player, 108, 1, now);
        } else response = runtime.operate(command, values).response;
      }
      const pending = commerceHandled ? [] : automaticFurniture;
      if (pending.length)
        commerce.updatedFurniture.push(
          ...materializeOwnedCafeFurniture(player, pending, catalog, hooks),
        );
      const result = promiseResult(player, response, items, money, girls);
      return {
        ...result,
        updatedFurniture: structuredClone(commerce.updatedFurniture),
        updatedThemes: structuredClone(commerce.updatedThemes),
        notifications: runtime.notifications,
        taskValuesChanged: beforeTasks !== JSON.stringify(player.taskValues),
      };
    };
    const current = this.get(account);
    if (!current) throw new CafeOperationError("player_not_found", command);
    try {
      const preview = structuredClone(current),
        before = JSON.stringify(current);
      const ready = run(preview);
      let result = ready;
      if (JSON.stringify(preview) !== before) {
        await this.#store.update((state) => {
          const player = state.players[account];
          if (!player) throw new CafeOperationError("player_not_found", command);
          result = run(player);
        });
      }
      if (command === 125) this.#cafePresence.delete(account);
      else this.#cafePresence.set(account, now);
      return result;
    } catch (error) {
      if (error instanceof CafeOperationError) throw error;
      throw new CafeOperationError(
        error instanceof Error ? error.message : "cafe_rejected",
        command,
        command === 113 ? [] : { nError: 1 },
      );
    }
  }

  async setCafeWaiterList(
    account: string,
    rows: unknown,
    now = Date.now(),
  ): Promise<PromiseOperationResult> {
    let result: PromiseOperationResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new PromiseOperationError("player_not_found");
      result = promiseResult(player, applyCafeStaff(player, rows, now));
    });
    return result!;
  }

  async setPromiseWaiters(
    account: string,
    assignments: readonly { girlId: number; position: "work" | "rest" }[],
    now = Date.now(),
  ): Promise<PromiseOperationResult> {
    let result: PromiseOperationResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new PromiseOperationError("player_not_found");
      const next: Record<string, "work" | "rest"> = {};
      for (const entry of assignments) {
        if (
          !player.girls.some((girl) => girl.girlId === entry.girlId) ||
          !["work", "rest"].includes(entry.position) ||
          next[String(entry.girlId)]
        )
          throw new PromiseOperationError("invalid_waiter");
        if (
          (player.taskValues[
            String(makeGirlTaskId(3, entry.girlId, GIRL_TRAIN_POSITION_OFFSET))
          ] ?? 0) > 0
        )
          throw new PromiseOperationError("girl_already_training");
        next[String(entry.girlId)] = entry.position;
      }
      promiseState(player, now);
      reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      player.promise!.assignments = next;
      result = promiseResult(player, undefined);
    });
    return result!;
  }

  async getOrCreate(account: string, now = Date.now()): Promise<Player> {
    const safeAccount = account || "offline";
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[safeAccount];
      if (player) {
        if (this.#welcomeGifts) reconcileStarterCafe(player, now);
        reconcileEnergyActivity(player, now);
        if (this.#welcomeGifts)
          reconcileWelcomeMail((player.mail ??= makeMailbox()), now);
        reconcileCustomGirlOutfits(player);
        reconcileHeadpatCharges(player.taskValues, now);
        reconcileInventoryLockState(player);
        reconcileRuneState(player);
        reconcileRuneSkills(player);
        reconcileDailyMissions(player);
        reconcileDailySignUp(player);
        reconcileEightDaySignUp(player);
        reconcileBounty(player);
        reconcileChapterStarTaskValues(player);
        reconcileMaximumFightPower(player);
        this.#activities.reconcile(player);
        reconcileNamedTowerSeeds(player);
        if (player.cafe.pets)
          new CafePetRuntime(
            player,
            CafePetCatalog.loadDefault(),
            now,
            cafePetHooks(player, new Set(), new Set(), now),
          ).download();
        return;
      }

      const roleId = state.nextRoleId++;
      const registerTime = unixTime();
      player = {
        account: safeAccount,
        roleId,
        name: this.#defaults.name,
        level: this.#defaults.level,
        exp: this.#defaults.exp,
        fightPower: this.#defaults.fightPower,
        serverZone: this.#defaults.serverZone,
        registerTime,
        lastLoginAt: null,
        live2dEnableLevel: 3,
        live2dHX: false,
        taskValues: {
          ...INITIAL_COFFEE_TASK_VALUES,
          ...(this.#defaults.firstLevelComplete ? { [FIRST_LEVEL_TASK_ID]: 6 } : {}),
        },
        levels: [],
        nextItemGuid: 20_001,
        money: [
          { id: MONEY_VIGOUR, count: 28 },
          { id: MONEY_GOLD, count: 0 },
          { id: MONEY_DIAMOND, count: 0 },
        ],
        cafe: makeInitialCafeState(),
        phone: makeInitialPhoneState(),
        gacha: makeInitialGachaState(),
        dailySignUp: makeInitialDailySignUpState(),
        eightDaySignUp: makeInitialEightDaySignUpState(),
        bounty: makeInitialBountyState(),
        ...makeStarterRoster(registerTime),
      };
      if (this.#welcomeGifts) reconcileStarterCafe(player, now);
      reconcileEnergyActivity(player, now);
      reconcileInventoryLockState(player);
      reconcileRuneState(player);
      reconcileDailyMissions(player);
      reconcileGirlAppearanceState(player);
      reconcileGirlFetterUnlocks(player);
      reconcileBounty(player);
      reconcileChapterStarTaskValues(player);
      reconcileMaximumFightPower(player);
      this.#activities.reconcile(player);
      reconcileNamedTowerSeeds(player);
      reconcileHeadpatCharges(player.taskValues, now);
      state.players[safeAccount] = player;
      if (this.#welcomeGifts)
        reconcileWelcomeMail((player.mail ??= makeMailbox()), now, true);
      this.#logger.info("player.created", { account: safeAccount, roleId });
    });
    if (!player) throw new Error(`Failed to create player: ${safeAccount}`);
    return structuredClone(player);
  }

  getByRoleId(roleId: number): Player | null {
    return (
      Object.values(this.#store.snapshot().players).find(
        (player) => player.roleId === roleId,
      ) ?? null
    );
  }
  listLocalPlayers(): Player[] {
    return Object.values(this.#store.snapshot().players);
  }

  get(account: string): Player | null {
    return this.#store.snapshot().players?.[account] ?? null;
  }

  async syncPhoneEvents(account: string, storyPath?: string, now = Date.now()) {
    const snapshot = this.get(account);
    if (!snapshot) throw new Error("Unknown player");
    const pending = reconcilePlayerPhoneEvents(snapshot, now, storyPath);
    if (
      !pending.recordedStory &&
      !pending.letters.length &&
      !pending.moments.newPosts.length &&
      !pending.moments.newPublishableIds.length
    ) {
      return { player: snapshot, ...pending };
    }
    return this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error("Unknown player");
      const update = reconcilePlayerPhoneEvents(player, now, storyPath);
      return { player: structuredClone(player), ...update };
    });
  }

  async markLogin(account: string, now = Date.now()): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileCustomGirlOutfits(player);
      reconcileHeadpatCharges(player.taskValues, now);
      reconcileInventoryLockState(player);
      reconcileRuneState(player);
      reconcileDailyMissions(player, now);
      reconcileDailySignUp(player, now);
      reconcileEnergyActivity(player, now);
      reconcileEightDaySignUp(player, now, true);
      reconcileBounty(player, now);
      reconcileChapterStarTaskValues(player);
      reconcileMaximumFightPower(player);
      reconcileGirlFetterUnlocks(player);
      this.#activities.reconcile(player, now);
      reconcileNamedTowerSeeds(player);
      reconcilePlayerPhoneEvents(player, now);
      player.lastLoginAt = new Date(now).toISOString();
    });
    if (!player) throw new Error(`Failed to mark player login: ${account}`);
    return structuredClone(player);
  }

  async updateMailbox(
    account: string,
    action: MailAction,
    dailyAwards: readonly BaseAward[],
    now = Date.now(),
  ) {
    if (action.kind === "list") {
      const player = this.get(account);
      const lastDailyDate = player?.mail?.lastDailyDate;
      if (
        player &&
        lastDailyDate &&
        lastDailyDate >= dailySignUpOperationalDate(now) &&
        player.energyActivity?.operationalDate === dailySignUpOperationalDate(now)
      ) {
        return {
          player,
          acceptedIds: [],
          updatedItems: [],
          updatedMoney: [],
          updatedGirls: [],
          taskValuesChanged: false,
        };
      }
    }
    return this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const mailbox = (player.mail ??= makeMailbox());
      const energyTasksChanged = reconcileEnergyActivity(player, now);
      reconcileDailyPullMail(mailbox, dailyAwards, now);
      const items = new Set<number>();
      const money = new Set<number>();
      const acceptedIds = applyMailAction(mailbox, action, (awards) =>
        grantAwards(player, awards, items, money),
      );
      const roster = reconcileGirlAppearanceState(player, items);
      reconcileGirlFetterUnlocks(player);
      const snapshot = structuredClone(player);
      return {
        player: snapshot,
        acceptedIds,
        updatedItems: snapshot.inventory.filter(({ guid }) => items.has(guid)),
        updatedMoney: snapshot.money.filter(({ id }) => money.has(id)),
        updatedGirls: snapshot.girls.filter(({ girlId }) =>
          roster.updatedGirlIds.has(girlId),
        ),
        taskValuesChanged: roster.tasksChanged || energyTasksChanged,
      };
    });
  }

  async rename(account: string, name: string): Promise<Player> {
    if (name.length === 0) throw new Error("Player name must not be empty");

    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      player.name = name;
    });
    this.#logger.info("player.renamed", { account, name });
    if (!player) throw new Error(`Failed to rename player: ${account}`);
    return structuredClone(player);
  }

  async setMainGirl(
    account: string,
    girlId: number,
    now = Date.now(),
  ): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      if (!player.girls.some((girl) => girl.girlId === girlId)) {
        throw new Error(`Player does not own girl ${girlId}`);
      }
      reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      player.taskValues[String(MAIN_GIRL_TASK_ID)] = girlId;
    });
    if (!player) throw new Error(`Failed to set main girl: ${account}`);
    this.#logger.info("player.main_girl.updated", { account, girlId });
    return structuredClone(player);
  }

  async changeGirlClothes(
    account: string,
    girlId: number,
    modelId: number,
  ): Promise<GirlAppearanceResult> {
    let player: Player | undefined;
    let girl: GirlState | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      if (modelId === RETIRED_SILVER_DISCIPLINE_MODEL_ID) {
        throw new CustomGirlOutfitUnavailableError(modelId, "has been retired");
      }
      const outfit = CUSTOM_GIRL_OUTFITS.get(modelId);
      if (outfit && !ownsCustomGirlOutfit(player, girlId, outfit)) {
        throw new CustomGirlOutfitUnavailableError(
          modelId,
          "requires its active character card",
        );
      }
      girl = player.girls.find((candidate) => candidate.girlId === girlId);
      if (!girl) throw new Error(`Player does not own girl ${girlId}`);
      if (outfit) {
        girl.modelId = modelId;
        return;
      }
      const suitTaskId = String(
        makeGirlTaskId(GIRL_SUIT_TASK_GROUP, girlId, fixGirlModelTaskOffset(modelId)),
      );
      if ((player.taskValues[suitTaskId] ?? 0) <= 0) {
        throw new Error(`Player does not own girl ${girlId} model ${modelId}`);
      }
      girl.modelId = modelId;
      player.taskValues[suitTaskId] = 2;
    });
    if (!player || !girl) throw new Error(`Failed to change girl clothes: ${account}`);
    this.#logger.info("player.girl_clothes.updated", { account, girlId, modelId });
    return { player: structuredClone(player), girl: structuredClone(girl) };
  }

  async setGirlFightModel(
    account: string,
    girlId: number,
    enabled: boolean,
  ): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      if (
        girlId === 27 &&
        enabled &&
        !player.inventory.some(
          (item) =>
            item.count > 0 &&
            item.genre === 1 &&
            item.detail === 27 &&
            item.particular === 1 &&
            item.templateLevel === 1,
        )
      )
        throw new Error("Neptune's character card is required");
      if (!player.girls.some((girl) => girl.girlId === girlId)) {
        throw new Error(`Player does not own girl ${girlId}`);
      }
      const taskId = makeGirlTaskId(
        GIRL_STATE_TASK_GROUP,
        girlId,
        GIRL_FIGHT_MODEL_OFFSET,
      );
      player.taskValues[String(taskId)] = enabled ? 1 : 0;
    });
    if (!player) throw new Error(`Failed to set girl fight model: ${account}`);
    this.#logger.info("player.girl_fight_model.updated", {
      account,
      girlId,
      enabled,
    });
    return structuredClone(player);
  }

  async startGirlTraining(
    account: string,
    girlId: number,
    position: number,
    now = Date.now(),
  ): Promise<GirlTrainingResult> {
    const config = getGirlTrainingConfig(position);
    if (!config) throw new GirlTrainingError("invalid_position");

    let player: Player | undefined;
    let endTime = 0;
    let idempotent = false;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      if (!player.girls.some((girl) => girl.girlId === girlId)) {
        throw new GirlTrainingError("girl_not_owned");
      }

      const trainPositionKey = String(
        makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_TRAIN_POSITION_OFFSET),
      );
      const trainEndTimeKey = String(
        makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_TRAIN_END_TIME_OFFSET),
      );
      const currentPosition = player.taskValues[trainPositionKey] ?? 0;
      if (currentPosition === position) {
        endTime = player.taskValues[trainEndTimeKey] ?? 0;
        idempotent = true;
        return;
      }
      if (currentPosition > 0) {
        throw new GirlTrainingError("girl_already_training");
      }

      let activeTrainingCount = 0;
      for (const girl of player.girls) {
        const candidatePosition =
          player.taskValues[
            String(
              makeGirlTaskId(
                GIRL_STATE_TASK_GROUP,
                girl.girlId,
                GIRL_TRAIN_POSITION_OFFSET,
              ),
            )
          ] ?? 0;
        if (candidatePosition === position) {
          throw new GirlTrainingError("position_occupied");
        }
        if (candidatePosition > 0) activeTrainingCount += 1;
      }
      if (activeTrainingCount >= MAX_CONCURRENT_GIRL_TRAINING) {
        throw new GirlTrainingError("training_limit", 6);
      }

      reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      if (player.promise) delete player.promise.assignments[String(girlId)];
      if (player.cafe.roomGirlsList)
        player.cafe.roomGirlsList = player.cafe.roomGirlsList.map((row) =>
          row.filter((entry) => entry.girlId !== girlId),
        );
      for (const room of player.cafe.rooms ?? [])
        room.girlIds = room.girlIds.filter((id) => id !== girlId);
      endTime = Math.floor(now / 1_000) + config.durationSeconds;
      player.taskValues[
        String(makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_CAFE_POSITION_OFFSET))
      ] = 0;
      player.taskValues[trainPositionKey] = position;
      player.taskValues[trainEndTimeKey] = endTime;
      player.taskValues[
        String(
          makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_TRAIN_OUTDOOR_ID_OFFSET),
        )
      ] = DEFAULT_TRAINING_OUTDOOR_ID;
      incrementDailyMissionProgress(player, 106, 1, now);
    });
    if (!player) throw new Error(`Failed to start girl training: ${account}`);
    this.#logger.info("player.girl_training.started", {
      account,
      girlId,
      position,
      trainingType: config.type,
      endTime,
      durationSeconds: config.durationSeconds,
      loveReward: config.loveReward,
      crystalReward: config.crystalReward,
      idempotent,
    });
    return {
      player: structuredClone(player),
      girlId,
      position,
      endTime,
      outdoorId: DEFAULT_TRAINING_OUTDOOR_ID,
    };
  }

  async sendGirlGift(
    account: string,
    girlId: number,
    item: Gdpl,
    count: number,
    now = Date.now(),
  ): Promise<GirlGiftResult> {
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new GirlGiftError("invalid_request");
    }
    const perGiftExperience = girlGiftExperience(girlId, item);
    if (perGiftExperience === null) throw new GirlGiftError("gift_not_found");
    const handwork = handworkGiftState(item, now);

    let player: Player | undefined;
    let affection: GirlAffectionGain | undefined;
    const unlockedSecretIds: number[] = [];
    let fetterUnlocks: GirlFetterUnlock[] = [];
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const girl = player.girls.find((candidate) => candidate.girlId === girlId);
      if (!girl) throw new GirlGiftError("girl_not_owned");

      const inventoryItem = player.inventory.find(
        (candidate) =>
          candidate.genre === item[0] &&
          candidate.detail === item[1] &&
          candidate.particular === item[2] &&
          candidate.templateLevel === item[3],
      );
      if (!inventoryItem || inventoryItem.count < count) {
        throw new GirlGiftError("insufficient_gift");
      }

      let gain = addGirlAffection(
        girlId,
        girl.level,
        girl.exp,
        perGiftExperience * count,
      );
      if (
        !gain &&
        player.promise &&
        Object.values(player.promise.girls).some((progress) =>
          progress.taskdatas.some((task) => {
            const config = PromiseCatalog.loadDefault().task(task.id);
            return (
              task.status !== 2 &&
              config?.strtype === "GiftCount" &&
              config.girlid === girlId &&
              item[3] >= (config.lvlmt ?? 0)
            );
          }),
        )
      )
        gain = {
          addedExperience: 0,
          oldExperience: girl.exp,
          newExperience: girl.exp,
          oldLevel: girl.level,
          newLevel: girl.level,
          reachedMaxLevel: true,
        };
      if (!gain) throw new GirlGiftError("max_level");
      affection = gain;

      reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      promiseIncrement(
        player,
        "GiftCount",
        girlId,
        count,
        (task) => item[3] >= (task.lvlmt ?? 0),
      );
      inventoryItem.count -= count;
      girl.level = gain.newLevel;
      girl.exp = gain.newExperience;

      const taskValues = player.taskValues;
      unlockedSecretIds.push(
        ...unlockGirlLevelSecrets(player, girlId, gain.oldLevel, gain.newLevel),
      );
      fetterUnlocks = reconcileGirlFetterUnlocks(player, girlId);
      for (const { secretId, gdpl } of favoriteGiftSecretIds(girlId)) {
        if (
          gdpl[0] === item[0] &&
          gdpl[1] === item[1] &&
          gdpl[2] === item[2] &&
          gdpl[3] === item[3]
        ) {
          const key = String(
            makeGirlTaskId(
              GIRL_STATE_TASK_GROUP,
              girlId,
              GIRL_SECRET_OFFSET + secretId - 1,
            ),
          );
          if ((taskValues[key] ?? 0) === 0) {
            taskValues[key] = 1;
            unlockedSecretIds.push(secretId);
          }
        }
      }
    });
    if (!player || !affection) {
      throw new Error(`Failed to send girl gift: ${account}`);
    }
    this.#logger.info("player.girl_gift.sent", {
      account,
      girlId,
      item,
      count,
      addedExperience: affection.addedExperience,
      oldLevel: affection.oldLevel,
      newLevel: affection.newLevel,
      unlockedSecretIds,
    });
    const snapshot = structuredClone(player);
    const girl = snapshot.girls.find((candidate) => candidate.girlId === girlId);
    const consumedItem = snapshot.inventory.find(
      (candidate) =>
        candidate.genre === item[0] &&
        candidate.detail === item[1] &&
        candidate.particular === item[2] &&
        candidate.templateLevel === item[3],
    );
    if (!girl || !consumedItem) {
      throw new Error(`Girl gift state disappeared: ${account}`);
    }
    return {
      player: snapshot,
      girl,
      consumedItem,
      girlId,
      item,
      count,
      loved: isFavoriteGift(girlId, item),
      activityGift: handwork.active,
      specialActivityGift: handwork.special,
      addedExperience: affection.addedExperience,
      oldExperience: affection.oldExperience,
      newExperience: affection.newExperience,
      oldLevel: affection.oldLevel,
      newLevel: affection.newLevel,
      reachedMaxLevel: affection.reachedMaxLevel,
      unlockedSecretIds,
      fetterUnlocks,
    };
  }

  async claimGirlLevelAward(
    account: string,
    girlId: number,
    level: number,
  ): Promise<Player> {
    const index = girlLevelAwardIndex(level);
    if (index === null) throw new GirlLevelAwardError("invalid_level");

    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      if (!player.girls.some((girl) => girl.girlId === girlId)) {
        throw new GirlLevelAwardError("girl_not_owned");
      }
      player.taskValues[
        String(
          makeGirlTaskId(
            GIRL_STATE_TASK_GROUP,
            girlId,
            GIRL_LEVEL_AWARD_OFFSET + index - 1,
          ),
        )
      ] = 1;
    });
    this.#logger.info("player.girl_level_award.claimed", {
      account,
      girlId,
      level,
      index,
    });
    if (!player) {
      throw new Error(`Failed to claim girl level award: ${account}`);
    }
    return structuredClone(player);
  }

  // 关卡通关后（或登录兜底）重估羁绊支线节点解锁：SubCond 类型 1 要求通关
  // 指定章节关卡，通关后才补写 ELevel 任务位。
  async reconcileGirlFetter(
    account: string,
  ): Promise<{ player: Player; unlocks: GirlFetterUnlock[] }> {
    let player: Player | undefined;
    let unlocks: GirlFetterUnlock[] = [];
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      unlocks = reconcileGirlFetterUnlocks(player);
    });
    if (!player) throw new Error(`Failed to reconcile girl fetter: ${account}`);
    if (unlocks.length > 0) {
      this.#logger.info("player.girl_fetter.unlocked", { account, unlocks });
    }
    return { player: structuredClone(player), unlocks };
  }

  async viewGirlStory(
    account: string,
    girlId: number,
    storyType: number,
    storyIndex: number,
  ): Promise<GirlViewStoryResult> {
    if (
      !Number.isSafeInteger(girlId) ||
      girlId <= 0 ||
      !Number.isSafeInteger(storyIndex) ||
      storyIndex <= 0
    ) {
      throw new GirlViewStoryError("invalid_request");
    }
    let player: Player | undefined;
    let awards: BaseAward[] = [];
    let alreadyRead = false;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      if (!player.girls.some((girl) => girl.girlId === girlId)) {
        throw new GirlViewStoryError("girl_not_owned");
      }

      // nType=1：羁绊树节点（ELevel 偏移 300）；nType=3：卡面剧情
      // （ECard 偏移 400），只标记已读不发奖。
      const offset =
        storyType === 1
          ? GIRL_FETTER_EVENT_OFFSET + storyIndex - 1
          : storyType === 3
            ? GIRL_CARD_STORY_EVENT_OFFSET + storyIndex - 1
            : 0;
      if (offset === 0) throw new GirlViewStoryError("invalid_request");
      const key = String(makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, offset));

      if (storyType === 1) {
        const node = defaultGirlFetterCatalog().node(girlId, storyIndex);
        if (!node) throw new GirlViewStoryError("story_not_found");
        const value = player.taskValues[key] ?? 0;
        if (value === 0) throw new GirlViewStoryError("story_locked");
        alreadyRead = value >= 2;
        if (!alreadyRead) {
          awards = node.awards.map((award) => [...award] as BaseAward);
          grantAwards(player, awards, updatedItemGuids, updatedMoneyIds);
        }
      }
      player.taskValues[key] = 2;
      if (storyType === 1) reconcileGirlMainStoryProgress(player, girlId);
    });
    if (!player) throw new Error(`Failed to view girl story: ${account}`);
    const snapshot = structuredClone(player);
    this.#logger.info("player.girl_story.viewed", {
      account,
      girlId,
      storyType,
      storyIndex,
      alreadyRead,
      awards,
    });
    return {
      player: snapshot,
      awards,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      alreadyRead,
    };
  }

  /** Stock LuaCall 256 receipt, sent when an affection main story starts. */
  async setGirlMainStoryProgress(
    account: string,
    girlId: number,
    ordinal: number,
  ): Promise<Player> {
    if (!Number.isSafeInteger(girlId) || !Number.isSafeInteger(ordinal) || ordinal <= 0)
      throw new GirlViewStoryError("invalid_request");
    return this.#store.update((state) => {
      const player = state.players[account];
      const girl = player?.girls.find((entry) => entry.girlId === girlId);
      if (!player || !girl) throw new GirlViewStoryError("girl_not_owned");
      const stories = defaultGirlFetterCatalog().mainStories(girlId);
      const story = stories[ordinal - 1];
      if (!story) throw new GirlViewStoryError("story_not_found");
      const progress = reconcileGirlMainStoryProgress(player, girlId);
      if (girl.level < story.requiredLevel || ordinal > progress + 1)
        throw new GirlViewStoryError("story_locked");
      const key = String(
        makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_MAIN_STORY_OFFSET),
      );
      player.taskValues[key] = Math.max(progress, ordinal);
      return structuredClone(player);
    });
  }

  async endGirlTraining(
    account: string,
    girlId: number,
    now = Date.now(),
  ): Promise<GirlTrainingEndResult> {
    let player: Player | undefined;
    let position = 0;
    let goldReward = 0;
    let gain: GirlAffectionGain | null | undefined;
    const unlockedSecretIds: number[] = [];
    let fetterUnlocks: GirlFetterUnlock[] = [];
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const girl = player.girls.find((candidate) => candidate.girlId === girlId);
      if (!girl) throw new GirlTrainingError("girl_not_owned");

      const positionKey = String(
        makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_TRAIN_POSITION_OFFSET),
      );
      const endTimeKey = String(
        makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_TRAIN_END_TIME_OFFSET),
      );
      position = player.taskValues[positionKey] ?? 0;
      if (position <= 0) throw new GirlTrainingError("not_training");
      const endTime = player.taskValues[endTimeKey] ?? 0;
      if (endTime > 0 && Math.floor(now / 1_000) < endTime) {
        throw new GirlTrainingError("training_not_finished");
      }
      const config = getGirlTrainingConfig(position);
      if (!config) throw new GirlTrainingError("invalid_position");

      gain = addGirlAffection(girlId, girl.level, girl.exp, config.loveReward);
      if (gain) {
        girl.level = gain.newLevel;
        girl.exp = gain.newExperience;
        unlockedSecretIds.push(
          ...unlockGirlLevelSecrets(player, girlId, gain.oldLevel, gain.newLevel),
        );
      }

      reconcilePromise(player, PromiseCatalog.loadDefault(), now);
      promiseIncrement(
        player,
        "Training",
        girlId,
        1,
        (task) => (task.traintype ?? -1) < 0 || task.traintype === config.type,
      );
      goldReward = config.crystalReward;
      let gold = player.money.find(({ id }) => id === MONEY_GOLD);
      if (!gold) {
        gold = { id: MONEY_GOLD, count: 0 };
        player.money.push(gold);
      }
      gold.count += goldReward;

      player.taskValues[positionKey] = 0;
      player.taskValues[endTimeKey] = 0;
      player.taskValues[
        String(
          makeGirlTaskId(GIRL_STATE_TASK_GROUP, girlId, GIRL_TRAIN_OUTDOOR_ID_OFFSET),
        )
      ] = 0;
      fetterUnlocks = reconcileGirlFetterUnlocks(player, girlId);
    });
    if (!player || gain === undefined) {
      throw new Error(`Failed to end girl training: ${account}`);
    }
    this.#logger.info("player.girl_training.ended", {
      account,
      girlId,
      position,
      gold: goldReward,
      addedExperience: gain?.addedExperience ?? 0,
      oldLevel: gain?.oldLevel,
      newLevel: gain?.newLevel,
      unlockedSecretIds,
    });
    const snapshot = structuredClone(player);
    const girl = snapshot.girls.find((candidate) => candidate.girlId === girlId);
    if (!girl) throw new Error(`Trained girl disappeared: ${account}`);
    return {
      player: snapshot,
      girl,
      girlId,
      position,
      gold: goldReward,
      updatedMoney: snapshot.money.filter(({ id }) => id === MONEY_GOLD),
      addedExperience: gain?.addedExperience ?? 0,
      oldExperience: gain?.oldExperience ?? girl.exp,
      newExperience: gain?.newExperience ?? girl.exp,
      oldLevel: gain?.oldLevel ?? girl.level,
      newLevel: gain?.newLevel ?? girl.level,
      unlockedSecretIds,
      fetterUnlocks,
    };
  }

  async setTaskValues(
    account: string,
    changes: readonly TaskChange[],
  ): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      for (const { id, value } of changes) {
        if (
          isDailyMissionTaskValueId(id) ||
          isGirlMainStoryTaskId(id) ||
          isRotationSelectionTaskId(id) ||
          isHeadpatTaskId(id) ||
          isEnergyActivityTaskId(id) ||
          isCafePetTaskId(id, CafePetCatalog.loadDefault()) ||
          (id >>> 16 === 60 && (id & 0xffff) >= 101 && (id & 0xffff) <= 104)
        )
          continue;
        player.taskValues[String(id)] = value;
      }
    });
    this.#logger.info("player.tasks.updated", { account, changes });
    if (!player) throw new Error(`Failed to update player tasks: ${account}`);
    return structuredClone(player);
  }

  async recordDailyMissionProgress(
    account: string,
    missionId: number,
    amount = 1,
    now = Date.now(),
  ): Promise<Player> {
    if (!dailyMission(missionId)) {
      throw new DailyMissionError("unknown_mission");
    }

    let player: Player | undefined;
    let changed = false;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      changed = incrementDailyMissionProgress(player, missionId, amount, now);
    });
    if (!player) {
      throw new Error(`Failed to record daily mission progress: ${account}`);
    }
    if (changed) {
      this.#logger.info("player.daily_mission.progressed", {
        account,
        missionId,
        amount,
        progress: dailyMissionProgress(
          player.taskValues[String(makeDailyMissionTaskId(missionId))] ?? 0,
        ),
      });
    }
    return structuredClone(player);
  }

  async claimDailyMissionAwards(
    account: string,
    missionId: number,
    claimAll = false,
    now = Date.now(),
  ): Promise<DailyMissionClaimResult> {
    if (!claimAll && !dailyMission(missionId)) {
      throw new DailyMissionError("unknown_mission");
    }

    let player: Player | undefined;
    const claimedMissionIds: number[] = [];
    const claimedActiveAwardIds: number[] = [];
    const activeAwardItems: BaseAward[] = [];
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileDailyMissions(player, now);

      const missions = claimAll ? DAILY_MISSIONS : [dailyMission(missionId)!];
      const activePointTaskId = String(
        makeDailyMissionTaskId(DAILY_MISSION_ACTIVE_POINT_TASK_ID),
      );
      let activePoints = dailyMissionActivePoints(player);
      for (const mission of missions) {
        const taskId = String(makeDailyMissionTaskId(mission.id));
        const taskValue = player.taskValues[taskId] ?? 0;
        if (hasClaimedDailyMission(taskValue)) {
          if (!claimAll) throw new DailyMissionError("already_claimed");
          continue;
        }
        if (dailyMissionProgress(taskValue) < mission.target) {
          if (!claimAll) throw new DailyMissionError("not_completed");
          continue;
        }

        player.taskValues[taskId] = makeDailyMissionTaskValue(
          dailyMissionProgress(taskValue),
          true,
        );
        activePoints = Math.min(
          DAILY_MISSION_ACTIVE_POINT_MAX,
          activePoints + mission.activePoints,
        );
        player.taskValues[activePointTaskId] = activePoints;
        claimedMissionIds.push(mission.id);
      }

      if (claimAll) {
        for (const award of claimableDailyMissionActiveAwards(player)) {
          markDailyMissionActiveAwardClaimed(player, award.id);
          claimedActiveAwardIds.push(award.id);
          activeAwardItems.push(...activeAwardsWithoutBattlePass(award.awards));
        }
        if (activeAwardItems.length > 0) {
          grantAwards(player, activeAwardItems, updatedItemGuids, updatedMoneyIds);
        }
      }

      if (claimedMissionIds.length === 0 && claimedActiveAwardIds.length === 0) {
        throw new DailyMissionError("nothing_to_claim");
      }

      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
    });
    if (!player) throw new Error(`Failed to claim daily missions: ${account}`);

    const snapshot = structuredClone(player);
    this.#logger.info("player.daily_mission.claimed", {
      account,
      claimedMissionIds,
      claimedActiveAwardIds,
      activeAwardItems,
    });
    return {
      player: snapshot,
      claimedMissionIds,
      claimedActiveAwardIds,
      activeAwardItems,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
    };
  }

  async claimDailyMissionActiveAward(
    account: string,
    awardId: number,
    now = Date.now(),
  ): Promise<DailyMissionClaimResult> {
    const award = dailyMissionActiveAward(awardId);
    if (!award) throw new DailyMissionError("unknown_active_award");

    let player: Player | undefined;
    const activeAwardItems = activeAwardsWithoutBattlePass(award.awards);
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileDailyMissions(player, now);
      if (hasClaimedDailyMissionActiveAward(player, award.id)) {
        throw new DailyMissionError("already_claimed");
      }
      if (dailyMissionActivePoints(player) < award.requiredPoints) {
        throw new DailyMissionError("insufficient_active_points");
      }

      markDailyMissionActiveAwardClaimed(player, award.id);
      grantAwards(player, activeAwardItems, updatedItemGuids, updatedMoneyIds);
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
    });
    if (!player) {
      throw new Error(`Failed to claim daily mission active award: ${account}`);
    }

    const snapshot = structuredClone(player);
    this.#logger.info("player.daily_mission.active_award_claimed", {
      account,
      awardId,
      activeAwardItems,
    });
    return {
      player: snapshot,
      claimedMissionIds: [],
      claimedActiveAwardIds: [award.id],
      activeAwardItems,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
    };
  }

  async signUpDaily(account: string, now = Date.now()): Promise<DailySignUpResult> {
    let player: Player | undefined;
    const awards: BaseAward[] = [];
    let fresh = false;
    let cumulativeCount = 0;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileDailySignUp(player, now);

      const operationalDate = dailySignUpOperationalDate(now);
      const todayTaskId = String(makeDailySignUpTaskId(DAILY_SIGN_UP_TODAY_TASK));
      const totalTaskId = String(makeDailySignUpTaskId(DAILY_SIGN_UP_TOTAL_TASK));
      const monthDiamondTaskId = String(
        makeDailySignUpTaskId(DAILY_SIGN_UP_MONTH_DIAMOND_TASK),
      );
      const monthEnergyTaskId = String(
        makeDailySignUpTaskId(DAILY_SIGN_UP_MONTH_ENERGY_TASK),
      );
      cumulativeCount = Math.max(0, player.taskValues[totalTaskId] ?? 0);
      const alreadySigned =
        player.dailySignUp.lastOperationalDate === operationalDate ||
        player.taskValues[todayTaskId] === 1;

      if (!alreadySigned) {
        const award = dailySignUpReward(cumulativeCount, operationalDate);
        if (award) {
          awards.push(award);
          grantAwards(player, [award], updatedItemGuids, updatedMoneyIds);
          cumulativeCount += 1;
          player.taskValues[todayTaskId] = 1;
          player.taskValues[totalTaskId] = cumulativeCount;
          player.dailySignUp = {
            cycle: operationalDate.slice(0, 7),
            lastOperationalDate: operationalDate,
          };
          const girlReconciliation = reconcileGirlAppearanceState(
            player,
            updatedItemGuids,
          );
          for (const girlId of girlReconciliation.updatedGirlIds) {
            updatedGirlIds.add(girlId);
          }
          fresh = true;
        }
      }

      // 月卡持有者的每日钻石/体力签到（UI_SignActivity 读组20的11004/11005）。
      // 即使当天普通签到已完成也要补签月卡部分（先签到后购卡的边缘情况），
      // 否则客户端签到按钮常亮、登录弹窗反复出现。
      const nowSeconds = Math.floor(now / 1000);
      const monthCardEnd = player.taskValues[String(makeMonthCardTaskId())] ?? 0;
      if (monthCardEnd >= nowSeconds) {
        if ((player.taskValues[monthDiamondTaskId] ?? 0) === 0) {
          player.taskValues[monthDiamondTaskId] = 1;
          awards.push(MONTH_CARD_DAILY_DIAMOND_AWARD);
          grantAwards(
            player,
            [MONTH_CARD_DAILY_DIAMOND_AWARD],
            updatedItemGuids,
            updatedMoneyIds,
          );
        }
        if ((player.taskValues[monthEnergyTaskId] ?? 0) === 0) {
          player.taskValues[monthEnergyTaskId] = 1;
          awards.push(MONTH_CARD_DAILY_ENERGY_AWARD);
          grantAwards(
            player,
            [MONTH_CARD_DAILY_ENERGY_AWARD],
            updatedItemGuids,
            updatedMoneyIds,
          );
        }
      }
    });
    if (!player) throw new Error(`Failed to sign in player: ${account}`);
    const snapshot = structuredClone(player);
    this.#logger.info("player.daily_sign_up", {
      account,
      operationalDate: dailySignUpOperationalDate(now),
      cumulativeCount,
      fresh,
      awards,
    });
    return {
      player: snapshot,
      awards,
      fresh,
      cumulativeCount,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
    };
  }

  /** UI_EnergyGet sends only nActivityId=8; the server chooses the live window. */
  async claimEnergyActivity(
    account: string,
    now = Date.now(),
  ): Promise<
    PromiseOperationResult & {
      energy: number;
      claimed: boolean;
      reason?: string;
    }
  > {
    if (!Number.isSafeInteger(now) || now < 0)
      throw new Error("Invalid energy activity clock");
    let result:
      | (PromiseOperationResult & { energy: number; claimed: boolean; reason?: string })
      | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error("Unknown energy activity player");
      reconcileEnergyActivity(player, now);
      const window = currentEnergyWindow(now);
      const task = window ? String(energyActivityTaskId(window.id)) : "";
      const reason =
        player.energyActivity!.operationalDate > dailySignUpOperationalDate(now)
          ? "clock_reversed"
          : !window
            ? "not_open"
            : (player.taskValues[task] ?? 0) > 0
              ? "already_claimed"
              : undefined;
      const items = new Set<number>(),
        money = new Set<number>();
      if (!reason && window) {
        grantAwards(player, [[15, 4, 1, 1, window.energy]], items, money);
        player.taskValues[task] = 1;
      }
      result = {
        ...promiseResult(player, undefined, items, money),
        claimed: !reason,
        energy: reason ? 0 : window!.energy,
        ...(reason ? { reason } : {}),
      };
    });
    return result!;
  }

  async claimEightDaySignUpAward(
    account: string,
    achievementId: number,
  ): Promise<EightDaySignUpAwardResult> {
    const reward = eightDaySignUpReward(achievementId);
    if (!reward) throw new EightDaySignUpError("unknown_achievement");

    let player: Player | undefined;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileEightDaySignUp(player);

      const taskId = String(makeEightDaySignUpTaskId(achievementId));
      const taskValue = player.taskValues[taskId] ?? 0;
      if (hasClaimedEightDaySignUpReward(taskValue)) {
        throw new EightDaySignUpError("already_claimed");
      }
      if (eightDaySignUpProgress(taskValue) < reward.requiredDays) {
        throw new EightDaySignUpError("not_completed");
      }

      player.taskValues[taskId] = makeEightDaySignUpTaskValue(
        eightDaySignUpProgress(taskValue),
        true,
      );
      grantAwards(player, reward.awards, updatedItemGuids, updatedMoneyIds);
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
    });
    if (!player) {
      throw new Error(`Failed to claim eight-day sign-up award: ${account}`);
    }
    const snapshot = structuredClone(player);
    this.#logger.info("player.eight_day_sign_up.claimed", {
      account,
      achievementId,
      awards: reward.awards,
    });
    return {
      player: snapshot,
      achievementId,
      awards: reward.awards,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
    };
  }

  /**
   * Claims an event page achievement (NormalActivityGetAward nType 1). The
   * achievement must be listed by that activity in a NormalActivity table.
   */
  async claimActivityAchievementAward(
    account: string,
    activityId: number,
    achievementId: number,
  ): Promise<AchievementAwardResult> {
    const catalog = ActivityAchievementCatalog.loadDefault();
    if (!catalog.hasActivityAchievement(activityId, achievementId)) {
      throw new AchievementAwardError("not_in_activity");
    }
    return this.#claimAchievementAward(
      account,
      ACTIVITY_ACHIEVEMENT_TASK_GROUP,
      achievementId,
    );
  }

  /** Claims an achievement of the achievement panel (AchievementGetAward). */
  async claimAchievementAward(
    account: string,
    achievementId: number,
  ): Promise<AchievementAwardResult> {
    return this.#claimAchievementAward(account, ACHIEVEMENT_TASK_GROUP, achievementId);
  }

  /**
   * GetConverAchieveAward: a claim of Mission/AchievementOther by id from the
   * Railgun mission screen (and the cafe talk phone). The linkage missions are
   * brought up to date first (named tower counters).
   */
  async claimOtherAchievementAward(
    account: string,
    achievementId: number,
  ): Promise<AchievementAwardResult> {
    const catalog = NamedTowerCatalog.tryLoadDefault();
    if (catalog)
      await this.#store.update((state) => {
        const player = state.players[account];
        if (player) refreshLinkageMissions(player, catalog);
      });
    return this.#claimAchievementAward(
      account,
      ACTIVITY_ACHIEVEMENT_TASK_GROUP,
      achievementId,
    );
  }

  async #claimAchievementAward(
    account: string,
    group: number,
    achievementId: number,
  ): Promise<AchievementAwardResult> {
    const config = ActivityAchievementCatalog.loadDefault().achievement(
      group,
      achievementId,
    );
    if (!config) throw new AchievementAwardError("unknown_achievement");
    const awards = config.awards;
    if (!awards || !awards.every(isGrantableAward)) {
      throw new AchievementAwardError("unsupported_award");
    }
    if (awards.length === 0) throw new AchievementAwardError("no_award");

    let player: Player | undefined;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileEightDaySignUp(player);

      const taskValue = projectAchievementProgress(player, config);
      if (hasClaimedAchievement(taskValue)) {
        throw new AchievementAwardError("already_claimed");
      }
      if (achievementProgress(taskValue) < requiredAchievementCount(config)) {
        throw new AchievementAwardError("not_completed");
      }

      player.taskValues[String(makeAchievementTaskId(group, achievementId))] =
        makeAchievementTaskValue(achievementProgress(taskValue), true);
      grantAwards(player, awards, updatedItemGuids, updatedMoneyIds);
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
    });
    if (!player) {
      throw new Error(`Failed to claim achievement award: ${account}`);
    }
    const snapshot = structuredClone(player);
    this.#logger.info("player.achievement.claimed", {
      account,
      group,
      achievementId,
      awards,
    });
    return {
      player: snapshot,
      group,
      achievementId,
      awards,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
    };
  }

  async claimGuideMissionAward(
    account: string,
    missionId: number,
  ): Promise<GuideAwardResult> {
    const mission = guideMission(missionId);
    if (!mission) throw new GuideMissionError("unknown_mission");

    let player: Player | undefined;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      this.#activities.reconcile(player);

      const taskId = String(makeGuideTaskId(mission.id));
      const taskValue = player.taskValues[taskId] ?? 0;
      if (hasClaimedGuideMission(taskValue)) {
        throw new GuideMissionError("already_claimed");
      }
      if (guideMissionProgress(taskValue) < mission.target) {
        throw new GuideMissionError("not_completed");
      }
      if (mission.prerequisiteId > 0) {
        const prerequisiteValue =
          player.taskValues[String(makeGuideTaskId(mission.prerequisiteId))] ?? 0;
        if (!hasClaimedGuideMission(prerequisiteValue)) {
          throw new GuideMissionError("prerequisite_not_claimed");
        }
      }

      player.taskValues[taskId] = makeGuideMissionTaskValue(
        guideMissionProgress(taskValue),
        true,
      );
      grantAwards(player, mission.awards, updatedItemGuids, updatedMoneyIds);
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
    });
    if (!player) {
      throw new Error(`Failed to claim guide mission award: ${account}`);
    }
    const snapshot = structuredClone(player);
    this.#logger.info("player.guide_mission.claimed", {
      account,
      missionId,
      awards: mission.awards,
    });
    return {
      player: snapshot,
      id: missionId,
      awards: mission.awards,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
    };
  }

  async claimGuideProgressAward(
    account: string,
    awardId: number,
  ): Promise<GuideAwardResult> {
    const award = guideProgressAward(awardId);
    if (!award) throw new GuideMissionError("unknown_progress_award");

    let player: Player | undefined;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      this.#activities.reconcile(player);

      if (hasClaimedGuideProgressAward(player, awardId)) {
        throw new GuideMissionError("already_claimed");
      }
      if (completedGuideMissionCount(player) < award.requiredCompleted) {
        throw new GuideMissionError("not_completed");
      }

      markGuideProgressAwardClaimed(player, awardId);
      grantAwards(player, award.awards, updatedItemGuids, updatedMoneyIds);
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
    });
    if (!player) {
      throw new Error(`Failed to claim guide progress award: ${account}`);
    }
    const snapshot = structuredClone(player);
    this.#logger.info("player.guide_progress.claimed", {
      account,
      awardId,
      awards: award.awards,
    });
    return {
      player: snapshot,
      id: awardId,
      awards: award.awards,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
    };
  }

  async savePendingGacha(
    account: string,
    poolId: number,
    ten: boolean,
    roll: GachaRollResult,
  ): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      player.gacha.pending = {
        poolId,
        ten,
        awards: structuredClone(roll.awards),
        pity: roll.counters.pity,
        upPity: roll.counters.upPity,
        total: roll.counters.total,
      };
    });
    if (!player) throw new Error(`Failed to save pending gacha: ${account}`);
    return structuredClone(player);
  }

  async claimIBShopFreePack(
    account: string,
    now = Date.now(),
  ): Promise<IBShopFreePackResult> {
    let player: Player | undefined;
    let item: InventoryEntryState | undefined;
    let purchaseCount = 0;
    const updatedItemGuids = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const operationalDate = bountyOperationalDate(now);
      const taskId = String(makeIBShopTaskId(FREE_GIFT_PACK_ID));
      if (player.ibShop?.operationalDate !== operationalDate) {
        player.ibShop = { operationalDate };
        player.taskValues[taskId] = 0;
      }
      purchaseCount = player.taskValues[taskId] ?? 0;
      if (purchaseCount >= FREE_GIFT_PACK_DAILY_LIMIT) {
        throw new IBShopError("limit_reached");
      }
      purchaseCount += 1;
      player.taskValues[taskId] = purchaseCount;
      addInventoryAward(player, FREE_GIFT_PACK_AWARD, updatedItemGuids);
      incrementDailyMissionProgress(player, 108, 1, now);
      item = player.inventory.find(({ guid }) => updatedItemGuids.has(guid));
    });
    if (!player || !item) {
      throw new Error(`Failed to claim IB shop free pack: ${account}`);
    }
    const itemGuid = item.guid;
    const snapshot = structuredClone(player);
    const claimedItem = snapshot.inventory.find(({ guid }) => guid === itemGuid);
    if (!claimedItem) {
      throw new Error(`Failed to claim IB shop free pack: ${account}`);
    }
    this.#logger.info("player.ib_shop.free_pack_claimed", {
      account,
      packId: FREE_GIFT_PACK_ID,
      purchaseCount,
      itemGuid,
    });
    return { player: snapshot, item: claimedItem, purchaseCount };
  }

  async claimIBItemFree(
    account: string,
    itemId: number,
    now = Date.now(),
  ): Promise<IBItemFreeResult> {
    if (itemId !== MONTH_CARD_ITEM_ID) throw new IBShopError("unknown_item");
    let player: Player | undefined;
    let purchaseCount = 0;
    let monthCardEndTime = 0;
    const updatedMoneyIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const taskId = String(makeIBItemTaskId(itemId));
      purchaseCount = (player.taskValues[taskId] ?? 0) + 1;
      player.taskValues[taskId] = purchaseCount;

      let diamond = player.money.find(({ id }) => id === MONEY_DIAMOND);
      if (!diamond) {
        diamond = { id: MONEY_DIAMOND, count: 0 };
        player.money.push(diamond);
      }
      diamond.count += MONTH_CARD_DIAMONDS;
      updatedMoneyIds.add(MONEY_DIAMOND);

      const monthTaskId = String(makeMonthCardTaskId());
      const nowSeconds = Math.floor(now / 1000);
      const currentEnd = player.taskValues[monthTaskId] ?? 0;
      const base = Math.max(nowSeconds, currentEnd);
      monthCardEndTime = Math.min(
        base + MONTH_CARD_DAYS * 86_400,
        nowSeconds + MONTH_CARD_LIMIT_DAYS * 86_400,
      );
      player.taskValues[monthTaskId] = monthCardEndTime;
      incrementDailyMissionProgress(player, 108, 1, now);
    });
    if (!player) throw new Error(`Failed to claim IB item: ${account}`);
    const snapshot = structuredClone(player);
    this.#logger.info("player.ib_item.free_claimed", {
      account,
      itemId,
      purchaseCount,
      diamonds: MONTH_CARD_DIAMONDS,
      monthCardEndTime,
    });
    return {
      player: snapshot,
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      purchaseCount,
      monthCardEndTime,
      diamonds: MONTH_CARD_DIAMONDS,
    };
  }

  async getShopGoodsList(
    account: string,
    catalog: ShopCatalog,
    shopId: number,
    now = Date.now(),
  ): Promise<ShopGoodsListResult> {
    let result: ShopGoodsListResult | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      result = buildShopGoodsList(player, catalog, shopId, now);
    });
    if (!result) throw new Error(`Failed to build shop goods list: ${shopId}`);
    return result;
  }

  async refreshShop(
    account: string,
    catalog: ShopCatalog,
    shopId: number,
    now = Date.now(),
  ): Promise<{ result: ShopGoodsListResult; updatedMoney: MoneyState[] }> {
    const tab = catalog.getTab(shopId);
    if (!tab) throw new ShopError("unknown_shop");
    let player: Player | undefined;
    let result: ShopGoodsListResult | undefined;
    const updatedMoneyIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const nowSeconds = Math.floor(now / 1_000);
      if (!isShopOpen(tab, nowSeconds)) throw new ShopError("shop_closed");
      const shopState = reconcileShopState(player, catalog, tab, now);
      if (shopState.refreshCount >= tab.refreshLimits) {
        throw new ShopError("limit_reached");
      }
      const fee = refreshFee(tab, shopState.refreshCount);
      if (fee > 0) {
        deductShopMoney(player, tab.refreshMoneyType, fee, updatedMoneyIds);
      }
      shopState.refreshCount += 1;
      rerollShelf(catalog, tab, shopState, now, true);
      result = buildShopGoodsList(player, catalog, shopId, now);
    });
    if (!player || !result) {
      throw new Error(`Failed to refresh shop: ${shopId}`);
    }
    const snapshot = structuredClone(player);
    this.#logger.info("player.shop.refreshed", {
      account,
      shopId,
      refreshCount: result.refreshCount,
    });
    return {
      result,
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
    };
  }

  async buyShopGoods(
    account: string,
    catalog: ShopCatalog,
    shopId: number,
    goodsId: number,
    buyNum: number,
    now = Date.now(),
  ): Promise<{
    result: ShopGoodsListResult;
    updatedItems: InventoryEntryState[];
    updatedMoney: MoneyState[];
    updatedFurniture: CafeFurnitureState[];
    price: number;
    taskValuesChanged: boolean;
  }> {
    const tab = catalog.getTab(shopId);
    if (!tab) throw new ShopError("unknown_shop");
    const config = catalog.getGoods(goodsId);
    if (!config || config.shopId !== shopId) throw new ShopError("unknown_goods");
    if (!Number.isInteger(buyNum) || buyNum <= 0 || buyNum > 99) {
      throw new ShopError("invalid_amount");
    }
    let player: Player | undefined;
    let result: ShopGoodsListResult | undefined;
    let price = 0;
    let taskValuesChanged = false;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedFurniture: CafeFurnitureState[] = [];
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const nowSeconds = Math.floor(now / 1_000);
      if (!isShopOpen(tab, nowSeconds)) throw new ShopError("shop_closed");
      if (!isGoodsInWindow(config, nowSeconds)) throw new ShopError("unknown_goods");
      const shopState = reconcileShopState(player, catalog, tab, now);
      const shelfEntry = shopState.shelf.find((entry) => entry.goodsId === goodsId);
      if (tab.refreshRule === 1 && !shelfEntry) {
        throw new ShopError("not_on_shelf");
      }
      const counters = shopState.counters[String(goodsId)] ?? {
        daily: 0,
        week: 0,
        total: 0,
        shelf: 0,
      };
      shopState.counters[String(goodsId)] = counters;
      const shelfBought = shelfEntry?.bought ?? counters.shelf;
      if (config.refreshLimitNum !== null) {
        if (!shelfEntry) throw new ShopError("not_on_shelf");
        if (shelfEntry.bought + buyNum > config.refreshLimitNum) {
          throw new ShopError("limit_reached");
        }
      }
      if (
        config.dailyLimitNum !== null &&
        counters.daily + buyNum > config.dailyLimitNum
      ) {
        throw new ShopError("limit_reached");
      }
      if (
        config.weekLimitNum !== null &&
        counters.week + buyNum > config.weekLimitNum
      ) {
        throw new ShopError("limit_reached");
      }
      if (
        config.totalLimitNum !== null &&
        counters.total + buyNum > config.totalLimitNum
      ) {
        throw new ShopError("limit_reached");
      }
      if (config.shelfLifeLmt !== null && shelfBought + buyNum > config.shelfLifeLmt) {
        throw new ShopError("limit_reached");
      }
      const discount = shelfEntry?.discount ?? config.discountList[0]!.discount;
      const priceIndex = nextPriceIndex(config, {
        shelfBuyNum: config.shelfLifeLmt ? shelfBought : undefined,
        totalBuyNum: config.totalLimitNum ? counters.total : undefined,
        weekBuyNum: config.weekLimitNum ? counters.week : undefined,
        dailyBuyNum: config.dailyLimitNum ? counters.daily : undefined,
        refreshBuyNum: config.refreshLimitNum ? shelfEntry?.bought : undefined,
        buyNum: counters.total,
      });
      price = unitPrice(config, priceIndex, discount) * buyNum;
      if (price > 0) {
        deductShopMoney(player, config.moneyType, price, updatedMoneyIds);
        // The anniversary missions of AchieveType 259 count the tokens spent in the event shops.
        if (EventMissionCatalog.tryLoadDefault()?.spentMoney.has(config.moneyType))
          bumpMission(player, MISSION_COUNTER.spent(config.moneyType), price);
      }
      grantAwards(
        player,
        [
          [
            config.genre,
            config.detail,
            config.particular,
            config.templateLevel,
            config.goodsNum * buyNum,
          ],
        ],
        updatedItemGuids,
        updatedMoneyIds,
      );
      if (config.genre === 11) {
        const cafeCatalog = CafeCatalog.loadDefault();
        const matches = cafeCatalog
          .furnitureItems()
          .filter(
            (item) =>
              item.ItemInfo.join("-") ===
              [
                config.genre,
                config.detail,
                config.particular,
                config.templateLevel,
              ].join("-"),
          );
        if (matches.length !== 1) throw new ShopError("unknown_goods");
        try {
          updatedFurniture.push(
            ...materializeOwnedCafeFurniture(
              player,
              Array.from({ length: config.goodsNum * buyNum }, () => matches[0]!.Id),
              cafeCatalog,
              {
                consumeItem: (gdpl, count) =>
                  promiseConsume(player!, gdpl, count, updatedItemGuids),
              },
            ),
          );
        } catch (error) {
          if (!(error instanceof CafeOperationError)) throw error;
          throw new ShopError("limit_reached");
        }
      }
      counters.daily += buyNum;
      counters.week += buyNum;
      counters.total += buyNum;
      counters.shelf += buyNum;
      if (shelfEntry) shelfEntry.bought += buyNum;
      taskValuesChanged = incrementDailyMissionProgress(player, 108, 1, now);
      result = buildShopGoodsList(player, catalog, shopId, now);
    });
    if (!player || !result) {
      throw new Error(`Failed to buy goods ${goodsId} in shop ${shopId}`);
    }
    const snapshot = structuredClone(player);
    this.#logger.info("player.shop.goods_bought", {
      account,
      shopId,
      goodsId,
      buyNum,
      price,
      taskValuesChanged,
    });
    return {
      result,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedFurniture: structuredClone(updatedFurniture),
      price,
      taskValuesChanged,
    };
  }

  async openRotationSelector(
    account: string,
    gdpln: unknown,
    selection: unknown,
  ): Promise<RotationSelectorOpenResult> {
    const { definition, count, choice } = rotationSelectorCatalog().request(
      gdpln,
      selection,
    );
    const updated = new Set<number>();
    let awards: (number | boolean)[][] = [];
    const girlIds = new Set<number>();
    const player = await this.#store.update((state) => {
      const player = state.players[account];
      if (!player || promiseItemCount(player, definition.itemGdpl) < count)
        throw new RotationSelectorError("not_owned");
      const existing = player.inventory.filter(
        (item) => item.genre === choice[0] && item.count > 0,
      );
      const hasGirl = player.girls.some(({ girlId }) => girlId === choice[1]);
      const hasSuit = existing.some(
        (item) => item.detail === choice[1] && item.particular === choice[2],
      );
      const hasCard = existing.some(
        (item) =>
          item.detail === choice[1] &&
          item.particular === choice[2] &&
          item.templateLevel === choice[3],
      );
      promiseConsume(player, definition.itemGdpl, count, updated);
      const award: Gdpln = [
        choice[0],
        choice[1],
        choice[2],
        choice[3],
        choice[4] * count,
      ];
      addInventoryAward(player, award, updated);
      const reconciled = reconcileGirlAppearanceState(player, updated);
      for (const id of reconciled.updatedGirlIds) girlIds.add(id);
      awards = [choice[0] === 1 ? [...award, hasGirl, hasSuit, hasCard] : [...award]];
      return player;
    });
    const snapshot = structuredClone(player);
    return {
      player: snapshot,
      awards,
      updatedItems: snapshot.inventory.filter(({ guid }) => updated.has(guid)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => girlIds.has(girlId)),
    };
  }

  async performGacha(
    account: string,
    pool: GachaPool,
    ten: boolean,
    resolveRoll: GachaRollResult | ((player: Player) => GachaRollResult),
    fromPending = false,
    kind: "card" | "weapon" = "card",
  ): Promise<GachaCommitResult> {
    let player: Player | undefined;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    let getItem: Gdpln | null = null;
    const roll = await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      deductGachaCost(player, pool, ten, updatedItemGuids, updatedMoneyIds);
      const roll =
        typeof resolveRoll === "function" ? resolveRoll(player) : resolveRoll;

      const pityTask = kind === "weapon" ? 1002 + pool.id : 2 + pool.id;
      player.taskValues[String(makeGachaTaskId(pityTask))] = roll.counters.pity;
      if (kind === "card" && pool.protectUpNum > 0) {
        player.taskValues[String(makeGachaTaskId(2001 + pool.id))] =
          roll.counters.upPity;
      }
      if (kind === "card") {
        player.taskValues[String(makeGachaTaskId(3001 + pool.id))] =
          roll.counters.total;
      }
      if (kind === "card" && pool.rotateVersion > 0) {
        player.taskValues[String(makeGachaTaskId(10_005))] = pool.rotateVersion;
      }
      const totalTask = kind === "weapon" ? 1001 : 1;
      player.taskValues[String(makeGachaTaskId(totalTask))] =
        (player.taskValues[String(makeGachaTaskId(totalTask))] ?? 0) +
        roll.awards.length;
      const operationTask =
        kind === "weapon" ? (ten ? 10_004 : 10_003) : ten ? 10_002 : 10_001;
      player.taskValues[String(makeGachaTaskId(operationTask))] =
        (player.taskValues[String(makeGachaTaskId(operationTask))] ?? 0) + 1;

      for (const award of roll.awards) {
        addInventoryAward(player, [...award.tbGDPL, 1], updatedItemGuids);
      }

      // Only new qualifying rotation draws advance these independent counters.
      // Progress survives lineup changes and never consults historical totals.
      if (pool.selectionMilestone) {
        const milestone = pool.selectionMilestone;
        const task = String(makeGachaTaskId(milestone.progressTask));
        const before = player.taskValues[task] ?? 0;
        const after = before + roll.awards.length;
        if (!Number.isSafeInteger(before) || before < 0 || !Number.isSafeInteger(after))
          throw new RotationSelectorError("invalid_request");
        const count =
          Math.floor(after / milestone.every) - Math.floor(before / milestone.every);
        player.taskValues[task] = after;
        if (count > 0)
          addInventoryAward(
            player,
            [...milestone.item.slice(0, 4), milestone.item[4] * count] as Gdpln,
            updatedItemGuids,
          );
      }

      if (pool.getItem) {
        getItem = [...pool.getItem] as Gdpln;
        getItem[4] *= roll.awards.length;
        addInventoryAward(player, getItem, updatedItemGuids);
      }

      const wonUpBox =
        pool.upBox &&
        pool.upBoxNum > 0 &&
        roll.awards.some(
          ({ nTotalTimes }) =>
            nTotalTimes === pool.upBoxNum ||
            (pool.rotateVersion > 0 && nTotalTimes % pool.upBoxNum === 0),
        );
      if (wonUpBox && pool.upBox) {
        addInventoryAward(player, pool.upBox, updatedItemGuids);
      }
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
      if (fromPending) player.gacha.pending = null;
      return roll;
    });
    if (!player) throw new Error(`Failed to perform gacha: ${account}`);
    const snapshot = structuredClone(player);
    this.#logger.info("player.gacha.completed", {
      account,
      poolId: pool.id,
      kind,
      ten,
      awards: roll.awards.map(({ nId, tbGDPL, isUp }) => ({
        nId,
        tbGDPL,
        isUp,
      })),
      counters: roll.counters,
      fromPending,
    });
    return {
      player: snapshot,
      awards: structuredClone(roll.awards),
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
      getItem,
    };
  }

  async setGachaCustomUp(
    account: string,
    poolId: number,
    itemIds: readonly number[],
  ): Promise<Player> {
    const low = itemIds[0] ?? 0;
    const high = itemIds[1] ?? 0;
    const packed = (low & 0xffff) | ((high & 0xffff) << 16);
    return this.setTaskValues(account, [
      { id: makeGachaTaskId(6001 + poolId), value: packed >>> 0 },
      {
        id: makeGachaTaskId(7001 + poolId),
        value:
          (this.get(account)?.taskValues[String(makeGachaTaskId(7001 + poolId))] ?? 0) +
          1,
      },
    ]);
  }

  async setWeaponGachaCustomUp(
    account: string,
    poolId: number,
    itemIds: readonly number[],
  ): Promise<Player> {
    const low = itemIds[0] ?? 0;
    const high = itemIds[1] ?? 0;
    const packed = (low & 0xffff) | ((high & 0xffff) << 16);
    return this.setTaskValues(account, [
      { id: makeGachaTaskId(4001 + poolId), value: packed >>> 0 },
      {
        id: makeGachaTaskId(5001 + poolId),
        value:
          (this.get(account)?.taskValues[String(makeGachaTaskId(5001 + poolId))] ?? 0) +
          1,
      },
    ]);
  }

  async makeCoffee(
    account: string,
    coffeeType: number,
    count: number,
  ): Promise<Player> {
    if (!Number.isSafeInteger(coffeeType) || coffeeType <= 0) {
      throw new Error(`Invalid coffee type: ${coffeeType}`);
    }
    if (!Number.isSafeInteger(count) || count <= 0) {
      throw new Error(`Invalid coffee count: ${count}`);
    }

    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const coffee = player.cafe.coffees.find(
        (candidate) => candidate.coffeetype === coffeeType,
      );
      if (coffee) {
        coffee.count += count;
      } else {
        player.cafe.coffees.push({ coffeetype: coffeeType, count });
      }
      incrementDailyMissionProgress(player, 110);
    });
    this.#logger.info("player.cafe.coffee_made", {
      account,
      coffeeType,
      count,
    });
    if (!player) throw new Error(`Failed to make coffee for: ${account}`);
    return structuredClone(player);
  }

  async setItemLock(
    account: string,
    guid: number,
    lockOn: number,
  ): Promise<ItemLockResult> {
    if (!Number.isSafeInteger(guid) || guid <= 0 || (lockOn !== 0 && lockOn !== 1)) {
      throw new Error(`Invalid item lock request: ${guid}/${lockOn}`);
    }

    let player: Player | undefined;
    let item: InventoryItemState | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileInventoryLockState(player);
      item = player.inventory.find(
        (candidate) => candidate.guid === guid && candidate.count > 0,
      );
      if (!item) throw new Error(`Unknown inventory item: ${guid}`);
      item.lockOn = lockOn;
    });
    if (!player || !item) throw new Error(`Failed to update item lock: ${guid}`);

    const snapshot = structuredClone(player);
    const updatedItem = snapshot.inventory.find((candidate) => candidate.guid === guid);
    if (!updatedItem) throw new Error(`Locked item disappeared: ${guid}`);
    this.#logger.info("player.item.lock_updated", { account, guid, lockOn });
    return { player: snapshot, item: updatedItem };
  }

  async decomposeCharacterCards(
    account: string,
    guids: readonly number[],
    rarityOf: (gdpl: Gdpl) => number | null,
  ): Promise<CharacterCardDecompositionResult> {
    if (
      guids.length === 0 ||
      guids.length > MAX_CARD_DECOMPOSITION_COUNT ||
      guids.some((guid) => !Number.isSafeInteger(guid) || guid <= 0) ||
      new Set(guids).size !== guids.length
    ) {
      throw new CharacterCardDecompositionError("invalid_request", guids[0] ?? 0);
    }

    let player: Player | undefined;
    let removedCards: CharacterCardState[] = [];
    let gold = 0;
    let tokenCount = 0;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();

    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileInventoryLockState(player);

      const formationCardGuids = new Set(
        player.formations.flatMap(({ fightCards }) =>
          fightCards.flatMap(({ mainCardGuid, secondaryCardGuids, usedCardGuid }) => [
            mainCardGuid,
            usedCardGuid,
            ...secondaryCardGuids,
          ]),
        ),
      );
      const cards: CharacterCardState[] = [];
      for (const guid of guids) {
        const card = player.inventory.find(
          (candidate) =>
            candidate.guid === guid &&
            candidate.count > 0 &&
            isCharacterCard(candidate),
        );
        if (!card) {
          throw new CharacterCardDecompositionError("card_not_owned", guid);
        }
        if (card.lockOn === 1) {
          throw new CharacterCardDecompositionError("card_locked", guid);
        }
        if (formationCardGuids.has(guid)) {
          throw new CharacterCardDecompositionError("card_in_formation", guid);
        }
        if (card.particular === 17) {
          throw new CharacterCardDecompositionError("oath_card", guid);
        }
        const rarity = rarityOf([
          card.genre,
          card.detail,
          card.particular,
          card.templateLevel,
        ]);
        const reward =
          rarity === null
            ? null
            : characterCardDecompositionReward(card.enhanceLevel, rarity);
        if (!reward) {
          throw new CharacterCardDecompositionError("unknown_rarity", guid);
        }
        gold += reward.gold;
        tokenCount += reward.tokenCount;
        cards.push(card);
      }

      const removedGuidSet = new Set(guids);
      removedCards = cards.map((card) => ({ ...card, count: 0 }));
      player.inventory = player.inventory.filter(
        ({ guid }) => !removedGuidSet.has(guid),
      );
      for (const girl of reconcileCustomGirlOutfits(player)) {
        updatedGirlIds.add(girl.girlId);
      }

      grantAwards(
        player,
        [
          [15, 1, 1, 1, gold],
          [15, 11, 1, 1, tokenCount],
        ],
        updatedItemGuids,
        updatedMoneyIds,
      );
    });
    if (!player) throw new Error(`Failed to decompose character cards: ${account}`);

    const snapshot = structuredClone(player);
    const itemList: Gdpln[] = tokenCount > 0 ? [[15, 11, 1, 1, tokenCount]] : [];
    this.#logger.info("player.card.decomposed", {
      account,
      guids,
      gold,
      tokenCount,
    });
    return {
      player: snapshot,
      removedCards: structuredClone(removedCards),
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
      itemList,
      gold,
    };
  }

  async decomposeWeapons(
    account: string,
    guids: readonly number[],
    rarityOf: (gdpl: Gdpl) => number | null,
  ): Promise<WeaponDecompositionResult> {
    if (
      guids.length === 0 ||
      guids.length > MAX_WEAPON_DECOMPOSITION_COUNT ||
      guids.some((guid) => !Number.isSafeInteger(guid) || guid <= 0) ||
      new Set(guids).size !== guids.length
    ) {
      throw new WeaponDecompositionError("invalid_request", guids[0] ?? 0);
    }

    let player: Player | undefined;
    let removedWeapons: InventoryItemState[] = [];
    let gold = 0;
    let tokenCount = 0;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();

    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileInventoryLockState(player);

      const equippedWeaponGuids = new Set(
        player.formations.flatMap(({ fightCards }) =>
          fightCards.map(({ weaponGuid }) => weaponGuid),
        ),
      );
      const weapons: InventoryItemState[] = [];
      for (const guid of guids) {
        const weapon = player.inventory.find(
          (candidate) =>
            candidate.guid === guid && candidate.count > 0 && isWeapon(candidate),
        );
        if (!weapon) {
          throw new WeaponDecompositionError("weapon_not_owned", guid);
        }
        if (weapon.lockOn === 1) {
          throw new WeaponDecompositionError("weapon_locked", guid);
        }
        if (equippedWeaponGuids.has(guid)) {
          throw new WeaponDecompositionError("weapon_equipped", guid);
        }
        const rarity = weaponRarityOf(
          [weapon.genre, weapon.detail, weapon.particular, weapon.templateLevel],
          rarityOf,
        );
        const reward =
          rarity === null
            ? null
            : weaponDecompositionReward(weapon.enhanceLevel, rarity);
        if (!reward) {
          throw new WeaponDecompositionError("unknown_rarity", guid);
        }
        gold += reward.gold;
        tokenCount += reward.tokenCount;
        weapons.push(weapon);
      }

      const removedGuidSet = new Set(guids);
      removedWeapons = weapons.map((weapon) => ({ ...weapon, count: 0 }));
      player.inventory = player.inventory.filter(
        ({ guid }) => !removedGuidSet.has(guid),
      );
      grantAwards(
        player,
        [
          [15, 1, 1, 1, gold],
          [15, 20, 1, 1, tokenCount],
        ],
        updatedItemGuids,
        updatedMoneyIds,
      );
    });
    if (!player) throw new Error(`Failed to decompose weapons: ${account}`);

    const snapshot = structuredClone(player);
    const itemList: Gdpln[] = tokenCount > 0 ? [[15, 20, 1, 1, tokenCount]] : [];
    this.#logger.info("player.weapon.decomposed", {
      account,
      guids,
      gold,
      tokenCount,
    });
    return {
      player: snapshot,
      removedWeapons: structuredClone(removedWeapons),
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      itemList,
      gold,
    };
  }

  async enhanceCard(
    account: string,
    guid: number,
    materials: readonly CardEnhancementMaterial[],
  ): Promise<CardEnhancementResult> {
    let player: Player | undefined;
    let enhancedCard: CharacterCardState | undefined;
    let addedExperience = 0;
    let coinCost = 0;
    const consumedItemGuids = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      enhancedCard = player.inventory.find(
        (entry) => entry.guid === guid && isCharacterCard(entry),
      );
      if (!enhancedCard) throw new Error(`Unknown character card: ${guid}`);

      for (const material of materials) {
        if (material.kind !== 1) {
          throw new Error(
            `Unsupported card enhancement material kind: ${material.kind}`,
          );
        }
        const definition = CARD_EXP_MATERIALS.get(material.reference);
        if (!definition) {
          throw new Error(
            `Unknown card experience material index: ${material.reference}`,
          );
        }
        const item = player.inventory.find(
          (candidate) =>
            candidate.genre === definition.genre &&
            candidate.detail === definition.detail &&
            candidate.particular === definition.particular &&
            candidate.templateLevel === definition.templateLevel,
        );
        if (!item || item.count < material.count) {
          throw new Error(
            `Insufficient card experience material: ${material.reference}`,
          );
        }
        item.count -= material.count;
        consumedItemGuids.add(item.guid);
        addedExperience += definition.experience * material.count;
        coinCost += definition.coinCost * material.count;
      }

      const gold = player.money.find(({ id }) => id === MONEY_GOLD);
      const availableGold = gold?.count ?? 0;
      if (availableGold < coinCost) {
        throw new InsufficientGoldError(coinCost, availableGold);
      }
      if (gold) gold.count -= coinCost;

      const enhanced = addCardExperience(
        enhancedCard.enhanceLevel,
        enhancedCard.enhanceExp,
        addedExperience,
      );
      enhancedCard.enhanceLevel = enhanced.level;
      enhancedCard.enhanceExp = enhanced.experience;
      if (reconcileMaximumFightPower(player)) {
        this.#activities.dispatch(player, [
          { type: "fight_power.changed", value: player.fightPower },
        ]);
      }
      incrementDailyMissionProgress(player, 107);
    });
    if (!player || !enhancedCard) {
      throw new Error(`Failed to enhance character card: ${guid}`);
    }

    this.#logger.info("player.card.enhanced", {
      account,
      guid,
      addedExperience,
      coinCost,
      level: enhancedCard.enhanceLevel,
      experience: enhancedCard.enhanceExp,
    });
    const snapshot = structuredClone(player);
    const card = snapshot.inventory.find(
      (candidate) => candidate.guid === guid && isCharacterCard(candidate),
    );
    if (!card) throw new Error(`Enhanced card disappeared: ${guid}`);
    return {
      player: snapshot,
      card,
      consumedItems: snapshot.inventory.filter(({ guid: itemGuid }) =>
        consumedItemGuids.has(itemGuid),
      ),
      addedExperience,
      coinCost,
      updatedMoney: snapshot.money.filter(({ id }) => id === MONEY_GOLD),
    };
  }

  async enhanceWeapon(
    account: string,
    guid: number,
    materials: readonly WeaponEnhancementMaterial[],
    rarityOf: (gdpl: Gdpl) => number | null,
  ): Promise<WeaponEnhancementResult> {
    let player: Player | undefined;
    let enhancedWeapon: InventoryItemState | undefined;
    let addedExperience = 0;
    let coinCost = 0;
    const consumedItemGuids = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      enhancedWeapon = player.inventory.find(
        (entry) => entry.guid === guid && entry.count > 0 && isWeapon(entry),
      );
      if (!enhancedWeapon) throw new Error(`Unknown weapon: ${guid}`);

      const targetRarity = weaponRarityOf(
        [
          enhancedWeapon.genre,
          enhancedWeapon.detail,
          enhancedWeapon.particular,
          enhancedWeapon.templateLevel,
        ],
        rarityOf,
      );
      if (!targetRarity) throw new Error(`Unknown weapon rarity: ${guid}`);
      const maximumLevel = weaponMaximumLevel(targetRarity, enhancedWeapon.breakLevel);
      if (enhancedWeapon.enhanceLevel >= maximumLevel) {
        throw new Error(`Weapon is already at its level cap: ${guid}`);
      }

      const equippedWeapons = new Set(
        player.formations.flatMap(({ fightCards }) =>
          fightCards.map(({ weaponGuid }) => weaponGuid),
        ),
      );
      const evaluatedMaterials: Array<{
        item: InventoryItemState;
        count: number;
        experience: number;
        cost: number;
      }> = [];
      for (const material of materials) {
        const item = player.inventory.find(
          (candidate) => candidate.guid === material.guid,
        );
        if (!item || item.guid === guid || item.count < material.count) {
          throw new Error(`Invalid weapon enhancement material: ${material.guid}`);
        }

        if (isWeapon(item)) {
          if (
            material.count !== 1 ||
            item.lockOn === 1 ||
            equippedWeapons.has(item.guid)
          ) {
            throw new Error(`Weapon cannot be consumed: ${material.guid}`);
          }
          const rarity = weaponRarityOf(
            [item.genre, item.detail, item.particular, item.templateLevel],
            rarityOf,
          );
          const value = rarity
            ? sacrificedWeaponValue(item.enhanceLevel, rarity)
            : null;
          if (!value) throw new Error(`Unknown donor weapon: ${material.guid}`);
          evaluatedMaterials.push({
            item,
            count: 1,
            experience: value.experience,
            cost: value.coinCost,
          });
          addedExperience += value.experience;
          coinCost += value.coinCost;
          continue;
        }

        const definition = weaponExperienceMaterial(item);
        if (!definition) {
          throw new Error(`Unsupported weapon material: ${material.guid}`);
        }
        evaluatedMaterials.push({
          item,
          count: material.count,
          experience: definition.experience * material.count,
          cost: definition.coinCost * material.count,
        });
        addedExperience += definition.experience * material.count;
        coinCost += definition.coinCost * material.count;
      }

      const gold = player.money.find(({ id }) => id === MONEY_GOLD);
      const availableGold = gold?.count ?? 0;
      if (availableGold < coinCost) {
        throw new InsufficientGoldError(coinCost, availableGold);
      }
      for (const material of evaluatedMaterials) {
        material.item.count -= material.count;
        consumedItemGuids.add(material.item.guid);
      }
      if (gold) gold.count -= coinCost;

      const enhanced = addWeaponExperience(
        enhancedWeapon.enhanceLevel,
        enhancedWeapon.enhanceExp,
        addedExperience,
        maximumLevel,
      );
      enhancedWeapon.enhanceLevel = enhanced.level;
      enhancedWeapon.enhanceExp = enhanced.experience;
      const events: DomainEvent[] = [
        {
          type: "weapon.enhanced",
          guid,
          level: enhancedWeapon.enhanceLevel,
        },
      ];
      if (reconcileMaximumFightPower(player)) {
        events.push({ type: "fight_power.changed", value: player.fightPower });
      }
      this.#activities.dispatch(player, events);
      incrementDailyMissionProgress(player, 107);
    });
    if (!player || !enhancedWeapon) {
      throw new Error(`Failed to enhance weapon: ${guid}`);
    }

    this.#logger.info("player.weapon.enhanced", {
      account,
      guid,
      addedExperience,
      coinCost,
      level: enhancedWeapon.enhanceLevel,
      experience: enhancedWeapon.enhanceExp,
    });
    const snapshot = structuredClone(player);
    const weapon = snapshot.inventory.find(
      (candidate) => candidate.guid === guid && isWeapon(candidate),
    );
    if (!weapon) throw new Error(`Enhanced weapon disappeared: ${guid}`);
    return {
      player: snapshot,
      weapon,
      consumedItems: snapshot.inventory.filter(({ guid: itemGuid }) =>
        consumedItemGuids.has(itemGuid),
      ),
      addedExperience,
      coinCost,
      updatedMoney: snapshot.money.filter(({ id }) => id === MONEY_GOLD),
    };
  }

  async breakthroughWeapon(
    account: string,
    guid: number,
    materials: readonly WeaponEnhancementMaterial[],
  ): Promise<Omit<WeaponEnhancementResult, "addedExperience">> {
    if (
      !Number.isSafeInteger(guid) ||
      guid <= 0 ||
      materials.length === 0 ||
      materials.length > 4 ||
      new Set(materials.map((item) => item.guid)).size !== materials.length ||
      materials.some(
        (item) =>
          !Number.isSafeInteger(item.guid) ||
          item.guid <= 0 ||
          !Number.isSafeInteger(item.count) ||
          item.count <= 0,
      )
    )
      throw new WeaponBreakthroughError("invalid_request", guid);
    let result: Omit<WeaponEnhancementResult, "addedExperience"> | undefined;
    await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new WeaponBreakthroughError("unknown_account", guid);
      reconcileInventoryLockState(player);
      const weapon = player.inventory.find(
        (item) => item.guid === guid && item.count > 0 && isWeapon(item),
      );
      if (!weapon) throw new WeaponBreakthroughError("weapon_not_owned", guid);
      const rarity = weaponRarityOf([
        weapon.genre,
        weapon.detail,
        weapon.particular,
        weapon.templateLevel,
      ]);
      const stage =
        rarity === null
          ? null
          : WeaponBreakthroughCatalog.loadDefault().stage(
              rarity,
              weapon.breakLevel + 1,
            );
      if (!stage) throw new WeaponBreakthroughError("maximum_breakthrough", guid);
      if (materials.reduce((sum, item) => sum + item.count, 0) !== stage.materialCount)
        throw new WeaponBreakthroughError("invalid_material_count", guid);
      const equipped = new Set(
        player.formations.flatMap((formation) =>
          formation.fightCards.map((card) => card.weaponGuid),
        ),
      );
      const donors = materials.map((material) => {
        const donor = player.inventory.find((item) => item.guid === material.guid);
        if (
          !donor ||
          donor.guid === guid ||
          donor.count < material.count ||
          !isWeaponBreakthroughMaterial(weapon, donor, rarity!)
        )
          throw new WeaponBreakthroughError("invalid_material", material.guid);
        if (donor.lockOn === 1)
          throw new WeaponBreakthroughError("weapon_locked", material.guid);
        if (equipped.has(donor.guid))
          throw new WeaponBreakthroughError("weapon_equipped", material.guid);
        return { donor, count: material.count };
      });
      const money = player.money.find((entry) => entry.id === stage.currencyId);
      if (!money || money.count < stage.currencyCount)
        throw new WeaponBreakthroughError("insufficient_money", guid);
      for (const { donor, count } of donors) donor.count -= count;
      money.count -= stage.currencyCount;
      weapon.breakLevel = stage.breakLevel;
      if (reconcileMaximumFightPower(player))
        this.#activities.dispatch(player, [
          { type: "fight_power.changed", value: player.fightPower },
        ]);
      const snapshot = structuredClone(player);
      result = {
        player: snapshot,
        weapon: snapshot.inventory.find((item) => item.guid === guid)!,
        consumedItems: snapshot.inventory.filter((item) =>
          materials.some((material) => material.guid === item.guid),
        ),
        coinCost: stage.currencyCount,
        updatedMoney: snapshot.money.filter((entry) => entry.id === stage.currencyId),
      };
    });
    if (!result) throw new WeaponBreakthroughError("not_committed", guid);
    this.#logger.info("player.weapon.breakthrough", {
      account,
      guid,
      breakLevel: result.weapon.breakLevel,
      coinCost: result.coinCost,
    });
    return result;
  }

  async handleRuneRequest(
    account: string,
    command: number,
    parameters: unknown,
    random = Math.random,
  ) {
    const request = parseRuneRequest(command, parameters);
    return this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const changes = mutateRune(player, request, random);
      if (reconcileMaximumFightPower(player))
        this.#activities.dispatch(player, [
          { type: "fight_power.changed", value: player.fightPower },
        ]);
      const snapshot = structuredClone(player);
      return {
        player: snapshot,
        rune: snapshot.inventory.find((item) => item.guid === changes.runeGuid)!,
        updatedItems: snapshot.inventory.filter((item) =>
          changes.itemGuids.has(item.guid),
        ),
        updatedMoney: snapshot.money.filter((entry) => changes.moneyIds.has(entry.id)),
      };
    });
  }

  async updateFormation(account: string, formation: FormationState): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);

      // Consumed equipment remains as count-zero tombstones for item updates;
      // it no longer establishes ownership for a new formation request.
      const activeInventory = player.inventory.filter((item) => item.count > 0);
      const ownedCards = new Set(
        activeInventory.filter(isCharacterCard).map(({ guid }) => guid),
      );
      const ownedInventory = new Set(activeInventory.map(({ guid }) => guid));
      const inventory = new Map(activeInventory.map((item) => [item.guid, item]));
      const runeCatalog = runeTemplateCatalog();
      for (const fightCard of formation.fightCards) {
        fightCard.runeItemGuids = Array.from(
          { length: RUNE_SLOT_COUNT },
          (_, index) => fightCard.runeItemGuids[index] ?? 0,
        );
        const referencedCards = [
          fightCard.mainCardGuid,
          fightCard.usedCardGuid,
          ...fightCard.secondaryCardGuids,
        ].filter((guid) => guid > 0);
        if (referencedCards.some((guid) => !ownedCards.has(guid))) {
          throw new Error(`Formation ${formation.id} references an unknown card`);
        }
        const referencedEquipment = [
          fightCard.weaponGuid,
          ...fightCard.runeItemGuids,
        ].filter((guid) => guid > 0);
        if (referencedEquipment.some((guid) => !ownedInventory.has(guid))) {
          throw new Error(`Formation ${formation.id} references unknown equipment`);
        }
        const weapon = inventory.get(fightCard.weaponGuid);
        if (weapon && weapon.genre !== 2) {
          throw new Error(`Formation ${formation.id} weapon slot is not a weapon`);
        }
        for (let slot = 0; slot < RUNE_SLOT_COUNT; slot += 1) {
          const guid = fightCard.runeItemGuids[slot]!;
          if (guid === 0) continue;
          const rune = inventory.get(guid);
          if (!rune || !runeCatalog.acceptsSlot(rune, slot)) {
            throw new Error(
              `Formation ${formation.id} rune ${guid} is incompatible with slot ${slot}`,
            );
          }
        }
      }

      const index = player.formations.findIndex(({ id }) => id === formation.id);
      if (index >= 0) {
        player.formations[index] = structuredClone(formation);
      } else {
        player.formations.push(structuredClone(formation));
      }
      const events: DomainEvent[] = [
        {
          type: "formation.updated",
          formationId: formation.id,
          hasEquippedWeapon: formation.fightCards.some(
            ({ weaponGuid }) => weaponGuid > 0,
          ),
        },
      ];
      if (reconcileMaximumFightPower(player)) {
        events.push({ type: "fight_power.changed", value: player.fightPower });
      }
      this.#activities.dispatch(player, events);
    });
    this.#logger.info("player.formation.updated", {
      account,
      formationId: formation.id,
    });
    if (!player) throw new Error(`Failed to update player formation: ${account}`);
    return structuredClone(player);
  }

  async updatePhoneMoments(
    account: string,
    topicId: number,
    selectionId: number,
    now = Date.now(),
  ) {
    return this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const definition = applyMomentSelection(player.phone, topicId, selectionId, now);
      if (!definition) throw new MomentSelectionError();

      const girl = player.girls.find(({ girlId }) => girlId === definition.initiator);
      const amount = definition.awards[selectionId - 1] ?? 0;
      const affection =
        girl && amount > 0
          ? addGirlAffection(girl.girlId, girl.level, girl.exp, amount)
          : null;
      if (girl && affection) {
        girl.level = affection.newLevel;
        girl.exp = affection.newExperience;
        unlockGirlLevelSecrets(
          player,
          girl.girlId,
          affection.oldLevel,
          affection.newLevel,
        );
        reconcileGirlFetterUnlocks(player, girl.girlId);
      }
      return {
        player: structuredClone(player),
        initiator: definition.initiator,
        updatedGirl: affection && girl ? structuredClone(girl) : null,
        affection,
      };
    });
  }

  async choosePhoneLetterReply(
    account: string,
    topicId: number,
    selectionId: number,
  ): Promise<{ player: Player; replyId: number | null }> {
    const result = await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const letter = player.phone?.letters.find((entry) => entry.topicId === topicId);
      const definition = getPhoneLetterDefinition(topicId);
      const replyId =
        letter && definition
          ? makePhoneReplyId(definition, selectionId, letter.replyIds)
          : null;
      if (letter && replyId !== null) letter.replyIds.push(replyId);
      return { player, replyId };
    });
    return structuredClone(result);
  }

  async setPhoneLetterTitle(
    account: string,
    initiator: number,
    title: string,
  ): Promise<{ player: Player; title: string } | null> {
    return this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      if (
        initiator === 111 ||
        !player.phone?.letters.some((letter) => letter.initiator === initiator)
      )
        return null;
      const displayTitle =
        title === "ClearLetterTitle" ? "" : title.trim().slice(0, 64);
      const titles = (player.phone.letterTitles ??= {});
      if (displayTitle) titles[String(initiator)] = displayTitle;
      else delete titles[String(initiator)];
      return { player: structuredClone(player), title: displayTitle };
    });
  }

  async claimPhoneLetterAward(
    account: string,
    topicId: number,
  ): Promise<{
    player: Player;
    affection?: GirlAffectionGain;
    girl?: GirlState;
  } | null> {
    const result = await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const letter = player.phone?.letters.find((entry) => entry.topicId === topicId);
      const definition = getPhoneLetterDefinition(topicId);
      if (!letter || !definition || !isPhoneLetterComplete(letter)) return null;
      if (letter.awardClaimed) return { player };

      letter.awardClaimed = true;
      const girl = player.girls.find((entry) => entry.girlId === definition.initiator);
      const exp = phoneLetterAffection(definition, letter.replyIds);
      if (!girl || exp === 0) return { player };
      const affection = addGirlAffection(girl.girlId, girl.level, girl.exp, exp);
      if (!affection) return { player };
      girl.exp = affection.newExperience;
      girl.level = affection.newLevel;
      unlockGirlLevelSecrets(
        player,
        girl.girlId,
        affection.oldLevel,
        affection.newLevel,
      );
      reconcileGirlFetterUnlocks(player, girl.girlId);
      return { player, affection, girl };
    });
    return structuredClone(result);
  }

  async deliverPhoneLetter(
    account: string,
    topicId: number,
  ): Promise<{ player: Player; added: boolean }> {
    const result = await this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      player.phone ??= makeInitialPhoneState();
      return {
        player,
        added: reconcilePhoneLetters(player.phone, [topicId], Date.now()).length !== 0,
      };
    });
    return structuredClone(result);
  }

  async replyToPhoneLetter(
    account: string,
    topicId: number,
    replyId: number,
  ): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const letter = player.phone.letters.find(
        (candidate) => candidate.topicId === topicId,
      );
      if (letter && !letter.replyIds.includes(replyId)) {
        letter.replyIds.push(replyId);
      }
    });
    if (!player) throw new Error(`Failed to reply to phone letter: ${account}`);
    return structuredClone(player);
  }

  async removePhoneLetter(account: string, topicId: number): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const phone = player.phone;
      const letter = phone?.letters.find((entry) => entry.topicId === topicId);
      if (!letter) return;
      (phone.deletedLetterTopicIds ??= []).push(topicId);
      if (isPhoneLetterComplete(letter))
        (phone.completedDeletedLetterTopicIds ??= []).push(topicId);
      phone.letters = phone.letters.filter((entry) => entry !== letter);
      if (!phone.letters.some((entry) => entry.initiator === letter.initiator))
        delete phone.letterTitles?.[String(letter.initiator)];
    });
    if (!player) throw new Error(`Failed to remove phone letter: ${account}`);
    return structuredClone(player);
  }

  async addPhoneLetter(
    account: string,
    letter: Omit<PhoneLetterState, "createTime" | "replyIds">,
  ): Promise<Player> {
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      if (
        !player.phone.letters.some((candidate) => candidate.topicId === letter.topicId)
      ) {
        player.phone.letters.push({
          ...letter,
          createTime: unixTime(),
          replyIds: [],
        });
      }
    });
    if (!player) throw new Error(`Failed to add phone letter: ${account}`);
    return structuredClone(player);
  }

  async claimChapterStarAward(
    account: string,
    chapter: number,
    difficulty: number,
    position: number,
  ): Promise<ChapterStarAwardResult> {
    const reward = chapterStarAward(chapter, difficulty, position);
    if (!reward) throw new ChapterStarAwardError("unknown_award");

    let player: Player | undefined;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileChapterStarTaskValues(player);

      const taskId = String(makeChapterStarTaskId(chapter, difficulty));
      const taskValue = player.taskValues[taskId] ?? 0;
      if (hasClaimedChapterStarAward(taskValue, position)) {
        throw new ChapterStarAwardError("already_claimed");
      }
      if (chapterStarTaskProgress(taskValue) < reward.requiredStars) {
        throw new ChapterStarAwardError("not_completed");
      }

      player.taskValues[taskId] = markChapterStarAwardClaimed(taskValue, position);
      grantAwards(player, reward.awards, updatedItemGuids, updatedMoneyIds);
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
      this.#activities.reconcile(player);
    });
    if (!player) throw new Error(`Failed to claim chapter star award: ${account}`);

    const snapshot = structuredClone(player);
    this.#logger.info("player.chapter_star_award.claimed", {
      account,
      chapter,
      difficulty,
      position,
      awards: reward.awards,
    });
    return {
      player: snapshot,
      awards: reward.awards,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
    };
  }

  async chargeLevelVigour(account: string, energyCost: number): Promise<Player> {
    if (!Number.isSafeInteger(energyCost) || energyCost < 0) {
      throw new Error(`Invalid level energy cost: ${energyCost}`);
    }

    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      const vigour = player.money.find(({ id }) => id === MONEY_VIGOUR);
      const available = vigour?.count ?? 0;
      if (available < energyCost) {
        throw new InsufficientVigourError(energyCost, available);
      }
      if (vigour) {
        vigour.count -= energyCost;
      } else {
        player.money.push({ id: MONEY_VIGOUR, count: -energyCost });
      }
      incrementDailyMissionProgress(player, 109, energyCost);
    });
    this.#logger.info("player.level.vigour_charged", { account, energyCost });
    if (!player) throw new Error(`Failed to charge level vigour: ${account}`);
    return structuredClone(player);
  }

  async settleBounty(
    account: string,
    level: BountyLevelConfig,
    awards: readonly Award[],
    dailyBonusApplied: boolean,
    keyItem: BaseAward | null,
    promiseFight?: PromiseFightEvent,
  ): Promise<BountySettlement> {
    let player: Player | undefined;
    let experienceUpdate: PlayerExperienceUpdate | undefined;
    let energyCost = 0;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);
      reconcileBounty(player);

      energyCost = effectiveBountyEnergyCost(level, player.level);
      let vigour = player.money.find(({ id }) => id === MONEY_VIGOUR);
      const available = vigour?.count ?? 0;
      if (available < energyCost) {
        throw new InsufficientVigourError(energyCost, available);
      }
      if (!vigour) {
        vigour = { id: MONEY_VIGOUR, count: 0 };
        player.money.push(vigour);
      }
      vigour.count -= energyCost;
      updatedMoneyIds.add(MONEY_VIGOUR);

      if (keyItem) {
        const [genre, detail, particular, templateLevel, count] = keyItem;
        const item = player.inventory.find(
          (candidate) =>
            !isInventoryInstance(candidate) &&
            candidate.genre === genre &&
            candidate.detail === detail &&
            candidate.particular === particular &&
            candidate.templateLevel === templateLevel &&
            candidate.count >= count,
        );
        if (!item) throw new BountySettlementError("key_not_owned");
        item.count -= count;
        updatedItemGuids.add(item.guid);
      }

      grantAwards(
        player,
        awards.map(([genre, detail, particular, levelValue, count]) => [
          genre,
          detail,
          particular,
          levelValue,
          count,
        ]),
        updatedItemGuids,
        updatedMoneyIds,
      );
      const passTaskId = String(makeBountyPassTaskId(level.activityId));
      player.taskValues[passTaskId] = Math.max(
        player.taskValues[passTaskId] ?? 0,
        level.difficulty,
      );
      const dailyTaskId = String(makeBountyDailyTaskId(level.eventType));
      if (dailyBonusApplied) {
        player.taskValues[dailyTaskId] = Math.max(
          0,
          (player.taskValues[dailyTaskId] ?? 0) - 1,
        );
      }
      const completionKey = `${level.activityId}:${level.difficulty}`;
      player.bounty!.completionCounts[completionKey] =
        (player.bounty!.completionCounts[completionKey] ?? 0) + 1;
      if (promiseFight)
        promiseFightProgress(
          player,
          promiseFight,
          Date.now(),
          PromiseCatalog.loadDefault(),
        );
      incrementDailyMissionProgress(player, 101);
      incrementDailyMissionProgress(player, 103);
      incrementDailyMissionProgress(player, 109, energyCost);

      experienceUpdate = applyPlayerExperience(player, level.masterExp);
      if (experienceUpdate.vigourRecovery > 0) {
        updatedMoneyIds.add(MONEY_VIGOUR);
      }
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
    });
    if (!player || !experienceUpdate) {
      throw new Error(`Failed to settle bounty: ${account}`);
    }

    this.#logger.info("player.bounty.settled", {
      account,
      activityId: level.activityId,
      difficulty: level.difficulty,
      energyCost,
      dailyBonusApplied,
      awards,
      masterExp: level.masterExp,
    });
    const snapshot = structuredClone(player);
    return {
      player: snapshot,
      energyCost,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
      experienceUpdate,
    };
  }

  /**
   * The past event towers: LuaCall 53-56, 61-63 and 176-178. A refusal leaves
   * the save unchanged and returns the client's error reply.
   */
  async handleEventTowerRequest(
    account: string,
    request: EventTowerRequest,
    options: { random?: (maxExclusive: number) => number } = {},
  ): Promise<EventTowerResult> {
    const catalog = EventTowerCatalog.loadDefault();
    const random = options.random ?? ((max: number) => randomInt(max));
    const readOnly =
      request.command === LUA_COMMAND_TOWER_GET ||
      request.command === LUA_COMMAND_SWIMWEAR_SERVER_SCORE;
    let player: Player | undefined;
    let outcome: TowerOutcome | undefined;
    try {
      if (readOnly) {
        player = this.#store.snapshot().players[account];
        if (!player) throw new Error(`Unknown player account: ${account}`);
        outcome = applyEventTowerRequest(player, request, catalog, random);
      } else {
        await this.#store.update((state) => {
          const draft = state.players[account];
          if (!draft) throw new Error(`Unknown player account: ${account}`);
          outcome = applyEventTowerRequest(draft, request, catalog, random);
          player = draft;
        });
      }
    } catch (error) {
      if (!(error instanceof EventTowerError)) throw error;
      const current = this.#store.snapshot().players[account];
      if (!current) throw new Error(`Unknown player account: ${account}`);
      this.#logger.warn("player.event_tower.rejected", {
        account,
        command: request.command,
        tower: request.towerId,
        reason: error.reason,
        code: error.code,
      });
      return {
        player: current,
        response: eventTowerErrorReply(request, error.code),
        updatedItems: [],
        updatedMoney: [],
        updatedGirls: [],
        experienceUpdate: null,
        rejected: { code: error.code, reason: error.reason },
      };
    }
    if (!player || !outcome)
      throw new Error(`Failed to handle event tower request: ${account}`);
    const snapshot = structuredClone(player);
    if (!readOnly)
      this.#logger.info("player.event_tower", {
        account,
        command: request.command,
        tower: request.towerId,
      });
    const { itemGuids, moneyIds, girlIds } = outcome;
    return {
      player: snapshot,
      response: outcome.response,
      updatedItems: snapshot.inventory.filter(({ guid }) => itemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => moneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => girlIds.has(girlId)),
      experienceUpdate: outcome.experience,
      rejected: null,
    };
  }

  /**
   * The named-field event towers (named-tower-data.ts): micro tower, armed
   * survey, mixed online, buff tower, linkage, second anniversary and boss
   * challenge. A refusal leaves the save unchanged and returns the client's
   * error reply.
   */
  async handleNamedTowerRequest(
    account: string,
    request: NamedTowerRequest,
    options: { random?: (maxExclusive: number) => number } = {},
  ): Promise<EventTowerResult> {
    const catalog = NamedTowerCatalog.loadDefault();
    const random = options.random ?? ((max: number) => randomInt(max));
    const readOnly = namedTowerReadOnly(request);
    let player: Player | undefined;
    let outcome: TowerOutcome | undefined;
    try {
      if (readOnly) {
        player = this.#store.snapshot().players[account];
        if (!player) throw new Error(`Unknown player account: ${account}`);
        outcome = applyNamedTowerRequest(player, request, catalog, random);
      } else {
        await this.#store.update((state) => {
          const draft = state.players[account];
          if (!draft) throw new Error(`Unknown player account: ${account}`);
          outcome = applyNamedTowerRequest(draft, request, catalog, random);
          player = draft;
        });
      }
    } catch (error) {
      if (!(error instanceof EventTowerError)) throw error;
      const current = this.#store.snapshot().players[account];
      if (!current) throw new Error(`Unknown player account: ${account}`);
      this.#logger.warn("player.named_tower.rejected", {
        account,
        command: request.command,
        kind: request.kind,
        reason: error.reason,
        code: error.code,
      });
      return {
        player: current,
        response: namedTowerErrorReply(request, error.code),
        updatedItems: [],
        updatedMoney: [],
        updatedGirls: [],
        experienceUpdate: null,
        rejected: { code: error.code, reason: error.reason },
      };
    }
    if (!player || !outcome)
      throw new Error(`Failed to handle named tower request: ${account}`);
    const snapshot = structuredClone(player);
    if (!readOnly)
      this.#logger.info("player.named_tower", {
        account,
        command: request.command,
        kind: request.kind,
      });
    const { itemGuids, moneyIds, girlIds } = outcome;
    return {
      player: snapshot,
      response: outcome.response,
      updatedItems: snapshot.inventory.filter(({ guid }) => itemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => moneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => girlIds.has(girlId)),
      experienceUpdate: outcome.experience,
      rejected: null,
      ...(outcome.pushes ? { pushes: outcome.pushes } : {}),
    };
  }

  async settleLevel(
    account: string,
    chapter: number,
    index: number,
    difficulty: number,
    star: number,
    energyCost: number,
    awards: readonly Award[],
    masterExp: number,
    promiseFight?: PromiseFightEvent,
  ): Promise<ChapterSettlement> {
    if (
      ![chapter, index, difficulty].every(
        (value) => Number.isSafeInteger(value) && value > 0 && value <= 0xff,
      )
    ) {
      throw new Error("Invalid level coordinates");
    }
    if (!Number.isSafeInteger(energyCost) || energyCost < 0) {
      throw new Error(`Invalid level energy cost: ${energyCost}`);
    }

    const levelId = makeLevelId(chapter, index, difficulty);
    const starMask = star & 0b111;
    let player: Player | undefined;
    let experienceUpdate: PlayerExperienceUpdate | undefined;
    const updatedItemGuids = new Set<number>();
    const updatedMoneyIds = new Set<number>();
    const updatedGirlIds = new Set<number>();
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);

      let vigour = player.money.find(({ id }) => id === MONEY_VIGOUR);
      const available = vigour?.count ?? 0;
      if (available < energyCost) {
        throw new InsufficientVigourError(energyCost, available);
      }
      if (!vigour) {
        vigour = { id: MONEY_VIGOUR, count: 0 };
        player.money.push(vigour);
      }
      vigour.count -= energyCost;
      updatedMoneyIds.add(MONEY_VIGOUR);
      incrementDailyMissionProgress(player, 109, energyCost);

      const level = player.levels.find(({ id }) => id === levelId);
      const firstClear = !level || level.star >>> 3 === 0;
      if (level) {
        const passCount = Math.min((level.star >>> 3) + 1, 0x0fffffff);
        level.star = (passCount << 3) | (level.star & 0b111) | starMask;
      } else {
        player.levels.push({ id: levelId, star: (1 << 3) | starMask });
      }
      reconcileChapterStarTaskValues(player);
      if (starMask > 0) {
        if (promiseFight)
          promiseFightProgress(
            player,
            promiseFight,
            Date.now(),
            PromiseCatalog.loadDefault(),
          );
        this.#activities.dispatch(player, [
          {
            type: "level.cleared",
            chapter,
            index,
            difficulty,
            stars: starMask,
            firstClear,
          },
        ]);
        incrementDailyMissionProgress(player, 101);
      }
      experienceUpdate = applyPlayerExperience(player, masterExp);
      if (experienceUpdate.vigourRecovery > 0) {
        updatedMoneyIds.add(MONEY_VIGOUR);
      }

      for (const [genre, detail, particular, templateLevel, rawCount] of awards) {
        const count = Math.max(0, rawCount);
        if (count === 0) continue;

        const moneyId =
          genre === 15 && detail === 1
            ? MONEY_GOLD
            : genre === 15 && detail === 2
              ? MONEY_DIAMOND
              : null;
        if (moneyId !== null) {
          let money = player.money.find(({ id }) => id === moneyId);
          if (!money) {
            money = { id: moneyId, count: 0 };
            player.money.push(money);
          }
          money.count += count;
          updatedMoneyIds.add(moneyId);
          continue;
        }

        if (INSTANCE_GENRES.has(genre)) {
          for (let itemIndex = 0; itemIndex < count; itemIndex += 1) {
            const item: InventoryEntryState = {
              guid: player.nextItemGuid++,
              genre,
              detail,
              particular,
              templateLevel,
              count: 1,
              createTime: unixTime(),
              enhanceLevel: initialEnhanceLevel(genre),
              enhanceExp: 0,
              breakLevel: 0,
              lockOn: 0,
            };
            player.inventory.push(item);
            updatedItemGuids.add(item.guid);
          }
        } else {
          let item = player.inventory.find(
            (candidate) =>
              !isInventoryInstance(candidate) &&
              candidate.genre === genre &&
              candidate.detail === detail &&
              candidate.particular === particular &&
              candidate.templateLevel === templateLevel,
          );
          if (!item) {
            item = {
              guid: player.nextItemGuid++,
              genre,
              detail,
              particular,
              templateLevel,
              count: 0,
              createTime: unixTime(),
              enhanceLevel: 0,
              enhanceExp: 0,
              breakLevel: 0,
              lockOn: 0,
            };
            player.inventory.push(item);
          }
          item.count += count;
          updatedItemGuids.add(item.guid);
        }
      }
      const girlReconciliation = reconcileGirlAppearanceState(player, updatedItemGuids);
      for (const girlId of girlReconciliation.updatedGirlIds) {
        updatedGirlIds.add(girlId);
      }
      reconcileGirlFetterUnlocks(player);
    });
    if (!player) throw new Error(`Failed to settle level: ${account}`);
    if (!experienceUpdate) throw new Error(`Failed to update experience: ${account}`);

    this.#logger.info("player.level.settled", {
      account,
      levelId,
      star: starMask,
      energyCost,
      awards,
      masterExp,
      experienceUpdate,
    });
    const snapshot = structuredClone(player);
    return {
      player: snapshot,
      energyCost,
      updatedItems: snapshot.inventory.filter(({ guid }) => updatedItemGuids.has(guid)),
      updatedMoney: snapshot.money.filter(({ id }) => updatedMoneyIds.has(id)),
      updatedGirls: snapshot.girls.filter(({ girlId }) => updatedGirlIds.has(girlId)),
      experienceUpdate,
    };
  }

  async completeStoryLevel(
    account: string,
    { chapter, index, difficulty, firstAwards }: ChapterLevelConfig,
  ) {
    const id = makeLevelId(chapter, index, difficulty);
    return this.#store.update((state) => {
      const player = state.players[account];
      if (!player) throw new Error("Unknown story completion account");

      const level = player.levels.find((entry) => entry.id === id);
      if (level && level.star >>> 3 > 0) {
        return { player, awards: [], updatedItems: [], updatedMoney: [] };
      }
      const starMask = 0b111;
      const completedStar = (1 << 3) | starMask;
      if (level) level.star = completedStar;
      else player.levels.push({ id, star: completedStar });

      const itemGuids = new Set<number>();
      const moneyIds = new Set<number>();
      grantAwards(player, firstAwards, itemGuids, moneyIds);
      reconcileChapterStarTaskValues(player);
      reconcileGirlFetterUnlocks(player);
      this.#activities.dispatch(player, [
        {
          type: "level.cleared",
          chapter,
          index,
          difficulty,
          stars: starMask,
          firstClear: true,
        },
      ]);
      return {
        player,
        awards: firstAwards,
        updatedItems: player.inventory.filter(({ guid }) => itemGuids.has(guid)),
        updatedMoney: player.money.filter(({ id }) => moneyIds.has(id)),
      };
    });
  }

  async completeLevel(
    account: string,
    chapter: number,
    index: number,
    difficulty: number,
    star: number,
  ): Promise<Player> {
    if (
      ![chapter, index, difficulty].every(
        (value) => Number.isSafeInteger(value) && value > 0 && value <= 0xff,
      )
    ) {
      throw new Error("Invalid level coordinates");
    }

    const levelId = makeLevelId(chapter, index, difficulty);
    const starMask = star & 0b111;
    let player: Player | undefined;
    await this.#store.update((state) => {
      player = state.players[account];
      if (!player) throw new Error(`Unknown player account: ${account}`);

      const level = player.levels.find(({ id }) => id === levelId);
      const firstClear = !level || level.star >>> 3 === 0;
      if (level) {
        const passCount = Math.min((level.star >>> 3) + 1, 0x0fffffff);
        level.star = (passCount << 3) | (level.star & 0b111) | starMask;
      } else {
        player.levels.push({ id: levelId, star: (1 << 3) | starMask });
      }
      reconcileChapterStarTaskValues(player);
      if (starMask > 0) {
        this.#activities.dispatch(player, [
          {
            type: "level.cleared",
            chapter,
            index,
            difficulty,
            stars: starMask,
            firstClear,
          },
        ]);
      }
    });
    this.#logger.info("player.level.completed", {
      account,
      levelId,
      chapter,
      index,
      difficulty,
      star: starMask,
    });
    if (!player) throw new Error(`Failed to complete level: ${account}`);
    return structuredClone(player);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Load-time check for the save document. It rejects files that are not a v1
 * save at all (wrong root, a newer schema, players that are not objects), so
 * the store can keep the file and stop, instead of failing later in a handler.
 * Field-level repair stays with the reconcile functions in `getOrCreate`.
 */
export function assertLoadableState(
  document: unknown,
): asserts document is PersistedState {
  if (!isRecord(document)) throw new Error("save root is not an object");
  if (
    document.schemaVersion !== undefined &&
    document.schemaVersion !== SAVE_SCHEMA_VERSION
  ) {
    throw new Error(
      `unsupported schemaVersion ${String(document.schemaVersion)}, expected ${SAVE_SCHEMA_VERSION}`,
    );
  }
  if (!isRecord(document.players)) throw new Error("players is not an object");
  for (const [account, player] of Object.entries(document.players)) {
    if (!isRecord(player)) throw new Error(`player ${account} is not an object`);
    for (const field of ["money", "inventory", "girls", "formations", "levels"]) {
      if (!Array.isArray(player[field])) {
        throw new Error(`player ${account} has no ${field} list`);
      }
    }
    if (!isRecord(player.taskValues)) {
      throw new Error(`player ${account} has no taskValues`);
    }
  }
}

export function makeInitialState(): PersistedState {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    nextRoleId: 1,
    players: {},
    updatedAt: null,
  };
}
