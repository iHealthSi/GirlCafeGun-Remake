"""Give the club boss (Dark Sphere Exploration) a season that repeats, so the offline club can open it.

Stock ClubCommon:GetTimeConfig() returns the Club/ClubBossTime.txt row whose dates hold the clock; the last row
ended on 2022-01-01, so it returns nil and every boss entry stays hidden. Every reader of the season goes
through GetTimeConfig(), so this recipe replaces only that function: it computes the season from the clock
each time it is called. A 14-day season starts every other Monday at 04:00 UTC+8, from 2026-11-16, and the
ten stages take turns (season n plays stage n mod 10 + 1). The table row of the stage still gives the story
name. The server computes the same calendar (server/src/game-data/club-boss-data.ts).

Phases of a season, from its start S: Show = Begin = S, End = S + 11 days (fights stop), Award = S + 13 days
(grid rewards stop), Clear = S + 14 days = the start of the next season, so there is no second without one.
"""

LUA_NAMES = {'ClubCommon.lua'}

SEASON_ANCHOR = 1_794_772_800  # 2026-11-16 04:00 UTC+8
SEASON_SECONDS = 14 * 86_400
STAGE_COUNT = 10
FIGHT_SECONDS = 11 * 86_400
AWARD_SECONDS = 13 * 86_400

TIME_CONFIG_OLD = '''function ClubCommon:GetTimeConfig()
    local curTime = GetTime()
    for _, tb in pairs(self.tbClubBossTimeConfig) do
        if curTime >= tb.ShowTime and curTime <= tb.ClearTime then
            return tb
        end
    end
    return nil
end
'''

TIME_CONFIG_NEW = '''-- Offline club boss seasons (release/client/patch_club_boss.py): 14 days from every other Monday
-- 04:00 UTC+8 since 2026-11-16, stages 1-10 in turn. The server uses the same calendar.
ClubCommon.OfflineSeasonAnchor = %(anchor)d
ClubCommon.OfflineSeasonLength = %(length)d
function ClubCommon:GetTimeConfig()
    local curTime = GetTime()
    local nSeason = math.floor((curTime - self.OfflineSeasonAnchor) / self.OfflineSeasonLength)
    local nStart = self.OfflineSeasonAnchor + nSeason * self.OfflineSeasonLength
    local stageId = nSeason %% %(stages)d + 1
    self.tbClubBossTimeConfig = self.tbClubBossTimeConfig or {}
    local tb = self.tbClubBossTimeConfig[stageId] or {}
    self.tbClubBossTimeConfig[stageId] = tb
    tb.StageId = stageId
    tb.ShowTime = nStart
    tb.BeginTime = nStart
    tb.EndTime = nStart + %(fight)d
    tb.AwardTime = nStart + %(award)d
    tb.ClearTime = nStart + self.OfflineSeasonLength
    return tb
end
''' % {'anchor': SEASON_ANCHOR, 'length': SEASON_SECONDS, 'stages': STAGE_COUNT,
       'fight': FIGHT_SECONDS, 'award': AWARD_SECONDS}


def replace_one(text, old, new):
    assert text.count(old) == 1, old[:120]
    return text.replace(old, new)


def lua_script(name, source):
    assert name in LUA_NAMES, name
    text = source.decode('utf8').replace('\r\n', '\n')
    text = replace_one(text, TIME_CONFIG_OLD, TIME_CONFIG_NEW)
    return text.encode('utf8')


def season(now):
    """(season index, stage id, start) of the season that holds `now` (seconds); the Lua and server agree."""
    index = (now - SEASON_ANCHOR) // SEASON_SECONDS
    return index, index % STAGE_COUNT + 1, SEASON_ANCHOR + index * SEASON_SECONDS
