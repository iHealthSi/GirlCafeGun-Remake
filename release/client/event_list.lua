-- Event list page (release recipe patch_event_list.py).
-- The Attack menu's event tile (UI_FightMode BtnMission) opens a page that lists every past event this
-- offline server can run. A tap opens that one event alone, by its dates, and enters it the stock way.
-- The page is UI_CoopChoose: its unused Mul panel gets a scroll grid built here.
EventList = EventList or {}
local M = EventList

-- Tower.txt classes that the server answers (LuaCall 53-56). Animalize, EighthTower and TwentyFirstTower
-- keep their own card state and are not served yet, so they stay off the page.
M.TOWER_CLASSES = {
	SmallTower = true, ChessTower = true, NinthTower = true, TwelfthTower = true, ThirteenthTower = true,
	FourteenthTower = true, SeventeenthTower = true, EighteenthTower = true, NineteenthTower = true,
	TwentiethTower = true, TenthTower = true, FifteenthTower = true, SixteenthTower = true, Swimwear = true,
	AbsorbPeak = true, VariegatedTower = true, NodeTower = true, SeventhTower = true, EleventhTower = true,
}

local DAY = 86400
M.OPEN_DAYS = 30
M.COLUMNS, M.TILE_W, M.TILE_H, M.LABEL_H, M.GAP = 4, 250, 168, 46, 20

local function log(msg) print('[events] ' .. tostring(msg)) end

-- First dates of a config row, kept before any change so the order and a later restore use them.
local function original(tb)
	if not tb.__gcgDates then
		tb.__gcgDates = { BeginTime = tb.BeginTime, EndTime = tb.EndTime, ClearTime = tb.ClearTime }
	end
	return tb.__gcgDates
end

local function towerName(tb)
	local name = tb.Name
	if type(name) ~= 'string' or name == '' or name:find('^Tower') or name:find('^TowerMix') then
		return 'Event ' .. tostring(tb.Id)
	end
	return name
end

local function month(seconds)
	if type(seconds) ~= 'number' or seconds <= 0 then return '' end
	local ok, text = pcall(os.date, '%Y-%m', seconds)
	return ok and text or ''
end

-- Every entry of the served families, oldest first. Dates do not matter here: all are past.
-- A row that repeats an earlier one (Tower.txt 201 = 1) is left out.
function M.Entries()
	local out, seen = {}, {}
	local cfg = ActivitiesConfig and ActivitiesConfig.tbSmallTowerConfig
	if type(cfg) ~= 'table' then return out end
	local ids = {}
	for id in pairs(cfg) do ids[#ids + 1] = id end
	table.sort(ids)
	for _, id in ipairs(ids) do
		local tb = cfg[id]
		if type(tb) == 'table' and M.TOWER_CLASSES[tb.ClassName] then
			local dates = original(tb)
			local key = table.concat({ tb.ClassName, tostring(tb.Name), tostring(dates.BeginTime) }, '|')
			if not seen[key] then
				seen[key] = true
				out[#out + 1] = { Id = id, Kind = 'tower', Name = towerName(tb), Icon = tb.Icon,
					Start = dates.BeginTime or 0, Month = month(dates.BeginTime) }
			end
		end
	end
	table.sort(out, function(a, b)
		if a.Start ~= b.Start then return a.Start < b.Start end
		return a.Id < b.Id
	end)
	return out
end

-- Make one tower the only open one of Tower.txt (now - 1 day .. now + OPEN_DAYS) and put every row that
-- an earlier tap opened back to its own dates. Lookups that take "the first open tower" then find this one.
function M.Activate(entry)
	local cfg = ActivitiesConfig and ActivitiesConfig.tbSmallTowerConfig
	local chosen = cfg and cfg[entry.Id]
	if not chosen then return false end
	for _, tb in pairs(cfg) do
		if type(tb) == 'table' and tb.__gcgOpened and tb ~= chosen then
			local dates = original(tb)
			tb.BeginTime, tb.EndTime, tb.ClearTime = dates.BeginTime, dates.EndTime, dates.ClearTime
			tb.__gcgOpened = nil
		end
	end
	original(chosen)
	local now = GetTime()
	chosen.BeginTime = now - DAY
	chosen.EndTime = now + M.OPEN_DAYS * DAY
	chosen.ClearTime = chosen.EndTime + 3 * DAY
	chosen.__gcgOpened = true
	return true
end

function M.Enter(entry)
	if not M.Activate(entry) then
		Game.MessageBox.Simple(UIText('UI_FightMode.tip'))
		return
	end
	log('enter tower ' .. tostring(entry.Id))
	ActivitiesLogic:GetTower(entry.Id)
end

function M.Open(list)
	UI.OpenAsChild('UI_CoopChoose', { gcgEventList = list })
end

-- Replaces UI_FightMode:CheckEventOpen. Returns true while the page has entries; the stock 3-6 lock
-- (UI_UnlockActivity36) still applies on top of this.
function M.FightModeTile(ui)
	local list = M.Entries()
	if #list == 0 then
		ui.ImgMission.enabled = false
		return false
	end
	ui:OnClickAndClear('', function() M.Open(M.Entries()) end, ui.BtnMission)
	ui.ImgMission.sprite = Sprite('Poster/fightmode_mission0_normal_Mul.png')
	ui.ImgSelectMission.sprite = Sprite('Poster/fightmode_mission0_press_Mul.png')
	ui:UpdateMark(ui.BtnMission, 0, 0, 0, true)
	ui.ImgMission.enabled = true
	return true
end

-- Page --------------------------------------------------------------------------------------------------

local function newObject(name, parent)
	local go = U3D.GameObject(name)
	go:AddComponent(typeof(U3D.RectTransform))
	go.layer = parent.gameObject.layer
	go.transform:SetParent(parent, false)
	return go, go:GetComponent(typeof(U3D.RectTransform))
end

local function place(rt, x, y, w, h)
	local V2 = U3D.Vector2
	rt.anchorMin = V2(0, 1)
	rt.anchorMax = V2(0, 1)
	rt.pivot = V2(0, 1)
	rt.anchoredPosition = V2(x, y)
	rt.sizeDelta = V2(w, h)
end

-- A Text of the prefab, cloned so the page gets the game's font.
local function textTemplate(ui)
	for _, path in ipairs({ 'Panel/Two/Card1/Time/Text', 'Panel/Two/Card1/Sum/Text' }) do
		local ok, tr = pcall(ui.Find, ui, path)
		if ok and tr then return tr end
	end
end

local function label(template, parent, text, x, y, w, h)
	local UGUI = U3D.UI
	local tr = U3D.Object.Instantiate(template.gameObject, parent).transform
	tr.gameObject:SetActive(true)
	local rt = tr:GetComponent(typeof(U3D.RectTransform))
	place(rt, x, y, w, h)
	local t = tr:GetComponent(typeof(UGUI.Text))
	t.text = text
	t.supportRichText = true
	t.alignment = U3D.TextAnchor.UpperCenter
	t.horizontalOverflow = U3D.HorizontalWrapMode.Wrap
	t.verticalOverflow = U3D.VerticalWrapMode.Truncate
	t.fontSize = 22
	t.color = U3D.Color(1, 1, 1, 1)
	t.raycastTarget = false
	return t
end

local function tile(page, entry, index, template)
	local UGUI = U3D.UI
	local col = (index - 1) % M.COLUMNS
	local row = math.floor((index - 1) / M.COLUMNS)
	local cellW, cellH = M.TILE_W + M.GAP, M.TILE_H + M.LABEL_H + M.GAP
	local go, rt = newObject('Event' .. tostring(entry.Id), page.content)
	place(rt, col * cellW, -row * cellH, M.TILE_W, M.TILE_H)
	local img = go:AddComponent(typeof(UGUI.Image))
	local ok, sprite = pcall(Sprite, entry.Icon)
	if ok and sprite then
		img.sprite = sprite
		img.preserveAspect = true
	else
		img.color = U3D.Color(0.1, 0.12, 0.2, 0.85)
	end
	local btn = go:AddComponent(typeof(UGUI.Button))
	btn.targetGraphic = img
	btn.onClick:AddListener(function() M.Enter(entry) end)
	if template then
		local text = entry.Name
		if entry.Month ~= '' then text = text .. '\n<size=18>' .. entry.Month .. '</size>' end
		label(template, page.content, text, col * cellW - 10, -row * cellH - M.TILE_H - 2, M.TILE_W + 20, M.LABEL_H)
	end
end

function M.BuildPage(ui, list)
	local UGUI = U3D.UI
	local mul = ui.transMul
	local old = mul:Find('GcgEventView')
	if old then U3D.Object.DestroyImmediate(old.gameObject) end
	for _, name in ipairs({ 'Bg', 'Btn', 'List' }) do
		local tr = mul:Find(name)
		if tr then tr.gameObject:SetActive(false) end
	end
	local width = M.COLUMNS * (M.TILE_W + M.GAP) - M.GAP
	local view, viewRt = newObject('GcgEventView', mul)
	viewRt.anchorMin = U3D.Vector2(0.5, 0.5)
	viewRt.anchorMax = U3D.Vector2(0.5, 0.5)
	viewRt.pivot = U3D.Vector2(0.5, 0.5)
	viewRt.anchoredPosition = U3D.Vector2(0, -10)
	viewRt.sizeDelta = U3D.Vector2(width + 20, 520)
	local hit = view:AddComponent(typeof(UGUI.Image))
	hit.color = U3D.Color(0, 0, 0, 0.01)
	view:AddComponent(typeof(UGUI.RectMask2D))
	local content, contentRt = newObject('Content', view.transform)
	local rows = math.ceil(#list / M.COLUMNS)
	place(contentRt, 10, 0, width, rows * (M.TILE_H + M.LABEL_H + M.GAP))
	local scroll = view:AddComponent(typeof(UGUI.ScrollRect))
	scroll.content = contentRt
	scroll.viewport = viewRt
	scroll.horizontal = false
	scroll.vertical = true
	scroll.movementType = UGUI.ScrollRect.MovementType.Clamped
	scroll.scrollSensitivity = 30
	local page = { view = view, content = content.transform, count = #list }
	local template = textTemplate(ui)
	for i, entry in ipairs(list) do tile(page, entry, i, template) end
	ui.gcgEventPage = page
	log(#list .. ' events on the page')
	return page
end

-- Called from UI_CoopChoose:OnOpen when the event tile opened it.
function M.ShowPage(ui, list)
	ui.gcgEventList = list
	ui.transTwo.gameObject:SetActive(false)
	ui.transMul.gameObject:SetActive(true)
	local page = ui.gcgEventPage
	if not page or page.count ~= #list then
		local ok, err = pcall(M.BuildPage, ui, list)
		if not ok then log('page failed: ' .. tostring(err)) end
	end
	return true
end

-- Called from UI_CoopChoose:OnOpen for its stock uses: hide the page so the stock panels show.
function M.HidePage(ui)
	ui.gcgEventList = nil
	ui.gcgEventPage = nil
	local mul = ui.transMul
	local view = mul:Find('GcgEventView')
	if view then U3D.Object.DestroyImmediate(view.gameObject) end
	for _, name in ipairs({ 'Bg', 'Btn', 'List' }) do
		local tr = mul:Find(name)
		if tr then tr.gameObject:SetActive(true) end
	end
	mul.gameObject:SetActive(false)
end
