import { once } from "node:events";
import { rm } from "node:fs/promises";
import { createConnection, type Server, type Socket } from "node:net";
import os from "node:os";
import path from "node:path";

import { loadConfig } from "../../src/config.js";
import type { Logger } from "../../src/logger.js";
import { JsonStore } from "../../src/persistence/json-store.js";
import {
  makeInitialState,
  PlayerRepository,
  type PersistedState,
  type Player,
} from "../../src/persistence/player-repository.js";
import { COMMAND } from "../../src/protocol/commands.js";
import { makeServerLuaCall } from "../../src/protocol/messages.js";
import {
  HEADER_SIZE,
  makePacket,
  readPacket,
  type GamePacket,
} from "../../src/protocol/packet.js";
import { decodeFields, fieldBytes, firstString } from "../../src/protocol/protobuf.js";
import { createGatewayServer } from "../../src/servers/gateway-server.js";
import { mkdtemp } from "./temp.js";

export interface LuaReply {
  sCmd?: number;
  tbParam?: unknown;
}

export function luaReply(packet: GamePacket): LuaReply {
  return JSON.parse(firstString(decodeFields(packet.payload), 2)) as LuaReply;
}

function exchange(
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

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};

/** A gateway on a local port with a logged-in client and a prepared save. */
export async function startTowerWire(
  options: {
    setup?: (player: Player) => void;
    wrap?: (players: PlayerRepository) => PlayerRepository;
    errors?: string[];
  } = {},
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-event-tower-tcp-"));
  const account = "tower-wire:local-only";
  const config = await loadConfig(path.resolve(import.meta.dirname, "../.."));
  const store: JsonStore<PersistedState> = new JsonStore({
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
    player.nextItemGuid = 1_000;
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
    options.setup?.(player);
  });
  const recorder: Logger = {
    ...logger,
    error(message: string) {
      options.errors?.push(message);
    },
  };
  const server: Server = createGatewayServer({
    config,
    logger: recorder,
    players: options.wrap ? options.wrap(players) : players,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const socket = createConnection({ host: "127.0.0.1", port: address.port });
  await once(socket, "connect");
  let serial = 0;
  await exchange(
    socket,
    COMMAND.VERIFY_REQ,
    ++serial,
    Buffer.concat([fieldBytes(1, "android"), fieldBytes(2, account)]),
    (packet) => packet.command === COMMAND.VERIFY_RSP,
  );
  await exchange(
    socket,
    COMMAND.LOGIN_REQ,
    ++serial,
    fieldBytes(1, "tower-wire"),
    (packet) => packet.command === COMMAND.LOGIN_RSP,
  );
  return {
    store,
    account,
    /** Sends a LuaCall and collects packets up to the one `until` accepts. */
    call: (payload: unknown, until: (packet: GamePacket) => boolean) =>
      exchange(
        socket,
        COMMAND.C2S_CALL_REQ,
        ++serial,
        makeServerLuaCall("LuaCall", payload),
        until,
      ),
    /** The packet that carries the reply of `command` (bare or inside DoSettle). */
    replyTo: (command: number) => (packet: GamePacket) =>
      packet.command === COMMAND.NTF_S2C_CALL &&
      [command, 252].includes(luaReply(packet).sCmd ?? -1),
    async stop(): Promise<void> {
      const closed = once(socket, "close");
      socket.destroy();
      await closed;
      if (server.listening)
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      await rm(directory, { recursive: true, force: true });
    },
  };
}
