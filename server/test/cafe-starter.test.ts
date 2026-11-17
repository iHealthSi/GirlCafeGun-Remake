import { rm } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { mkdtemp } from "./helpers/temp.js";
import { CafeCatalog } from "../src/game-data/cafe-catalog.js";
import { reconcileStarterCafe } from "../src/game-data/cafe-starter.js";
import { validCafeSeat } from "../src/game-data/cafe-runtime.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  makeInitialState,
  PlayerRepository,
} from "../src/persistence/player-repository.js";
import type { Logger } from "../src/logger.js";

const now = Date.UTC(2026, 10, 17, 12);
const catalog = CafeCatalog.loadDefault();
const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};
const defaults = {
  name: "",
  level: 1,
  exp: 0,
  fightPower: 0,
  serverZone: 8,
  firstLevelComplete: false,
};

async function fixture(
  run: (
    players: PlayerRepository,
    store: JsonStore<ReturnType<typeof makeInitialState>>,
    reload: () => Promise<PlayerRepository>,
  ) => Promise<void>,
) {
  const root = path.resolve(import.meta.dirname, "../../tools/cafe-fix");
  const directory = await mkdtemp(path.join(root, "cafe-starter-"));
  if (!directory.startsWith(root + path.sep))
    throw new Error("Unsafe test directory");
  const filePath = path.join(directory, "state.json");
  const store = new JsonStore({ filePath, initialState: makeInitialState(), logger });
  await store.initialize();
  const repository = (value: typeof store) =>
    new PlayerRepository({ store: value, defaults, logger, welcomeGifts: true });
  try {
    await run(repository(store), store, async () => {
      await store.flush();
      const next = new JsonStore({
        filePath,
        initialState: makeInitialState(),
        logger,
      });
      await next.initialize();
      return repository(next);
    });
  } finally {
    await store.flush();
    await rm(directory, { recursive: true, force: true });
  }
}

describe("release starter café", () => {
  it("restores the stock layout, earns real café coins, and can finance more coffee after restart", async () => {
    await fixture(async (players, store, reload) => {
      const player = await players.getOrCreate("fresh", now);
      expect(player.cafe.furniture).toHaveLength(9);
      expect(
        player.cafe.furniture!.map((item) => ({
          templateId: item.templateId,
          parentTemplateId: item.pose.parentTemplateId,
          posX: item.pose.posX,
          posY: item.pose.posY,
          rotate: item.pose.rotate,
        })),
      ).toEqual(catalog.theme(1)!.poses);
      expect(player.cafe.business!.seats).toHaveLength(4);
      expect(
        player.cafe.business!.seats.every((seat) =>
          validCafeSeat(player, seat.position, catalog),
        ),
      ).toBe(true);
      expect(player.cafe.rooms![0]!.furnitureIds).toHaveLength(9);
      expect(player.cafe.coffees[0]!.count).toBe(60);
      const recipe = player.cafe.coffees[0]!.coffeetype;
      await players.handleCafeRequest("fresh", 112, {}, now + 8 * 3_600_000);
      const sold = players.get("fresh")!;
      expect(sold.money.find((money) => money.id === 7)!.count).toBeGreaterThan(0);
      expect(sold.money.find((money) => money.id === 2)!.count).toBeGreaterThanOrEqual(
        50,
      );
      expect(sold.cafe.coffees[0]!.count).toBe(0);
      const restarted = await reload();
      await restarted.getOrCreate("fresh", now + 8 * 3_600_000);
      expect(restarted.get("fresh")!.cafe.coffees[0]!.count).toBe(0);
      await restarted.handleCafeRequest(
        "fresh",
        119,
        { coffeetype: recipe, count: 10 },
        now + 8 * 3_600_000,
      );
      expect(restarted.get("fresh")!.cafe.coffees[0]!.count).toBe(10);
      await store.flush();
    });
  });

  it("repairs an old empty account once and preserves native objects and unrelated progress", async () => {
    await fixture(async (players, store) => {
      await players.getOrCreate("legacy", now);
      await store.update((state) => {
        const player = state.players.legacy!;
        player.cafe = { coffees: [] };
        player.money.push({ id: 7, count: 123 });
      });
      const before = players.get("legacy")!;
      const fixed = await players.getOrCreate("legacy", now);
      expect(fixed.cafe.furniture).toHaveLength(9);
      expect(fixed.money).toEqual(before.money);
      expect(fixed.inventory).toEqual(before.inventory);
      expect((await players.getOrCreate("legacy", now)).cafe).toEqual(fixed.cafe);
      await store.update((state) => {
        state.players.legacy!.cafe.furniture = [];
      });
      expect((await players.getOrCreate("legacy", now)).cafe.furniture).toEqual([]);
    });
  });

  it("leaves an existing collection and its stock/layout untouched", async () => {
    await fixture(async (players) => {
      const player = await players.getOrCreate("decorated", now);
      delete player.cafe.starterVersion;
      player.cafe.furniture![0]!.roomId = 0;
      player.cafe.coffees = [];
      const before = structuredClone(player.cafe);
      reconcileStarterCafe(player, now);
      expect(player.cafe).toEqual({ ...before, starterVersion: 1 });
    });
  });
});
