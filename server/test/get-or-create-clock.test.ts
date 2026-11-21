import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { bountyOperationalDate } from "../src/game-data/bounty-data.js";
import { dailyMissionOperationalDate } from "../src/game-data/daily-mission-data.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  makeInitialState,
  PlayerRepository,
  type PersistedState,
} from "../src/persistence/player-repository.js";
import { mkdtemp } from "./helpers/temp.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function createRepository(): Promise<PlayerRepository> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-clock-"));
  directories.push(directory);
  const store = new JsonStore<PersistedState>({
    filePath: path.join(directory, "state.json"),
    initialState: makeInitialState(),
    logger,
  });
  await store.initialize();
  return new PlayerRepository({
    store,
    defaults: {
      name: "",
      level: 1,
      exp: 0,
      fightPower: 0,
      serverZone: 8,
      firstLevelComplete: false,
    },
    logger,
  });
}

describe("getOrCreate clock", () => {
  const created = Date.UTC(2026, 0, 5, 12);
  const later = Date.UTC(2026, 0, 7, 12);

  it("keys the daily reconciles of a new player to the given time", async () => {
    const repository = await createRepository();
    const player = await repository.getOrCreate("tester", created);
    expect(player.dailyMissions?.operationalDate).toBe(
      dailyMissionOperationalDate(created),
    );
    expect(player.bounty?.operationalDate).toBe(bountyOperationalDate(created));
  });

  it("keys the daily reconciles of an existing player to the given time", async () => {
    const repository = await createRepository();
    await repository.getOrCreate("tester", created);
    const player = await repository.getOrCreate("tester", later);
    expect(player.dailyMissions?.operationalDate).toBe(
      dailyMissionOperationalDate(later),
    );
    expect(player.bounty?.operationalDate).toBe(bountyOperationalDate(later));
    expect(player.dailyMissions?.operationalDate).not.toBe(
      dailyMissionOperationalDate(Date.now()),
    );
  });

  it("rolls the daily missions and bounty at 04:00 Asia/Shanghai, not before", async () => {
    const repository = await createRepository();
    const day1 = Date.UTC(2026, 2, 10, 12); // 20:00 Shanghai, operational day 2026-03-10
    const beforeBoundary = Date.UTC(2026, 2, 10, 19, 59, 59); // 03:59:59 Shanghai
    const atBoundary = Date.UTC(2026, 2, 10, 20, 0, 0); // 04:00:00 Shanghai

    const first = await repository.getOrCreate("tester", day1);
    expect(first.dailyMissions?.operationalDate).toBe("2026-03-10");
    expect(first.bounty?.operationalDate).toBe("2026-03-10");

    const before = await repository.getOrCreate("tester", beforeBoundary);
    expect(before.dailyMissions?.operationalDate).toBe("2026-03-10");
    expect(before.bounty?.operationalDate).toBe("2026-03-10");

    const after = await repository.getOrCreate("tester", atBoundary);
    expect(after.dailyMissions?.operationalDate).toBe("2026-03-11");
    expect(after.bounty?.operationalDate).toBe("2026-03-11");
  });
});
