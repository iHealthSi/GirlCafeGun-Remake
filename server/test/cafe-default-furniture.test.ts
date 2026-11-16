import { rm } from "node:fs/promises";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CafeCatalog } from "../src/game-data/cafe-catalog.js";
import { validCafeSeat } from "../src/game-data/cafe-runtime.js";
import { isNativeFixedHouseObjectId } from "../src/game-data/house-data.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  makeInitialState,
  PlayerRepository,
  type CafeFurnitureState,
  type Player,
} from "../src/persistence/player-repository.js";
import { mkdtemp } from "./helpers/temp.js";

const root = path.resolve(import.meta.dirname, "../../tools/cafe-fix"),
  directories: string[] = [];
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
const catalog = CafeCatalog.loadDefault();

afterEach(async () => {
  for (const directory of directories.splice(0)) {
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(`${root}${path.sep}`) ||
      !path.basename(resolved).startsWith("cafe-default-")
    )
      throw new Error("Unsafe café test cleanup target");
    await rm(resolved, { recursive: true, force: true });
  }
});

async function fixture() {
  const directory = await mkdtemp(path.join(root, "cafe-default-"));
  directories.push(directory);
  const filePath = path.join(directory, "state.json");
  let store = new JsonStore({ filePath, initialState: makeInitialState(), logger });
  await store.initialize();
  let players = new PlayerRepository({ store, defaults, logger });
  return {
    get store() {
      return store;
    },
    get players() {
      return players;
    },
    /** Restart the server on the same save file, then log in again. */
    async login(): Promise<Player> {
      await store.flush();
      store = new JsonStore({ filePath, initialState: makeInitialState(), logger });
      await store.initialize();
      players = new PlayerRepository({ store, defaults, logger });
      return players.getOrCreate("tester");
    },
  };
}

/** Seat items in the business room: furniture Type 100 with business points. */
function seats(player: Player): CafeFurnitureState[] {
  return (player.cafe.furniture ?? []).filter(
    (item) =>
      item.roomId === 1 &&
      catalog.furniture(item.templateId)?.Type === 100 &&
      item.bizcount > 0,
  );
}

function native(objId: number): CafeFurnitureState {
  return {
    templateId: objId,
    objId,
    parentId: 0,
    roomId: 1,
    pose: {
      templateId: objId,
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
}

describe("default café furniture", () => {
  it("loads the server table, which equals café themes 1 and 2", () => {
    const rows = catalog.defaultItems();
    expect(rows).toHaveLength(13);
    const themes = [catalog.theme(1)!, catalog.theme(2)!];
    expect(themes.map((theme) => theme.Area)).toEqual([1, 2]);
    expect(
      rows.map((row) => [
        row.Room,
        row.ItemId,
        row.parentTemplateId,
        row.posX,
        row.posY,
        row.rotate,
      ]),
    ).toEqual(
      themes.flatMap((theme) =>
        theme.poses.map((pose) => [
          theme.Area,
          pose.templateId,
          pose.parentTemplateId,
          pose.posX,
          pose.posY,
          pose.rotate,
        ]),
      ),
    );
    expect(rows.filter((row) => row.BizCount > 0).map((row) => row.ItemId)).toEqual([
      101, 101, 101, 101,
    ]);
  });

  it("gives a new player the 13 default items with 4 usable seats", async () => {
    const f = await fixture();
    const player = await f.players.getOrCreate("tester");
    const furniture = player.cafe.furniture!;
    expect(furniture).toHaveLength(13);
    expect(furniture.map((item) => item.objId)).toEqual(
      Array.from({ length: 13 }, (_, index) => 10_000 + index),
    );
    expect(furniture.map((item) => item.templateId)).toEqual([
      401, 501, 505, 101, 101, 101, 101, 501, 401, 703, 704, 705, 706,
    ]);
    for (const item of furniture) {
      expect(isNativeFixedHouseObjectId(item.objId)).toBe(false);
      expect(isNativeFixedHouseObjectId(item.parentId)).toBe(true);
      expect(item.pose).toMatchObject({
        templateId: item.templateId,
        parentTemplateId: item.parentId,
      });
      expect(item.isNew).toBe(false);
    }
    expect(furniture.find((item) => item.objId === 10_003)).toMatchObject({
      templateId: 101,
      parentId: 2,
      roomId: 1,
      pose: { posX: 5, posY: 23, rotate: 180 },
      bizcount: 1,
    });
    const seated = seats(player);
    expect(seated.map((item) => item.objId)).toEqual([10_003, 10_004, 10_005, 10_006]);
    // NCafe.FixNoSeatProblem registers seat objId * 10 + biz point index.
    for (const item of seated)
      expect(validCafeSeat(player, item.objId * 10, catalog)).toBe(true);
    expect(player.cafe.rooms).toEqual([
      {
        roomId: 1,
        girlIds: [],
        friendGirlId: 0,
        themeId: 0,
        furnitureIds: [
          10_000, 10_001, 10_002, 10_003, 10_004, 10_005, 10_006, 10_007, 10_008,
        ],
      },
      {
        roomId: 2,
        girlIds: [],
        friendGirlId: 0,
        themeId: 0,
        furnitureIds: [10_009, 10_010, 10_011, 10_012],
      },
      { roomId: 6, girlIds: [], friendGirlId: 0, themeId: 0, furnitureIds: [] },
    ]);
    const again = await f.login();
    expect(again.cafe.furniture).toEqual(furniture);
  });

  it("seeds an existing empty café once and never duplicates it on later loads", async () => {
    for (const empty of [undefined, []] as const) {
      const f = await fixture();
      await f.players.getOrCreate("tester");
      // A save written before this fix: no marker, no furniture, but room rows.
      await f.store.update((state) => {
        const cafe = state.players.tester!.cafe;
        delete cafe.defaultFurnitureSeeded;
        if (empty === undefined) delete cafe.furniture;
        else cafe.furniture = [];
        cafe.rooms = [
          { roomId: 1, girlIds: [7], friendGirlId: 0, themeId: 0, furnitureIds: [] },
        ];
      });
      const seeded = await f.login();
      expect(seeded.cafe.defaultFurnitureSeeded).toBe(true);
      expect(seeded.cafe.furniture).toHaveLength(13);
      expect(seats(seeded)).toHaveLength(4);
      expect(seeded.cafe.rooms!.map((room) => room.roomId)).toEqual([1, 2, 6]);
      expect(seeded.cafe.rooms![0]!.girlIds).toEqual([7]);
      expect(seeded.cafe.rooms![0]!.furnitureIds).toHaveLength(9);
      const reloaded = await f.login();
      expect(reloaded.cafe.furniture).toEqual(seeded.cafe.furniture);
      expect(reloaded.cafe.rooms).toEqual(seeded.cafe.rooms);
    }
  });

  it("treats a café that holds only native fixed objects as empty", async () => {
    const f = await fixture();
    await f.players.getOrCreate("tester");
    await f.store.update((state) => {
      const cafe = state.players.tester!.cafe;
      delete cafe.defaultFurnitureSeeded;
      cafe.furniture = [native(2), native(58)];
    });
    const player = await f.login();
    expect(player.cafe.furniture!.map((item) => item.objId)).toEqual([
      2,
      58,
      ...Array.from({ length: 13 }, (_, index) => 10_000 + index),
    ]);
    expect(seats(player)).toHaveLength(4);
  });

  it("leaves owned furniture alone and does not seed again after the player removes it", async () => {
    const f = await fixture();
    const owned = { ...native(0), templateId: 102, objId: 10_000, parentId: 0 };
    owned.pose = { ...owned.pose, templateId: 102 };
    await f.players.getOrCreate("tester");
    await f.store.update((state) => {
      const cafe = state.players.tester!.cafe;
      delete cafe.defaultFurnitureSeeded;
      cafe.furniture = [owned];
    });
    const kept = await f.login();
    expect(kept.cafe.furniture).toEqual([owned]);
    expect(kept.cafe.defaultFurnitureSeeded).toBe(true);
    await f.store.update((state) => {
      state.players.tester!.cafe.furniture = [];
    });
    const emptied = await f.login();
    expect(emptied.cafe.furniture).toEqual([]);
  });
});
