import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

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

async function createRepository(): Promise<{
  repository: PlayerRepository;
  store: JsonStore<PersistedState>;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-readcopy-"));
  directories.push(directory);
  const store = new JsonStore<PersistedState>({
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
  return { repository, store };
}

describe("player reads", () => {
  it("return private copies that do not change the store", async () => {
    const { repository, store } = await createRepository();
    const created = await repository.getOrCreate("tester", Date.UTC(2026, 0, 5, 12));

    const read = repository.get("tester");
    expect(read).not.toBeNull();
    read!.name = "changed";
    read!.level = 99;
    expect(store.snapshot().players["tester"]?.name).not.toBe("changed");
    expect(store.snapshot().players["tester"]?.level).not.toBe(99);
    expect(repository.get("tester")?.name).not.toBe("changed");

    const byRole = repository.getByRoleId(created.roleId);
    expect(byRole?.roleId).toBe(created.roleId);
    byRole!.name = "changed";
    const listed = repository.listLocalPlayers();
    expect(listed).toHaveLength(1);
    listed[0]!.name = "changed";
    expect(repository.get("tester")?.name).not.toBe("changed");
    expect(repository.get("nobody")).toBeNull();
    expect(repository.getByRoleId(-1)).toBeNull();
  });
});
