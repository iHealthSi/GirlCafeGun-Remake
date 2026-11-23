"""Verify Lua gameplay fixes (formation support sanitization, cafe visit return, guide chaining)."""
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "translation/tools/.deps"), str(Path(__file__).resolve().parent)]

from lupa.lua53 import LuaRuntime
import patch_gameplay_fixes
import patch_lua
from asset_tools import load_reviewed_parsers


def main():
    apk = ROOT / "client/GCG-Neptune-Nep-Note-Sequence-Fix-Test.apk"
    with zipfile.ZipFile(apk) as z:
        rebuilt, receipt = patch_lua.build(z.read("assets/lua.u"))
    assert receipt["allLuaSyntaxPassed"] is True
    for name in patch_gameplay_fixes.LUA_NAMES:
        assert name in receipt["changedScripts"], f"missing patched script {name}"

    cipher, unity, builder = load_reviewed_parsers()
    _, raw = unity.unityfs(cipher.transform(rebuilt))
    _, objs = builder.serialized_objects(raw)
    scripts = {
        o["name"]: raw[o["script_start"] : o["script_start"] + o["script_length"]].decode("utf8")
        for o in objs
        if o.get("name") in patch_gameplay_fixes.LUA_NAMES
    }

    lua = LuaRuntime()
    # 1. Verify FormationCommon:SanitizeDeputyCards strips locked slots and keeps unlocked slots.
    lua.execute(
        """
        FormationCommon = { tbDeputyLvLimit = { 10, 20, 30 } }
        GirlCommon = {
            levels = { [7] = 5, [9] = 15, [2] = 35 },
            Get = function(_, d, key) return GirlCommon.levels[d] or 0 end
        }
        """
    )
    lua.execute(patch_gameplay_fixes.SANITIZE_HELPER)
    cleared = lua.eval(
        """
        (function()
            local groups = {
                [0] = { MainCharacterCard = { D = 7 }, deputies = { [0] = 'bad0', [1] = 'bad1', [2] = 'bad2' } },
                [1] = { MainCharacterCard = { D = 9 }, deputies = { [0] = 'ok0', [1] = 'bad1', [2] = nil } },
                [2] = { MainCharacterCard = { D = 2 }, deputies = { [0] = 'ok0', [1] = 'ok1', [2] = 'ok2' } },
            }
            for i = 0, 2 do
                local g = groups[i]
                function g:GetDeputyCharacterCard(idx) return self.deputies[idx] end
                function g:SetDeputyCharacterCard(idx, v) self.deputies[idx] = v end
            end
            local sol = { GetGroup = function(_, idx) return groups[idx] end }
            FormationCommon:SanitizeDeputyCards(sol)
            assert(groups[0].deputies[0] == nil and groups[0].deputies[1] == nil and groups[0].deputies[2] == nil)
            assert(groups[1].deputies[0] == 'ok0' and groups[1].deputies[1] == nil and groups[1].deputies[2] == nil)
            assert(groups[2].deputies[0] == 'ok0' and groups[2].deputies[1] == 'ok1' and groups[2].deputies[2] == 'ok2')
            return true
        end)()
        """
    )
    assert cleared is True

    # 2. Verify all expected hooks exist in the rebuilt scripts.
    assert "FormationCommon:GetAllowedDeputyCount(cardGroup.MainCharacterCard)" in scripts["CardRecommendConfig.lua"]
    assert "FormationCommon:SanitizeDeputyCards(self.solution)" in scripts["UI_Formation.lua"]
    assert "FormationCommon:SanitizeDeputyCards(self.solution)" in scripts["UI_ChooseGirl.lua"]
    assert scripts["UI_NCafeVisit.lua"].count("NCafeMgr.Data.CafeRoleId = Player.id;") >= 3
    assert "self:CheckUIGuide(tbConfig.tbStep[1].Window);" in scripts["GuideManager.lua"]
    print("test_gameplay_fixes: ALL PASSED")


if __name__ == "__main__":
    main()
