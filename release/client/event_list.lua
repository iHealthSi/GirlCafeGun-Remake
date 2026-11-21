-- Event list page (release recipe patch_event_list.py).
-- The Attack menu's event tile (UI_FightMode BtnMission) opens a page that lists every past event this
-- offline server can run. A tap opens that one event alone, by its dates, and enters it the stock way.
-- The page is UI_CoopChoose: its unused Mul panel gets a scroll grid built here.
EventList = EventList or {}
local M = EventList

-- Tower.txt classes that the server answers (LuaCall 53-56 and their own calls).
M.TOWER_CLASSES = {
	SmallTower = true, ChessTower = true, NinthTower = true, TwelfthTower = true, ThirteenthTower = true,
	FourteenthTower = true, SeventeenthTower = true, EighteenthTower = true, NineteenthTower = true,
	TwentiethTower = true, TenthTower = true, FifteenthTower = true, SixteenthTower = true, Swimwear = true,
	AbsorbPeak = true, VariegatedTower = true, NodeTower = true, SeventhTower = true, EleventhTower = true,
	Animalize = true, EighthTower = true, TwentyFirstTower = true,
}

-- Sub-tables that a hub reads with dates of their own. Each spec: rows, filter (optional), ends (end fields).
local function missionRows(logic, event)
	local rows = logic and logic.tbMissionList
	return { rows = rows, ends = { 'endTime' },
		filter = event and function(tb) return tb.missionEvent == event end or nil }
end
local function concertExtras()
	if ConcertExchange and not ConcertExchange.timeListConfig and ConcertExchange.LoadTimeListConfig then
		pcall(ConcertExchange.LoadTimeListConfig, ConcertExchange)
	end
	return { missionRows(MusicMission), { rows = ConcertExchange and ConcertExchange.timeListConfig, ends = { 'EndTime' } } }
end

-- The event families of the stock tile (UI_FightMode:CheckEventOpen), with the same entry call each.
-- rows: the family's config rows (each has BeginTime, EndTime, ClearTime as seconds); accept: rows that
-- belong on the page; enter: the stock entry call; label: name when the row has none; together: the hub
-- shows every open row of the family at once, so the page lists the family once and opens all its rows;
-- extras: sub-tables to open with it.
M.FAMILIES = {
	{ key = 'tower', label = 'Event',
		rows = function() return ActivitiesConfig and ActivitiesConfig.tbSmallTowerConfig end,
		accept = function(tb) return M.TOWER_CLASSES[tb.ClassName] end,
		enter = function(tb) ActivitiesLogic:GetTower(tb.Id) end },
	{ key = 'micro', label = 'Micro Tower',
		rows = function() return MicroClimbTower and MicroClimbTower.tbClimbTowerConfig end,
		accept = function(tb) return tb.InFightMode == 1 end,
		enter = function(tb) MicroClimbTower:GetTower(tb.Id) end },
	{ key = 'coop', label = 'Armed Survey',
		rows = function() return CoopClientLogic and CoopClientLogic.tbConfig end,
		enter = function(tb) CoopClientLogic:GetTower(tb.Id) end },
	{ key = 'music', label = 'Concert', together = true, extras = concertExtras,
		rows = function() return MusicActivityLogic and MusicActivityLogic.tbMusicTowerTotalConfig end,
		enter = function() MusicActivityLogic:GetTower() end },
	{ key = 'anniversary', label = 'Anniversary', together = true,
		extras = function() return { missionRows(MonthMission, MonthMission and MonthMission.EVENT_TYPE_YEAR or 1) } end,
		rows = function() return AnniversaryMainLogic and AnniversaryMainLogic.tbTowerTotalConfig end,
		enter = function() UI.CloseAndOpen('UI_AnniversaryMain') end },
	{ key = 'mix', label = 'Joint Event',
		rows = function() return MixOnlineLogic and MixOnlineLogic.tbActivityConfig end,
		-- The server reads the running joint event from task 68/1001 (MixOnlineLogic.nTask_Id).
		enter = function(tb)
			if me and me.SetTaskValue and tb.Id then
				me:SetTaskValue(MixOnlineLogic.nTask_Group or 68, MixOnlineLogic.nTask_Id or 1001, tb.Id)
			end
			MixOnlineLogic:GetTower()
		end },
	{ key = 'buff', label = 'Challenge',
		rows = function() return BuffTowerLogic and BuffTowerLogic.tbChallengeTowerConfig end,
		accept = function(tb) return not tb.noEntry and not tb.NoEntry end,
		enter = function() BuffTowerLogic:GetTower() end },
	{ key = 'linkage', label = 'Collab',
		rows = function() return LinkageActivityLogic and LinkageActivityLogic.tbTowerConfig end,
		enter = function() UI.CloseAndOpen('UI_RailgunMain') end },
	{ key = 'anniversary2', label = '2nd Anniversary', together = true,
		extras = function() return { missionRows(MonthMission, MonthMission and MonthMission.EVENT_TYPE_2YEAR or 2) } end,
		rows = function() return SecondAnniversaryTower and SecondAnniversaryTower.tbTotalConfig end,
		enter = function() SecondAnniversaryTower:GetTower() end },
	{ key = 'warchess', label = 'War Chess',
		rows = function() return WarChessTower and WarChessTower.tbTotalConfig end,
		enter = function() WarChessTower:GetTower() end },
}

-- Families whose server part exists. A family off this list stays off the page: its calls would get no
-- reply and its screens would wait for ever.
M.SERVED = { tower = true, micro = true, coop = true, music = true, mix = true, buff = true, linkage = true,
	anniversary2 = true, warchess = true }

local DAY = 86400
local ALL = 'all'
M.OPEN_DAYS = 30
M.COLUMNS, M.TILE_W, M.TILE_H, M.LABEL_H, M.GAP = 4, 250, 168, 46, 20

local function log(msg) print('[events] ' .. tostring(msg)) end

-- First dates of a config row, kept before any change, for the order of the page.
local function original(tb)
	if not tb.__gcgDates then
		tb.__gcgDates = { BeginTime = tb.BeginTime, EndTime = tb.EndTime, ClearTime = tb.ClearTime }
	end
	return tb.__gcgDates
end

-- The row's own name when the text table had one (a missing text comes back as its key, "Tower.Name12").
local function rowName(family, tb, count)
	local name = tb.Name
	if type(name) == 'string' and name ~= '' and not name:find('^[%w_]+%.[%w_]+$') then return name end
	if family.key == 'tower' or count > 1 then return family.label .. ' ' .. tostring(tb.Id) end
	return family.label
end

local function month(seconds)
	if type(seconds) ~= 'number' or seconds <= 0 then return '' end
	local ok, text = pcall(os.date, '%Y-%m', seconds)
	return ok and text or ''
end

local function familyRows(family)
	local ok, rows = pcall(family.rows)
	if ok and type(rows) == 'table' then return rows end
end

local function accepted(family, tb)
	return type(tb) == 'table' and type(tb.BeginTime) == 'number' and (not family.accept or family.accept(tb))
end

-- Every entry of the served families, oldest first. Dates do not matter here: all are past.
-- A row that repeats an earlier one of its family (Tower.txt 201 = 1) is left out.
function M.Entries()
	local out = {}
	for _, family in ipairs(M.FAMILIES) do
		local rows = M.SERVED[family.key] and familyRows(family)
		if rows then
			local ids, seen, picked = {}, {}, {}
			for id in pairs(rows) do ids[#ids + 1] = id end
			table.sort(ids, function(a, b)
				if type(a) == type(b) then return a < b end
				return tostring(a) < tostring(b)
			end)
			for _, id in ipairs(ids) do
				local tb = rows[id]
				if accepted(family, tb) then
					local dates = original(tb)
					local key = table.concat({ tostring(tb.ClassName), tostring(tb.Name), tostring(dates.BeginTime) }, '|')
					if not seen[key] then
						seen[key] = true
						picked[#picked + 1] = { id = id, tb = tb }
					end
				end
			end
			if family.together and #picked > 0 then
				local start, icon = nil, nil
				for _, p in ipairs(picked) do
					local begin = original(p.tb).BeginTime or 0
					if not start or begin < start then start = begin end
					if p.tb.Icon and p.tb.Icon ~= '' then icon = p.tb.Icon end
				end
				out[#out + 1] = { Id = 0, Key = ALL, Kind = family.key, Family = family, Name = family.label,
					Icon = icon, Start = start, Month = month(start) }
			else
				for _, p in ipairs(picked) do
					local dates = original(p.tb)
					out[#out + 1] = { Id = p.tb.Id or p.id, Key = p.id, Kind = family.key, Family = family,
						Name = rowName(family, p.tb, #picked), Icon = p.tb.Icon,
						Start = dates.BeginTime or 0, Month = month(dates.BeginTime) }
				end
			end
		end
	end
	table.sort(out, function(a, b)
		if a.Start ~= b.Start then return a.Start < b.Start end
		if a.Kind ~= b.Kind then return a.Kind < b.Kind end
		return tostring(a.Key) < tostring(b.Key)
	end)
	return out
end

-- Opening keeps each row's own start (all are in the past, so content that unlocks day by day after the
-- start is all unlocked) and moves only its end fields to now + OPEN_DAYS. Every change is recorded, and
-- the next tap puts it back first, so only one event is open at a time: lookups that take "the first open
-- row" then find the chosen one.
M.changed = M.changed or {}

local function set(tb, key, value)
	M.changed[#M.changed + 1] = { tb = tb, key = key, value = tb[key] }
	tb[key] = value
end

function M.Restore()
	for i = #M.changed, 1, -1 do
		local c = M.changed[i]
		c.tb[c.key] = c.value
		M.changed[i] = nil
	end
end

-- An end is seconds, or a yyyymmddHHMM number (ConcertExchange time list). 0 means "no end".
local function extend(tb, key, untilSec)
	local value = tb[key]
	if type(value) ~= 'number' or value == 0 then return end
	if value >= 190000000000 and value < 300000000000 then
		local target = tonumber(os.date('%Y%m%d%H%M', untilSec))
		if target and value < target then set(tb, key, target) end
	elseif value < untilSec then
		set(tb, key, untilSec)
	end
end

function M.Activate(entry)
	local rows = familyRows(entry.Family)
	if not rows then return false end
	M.Restore()
	local untilSec = GetTime() + M.OPEN_DAYS * DAY
	local opened = 0
	for key, tb in pairs(rows) do
		if (entry.Key == ALL and accepted(entry.Family, tb)) or (key == entry.Key and type(tb) == 'table') then
			extend(tb, 'EndTime', untilSec)
			extend(tb, 'ClearTime', untilSec + 3 * DAY)
			opened = opened + 1
		end
	end
	if entry.Family.extras then
		local ok, specs = pcall(entry.Family.extras)
		for _, spec in ipairs(ok and type(specs) == 'table' and specs or {}) do
			for _, tb in pairs(type(spec.rows) == 'table' and spec.rows or {}) do
				if type(tb) == 'table' and (not spec.filter or spec.filter(tb)) then
					for _, key in ipairs(spec.ends) do extend(tb, key, untilSec) end
				end
			end
		end
	end
	return opened > 0
end

function M.Enter(entry)
	if not M.Activate(entry) then
		Game.MessageBox.Simple(UIText('UI_FightMode.tip'))
		return
	end
	log('enter ' .. entry.Kind .. ' ' .. tostring(entry.Key))
	entry.Family.enter(familyRows(entry.Family)[entry.Key])
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
