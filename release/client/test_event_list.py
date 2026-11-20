"""Mock test of patch_event_list on the real UI_FightMode.lua and UI_CoopChoose.lua.

run_script(fight, choose, towers) replays the Attack menu in Lua with the Tower.txt rows of the release
(all dates in the past):
- stock CheckEventOpen finds no open event (the "Unavailable now!" tile: the bug);
- patched CheckEventOpen keeps the tile open and its click opens UI_CoopChoose with the event list;
- the list holds every served class once, oldest first, without Animalize, EighthTower, TwentyFirstTower;
- UI_CoopChoose builds the page (Unity calls are mocked) and a tap on a tile enters that tower with the
  stock date check passing; a second tap closes the first tower again;
- UI_CoopChoose opened with stock data still takes its stock path;
- a second family (War Chess, mocked) joins the list by date, a tap opens only its row, a later tap closes it.
run_bundle(built) reads both scripts from a built lua.u and replays the same scenario.
Command: python test_event_list.py <release APK or lua.u>
"""
from pathlib import Path
import sys
import zipfile

from lupa.lua53 import LuaRuntime

import patch_event_list as g

HARNESS = r'''
NOW = 1795000000   -- 2026-11-18, after every event of the release
LOGS = {}
print = function(msg) LOGS[#LOGS + 1] = tostring(msg) end
function GetTime() return NOW end
UIREG = {}
UI = {
  Register = function(name) local t = {}; UIREG[name] = t; return t end,
  OpenAsChild = function(name, data) OPENED = { name = name, data = data } end,
}
Game = { MessageBox = { Simple = function(m) MESSAGES = (MESSAGES or 0) + 1; LAST_MESSAGE = m end } }
function UIText(k) return k end
function Text(k) return k end
function Sprite(path) return { sprite = path } end
function typeof(x) return x end

ActivitiesConfig = { tbSmallTowerConfig = {} }
ENTERED = {}
ActivitiesLogic = {
  ActivityType = { Challenge = 6 },
  GetAllOpenSmallTower = function(self)
    local out = {}
    for _, tb in pairs(ActivitiesConfig.tbSmallTowerConfig) do
      if GetTime() >= tb.BeginTime and GetTime() <= tb.ClearTime then out[#out + 1] = tb end
    end
    return out
  end,
  -- the stock GetTower: GetCurTowerConfig then UpdateGetTower (ActivitiesLogic.lua:387-421)
  GetTower = function(self, id)
    local tb = ActivitiesConfig.tbSmallTowerConfig[id]
    if GetTime() > tb.BeginTime and GetTime() < tb.ClearTime then ENTERED[#ENTERED + 1] = id
    else Game.MessageBox.Simple('UI_FightMode.tip') end
  end,
}
local function none() return {} end
MicroClimbTower = { GetAllOpenClimbTower = none }
CoopClientLogic = { GetAllActivities = none }
MusicActivityLogic = { GetAllOpenTower = none }
AnniversaryMainLogic = { GetOpenConfig = none }

-- Unity objects: every field and call answers another mock, a few calls are recorded.
LISTENERS = {}
local function mock(name)
  local store = {}
  return setmetatable({}, {
    __index = function(_, k)
      if k == 'AddListener' then return function(_, fn) LISTENERS[#LISTENERS + 1] = fn end end
      if k == 'Find' then return function(_, path) if path == 'GcgEventView' then return nil end return mock(path) end end
      local v = store[k]
      if v == nil then v = mock(name .. '.' .. tostring(k)); store[k] = v end
      return v
    end,
    __newindex = function(_, k, v) store[k] = v end,
    __call = function() return mock(name .. '()') end,
  })
end
U3D = mock('U3D')

function fightUi()
  local ui = setmetatable({}, { __index = UIREG.UI_FightMode })
  ui.BtnMission = 'BtnMission'
  ui.ImgMission = { enabled = false }
  ui.ImgSelectMission = {}
  ui.OnClickAndClear = function(self, path, fn, target) self.clicks = self.clicks or {}; self.clicks[target] = fn end
  ui.UpdateMark = function() end
  return ui
end
function chooseUi()
  local ui = setmetatable({}, { __index = UIREG.UI_CoopChoose })
  ui.transMul = mock('Mul'); ui.transTwo = mock('Two')
  ui.Find = function(self, path) return mock(path) end
  ui.Cache = function(self, k, v) if v ~= nil then self.cached = v end return self.cached end
  ui.OnClickAndClear = function() end
  ui.GetComponent = function() return mock('component') end
  ui.UpdateTwo = function(self, data) self.stockTwo = #data end
  return ui
end
'''

SCENARIO = r'''
local ui = fightUi()
local open = ui:CheckEventOpen()
if not EventList then return open, 0, '', 0, 0, 0, '' end
local click = ui.clicks and ui.clicks.BtnMission
click()
local list = OPENED.data.gcgEventList
local ids = {}
for i, e in ipairs(list) do ids[i] = e.Id .. ':' .. e.Name end

local choose = chooseUi()
choose:OnOpen(OPENED.data)
local built = choose.gcgEventPage and choose.gcgEventPage.count or -1
-- tap the third and then the fifth tile
LISTENERS[3]()
LISTENERS[5]()
local first = ActivitiesConfig.tbSmallTowerConfig[list[3].Id]
local firstClosed = not (GetTime() > first.BeginTime and GetTime() < first.ClearTime)
-- the same page object opened again for its stock use
choose:OnOpen({ { BG = 'a' }, { BG = 'b' } })
local failed = 0
for _, line in ipairs(LOGS) do if line:find('page failed') then failed = failed + 1 end end
return open, #list, table.concat(ids, ','), built, #ENTERED, failed,
  table.concat(ENTERED, ',') .. '|' .. tostring(firstClosed) .. '|' .. tostring(choose.stockTwo) .. '|' .. tostring(choose.gcgEventList)
'''


def towers_lua(rows):
    """Lua that fills ActivitiesConfig.tbSmallTowerConfig like LoadSmallTowerConfig, from (id, class, name, begin, end, clear)."""
    lines = ['local c = ActivitiesConfig.tbSmallTowerConfig']
    for tower, cls, name, begin, end, clear in rows:
        lines.append('c[%d] = { Id = %d, ClassName = %r, Name = %r, Icon = %r, BeginTime = %d, EndTime = %d, ClearTime = %d }'
                     % (tower, tower, cls, name, 'Poster/fightmode_mission%d_normal_Mul.png' % tower, begin, end, clear))
    return '\n'.join(lines).replace("'", '"')


def tower_rows(text):
    """Tower.txt of the release -> rows with unix dates (Asia/Shanghai, as the client's tables)."""
    import datetime
    lines = text.replace('\r\n', '\n').split('\n')
    header = lines[2].split('\t')
    tz = datetime.timezone(datetime.timedelta(hours=8))

    def stamp(value):
        return int(datetime.datetime.strptime(value, '%Y-%m-%d-%H%M').replace(tzinfo=tz).timestamp())
    rows = []
    for line in lines[3:]:
        cells = line.split('\t')
        if not line.strip() or not cells[0].isdigit():
            continue
        cell = dict(zip(header, cells))
        rows.append((int(cell['Id']), cell['ClassName'], cell['Name'], stamp(cell['BeginTime']),
                     stamp(cell['EndTime']), stamp(cell['ClearTime'])))
    return rows


# A second family on the page (War Chess, as a family the server may serve later): its rows join the list by
# date, a tap opens only that row (the stock lookup takes the first open row from pairs), and a later tap on a
# tower closes it again.
FAMILY_SCENARIO = r'''
WARCHESS = {}
WarChessTower = {
  tbTotalConfig = {
    [1] = { Id = 1, Icon = 'Poster/fightmode_missionWarChess_normal_Mul.png', BeginTime = 1645574400, EndTime = 1647374400, ClearTime = 1647633600 },
    [2] = { Id = 2, Icon = 'Poster/fightmode_missionWarChess2_normal_Mul.png', BeginTime = 1650988800, EndTime = 1652817600, ClearTime = 1653076800 },
  },
  GetOpenConfig = function(self)
    for _, v in pairs(self.tbTotalConfig) do
      if v.BeginTime < GetTime() and v.ClearTime > GetTime() then return v end
    end
  end,
  GetTower = function(self) local v = self:GetOpenConfig(); WARCHESS[#WARCHESS + 1] = v and v.Id or 0 end,
}
EventList.SERVED.warchess = true
local list = EventList.Entries()
local names, chess = {}, nil
for i, e in ipairs(list) do
  names[#names + 1] = e.Kind .. ':' .. e.Name
  if e.Kind == 'warchess' and e.Key == 2 then chess = e end
end
EventList.Enter(chess)
local tower
for _, e in ipairs(list) do if e.Kind == 'tower' then tower = e end end
EventList.Enter(tower)
local row = WarChessTower.tbTotalConfig[2]
local closedAgain = not (row.BeginTime < GetTime() and row.ClearTime > GetTime())
return #list, table.concat(names, ','), table.concat(WARCHESS, ','), closedAgain, ENTERED[#ENTERED] == tower.Id
'''


def replay_family(fight, choose, rows):
    lua = LuaRuntime()
    lua.execute(HARNESS)
    lua.execute(towers_lua(rows))
    lua.execute(fight.decode('utf8') if isinstance(fight, bytes) else fight)
    lua.execute(choose.decode('utf8') if isinstance(choose, bytes) else choose)
    return tuple(lua.execute(FAMILY_SCENARIO))


def replay(fight, choose, rows):
    lua = LuaRuntime()
    lua.execute(HARNESS)
    lua.execute(towers_lua(rows))
    lua.execute(fight.decode('utf8') if isinstance(fight, bytes) else fight)
    lua.execute(choose.decode('utf8') if isinstance(choose, bytes) else choose)
    return tuple(lua.execute(SCENARIO))


def run_script(fight, choose, rows, patched=None):
    stock = replay(fight, choose, rows)
    assert stock[0] is False, 'stock tile must be closed with past dates: %r' % (stock,)
    if patched is None:
        patched = (g.lua_script('UI_FightMode.lua', fight), g.lua_script('UI_CoopChoose.lua', choose))
    result = replay(patched[0], patched[1], rows)
    open_, count, ids, built, entered, failed, tail = result
    served = sorted({r[0] for r in rows if r[1] in g_classes()})
    first_ids = [int(x.split(':')[0]) for x in ids.split(',')]
    assert open_ is True, result
    assert count == built and count == len(first_ids), result
    assert set(first_ids) <= set(served), (first_ids, served)
    dropped = set(served) - set(first_ids)
    assert all(any(r[0] == d for r in rows) for d in dropped)
    assert not any(r[1] not in g_classes() and r[0] in first_ids for r in rows), 'only served classes'
    begins = {r[0]: r[3] for r in rows}
    assert [begins[i] for i in first_ids] == sorted(begins[i] for i in first_ids), 'oldest first'
    assert entered == 2 and failed == 0, result
    entered_ids, first_closed, stock_two, page_after = tail.split('|')
    assert entered_ids == '%d,%d' % (first_ids[2], first_ids[4]), (entered_ids, first_ids[:5])
    assert first_closed == 'true', 'the first tapped tower must be closed again after the second tap'
    assert stock_two == '2' and page_after == 'nil', tail
    total, names, chess, closed_again, tower_entered = replay_family(patched[0], patched[1], rows)
    assert total == count + 2 and names.count('warchess:') == 2, (total, count, names)
    assert chess == '2' and closed_again is True and tower_entered is True, (chess, closed_again, tower_entered)
    return {'stockTileOpen': stock[0], 'patchedTileOpen': open_, 'events': count, 'dropped': sorted(dropped),
            'firstEvents': ids.split(',')[:5], 'entered': entered_ids, 'stockChooserStillWorks': True,
            'secondFamilyEntered': chess, 'secondFamilyClosedAfterOtherTap': closed_again}


def g_classes():
    import re
    text = Path(g.MODULE).read_text(encoding='utf8')
    block = text[text.index('M.TOWER_CLASSES = {'):text.index('}', text.index('M.TOWER_CLASSES = {'))]
    return set(re.findall(r'(\w+) = true', block))


def scripts_from_bundle(bundle):
    import asset_tools
    _, raw = asset_tools.unityfs(asset_tools.transform(bundle))
    _, objects = asset_tools.serialized_objects(raw)
    out = {}
    for name in g.LUA_NAMES:
        obj = next(o for o in objects if o.get('name') == name)
        out[name] = raw[obj['script_start']:obj['script_start'] + obj['script_length']]
    return out


def tower_text(setting):
    """Tower.txt from the bytes of a release setting.u."""
    import asset_tools as w
    _, _, _, plain = w.unity.decode(setting)
    env = w.unity.UnityPy.load(plain)
    obj = env.container['assets/_game/settinggen/activities/smalltower/tower.txt'].deref()
    return obj.read_typetree()['m_Script']


def run_bundle(built, stock_bundle, rows):
    """rows: tower_rows(tower_text(setting.u bytes))."""
    stock = scripts_from_bundle(stock_bundle)
    patched = scripts_from_bundle(built)
    for name in g.LUA_NAMES:
        assert b'EventList' in patched[name], name
    return run_script(stock['UI_FightMode.lua'], stock['UI_CoopChoose.lua'], rows,
                      (patched['UI_FightMode.lua'], patched['UI_CoopChoose.lua']))


def main(argv):
    source = Path(argv[1])
    if source.suffix == '.apk':
        with zipfile.ZipFile(source) as z:
            bundle = z.read('assets/lua.u')
            rows = tower_rows(tower_text(z.read('assets/setting.u')))
    else:
        bundle = source.read_bytes()
        rows = tower_rows(Path(argv[2]).read_text(encoding='utf8'))
    scripts = scripts_from_bundle(bundle)
    print(run_script(scripts['UI_FightMode.lua'], scripts['UI_CoopChoose.lua'], rows))


if __name__ == '__main__':
    main(sys.argv)
