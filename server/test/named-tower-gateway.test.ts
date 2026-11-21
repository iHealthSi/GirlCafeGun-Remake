import { once } from "node:events";
import { rm } from "node:fs/promises";
import { createConnection, type Server, type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  makeInitialState,
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

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};

function request(
  socket: Socket,
  command: number,
  serial: number,
  payload: Buffer,
  finished: (packet: GamePacket) => boolean,
): Promise<GamePacket[]> {
  return new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0);
    const packets: GamePacket[] = [];
    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for the response to command ${command}`));
    }, 5000);

    function finish(error?: Error): void {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", finish);
      socket.off("close", onClose);
      if (error) reject(error);
      else resolve(packets);
    }
    function onClose(): void {
      finish(new Error("Gateway closed before responding"));
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
    socket.once("error", finish);
    socket.once("close", onClose);
    socket.write(makePacket(command, serial, payload));
  });
}

interface LuaReply {
  sCmd?: number;
  tbParam?: unknown;
}

function luaReply(packet: GamePacket): LuaReply {
  return JSON.parse(firstString(decodeFields(packet.payload), 2)) as LuaReply;
}

it("serves the named-field event towers over real TCP: wrapped settlements, replays, refusals, seeds and single calls", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-named-tower-tcp-"));
  const account = "named-wire:local-only";
  let server: Server | undefined;
  let socket: Socket | undefined;
  try {
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
      player.level = 40;
      player.money = [{ id: 1, count: 100 }];
      player.inventory = [
        {
          guid: 11,
          genre: 1,
          detail: 1,
          particular: 1,
          templateLevel: 1,
          count: 1,
          createTime: 1,
          enhanceLevel: 1,
          enhanceExp: 0,
          breakLevel: 0,
          lockOn: 0,
        },
      ];
      player.formations = [
        {
          id: 1,
          title: "one",
          fightCards: [
            {
              mainCardGuid: 11,
              secondaryCardGuids: [],
              usedCardGuid: 0,
              weaponGuid: 0,
              runeItemGuids: [],
            },
          ],
        },
      ];
      player.taskValues = {};
    });
    server = createGatewayServer({ config, logger, players });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test port");
    socket = createConnection({ host: "127.0.0.1", port: address.port });
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
      fieldBytes(1, "named-wire"),
      (packet) => packet.command === COMMAND.LOGIN_RSP,
    );
    const call = (payload: unknown, until: (packet: GamePacket) => boolean) =>
      request(
        socket!,
        COMMAND.C2S_CALL_REQ,
        ++serial,
        makeServerLuaCall("LuaCall", payload),
        until,
      );
    const replyTo = (command: number) => (packet: GamePacket) =>
      packet.command === COMMAND.NTF_S2C_CALL &&
      [command, 252].includes(luaReply(packet).sCmd ?? -1);
    const acknowledged = (packet: GamePacket) =>
      packet.command === COMMAND.C2S_CALL_RSP;
    const settle = (command: number, tbParam: unknown) => ({
      sCmd: 252,
      tbParam: { sCmd: command, tbParam },
    });
    const task = (group: number, key: number) =>
      store.snapshot().players[account]!.taskValues[String((group << 16) | key)] ?? 0;

    // Login seeded the linkage event id, which the client needs to show its tile at all.
    expect(task(63, 3001)).toBe(1);

    // 223 is a log the client sends and waits for nothing: accepted, no reply.
    const log = await call({ sCmd: 223, tbParam: [] }, acknowledged);
    expect(log.filter((p) => p.command !== COMMAND.C2S_CALL_RSP)).toEqual([]);

    // Micro tower: echo, entry, wrapped settlement with its reply wrapped the same way.
    const echo = await call({ sCmd: 285, tbParam: { nTowerId: 1 } }, replyTo(285));
    expect(luaReply(echo.at(-1)!)).toEqual({ sCmd: 285, tbParam: { nTowerId: 1 } });
    const entered = await call(
      { sCmd: 286, tbParam: { nTowerId: 1, nLevelId: 1, nDiff: 1, nFormationId: 1 } },
      replyTo(286),
    );
    expect(luaReply(entered.at(-1)!).tbParam).toMatchObject({
      tbData: { nTowerId: 1, nLevelId: 1, nDiff: 1 },
    });
    const passBody = {
      nTowerId: 1,
      nLevelId: 1,
      nDiff: 1,
      nFormationId: 1,
      tbGoals: { 2: true },
    };
    const passed = await call(settle(287, passBody), replyTo(252));
    const wrapped = luaReply(passed.at(-1)!);
    expect(wrapped.sCmd).toBe(252);
    const inner = wrapped.tbParam as { sCmd: number; tbParam: Record<string, unknown> };
    expect(inner.sCmd).toBe(287);
    expect(inner.tbParam.newGoalIds).toEqual([2]);
    expect(Array.isArray(inner.tbParam.tbAwards)).toBe(true);
    // Task values go out before the reply the client re-reads them for.
    const kinds = passed.map((p) => p.command);
    expect(kinds.indexOf(COMMAND.TASK_VALUE_RSP)).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf(COMMAND.TASK_VALUE_RSP)).toBeLessThan(kinds.length - 1);
    const resent = await call(settle(287, passBody), replyTo(252));
    expect(luaReply(resent.at(-1)!)).toEqual(wrapped);
    expect(resent.some((p) => p.command === COMMAND.MONEY_UPDATE_NTF)).toBe(false);

    // Armed survey story level: 68/11 (the clear) is in the task push that precedes the reply,
    // or the client would enter the story again.
    await call({ sCmd: 335, tbParam: { nId: 1 } }, replyTo(335));
    await call(
      { sCmd: 336, tbParam: { nType: 17, nId: 1, nLevelId: 1, nFormationId: 0 } },
      replyTo(336),
    );
    const story = await call(
      settle(337, {
        nType: 17,
        nId: 1,
        nLevelId: 1,
        nFormationId: 1,
        tbKillMonster: {},
      }),
      replyTo(252),
    );
    const storyKinds = story.map((p) => p.command);
    expect(storyKinds.indexOf(COMMAND.TASK_VALUE_RSP)).toBeGreaterThanOrEqual(0);
    expect(storyKinds.indexOf(COMMAND.TASK_VALUE_RSP)).toBeLessThan(
      storyKinds.length - 1,
    );
    expect(task(68, 11)).toBe(1);
    const storyReply = luaReply(story.at(-1)!).tbParam as {
      tbParam: { tbData: number[][] };
    };
    expect(storyReply.tbParam.tbData.map((row) => row.slice(0, 5))).toEqual([
      [15, 2, 1, 1, 20],
    ]);

    // Fail of the buff tower carries no event id; refusals keep their shapes.
    await call(
      {
        sCmd: 377,
        tbParam: {
          nType: 20,
          nId: 1,
          nLevelId: 1,
          nDiff: 1,
          nFormationId: 1,
          tbBuffs: [],
        },
      },
      replyTo(377),
    );
    const failed = await call(
      settle(379, { nType: 20, nLevelId: 1, nDiff: 1, nFormationId: 1 }),
      replyTo(252),
    );
    expect(luaReply(failed.at(-1)!)).toEqual({
      sCmd: 252,
      tbParam: { sCmd: 379, tbParam: {} },
    });
    const refused = await call(
      { sCmd: 529, tbParam: { nType: 27, nId: 1, nLevelId: 2, nFormationId: 99 } },
      replyTo(529),
    );
    expect(luaReply(refused.at(-1)!)).toEqual({ sCmd: 529, tbParam: { nError: 10 } });
    const claim = await call({ sCmd: 404, tbParam: [1, 5701] }, replyTo(404));
    expect(luaReply(claim.at(-1)!)).toEqual({ sCmd: 404, tbParam: { nError: 12 } });
    const gacha = await call(
      { sCmd: 405, tbParam: { nPondId: 1, nType: 1 } },
      replyTo(405),
    );
    expect(luaReply(gacha.at(-1)!)).toEqual({ sCmd: 405, tbParam: { nError: 8 } });

    // Single calls with fixed answers.
    const fixed: [number, unknown, unknown][] = [
      [528, {}, []],
      [454, {}, { spCount: 0 }],
      [455, {}, []],
      [261, { id: 1 }, []],
      [339, { bSave: true, maxDamage: 1 }, { tbAward: [] }],
    ];
    for (const [command, body, reply] of fixed) {
      const got = await call({ sCmd: command, tbParam: body }, replyTo(command));
      expect(luaReply(got.at(-1)!), String(command)).toEqual({
        sCmd: command,
        tbParam: reply,
      });
    }
  } finally {
    if (socket) {
      const closed = once(socket, "close");
      socket.destroy();
      await closed;
    }
    if (server?.listening)
      await new Promise<void>((resolve, reject) =>
        server!.close((error) => (error ? reject(error) : resolve())),
      );
    await rm(directory, { recursive: true, force: true });
  }
});
