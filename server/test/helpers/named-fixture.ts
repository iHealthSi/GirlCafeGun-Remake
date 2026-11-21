import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach } from "vitest";

import { makeTowerTaskId } from "../../src/game-data/event-tower-data.js";
import {
  parseNamedTowerCall,
  type NamedTowerRequest,
} from "../../src/game-data/named-tower-data.js";
import type { Logger } from "../../src/logger.js";
import { JsonStore } from "../../src/persistence/json-store.js";
import {
  makeInitialState,
  PlayerRepository,
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
const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

export async function fixture(
  options: { vigour?: number; money?: Record<number, number> } = {},
) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "gcg2-slice4-"));
  directories.push(directory);
  const store = new JsonStore({
    filePath: path.join(directory, "state.json"),
    initialState: makeInitialState(),
    logger,
  });
  await store.initialize();
  const repository = new PlayerRepository({
    store,
    defaults: {
      name: "Tester",
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
    player.level = 40;
    player.exp = 0;
    player.money = [
      { id: 1, count: options.vigour ?? 100 },
      ...Object.entries(options.money ?? {}).map(([id, count]) => ({
        id: Number(id),
        count,
      })),
    ];
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
    const team = (id: number, title: string) => ({
      id,
      title,
      fightCards: [
        {
          mainCardGuid: 11,
          secondaryCardGuids: [],
          usedCardGuid: 0,
          weaponGuid: 0,
          runeItemGuids: [],
        },
      ],
    });
    // 5000 is the interest team of the concert, 5106 and 5107 are the war chess teams.
    player.formations = [
      team(1, "one"),
      team(5000, "joy"),
      team(5106, "a"),
      team(5107, "b"),
    ];
    player.taskValues = {};
  });
  return { store, repository };
}

export function named(
  command: number,
  body: unknown,
  settled = false,
): NamedTowerRequest {
  const call = parseNamedTowerCall(
    settled
      ? { sCmd: 252, tbParam: { sCmd: command, tbParam: body } }
      : { sCmd: command, tbParam: body },
  );
  if (!call) throw new Error(`Not a named tower request: ${command}`);
  return call.request;
}

export function task(player: Player, group: number, key: number): number {
  return player.taskValues[String(makeTowerTaskId(group, key))] ?? 0;
}
export function money(player: Player, id: number): number {
  return player.money.find((entry) => entry.id === id)?.count ?? 0;
}
export const current = (repository: PlayerRepository): Player =>
  repository.get(account)!;
export type Reply = Record<string, unknown>;
export const reply = (result: { response: unknown }): Reply => result.response as Reply;
export const five = (rows: unknown): number[][] =>
  (rows as number[][]).map((row) => row.slice(0, 5));
