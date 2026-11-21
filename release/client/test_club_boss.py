"""Mock test of patch_club_boss on the real ClubCommon.lua.

run_script(stock) loads ClubCommon.lua in Lua 5.3 twice, stock and patched, with the ten rows of the 0.1.3
Club/ClubBossTime.txt, sets the clock, and asks ClubCommon what it shows. The stock script finds no season in
2026 (the table ended on 2022-01-01: the bug); the patched one finds the season of the calendar that
patch_club_boss.season() and the server compute, with the right phase (fight, award), at every second,
including the last second of a season and the first of the next. The table row still gives the story name.
run_bundle(built) reads ClubCommon.lua from a built lua.u and runs the same checks on it.
Command: python test_club_boss.py <release APK or lua.u>
"""
from pathlib import Path
import sys

from lupa.lua53 import LuaRuntime

import patch_club_boss as p

# StageId, ShowTime, BeginTime, EndTime, AwardTime, ClearTime of the 0.1.3 table (story names left out).
STOCK_ROWS = [
    (1, '2020-03-17-0800', '2020-03-20-0400', '2020-03-30-0400', '2020-03-31-0400', '2020-04-07-0400'),
    (2, '2020-05-29-0800', '2020-06-05-1200', '2020-06-15-0400', '2020-06-16-0400', '2020-06-23-0400'),
    (3, '2020-07-13-0800', '2020-07-17-0400', '2020-07-27-0400', '2020-07-28-0400', '2020-08-03-0400'),
    (4, '2020-08-28-0800', '2020-09-04-0400', '2020-09-14-0400', '2020-09-15-0400', '2020-09-21-0400'),
    (5, '2020-10-15-0800', '2020-10-23-0400', '2020-11-02-0400', '2020-11-03-0400', '2020-11-09-0400'),
    (6, '2020-12-11-1200', '2020-12-18-0400', '2020-12-28-0400', '2020-12-29-0400', '2021-01-05-0400'),
    (7, '2021-02-27-1200', '2021-03-06-0400', '2021-03-16-0400', '2021-03-17-0400', '2021-03-23-0400'),
    (8, '2021-05-16-1200', '2021-05-28-0400', '2021-06-07-0400', '2021-06-08-0400', '2021-06-15-0400'),
    (9, '2021-08-27-0400', '2021-09-03-0400', '2021-09-13-0400', '2021-09-20-0400', '2021-09-27-0400'),
    (10, '2021-12-07-0400', '2021-12-14-0400', '2021-12-24-0400', '2021-12-25-0400', '2022-01-01-0400'),
]

HARNESS = r'''
now = 0
function GetTime() return now end
-- the table's dates are UTC+8; os.time is not needed for the check
local function days(y, m, d)
  if m <= 2 then y = y - 1; m = m + 12 end
  return 365 * y + y // 4 - y // 100 + y // 400 + (153 * (m - 3) + 2) // 5 + d - 719469
end
function GetDate2Time(s)
  local y, mo, d, h, mi = s:match('(%d+)-(%d+)-(%d+)-(%d%d)(%d%d)')
  return days(tonumber(y), tonumber(mo), tonumber(d)) * 86400 + tonumber(h) * 3600 + tonumber(mi) * 60 - 8 * 3600
end
rows = {}
-- ClubCommon:Init() runs when the file loads: the other club tables come back empty
function LoadTabFile(path) if path == 'Club/ClubBossTime.txt' then return rows end return {} end
function RegisterLoginEvents() end
'''

PROBE = r'''
local t = ...
now = t
ClubCommon:LoadClubBossTimeConfig()
local tb = ClubCommon:GetTimeConfig()
if not tb then return 0, 0, 0, 0, false, false, false, '' end
return tb.StageId, tb.BeginTime, tb.EndTime, tb.ClearTime,
  ClubCommon:IsClubBossShow(), (ClubCommon:IsClubBossOpen()), (ClubCommon:IsClubBossAward()), tb.StoryName
'''

DAY = 86_400


def runtime(script):
    lua = LuaRuntime()
    lua.execute(HARNESS)
    rows = lua.eval('rows')
    for index, (stage, *dates) in enumerate(STOCK_ROWS, 1):
        row = lua.table_from({'StageId': str(stage), 'ShowTime': dates[0], 'BeginTime': dates[1],
                              'EndTime': dates[2], 'AwardTime': dates[3], 'ClearTime': dates[4],
                              'StoryName': 'activitydaily/guild_blackreach_opening%02d' % stage})
        rows[index] = row
    lua.execute(script.decode('utf8') if isinstance(script, bytes) else script)
    probe = lua.eval('function(...) %s end' % PROBE)
    return lambda now: tuple(probe(now))


def expected(now):
    index, stage, start = p.season(now)
    fight = start <= now <= start + p.FIGHT_SECONDS
    award = start + p.FIGHT_SECONDS <= now <= start + p.AWARD_SECONDS
    story = 'activitydaily/guild_blackreach_opening%02d' % stage
    return stage, start, start + p.FIGHT_SECONDS, start + p.SEASON_SECONDS, True, fight, award, story


# Moments: inside the first season, its award days, the next season, the second before the anchor,
# the eleventh season (stage 1 again), and the last second of a season.
A = p.SEASON_ANCHOR
MOMENTS = [A + 5 * DAY, A + 12 * DAY, A + 14 * DAY + 60, A - 1, A + 140 * DAY + 3_600,
           A + 3 * p.SEASON_SECONDS - 1, A + 3 * p.SEASON_SECONDS - 0.5, A + 3 * p.SEASON_SECONDS, A + 400 * DAY]


def check(probe):
    results = {}
    for now in MOMENTS:
        got = probe(now)
        want = expected(now)
        assert got == want, (now, got, want)
        results[now] = got[0]
    # pinned against the server's calendar test (server/test/club-boss-data.test.ts)
    assert results[A + 5 * DAY] == 1 and results[A + 14 * DAY + 60] == 2 and results[A - 1] == 10
    assert results[A + 140 * DAY + 3_600] == 1
    return results


def run_script(stock):
    stock_probe = runtime(stock)
    stock_result = stock_probe(A + 5 * DAY)
    assert stock_result[0] == 0, 'the stock table must find no season in 2026: %r' % (stock_result,)
    assert stock_probe(1_585_000_000)[0] == 1, 'the stock script reads the 2020 season 1 dates'
    patched = p.lua_script('ClubCommon.lua', stock)
    stages = check(runtime(patched))
    return {'stockSeasonIn2026': stock_result[0], 'patchedStages': stages}


def script_from_bundle(bundle):
    import asset_tools
    _, raw = asset_tools.unityfs(asset_tools.transform(bundle))
    _, objects = asset_tools.serialized_objects(raw)
    obj = next(o for o in objects if o.get('name') == 'ClubCommon.lua')
    return raw[obj['script_start']:obj['script_start'] + obj['script_length']]


def run_bundle(built):
    script = script_from_bundle(built).decode('utf8')
    assert p.TIME_CONFIG_NEW in script.replace('\r\n', '\n'), 'ClubCommon.lua lacks the offline club boss seasons'
    check(runtime(script))
    return True


if __name__ == '__main__':
    import zipfile
    path = sys.argv[1]
    source = zipfile.ZipFile(path).read('assets/lua.u') if path.endswith('.apk') else Path(path).read_bytes()
    print(run_script(script_from_bundle(source)))
