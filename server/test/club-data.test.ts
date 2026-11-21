import { describe, expect, it } from "vitest";

import {
  applyClubAwards,
  changeClubPosition,
  claimClubDailyAward,
  claimClubMission,
  claimClubTier,
  CLUB_DISSOLVE_TIME_TASK_ID,
  CLUB_DISSOLVE_WAIT_SECONDS,
  CLUB_LEVELS,
  CLUB_LOG_AUTO_JOINED,
  CLUB_LOG_CREATED,
  CLUB_LOG_LEVEL,
  CLUB_MISSION_DAILY_AWARD,
  CLUB_MISSION_ERROR_CLAIMED,
  CLUB_MISSION_ERROR_NOT_DONE,
  CLUB_MISSION_VIGOUR,
  CLUB_MISSIONS,
  CLUB_QUIT_TIME_TASK_ID,
  CLUB_TIER_TASK_ID,
  CLUB_TIERS,
  CLUBMATE_COUNT,
  CLUBMATE_DAILY_POINTS,
  ClubError,
  clubLevelForExp,
  clubMemberList,
  clubMissionErrorCode,
  clubMissionProgress,
  clubPayload,
  clubTaskId,
  clubTaskSyncValues,
  clubWeek,
  createClubState,
  hasClaimedClubMission,
  isClubmateRoleId,
  kickClubMember,
  parseCreateClubRequest,
  reconcileClub,
  recordClubMissionProgress,
  requestClubDissolve,
  splitClubAwards,
  type ClubPlayer,
} from "../src/game-data/club-data.js";

const DAY = 86_400_000;
/** Monday 2026-11-23 05:00 in Shanghai (the operational day starts at 04:00 there). */
const MONDAY = Date.UTC(2026, 10, 22, 21, 0);
/** Alex's create request from the phone's server log (2026-11-20). */
const CREATE_REQUEST = { applylevel: 10, clubname: "GCG revival", autojoinlevel: 10 };

function player(): ClubPlayer {
  return { roleId: 1, name: "HealthS", level: 23, taskValues: {} };
}

function withClub(now = MONDAY): ClubPlayer {
  const result = player();
  result.club = createClubState(result, parseCreateClubRequest(CREATE_REQUEST), now);
  return result;
}

function self(p: ClubPlayer) {
  return { roleId: p.roleId, name: p.name, level: p.level, girlIconId: 3 };
}

function missionValue(p: ClubPlayer, id: number): number {
  return p.taskValues[String(clubTaskId(id))] ?? 0;
}

describe("club tables (0.1.3 setting.u)", () => {
  it("keeps ten cumulative levels and the weekly missions the client lists", () => {
    expect(CLUB_LEVELS.map(({ exp }) => exp)).toEqual([
      0, 10_000, 20_000, 30_000, 50_000, 70_000, 90_000, 110_000, 130_000, 150_000,
    ]);
    expect(clubLevelForExp(9_999)).toBe(1);
    expect(clubLevelForExp(10_000)).toBe(2);
    expect(clubLevelForExp(1_000_000)).toBe(10);
    expect(CLUB_MISSIONS.map(({ id }) => id)).toEqual([
      50_004, 50_008, 50_009, 50_010, 50_011, 50_012, 50_013, 50_014, 50_019, 50_024,
    ]);
    expect(CLUB_TIERS.map(({ points }) => points)).toEqual([
      500, 1_200, 2_000, 3_000, 4_000,
    ]);
  });

  it("parses the phone's create request and refuses an empty name with a tip", () => {
    expect(parseCreateClubRequest({ sCmd: 10_001, tbParam: CREATE_REQUEST })).toEqual({
      name: "GCG revival",
      applyLevel: 10,
      autoJoinLevel: 10,
    });
    expect(() => parseCreateClubRequest({ clubname: "   " })).toThrow(ClubError);
    try {
      parseCreateClubRequest({});
    } catch (error) {
      expect((error as ClubError).tip).toBe("ui.Club.namedes");
    }
  });
});

describe("club week", () => {
  it("starts on Monday at 04:00 Shanghai time", () => {
    const sundayNight = Date.UTC(2026, 10, 22, 19, 59);
    expect(clubWeek(sundayNight)).toBe("2026-11-16");
    expect(clubWeek(sundayNight + 60_000)).toBe("2026-11-23");
    expect(clubWeek(MONDAY + 6 * DAY)).toBe("2026-11-23");
    expect(clubWeek(MONDAY + 7 * DAY)).toBe("2026-11-30");
  });
});

describe("a new club", () => {
  it("has six clubmates with their own names, girls and ids, and a creation log", () => {
    const p = withClub();
    const club = p.club!;
    expect(club.id).toBe(100_001);
    expect(club.members).toHaveLength(CLUBMATE_COUNT);
    expect(new Set(club.members.map(({ name }) => name)).size).toBe(CLUBMATE_COUNT);
    expect(new Set(club.members.map(({ girlIconId }) => girlIconId)).size).toBe(
      CLUBMATE_COUNT,
    );
    expect(new Set(club.members.map(({ roleId }) => roleId)).size).toBe(CLUBMATE_COUNT);
    expect(club.members.every(({ roleId }) => roleId !== p.roleId)).toBe(true);
    expect(club.log[0]).toMatchObject({ type: CLUB_LOG_CREATED, strlist: ["HealthS"] });
  });

  it("sends every field the club screens read without a nil check", () => {
    const p = withClub();
    reconcileClub(p, MONDAY);
    const payload = clubPayload(p.club!, self(p), MONDAY) as {
      primary: Record<string, unknown>;
      memberlist: Record<string, unknown>[];
      applylist: unknown[];
      clubboss: Record<string, unknown>;
    };
    for (const key of [
      "id",
      "level",
      "exp",
      "weektaskvalue",
      "reqdissolvetime",
      "count",
    ]) {
      expect(typeof payload.primary[key], key).toBe("number");
    }
    expect(payload.primary).toMatchObject({
      name: "GCG revival",
      headername: "HealthS",
      notice: "",
      applylevel: 10,
      autojoinlevel: 10,
      weektaskvalue: 540,
      count: 7,
    });
    // The client loads the boss stage from it (patch_club_boss.py): always there.
    expect(payload.clubboss).toMatchObject({ stageid: 1, score: 0 });
    expect(payload.applylist).toEqual([]);
    expect(payload.memberlist).toHaveLength(7);
    expect(payload.memberlist[0]).toMatchObject({
      roleid: 1,
      pos: 9,
      state: 1,
      girliconid: 3,
    });
    const time = Math.floor(MONDAY / 1_000);
    for (const member of payload.memberlist) {
      for (const key of [
        "roleid",
        "level",
        "pos",
        "state",
        "last7_contribute",
        "off_times",
        "girliconid",
      ]) {
        expect(typeof member[key], key).toBe("number");
      }
      expect(member.headframeid).toBe(0);
      const offline = time - (member.off_times as number);
      expect(offline).not.toBe(3 * 86_400);
      expect(offline).not.toBe(7 * 86_400);
    }
  });
});

describe("clubmates and the weekly tiers", () => {
  it("add their points once per operational day the player plays", () => {
    const p = withClub();
    expect(reconcileClub(p, MONDAY)).toBe("changed");
    expect(reconcileClub(p, MONDAY + 60_000)).toBe("unchanged");
    expect(p.club!.weekTaskValue).toBe(540);
    expect(reconcileClub(p, MONDAY + DAY)).toBe("changed");
    expect(p.club!.weekTaskValue).toBe(1_080);
    expect(p.club!.exp).toBe(1_080);
    expect(clubMemberList(p.club!, self(p), MONDAY + DAY)[1]!.last7_contribute).toBe(
      p.club!.members[0]!.dailyPoints * 2,
    );
  });

  it("reach tier 5 only with daily play and the player's own club missions", () => {
    const daily = CLUBMATE_DAILY_POINTS.reduce((sum, points) => sum + points, 0);
    const playerPoints = CLUB_MISSIONS.flatMap(({ awards }) => awards)
      .filter(([genre, detail]) => genre === 15 && detail === 12)
      .reduce((sum, award) => sum + award[4], 0);
    expect(playerPoints).toBe(270);
    expect(daily * 7).toBeLessThan(4_000);
    expect(daily * 7).toBeGreaterThanOrEqual(3_000);
    expect(daily * 7 + playerPoints).toBeGreaterThanOrEqual(4_000);

    const p = withClub();
    for (let day = 0; day < 7; day++) reconcileClub(p, MONDAY + day * DAY);
    expect(p.club!.weekTaskValue).toBe(daily * 7);
    expect(() => claimClubTier(p, 5, MONDAY + 6 * DAY)).toThrow(ClubError);
    applyClubAwards(p, [[15, 12, 1, 1, playerPoints]], MONDAY + 6 * DAY);
    expect(claimClubTier(p, 5, MONDAY + 6 * DAY)).toEqual([[15, 2, 1, 1, 100]]);
    expect(() => claimClubTier(p, 5, MONDAY + 6 * DAY)).toThrow(ClubError);
  });

  it("start again each Monday: points, mission values and tier bits go to 0", () => {
    const p = withClub();
    reconcileClub(p, MONDAY);
    recordClubMissionProgress(p, CLUB_MISSION_VIGOUR, 500, MONDAY);
    claimClubTier(p, 1, MONDAY);
    expect(p.taskValues[String(clubTaskId(CLUB_TIER_TASK_ID))]).toBe(2);

    reconcileClub(p, MONDAY + 7 * DAY);
    expect(p.club!.week).toBe("2026-11-30");
    expect(p.club!.weekTaskValue).toBe(540);
    expect(missionValue(p, CLUB_MISSION_VIGOUR)).toBe(0);
    expect(p.taskValues[String(clubTaskId(CLUB_TIER_TASK_ID))]).toBe(0);
    for (const mission of CLUB_MISSIONS)
      expect(String(clubTaskId(mission.id)) in p.taskValues).toBe(true);
  });

  it("refill the club to six at the weekly reset after a kick", () => {
    const p = withClub();
    const kicked = p.club!.members[2]!;
    kickClubMember(p, { kickroleid: kicked.roleId }, MONDAY);
    expect(p.club!.members).toHaveLength(CLUBMATE_COUNT - 1);
    reconcileClub(p, MONDAY + 7 * DAY);
    expect(p.club!.members).toHaveLength(CLUBMATE_COUNT);
    expect(p.club!.members.map(({ dailyPoints }) => dailyPoints).sort()).toEqual(
      [...CLUBMATE_DAILY_POINTS].sort(),
    );
    expect(p.club!.log.some(({ type }) => type === CLUB_LOG_AUTO_JOINED)).toBe(true);
  });

  it("allow at most two deputy chiefs", () => {
    const p = withClub();
    const [first, second, third] = p.club!.members;
    changeClubPosition(p, { memberid: first!.roleId, srcpos: 0, dstpos: 8 }, MONDAY);
    changeClubPosition(p, { memberid: second!.roleId, srcpos: 0, dstpos: 8 }, MONDAY);
    expect(() =>
      changeClubPosition(p, { memberid: third!.roleId, srcpos: 0, dstpos: 8 }, MONDAY),
    ).toThrow(ClubError);
    const primary = clubPayload(p.club!, self(p), MONDAY).primary as Record<
      string,
      unknown
    >;
    expect(primary.vice1id).toBe(first!.roleId);
    expect(primary.vice2id).toBe(second!.roleId);
  });
});

describe("club missions", () => {
  it("count progress only with a club, capped at the target, keeping the claimed bit", () => {
    const none = player();
    expect(recordClubMissionProgress(none, CLUB_MISSION_VIGOUR, 10, MONDAY)).toBe(
      false,
    );
    expect(none.taskValues).toEqual({});

    const p = withClub();
    expect(recordClubMissionProgress(p, CLUB_MISSION_VIGOUR, 1_000, MONDAY)).toBe(true);
    expect(clubMissionProgress(missionValue(p, CLUB_MISSION_VIGOUR))).toBe(1_000);
    expect(() => claimClubMission(p, CLUB_MISSION_VIGOUR, MONDAY)).toThrow(ClubError);
    recordClubMissionProgress(p, CLUB_MISSION_VIGOUR, 9_999, MONDAY);
    expect(clubMissionProgress(missionValue(p, CLUB_MISSION_VIGOUR))).toBe(1_500);
    expect(claimClubMission(p, CLUB_MISSION_VIGOUR, MONDAY)).toEqual(
      CLUB_MISSIONS[0]!.awards,
    );
    expect(hasClaimedClubMission(missionValue(p, CLUB_MISSION_VIGOUR))).toBe(true);
    expect(recordClubMissionProgress(p, CLUB_MISSION_VIGOUR, 1, MONDAY)).toBe(false);
    try {
      claimClubMission(p, CLUB_MISSION_VIGOUR, MONDAY);
    } catch (error) {
      expect(clubMissionErrorCode(error as ClubError)).toBe(CLUB_MISSION_ERROR_CLAIMED);
    }
  });

  it("clear last week's progress inside the progress hook, before the first club reply", () => {
    const p = withClub();
    recordClubMissionProgress(p, CLUB_MISSION_VIGOUR, 1_200, MONDAY);
    recordClubMissionProgress(p, CLUB_MISSION_VIGOUR, 100, MONDAY + 7 * DAY);
    expect(clubMissionProgress(missionValue(p, CLUB_MISSION_VIGOUR))).toBe(100);
  });

  it("put 15-12, 15-13 and 15-36 into the club, never into the bag", () => {
    const p = withClub();
    const rest = applyClubAwards(
      p,
      [
        [15, 14, 1, 1, 15],
        [15, 12, 1, 1, 30],
        [15, 13, 1, 1, 10_000],
        [15, 36, 1, 1, 1],
        [7, 2, 7, 5, 1],
      ],
      MONDAY,
    );
    expect(rest).toEqual([
      [15, 14, 1, 1, 15],
      [7, 2, 7, 5, 1],
    ]);
    expect(p.club!.weekTaskValue).toBe(30);
    expect(p.club!.selfWeekPoints).toBe(30);
    expect(p.club!.level).toBe(2);
    expect(p.club!.log.at(-1)).toMatchObject({ type: CLUB_LOG_LEVEL, strlist: ["2"] });
    expect(p.taskValues[String((1 << 16) | 552)]).toBe(1);
    expect(splitClubAwards([[15, 12, 1, 1, 5]]).activePoints).toBe(5);
  });

  it("map unfinished claims to the client's error texts", () => {
    const p = withClub();
    try {
      claimClubMission(p, CLUB_MISSION_DAILY_AWARD, MONDAY);
    } catch (error) {
      expect(clubMissionErrorCode(error as ClubError)).toBe(
        CLUB_MISSION_ERROR_NOT_DONE,
      );
    }
  });
});

describe("club daily reward", () => {
  it("pays the level's award once per server day and counts mission 50024", () => {
    const p = withClub();
    expect(claimClubDailyAward(p, MONDAY)).toEqual(CLUB_LEVELS[0]!.dailyAwards);
    expect(claimClubDailyAward(p, MONDAY + 3_600_000)).toBeNull();
    expect(claimClubDailyAward(p, MONDAY + DAY)).not.toBeNull();
    expect(clubMissionProgress(missionValue(p, CLUB_MISSION_DAILY_AWARD))).toBe(2);
    expect(claimClubDailyAward(player(), MONDAY)).toBeNull();
  });
});

describe("club dissolve", () => {
  it("waits three days, can be cancelled, then removes the club", () => {
    const p = withClub();
    const time = Math.floor(MONDAY / 1_000);
    requestClubDissolve(p, { dissoslve: 1 }, MONDAY);
    expect(p.club!.reqDissolveTime).toBe(time);
    expect(p.taskValues[String(CLUB_DISSOLVE_TIME_TASK_ID)]).toBe(time);
    requestClubDissolve(p, { dissoslve: 0 }, MONDAY);
    expect(p.club!.reqDissolveTime).toBe(0);

    requestClubDissolve(p, { dissoslve: 1 }, MONDAY);
    recordClubMissionProgress(p, CLUB_MISSION_VIGOUR, 10, MONDAY);
    expect(
      reconcileClub(p, MONDAY + (CLUB_DISSOLVE_WAIT_SECONDS - 1) * 1_000),
    ).not.toBe("dissolved");
    expect(reconcileClub(p, MONDAY + CLUB_DISSOLVE_WAIT_SECONDS * 1_000)).toBe(
      "dissolved",
    );
    expect(p.club).toBeUndefined();
    expect(p.taskValues[String(CLUB_QUIT_TIME_TASK_ID)]).toBe(
      time + CLUB_DISSOLVE_WAIT_SECONDS,
    );
    expect(missionValue(p, CLUB_MISSION_VIGOUR)).toBe(0);
  });
});

describe("club review fixes", () => {
  it("does not refill the club while a dissolve is pending, so it can still be cancelled", () => {
    const p = withClub();
    for (const member of [...p.club!.members]) {
      kickClubMember(p, { kickroleid: member.roleId }, MONDAY);
    }
    requestClubDissolve(p, { dissoslve: 1 }, MONDAY + 5 * DAY);
    reconcileClub(p, MONDAY + 7 * DAY);
    expect(p.club!.members).toHaveLength(0);
    requestClubDissolve(p, { dissoslve: 0 }, MONDAY + 7 * DAY);
    reconcileClub(p, MONDAY + 14 * DAY);
    expect(p.club!.members).toHaveLength(CLUBMATE_COUNT);
  });

  it("leaves the client's daily-reward day (1, 35) out of club task syncs", () => {
    const values = { [String((1 << 16) | 35)]: 7, [String(clubTaskId(50_004))]: 4 };
    expect(clubTaskSyncValues(values)).toEqual({ [String(clubTaskId(50_004))]: 4 });
    expect(values[String((1 << 16) | 35)]).toBe(7);
  });

  it("knows a clubmate's role id", () => {
    const p = withClub();
    expect(isClubmateRoleId(p, p.club!.members[0]!.roleId)).toBe(true);
    expect(isClubmateRoleId(p, p.roleId)).toBe(false);
    expect(isClubmateRoleId(player(), 8_800_001)).toBe(false);
  });
});
