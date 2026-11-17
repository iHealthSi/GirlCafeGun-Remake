"""￥ wallet for the gift packs that the original game sold for real money.

The server twin is server/src/game-data/yen-shop-data.ts: money id 95 holds the
wallet, the item 15-200-1-1 carries it in mail, a pack costs its CNY Cost in ￥.

setting.u (build):
- Player/MoneyDef.txt: row 95 (name ui.Type_Yen, icon UI/UI_Shop/charge15_Mul.png,
  the ￥ sprite that UI_Charge and UI_ShopNew show next to a real-money price).
- Item/ItemList (MonoBehaviour, 19 fields a row): row 15-200-1-1,
  ItemNormalCoinAuto, ExtParam1 1, ExtParam2 95. ItemLogic:GetCoinItemConfig finds
  it by ExtParam2, so a tap on the top-bar counter opens its item card.

lang.u (build_language): new keys for the item, the money name and the two
errors that the server sends (20901 not enough ￥, 20902 pack not sold offline).
The table holds only keys and values; new keys are appended.

lua.u (lua_script):
- IBLogic.lua ResponseTradeNo: a Currency -1 pack whose reply carries tbItem is
  paid already; it takes the reward-window branch instead of the payment SDK.
- UI_Player.lua: ShowYen(bShow) puts the wallet in the first custom slot of the
  top bar (the slot that SetShopMoneyType fills on other screens).
- UI_Main.lua: shows it when the main screen opens, hides it when it closes.
"""
import copy
import struct

MONEY_YEN = 95
YEN_ITEM = (15, 200, 1, 1)
YEN_ICON = 'UI/UI_Shop/charge15_Mul.png'
YEN = '￥'  # full-width yen: the game font has it (existing text uses it)

MONEYDEF_NAME = 'MoneyDef'
MONEYDEF_ROW = '\t'.join([str(MONEY_YEN), 'ui.Type_Yen', YEN_ICON, '1', '20901', 'offline yen (gcg2)', '0', '999999999'])

ITEM_FIELDS = 'iiiiiississsssisiii'
ITEM_NAMES = ['Genre', 'Detail', 'Particular', 'Level', 'RarityColor', 'AutoUse', 'ClassName', 'DescriptionIndex',
              'SellingPrice', 'IconId', 'awardIconId', 'ExtParam1', 'ExtParam2', 'ExtParam3', 'ShowType', 'TagIcon',
              'DisableDropWay', 'LimitTime', 'ExpiredDelete']
ITEM_ROW = dict(zip(ITEM_NAMES, [*YEN_ITEM, 4, 1, 'ItemNormalCoinAuto', 'AitemYen', 0, YEN_ICON, YEN_ICON,
                                 '1', str(MONEY_YEN), '', -1, '', 1, 0, 1]))

TEXTS = {
    'item.AitemYen': YEN,
    'item.AitemYen.desc': 'Offline money for the gift packs of the shop. A pack costs its ' + YEN + ' price.',
    'ui.Type_Yen': YEN,
    'ui.Error.20901': 'Not enough ' + YEN + '.',
    'ui.Error.20902': 'This pack is not available offline yet.',
}


# ---------------------------------------------------------------- setting.u

def _string(raw, at):
    n, = struct.unpack_from('<i', raw, at)
    return raw[at + 4:at + 4 + n].decode('utf8'), at + 4 + n + (-n % 4)


def _pack_string(text):
    b = text.encode('utf8')
    return struct.pack('<i', len(b)) + b + bytes(-len(b) % 4)


def parse_item_list(payload):
    """ItemList MonoBehaviour payload -> (prefix bytes up to the row count, rows)."""
    name_at = 32  # PPtr GameObject (12), enabled (4), PPtr script (12), name length (4)
    name, at = _string(payload, name_at - 4)
    assert name == 'ItemList', name
    count, = struct.unpack_from('<i', payload, at)
    prefix, at = payload[:at], at + 4
    rows = []
    for _ in range(count):
        row = {}
        for key, kind in zip(ITEM_NAMES, ITEM_FIELDS):
            if kind == 'i':
                row[key], = struct.unpack_from('<i', payload, at)
                at += 4
            else:
                row[key], at = _string(payload, at)
        rows.append(row)
    assert at == len(payload), (at, len(payload))
    return prefix, rows


def pack_item_list(prefix, rows):
    out = bytearray(prefix + struct.pack('<i', len(rows)))
    for row in rows:
        for key, kind in zip(ITEM_NAMES, ITEM_FIELDS):
            out += struct.pack('<i', row[key]) if kind == 'i' else _pack_string(row[key])
    return bytes(out)


def _text_asset(raw, obj):
    name, at = _string(raw, obj['start'])
    text, end = _string(raw, at)
    return name, text, raw[end:obj['start'] + obj['size']]


def settings_objects(raw):
    """Plain setting.u SerializedFile -> ({path_id: payload}, proof)."""
    import asset_tools as w
    _, objects = w.serialized_objects(raw)
    replacements, proof = {}, {}
    money = [o for o in objects if o['class_id'] == 49 and o.get('name') == MONEYDEF_NAME]
    assert len(money) == 1, [o.get('name') for o in money]
    name, text, tail = _text_asset(raw, money[0])
    newline = '\r\n' if '\r\n' in text else '\n'
    lines = text.split(newline)
    assert lines[2].split('\t')[:8] == ['ID', 'Name', 'Icon', 'SpriteId', 'ErrorCode', 'DESC', 'Version', 'MaxValue']
    ids = {line.split('\t')[0] for line in lines[3:]}
    assert str(MONEY_YEN) not in ids, 'MoneyDef already has row %d' % MONEY_YEN
    end = len(lines)
    while end > 3 and lines[end - 1] == '':
        end -= 1
    lines.insert(end, MONEYDEF_ROW)
    replacements[money[0]['path_id']] = _pack_string(name) + _pack_string(newline.join(lines)) + tail
    proof['moneyDef'] = {'objectId': money[0]['path_id'], 'row': MONEYDEF_ROW}

    items = [o for o in objects if o['class_id'] == 114 and raw[o['start'] + 32:o['start'] + 40] == b'ItemList']
    assert len(items) == 1, len(items)
    obj = items[0]
    payload = raw[obj['start']:obj['start'] + obj['size']]
    prefix, rows = parse_item_list(payload)
    assert pack_item_list(prefix, rows) == payload, 'ItemList round trip'
    keys = {(r['Genre'], r['Detail'], r['Particular'], r['Level']) for r in rows}
    assert YEN_ITEM not in keys, 'ItemList already has %s' % (YEN_ITEM,)
    assert not [r for r in rows if r['ClassName'] in ('ItemNormalCoinAuto', 'ItemMixTowerCoinAuto')
                and r['ExtParam2'] == str(MONEY_YEN)], 'a coin item for money %d exists' % MONEY_YEN
    replacements[obj['path_id']] = pack_item_list(prefix, rows + [dict(ITEM_ROW)])
    proof['itemList'] = {'objectId': obj['path_id'], 'rowsBefore': len(rows), 'row': ITEM_ROW}
    return replacements, proof


def build(source):
    """Encrypted setting.u -> (encrypted setting.u, proof). Only MoneyDef and ItemList change."""
    import asset_tools as w
    meta, raw, encrypted, _ = w.decode(source)
    assert encrypted
    replacements, proof = settings_objects(raw)
    changed = w.repack_objects(raw, replacements)
    assert len(meta['nodes']) == 1
    _, _, flags, cab = meta['nodes'][0]
    encoded = w.transform(w.pack({**meta, 'nodes': [(0, len(changed), flags, cab)]}, changed))
    _, checked, flag, _ = w.decode(encoded)
    assert flag and checked == changed
    _, after = w.serialized_objects(checked)
    money = next(o for o in after if o['path_id'] == proof['moneyDef']['objectId'])
    assert MONEYDEF_ROW in _text_asset(checked, money)[1]
    item = next(o for o in after if o['path_id'] == proof['itemList']['objectId'])
    _, rows = parse_item_list(checked[item['start']:item['start'] + item['size']])
    assert rows[-1] == ITEM_ROW and len(rows) == proof['itemList']['rowsBefore'] + 1
    proof['onlyChangedObjectIds'] = sorted(replacements)
    return encoded, proof


# ---------------------------------------------------------------- lang.u

def build_language(source):
    """lang.u (after the other text recipes) -> (lang.u, proof): appends the TEXTS keys."""
    import asset_tools as w
    meta, raw, encrypted, _ = w.decode(source)
    assert not encrypted
    table = w.typed_tables(raw, {'zh_CN'})['zh_CN']
    before = table['value']
    present = sorted(set(TEXTS) & set(before['keys']))
    assert not present, 'keys exist already: %s' % present
    value = copy.deepcopy(before)
    for key, text in TEXTS.items():
        value['keys'].append(key)
        value['values'].append(text)
    offset, objects = w.serialized_objects(raw)
    target = table['object']['path_id']
    payload = w.replace_native(raw, table, value)
    output = bytearray(raw[:offset])
    for obj in sorted(objects, key=lambda obj: obj['start']):
        body = payload if obj['path_id'] == target else raw[obj['start']:obj['start'] + obj['size']]
        output += bytes(-len(output) % 8)
        at = len(output)
        output += body
        struct.pack_into('<II', output, obj['record'] + 8, at - offset, len(body))
    struct.pack_into('>I', output, 4, len(output))
    output = bytes(output)
    _, _, flags, cab = meta['nodes'][0]
    result = w.pack({**meta, 'nodes': [(0, len(output), flags, cab)]}, output)
    _, checked, check_encrypted, _ = w.decode(result)
    assert not check_encrypted
    after = w.typed_tables(checked, {'zh_CN'})['zh_CN']['value']
    assert after == value
    assert dict(zip(after['keys'], after['values'])).items() >= TEXTS.items()
    return result, {'addedKeys': list(TEXTS), 'keysBefore': len(before['keys']), 'keysAfter': len(after['keys'])}


# ---------------------------------------------------------------- lua.u

LUA_NAMES = {'IBLogic.lua', 'UI_Player.lua', 'UI_Main.lua'}

IBLOGIC_OLD = '\t\tif tbIBItem.Currency == -1 then\n\t\t\tif not tbParam.TradeNo or tbParam.TradeNo == "" then'
IBLOGIC_NEW = ('\t\t-- gcg2 offline: tbItem means the server took the price in yen; show the reward, no payment SDK\n'
               '\t\tif tbIBItem.Currency == -1 and not tbParam.tbItem then\n'
               '\t\t\tif not tbParam.TradeNo or tbParam.TradeNo == "" then')

PLAYER_ANCHOR = '--控制UI_Player资源各部分的显示和隐藏\nfunction tbClass:ShowOrHide(Area,type)'
PLAYER_ADD = '''-- gcg2 offline: the yen wallet (money %d) in the first custom slot of the top bar, on the main screen.
-- UI.Call does not catch errors and UI_Main:OnOpen calls this: a fault hides the slot and is logged.
function tbClass:ShowYen(bShow)
    local ok, err = pcall(function()
        if not self.newItems or not self.newIds or not self.newItems[1] then return end
        local item = self.newItems[1]
        if not bShow then
            if self.newIds[1] == %d then
                self.newIds[1] = 0
                item.obj:SetActive(false)
            end
            return
        end
        if me == nil then return end
        local _, icon, _, count = MoneyLogic:GetInfo(%d)
        self.newIds[1] = %d
        self.newGDPLs[1] = {}
        item.txt.text = NumberToString(count or 0)
        item.icon.sprite = Sprite(icon or "%s")
        item.oldVal = count
        item.obj:SetActive(true)
    end)
    if not ok then
        print("[yen] ShowYen failed: " .. tostring(err))
        pcall(function()
            self.newIds[1] = 0
            self.newItems[1].obj:SetActive(false)
        end)
    end
end

''' % (MONEY_YEN, MONEY_YEN, MONEY_YEN, MONEY_YEN, YEN_ICON)

MAIN_OPEN_OLD = '\tUI.Call("UI_Player", "SetResource", true);\n\tUI.Call("UI_Player", "SetRoleInfoActive", true);'
MAIN_OPEN_NEW = MAIN_OPEN_OLD + '\n\tUI.Call("UI_Player", "ShowYen", true);'
MAIN_CLOSE_OLD = 'function tbClass:OnClose()\n'
MAIN_CLOSE_NEW = MAIN_CLOSE_OLD + '\tUI.Call("UI_Player", "ShowYen", false);\n'


def _one(text, old, new):
    assert text.count(old) == 1, (old[:80], text.count(old))
    return text.replace(old, new)


def lua_script(name, data):
    s = data.decode('utf8')
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    if name == 'IBLogic.lua':
        s = _one(s, IBLOGIC_OLD, IBLOGIC_NEW)
    elif name == 'UI_Player.lua':
        s = _one(s, PLAYER_ANCHOR, PLAYER_ADD + PLAYER_ANCHOR)
    elif name == 'UI_Main.lua':
        s = _one(s, MAIN_OPEN_OLD, MAIN_OPEN_NEW)
        s = _one(s, MAIN_CLOSE_OLD, MAIN_CLOSE_NEW)
    else:
        raise KeyError(name)
    if crlf:
        s = s.replace('\n', '\r\n')
    return s.encode('utf8')
