"""Event list page on the Attack menu's event tile.

Stock UI_FightMode:CheckEventOpen shows the event tile (BtnMission) only while an event tower is inside its
BeginTime..ClearTime. Every event of the release is past, so the tile says "Unavailable now!" for good.
With more than one open event the tile opened UI_CoopChoose, which draws only the last two (UpdateTwo) and
leaves its Mul panel empty (UpdateMul).

This recipe appends event_list.lua to UI_FightMode.lua: the tile now opens a scroll page (the Mul panel of
UI_CoopChoose) with every past event of the families the server serves. A tap opens that one event alone,
by its dates, and enters it through the stock ActivitiesLogic:GetTower. The 3-6 unlock of the tile stays.
"""
from pathlib import Path

LUA_NAMES = {'UI_FightMode.lua', 'UI_CoopChoose.lua'}
MODULE = Path(__file__).with_name('event_list.lua')

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
    if name == 'UI_FightMode.lua':
        text = replace_one(text, TILE_OLD, TILE_NEW)
        text = text.rstrip('\n') + '\n\n' + MODULE.read_text(encoding='utf8')
    else:
        text = replace_one(text, OPEN_OLD, OPEN_NEW)
    return text.encode('utf8')
