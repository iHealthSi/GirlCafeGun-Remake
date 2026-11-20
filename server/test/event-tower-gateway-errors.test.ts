import { expect, it } from "vitest";

import type { PlayerRepository } from "../src/persistence/player-repository.js";
import { luaReply, startTowerWire } from "./helpers/event-tower-wire.js";

/** The repository, except that handling an event tower request throws. */
function failing(players: PlayerRepository): PlayerRepository {
  return new Proxy(players, {
    get(target, property) {
      if (property === "handleEventTowerRequest")
        return async () => {
          throw new Error("table bug");
        };
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

it("answers an event tower request that fails unexpectedly with the call's refusal shape, in the form it came", async () => {
  const errors: string[] = [];
  const wire = await startTowerWire({ wrap: failing, errors });
  try {
    // Straight from CallServer: the bare reply, so the client does not wait for ever.
    const entered = await wire.call(
      { sCmd: 54, tbParam: [2, 1, 0, 2, 1] },
      wire.replyTo(54),
    );
    expect(luaReply(entered.at(-1)!)).toEqual({ sCmd: 54, tbParam: { nError: 2 } });
    // Inside DoSettle: the wrapped reply, which also clears the settlement the client resends.
    const passed = await wire.call(
      {
        sCmd: 252,
        tbParam: { sCmd: 55, tbParam: [2, 1, 0, 2, 1, { nScore: 1 }, null, [], 0] },
      },
      wire.replyTo(252),
    );
    expect(luaReply(passed.at(-1)!)).toEqual({
      sCmd: 252,
      tbParam: { sCmd: 55, tbParam: { nError: 2 } },
    });
    const failed = await wire.call(
      { sCmd: 252, tbParam: { sCmd: 56, tbParam: [2, 1, 0, 2, 1] } },
      wire.replyTo(252),
    );
    expect(luaReply(failed.at(-1)!)).toEqual({
      sCmd: 252,
      tbParam: { sCmd: 56, tbParam: {} },
    });
    expect(errors).toEqual([
      "lua.event_tower_failed",
      "lua.event_tower_failed",
      "lua.event_tower_failed",
    ]);
  } finally {
    await wire.stop();
  }
});
