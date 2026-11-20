import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { AutoUseItemCatalog } from "../src/game-data/auto-use-item-data.js";
import {
  BUFF_SLOTS,
  CARD_TASK,
  CARD_TOWER_LAYOUTS,
  EventTowerCatalog,
  eventTowerErrorReply,
  parseEventTowerCall,
  pickCardChoices,
  type CardTowerCard,
} from "../src/game-data/event-tower-data.js";
import type { Player } from "../src/persistence/player-repository.js";
import {
  TowerFixture,
  account,
  money,
  setTask,
  stack,
  task,
  towerRequest,
} from "./helpers/event-tower-fixture.js";

const catalog = EventTowerCatalog.loadDefault();
const fixtures = new TowerFixture();
afterEach(() => fixtures.cleanup());

const ANIMALIZE = 4;
const EIGHTH = 8;

describe("card tower tables", () => {
  it("know both towers: 53 cards, 12 buffs, 5 stories and 5 difficulties of 5 acts and a boss", () => {
    for (const id of [ANIMALIZE, EIGHTH]) {
      const cards = catalog.cardCards.get(id)!;
      expect(cards.size).toBe(53);
      expect(
        [1, 2, 3, 4].map((t) => [...cards.values()].filter((c) => c.type === t).length),
      ).toEqual([3, 29, 20, 1]);
      expect(cards.get(1)!.award).toEqual([15, id === 4 ? 25 : 35, 1, 1, 100]);
      expect(cards.get(33)).toMatchObject({ type: 3, levelId: 1 });
      expect(cards.get(53)).toMatchObject({ type: 4, levelId: 6 });
      expect(cards.get(5)!.buffIds).toEqual([3]);
      expect(catalog.cardBuffs.get(id)!.size).toBe(12);
      expect(catalog.cardBuffs.get(id)!.get(1)).toMatchObject({
        effectType: 2,
        energy: 2,
      });
      expect(catalog.cardBuffs.get(id)!.get(3)).toMatchObject({
        effectTime: 2,
        count: 1,
        effectType: 5,
      });
      expect(catalog.cardMaxDiff(id)).toBe(5);
      for (let diff = 1; diff <= 5; diff++)
        expect(
          [1, 2, 3, 4, 5, 6].map((level) => catalog.cardLevel(id, diff, level)?.type),
        ).toEqual([0, 0, 0, 0, 0, 1]);
      expect([1, 3, 5, 10, 13].map((l) => catalog.cardLevel(id, 0, l)?.type)).toEqual([
        2, 2, 2, 2, 2,
      ]);
      expect(catalog.cardScoreAwards.get(id)!.length).toBeGreaterThan(50);
    }
    // The levels are not in the shared map: their ids repeat for every difficulty.
    expect(catalog.levels.has("4:1")).toBe(false);
    expect(catalog.towers.has(ANIMALIZE)).toBe(false);
  });

  it("name an AutoUse score class for both score items, which the screens read at offset + 8", () => {
    const autoUse = AutoUseItemCatalog.loadDefault();
    expect(autoUse.effect(15, 25, 1, 1)).toEqual({
      kind: "none",
      className: "ItemAnimalizeTowerScoreAuto",
    });
    expect(autoUse.effect(15, 35, 1, 1)).toEqual({
      kind: "none",
      className: "ItemEighthTowerScoreAuto",
    });
  });
});

describe("card dealing", () => {
  const pool: CardTowerCard[] = [...catalog.cardCards.get(ANIMALIZE)!.values()];
  const first = (max: number) => {
    expect(max).toBeGreaterThan(0);
    return 0;
  };

  it("deals three distinct cards and keeps the boss out before the eighth draw", () => {
    for (let draws = 1; draws < 8; draws++) {
      const picks = pickCardChoices(pool, { draws, forceSp: false }, first);
      expect(picks.map((c) => c.id)).toEqual([1, 2, 3]);
    }
    // Always the last card of the remaining pool: it would be the boss from draw 8 on.
    const last = (max: number) => max - 1;
    expect(
      pickCardChoices(pool, { draws: 7, forceSp: false }, last).map((c) => c.type),
    ).not.toContain(4);
    expect(pickCardChoices(pool, { draws: 8, forceSp: false }, last)[0]!.type).toBe(4);
  });

  it("brings the boss on a forced deal and on the twentieth draw, in the first slot", () => {
    expect(
      pickCardChoices(pool, { draws: 1, forceSp: true }, first).map((c) => c.id),
    ).toEqual([53, 2, 3]);
    expect(pickCardChoices(pool, { draws: 20, forceSp: false }, first)[0]!.id).toBe(53);
    expect(pickCardChoices(pool, { draws: 19, forceSp: false }, first)[0]!.id).toBe(1);
  });
});

describe("card tower requests", () => {
  it("read 53 to 56 for the card towers and 64 to 69 for them only", () => {
    expect(parseEventTowerCall({ sCmd: 53, tbParam: [4, 3] })?.request).toEqual({
      command: 53,
      towerId: 4,
    });
    expect(
      parseEventTowerCall({
        sCmd: 252,
        tbParam: { sCmd: 55, tbParam: [4, 8, 2, 3, 1, { UseTime: 9 }, null, [], 0] },
      })?.request,
    ).toMatchObject({ command: 55, towerId: 8, node: 2, levelId: 3 });
    expect(
      parseEventTowerCall({ sCmd: 64, tbParam: { TowerId: 8, Diff: 2 } })?.request,
    ).toEqual({
      command: 64,
      towerId: 8,
      diff: 2,
    });
    expect(
      parseEventTowerCall({ sCmd: 65, tbParam: { TowerId: 4, Index: 3 } })?.request,
    ).toEqual({
      command: 65,
      towerId: 4,
      index: 3,
    });
    for (const command of [66, 67, 68, 69])
      expect(
        parseEventTowerCall({ sCmd: command, tbParam: { TowerId: 4 } })?.request,
      ).toEqual({
        command,
        towerId: 4,
      });
    // Not a card tower: unhandled. The other shared calls stay with their own towers.
    expect(
      parseEventTowerCall({ sCmd: 64, tbParam: { TowerId: 3, Diff: 1 } }),
    ).toBeNull();
    for (const call of [
      { sCmd: 61, tbParam: { nTowerId: 4 } },
      { sCmd: 176, tbParam: { activeId: 4 } },
      { sCmd: 177, tbParam: { TowerId: 8, nType: 1, nPondId: 1 } },
    ])
      expect(parseEventTowerCall(call)).toBeNull();
  });

  it("answer each failure in the shape its screen reads", () => {
    const reply = (command: number, code: number) =>
      eventTowerErrorReply(
        parseEventTowerCall({
          sCmd: command,
          tbParam: { TowerId: 4, Diff: 1, Index: 1 },
        })!.request,
        code,
      );
    expect(reply(64, 2)).toEqual({ Error: 1 });
    for (const command of [65, 66, 67, 68])
      expect(reply(command, 2)).toEqual({ nError: 2 });
    // OnResetStatg knows 1 (vigour) and 2 only.
    expect(reply(69, 5)).toEqual({ nError: 1 });
    expect(reply(69, 2)).toEqual({ nError: 2 });
  });
});

const luaDirectory = process.env.GCG_CLIENT_LUA_DIR ?? "";
describe.skipIf(!luaDirectory || !existsSync(luaDirectory))(
  "card tower task slots against the client Lua",
  () => {
    it("match AnimalizeLogic and EighthTowerLogic", () => {
      for (const [className, file] of [
        ["Animalize", "animalizelogic"],
        ["EighthTower", "eighthtowerlogic"],
      ] as const) {
        const source = readFileSync(path.join(luaDirectory, `${file}.lua.txt`), "utf8");
        const layout = CARD_TOWER_LAYOUTS[className]!;
        const offset = Number(source.match(/local nTaskOffset = ([0-9]+)/)![1]);
        const group = Number(source.match(/nTaskGroupAnimalize[ ]*=[ ]*([0-9]+)/)![1]);
        expect({ group, offset }).toEqual({
          group: layout.group,
          offset: layout.offset,
        });
        const slot = (name: string): number =>
          Number(
            source.match(new RegExp(name + "[ ]*=[ ]*nTaskOffset \\+ ([0-9]+)"))![1],
          );
        expect({
          stage: slot("nATIStage"),
          diff: slot("nATIDiff"),
          state: slot("nATIState"),
          unlockDiff: slot("nATIUnlockDiff"),
          score: slot("nATIScore"),
          drawCount: slot("nATIRandomCardCount"),
          diffAwardFlag: slot("nATIGetDiffAward"),
          choices: slot("nATIChoiseCards"),
          cards: slot("nATICards"),
          epLevelState: slot("nATIEpLevelState"),
          buffs: slot("nATIBuff"),
          energyCount: slot("nATIEnergyCount"),
          moneyCount: slot("nATIMoneyCount"),
          scoreAward: slot("nATIScoreAward"),
        }).toEqual(CARD_TASK);
        expect(Number(source.match(/nBuffCount = ([0-9]+)/)![1]) + 1).toBe(BUFF_SLOTS);
        expect(Number(source.match(/resetEneger[ ]*=[ ]*([0-9]+)/)![1])).toBe(5);
      }
    });
  },
);

// ------------------------------------------------------------------ a whole round

const G = 34;
const A = 1000;
const call = (command: number, body: unknown, settled = false) =>
  towerRequest(command, body, settled);
const diff = (tower: number, level: number) =>
  call(64, { TowerId: tower, Diff: level });
const choose = (tower: number, index: number) =>
  call(65, { TowerId: tower, Index: index });
const click = (tower: number) => call(66, { TowerId: tower });
const nextStage = (tower: number) => call(67, { TowerId: tower });
const claim = (tower: number) => call(68, { TowerId: tower });
const giveUp = (tower: number) => call(69, { TowerId: tower });
const enter = (tower: number, level: number, node: number, formation = 1) =>
  call(54, [4, tower, node, level, formation]);
const pass = (tower: number, level: number, node: number, report: unknown) =>
  call(55, [4, tower, node, level, 1, report, null, [], 0], true);
const fail = (tower: number, level: number, node: number) =>
  call(56, [4, tower, node, level, 1], true);

/** Indexes into a shrinking pool that make pickCardChoices return these card ids, in order. */
function indexesFor(poolIds: number[], ids: number[]): number[] {
  const left = [...poolIds];
  return ids.map((id) => {
    const index = left.indexOf(id);
    expect(index).toBeGreaterThanOrEqual(0);
    left.splice(index, 1);
    return index;
  });
}
const NO_BOSS = Array.from({ length: 52 }, (_, i) => i + 1);

async function run() {
  const made = await fixtures.create();
  let queue: number[] = [];
  const random = (max: number): number => {
    const value = queue.shift() ?? 0;
    expect(value).toBeLessThan(max);
    return value;
  };
  const send = (request: ReturnType<typeof call>, picks?: number[]) => {
    if (picks) queue = indexesFor(NO_BOSS, picks);
    return made.repository.handleEventTowerRequest(account, request, { random });
  };
  const player = (): Player => made.repository.get(account)!;
  return { ...made, send, player };
}

describe("Animalize round", () => {
  it("plays the story, the card draws, a fight and the boss, then the next round", async () => {
    const { send, player, store } = await run();

    // The first stage is the opening story (LevelId 1); no formation is needed.
    const entered = await send(enter(ANIMALIZE, 1, 0, 0));
    expect(entered.response).toEqual({
      tbData: [4, 4, 0, 1],
      tbDrop: [],
      tbDropItems: [],
    });
    const story = await send(pass(ANIMALIZE, 1, 0, true));
    expect(story.rejected).toBeNull();
    expect(money(player(), 3)).toBe(20);
    expect(task(player(), G, A + 6)).toBe(1); // the difficulty screen
    expect(task(player(), G, A + 34)).toBe(2); // bit 1 of the story slot
    // The story cannot be entered twice, and no fight without a card.
    expect((await send(enter(ANIMALIZE, 1, 0, 0))).rejected?.reason).toBe(
      "story_not_due",
    );
    expect((await send(enter(ANIMALIZE, 1, 1))).rejected?.reason).toBe(
      "level_not_drawn",
    );

    // Difficulty 2 is locked; 1 deals box, fate (energy), act.
    const locked = await send(diff(ANIMALIZE, 2));
    expect(locked.response).toEqual({ Error: 1 });
    const dealt = await send(diff(ANIMALIZE, 1), [1, 4, 33]);
    expect(dealt.response).toEqual({
      Error: 0,
      Diff: 1,
      tbRandom: [
        { CardId: 1, Type: 0 },
        { CardId: 4, Type: 0 },
        { CardId: 33, Type: 0 },
      ],
    });
    expect(task(player(), G, A + 6)).toBe(2);
    expect(task(player(), G, A + 7)).toBe(3); // difficulty 1, seen
    expect(task(player(), G, A + 9)).toBe(1);

    // Box card: choose, open; 100 score items go to the score and the round's token count.
    const picked = await send(choose(ANIMALIZE, 1));
    expect(picked.response).toEqual([
      { CardId: 1, Type: 1 },
      { CardId: 4, Type: 0 },
      { CardId: 33, Type: 0 },
    ]);
    expect(task(player(), G, A + 14)).toBe(3);
    expect((await send(choose(ANIMALIZE, 2))).rejected?.code).toBe(2);
    const box = await send(click(ANIMALIZE), [4, 33, 2]);
    expect(box.response).toEqual({
      bNextRandom: true,
      tbAward: [[15, 25, 1, 1, 100, 100]],
    });
    expect(task(player(), G, A + 8)).toBe(100);
    expect(task(player(), G, A + 202)).toBe(100);
    expect(stack(player(), [15, 25, 1, 1])).toBe(0);
    expect(task(player(), G, A + 9)).toBe(2);

    // Fate card 4 adds buff 1 (2 less vigour per fight), then the act card's level.
    await send(choose(ANIMALIZE, 1));
    await send(click(ANIMALIZE), [33, 34, 35]);
    expect(task(player(), G, A + 54)).toBe(1);
    await send(choose(ANIMALIZE, 1));
    const open = await send(click(ANIMALIZE));
    expect(open.response).toEqual({ bNextRandom: false, cardId: 33 });
    // The level is entered through 54: the card's level and difficulty only.
    expect((await send(enter(ANIMALIZE, 2, 1))).rejected?.reason).toBe(
      "level_not_drawn",
    );
    expect((await send(enter(ANIMALIZE, 1, 2))).rejected?.reason).toBe(
      "level_not_drawn",
    );
    expect((await send(enter(ANIMALIZE, 1, 1, 9))).rejected?.code).toBe(10);
    expect((await send(enter(ANIMALIZE, 1, 1))).rejected).toBeNull();
    const before = money(player(), 1);
    const won = await send(pass(ANIMALIZE, 1, 1, { UseTime: 5 }), [34, 35, 36]);
    expect(won.rejected).toBeNull();
    // Level 1 costs 10 vigour, the buff takes 2 off.
    expect(money(player(), 1)).toBe(before - 8);
    expect(task(player(), G, A + 201)).toBe(8);
    expect(task(player(), G, A + 35)).toBe(2); // bit 1 of difficulty 1
    expect(task(player(), G, A + 8)).toBe(130); // 100 + 30 from the level's fixed award
    expect(task(player(), G, A + 6)).toBe(2);
    expect(task(player(), G, A + 9)).toBe(4);
    expect(money(player(), 2)).toBe(2000); // first clear: gold
    // A resent settlement replays its reply and pays nothing.
    const snapshot = JSON.stringify(player());
    const resent = await send(pass(ANIMALIZE, 1, 1, { UseTime: 5 }));
    expect(resent.response).toEqual(won.response);
    expect(JSON.stringify(player())).toBe(snapshot);

    // A lost fight charges the vigour once and leaves the card open for another try.
    await send(choose(ANIMALIZE, 1));
    await send(click(ANIMALIZE));
    await send(enter(ANIMALIZE, 2, 1));
    const lost = await send(fail(ANIMALIZE, 2, 1));
    expect(lost.response).toEqual({});
    expect(money(player(), 1)).toBe(before - 16);
    expect(task(player(), G, A + 6)).toBe(3);
    expect((await send(enter(ANIMALIZE, 2, 1))).rejected).toBeNull();

    // The boss card (53, level 6) ends the round: the difficulty award, the next difficulty, the flag.
    await store.update((state) => {
      const p = state.players[account]!;
      setTask(p, G, A + 11, (53 << 1) | 1);
      setTask(p, G, A + 12, 0);
      setTask(p, G, A + 13, 0);
      setTask(p, G, A + 6, 3);
    });
    expect((await send(click(ANIMALIZE))).response).toEqual({
      bNextRandom: false,
      cardId: 53,
    });
    await send(enter(ANIMALIZE, 6, 1));
    const boss = await send(pass(ANIMALIZE, 6, 1, { UseTime: 50 }));
    expect(boss.rejected).toBeNull();
    expect(task(player(), G, A + 6)).toBe(4);
    expect(task(player(), G, A + 10)).toBe(1);
    expect(task(player(), G, A + 7)).toBe(2 << 1); // difficulty 2 open, not seen yet
    const score = task(player(), G, A + 8);
    expect(score).toBeGreaterThanOrEqual(130 + 60);

    // Next round: back to the difficulty screen with a clean run (no story for round 2).
    expect((await send(nextStage(ANIMALIZE))).rejected).toBeNull();
    expect(task(player(), G, A + 4)).toBe(2);
    expect(task(player(), G, A + 6)).toBe(1);
    expect(task(player(), G, A + 9)).toBe(0);
    expect(task(player(), G, A + 54)).toBe(0);
    expect(task(player(), G, A + 202)).toBe(0);
    expect(task(player(), G, A + 10)).toBe(0);
    expect(task(player(), G, A + 8)).toBe(score);
    expect((await send(nextStage(ANIMALIZE))).rejected?.code).toBe(2);
    expect((await send(diff(ANIMALIZE, 2), [1, 2, 3])).rejected).toBeNull();
    expect(task(player(), G, A + 7)).toBe((2 << 1) | 1);

    // The score awards: the first needs 120, paid once.
    const claimed = await send(claim(ANIMALIZE));
    expect(claimed.rejected).toBeNull();
    expect(
      (claimed.response as { tbAward: number[][] }).tbAward.length,
    ).toBeGreaterThan(0);
    expect(task(player(), G, A + 231)).toBe(1);
    expect((await send(claim(ANIMALIZE))).response).toEqual({ nError: 12 });
  });

  it("brings the boss on the draw after a boss-draw buff and uses the buff up", async () => {
    const { send, player, store } = await run();
    await store.update((state) => {
      const p = state.players[account]!;
      setTask(p, G, A + 5, 1);
      setTask(p, G, A + 6, 3);
      setTask(p, G, A + 9, 3);
      setTask(p, G, A + 11, (6 << 1) | 1); // fate card 6 carries buff 3
    });
    const opened = await send(click(ANIMALIZE), [1, 2, 3]);
    expect(opened.rejected).toBeNull();
    const first = task(player(), G, A + 11);
    expect(first >> 1).toBe(53);
    expect(task(player(), G, A + 54)).toBe(0); // one draw only: the slot is free again
    // The next draw has no boss again.
    await send(choose(ANIMALIZE, 2));
    await send(click(ANIMALIZE), [1, 2, 3]);
    expect([0, 1, 2].map((i) => task(player(), G, A + 11 + i) >> 1)).toEqual([1, 2, 3]);
  });

  it("plays the next story when a round has one, and only then", async () => {
    const { send, player, store } = await run();
    await store.update((state) => {
      const p = state.players[account]!;
      setTask(p, G, A + 4, 2);
      setTask(p, G, A + 6, 4);
    });
    expect((await send(nextStage(ANIMALIZE))).rejected).toBeNull();
    expect(task(player(), G, A + 4)).toBe(3);
    expect(task(player(), G, A + 6)).toBe(0); // story 3 is due
    expect((await send(enter(ANIMALIZE, 1, 0, 0))).rejected?.reason).toBe(
      "story_not_due",
    );
    expect((await send(enter(ANIMALIZE, 3, 0, 0))).rejected).toBeNull();
    await send(pass(ANIMALIZE, 3, 0, true));
    expect(task(player(), G, A + 6)).toBe(1);
    expect(task(player(), G, A + 34)).toBe(1 << 3);
  });

  it("gives a round up for 5 vigour only while cards are being drawn, and closes an open entry", async () => {
    const { send, player, store } = await run();
    await store.update((state) => {
      const p = state.players[account]!;
      setTask(p, G, A + 6, 1);
      p.money = [{ id: 1, count: 4 }];
    });
    expect((await send(giveUp(ANIMALIZE))).rejected?.code).toBe(2);
    await send(diff(ANIMALIZE, 1), [1, 2, 3]);
    // Too little vigour: the screen's code 1.
    const poor = await send(giveUp(ANIMALIZE));
    expect(poor.rejected?.code).toBe(5);
    expect(poor.response).toEqual({ nError: 1 });
    expect(task(player(), G, A + 6)).toBe(2);
    await store.update((state) => {
      state.players[account]!.money = [{ id: 1, count: 20 }];
    });
    await send(choose(ANIMALIZE, 1));
    await store.update((state) => {
      // An open entry of this tower, as left by a fight that was started.
      setTask(state.players[account]!, G, A + 11, (33 << 1) | 1);
    });
    await send(click(ANIMALIZE));
    expect((await send(enter(ANIMALIZE, 1, 1))).rejected).toBeNull();
    const reset = await send(giveUp(ANIMALIZE));
    expect(reset.response).toEqual({ nError: 0 });
    expect(money(player(), 1)).toBe(15);
    expect(task(player(), G, A + 6)).toBe(1);
    expect(task(player(), G, A + 9)).toBe(0);
    expect(task(player(), G, A + 11)).toBe(0);
    // A resend after the round is gone is refused and charges nothing.
    expect((await send(giveUp(ANIMALIZE))).rejected?.code).toBe(2);
    expect(money(player(), 1)).toBe(15);
  });
});

describe("EighthTower round", () => {
  it("uses its own slots (offset 3000), tables and score item", async () => {
    const { send, player } = await run();
    expect((await send(enter(EIGHTH, 1, 0, 0))).rejected).toBeNull();
    await send(pass(EIGHTH, 1, 0, true));
    expect(task(player(), G, 3000 + 6)).toBe(1);
    expect(task(player(), G, A + 6)).toBe(0);
    await send(diff(EIGHTH, 1), [1, 2, 3]);
    await send(choose(EIGHTH, 1));
    const box = await send(click(EIGHTH), [4, 5, 6]);
    expect(box.response).toEqual({
      bNextRandom: true,
      tbAward: [[15, 35, 1, 1, 100, 100]],
    });
    expect(task(player(), G, 3000 + 8)).toBe(100);
    expect(task(player(), G, 3000 + 202)).toBe(100);
    expect(task(player(), G, A + 8)).toBe(0);
  });
});
