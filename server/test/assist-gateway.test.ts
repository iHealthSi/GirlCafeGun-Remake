import { once } from "node:events";
import { rm } from "node:fs/promises";
import { mkdtemp } from "./helpers/temp.js";
import { createConnection, type Server, type Socket } from "node:net";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import {
  ASSIST_CANDIDATE_COUNT,
  LUA_COMMAND_ASSIST_LIST,
  LUA_COMMAND_FRIEND_ADD,
  type AssistCandidate,
} from "../src/game-data/assist-data.js";
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

const account = "assist-wire:local-test";
const bareUsername = "assist-wire";
const scratchRoot = path.resolve(import.meta.dirname, "../../tools/assist-wire");

interface LuaCallback {
  method: string;
  parameters: unknown;
}
function callback(packet: GamePacket): LuaCallback | null {
  if (packet.command !== COMMAND.NTF_S2C_CALL) return null;
  const fields = decodeFields(packet.payload);
  return {
    method: firstString(fields, 1),
    parameters: JSON.parse(firstString(fields, 2)) as unknown,
  };
}
function luaCallback(packet: GamePacket, command: number): boolean {
  const call = callback(packet);
  return (
    call?.method === "LuaCall" &&
    (call.parameters as { sCmd?: number } | null)?.sCmd === command
  );
}

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
    const timeout = setTimeout(
      () => finish(new Error(`Timed out waiting for request ${command}/${serial}`)),
      5_000,
    );
    function finish(error?: Error): void {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      if (error) reject(error);
      else resolve(packets);
    }
    function onError(error: Error): void {
      finish(error);
    }
    function onClose(): void {
      finish(new Error("Gateway closed before responding"));
    }
    function onData(chunk: Buffer): void {
      pending = Buffer.concat([pending, chunk]);
      while (pending.length >= HEADER_SIZE) {
        const size = pending.readUInt32LE(4);
        if (size < HEADER_SIZE) {
          finish(new Error(`Invalid gateway packet size ${size}`));
          return;
        }
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
    socket.once("error", onError);
    socket.once("close", onClose);
    socket.write(makePacket(command, serial, payload));
  });
}

async function fixture() {
  const directory = await mkdtemp(path.join(scratchRoot, "tcp-test-"));
  const filePath = path.join(directory, "state.json");
  const warnings: { event: string; fields: unknown }[] = [];
  const logger: Logger = {
    debug() {},
    info() {},
    warn(event, fields) {
      warnings.push({ event, fields });
    },
    error() {},
    async close() {},
  };
  const config = await loadConfig(path.resolve(import.meta.dirname, ".."));
  const store = new JsonStore({ filePath, initialState: makeInitialState(), logger });
  await store.initialize();
  const players = new PlayerRepository({
    store,
    defaults: config.playerDefaults,
    logger,
  });
  await players.getOrCreate(account);
  const server: Server = createGatewayServer({ config, logger, players });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing gateway TCP address");
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

  function send(
    command: number,
    tbParam: unknown,
    finished: (packet: GamePacket) => boolean,
  ): Promise<GamePacket[]> {
    return request(
      socket,
      COMMAND.C2S_CALL_REQ,
      ++serial,
      makeServerLuaCall("LuaCall", { sCmd: command, tbParam }),
      finished,
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
  return { send, cleanup, warnings };
}

function assistList(packets: readonly GamePacket[]): AssistCandidate[] {
  const packet = packets.find((entry) => luaCallback(entry, LUA_COMMAND_ASSIST_LIST));
  expect(packet, "missing AssistList callback").toBeDefined();
  return (callback(packet!)!.parameters as { tbParam: AssistCandidate[] }).tbParam;
}

describe("offline assist over TCP", () => {
  it("answers AssistList with three helpers, also without a power", async () => {
    const f = await fixture();
    try {
      for (const tbParam of [{ Power: 9_700, ChapterType: [2] }, { Power: 0 }, {}]) {
        const helpers = assistList(
          await f.send(LUA_COMMAND_ASSIST_LIST, tbParam, (packet) =>
            luaCallback(packet, LUA_COMMAND_ASSIST_LIST),
          ),
        );
        expect(Array.isArray(helpers)).toBe(true);
        expect(helpers).toHaveLength(ASSIST_CANDIDATE_COUNT);
        for (const helper of helpers) {
          expect(helper.type).toBe(0);
          expect(helper.headframeid).toBe(0);
          expect(helper.Card.length).toBeGreaterThan(0);
          expect(helper.Card[0]!.Skill.length).toBeGreaterThan(0);
        }
      }
      expect(f.warnings).toEqual([]);
    } finally {
      await f.cleanup();
    }
  });

  it("answers a friend request to a helper with the not-available tip", async () => {
    const f = await fixture();
    try {
      const packets = await f.send(
        LUA_COMMAND_FRIEND_ADD,
        { askroleid: 1, answerroleid: 7_700_001, log_addtype: 2 },
        (packet) => callback(packet)?.method === "CallClientTip",
      );
      const tip = packets
        .map(callback)
        .find((call) => call?.method === "CallClientTip");
      expect(tip?.parameters).toEqual(["ui.NotOpen"]);
      expect(f.warnings).toEqual([]);
    } finally {
      await f.cleanup();
    }
  });
});
