"""Event list page on the Attack menu's event tile.

Stock UI_FightMode:CheckEventOpen shows the event tile (BtnMission) only while an event tower is inside its
BeginTime..ClearTime. Every event of the release is past, so the tile says "Unavailable now!" for good.
With more than one open event the tile opened UI_CoopChoose, which draws only the last two (UpdateTwo) and
leaves its Mul panel empty (UpdateMul).

This recipe appends event_list.lua to UI_FightMode.lua: the tile now opens a scroll page (the Mul panel of
UI_CoopChoose) with every past event of the families the server serves. A tap opens that one event alone,
by its dates, and enters it through the stock ActivitiesLogic:GetTower. The 3-6 unlock of the tile stays.
The event's shop opens with it (EventList.SHOPS: its ShopTabList tab and the dates of its goods), for the
shops whose goods all cost the event's own tokens; the server keeps the same shops open.

A lost fight: the Fail handlers of LuaCall.lua (373 Concert, 379 Concert challenge, 423 and 428 first
Anniversary) call OnFailTower on a logic table that the release never gives one, so the server's answer
raised a nil-method error. FailTower already ended the fight before it sent the call, as in the other
families, whose OnFailTower is empty (SecondAnniversaryTower, LinkageActivityLogic, WarChessTower). The
recipe adds the same empty method to each of the four logic scripts, just before the script's closing
Init call (so after its own `X = {}` line).
"""
from pathlib import Path
import re

UI_NAMES = {'UI_FightMode.lua', 'UI_CoopChoose.lua'}
# Script -> the logic table whose OnFailTower the LuaCall Fail handler calls.
FAIL_TOWER = {
    'MusicActivityLogic.lua': 'MusicActivityLogic',
    'BuffTowerLogic.lua': 'BuffTowerLogic',
    'GridActLogic.lua': 'GridActLogic',
    'AnniversaryMainLogic.lua': 'AnniversaryMainLogic',
}
LUA_NAMES = UI_NAMES | set(FAIL_TOWER)
MODULE = Path(__file__).with_name('event_list.lua')
FAIL_TAIL = (
    '\n\n-- EventList: the LuaCall Fail handler calls OnFailTower; the fight already ended in FailTower.\n'
    'if not {0}.OnFailTower then function {0}:OnFailTower() end end\n')

TILE_OLD = 'function tbClass:CheckEventOpen()\n'
TILE_NEW = TILE_OLD + '\tif EventList and EventList.FightModeTile then return EventList.FightModeTile(self) end\n'
OPEN_OLD = 'function tbClass:OnOpen(tbData, isOnline)\n'
OPEN_NEW = OPEN_OLD + (
    '\tif EventList and type(tbData) == "table" and tbData.gcgEventList then\n'
    '\t\treturn EventList.ShowPage(self, tbData.gcgEventList)\n'
    '\tend\n'
    '\tif EventList and (self.gcgEventList or self.gcgEventPage) then EventList.HidePage(self) end\n')


def replace_one(text, old, new):
    assert text.count(old) == 1, old[:120]
    return text.replace(old, new)


def lua_script(name, source):
    assert name in LUA_NAMES, name
    text = source.decode('utf8').replace('\r\n', '\n')
    if name in FAIL_TOWER:
        table = FAIL_TOWER[name]
        assert ('\n%s = {}\n' % table) in text or ('\n%s = %s or {};\n' % (table, table)) in text, name
        assert ('%s:OnFailTower' % table) not in text and 'tbLogic:OnFailTower' not in text, name
        # Before the script's closing Init call (GridActLogic.lua ends in `return tbLogic;`).
        init = list(re.finditer(r'\n(?:tbLogic|%s):Init\(\);?\n' % table, text + '\n'))
        assert len(init) == 1, name
        at = init[0].start()
        text = text[:at] + FAIL_TAIL.format(table).rstrip('\n') + text[at:]
    elif name == 'UI_FightMode.lua':
        text = replace_one(text, TILE_OLD, TILE_NEW)
        text = text.rstrip('\n') + '\n\n' + MODULE.read_text(encoding='utf8')
    else:
        text = replace_one(text, OPEN_OLD, OPEN_NEW)
    return text.encode('utf8')
