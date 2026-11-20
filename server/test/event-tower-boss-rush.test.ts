import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  BOSS_RUSH_TASK,
  EventTowerCatalog,
  eventTowerErrorReply,
  parseEventTowerCall,
} from "../src/game-data/event-tower-data.js";
import {
  TowerFixture,
  account,
  setTask,
  task,
  towerRequest,
} from "./helpers/event-tower-fixture.js";

const catalog = EventTowerCatalog.loadDefault();
const fixtures = new TowerFixture();
afterEach(() => fixtures.cleanup());

const SP_LEVELS = [5, 6, 7, 8];
const select = (level: number, boss: number) => towerRequest(510, [level, boss]);
const formation = () => towerRequest(511, {});
const reset = () => towerRequest(512, {});
const result = (body: Record<string, unknown>) => towerRequest(513, body);
const group = 64;

describe("boss rush requests and tables", () => {
  it("know the four SP levels and the four picks of the tables", () => {
    expect(catalog.bossRushSpLevels().map((level) => level.levelId)).toEqual(SP_LEVELS);
    expect([...catalog.bossRushBosses].sort()).toEqual([1, 2, 3, 4]);
    expect(BOSS_RUSH_TASK).toMatchObject({ saved: 60003, hp: 60010, shield: 60020 });
  });

  it("read 510 to 513 as UI_SixteenthTower, the team screen and the result popup send them", () => {
    expect(parseEventTowerCall({ sCmd: 510, tbParam: [6, 3] })?.request).toEqual({
      command: 510,
      towerId: 16,
      levelId: 6,
      boss: 3,
    });
    expect(parseEventTowerCall({ sCmd: 511, tbParam: {} })?.request).toEqual({
      command: 511,
      towerId: 16,
    });
    expect(parseEventTowerCall({ sCmd: 512, tbParam: [] })?.request).toEqual({
      command: 512,
      towerId: 16,
    });
    // blood has holes for the teams that did not fight; passTime is GameUsedTime and may be fractional.
    const sparse = parseEventTowerCall({
      sCmd: 513,
      tbParam: {
        bSave: true,
        tbResult: {
          blood: [null, 40, null, 70],
          shield: 55.2,
          passTime: 123.4,
          LevelId: 7,
          tbBloodMax: [1, 2],
          shieldMax: 9,
        },
      },
    })?.request;
    expect(sparse).toEqual({
      command: 513,
      towerId: 16,
      save: true,
      levelId: 7,
      passTime: 123.4,
      blood: [null, 40, null, 70],
      shield: 55.2,
    });
    const keyed = parseEventTowerCall({
      sCmd: 513,
      tbParam: {
        bSave: true,
        tbResult: { blood: { "2": 40 }, LevelId: 5, passTime: 9 },
      },
    })?.request;
    expect(keyed).toMatchObject({ blood: [null, 40], passTime: 9, shield: 0 });
    const cancelled = parseEventTowerCall({
      sCmd: 513,
      tbParam: { bSave: false, tbResult: { LevelId: 5 } },
    })?.request;
    expect(cancelled).toMatchObject({ save: false, blood: [] });
    for (const command of [510, 511, 512, 513])
      expect(eventTowerErrorReply(towerRequest(command, {}), 2)).toEqual({});
  });
});

describe("boss rush SP stage", () => {
  async function allPicked() {
    const made = await fixtures.create();
    for (const [index, level] of SP_LEVELS.entries())
      expect(
        (
          await made.repository.handleEventTowerRequest(
            account,
            select(level, index + 1),
          )
        ).rejected,
      ).toBeNull();
    return made;
  }

  it("stores the picked boss of each SP level and refuses a level or boss that does not exist", async () => {
    const { repository } = await fixtures.create();
    const picked = await repository.handleEventTowerRequest(account, select(6, 3));
    expect(picked.response).toEqual({});
    expect(picked.rejected).toBeNull();
    expect(task(repository.get(account)!, group, 60206)).toBe(3);

    const before = JSON.stringify(repository.get(account));
    for (const bad of [select(2, 1), select(6, 9), select(6, 0), select(999, 1)]) {
      const refused = await repository.handleEventTowerRequest(account, bad);
      expect(refused.rejected?.reason).toBe("unknown_sp_boss");
      expect(refused.response).toEqual({});
    }
    expect(JSON.stringify(repository.get(account))).toBe(before);
  });

  it("saves the teams only when every SP level has a boss, at full health, and keeps resent saves harmless", async () => {
    const { repository } = await fixtures.create();
    await repository.handleEventTowerRequest(account, select(5, 1));
    const early = await repository.handleEventTowerRequest(account, formation());
    expect(early.rejected?.reason).toBe("sp_bosses_not_picked");
    expect(early.response).toEqual({});
    expect(task(repository.get(account)!, group, BOSS_RUSH_TASK.saved)).toBe(0);

    const made = await allPicked();
    const saved = await made.repository.handleEventTowerRequest(account, formation());
    expect(saved.response).toEqual({});
    expect(saved.rejected).toBeNull();
    const player = made.repository.get(account)!;
    expect(task(player, group, 60003)).toBe(1);
    for (let team = 1; team <= 5; team++) {
      expect(task(player, group, 60010 + team)).toBe(100);
      expect(task(player, group, 60020 + team)).toBe(100);
    }
    // The pick is locked from here on.
    const locked = await made.repository.handleEventTowerRequest(account, select(5, 2));
    expect(locked.rejected?.reason).toBe("teams_already_saved");
    expect(task(made.repository.get(account)!, group, 60205)).toBe(1);
  });

  it("writes the health of the teams that fought, skips the holes, and keeps a sub-second clear as 1", async () => {
    const { repository } = await allPicked();
    await repository.handleEventTowerRequest(account, formation());
    const saved = await repository.handleEventTowerRequest(
      account,
      result({
        bSave: true,
        tbResult: {
          blood: [null, 40, null, 70],
          shield: 55.4,
          passTime: 0.4,
          LevelId: 5,
        },
      }),
    );
    expect(saved.response).toEqual({});
    expect(saved.rejected).toBeNull();
    const player = repository.get(account)!;
    expect(task(player, group, 60011)).toBe(100); // a hole keeps the old value
    expect(task(player, group, 60012)).toBe(40);
    expect(task(player, group, 60013)).toBe(100);
    expect(task(player, group, 60014)).toBe(70);
    expect(task(player, group, 60015)).toBe(100);
    expect(task(player, group, 60022)).toBe(55);
    expect(task(player, group, 60024)).toBe(55);
    expect(task(player, group, 60021)).toBe(100);
    expect(task(player, group, 60305)).toBe(1);

    // A result the player does not keep writes nothing and is still answered.
    const before = JSON.stringify(repository.get(account));
    const dropped = await repository.handleEventTowerRequest(
      account,
      result({
        bSave: false,
        tbResult: { blood: [1, 1, 1, 1, 1], shield: 1, passTime: 99, LevelId: 6 },
      }),
    );
    expect(dropped.response).toEqual({});
    expect(dropped.rejected).toBeNull();
    expect(JSON.stringify(repository.get(account))).toBe(before);

    // A result for a level that is not an SP level is refused, health is clamped to 0..100.
    const wrong = await repository.handleEventTowerRequest(
      account,
      result({ bSave: true, tbResult: { blood: [5], LevelId: 2, passTime: 3 } }),
    );
    expect(wrong.rejected?.reason).toBe("unknown_sp_level");
    await repository.handleEventTowerRequest(
      account,
      result({
        bSave: true,
        tbResult: { blood: [-5, 250], shield: 140, passTime: 61, LevelId: 6 },
      }),
    );
    const clamped = repository.get(account)!;
    expect(task(clamped, group, 60011)).toBe(0);
    expect(task(clamped, group, 60012)).toBe(100);
    expect(task(clamped, group, 60021)).toBe(100);
    expect(task(clamped, group, 60306)).toBe(61);

    // A resent 511 must not heal the teams.
    await repository.handleEventTowerRequest(account, formation());
    expect(task(repository.get(account)!, group, 60011)).toBe(0);
  });

  it("resets the SP stage: picks, times, teams and health, but not the TSP time or the clear counts", async () => {
    const { repository, store } = await allPicked();
    await repository.handleEventTowerRequest(account, formation());
    await repository.handleEventTowerRequest(
      account,
      result({
        bSave: true,
        tbResult: { blood: [10, 20], shield: 5, passTime: 30, LevelId: 5 },
      }),
    );
    // The TSP level's time and the SP clear counts live in other slots.
    await store.update((state) => {
      setTask(state.players[account]!, group, 60310, 77);
      setTask(state.players[account]!, group, 60105, 2);
    });
    expect(task(repository.get(account)!, group, 60305)).toBe(30);

    const done = await repository.handleEventTowerRequest(account, reset());
    expect(done.response).toEqual({});
    expect(done.rejected).toBeNull();
    const player = repository.get(account)!;
    expect(task(player, group, 60003)).toBe(0);
    for (const level of SP_LEVELS) {
      expect(task(player, group, 60200 + level)).toBe(0);
      expect(task(player, group, 60300 + level)).toBe(0);
    }
    for (let team = 1; team <= 5; team++) {
      expect(task(player, group, 60010 + team)).toBe(100);
      expect(task(player, group, 60020 + team)).toBe(100);
    }
    expect(task(player, group, 60310)).toBe(77);
    expect(task(player, group, 60105)).toBe(2);
    // After the reset the player may pick again.
    expect(
      (await repository.handleEventTowerRequest(account, select(5, 4))).rejected,
    ).toBeNull();
  });
});

const luaDirectory = process.env.GCG_CLIENT_LUA_DIR ?? "";
describe.skipIf(!luaDirectory || !existsSync(luaDirectory))(
  "boss rush task slots against the client Lua",
  () => {
    it("match SixteenthTowerLogic", () => {
      const source = readFileSync(
        path.join(luaDirectory, "sixteenthtowerlogic.lua.txt"),
        "utf8",
      );
      const slot = (name: string): number =>
        Number(source.match(new RegExp(name + "[ ]*=[ ]*([0-9]+)"))![1]);
      expect(BOSS_RUSH_TASK).toEqual({
        saved: slot("nTask_SaveFormation"),
        hp: slot("nTask_PlayerHp"),
        shield: slot("nTask_PlayerShield"),
        spLevel: slot("nTask_SpLevelId"),
        spTime: slot("nTask_SpPassTime"),
      });
      expect(slot("nTaskGroup")).toBe(group);
    });
  },
);
