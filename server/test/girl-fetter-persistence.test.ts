import { rm } from "node:fs/promises";
import { mkdtemp } from "./helpers/temp.js";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  GIRL_FETTER_EVENT_OFFSET,
  GIRL_MAIN_STORY_OFFSET,
  GirlFetterCatalog,
} from "../src/game-data/girl-fetter-data.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  GirlViewStoryError,
  makeInitialState,
  makeLevelId,
  PlayerRepository,
  type PersistedState,
} from "../src/persistence/player-repository.js";

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
  filePath: string;
}> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-girl-fetter-"));
  directories.push(directory);
  const filePath = path.join(directory, "state.json");
  const store = new JsonStore({
    filePath,
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
  await repository.getOrCreate("tester");
  return { repository, store, filePath };
}

const mainStoryKey = (girlId: number) =>
  String((3 << 16) | ((girlId - 1) * 2000 + GIRL_MAIN_STORY_OFFSET));

function fetterTaskKey(girlId: number, index: number): string {
  return String(
    (3 << 16) | ((girlId - 1) * 2_000 + GIRL_FETTER_EVENT_OFFSET + index - 1),
  );
}

async function setGirlLevel(
  store: JsonStore<PersistedState>,
  girlId: number,
  level: number,
): Promise<void> {
  await store.update((state) => {
    const girl = state.players.tester?.girls.find(
      (candidate) => candidate.girlId === girlId,
    );
    if (girl) girl.level = level;
  });
}

describe("girl fetter unlock reconciliation", () => {
  it("unlocks nodes whose affection level is met", async () => {
    const { repository, store } = await createRepository();
    await setGirlLevel(store, 2, 5);
    const { unlocks, player } = await repository.reconcileGirlFetter("tester");
    expect(unlocks).toContainEqual({ girlId: 2, index: 2 });
    // 等级 1 的主线节点在建号时已解锁
    expect(player.taskValues[fetterTaskKey(2, 1)]).toBe(1);
    expect(player.taskValues[fetterTaskKey(2, 2)]).toBe(1);
    // 等级 15 的节点不解锁
    expect(player.taskValues[fetterTaskKey(2, 11)] ?? 0).toBe(0);
  });

  it("keeps chapter-gated nodes locked until the chapter is cleared", async () => {
    const { repository, store } = await createRepository();
    await setGirlLevel(store, 2, 15);
    const before = await repository.reconcileGirlFetter("tester");
    expect(before.player.taskValues[fetterTaskKey(2, 11)] ?? 0).toBe(0);

    await store.update((state) => {
      state.players.tester?.levels.push({ id: makeLevelId(2, 6, 1), star: 1 });
    });
    const after = await repository.reconcileGirlFetter("tester");
    expect(after.unlocks).toContainEqual({ girlId: 2, index: 11 });
    expect(after.player.taskValues[fetterTaskKey(2, 11)]).toBe(1);
  });

  it("is idempotent and reconciles on login", async () => {
    const { repository, store } = await createRepository();
    await setGirlLevel(store, 2, 5);
    await repository.reconcileGirlFetter("tester");
    const again = await repository.reconcileGirlFetter("tester");
    expect(again.unlocks).toEqual([]);

    await setGirlLevel(store, 7, 10);
    const player = await repository.markLogin("tester");
    expect(player.taskValues[fetterTaskKey(7, 1)]).toBe(1);
    expect(player.taskValues[fetterTaskKey(7, 5)]).toBe(1);
  });

  it("unlocks fetter nodes when a gift raises the affection level", async () => {
    const { repository, store } = await createRepository();
    await store.update((state) => {
      state.players.tester?.inventory.push({
        guid: 900_001,
        genre: 5,
        detail: 2,
        particular: 1,
        templateLevel: 1,
        count: 30,
        createTime: 0,
        enhanceLevel: 0,
        enhanceExp: 0,
        breakLevel: 0,
        lockOn: 0,
      });
    });
    const result = await repository.sendGirlGift("tester", 2, [5, 2, 1, 1], 30);
    expect(result.newLevel).toBeGreaterThanOrEqual(5);
    expect(result.fetterUnlocks).toContainEqual({ girlId: 2, index: 2 });
    expect(result.player.taskValues[fetterTaskKey(2, 2)]).toBe(1);
  });
});

describe("view girl story", () => {
  it("advances the first three main chapters of every stock girl using their native ordinal and survives reload", async () => {
    const { repository, store, filePath } = await createRepository();
    const catalog = GirlFetterCatalog.loadDefault();
    await store.update((state) => {
      const player = state.players.tester!,
        template = player.girls[0]!;
      player.girls = Array.from({ length: 16 }, (_, i) => ({
        ...template,
        girlId: i + 1,
        level: 20,
      }));
    });
    await repository.reconcileGirlFetter("tester");
    for (let girlId = 1; girlId <= 16; girlId++) {
      const main = catalog.mainStories(girlId);
      await expect(
        repository.setGirlMainStoryProgress("tester", girlId, 3),
      ).rejects.toMatchObject({ reason: "story_locked" });
      for (let ordinal = 1; ordinal <= 3; ordinal++) {
        expect(main[ordinal - 1]!.requiredLevel).toBeLessThanOrEqual(20);
        await repository.setGirlMainStoryProgress("tester", girlId, ordinal);
        await repository.viewGirlStory("tester", girlId, 1, main[ordinal - 1]!.index);
      }
      expect(repository.get("tester")!.taskValues[mainStoryKey(girlId)]).toBe(3);
    }
    await store.flush();
    const reloaded = new JsonStore({
      filePath,
      initialState: makeInitialState(),
      logger,
    });
    await reloaded.initialize();
    for (let girlId = 1; girlId <= 16; girlId++)
      expect(reloaded.snapshot().players.tester!.taskValues[mainStoryKey(girlId)]).toBe(
        3,
      );
  }, 15000);

  it("repairs legacy main-story cursors for all 16 stock girls without replaying awards", async () => {
    const { repository, store, filePath } = await createRepository();
    const catalog = GirlFetterCatalog.loadDefault();
    await store.update((state) => {
      const player = state.players.tester!;
      const template = player.girls[0]!;
      player.girls = Array.from({ length: 16 }, (_, index) => ({
        ...template,
        girlId: index + 1,
        level: 100,
      }));
      for (const girl of player.girls) {
        const main = catalog.mainStories(girl.girlId);
        expect(main.length).toBeGreaterThan(2);
        for (const node of main.slice(0, 2))
          player.taskValues[fetterTaskKey(girl.girlId, node.index)] = 2;
        delete player.taskValues[mainStoryKey(girl.girlId)];
      }
    });
    const before = repository.get("tester")!;
    const repaired = await repository.markLogin("tester");
    for (const girl of repaired.girls)
      expect(repaired.taskValues[mainStoryKey(girl.girlId)]).toBe(2);
    expect(repaired.inventory).toEqual(before.inventory);
    expect(repaired.money).toEqual(before.money);
    await store.flush();
    const reloaded = new JsonStore({
      filePath,
      initialState: makeInitialState(),
      logger,
    });
    await reloaded.initialize();
    for (let girlId = 1; girlId <= 16; girlId++)
      expect(reloaded.snapshot().players.tester!.taskValues[mainStoryKey(girlId)]).toBe(
        2,
      );
  });

  it("records the stock main-story receipt, preserves read progress and enforces level/order gates", async () => {
    const { repository, store } = await createRepository();
    await expect(
      repository.setGirlMainStoryProgress("tester", 2, 2),
    ).rejects.toMatchObject({ reason: "story_locked" });
    let player = await repository.setGirlMainStoryProgress("tester", 2, 1);
    expect(player.taskValues[mainStoryKey(2)]).toBe(1);
    const read = await repository.viewGirlStory("tester", 2, 1, 1);
    expect(read.alreadyRead).toBe(false);
    expect(read.player.taskValues[mainStoryKey(2)]).toBe(1);
    await setGirlLevel(store, 2, 10);
    await repository.reconcileGirlFetter("tester");
    player = await repository.setGirlMainStoryProgress("tester", 2, 2);
    expect(player.taskValues[mainStoryKey(2)]).toBe(2);
    player = await repository.setGirlMainStoryProgress("tester", 2, 1);
    expect(player.taskValues[mainStoryKey(2)]).toBe(2);
    const repeat = await repository.viewGirlStory("tester", 2, 1, 1);
    expect(repeat.alreadyRead).toBe(true);
    expect(repeat.awards).toEqual([]);
    await expect(
      repository.setGirlMainStoryProgress("tester", 2, 3),
    ).rejects.toMatchObject({ reason: "story_locked" });
    await expect(
      repository.setGirlMainStoryProgress("tester", 27, 1),
    ).rejects.toMatchObject({ reason: "girl_not_owned" });
    await expect(
      repository.setGirlMainStoryProgress("tester", 2, 999),
    ).rejects.toMatchObject({ reason: "story_not_found" });
    player = await repository.setTaskValues("tester", [
      { id: Number(mainStoryKey(2)), value: 0 },
    ]);
    expect(player.taskValues[mainStoryKey(2)]).toBe(2);
  });

  it("recovers a completed first story without treating a read side story as the next main chapter", async () => {
    const { repository, store } = await createRepository();
    await setGirlLevel(store, 2, 10);
    await store.update((state) => {
      state.players.tester!.taskValues[fetterTaskKey(2, 1)] = 2;
      state.players.tester!.taskValues[fetterTaskKey(2, 2)] = 2;
    });
    const player = await repository.markLogin("tester");
    expect(player.taskValues[mainStoryKey(2)]).toBe(1);
    await expect(
      repository.setGirlMainStoryProgress("tester", 2, 2),
    ).resolves.toBeDefined();
  });

  it("grants the node award once and marks the node read", async () => {
    const { repository, store } = await createRepository();
    await setGirlLevel(store, 2, 5);
    await repository.reconcileGirlFetter("tester");

    const first = await repository.viewGirlStory("tester", 2, 1, 2);
    expect(first.alreadyRead).toBe(false);
    expect(first.awards).toEqual([
      [15, 2, 1, 1, 10],
      [15, 1, 1, 1, 3000],
    ]);
    expect(first.player.taskValues[fetterTaskKey(2, 2)]).toBe(2);
    expect(first.player.money.find(({ id }) => id === 3)?.count).toBe(10);
    expect(first.player.money.find(({ id }) => id === 2)?.count).toBe(3_000);

    const second = await repository.viewGirlStory("tester", 2, 1, 2);
    expect(second.alreadyRead).toBe(true);
    expect(second.awards).toEqual([]);
    expect(second.player.money.find(({ id }) => id === 3)?.count).toBe(10);
  });

  it("rejects locked or unknown stories", async () => {
    const { repository } = await createRepository();
    await expect(repository.viewGirlStory("tester", 2, 1, 2)).rejects.toThrow(
      GirlViewStoryError,
    );
    await repository.viewGirlStory("tester", 2, 1, 2).catch((error: unknown) => {
      expect((error as GirlViewStoryError).reason).toBe("story_locked");
    });
    await repository.viewGirlStory("tester", 2, 1, 999).catch((error: unknown) => {
      expect((error as GirlViewStoryError).reason).toBe("story_not_found");
    });
    await expect(repository.viewGirlStory("tester", 99, 1, 1)).rejects.toThrow(
      GirlViewStoryError,
    );
  });

  it("marks card stories read without awards (nType=3)", async () => {
    const { repository } = await createRepository();
    const result = await repository.viewGirlStory("tester", 2, 3, 1);
    expect(result.awards).toEqual([]);
    const key = String((3 << 16) | ((2 - 1) * 2_000 + 400 + 1 - 1));
    expect(result.player.taskValues[key]).toBe(2);
  });
});
