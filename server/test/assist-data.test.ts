import { describe, expect, it } from "vitest";

import {
  ASSIST_CANDIDATE_COUNT,
  ASSIST_MAXIMUM_LEVEL,
  assistBreakLevel,
  assistGroupPower,
  loadAssistRoster,
  makeAssistCandidates,
  parseAssistRequest,
  type AssistCandidate,
  type AssistPlayer,
} from "../src/game-data/assist-data.js";
import { isPlayableGirlId } from "../src/game-data/character-card-data.js";
import { CharacterCardCatalog } from "../src/game-data/character-card-template-data.js";

const BREAK_CAPS = [40, 50, 60, 70];

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const player: AssistPlayer = {
  roleId: 1,
  level: 23,
  inventory: [
    { genre: 1, enhanceLevel: 12 },
    { genre: 1, enhanceLevel: 37 },
    { genre: 2, enhanceLevel: 60 },
  ],
};

const roster = loadAssistRoster();
const cards = CharacterCardCatalog.loadDefault();

function templatesOf(candidate: AssistCandidate) {
  return candidate.Card.map((card) => {
    const template = cards.get({
      genre: card.G,
      detail: card.D,
      particular: card.P,
      templateLevel: card.L,
    });
    expect(template, `template ${card.G}-${card.D}-${card.P}-${card.L}`).not.toBeNull();
    return template!;
  });
}

describe("offline assist helpers", () => {
  it("draws helpers from three- and four-star gacha cards with skills", () => {
    expect(roster.length).toBeGreaterThan(20);
    const girls = new Set(roster.map((template) => template.detail));
    expect(girls.size).toBeGreaterThanOrEqual(ASSIST_CANDIDATE_COUNT + 3);
    for (const template of roster) {
      expect(template.genre).toBe(1);
      expect(template.rarity).toBeGreaterThanOrEqual(3);
      expect(isPlayableGirlId(template.detail)).toBe(true);
      expect(template.skillIds[0]).toBeGreaterThan(0);
    }
  });

  it("reads the AssistList request in the shapes the client sends", () => {
    expect(
      parseAssistRequest({ sCmd: 250, tbParam: { Power: 3530, ChapterType: [1, 3] } }),
    ).toEqual({ power: 3530, recommendedAttributes: [1, 3] });
    expect(parseAssistRequest({ Power: "18000", ChapterType: {} })).toEqual({
      power: 18000,
      recommendedAttributes: [],
    });
    expect(parseAssistRequest({ Power: 0 })).toEqual({
      power: 0,
      recommendedAttributes: [],
    });
    expect(parseAssistRequest({ Power: -5, ChapterType: { 1: 2, 2: "x" } })).toEqual({
      power: 0,
      recommendedAttributes: [2],
    });
    expect(parseAssistRequest(null)).toEqual({ power: 0, recommendedAttributes: [] });
    expect(parseAssistRequest([1, 2])).toEqual({ power: 0, recommendedAttributes: [] });
  });

  it("offers three different girls, each with three different deputies", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const candidates = makeAssistCandidates(
        player,
        { power: 3530, recommendedAttributes: [] },
        seeded(seed),
        roster,
      );
      expect(candidates).toHaveLength(ASSIST_CANDIDATE_COUNT);
      expect(new Set(candidates.map((candidate) => candidate.Card[0]!.D)).size).toBe(
        ASSIST_CANDIDATE_COUNT,
      );
      expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(
        ASSIST_CANDIDATE_COUNT,
      );
      expect(new Set(candidates.map((candidate) => candidate.name)).size).toBe(
        ASSIST_CANDIDATE_COUNT,
      );
      for (const candidate of candidates) {
        expect(candidate.id).not.toBe(player.roleId);
        expect(candidate.type).toBe(0);
        expect(candidate.headframeid).toBe(0);
        expect(candidate.level).toBe(player.level);
        expect(candidate.Card).toHaveLength(4);
        expect(new Set(candidate.Card.map((card) => card.D)).size).toBe(4);
      }
    }
  });

  it("sends every field the Support screen reads, tactical skill first", () => {
    const [candidate] = makeAssistCandidates(
      player,
      { power: 30_000, recommendedAttributes: [] },
      seeded(7),
      roster,
    );
    const templates = templatesOf(candidate!);
    candidate!.Card.forEach((card, index) => {
      expect(card).toEqual({
        G: 1,
        D: expect.any(Number),
        P: expect.any(Number),
        L: expect.any(Number),
        Enhance: expect.any(Number),
        Break: expect.any(Number),
        RefitNum: 0,
        SyncRate: 0,
        Skill: expect.any(Array),
      });
      expect(card.Skill.length).toBeGreaterThan(0);
      expect(card.Skill[0]!.id).toBe(templates[index]!.skillIds[0]);
      for (const skill of card.Skill) {
        expect(skill.id).toBeGreaterThan(0);
        expect(skill.level).toBe(Math.min(4, 1 + card.Break));
      }
    });
    expect(JSON.parse(JSON.stringify(candidate))).toEqual(candidate);
  });

  it("matches the helper's level to a third of the stage's recommended power", () => {
    for (const power of [3530, 9700, 15_330, 18_000]) {
      const candidates = makeAssistCandidates(
        player,
        { power, recommendedAttributes: [] },
        seeded(power),
        roster,
      );
      const target = Math.ceil(power / 3);
      for (const candidate of candidates) {
        const [main, ...deputies] = templatesOf(candidate);
        const level = candidate.Card[0]!.Enhance;
        expect(candidate.Card.every((card) => card.Enhance === level)).toBe(true);
        const groupPower = assistGroupPower(main!, deputies, level);
        if (level < ASSIST_MAXIMUM_LEVEL)
          expect(groupPower).toBeGreaterThanOrEqual(target);
        if (level > 1)
          expect(assistGroupPower(main!, deputies, level - 1)).toBeLessThan(target);
      }
    }
  });

  it("raises helpers with the stage: a late stage gets stronger helpers", () => {
    const level = (power: number) =>
      Math.max(
        ...makeAssistCandidates(
          player,
          { power, recommendedAttributes: [] },
          seeded(3),
          roster,
        ).map((candidate) => candidate.Card[0]!.Enhance),
      );
    expect(level(6_480)).toBeLessThan(level(15_330));
    expect(level(1_000_000)).toBe(ASSIST_MAXIMUM_LEVEL);
  });

  it("keeps level and break level together as the break table allows", () => {
    expect(assistBreakLevel(1)).toBe(0);
    expect(assistBreakLevel(40)).toBe(0);
    expect(assistBreakLevel(41)).toBe(1);
    expect(assistBreakLevel(60)).toBe(2);
    expect(assistBreakLevel(61)).toBe(3);
    expect(assistBreakLevel(70)).toBe(3);
    for (let level = 1; level <= ASSIST_MAXIMUM_LEVEL; level++) {
      const breakLevel = assistBreakLevel(level);
      expect(level).toBeLessThanOrEqual(BREAK_CAPS[breakLevel]!);
      if (breakLevel > 0) expect(level).toBeGreaterThan(BREAK_CAPS[breakLevel - 1]!);
    }
  });

  it("uses the player's best card level when the stage sends no power", () => {
    const candidates = makeAssistCandidates(
      player,
      { power: 0, recommendedAttributes: [] },
      seeded(11),
      roster,
    );
    for (const card of candidates.flatMap((candidate) => candidate.Card)) {
      expect(card.Enhance).toBe(37);
      expect(card.Break).toBe(0);
    }
    const newPlayer = makeAssistCandidates(
      { roleId: 2, level: 1, inventory: [] },
      { power: 0, recommendedAttributes: [] },
      seeded(11),
      roster,
    );
    expect(
      newPlayer.flatMap((candidate) => candidate.Card.map((card) => card.Enhance)),
    ).toEqual(Array(12).fill(1));
  });

  it("prefers main girls of the stage's recommended attribute", () => {
    for (const attribute of [0, 1, 2, 3, 4]) {
      const available = new Set(
        roster
          .filter((template) => template.attributeType === attribute)
          .map((template) => template.detail),
      );
      const candidates = makeAssistCandidates(
        player,
        { power: 5000, recommendedAttributes: [attribute] },
        seeded(attribute + 100),
        roster,
      );
      const matching = candidates.filter(
        (candidate) => templatesOf(candidate)[0]!.attributeType === attribute,
      );
      expect(matching.length).toBe(Math.min(ASSIST_CANDIDATE_COUNT, available.size));
    }
  });

  it("returns an empty list rather than nothing when no card can help", () => {
    expect(
      makeAssistCandidates(
        player,
        { power: 3530, recommendedAttributes: [] },
        seeded(1),
        [],
      ),
    ).toEqual([]);
  });
});
