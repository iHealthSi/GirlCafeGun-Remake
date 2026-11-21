"""Mock test of patch_event_list on the real UI_FightMode.lua and UI_CoopChoose.lua.

run_script(fight, choose, towers) replays the Attack menu in Lua with the Tower.txt rows of the release
(all dates in the past):
- stock CheckEventOpen finds no open event (the "Unavailable now!" tile: the bug);
- patched CheckEventOpen keeps the tile open and its click opens UI_CoopChoose with the event list;
- the list holds every served class once, oldest first, without Animalize, EighthTower, TwentyFirstTower;
- UI_CoopChoose builds the page (Unity calls are mocked) and a tap on a tile enters that tower with the
  stock date check passing; a second tap closes the first tower again;
- UI_CoopChoose opened with stock data still takes its stock path;
- a second family (War Chess, mocked) joins the list by date, a tap opens only its row, a later tap closes it;
- a hub family (Concert, mocked) is one entry that opens both rows and its sub-tables (missions, exchange
  time list), every start date stays, and a later tap puts it all back.
run_fail(stock, patched, luacall) loads the four real logic scripts and LuaCall.lua: the Fail handlers of a lost
Concert, Challenge and first Anniversary fight raise on the release scripts and run on the patched ones.
run_shops(module, scripts, tables, rows) loads the real Lib, ShopTabLogicC and GoodsLogicC with the release's
ShopTabList and GoodsList: a tapped event opens its shop tab and dated goods (strings and os.time tables), a hub
opens all its shops, the Concert shops stay closed, the next tap and Restore close them again; EventList.SHOPS
equals the ShopId columns of the top tables, and every goods of those shops costs tokens (no diamonds, gold, 0).
run_bundle(built, stock, rows, setting) reads the scripts from a built lua.u and replays all of it.
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


# A hub family (Concert): both rows open together as one page entry, its sub-tables (missions in seconds,
# the exchange time list as a yyyymmddHHMM number) get future ends, every start stays as it was, and a later
# tap on a tower puts all of it back.
HUB_SCENARIO = r'''
MUSIC_OPENED = 0
MusicActivityLogic = {
  tbMusicTowerTotalConfig = {
    [1] = { Id = 1, Icon = 'Poster/fightmode_concert01_normal_Mul.png', BeginTime = 1595548800, EndTime = 1598299200, ClearTime = 1598644800 },
    [2] = { Id = 2, Icon = 'Poster/fightmode_concert02_normal_Mul.png', BeginTime = 1596916800, EndTime = 1598299200, ClearTime = 1598644800 },
  },
  GetTower = function(self)
    local n = 0
    for _, tb in pairs(self.tbMusicTowerTotalConfig) do
      if GetTime() >= tb.BeginTime and GetTime() <= tb.ClearTime then n = n + 1 end
    end
    MUSIC_OPENED = n
  end,
}
MusicMission = { tbMissionList = { [101] = { startTime = 1595548800, endTime = 1598299200 }, [102] = { startTime = 1595548800, endTime = 0 } } }
ConcertExchange = { LoadTimeListConfig = function(self) self.timeListConfig = { [1] = { ID = 1, StartTime = 202007240800, EndTime = 202008250400 } } end }
local list = EventList.Entries()
local hub, hubs, tower = nil, 0, nil
for _, e in ipairs(list) do
  if e.Kind == 'music' then hub = e; hubs = hubs + 1 end
  if e.Kind == 'tower' and not tower then tower = e end
end
local towerRow = ActivitiesConfig.tbSmallTowerConfig[tower.Key]
local towerBegin = towerRow.BeginTime
EventList.Enter(tower)
local beginKept = towerRow.BeginTime == towerBegin and towerRow.EndTime > GetTime()
EventList.Enter(hub)
local mission = MusicMission.tbMissionList[101]
local exchange = ConcertExchange.timeListConfig[1]
local nowNumber = tonumber(os.date('%Y%m%d%H%M', GetTime()))
local opened = MUSIC_OPENED
local missionOpen = mission.endTime > GetTime() and mission.startTime == 1595548800
local noEndKept = MusicMission.tbMissionList[102].endTime == 0
local exchangeOpen = exchange.EndTime > nowNumber and exchange.StartTime == 202007240800
local towerClosed = towerRow.ClearTime < GetTime()
EventList.Enter(tower)
local row = MusicActivityLogic.tbMusicTowerTotalConfig[2]
local hubClosed = row.ClearTime < GetTime() and mission.endTime < GetTime() and exchange.EndTime == 202008250400
return hubs, opened, missionOpen, noEndKept, exchangeOpen, beginKept, towerClosed, hubClosed
'''


def replay_hub(fight, choose, rows):
    lua = LuaRuntime()
    lua.execute(HARNESS)
    lua.execute(towers_lua(rows))
    lua.execute(fight.decode('utf8') if isinstance(fight, bytes) else fight)
    lua.execute(choose.decode('utf8') if isinstance(choose, bytes) else choose)
    return tuple(lua.execute(HUB_SCENARIO))


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
    hub = replay_hub(patched[0], patched[1], rows)
    assert hub == (1, 2, True, True, True, True, True, True), hub
    return {'stockTileOpen': stock[0], 'patchedTileOpen': open_, 'events': count, 'dropped': sorted(dropped),
            'firstEvents': ids.split(',')[:5], 'entered': entered_ids, 'stockChooserStillWorks': True,
            'secondFamilyEntered': chess, 'secondFamilyClosedAfterOtherTap': closed_again,
            'hubOpensAllRowsAndSubTables': True, 'startDatesKept': True}


def g_classes():
    import re
    text = Path(g.MODULE).read_text(encoding='utf8')
    block = text[text.index('M.TOWER_CLASSES = {'):text.index('}', text.index('M.TOWER_CLASSES = {'))]
    return set(re.findall(r'(\w+) = true', block))


FAIL_HARNESS = r'''
MODULE_SERVER = false
-- Every other global is a mock that can be called, indexed, counted and compared, so the four logic scripts
-- and LuaCall.lua load as they are. The tables under test and LuaCall stay real (nil until defined).
local REAL = { MusicActivityLogic = true, BuffTowerLogic = true, GridActLogic = true,
  AnniversaryMainLogic = true, LuaCall = true, MODULE_SERVER = true }
local M = {}
local function any() return setmetatable({}, M) end
M.__index = function(_, k) if type(k) == 'number' then return nil end return any() end
M.__call = function() return any() end
M.__len = function() return 0 end
M.__pairs = function() return next, {}, nil end
M.__lt = function() return false end
M.__le = function() return false end
M.__concat = function() return '' end
M.__tostring = function() return 'mock' end
for _, op in ipairs({'__add', '__sub', '__mul', '__div', '__mod', '__idiv', '__unm', '__pow'}) do
  M[op] = function() return 0 end
end
setmetatable(_G, { __index = function(_, k) if REAL[k] then return nil end return any() end })
-- MusicActivityLogic:LoadRelayConf runs load(Game.LuaUtils.LoadText(...)): the text is a mock here.
local real_load = load
load = function(chunk, ...)
  if getmetatable(chunk) == M then return function() return any() end end
  return real_load(chunk, ...)
end
'''

FAIL_SCENARIO = r'''
local out = {}
for _, cmd in ipairs({'MusicTower_FailTower', 'BuffTower_FailTower', 'Anniversary_Discovery_FailTower',
                      'Anniversary_FailTower'}) do
  local id = LuaCall[cmd]
  local ok, err = pcall(LuaCall.tbCMD[id], id, {})
  out[#out + 1] = cmd .. '=' .. (ok and 'ok' or tostring(err))
end
return table.concat(out, '\n')
'''


def replay_fail(logic, luacall):
    """logic: {script name: source}; runs the client branch of the four LuaCall Fail handlers."""
    lua = LuaRuntime()
    lua.execute(FAIL_HARNESS)
    for name in sorted(g.FAIL_TOWER):
        source = logic[name]
        lua.execute(source.decode('utf8') if isinstance(source, bytes) else source)
    lua.execute(luacall.decode('utf8') if isinstance(luacall, bytes) else luacall)
    return dict(line.split('=', 1) for line in lua.execute(FAIL_SCENARIO).split('\n'))


def run_fail(stock, patched, stock_luacall, patched_luacall=None):
    """A lost fight's answer raises on the release scripts and runs on the patched ones."""
    before = replay_fail(stock, stock_luacall)
    assert all('OnFailTower' in err for err in before.values()), before
    after = replay_fail(patched, patched_luacall or stock_luacall)
    assert all(result == 'ok' for result in after.values()), after
    return {'stockLostFightErrors': len(before), 'patchedLostFightHandled': sorted(after)}


SHOP_SCRIPTS = ('Lib.lua', 'ShopTabLogicC.lua', 'GoodsLogicC.lua')
SHOP_TABLES = {
    'Shop/ShopTabList.txt': 'shop/shoptablist.txt',
    'Shop/GoodsList.txt': 'shop/goodslist.txt',
    'tower': 'activities/smalltower/tower.txt',
    'coop': 'activities/coopclient/coopclientactivities.txt',
    'anniversary': 'activities/anniversaryactivity/anniversarytowertotal.txt',
    'anniversary2': 'activities/2ndanniversary/2ndanniversarytowertotal.txt',
    'linkage': 'activities/linkageactivity/linkagetower.txt',
    'warchess': 'activities/warchesstower/warchesstower.txt',
    'mix': 'activities/mixonline/mixonlineactivities.txt',
    'music': 'activities/musicactivity/musictowertotal.txt',
}

SHOP_HARNESS = r'''
-- Unknown globals are mocks (as in FAIL_HARNESS); the shop scripts, lib functions and families stay real.
local REAL = { EventList = true, ShopTabLogicC = true, GoodsLogicC = true, ActivitiesConfig = true,
  ActivitiesLogic = true, MicroClimbTower = true, CoopClientLogic = true, MusicActivityLogic = true,
  AnniversaryMainLogic = true, MixOnlineLogic = true, BuffTowerLogic = true, LinkageActivityLogic = true,
  SecondAnniversaryTower = true, WarChessTower = true, GridActLogic = true, PuzzleLogic = true,
  AnniversaryGuess = true, ConcertExchange = true, MusicMission = true, MonthMission = true, me = true,
  GetIsLogin = true, TABLES = true }
local M = {}
local function any() return setmetatable({}, M) end
M.__index = function(_, k) if type(k) == 'number' then return nil end return any() end
M.__call = function() return any() end
M.__len = function() return 0 end
M.__pairs = function() return next, {}, nil end
M.__concat = function() return '' end
setmetatable(_G, { __index = function(_, k) if REAL[k] then return nil end return any() end })
NOW = 1795000000   -- 2026-11-18, after every event and shop date of the release
function GetTime() return NOW end
Game = { LuaUtils = { LoadText = function(path) return TABLES[path] end }, Logger = { Error = function() end } }
setmetatable(Game, { __index = function() return any() end })
ActivitiesConfig = { tbSmallTowerConfig = {} }
'''

SHOP_SCENARIO = r'''
local function family(key) for _, f in ipairs(EventList.FAMILIES) do if f.key == key then return f end end end
local function row(id) return { Id = id, BeginTime = NOW - 900 * 86400, EndTime = NOW - 800 * 86400,
  ClearTime = NOW - 797 * 86400 } end
CoopClientLogic = { tbConfig = { [2] = row(2), [3] = row(3) } }
AnniversaryMainLogic = { tbTowerTotalConfig = { [1] = row(1), [2] = row(2) } }
MusicActivityLogic = { tbMusicTowerTotalConfig = { [1] = row(1), [2] = row(2) } }
SecondAnniversaryTower = { tbTotalConfig = { [1] = row(1), [2] = row(2) } }
-- Open as every reader sees it: the strings (CheckShopOpen, CheckShopOpenFlag) and the os.time tables
-- (UI_ShopNew:CheckOpen, UI_2ndAnniversaryShop:CheckOpen).
local function open(id)
  local tab = ShopTabLogicC.tbShopTabConfig[id]
  return ShopTabLogicC:CheckShopOpen(id) and ShopTabLogicC:CheckShopOpenFlag(id) == 0
    and os.time(tab.Begin) <= NOW and os.time(tab.End) >= NOW
end
local function line(list) local out = {} for i, v in ipairs(list) do out[i] = tostring(v) end return table.concat(out, ',') end
local goods = function(id) return GoodsLogicC:CheckGoodInTime(GoodsLogicC:GetGoodsCfg(id)) == true end
local out = {}
out[#out + 1] = 'before=' .. line({ open(30001), open(30006), open(30012), open(30013), open(30020), open(30042),
  goods(32017) })
EventList.Activate({ Family = family('tower'), Key = 1 })
out[#out + 1] = 'tower1=' .. line({ open(30001), open(30006), open(30002), ShopTabLogicC:GetShopId(30001),
  ShopTabLogicC:GetShopId(30002) })
EventList.Activate({ Family = family('coop'), Key = 2 })
out[#out + 1] = 'coop2=' .. line({ open(30012), open(30015), open(30001) })
EventList.Activate({ Family = family('anniversary'), Key = 'all' })
out[#out + 1] = 'anniversary=' .. line({ open(30020), open(30021), goods(32017), goods(32118), open(30012) })
EventList.Activate({ Family = family('music'), Key = 'all' })
out[#out + 1] = 'music=' .. line({ open(30013), open(30014), open(30020), goods(32017) })
EventList.Activate({ Family = family('anniversary2'), Key = 'all' })
out[#out + 1] = 'anniversary2=' .. line({ open(30040), open(30041), open(30042) })
EventList.Restore()
out[#out + 1] = 'restored=' .. line({ open(30040), open(30042), open(30001), open(30012), goods(32017) })
local shops = {}
for key, rows in pairs(EventList.SHOPS) do
  for id, list in pairs(rows) do shops[#shops + 1] = key .. ':' .. id .. ':' .. table.concat(list, '/') end
end
table.sort(shops)
out[#out + 1] = 'shops=' .. table.concat(shops, ' ')
return table.concat(out, '\n')
'''


def table_text(setting, path):
    """A settinggen table (path under assets/_game/settinggen/) from the bytes of a release setting.u."""
    import asset_tools as w
    _, _, _, plain = w.unity.decode(setting)
    env = w.unity.UnityPy.load(plain)
    obj = env.container['assets/_game/settinggen/' + path].deref()
    return obj.read_typetree()['m_Script']


def shop_ids_from_tables(texts):
    """{family: {row id: [shop ids]}} as the top tables give them (armed survey: third value of Param)."""
    import re
    out = {}
    for key in ('tower', 'coop', 'anniversary', 'anniversary2', 'linkage', 'warchess', 'mix', 'music'):
        lines = texts[key].replace('\r\n', '\n').split('\n')
        header = lines[2].split('\t')
        rows = {}
        for line in lines[3:]:
            cells = dict(zip(header, line.split('\t')))
            if not cells.get('Id', '').strip().isdigit():
                continue
            value = cells.get('ShopId', '') if key != 'coop' else (re.findall(r'\d+', cells.get('Param', '')) + [''] * 3)[2]
            if value.strip():
                rows[int(cells['Id'])] = [int(value)]
        out[key] = rows
    return out


def goods_costs(text):
    """{shop id: [(goods id, money, [prices])]} from GoodsList.txt (Price1 and Price2 'money|price' or tiers)."""
    import re
    lines = text.replace('\r\n', '\n').split('\n')
    header = lines[2].split('\t')
    out = {}
    for line in lines[3:]:
        cells = dict(zip(header, line.split('\t')))
        if not cells.get('GoodsId', '').strip().isdigit():
            continue
        for column in ('Price1', 'Price2'):
            match = re.match(r'\s*(\d+)\|(.*)', cells.get(column, ''))
            if match:
                out.setdefault(int(cells['ShopId']), []).append(
                    (int(cells['GoodsId']), int(match.group(1)), [int(x) for x in re.findall(r'\d+', match.group(2))]))
    return out


def run_shops(module_source, scripts, texts, rows):
    """The shop of a tapped event opens with it, as the real ShopTabLogicC and GoodsLogicC read the release tables.

    module_source: event_list.lua (or the patched UI_FightMode.lua that carries it); scripts: SHOP_SCRIPTS sources;
    texts: SHOP_TABLES texts; rows: tower_rows(Tower.txt).
    """
    lua = LuaRuntime()
    lua.execute(SHOP_HARNESS)
    tables = lua.eval('{}')
    for client_path in ('Shop/ShopTabList.txt', 'Shop/GoodsList.txt'):
        tables[client_path] = texts[client_path]
    lua.globals().TABLES = tables
    for name in SHOP_SCRIPTS:
        source = scripts[name]
        lua.execute(source.decode('utf8') if isinstance(source, bytes) else source)
    lua.execute(towers_lua(rows))
    text = module_source.decode('utf8') if isinstance(module_source, bytes) else module_source
    lua.execute(text[text.index('-- Event list page (release recipe'):])
    result = dict(line.split('=', 1) for line in lua.execute(SHOP_SCENARIO).split('\n'))
    assert result['before'] == 'false,false,false,false,false,false,false', result
    # GetShopId keeps an open shop and sends a closed event shop to the last open one (stock redirect).
    assert result['tower1'] == 'true,true,false,30001,30006', result
    assert result['coop2'] == 'true,false,false', result
    assert result['anniversary'] == 'true,true,true,true,false', result
    assert result['music'] == 'false,false,false,false', result
    assert result['anniversary2'] == 'true,true,true', result
    assert result['restored'] == 'false,false,false,false,false', result
    # M.SHOPS is the tables' ShopId of every served row, without the Concert, plus 30006 (row 201) and 30042.
    shops = {}
    for item in result['shops'].split(' '):
        key, row, ids = item.split(':')
        shops.setdefault(key, {})[int(row)] = [int(x) for x in ids.split('/')]
    expected = shop_ids_from_tables(texts)
    expected.pop('music')
    expected['tower'].pop(201)
    expected['tower'][1].append(30006)
    for row in expected['anniversary2'].values():
        row.append(30042)
    assert shops == expected, (shops, expected)
    # Every goods of those shops costs tokens: no diamonds (3, 12, 18), gold (2, 17) or price 0; the Concert shops
    # each hold a goods for diamonds.
    costs = goods_costs(texts['Shop/GoodsList.txt'])
    opened = sorted({shop for rows_ in shops.values() for ids in rows_.values() for shop in ids})
    for shop in opened:
        assert costs.get(shop), shop
        for goods_id, money_id, prices in costs[shop]:
            assert money_id not in (2, 3, 12, 17, 18) and prices and min(prices) > 0, (shop, goods_id, money_id, prices)
    for shop in (30013, 30014):
        assert any(money_id == 3 for _, money_id, _ in costs[shop]), shop
    return {'eventShopsOpenWithTheirEvent': len(opened), 'concertShopsClosed': True, 'shopDatesRestored': True}


def scripts_from_bundle(bundle, names=None):
    import asset_tools
    _, raw = asset_tools.unityfs(asset_tools.transform(bundle))
    _, objects = asset_tools.serialized_objects(raw)
    out = {}
    for name in names or g.LUA_NAMES:
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


def run_bundle(built, stock_bundle, rows, setting=None):
    """rows: tower_rows(tower_text(setting.u bytes)); setting: the setting.u bytes for the shop test."""
    names = g.LUA_NAMES | {'LuaCall.lua'} | set(SHOP_SCRIPTS)
    stock = scripts_from_bundle(stock_bundle, names)
    patched = scripts_from_bundle(built, names)
    for name in g.LUA_NAMES:
        assert b'EventList' in patched[name], name
    result = run_script(stock['UI_FightMode.lua'], stock['UI_CoopChoose.lua'], rows,
                        (patched['UI_FightMode.lua'], patched['UI_CoopChoose.lua']))
    result.update(run_fail(stock, patched, stock['LuaCall.lua'], patched['LuaCall.lua']))
    if setting is not None:
        texts = {key: table_text(setting, path) for key, path in SHOP_TABLES.items()}
        result.update(run_shops(patched['UI_FightMode.lua'], patched, texts, rows))
    return result


def main(argv):
    source = Path(argv[1])
    setting = None
    if source.suffix == '.apk':
        with zipfile.ZipFile(source) as z:
            bundle = z.read('assets/lua.u')
            setting = z.read('assets/setting.u')
            rows = tower_rows(tower_text(setting))
    else:
        bundle = source.read_bytes()
        rows = tower_rows(Path(argv[2]).read_text(encoding='utf8'))
    scripts = scripts_from_bundle(bundle, g.LUA_NAMES | {'LuaCall.lua'} | set(SHOP_SCRIPTS))
    print(run_script(scripts['UI_FightMode.lua'], scripts['UI_CoopChoose.lua'], rows))
    patched = {name: g.lua_script(name, scripts[name]) for name in g.FAIL_TOWER}
    print(run_fail(scripts, patched, scripts['LuaCall.lua']))
    if setting is not None:
        texts = {key: table_text(setting, path) for key, path in SHOP_TABLES.items()}
        print(run_shops(g.MODULE.read_text(encoding='utf8'), scripts, texts, rows))


if __name__ == '__main__':
    main(sys.argv)
