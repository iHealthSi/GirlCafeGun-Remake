import { isPlayableGirlId } from "./character-card-data.js";
import {
  CharacterCardCatalog,
  type CharacterCardTemplate,
} from "./character-card-template-data.js";
import { maximumFormationPower } from "./formation-power-data.js";
import { GachaCatalog } from "./gacha-data.js";

/** LuaCall.Friend_Add: the "Send friend request?" button after a stage with a helper. */
export const LUA_COMMAND_FRIEND_ADD = 84;
/** LuaCall.AssistList: UI_Formation:CheckPower asks for helpers before a sortie. */
export const LUA_COMMAND_ASSIST_LIST = 250;

/** UI_Support lists every entry; offline there are always three to pick from. */
export const ASSIST_CANDIDATE_COUNT = 3;
/** CharacterCardBreak.txt: every break type caps the level at 40, 50, 60, 70. */
const BREAK_LEVEL_CAPS = [40, 50, 60, 70] as const;
/** The last cap: CARD_EXP_TO_NEXT_LEVEL has 69 steps. */
export const ASSIST_MAXIMUM_LEVEL = 70;
/** CardSkills: a skill goes from level 1 to level 4. */
const SKILL_MAXIMUM_LEVEL = 4;
/** UI_Support shows a main card and three deputy slots. */
const DEPUTY_COUNT = 3;
/** The stage's recommended power is for a team of three groups. */
const TEAM_GROUP_COUNT = 3;
/** Helpers are three- and four-star cards. */
const MINIMUM_RARITY = 3;
/** Player role ids count up from 1; helper ids stay far above them. */
const HELPER_ROLE_ID_BASE = 7_700_000;
/** UI_Support.type0 = "Stranger". */
const HELPER_TYPE_STRANGER = 0;
/** CardCommon:GetBorderID(0) = 1, the default head frame. */
const DEFAULT_HEAD_FRAME = 0;

const HELPER_NAMES = [
  "Aoi",
  "Hikari",
  "Kaede",
  "Mio",
  "Nanami",
  "Ren",
  "Sakura",
  "Shion",
  "Tsubasa",
  "Yuzu",
  "Akira",
  "Haru",
  "Kei",
  "Natsu",
  "Riku",
  "Sora",
] as const;

export interface AssistRequest {
  /** The stage's recommended team power (UI_Formation powerRequire); 0 = none. */
  power: number;
  /** Recommended attribute types of the stage (tbRecommendAttr, 0-4). */
  recommendedAttributes: number[];
}

export interface AssistPlayer {
  roleId: number;
  level: number;
  inventory: readonly { genre: number; enhanceLevel: number }[];
}

export interface AssistSkill {
  id: number;
  level: number;
}

/** One card of UI_Support:ShowCardInfo and UI_Formation:GetFightFriend. */
export interface AssistCard {
  G: number;
  D: number;
  P: number;
  L: number;
  Enhance: number;
  Break: number;
  RefitNum: number;
  SyncRate: number;
  /** Never empty: UI_Support.lua:230 reads Skill[1].id without a nil check. */
  Skill: AssistSkill[];
}

/** One entry of the AssistList reply (UI_Support:AddOneFriend). */
export interface AssistCandidate {
  id: number;
  type: number;
  name: string;
  level: number;
  /** Required: UI_MissionSuccess:ShowAddFriendPanel indexes the frame table with it. */
  headframeid: number;
  Card: AssistCard[];
}

export type AssistRandom = () => number;

function unwrapLuaParameters(parameters: unknown): unknown {
  if (typeof parameters !== "object" || parameters === null) return parameters;
  const envelope = parameters as Record<string, unknown>;
  return envelope.tbParam ?? parameters;
}

export function parseAssistRequest(parameters: unknown): AssistRequest {
  const value = unwrapLuaParameters(parameters);
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { power: 0, recommendedAttributes: [] };
  const request = value as Record<string, unknown>;
  const power = Number(request.Power);
  // An empty Lua table may arrive as {} instead of [].
  const attributes =
    typeof request.ChapterType === "object" && request.ChapterType !== null
      ? Object.values(request.ChapterType as Record<string, unknown>)
      : [];
  return {
    power: Number.isFinite(power) && power > 0 ? Math.floor(power) : 0,
    recommendedAttributes: [
      ...new Set(
        attributes
          .map(Number)
          .filter((attribute) => Number.isSafeInteger(attribute) && attribute >= 0),
      ),
    ],
  };
}

/** Break level a card needs to reach this level (CardCommon:GetMaxLevel). */
export function assistBreakLevel(level: number): number {
  const index = BREAK_LEVEL_CAPS.findIndex((cap) => level <= cap);
  return index < 0 ? BREAK_LEVEL_CAPS.length - 1 : index;
}

function clampLevel(level: number): number {
  return Math.max(1, Math.min(ASSIST_MAXIMUM_LEVEL, Math.floor(level)));
}

/**
 * Character cards a helper may use: three- and four-star cards of the card
 * gacha pools (their models are in the client) that have a tactical skill.
 */
export function loadAssistRoster(
  gacha: GachaCatalog = GachaCatalog.loadDefault(),
  cards: CharacterCardCatalog = CharacterCardCatalog.loadDefault(),
): CharacterCardTemplate[] {
  const roster = new Map<string, CharacterCardTemplate>();
  for (const id of gacha.ids) {
    const pool = gacha.get(id);
    if (!pool) continue;
    for (const group of [...pool.normalCards.values(), ...pool.hedgeCards.values()]) {
      for (const card of group) {
        const [genre, detail, particular, templateLevel] = card.gdpl;
        if (genre !== 1 || card.rarity < MINIMUM_RARITY) continue;
        if (!isPlayableGirlId(detail)) continue;
        const template = cards.get({ genre, detail, particular, templateLevel });
        if (!template || template.skillIds[0] <= 0) continue;
        roster.set(card.gdpl.join(":"), template);
      }
    }
  }
  return [...roster.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, template]) => template);
}

let defaultRoster: CharacterCardTemplate[] | null = null;

function defaultAssistRoster(): CharacterCardTemplate[] {
  return (defaultRoster ??= loadAssistRoster());
}

/** Combat power of one helper group, by the server's copy of the client formula. */
export function assistGroupPower(
  main: CharacterCardTemplate,
  deputies: readonly CharacterCardTemplate[],
  level: number,
): number {
  const breakLevel = assistBreakLevel(level);
  const inventory = [main, ...deputies].map((template, index) => ({
    guid: index + 1,
    genre: template.genre,
    detail: template.detail,
    particular: template.particular,
    templateLevel: template.templateLevel,
    enhanceLevel: level,
    breakLevel,
  }));
  return maximumFormationPower({
    inventory,
    formations: [
      {
        fightCards: [
          {
            mainCardGuid: 1,
            secondaryCardGuids: inventory.slice(1).map((item) => item.guid),
            weaponGuid: 0,
            runeItemGuids: [],
          },
        ],
      },
    ],
  });
}

/** The lowest level whose group power reaches the target; the cap when none does. */
export function assistLevelForPower(
  main: CharacterCardTemplate,
  deputies: readonly CharacterCardTemplate[],
  targetGroupPower: number,
): number {
  for (let level = 1; level <= ASSIST_MAXIMUM_LEVEL; level++) {
    if (assistGroupPower(main, deputies, level) >= targetGroupPower) return level;
  }
  return ASSIST_MAXIMUM_LEVEL;
}

function pick<T>(items: readonly T[], random: AssistRandom): T {
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return items[Math.max(0, index)]!;
}

function pickCard(
  roster: readonly CharacterCardTemplate[],
  usedGirls: ReadonlySet<number>,
  random: AssistRandom,
): CharacterCardTemplate | null {
  const free = roster.filter((template) => !usedGirls.has(template.detail));
  return free.length > 0 ? pick(free, random) : null;
}

function assistSkills(template: CharacterCardTemplate, level: number): AssistSkill[] {
  // Tactical first: UI_Support shows Skill[1] as the helper's skill.
  const ids = [...new Set(template.skillIds.slice(0, 3).filter((id) => id > 0))];
  return (ids.length > 0 ? ids : [0]).map((id) => ({ id, level }));
}

function assistCard(template: CharacterCardTemplate, level: number): AssistCard {
  const breakLevel = assistBreakLevel(level);
  return {
    G: template.genre,
    D: template.detail,
    P: template.particular,
    L: template.templateLevel,
    Enhance: level,
    Break: breakLevel,
    RefitNum: 0,
    SyncRate: 0,
    Skill: assistSkills(template, Math.min(SKILL_MAXIMUM_LEVEL, 1 + breakLevel)),
  };
}

/** Best character card level of the player, for stages without a recommended power. */
function playerCardLevel(player: AssistPlayer): number {
  let best = 1;
  for (const item of player.inventory) {
    if (item.genre === 1 && Number.isFinite(item.enhanceLevel))
      best = Math.max(best, item.enhanceLevel);
  }
  return clampLevel(best);
}

/**
 * Three offline helpers: a random main girl (preferring the stage's
 * recommended attributes) with three random deputy girls, all at the level
 * whose group power reaches a third of the stage's recommended team power.
 */
export function makeAssistCandidates(
  player: AssistPlayer,
  request: AssistRequest,
  random: AssistRandom = Math.random,
  roster: readonly CharacterCardTemplate[] = defaultAssistRoster(),
): AssistCandidate[] {
  if (roster.length === 0) return [];
  const targetGroupPower =
    request.power > 0 ? Math.ceil(request.power / TEAM_GROUP_COUNT) : null;
  const fallbackLevel = playerCardLevel(player);
  const recommended = new Set(request.recommendedAttributes);
  const preferred = roster.filter((template) =>
    recommended.has(template.attributeType),
  );
  const mainGirls = new Set<number>();
  const names = [...HELPER_NAMES];
  const candidates: AssistCandidate[] = [];

  for (let slot = 0; slot < ASSIST_CANDIDATE_COUNT; slot++) {
    const main =
      pickCard(preferred, mainGirls, random) ?? pickCard(roster, mainGirls, random);
    if (!main) break;
    mainGirls.add(main.detail);

    const teamGirls = new Set([main.detail]);
    const deputies: CharacterCardTemplate[] = [];
    for (let index = 0; index < DEPUTY_COUNT; index++) {
      const deputy = pickCard(roster, teamGirls, random);
      if (!deputy) break;
      teamGirls.add(deputy.detail);
      deputies.push(deputy);
    }

    const level =
      targetGroupPower === null
        ? fallbackLevel
        : assistLevelForPower(main, deputies, targetGroupPower);
    const nameIndex = Math.min(names.length - 1, Math.floor(random() * names.length));
    const [name] = names.splice(Math.max(0, nameIndex), 1);

    let id = HELPER_ROLE_ID_BASE + slot + 1;
    if (id === player.roleId) id += ASSIST_CANDIDATE_COUNT;
    candidates.push({
      id,
      type: HELPER_TYPE_STRANGER,
      name: name ?? `Helper ${slot + 1}`,
      level: Math.max(1, Math.floor(player.level) || 1),
      headframeid: DEFAULT_HEAD_FRAME,
      Card: [main, ...deputies].map((template) => assistCard(template, level)),
    });
  }
  return candidates;
}
