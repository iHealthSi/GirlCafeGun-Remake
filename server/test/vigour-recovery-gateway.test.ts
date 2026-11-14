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
  MONEY_VIGOUR,
  PlayerRepository,
} from "../src/persistence/player-repository.js";
import { COMMAND } from "../src/protocol/commands.js";
import {
  HEADER_SIZE,
  makePacket,
  readPacket,
  type GamePacket,
} from "../src/protocol/packet.js";
import {
  decodeFields,
  fieldBytes,
  firstBytes,
  firstNumber,
} from "../src/protocol/protobuf.js";
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
  responseCommand: number,
): Promise<GamePacket[]> {
  return new Promise((resolve, reject) => {
    let pending = Buffer.alloc(0);
    const packets: GamePacket[] = [];
    const timeout = setTimeout(() => {
      finish(new Error(`Timed out waiting for command ${responseCommand}`));
    }, 5000);

    function finish(error?: Error): void {
      clearTimeout(timeout);
      socket.off("data", onData);
      socket.off("error", finish);
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
        if (packet.command === responseCommand && packet.serial === serial) {
          finish();
          return;
        }
      }
    }

    socket.on("data", onData);
    socket.once("error", finish);
    socket.write(makePacket(command, serial, payload));
  });
}

function vigourUpdates(packets: readonly GamePacket[]): number[] {
  return packets
    .filter(({ command }) => command === COMMAND.MONEY_UPDATE_NTF)
    .map(({ payload }) => decodeFields(firstBytes(decodeFields(payload), 1)!))
    .filter((money) => firstNumber(money, 1) === MONEY_VIGOUR)
    .map((money) => firstNumber(money, 2));
}

it("pushes recovered vigour to a connected player on keep-alive", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-vigour-gateway-"));
  const account = "commander";
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
      defaults: { ...config.playerDefaults, level: 1, exp: 0 },
      logger,
    });
    await players.getOrCreate(account);
    await store.update((state) => {
      const player = state.players[account]!;
      player.lastLoginAt = "2026-11-04T00:00:00.000Z";
      player.money.find(({ id }) => id === MONEY_VIGOUR)!.count = 10;
      player.vigourRecoveredAt = Math.floor(Date.now() / 1000);
    });

    // The gateway's recovery clock is injected, so the test does not wait.
    let elapsed = 0;
    server = createGatewayServer({
      config,
      logger,
      players,
      now: () => Date.now() + elapsed,
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Gateway did not bind a TCP port");
    }

    socket = createConnection({ host: "127.0.0.1", port: address.port });
    await once(socket, "connect");
    await request(
      socket,
      COMMAND.VERIFY_REQ,
      1,
      Buffer.concat([fieldBytes(1, "android"), fieldBytes(2, account)]),
      COMMAND.VERIFY_RSP,
    );
    await request(
      socket,
      COMMAND.LOGIN_REQ,
      2,
      fieldBytes(1, account),
      COMMAND.LOGIN_RSP,
    );

    const before = await request(
      socket,
      COMMAND.KEEP_ALIVE_REQ,
      3,
      Buffer.alloc(0),
      COMMAND.KEEP_ALIVE_RSP,
    );
    expect(vigourUpdates(before)).toEqual([]);

    elapsed = 13 * 60_000;
    await request(
      socket,
      COMMAND.KEEP_ALIVE_REQ,
      4,
      Buffer.alloc(0),
      COMMAND.KEEP_ALIVE_RSP,
    );
    // The notification follows the keep-alive reply; the next reply flushes it.
    const after = await request(
      socket,
      COMMAND.KEEP_ALIVE_REQ,
      5,
      Buffer.alloc(0),
      COMMAND.KEEP_ALIVE_RSP,
    );
    expect(vigourUpdates(after)).toEqual([12]);
    expect(
      players.get(account)!.money.find(({ id }) => id === MONEY_VIGOUR)?.count,
    ).toBe(12);
  } finally {
    socket?.destroy();
    if (server) {
      server.close();
      await once(server, "close");
    }
    await rm(directory, { recursive: true, force: true });
  }
});
