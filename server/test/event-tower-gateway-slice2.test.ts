import { expect, it } from "vitest";

import { luaReply, startTowerWire } from "./helpers/event-tower-wire.js";

it("answers the card run, the skill upgrade and the boss rush calls over real TCP", async () => {
  const wire = await startTowerWire();
  try {
    const body = async (payload: unknown, command: number) =>
      luaReply((await wire.call(payload, wire.replyTo(command))).at(-1)!);

    expect(await body({ sCmd: 53, tbParam: [4, 3] }, 53)).toEqual({
      sCmd: 53,
      tbParam: { TowerId: 4 },
    });
    // The opening story: entered with CallServer, settled inside DoSettle.
    expect(await body({ sCmd: 54, tbParam: [3, 4, 0, 1, 0] }, 54)).toEqual({
      sCmd: 54,
      tbParam: { tbData: [3, 4, 0, 1], tbDrop: [], tbDropItems: [] },
    });
    const story = await body(
      { sCmd: 252, tbParam: { sCmd: 55, tbParam: [3, 4, 0, 1, 0, true, null, [], 0] } },
      252,
    );
    expect(story.sCmd).toBe(252);
    expect((story.tbParam as { sCmd: number }).sCmd).toBe(55);

    // A refused difficulty still gets the reply the screen reads.
    expect(await body({ sCmd: 64, tbParam: { TowerId: 4, Diff: 3 } }, 64)).toEqual({
      sCmd: 64,
      tbParam: { Error: 1 },
    });
    const dealt = luaReply(
      (
        await wire.call(
          { sCmd: 64, tbParam: { TowerId: 4, Diff: 1 } },
          wire.replyTo(64),
        )
      ).at(-1)!,
    );
    const random = (dealt.tbParam as { tbRandom: { CardId: number }[] }).tbRandom;
    expect(random).toHaveLength(3);
    const chosen = (await body({ sCmd: 65, tbParam: { TowerId: 4, Index: 1 } }, 65))
      .tbParam as { CardId: number; Type: number }[];
    expect(chosen.map((entry) => entry.Type)).toEqual([1, 0, 0]);
    expect(await body({ sCmd: 67, tbParam: { TowerId: 4 } }, 67)).toEqual({
      sCmd: 67,
      tbParam: { nError: 2 },
    });
    expect(await body({ sCmd: 69, tbParam: { TowerId: 4 } }, 69)).toEqual({
      sCmd: 69,
      tbParam: { nError: 0 },
    });

    // Skills: no upgrade items, so Tips8; the twentieth tower's screen is answered too.
    expect(await body({ sCmd: 527, tbParam: [21, 1] }, 527)).toEqual({
      sCmd: 527,
      tbParam: { nError: 8 },
    });
    expect((await body({ sCmd: 527, tbParam: [20, 1] }, 527)).tbParam).toEqual({
      nError: 8,
    });

    // Boss rush: a pick, then a team save that is refused until all four are picked, all with {}.
    expect(await body({ sCmd: 510, tbParam: [5, 1] }, 510)).toEqual({
      sCmd: 510,
      tbParam: {},
    });
    expect(await body({ sCmd: 511, tbParam: {} }, 511)).toEqual({
      sCmd: 511,
      tbParam: {},
    });
    expect(await body({ sCmd: 512, tbParam: {} }, 512)).toEqual({
      sCmd: 512,
      tbParam: {},
    });
    expect(
      await body(
        { sCmd: 513, tbParam: { bSave: false, tbResult: { LevelId: 5 } } },
        513,
      ),
    ).toEqual({ sCmd: 513, tbParam: {} });
  } finally {
    await wire.stop();
  }
});
