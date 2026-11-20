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

it("serves event towers over real TCP: CallServer in, DoSettle in and out, replays, refusals and unhandled ids", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-event-tower-tcp-"));
  const account = "tower-wire:local-only";
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
      player.money = [{ id: 1, count: 25 }];
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
      fieldBytes(1, "tower-wire"),
      (packet) => packet.command === COMMAND.LOGIN_RSP,
    );
    /** Sends a LuaCall and collects packets up to the one `until` accepts. */
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
    const money = (id: number) =>
      store.snapshot().players[account]!.money.find((m) => m.id === id)!.count;

    // Other towers and the ranking tower get no reply (they stay unhandled), a served one does.
    const stray = await call({ sCmd: 53, tbParam: [4, 9] }, acknowledged);
    expect(stray.filter((p) => p.command !== COMMAND.C2S_CALL_RSP)).toEqual([]);
    const ranking = await call({ sCmd: 53, tbParam: [350, 6] }, acknowledged);
    expect(ranking.filter((p) => p.command !== COMMAND.C2S_CALL_RSP)).toEqual([]);
    const info = await call({ sCmd: 53, tbParam: [3, 4] }, replyTo(53));
    expect(luaReply(info.at(-1)!)).toEqual({ sCmd: 53, tbParam: { TowerId: 3 } });

    // 54 straight from CallServer; a refused entry still gets its reply.
    const refused = await call({ sCmd: 54, tbParam: [2, 1, 0, 2, 99] }, replyTo(54));
    expect(luaReply(refused.at(-1)!)).toEqual({ sCmd: 54, tbParam: { nError: 10 } });
    const entered = await call({ sCmd: 54, tbParam: [2, 1, 0, 2, 1] }, replyTo(54));
    expect(luaReply(entered.at(-1)!)).toEqual({
      sCmd: 54,
      tbParam: { tbData: [2, 1, 0, 2], tbDrop: [], tbDropItems: [] },
    });
    expect(money(1)).toBe(25);

    // 55 comes inside DoSettle (GameManager.SendInfoToServer) and goes back the same way.
    const settle = (command: number, tbParam: unknown) => ({
      sCmd: 252,
      tbParam: { sCmd: command, tbParam },
    });
    const passed = await call(
      settle(55, [2, 1, 0, 2, 1, { nScore: 640 }, null, [], 0]),
      replyTo(252),
    );
    const settled = luaReply(passed.at(-1)!);
    const inner = settled.tbParam as { sCmd: number; tbParam: unknown };
    expect(settled.sCmd).toBe(252);
    expect(inner.sCmd).toBe(55);
    expect(inner.tbParam).toMatchObject({
      nMasterExp: 10,
      nGetScore: 640,
      newGoalIds: [],
    });
    // Money and task values go out before the reply the client re-reads them for.
    const kinds = passed.map((p) => p.command);
    const last = kinds.length - 1;
    expect(kinds.indexOf(COMMAND.MONEY_UPDATE_NTF)).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf(COMMAND.MONEY_UPDATE_NTF)).toBeLessThan(last);
    expect(kinds.indexOf(COMMAND.TASK_VALUE_RSP)).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf(COMMAND.TASK_VALUE_RSP)).toBeLessThan(last);
    expect(money(1)).toBe(15);
    expect(
      store.snapshot().players[account]!.taskValues[String((9 << 16) | 1102)],
    ).toBe(640);

    // The client resends a settlement until it hears back: same reply, no second payment.
    const resent = await call(
      settle(55, [2, 1, 0, 2, 1, { nScore: 640 }, null, [], 0]),
      replyTo(252),
    );
    expect(luaReply(resent.at(-1)!)).toEqual(settled);
    expect(resent.some((p) => p.command === COMMAND.MONEY_UPDATE_NTF)).toBe(false);
    expect(money(1)).toBe(15);

    // 56 is answered inside DoSettle too, with an empty body; a settlement with no entry is refused.
    await call({ sCmd: 54, tbParam: [2, 1, 0, 3, 1] }, replyTo(54));
    const lost = await call(settle(56, [2, 1, 0, 3, 1]), replyTo(252));
    expect(luaReply(lost.at(-1)!)).toEqual({
      sCmd: 252,
      tbParam: { sCmd: 56, tbParam: {} },
    });
    expect(money(1)).toBe(5);
    const late = await call(
      settle(55, [2, 1, 0, 3, 1, { nScore: 9 }, null, [], 0]),
      replyTo(252),
    );
    expect(luaReply(late.at(-1)!).tbParam).toEqual({
      sCmd: 55,
      tbParam: { nError: 2 },
    });

    // The lottery and score screens answer with their own error shapes.
    const pool = await call(
      { sCmd: 177, tbParam: { TowerId: 3, nType: 1, nPondId: 1 } },
      replyTo(177),
    );
    expect(luaReply(pool.at(-1)!)).toEqual({
      sCmd: 177,
      tbParam: { nTowerId: 3, nError: 8 },
    });
    const award = await call(
      { sCmd: 62, tbParam: { nTowerId: 2, Index: 0 } },
      replyTo(62),
    );
    expect(luaReply(award.at(-1)!)).toEqual({
      sCmd: 62,
      tbParam: { nTowerId: 2, nError: 12 },
    });
    const points = await call({ sCmd: 176, tbParam: { activeId: 3 } }, replyTo(176));
    expect(luaReply(points.at(-1)!)).toEqual({ sCmd: 176, tbParam: { res: false } });
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
