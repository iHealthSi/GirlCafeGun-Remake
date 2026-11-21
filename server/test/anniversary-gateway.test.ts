import { expect, it } from "vitest";

import { COMMAND } from "../src/protocol/commands.js";
import type { GamePacket } from "../src/protocol/packet.js";
import { decodeFields, firstString } from "../src/protocol/protobuf.js";
import { luaReply, startTowerWire } from "./helpers/event-tower-wire.js";

const method = (packet: GamePacket): string =>
  firstString(decodeFields(packet.payload), 1);

it("serves the Anniversary hub over real TCP: replies, silent calls, refusals and the ranking lists", async () => {
  const errors: string[] = [];
  const wire = await startTowerWire({
    errors,
    setup: (player) => {
      player.money.push({ id: 58, count: 1 });
    },
  });
  try {
    const lua = (packet: GamePacket): { sCmd?: number; tbParam?: unknown } =>
      luaReply(packet);
    const luaCallTo = (command: number) => (packet: GamePacket) =>
      packet.command === COMMAND.NTF_S2C_CALL && lua(packet).sCmd === command;

    // 424 unlocks the first photo and answers the count before it; the task values go first.
    const board = await wire.call({ sCmd: 424, tbParam: {} }, luaCallTo(424));
    expect(board.map((packet) => packet.command)).toContain(COMMAND.TASK_VALUE_RSP);
    expect(lua(board.at(-1)!).tbParam).toEqual([0]);

    // The second 424 of the day is silent: the packets up to the answer of the next call hold no 424.
    const silent = await wire.call({ sCmd: 424, tbParam: {} }, () => true);
    void silent;
    const fan = await wire.call({ sCmd: 355, tbParam: { nId: 1 } }, luaCallTo(355));
    expect(fan.filter(luaCallTo(424))).toHaveLength(0);
    expect(lua(fan.at(-1)!).tbParam).toEqual({ Error: 20045 });
    const ranking = await wire.call({ sCmd: 206, tbParam: {} }, luaCallTo(206));
    expect(lua(ranking.at(-1)!).tbParam).toEqual({ res: false });

    // A walk the power cannot pay: Err 1, nothing else changes.
    const move = await wire.call(
      { sCmd: 420, tbParam: { MapID: 1, Path: [2, 3, 4] } },
      luaCallTo(420),
    );
    expect(lua(move.at(-1)!).tbParam).toMatchObject({ Err: 1 });
    expect(move.map((packet) => packet.command)).not.toContain(COMMAND.TASK_VALUE_RSP);

    // The capsule machine without a coin still answers (the screen waits five seconds otherwise).
    const capsule = await wire.call({ sCmd: 438, tbParam: { nId: 1 } }, luaCallTo(438));
    expect(lua(capsule.at(-1)!).tbParam).toEqual([]);

    // GameRankMsg: a SendCmd call answered by the S2C call ServerRankMsg.
    const rank = await wire.callMethod(
      "GameRankMsg",
      [12, 3, 1, true, [0, 10]],
      (packet) =>
        packet.command === COMMAND.NTF_S2C_CALL && method(packet) === "ServerRankMsg",
    );
    expect(lua(rank.at(-1)!)).toEqual({
      tbData: { tbId: [12, 3, 1], max: 0, me: 0, other: [] },
    });
    expect(errors).toEqual([]);
  } finally {
    await wire.stop();
  }
});
