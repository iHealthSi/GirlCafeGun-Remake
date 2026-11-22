"""Gameplay Lua fixes for formation support validation, cafe visit return, and guide chaining."""

LUA_NAMES = {
    "FormationCommon.lua",
    "CardRecommendConfig.lua",
    "UI_Formation.lua",
    "UI_ChooseGirl.lua",
    "UI_NCafeVisit.lua",
    "GuideManager.lua",
}

SANITIZE_HELPER = """
function FormationCommon:GetAllowedDeputyCount(mainCard)
\tlocal lvLimits = FormationCommon.tbDeputyLvLimit;
\tif not mainCard or not mainCard.D or not lvLimits then return 0 end
\tlocal nFriendLevel = GirlCommon:Get(mainCard.D, 'Level');
\tlocal allowed = 0;
\tfor slot = 1, 3 do
\t\tif lvLimits[slot] and nFriendLevel >= lvLimits[slot] then
\t\t\tallowed = slot;
\t\tend
\tend
\treturn allowed;
end

function FormationCommon:SanitizeDeputyCards(solution)
\tif not solution then return end
\tfor groupIdx = 0, 2 do
\t\tlocal cardGroup = solution:GetGroup(groupIdx);
\t\tif cardGroup then
\t\t\tlocal allowed = FormationCommon:GetAllowedDeputyCount(cardGroup.MainCharacterCard);
\t\t\tfor slotIdx = allowed, 2 do
\t\t\t\tif cardGroup:GetDeputyCharacterCard(slotIdx) ~= nil then
\t\t\t\t\tcardGroup:SetDeputyCharacterCard(slotIdx, nil);
\t\t\t\tend
\t\t\tend
\t\tend
\tend
end
"""


def _replace_one(text: str, old: str, new: str) -> str:
    count = text.count(old)
    assert count == 1, f"expected 1 match, got {count}: {old[:120]!r}"
    return text.replace(old, new, 1)


def lua_script(name: str, data: bytes) -> bytes:
    s = data.decode("utf8").replace("\r\n", "\n")
    if name == "FormationCommon.lua":
        s = s.rstrip("\n") + "\n" + SANITIZE_HELPER
    elif name == "CardRecommendConfig.lua":
        s = _replace_one(
            s,
            "\tlocal nowList = cardGroup:GetDeputyCharacterCard();\n"
            "\tlocal nowCount = nowList.Count;\n"
            "\tfor idx = 0,nowCount - 1 do\n"
            "\t\tNewList:Add(nowList[idx])\n"
            "\tend",
            "\tlocal allowedCount = FormationCommon:GetAllowedDeputyCount(cardGroup.MainCharacterCard);\n"
            "\tfor slotIdx = allowedCount, 2 do\n"
            "\t\tif cardGroup:GetDeputyCharacterCard(slotIdx) ~= nil then\n"
            "\t\t\tcardGroup:SetDeputyCharacterCard(slotIdx, nil);\n"
            "\t\tend\n"
            "\tend\n"
            "\tlocal nowList = cardGroup:GetDeputyCharacterCard();\n"
            "\tlocal nowCount = math.min(nowList.Count, allowedCount);\n"
            "\tfor idx = 0,nowCount - 1 do\n"
            "\t\tNewList:Add(nowList[idx])\n"
            "\tend",
        )
    elif name == "UI_Formation.lua":
        s = _replace_one(
            s,
            "\telse\n"
            "\t\tif not Game.EquipManager.IsEquipSolutionEqual(self.solution, Game.EquipManager.GetEquipSolution(self.nTeamId)) then \n"
            "\t\t\tlocal tb = FormationCommon:MakeTable(self.solution);",
            "\telse\n"
            "\t\tFormationCommon:SanitizeDeputyCards(self.solution);\n"
            "\t\tif not Game.EquipManager.IsEquipSolutionEqual(self.solution, Game.EquipManager.GetEquipSolution(self.nTeamId)) then \n"
            "\t\t\tlocal tb = FormationCommon:MakeTable(self.solution);",
        )
    elif name == "UI_ChooseGirl.lua":
        s = _replace_one(
            s,
            "\telse--正常的数据保存\n"
            "\t\tself.pSaveEnd = pEnd;\n"
            "\t\tif not Game.EquipManager.IsEquipSolutionEqual(self.solution, Game.EquipManager.GetEquipSolution(self.nTeamId)) then ",
            "\telse--正常的数据保存\n"
            "\t\tself.pSaveEnd = pEnd;\n"
            "\t\tFormationCommon:SanitizeDeputyCards(self.solution);\n"
            "\t\tif not Game.EquipManager.IsEquipSolutionEqual(self.solution, Game.EquipManager.GetEquipSolution(self.nTeamId)) then ",
        )
    elif name == "UI_NCafeVisit.lua":
        s = _replace_one(
            s,
            "function tbClass:TryHome()\n"
            '    UI.Call("UI_Player", "ExitToHome");\n'
            "    return false;\n"
            "end",
            "function tbClass:TryHome()\n"
            "    NCafeMgr.Data.CafeRoleId = Player.id;\n"
            '    UI.Call("UI_Player", "ExitToHome");\n'
            "    return false;\n"
            "end",
        )
        s = _replace_one(
            s,
            "        if (NCafeMgr.Data.VisitType < 0) then\n"
            "            if NCafeMgr.Data.VisitType == -2 then --好友界面访问，返回好友界面",
            "        if (NCafeMgr.Data.VisitType < 0) then\n"
            "            NCafeMgr.Data.CafeRoleId = Player.id;\n"
            "            if NCafeMgr.Data.VisitType == -2 then --好友界面访问，返回好友界面",
        )
    elif name == "GuideManager.lua":
        s = _replace_one(
            s,
            "\tif not tbConfig or nStepId > #tbConfig.tbStep then \n"
            "\t\tif not self:IsGuideComplete(szGuideId) then\n"
            "\t\t\tself:SetGuideComplete(szGuideId);\n"
            "\t\tend\n"
            '\t\t--print("return1");\n'
            "\t\treturn \n"
            "\tend ;",
            "\tif not tbConfig or nStepId > #tbConfig.tbStep then \n"
            "\t\tif not self:IsGuideComplete(szGuideId) then\n"
            "\t\t\tself:SetGuideComplete(szGuideId);\n"
            "\t\tend\n"
            "\t\tif tbConfig and tbConfig.tbStep and tbConfig.tbStep[1] and tbConfig.tbStep[1].Window and tbConfig.tbStep[1].Window ~= '' then\n"
            "\t\t\tself:CheckUIGuide(tbConfig.tbStep[1].Window);\n"
            "\t\tend\n"
            '\t\t--print("return1");\n'
            "\t\treturn \n"
            "\tend ;",
        )
    else:
        raise ValueError(f"unexpected script: {name}")
    return s.encode("utf8")
