import { once } from "node:events";
import { rm } from "node:fs/promises";
import { mkdtemp } from "./helpers/temp.js";
import { createConnection, type Server, type Socket } from "node:net";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { makeAchievementTaskId } from "../src/game-data/activity-achievement-data.js";
import {
  CLUB_MISSION_CLAIM_METHOD,
  CLUB_MISSION_ERROR_NOT_DONE,
  CLUB_MISSION_VIGOUR,
  CLUB_TIER_CLAIM_METHOD,
  clubTaskId,
  MONEY_CLUB_COIN,
} from "../src/game-data/club-data.js";
import type { Logger } from "../src/logger.js";
import { JsonStore } from "../src/persistence/json-store.js";
import {
  makeInitialState,
  MONEY_DIAMOND,
  MONEY_GOLD,
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

const account = "club-wire:local-test";
const bareUsername = "club-wire";
const scratchRoot = path.resolve(import.meta.dirname, "../../tools/club-wire");
/** Alex's create request from the phone's server log (2026-11-20). */
const CREATE_REQUEST = { applylevel: 10, clubname: "GCG revival", autojoinlevel: 10 };

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
function luaReply(packets: readonly GamePacket[], command: number): unknown {
  for (const packet of packets) {
    const call = callback(packet);
    const parameters = call?.parameters as { sCmd?: number; tbParam?: unknown } | null;
    if (call?.method === "LuaCall" && parameters?.sCmd === command)
      return parameters.tbParam;
  }
  return undefined;
}
function calls(packets: readonly GamePacket[], method: string): unknown[] {
  return packets
    .map(callback)
    .filter((call) => call?.method === method)
    .map((call) => call!.parameters);
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

  /**
   * A LuaCall. It ends with its own reply, or with the tip when one is expected
   * (the server sends a refusal's tip after its reply, or alone).
   */
  function lua(
    command: number,
    tbParam?: unknown,
    until: "reply" | "tip" = "reply",
  ): Promise<GamePacket[]> {
    const body: Record<string, unknown> = { sCmd: command };
    if (tbParam !== undefined) body.tbParam = tbParam;
    return request(
      socket,
      COMMAND.C2S_CALL_REQ,
      ++serial,
      makeServerLuaCall("LuaCall", body),
      (packet) => {
        const call = callback(packet);
        if (until === "tip") return call?.method === "CallClientTip";
        const parameters = call?.parameters as { sCmd?: number } | null;
        return call?.method === "LuaCall" && parameters?.sCmd === command;
      },
    );
  }
  function claim(method: string, id: number): Promise<GamePacket[]> {
    return request(
      socket,
      COMMAND.C2S_CALL_REQ,
      ++serial,
      makeServerLuaCall(method, { nId: id, nType: 0 }),
      (packet) => callback(packet)?.method === "MissionMgrMsg",
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
  return { lua, claim, cleanup, warnings, players };
}

describe("offline clubs over TCP", () => {
  it("creates the player's club and answers the club screens", async () => {
    const f = await fixture();
    try {
      expect(luaReply(await f.lua(10_002), 10_002)).toEqual({});

      const created = await f.lua(10_001, CREATE_REQUEST);
      const club = luaReply(created, 10_001) as {
        primary: Record<string, unknown>;
        memberlist: Record<string, unknown>[];
      };
      expect(club.primary).toMatchObject({
        name: "GCG revival",
        level: 1,
        weektaskvalue: 540,
      });
      expect(club.memberlist).toHaveLength(7);
      const player = f.players.get(account)!;
      expect(player.money.find(({ id }) => id === MONEY_DIAMOND)?.count).toBe(50);
      expect(player.taskValues[String(makeAchievementTaskId(6, 2_050))]).toBe(2);

      const again = await f.lua(10_001, CREATE_REQUEST, "tip");
      expect(luaReply(again, 10_001)).toEqual({});
      expect(calls(again, "CallClientTip")).toEqual([["ui.NotOpen"]]);

      const info = luaReply(await f.lua(10_002), 10_002) as { primary: { id: number } };
      expect(info.primary.id).toBe(club.primary.id);

      const members = luaReply(await f.lua(10_027, { strType: "OpenMem" }), 10_027) as {
        strType: string;
        memberlist: unknown[];
      };
      expect(members.strType).toBe("OpenMem");
      expect(members.memberlist).toHaveLength(7);

      expect(luaReply(await f.lua(10_008, { newnotice: "Welcome!" }), 10_008)).toEqual([
        "Welcome!",
      ]);
      const log = luaReply(await f.lua(10_029), 10_029) as {
        actionloglist: { type: number }[];
      };
      expect(log.actionloglist[0]?.type).toBe(8);
      expect(luaReply(await f.lua(10_028), 10_028)).toEqual({ applylist: [] });
      expect(luaReply(await f.lua(10_003), 10_003)).toEqual({
        applyedlist: [],
        fx: [],
      });

      const modified = luaReply(
        await f.lua(10_014, { applylevel: 20, autojoinlevel: 30 }),
        10_014,
      ) as Record<string, unknown>;
      expect(modified).toMatchObject({
        applylevel: 20,
        autojoinlevel: 30,
        weektaskvalue: 540,
      });

      const find = await f.lua(10_004, { clubid: 123 }, "tip");
      expect(luaReply(find, 10_004)).toEqual({});
      expect(calls(find, "CallClientTip")).toEqual([["ui.Club.NoClubData"]]);

      // The chief cannot leave: a tip and no reply ({} would mean "left").
      const quit = await f.lua(10_012, undefined, "tip");
      expect(luaReply(quit, 10_012)).toBeUndefined();
      expect(calls(quit, "CallClientTip")).toEqual([["ui.NotOpen"]]);

      expect(f.warnings).toEqual([]);
    } finally {
      await f.cleanup();
    }
  });

  it("pays the daily reward in club coin and claims missions and tiers", async () => {
    const f = await fixture();
    try {
      await f.lua(10_001, CREATE_REQUEST);
      const goldBefore =
        f.players.get(account)!.money.find(({ id }) => id === MONEY_GOLD)?.count ?? 0;
      expect(luaReply(await f.lua(10_020), 10_020)).toEqual({});
      let player = f.players.get(account)!;
      expect(player.money.find(({ id }) => id === MONEY_CLUB_COIN)?.count).toBe(5);
      expect(player.money.find(({ id }) => id === MONEY_GOLD)?.count).toBe(
        goldBefore + 2_000,
      );
      await f.lua(10_020);
      expect(
        f.players.get(account)!.money.find(({ id }) => id === MONEY_CLUB_COIN)?.count,
      ).toBe(5);

      expect(
        calls(await f.claim(CLUB_MISSION_CLAIM_METHOD, 50_024), "MissionMgrMsg"),
      ).toEqual([{ nError: CLUB_MISSION_ERROR_NOT_DONE, nMission: 5 }]);
      expect(calls(await f.claim(CLUB_TIER_CLAIM_METHOD, 1), "MissionMgrMsg")).toEqual([
        { nError: 0, nMission: 6 },
      ]);
      player = f.players.get(account)!;
      expect(player.taskValues[String(clubTaskId(51_001))]).toBe(2);
      expect(player.money.find(({ id }) => id === MONEY_GOLD)?.count).toBe(
        goldBefore + 22_000,
      );

      // A stamina hook adds club progress while the player has a club.
      await f.players.chargeLevelVigour(account, 6);
      expect(
        f.players.get(account)!.taskValues[String(clubTaskId(CLUB_MISSION_VIGOUR))],
      ).toBe(12);
      // The unfinished mission claim above is the only warning.
      expect(f.warnings.map(({ event }) => event)).toEqual([
        "club_mission.claim_rejected",
      ]);
    } finally {
      await f.cleanup();
    }
  });

  it("counts stage kills for the kill missions only with a club", async () => {
    const f = await fixture();
    try {
      expect(await f.players.recordClubBattle(account, 30, 2)).toBeNull();
      await f.lua(10_001, CREATE_REQUEST);
      const player = await f.players.recordClubBattle(account, 30, 2);
      expect(player?.taskValues[String(clubTaskId(50_008))]).toBe(60);
      expect(player?.taskValues[String(clubTaskId(50_009))]).toBe(4);
    } finally {
      await f.cleanup();
    }
  });

  it("keeps the upkeep when a command is refused and reports an expired dissolve", async () => {
    const f = await fixture();
    try {
      await f.lua(10_001, CREATE_REQUEST);
      const week = f.players.get(account)!.club!.week;
      const nextWeek = Date.now() + 7 * 86_400_000;
      const refused = await f.players.handleClubRequest(
        account,
        10_010,
        { viceid: 1 },
        nextWeek,
      );
      expect(refused.tip).toBe("ui.NotOpen");
      expect(refused.response).toEqual({});
      expect(f.players.get(account)!.club!.week).not.toBe(week);

      await f.players.handleClubRequest(account, 10_022, { dissoslve: 1 }, nextWeek);
      const expired = await f.players.handleClubRequest(
        account,
        10_022,
        { dissoslve: 0 },
        nextWeek + 3 * 86_400_000,
      );
      expect(expired.response).toEqual({ nError: 1 });
      expect(expired.dissolved).toBe(true);
      expect(f.players.get(account)!.club).toBeUndefined();
    } finally {
      await f.cleanup();
    }
  });

  it("answers a tap on a clubmate's head with a tip", async () => {
    const f = await fixture();
    try {
      await f.lua(10_001, CREATE_REQUEST);
      const mate = f.players.get(account)!.club!.members[0]!.roleId;
      const tap = await f.lua(101, { roleid: mate }, "tip");
      expect(calls(tap, "CallClientTip")).toEqual([["ui.NotOpen"]]);
    } finally {
      await f.cleanup();
    }
  });
});
