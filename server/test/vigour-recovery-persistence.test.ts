import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  InsufficientVigourError,
  makeInitialState,
  MONEY_VIGOUR,
  PlayerRepository,
} from "../src/persistence/player-repository.js";
import { mkdtemp } from "./helpers/temp.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};

const MINUTE = 60_000;
const START = new Date("2026-11-14T12:00:00+08:00").getTime();
const START_SECONDS = START / 1000;

const directories: string[] = [];

async function createRepository() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-vigour-"));
  directories.push(directory);
  const store = new JsonStore({
    filePath: path.join(directory, "state.json"),
    initialState: makeInitialState(),
    logger,
  });
  await store.initialize();
  const repository = new PlayerRepository({
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
  await repository.getOrCreate("tester", START);
  return { repository, store };
}

const vigourOf = (player: { money: { id: number; count: number }[] }) =>
  player.money.find(({ id }) => id === MONEY_VIGOUR)?.count ?? 0;

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("vigour recovery persistence", () => {
  it("starts the clock at the spend and recovers one point per six minutes", async () => {
    const { repository } = await createRepository();

    // A full bar that sat idle must not bank recovery time.
    const spent = await repository.settleLevel(
      "tester",
      1,
      1,
      1,
      3,
      6,
      [],
      0,
      undefined,
      START + 600 * MINUTE,
    );
    const spendSeconds = START_SECONDS + 600 * 60;
    expect(vigourOf(spent.player)).toBe(22);
    expect(spent.player.vigourRecoveredAt).toBe(spendSeconds);

    const early = await repository.getOrCreate("tester", START + 605 * MINUTE);
    expect(vigourOf(early)).toBe(22);
    expect(early.vigourRecoveredAt).toBe(spendSeconds);

    const one = await repository.getOrCreate("tester", START + 606 * MINUTE);
    expect(vigourOf(one)).toBe(23);

    const partial = await repository.getOrCreate("tester", START + 613 * MINUTE);
    expect(vigourOf(partial)).toBe(24);
    expect(partial.vigourRecoveredAt).toBe(spendSeconds + 12 * 60);

    const full = await repository.getOrCreate("tester", START + 1_000 * MINUTE);
    expect(vigourOf(full)).toBe(28);
    expect(full.vigourRecoveredAt).toBe(START_SECONDS + 1_000 * 60);
    expect(vigourOf(repository.get("tester")!)).toBe(28);
  });

  it("recovers before a spend, so a waited-for stage is affordable", async () => {
    const { repository } = await createRepository();
    await repository.chargeLevelVigour("tester", 28, START);
    expect(vigourOf(repository.get("tester")!)).toBe(0);

    await expect(
      repository.settleLevel(
        "tester",
        1,
        1,
        1,
        3,
        6,
        [],
        0,
        undefined,
        START + 35 * MINUTE,
      ),
    ).rejects.toBeInstanceOf(InsufficientVigourError);
    // A rejected settlement persists nothing, including the recovery.
    expect(vigourOf(repository.get("tester")!)).toBe(0);

    const settled = await repository.settleLevel(
      "tester",
      1,
      1,
      1,
      3,
      6,
      [],
      0,
      undefined,
      START + 36 * MINUTE,
    );
    expect(vigourOf(settled.player)).toBe(0);
    expect(settled.updatedMoney).toContainEqual({ id: MONEY_VIGOUR, count: 0 });

    const failed = await repository.chargeLevelVigour("tester", 1, START + 42 * MINUTE);
    expect(vigourOf(failed)).toBe(0);
  });

  it("leaves vigour above the cap alone", async () => {
    const { repository, store } = await createRepository();
    // Level-up refills and rewards can lift vigour above the cap.
    await store.update((state) => {
      state.players.tester!.money.find(({ id }) => id === MONEY_VIGOUR)!.count = 78;
    });

    const later = await repository.getOrCreate("tester", START + 600 * MINUTE);
    expect(vigourOf(later)).toBe(78);

    // The clock restarts at the spend that goes below the cap, not earlier.
    const spent = await repository.chargeLevelVigour(
      "tester",
      60,
      START + 900 * MINUTE,
    );
    expect(vigourOf(spent)).toBe(18);
    const soon = await repository.getOrCreate("tester", START + 905 * MINUTE);
    expect(vigourOf(soon)).toBe(18);
  });

  it("reports a changed balance only when a point was recovered", async () => {
    const { repository, store } = await createRepository();
    await repository.chargeLevelVigour("tester", 10, START);

    const idle = await repository.recoverVigour("tester", START + 5 * MINUTE);
    expect(idle.vigour).toBeNull();
    expect(vigourOf(idle.player)).toBe(18);

    const recovered = await repository.recoverVigour("tester", START + 12 * MINUTE);
    expect(recovered.vigour).toEqual({ id: MONEY_VIGOUR, count: 20 });

    await expect(repository.recoverVigour("nobody", START)).rejects.toThrow(
      "Unknown player account",
    );

    // A save from before this feature has no clock: it starts now, without
    // paying out the time since the last login.
    await store.update((state) => {
      delete state.players.tester!.vigourRecoveredAt;
    });
    const legacy = await repository.getOrCreate("tester", START + 6_000 * MINUTE);
    expect(vigourOf(legacy)).toBe(20);
    expect(legacy.vigourRecoveredAt).toBe(START_SECONDS + 6_000 * 60);
  });
});
