import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { MAX_PLAYER_LEVEL } from "../src/game-data/player-level-data.js";
import {
  maximumVigour,
  recoverVigour,
  VIGOUR_RECOVERY_SECONDS,
} from "../src/game-data/vigour-recovery-data.js";

const NOW = 1_800_000_000;

describe("vigour cap", () => {
  it("matches the Spirit column of the shipped PlayerExp table", () => {
    const rows = readFileSync("resources/cafe/playerexp.txt", "latin1")
      .split(/\r?\n/)
      .slice(3)
      .map((line) => line.split("\t"))
      .filter((fields) => Number(fields[0]) >= 1);
    expect(rows).toHaveLength(MAX_PLAYER_LEVEL);
    for (const [level, , spirit] of rows) {
      expect(maximumVigour(Number(level))).toBe(Number(spirit));
    }
  });

  it("clamps levels outside the table", () => {
    expect(maximumVigour(1)).toBe(28);
    expect(maximumVigour(0)).toBe(28);
    expect(maximumVigour(Number.NaN)).toBe(28);
    expect(maximumVigour(90)).toBe(150);
    expect(maximumVigour(MAX_PLAYER_LEVEL + 50)).toBe(150);
  });
});

describe("natural vigour recovery", () => {
  it("adds one point per six minutes and keeps the rest of the period", () => {
    expect(VIGOUR_RECOVERY_SECONDS).toBe(360);
    expect(recoverVigour(10, 1, NOW - 359, NOW)).toEqual({
      count: 10,
      recoveredAt: NOW - 359,
      gained: 0,
    });
    expect(recoverVigour(10, 1, NOW - 360, NOW)).toEqual({
      count: 11,
      recoveredAt: NOW,
      gained: 1,
    });
    expect(recoverVigour(10, 1, NOW - 800, NOW)).toEqual({
      count: 12,
      recoveredAt: NOW - 80,
      gained: 2,
    });
  });

  it("stops at the cap of the level and restarts the clock there", () => {
    expect(recoverVigour(20, 1, NOW - 86_400, NOW)).toEqual({
      count: 28,
      recoveredAt: NOW,
      gained: 8,
    });
    expect(recoverVigour(20, 2, NOW - 86_400, NOW).count).toBe(31);
  });

  it("never reduces vigour above the cap", () => {
    expect(recoverVigour(28, 1, NOW - 86_400, NOW)).toEqual({
      count: 28,
      recoveredAt: NOW,
      gained: 0,
    });
    expect(recoverVigour(500, 1, NOW - 86_400, NOW)).toEqual({
      count: 500,
      recoveredAt: NOW,
      gained: 0,
    });
  });

  it("starts counting now for a save without a usable clock", () => {
    for (const recoveredAt of [undefined, 0, -5, 1.5, NOW, NOW + 3_600]) {
      expect(recoverVigour(3, 1, recoveredAt, NOW)).toEqual({
        count: 3,
        recoveredAt: NOW,
        gained: 0,
      });
    }
  });
});
