import { once } from "node:events";
import { rm } from "node:fs/promises";
import { createConnection, type Server, type Socket } from "node:net";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  CLUB_BOSS_GRID_AWARD_TASK_BASE,
  CLUB_BOSS_OK,
  CLUB_BOSS_SEASON_ANCHOR,
  CLUB_BOSS_SEASON_SECONDS,
  LUA_COMMAND_CLUB_BOSS_CHECK_IN,
  LUA_COMMAND_CLUB_BOSS_END,
  LUA_COMMAND_CLUB_BOSS_ENTER,
  LUA_COMMAND_CLUB_BOSS_GRID_AWARD,
  LUA_COMMAND_CLUB_BOSS_PARTICIPATE_AWARD,
  LUA_COMMAND_CLUB_BOSS_RANK,
  LUA_COMMAND_CLUB_BOSS_SAVE,
  LUA_COMMAND_DO_SETTLE,
} from "../src/game-data/club-boss-data.js";
import {
  clubBossStage,
  isClubBossGridOpen,
} from "../src/game-data/club-boss-tables.js";
import { MONEY_CLUB_COIN } from "../src/game-data/club-data.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  makeInitialState,
  MONEY_DIAMOND,
  PlayerRepository,
} from "../src/persistence/player-repository.js";
import { COMMAND } from "../src/protocol/commands.js";
import { makeServerLuaCall } from "../src/protocol/messages.js";
import {
  HEADER_SIZE,
  makePacket,
  readPacket,
  type GamePacket,
} from "../src/protocol/packet.js";
import { decodeFields, fieldBytes, firstString } from "../src/protocol/protobuf.js";
import { createGatewayServer } from "../src/servers/gateway-server.js";
import { mkdtemp } from "./helpers/temp.js";

const account = "club-boss-wire:local-test";
const bareUsername = "club-boss-wire";
const scratchRoot = path.resolve(import.meta.dirname, "../../tools/club-wire");
const CREATE_REQUEST = { applylevel: 10, clubname: "GCG revival", autojoinlevel: 10 };
const DAY = 86_400_000;
/** Day 3 of the first season, 05:00 UTC+8: the fights are on. */
const FIGHT_DAY = CLUB_BOSS_SEASON_ANCHOR * 1_000 + 2 * DAY + 3_600_000;

function callback(packet: GamePacket): { method: string; parameters: unknown } | null {
  if (packet.command !== COMMAND.NTF_S2C_CALL) return null;
  const fields = decodeFields(packet.payload);
  return {
    method: firstString(fields, 1),
    parameters: JSON.parse(firstString(fields, 2)) as unknown,
  };
}

function luaReply(packets: readonly GamePacket[], command: number): unknown {
  for (const packet of packets) {
    const call = callback(packet);
    const parameters = call?.parameters as { sCmd?: number; tbParam?: unknown } | null;
    if (call?.method === "LuaCall" && parameters?.sCmd === command)
      return parameters.tbParam;
  }
  return undefined;
}

function request(
  socket: Socket,
  command: number,
  serial: number,
  payload: Buffer,
  finished: (packet: GamePacket) => boolean,
  wait = 5_000,
): Promise<GamePacket[]> {
  return new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0);
    const packets: GamePacket[] = [];
    const timeout = setTimeout(
      () => finish(new Error(`Timed out waiting for request ${command}/${serial}`)),
      wait,
    );
    function finish(error?: Error): void {
      clearTimeout(timeout);
      socket.off("data", onData);
      if (error) reject(error);
      else resolve(packets);
    }
    function onData(chunk: Buffer): void {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= HEADER_SIZE) {
        const size = pending.readUInt32LE(4);
        if (pending.length < size) return;
        const packet = readPacket(pending.subarray(0, size));
        pending = pending.subarray(size);
        packets.push(packet);
        if (finished(packet)) {
          finish();
          return;
        }
      }
    }
    socket.on("data", onData);
    socket.write(makePacket(command, serial, payload));
  });
}

async function fixture() {
  const directory = await mkdtemp(path.join(scratchRoot, "tcp-test-"));
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
    async close() {},
  };
  const config = await loadConfig(path.resolve(import.meta.dirname, ".."));
  const store = new JsonStore({
    filePath: path.join(directory, "state.json"),
    initialState: makeInitialState(),
    logger,
  });
  await store.initialize();
  const players = new PlayerRepository({
    store,
    defaults: config.playerDefaults,
    logger,
  });
  await players.getOrCreate(account);
  await store.update((state) => {
    const player = state.players[account]!;
    player.money = player.money.filter(({ id }) => id !== MONEY_DIAMOND);
    player.money.push({ id: MONEY_DIAMOND, count: 300 });
  });
  const server: Server = createGatewayServer({ config, logger, players });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing gateway address");
  const socket = createConnection({ host: "127.0.0.1", port: address.port });
  await once(socket, "connect");
  let serial = 0;
  await request(
    socket,
    COMMAND.VERIFY_REQ,
    ++serial,
    Buffer.concat([fieldBytes(1, "android"), fieldBytes(2, account)]),
    (packet) => packet.command === COMMAND.VERIFY_RSP,
  );
  await request(
    socket,
    COMMAND.LOGIN_REQ,
    ++serial,
    fieldBytes(1, bareUsername),
    (packet) => packet.command === COMMAND.LOGIN_RSP,
  );
  /** Sends {sCmd, tbParam} and waits for the reply of `until` (default: the same command). */
  function lua(
    sCmd: number,
    tbParam?: unknown,
    until = sCmd,
    wait = 5_000,
  ): Promise<GamePacket[]> {
    const body: Record<string, unknown> = { sCmd };
    if (tbParam !== undefined) body.tbParam = tbParam;
    return request(
      socket,
      COMMAND.C2S_CALL_REQ,
      ++serial,
      makeServerLuaCall("LuaCall", body),
      (packet) => {
        const call = callback(packet);
        return (
          call?.method === "LuaCall" &&
          (call.parameters as { sCmd?: number } | null)?.sCmd === until
        );
      },
      wait,
    );
  }
  async function cleanup(): Promise<void> {
    const closed = once(socket, "close");
    socket.destroy();
    await closed;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    await store.flush();
    const resolved = path.resolve(directory);
    if (
      !resolved.startsWith(`${scratchRoot}${path.sep}`) ||
      !path.basename(resolved).startsWith("tcp-test-")
    )
      throw new Error("Refusing cleanup outside isolated test directory");
    await rm(resolved, { recursive: true, force: true });
  }
  return { lua, cleanup, players, store };
}

describe("club boss over TCP", () => {
  beforeEach(() => {
    // Only the clock: sockets and their timers stay real.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(FIGHT_DAY);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the map, takes the result inside DoSettle and keeps it", async () => {
    const f = await fixture();
    try {
      await f.lua(10_001, CREATE_REQUEST);
      const info = luaReply(await f.lua(10_002), 10_002) as {
        clubboss: { stageid: number; bosslist: unknown[]; score: number };
      };
      expect(info.clubboss.stageid).toBe(1);
      expect(info.clubboss.bosslist).toHaveLength(clubBossStage(1).grids.size);
      expect(info.clubboss.score).toBeGreaterThan(0);

      const checkIn = luaReply(await f.lua(LUA_COMMAND_CLUB_BOSS_CHECK_IN), 10_015) as {
        nError: number;
        clubboss: { stageid: number };
      };
      expect(checkIn).toMatchObject({ nError: CLUB_BOSS_OK, clubboss: { stageid: 1 } });

      const state = f.players.get(account)!.club!.boss!;
      const stage = clubBossStage(1);
      const gridId = [...stage.grids.keys()]
        .sort((a, b) => a - b)
        .find((id) => {
          const level = stage.levels.get(stage.grids.get(id)!.levelId)!;
          return (
            level.type === 1 &&
            (state.grids[String(id)] ?? 0) < level.total &&
            isClubBossGridOpen(stage, id, (other) => state.grids[String(other)] ?? 0)
          );
        })!;
      const levelId = stage.grids.get(gridId)!.levelId;
      const pass = stage.levels.get(levelId)!.pass;
      expect(
        luaReply(
          await f.lua(LUA_COMMAND_CLUB_BOSS_ENTER, [gridId, levelId, 1]),
          10_016,
        ),
      ).toEqual({ nError: CLUB_BOSS_OK });

      // GameManager.SendInfoToServer: {sCmd: 252, tbParam: {sCmd: 10017, tbParam}};
      // the answer comes back as 10017, the way the bounty settle answers.
      const end = luaReply(
        await f.lua(
          LUA_COMMAND_DO_SETTLE,
          {
            sCmd: LUA_COMMAND_CLUB_BOSS_END,
            tbParam: { bPass: true, nGridId: gridId, nLevelId: levelId, nScore: pass },
          },
          LUA_COMMAND_CLUB_BOSS_END,
        ),
        LUA_COMMAND_CLUB_BOSS_END,
      );
      expect(end).toMatchObject({ bPass: true, nScore: pass, nTotalScore: 0 });

      const saved = luaReply(await f.lua(LUA_COMMAND_CLUB_BOSS_SAVE, true), 10_025) as {
        myScore: number;
        nEnterTimes: number;
        clubboss: { bosslist: { gridid: number; explore_score: number }[] };
      };
      expect(saved).toMatchObject({ myScore: pass, nEnterTimes: 1 });
      expect(
        saved.clubboss.bosslist.find((grid) => grid.gridid === gridId)!.explore_score,
      ).toBeGreaterThanOrEqual(pass);

      // A pause exit gets no answer: no 10017 within the wait (1.5 s).
      const after = await f
        .lua(
          LUA_COMMAND_DO_SETTLE,
          { sCmd: LUA_COMMAND_CLUB_BOSS_END, tbParam: { bPauseExit: true } },
          LUA_COMMAND_CLUB_BOSS_END,
          1_500,
        )
        .catch(() => null);
      expect(after).toBeNull();
      const rank = luaReply(await f.lua(LUA_COMMAND_CLUB_BOSS_RANK), 10_023) as {
        rate: number;
      };
      expect(Number.isInteger(rank.rate)).toBe(true);
    } finally {
      await f.cleanup();
    }
  }, 15_000);

  it("pays every participation and pass reward of the ten stages through the real grant", async () => {
    const f = await fixture();
    try {
      await f.players.handleClubRequest(
        account,
        10_001,
        { tbParam: CREATE_REQUEST },
        FIGHT_DAY,
      );
      for (let index = 0; index < 10; index += 1) {
        const now =
          (CLUB_BOSS_SEASON_ANCHOR + index * CLUB_BOSS_SEASON_SECONDS) * 1_000 +
          3_600_000;
        await f.players.handleClubRequest(account, 10_002, undefined, now);
        const stage = clubBossStage(index + 1);
        await f.store.update((state) => {
          const boss = state.players[account]!.club!.boss!;
          expect(boss.stage).toBe(index + 1);
          for (const [gridId, grid] of stage.grids)
            boss.grids[String(gridId)] = stage.levels.get(grid.levelId)!.total;
          boss.runs[String(state.players[account]!.roleId)] = 40;
        });
        const coinBefore =
          f.players.get(account)!.money.find(({ id }) => id === MONEY_CLUB_COIN)
            ?.count ?? 0;
        const participate = await f.players.handleClubRequest(
          account,
          LUA_COMMAND_CLUB_BOSS_PARTICIPATE_AWARD,
          undefined,
          now,
        );
        expect(participate.response).toMatchObject({ nError: CLUB_BOSS_OK });
        const grids = await f.players.handleClubRequest(
          account,
          LUA_COMMAND_CLUB_BOSS_GRID_AWARD,
          { tbParam: {} },
          now,
        );
        expect(grids.response, `stage ${index + 1}`).toMatchObject({
          nError: CLUB_BOSS_OK,
        });
        const player = grids.player;
        const coinAfter =
          player.money.find(({ id }) => id === MONEY_CLUB_COIN)?.count ?? 0;
        expect(coinAfter).toBeGreaterThan(coinBefore);
        const firstAwardLevel = [...stage.levels.values()].find(
          (level) => level.passAwards.length > 0,
        )!;
        expect(
          player.taskValues[
            String((1 << 16) | (CLUB_BOSS_GRID_AWARD_TASK_BASE + firstAwardLevel.id))
          ],
        ).toBe(1);
      }
    } finally {
      await f.cleanup();
    }
  });
});
