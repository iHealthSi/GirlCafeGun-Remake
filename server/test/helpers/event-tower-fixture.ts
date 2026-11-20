import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  makeTowerTaskId,
  parseEventTowerCall,
  type EventTowerRequest,
} from "../../src/game-data/event-tower-data.js";
import type { Logger } from "../../src/logger.js";
import { JsonStore } from "../../src/persistence/json-store.js";
import {
  makeInitialState,
  PlayerRepository,
  type PersistedState,
  type Player,
} from "../../src/persistence/player-repository.js";
import { mkdtemp } from "./temp.js";

const logger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  async close() {},
};

export const account = "tester";

/** One repository on a temporary save with a level 40 commander, one card and one formation. */
export class TowerFixture {
  readonly #directories: string[] = [];

  async create(
    options: {
      level?: number;
      vigour?: number;
      setup?: (player: Player) => void;
    } = {},
  ): Promise<{ store: JsonStore<PersistedState>; repository: PlayerRepository }> {
    const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-event-tower-"));
    this.#directories.push(directory);
    const store = new JsonStore({
      filePath: path.join(directory, "state.json"),
      initialState: makeInitialState(),
      logger,
    });
    await store.initialize();
    const repository = new PlayerRepository({
      store,
      defaults: {
        name: "",
        level: 1,
        exp: 0,
        fightPower: 0,
        serverZone: 8,
        firstLevelComplete: false,
      },
      logger,
    });
    await repository.getOrCreate(account);
    await store.update((state) => {
      const player = state.players[account]!;
      player.level = options.level ?? 40;
      player.exp = 0;
      player.money = [{ id: 1, count: options.vigour ?? 100 }];
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
    return { store, repository };
  }

  async cleanup(): Promise<void> {
    for (const directory of this.#directories.splice(0))
      await rm(directory, { recursive: true, force: true });
  }
}

/** A request as the client sends it; a wrapped one goes through DoSettle (55 and 56). */
export function towerRequest(
  command: number,
  body: unknown,
  settled = false,
): EventTowerRequest {
  const call = parseEventTowerCall(
    settled
      ? { sCmd: 252, tbParam: { sCmd: command, tbParam: body } }
      : { sCmd: command, tbParam: body },
  );
  if (!call) throw new Error(`Not an event tower request: ${command}`);
  return call.request;
}

export function task(player: Player, group: number, key: number): number {
  return player.taskValues[String(makeTowerTaskId(group, key))] ?? 0;
}

export function setTask(
  player: Player,
  group: number,
  key: number,
  value: number,
): void {
  player.taskValues[String(makeTowerTaskId(group, key))] = value;
}

export function money(player: Player, id: number): number {
  return player.money.find((entry) => entry.id === id)?.count ?? 0;
}

/** Count of a plain item stack (0 when the player has none). */
export function stack(player: Player, gdpl: readonly number[]): number {
  return player.inventory
    .filter(
      (item) =>
        item.genre === gdpl[0] &&
        item.detail === gdpl[1] &&
        item.particular === gdpl[2] &&
        item.templateLevel === gdpl[3],
    )
    .reduce((total, item) => total + item.count, 0);
}

/** A stack the player already owns, for setup. */
export function giveStack(
  player: Player,
  gdpl: readonly number[],
  count: number,
): void {
  player.inventory.push({
    guid: player.nextItemGuid++,
    genre: gdpl[0]!,
    detail: gdpl[1]!,
    particular: gdpl[2]!,
    templateLevel: gdpl[3]!,
    count,
    createTime: 1,
    enhanceLevel: 0,
    enhanceExp: 0,
    breakLevel: 0,
    lockOn: 0,
  });
}
