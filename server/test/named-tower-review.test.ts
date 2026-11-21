import { describe, expect, it } from "vitest";

import { pickPondSlot } from "../src/game-data/event-tower-data.js";
import { namedTowerErrorReply } from "../src/game-data/named-tower-data.js";
import {
  account,
  current,
  fixture,
  money,
  named,
  reply,
  task,
} from "./helpers/named-fixture.js";

describe("review fixes of the named-field towers", () => {
  it("claims linkage mission 5709 (type 45: the first number is the count) when the card is owned", async () => {
    const { repository, store } = await fixture();
    const claim = named(404, [1, 5709]);
    // Without the card: refused.
    const without = await repository.handleNamedTowerRequest(account, claim);
    expect(without.rejected?.reason).toBe("not_completed");
    await store.update((state) => {
      state.players[account]!.inventory.push({
        guid: 12,
        genre: 1,
        detail: 202,
        particular: 1,
        templateLevel: 3,
        count: 1,
        createTime: 1,
        enhanceLevel: 1,
        enhanceExp: 0,
        breakLevel: 0,
        lockOn: 0,
      });
    });
    const owned = await repository.handleNamedTowerRequest(account, claim);
    expect(owned.rejected).toBeNull();
    expect(reply(owned).tbReward).toBeDefined();
    const again = await repository.handleNamedTowerRequest(account, claim);
    expect(again.rejected?.reason).toBe("already_claimed");
  });

  it("answers 339 with the bare list of awards, also when there is nothing to save", async () => {
    const { repository } = await fixture();
    const save = named(339, { bSave: true, maxDamage: 10 });
    expect((await repository.handleNamedTowerRequest(account, save)).response).toEqual(
      [],
    );
    expect(namedTowerErrorReply(save, 0)).toEqual([]);
  });

  it("answers a refused pass of the armed survey and mixed online with the fields their handlers read", () => {
    const empty = {
      nError: 2,
      tbData: [],
      nMasterExp: 0,
      nCardExp: 0,
      spKillNum: 0,
      curScore: 0,
    };
    expect(namedTowerErrorReply(named(337, { nId: 1, nLevelId: 1 }, true), 2)).toEqual(
      empty,
    );
    expect(namedTowerErrorReply(named(452, { nodeId: 1 }, true), 2)).toEqual(empty);
    // The other families check nError first.
    expect(namedTowerErrorReply(named(372, { nLevelId: 1 }, true), 2)).toEqual({
      nError: 2,
    });
  });

  it("treats a negative pond Count as unlimited", () => {
    const slots = [
      {
        award: [7, 2, 1, 1, 5] as [number, number, number, number, number],
        key: false,
        loop: 0,
        weight: 100,
        count: -1,
      },
    ];
    expect(pickPondSlot(slots, [999], () => 0)).toBe(0);
    expect(pickPondSlot([{ ...slots[0]!, count: 1 }], [1], () => 0)).toBe(-1);
  });

  it("lets the daily linkage mission through whatever state the tab shows, and claims it once a day", async () => {
    const { repository, store } = await fixture();
    // Mission 5700 spends 150 vigour; the progress is set directly (AchievementOther group 18).
    await store.update((state) => {
      state.players[account]!.taskValues[String((18 << 16) | 5700)] = 150 * 2;
    });
    const daily = await repository.handleNamedTowerRequest(
      account,
      named(404, [4, 5700]),
    );
    expect(daily.rejected).toBeNull();
    expect(money(current(repository), 1)).toBe(100);
    expect(task(current(repository), 18, 5700)).toBe(301);
    const twice = await repository.handleNamedTowerRequest(
      account,
      named(404, [4, 5700]),
    );
    expect(twice.rejected?.reason).toBe("already_claimed");
    // The next day line (04:00 Shanghai): the stored mission starts again.
    await store.update((state) => {
      const missions = state.players[account]!.eventMissions!;
      missions.linkageDay = (missions.linkageDay ?? 1) - 1;
    });
    const next = await repository.handleNamedTowerRequest(
      account,
      named(404, [4, 5700]),
    );
    expect(next.rejected?.reason).toBe("not_completed");
    // The reset itself is saved with the next successful request (a refusal keeps the save as it was).
  });
});
