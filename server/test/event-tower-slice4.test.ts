import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  EVENT_MISSION_GROUP,
  EventMissionCatalog,
  MISSION_COUNTER,
  bumpMission,
  missionDay,
  refreshEventMissions,
} from "../src/game-data/event-mission-data.js";
import { makeTowerTaskId } from "../src/game-data/event-tower-data.js";
import {
  CHESS_TASK,
  MUSIC_TASK,
  NAMED_FAMILIES,
  NAMED_LOG_COMMANDS,
  NamedTowerCatalog,
  namedTowerErrorReply,
  namedTowerReadOnly,
  parseNamedTowerCall,
} from "../src/game-data/named-tower-data.js";
import {
  account,
  current,
  five,
  fixture,
  money,
  named,
  reply,
  task,
} from "./helpers/named-fixture.js";

describe("slice 4 tables and requests", () => {
  const catalog = NamedTowerCatalog.loadDefault();

  it("loads the concert, exchange and war chess tables", () => {
    expect(catalog.levels.get("music")!.size).toBe(58);
    expect(catalog.level("music", 0, 16, 3)?.type).toBe(1);
    // Main and sub levels of MusicTower.txt: 13 and 14 hang under issue 1, 36 and 37 under issue 2.
    expect(catalog.musicIssueOfLevel.get(13)).toBe(1);
    expect(catalog.musicIssueOfLevel.get(71)).toBe(1);
    expect(catalog.musicIssueOfLevel.get(36)).toBe(2);
    expect(catalog.exchangeSeasons.get(1)?.collections).toEqual([
      [37, 1],
      [38, 1],
      [39, 1],
      [40, 1],
    ]);
    expect(catalog.exchangeRewards.filter(({ type }) => type === 1)).toHaveLength(18);
    expect(catalog.chessMaps.size).toBe(20);
    expect(catalog.chessBosses.size).toBe(64);
    expect(catalog.chessMaps.get("1:1:1")).toMatchObject({
      columns: 5,
      rows: 5,
      cafe: [3, 3],
      bosses: [
        [5, 1, 65],
        [0, 4, 66],
      ],
    });
    expect(catalog.chessItems.get("1:4")).toEqual({ gdpl: [6, 11, 4, 1], skill: 4 });
    expect(catalog.level("chess", 1, 25, 0)?.type).toBe(1);
  });

  it("loads the mission tables", () => {
    const missions = EventMissionCatalog.loadDefault();
    expect(missions.mission(EVENT_MISSION_GROUP.music, 4)).toMatchObject({
      type: 192,
      counts: [1, 19, 3],
      required: 3,
      daily: true,
    });
    expect(missions.mission(EVENT_MISSION_GROUP.month, 18)).toMatchObject({
      type: 259,
      required: 20,
      daily: false,
    });
    expect(missions.spentMoney.has(85)).toBe(true);
  });

  it("parses every new command, also inside DoSettle", () => {
    expect(
      named(371, { nType: 19, nLevelId: 13, nDiff: 1, nFormationId: 1 }),
    ).toMatchObject({
      kind: "enter",
      family: "music",
      levelId: 13,
    });
    expect(named(372, { nType: 19, nLevelId: 13, nDiff: 1 }, true)).toMatchObject({
      kind: "pass",
      family: "music",
    });
    expect(named(536, { nId: 1, nLevelId: 9, nFormationId: 1 })).toMatchObject({
      kind: "enter",
      family: "chess",
      towerId: 1,
    });
    expect(named(374, { Type: 1, nId: 3 })).toMatchObject({
      kind: "mission",
      group: 70,
      ids: [3],
    });
    expect(named(436, { Type: 2, tbList: [1, null, 4] })).toMatchObject({
      kind: "mission",
      group: 85,
      type: 2,
      ids: [1, 4],
    });
    expect(named(381, { TypeId: 2, Type: 1 })).toMatchObject({
      kind: "exchange",
      op: "listing",
      cancel: true,
    });
    expect(named(388, { gameId: 3, score: 900, type: 4, nCombo: 50 })).toMatchObject({
      kind: "musicGame",
      op: "complete",
      score: 900,
      rating: 4,
    });
    expect(named(539, { nType: 3, teamId: 1, gridId: 4 })).toMatchObject({
      kind: "chess",
    });
    expect(named(354, {})).toMatchObject({ kind: "fan" });
    expect([...NAMED_LOG_COMMANDS].sort()).toEqual([223, 282, 391]);
    expect(parseNamedTowerCall({ sCmd: 138, tbParam: [0, 0, 0, 0, 0] })).toBeNull();
  });

  it("answers refusals with the shape each screen reads", () => {
    expect(namedTowerErrorReply(named(374, { Type: 1, nId: 3 }), 20003)).toEqual({
      Error: 20003,
      Type: 1,
    });
    expect(namedTowerErrorReply(named(380, {}), 20045)).toEqual({ tbData: [] });
    expect(namedTowerErrorReply(named(383, {}), 20045)).toEqual({ tbList: [] });
    expect(namedTowerErrorReply(named(382, {}), 20043)).toEqual({
      Error: 20043,
      Type: 0,
      TypeId: 0,
    });
    expect(namedTowerErrorReply(named(539, { nType: 3 }), 5)).toEqual({
      nType: 3,
      nError: 5,
    });
    expect(namedTowerErrorReply(named(354, {}), 0)).toEqual({ tbNewGirlList: [] });
    // 380 rolls the day of the listing counter, so it is not read-only; the log is.
    expect(namedTowerReadOnly(named(380, {}))).toBe(false);
    expect(namedTowerReadOnly(named(383, {}))).toBe(true);
    expect(namedTowerReadOnly(named(382, {}))).toBe(false);
    expect(namedTowerReadOnly(named(389, {}))).toBe(true);
    expect(namedTowerReadOnly(named(388, { gameId: 1, score: 1 }))).toBe(false);
  });
});

describe("concert tower fights", () => {
  it("plays a normal level: enter echoes nType, the pass pays once and records the difficulty bit", async () => {
    const { repository } = await fixture();
    const entered = await repository.handleNamedTowerRequest(
      account,
      named(371, { nType: 19, nLevelId: 13, nDiff: 1, nFormationId: 1 }),
    );
    expect(reply(entered).tbData).toEqual({ nType: 19, nLevelId: 13, nDiff: 1 });
    const pass = named(
      372,
      { nType: 19, nLevelId: 13, nDiff: 1, nFormationId: 1, nScore: 5 },
      true,
    );
    const first = await repository.handleNamedTowerRequest(account, pass);
    expect(five(reply(first).tbData)).toContainEqual([9, 4, 1, 3, 1]);
    expect(task(current(repository), 64, 4100 + 13)).toBe(1);
    expect(money(current(repository), 1)).toBe(90);
    // The client resends a settlement until it hears back: the stored reply comes back, nothing is paid twice.
    const again = await repository.handleNamedTowerRequest(account, pass);
    expect(again.response).toEqual(first.response);
    expect(money(current(repository), 1)).toBe(90);
  });

  it("plays a fixed-team (Dr) level without a formation and without vigour", async () => {
    const { repository } = await fixture();
    const entered = await repository.handleNamedTowerRequest(
      account,
      named(371, { nType: 19, nLevelId: 17, nDiff: 1 }),
    );
    expect(entered.rejected).toBeNull();
    const passed = await repository.handleNamedTowerRequest(
      account,
      named(372, { nType: 19, nLevelId: 17, nDiff: 1, nScore: 3 }, true),
    );
    expect(five(reply(passed).tbData)).toContainEqual([15, 2, 1, 1, 20]);
    expect(task(current(repository), 64, 4100 + 17)).toBe(1);
  });

  it("refuses the relay and music select nodes", async () => {
    const { repository } = await fixture();
    for (const levelId of [54, 73]) {
      const result = await repository.handleNamedTowerRequest(
        account,
        named(371, { nType: 19, nLevelId: levelId, nDiff: 1 }),
      );
      expect(result.rejected?.code).toBe(2);
      expect(reply(result).nError).toBe(2);
    }
  });

  it("pays the interest level by score on every run and uses up its ticket", async () => {
    const { repository, store } = await fixture();
    const enter = named(371, { nType: 21, nLevelId: 71, nDiff: 1, nFormationId: 5000 });
    // No ticket: tbErrorCode.Exhaust.
    const none = await repository.handleNamedTowerRequest(account, enter);
    expect(none.rejected?.code).toBe(11);
    await store.update((state) => {
      state.players[account]!.taskValues[String(makeTowerTaskId(1, 554))] = 1;
    });
    const entered = await repository.handleNamedTowerRequest(account, enter);
    expect(reply(entered).tbData).toEqual({ nType: 21, nLevelId: 71, nDiff: 1 });
    const passed = await repository.handleNamedTowerRequest(
      account,
      named(
        372,
        { nType: 21, nLevelId: 71, nDiff: 1, nFormationId: 5000, nScore: 65 },
        true,
      ),
    );
    // Score 65 reaches the 30 and 60 steps (20 tokens each) and the fixed 80.
    expect(five(reply(passed).tbData)).toEqual(
      expect.arrayContaining([
        [15, 66, 1, 1, 40],
        [15, 66, 1, 1, 80],
      ]),
    );
    expect(money(current(repository), 41)).toBe(120);
    expect(task(current(repository), 1, 555)).toBe(1);
    expect(task(current(repository), 1, 556)).toBe(65);
    const again = await repository.handleNamedTowerRequest(account, enter);
    expect(again.rejected?.code).toBe(11);
  });
});

describe("event missions", () => {
  it("keeps daily counters per day and resets daily mission values at the day line", () => {
    const missions = EventMissionCatalog.loadDefault();
    const player = {
      taskValues: {} as Record<string, number>,
      money: [],
      inventory: [],
    } as Parameters<typeof refreshEventMissions>[0];
    const noon = Date.UTC(2026, 10, 20, 6, 0, 0);
    refreshEventMissions(player, missions, noon);
    bumpMission(player, MISSION_COUNTER.vigour(70), 120);
    refreshEventMissions(player, missions, noon);
    const key = String((70 << 16) | 1);
    // Mission 1 (daily, spend 100 vigour) is done: progress 120, not claimed.
    expect(player.taskValues[key]).toBe(240);
    // Claimed, then the next day: the daily mission starts again.
    player.taskValues[key] = 241;
    refreshEventMissions(player, missions, noon + 86_400_000);
    expect(player.taskValues[key]).toBe(0);
    expect(missionDay(noon + 86_400_000)).toBe(missionDay(noon) + 1);
    // Progress of a one-time mission stays.
    bumpMission(player, MISSION_COUNTER.gain(41), 3_000);
    refreshEventMissions(player, missions, noon + 86_400_000);
    expect(player.taskValues[String((70 << 16) | 28)]).toBe(6_000);
  });
});

describe("claims, exchange, music game and the chess board", () => {
  it("claims event missions: single, list, twice, unknown", async () => {
    const { repository, store } = await fixture();
    await store.update((state) => {
      state.players[account]!.eventMissions = {
        day: missionDay(Date.now()),
        total: { "vigour:70": 250, "vigour:85": 250 },
        today: { "vigour:70": 250, "vigour:85": 250 },
      };
    });
    const one = await repository.handleNamedTowerRequest(
      account,
      named(374, { Type: 1, nId: 1 }),
    );
    expect(one.rejected).toBeNull();
    expect(reply(one)).toEqual({ Type: 1, tbItem: [[15, 60, 1, 1, 100]] });
    expect(money(current(repository), 36)).toBe(100);
    const twice = await repository.handleNamedTowerRequest(
      account,
      named(374, { Type: 1, nId: 1 }),
    );
    expect(reply(twice)).toEqual({ Error: 20005, Type: 1 });
    const unknown = await repository.handleNamedTowerRequest(
      account,
      named(374, { Type: 1, nId: 999 }),
    );
    expect(reply(unknown)).toEqual({ Error: 20002, Type: 1 });
    const early = await repository.handleNamedTowerRequest(
      account,
      named(374, { Type: 1, nId: 4 }),
    );
    expect(reply(early)).toEqual({ Error: 20003, Type: 1 });
    const list = await repository.handleNamedTowerRequest(
      account,
      named(374, { Type: 1, tbList: [1, 2, 4] }),
    );
    expect(reply(list).tbItem).toEqual([[15, 60, 1, 1, 250]]);
    expect(money(current(repository), 36)).toBe(350);
    // 436 reads group 85 (its mission 1 asks for 150 vigour).
    const month = await repository.handleNamedTowerRequest(
      account,
      named(436, { Type: 1, nId: 1 }),
    );
    expect(reply(month)).toEqual({ Type: 1, tbItem: [[15, 125, 1, 1, 1]] });
    expect(task(current(repository), 85, 1)).toBe(2 * 250 + 1);
  });

  it("feeds missions from the concert fights", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(
      account,
      named(371, { nType: 19, nLevelId: 14, nDiff: 1, nFormationId: 1 }),
    );
    await repository.handleNamedTowerRequest(
      account,
      named(
        372,
        {
          nType: 19,
          nLevelId: 14,
          nDiff: 1,
          nFormationId: 1,
          tbKillMonster: { totalkillMonster: 40 },
        },
        true,
      ),
    );
    const player = current(repository);
    // Mission 1: 20 vigour spent so far. Mission 4 (192 [1,19,3]): one ACT clear of issue 1.
    expect(task(player, 70, 1) >>> 1).toBe(20);
    expect(task(player, 70, 4) >>> 1).toBe(1);
    expect(player.eventMissions?.total["kills:70:1"]).toBe(40);
  });

  it("serves the concert exchange: refresh, listing, award", async () => {
    const { repository, store } = await fixture({
      money: { 37: 1, 38: 1, 39: 1, 40: 1 },
    });
    await store.update((state) => {
      state.players[account]!.taskValues[String(makeTowerTaskId(74, 1))] = 1;
    });
    expect(
      reply(await repository.handleNamedTowerRequest(account, named(380, {}))).tbData,
    ).toEqual([]);
    expect(
      reply(await repository.handleNamedTowerRequest(account, named(383, {}))).tbList,
    ).toEqual([]);
    const listed = await repository.handleNamedTowerRequest(
      account,
      named(381, { TypeId: 2, Type: 0 }),
    );
    expect(reply(listed)).toEqual({ Error: 0, Type: 0, TypeId: 2 });
    expect(task(current(repository), 74, 3)).toBe(4);
    const twice = await repository.handleNamedTowerRequest(
      account,
      named(381, { TypeId: 2, Type: 0 }),
    );
    expect(twice.rejected?.code).toBe(20045);
    await repository.handleNamedTowerRequest(
      account,
      named(381, { TypeId: 2, Type: 1 }),
    );
    expect(task(current(repository), 74, 3)).toBe(0);
    const award = await repository.handleNamedTowerRequest(account, named(382, {}));
    const items = reply(award).Items as number[][];
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual([11, 21, 13, 3, 1]);
    for (const id of [37, 38, 39, 40]) expect(money(current(repository), id)).toBe(0);
    expect(task(current(repository), 74, 2)).toBe(1);
    expect(task(current(repository), 74, 10)).toBe(2);
    const short = await repository.handleNamedTowerRequest(account, named(382, {}));
    expect(reply(short)).toEqual({ Error: 20043, Type: 0, TypeId: 0 });
    const give = await repository.handleNamedTowerRequest(
      account,
      named(384, { TypeId: 1, RoleId: 9 }),
    );
    expect(reply(give)).toEqual({ Error: 20122, TypeId: 1, RoleId: 9 });
  });

  it("keeps the music game scores and answers the rank calls", async () => {
    const { repository } = await fixture();
    await repository.handleNamedTowerRequest(
      account,
      named(388, { gameId: 2, score: 900, type: 3, nCombo: 5 }),
    );
    await repository.handleNamedTowerRequest(
      account,
      named(388, { gameId: 2, score: 100, type: 1, nCombo: 5 }),
    );
    expect(task(current(repository), 1, 3102)).toBe(900);
    expect(current(repository).eventMissions?.total["rating:3"]).toBe(1);
    expect(current(repository).eventMissions?.total.musicgame).toBe(2);
    const rank = await repository.handleNamedTowerRequest(
      account,
      named(389, { isAll: true }),
    );
    expect(rank.response).toEqual([null, { pos: 0, score: 900 }]);
    const friends = await repository.handleNamedTowerRequest(
      account,
      named(390, { gameId: 2 }),
    );
    expect(friends.response).toEqual({ musicId: 2, tbList: [] });
    expect(
      (await repository.handleNamedTowerRequest(account, named(354, {}))).response,
    ).toEqual({
      tbNewGirlList: [],
    });
  });

  it("plays a war chess map: start, move, round, boss attack and the pushed fight", async () => {
    const { repository } = await fixture();
    const chess = (body: Record<string, unknown>) =>
      repository.handleNamedTowerRequest(account, named(539, body));
    // Birth cells of map 1 are (2,2) and (4,4): grid = x + 1 + y * 6.
    expect(
      reply(await chess({ nType: 1, id: 1, mapId: 1, diff: 1, team1: 15, team2: 16 }))
        .nError,
    ).toBe(3);
    expect(
      reply(await chess({ nType: 1, id: 1, mapId: 1, diff: 2, team1: 15, team2: 29 }))
        .nError,
    ).toBe(1);
    const started = await chess({
      nType: 1,
      id: 1,
      mapId: 1,
      diff: 1,
      team1: 15,
      team2: 29,
    });
    expect(reply(started)).toEqual({ nType: 1 });
    let player = current(repository);
    expect(task(player, 97, 500 + 15)).toBe(3);
    expect(task(player, 97, 500 + 29)).toBe(4);
    expect(task(player, 97, 500 + 12)).toBe(6);
    expect(task(player, 97, 500 + 22)).toBe(1);
    expect(task(player, 97, 201)).toBe(1 | (1 << 10) | (1 << 20));
    // Team 1 steps right; a second step this round, and a step that is not adjacent, are refused.
    expect(reply(await chess({ nType: 3, teamId: 1, gridId: 16 }))).toEqual({
      nType: 3,
    });
    expect(reply(await chess({ nType: 3, teamId: 1, gridId: 17 })).nError).toBe(4);
    expect(reply(await chess({ nType: 3, teamId: 2, gridId: 11 })).nError).toBe(4);
    // End the round: the boss round starts, the boss at grid 12 attacks team 1 at grid 16.
    await chess({ nType: 4 });
    const attack = await chess({
      nType: 5,
      tbMove: { bossIdx: 1, fromGrid: 12, aimGrid: 16 },
    });
    expect(reply(attack)).toEqual({ nType: 5 });
    expect(attack.pushes).toEqual([
      {
        command: 536,
        body: {
          tbData: { nId: 2, nLevelId: 25, nFormationId: 5106 },
          tbDrop: [],
          tbDropItems: [],
        },
      },
    ]);
    // The fight is settled inside DoSettle like any other: the boss is gone, the team stands on its grid.
    const passed = await repository.handleNamedTowerRequest(
      account,
      named(
        537,
        { nId: 2, nLevelId: 25, nFormationId: 5106, tbTeamState: [80, 90, 100, 100] },
        true,
      ),
    );
    expect(passed.rejected).toBeNull();
    player = current(repository);
    expect(task(player, 97, 500 + 12)).toBe(3);
    expect(task(player, 97, 500 + 16)).toBe(0);
    expect(task(player, 97, 204)).toBe(80 | (90 << 8) | (100 << 16) | (100 << 24));
    expect(task(player, 97, 300 + 1)).toBe(0);
    // The other boss moves on, then the next round starts.
    await chess({ nType: 5 });
    expect(task(current(repository), 97, 207) & 0xffff).toBe(2);
    expect(task(current(repository), 97, 202)).toBe(1 | (1 << 16));
    // Reset clears the board.
    await chess({ nType: 2 });
    expect(task(current(repository), 97, 201)).toBe(0);
    expect(reply(await chess({ nType: 8 })).tbInfo).toEqual({});
  });

  it("uses a war chess item once and answers a missing one", async () => {
    const { repository, store } = await fixture();
    const chess = (body: Record<string, unknown>) =>
      repository.handleNamedTowerRequest(account, named(539, body));
    await chess({ nType: 1, id: 1, mapId: 1, diff: 1, team1: 15, team2: 29 });
    expect(reply(await chess({ nType: 7, itemId: 1, teamIdx: 1 })).nError).toBe(5);
    await store.update((state) => {
      state.players[account]!.inventory.push({
        guid: 20,
        genre: 6,
        detail: 11,
        particular: 1,
        templateLevel: 1,
        count: 1,
        createTime: 1,
        enhanceLevel: 0,
        enhanceExp: 0,
        breakLevel: 0,
        lockOn: 0,
      });
    });
    expect(reply(await chess({ nType: 7, itemId: 1, teamIdx: 1 }))).toEqual({
      nType: 7,
    });
    expect(task(current(repository), 97, 202) & 0xffff).toBe(2);
    expect(task(current(repository), 97, 207) >>> 16).toBe(1);
    expect(reply(await chess({ nType: 7, itemId: 1, teamIdx: 1 })).nError).toBe(5);
  });
});

/** The constants are copied from the client scripts; GCG_CLIENT_LUA_DIR points at the decrypted ones. */
const luaDirectory = process.env.GCG_CLIENT_LUA_DIR ?? "";
describe.skipIf(!luaDirectory || !existsSync(luaDirectory))(
  "slice 4 layouts against the client Lua",
  () => {
    const lua = (name: string): string =>
      readFileSync(path.join(luaDirectory, `${name}.lua.txt`), "utf8");
    const value = (source: string, pattern: RegExp): number => {
      const match = source.match(pattern);
      if (!match) throw new Error(`Not found: ${pattern}`);
      return Number(match[1]);
    };

    it("concert tower: group 64, level records 4100, relay 6000 to 6999", () => {
      const source = lua("musicactivitylogic");
      expect(MUSIC_TASK.group).toBe(value(source, /tbLogic\.nGroup\s*=\s*(\d+)/));
      const offset = value(source, /local task_offset\s*=\s*(\d+)/);
      expect(MUSIC_TASK.pass).toBe(
        offset + value(source, /nTask_LevelPass\s*=\s*task_offset \+ (\d+)/),
      );
      expect(MUSIC_TASK.relay).toBe(value(source, /nTask_Relay\s*=\s*(\d+)/));
      expect(MUSIC_TASK.relayEnter).toBe(
        value(source, /nTask_Relay_Enter\s*=\s*(\d+)/),
      );
      expect(NAMED_FAMILIES.music.activityType).toBe(19);
      expect(value(source, /MusticInterestCanFightTimes\s*=\s*(\d+)/)).toBe(554);
      expect(value(source, /MusticInterestAlreadyFightTimes\s*=\s*(\d+)/)).toBe(555);
      expect(value(source, /MusticInterestMaxScore\s*=\s*(\d+)/)).toBe(556);
    });

    it("missions and exchange: groups 70, 85 and 74, tasks of the exchange", () => {
      expect(EVENT_MISSION_GROUP.music).toBe(
        value(lua("musicmission"), /Task_Group\s*=\s*(\d+)/),
      );
      expect(EVENT_MISSION_GROUP.month).toBe(
        value(lua("monthmission"), /Task_Group\s*=\s*(\d+)/),
      );
      const exchange = lua("concertexchange");
      expect(value(exchange, /TaskGroup\s*=\s*(\d+)/)).toBe(74);
      expect(value(exchange, /Id_Task\s*=\s*(\d+)/)).toBe(1);
      expect(value(exchange, /AwardNum_Task\s*=\s*(\d+)/)).toBe(2);
      expect(value(exchange, /ListingFlag_Task\s*=\s*(\d+)/)).toBe(3);
      expect(value(exchange, /ListingNum_Task\s*=\s*(\d+)/)).toBe(4);
      expect(value(exchange, /RareReward_Task\s*=\s*(\d+)/)).toBe(10);
    });

    it("war chess: group 97 and the board tasks", () => {
      const source = lua("warchesstower");
      const taskOf = (name: string): number =>
        value(source, new RegExp(`WarChessTower\\.${name}\\s*=\\s*(\\d+)`));
      expect(CHESS_TASK.group).toBe(taskOf("nTaskGroup"));
      expect(CHESS_TASK.pass).toBe(taskOf("nTask_LevelPass"));
      expect(CHESS_TASK.map).toBe(taskOf("nTask_MapId"));
      expect(CHESS_TASK.steps).toBe(taskOf("nTask_MoveStepNum"));
      expect(CHESS_TASK.fightCache).toBe(taskOf("nTask_BossFightCache"));
      expect(CHESS_TASK.teamHp[0]).toBe(taskOf("nTask_TeamHp1"));
      expect(CHESS_TASK.teamHp[1]).toBe(taskOf("nTask_TeamHp2"));
      expect(CHESS_TASK.bossMove).toBe(taskOf("nTask_BossMove"));
      expect(CHESS_TASK.round).toBe(taskOf("nTask_RoundNum"));
      expect(CHESS_TASK.freeze).toBe(taskOf("nTask_BossFreeze"));
      expect(CHESS_TASK.mapPass).toBe(taskOf("nTask_ChessMapPass"));
      expect(CHESS_TASK.minRound).toBe(taskOf("nTask_MinRoundNum"));
      expect(CHESS_TASK.bossHp).toBe(taskOf("nTask_BossHp"));
      expect(CHESS_TASK.mapScore).toBe(taskOf("nTask_MapScore"));
      expect(CHESS_TASK.grid).toBe(taskOf("nTask_GridState"));
      expect(CHESS_TASK.gridEnd).toBe(taskOf("nTask_GridStateEnd"));
      expect(CHESS_TASK.maxMaps).toBe(taskOf("MaxMapCount"));
    });
  },
);
