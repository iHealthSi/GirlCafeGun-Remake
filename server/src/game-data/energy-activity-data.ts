import { readFileSync } from "node:fs";
import path from "node:path";
import { DAILY_SIGN_UP_TASK_GROUP } from "./daily-sign-up-data.js";

/**
 * 限时领体力（ActivityList id 8 `activity.power`，Template 4，面板
 * UI_EnergyGet）。领取窗口与体力数值来自 NormalActivity/EnergyActivity.txt。
 */
export const ENERGY_ACTIVITY_ID = 8;
/** UI_EnergyGet.lua:80 与每日签到同在任务组 20。 */
export const ENERGY_ACTIVITY_TASK_GROUP = DAILY_SIGN_UP_TASK_GROUP;
/** UI_EnergyGet.lua:80: me:GetTaskValue(20, 10000 + tbConfig.nId). */
export const ENERGY_ACTIVITY_TASK_BASE = 10_000;

export interface EnergyActivitySlot {
  id: number;
  /** HHMM, local time. */
  beginTime: number;
  /** HHMM, local time. */
  endTime: number;
  energy: number;
}

type Row = Record<string, string>;

/** LoadTabFile(path, 3): 3 header rows, the 3rd one holds the column names. */
function parseTable(text: string): Row[] {
  const rows = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("\t"));
  if (rows.length < 4) throw new Error("EnergyActivity table is missing rows");
  const header = rows[2] ?? [];
  return rows.slice(3).map((cells) => {
    const row: Row = {};
    header.forEach((name, index) => {
      row[name] = cells[index] ?? "";
    });
    return row;
  });
}

function integer(text: string | undefined): number {
  if (text === undefined) return 0;
  const value = Number(text.trim());
  if (text.trim() !== "" && Number.isSafeInteger(value)) return value;
  return 0;
}

let cachedSlots: readonly EnergyActivitySlot[] | undefined;

/** Claim windows and vigour per row of NormalActivity/EnergyActivity.txt. */
export function loadEnergyActivitySlots(): readonly EnergyActivitySlot[] {
  if (cachedSlots) return cachedSlots;
  const text = readFileSync(
    path.resolve(process.cwd(), "resources/activity", "energyactivity.txt"),
    "utf8",
  );
  cachedSlots = parseTable(text)
    .map((row) => ({
      id: integer(row.Id),
      beginTime: integer(row.BeginTime),
      endTime: integer(row.EndTime),
      energy: integer(row.Energy),
    }))
    .filter((slot) => slot.id > 0);
  return cachedSlots;
}

export function makeEnergyActivityTaskId(slotId: number): number {
  return (ENERGY_ACTIVITY_TASK_GROUP << 16) | (ENERGY_ACTIVITY_TASK_BASE + slotId);
}

/** Local HHMM (UI_EnergyGet.lua:44 `Game.Utils.DateTime('HHmm')`). */
function localHHmm(now: number): number {
  const date = new Date(now);
  return date.getHours() * 100 + date.getMinutes();
}

/**
 * The row whose window contains the local time, mirroring
 * UI_EnergyGet.lua:49-60, including windows that span midnight. The server
 * runs on the same device/clock as the client, so local time is authoritative.
 */
export function currentEnergyActivitySlot(
  now = Date.now(),
): EnergyActivitySlot | null {
  const nowTime = localHHmm(now);
  return (
    loadEnergyActivitySlots().find(
      (slot) =>
        slot.beginTime <= slot.endTime
          ? slot.beginTime <= nowTime && nowTime < slot.endTime
          : nowTime >= slot.beginTime || nowTime < slot.endTime,
    ) ?? null
  );
}

/** Local calendar date (YYYY-MM-DD), the energy-claim day. */
export function energyActivityDate(now: number): string {
  const date = new Date(now);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}
