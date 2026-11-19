"""Checks patch_yen.py on the files of a published APK (setting.u, lang.u, lua.u).

  python test_yen.py <release APK>

The recipe anchors were checked on GCG-Offline-v0.1.3.apk; this repository's
pinned client APK is not public, so run it on the APK you build from.
"""
import re
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import asset_tools as w  # noqa: E402
import patch_yen  # noqa: E402

SERVER = Path(__file__).resolve().parents[2] / 'server/src/game-data/yen-shop-data.ts'


def server_constants():
    text = SERVER.read_text(encoding='utf8')
    value = lambda name: int(re.search(r'export const %s = (\d+);' % name, text).group(1))
    return {'MONEY_YEN': value('MONEY_YEN'), 'YEN_ITEM_DETAIL': value('YEN_ITEM_DETAIL'),
            'NOT_ENOUGH': value('IB_SHOP_ERROR_NOT_ENOUGH_YEN'), 'OFFLINE': value('IB_SHOP_ERROR_PACK_OFFLINE')}


def lua_scripts(source):
    meta, raw, _, _ = w.decode(source)
    _, objects = w.serialized_objects(raw)
    return {o['name']: raw[o['script_start']:o['script_start'] + o['script_length']]
            for o in objects if o.get('name') in patch_yen.LUA_NAMES}


def run(apk):
    from lupa.lua53 import LuaRuntime
    server = server_constants()
    assert server['MONEY_YEN'] == patch_yen.MONEY_YEN
    assert server['YEN_ITEM_DETAIL'] == patch_yen.YEN_ITEM[1]
    assert {'ui.Error.%d' % server['NOT_ENOUGH'], 'ui.Error.%d' % server['OFFLINE']} <= set(patch_yen.TEXTS)
    z = zipfile.ZipFile(apk)
    _, settings = patch_yen.build(z.read('assets/setting.u'))
    w.configure(apk)
    _, texts = patch_yen.build_language(z.read('assets/lang.u'))
    scripts = lua_scripts(z.read('assets/lua.u'))
    assert set(scripts) == patch_yen.LUA_NAMES, sorted(scripts)
    for name, data in sorted(scripts.items()):
        out = patch_yen.lua_script(name, data).decode('utf8')
        LuaRuntime().execute('assert(load(...))', out)
        assert 'gcg2 offline' in out or 'ShowYen' in out, name
    ib = patch_yen.lua_script('IBLogic.lua', scripts['IBLogic.lua']).decode('utf8')
    assert 'tbIBItem.Currency == -1 and not tbParam.tbItem then' in ib
    return {'settings': settings['onlyChangedObjectIds'], 'itemRowsBefore': settings['itemList']['rowsBefore'],
            'lang': texts, 'luaCompiles': sorted(scripts)}


if __name__ == '__main__':
    print(run(sys.argv[1]))
