-- Controller (Bluetooth/USB gamepad) navigation for menus, story scenes and every window outside a fight.
--
-- The layout of the game does not change. A focus frame moves between the controls that a finger could
-- tap at that moment, and the pad presses them the way a finger does:
--   * Candidates are the game's own click targets: every interactable Selectable (Button, Toggle, Slider,
--     InputField) plus the components that the client's Lua wires by hand (EventTriggerListener,
--     EventTrigger, LongPressButton, LongPushCount, ScrollItemPushEvent, RoleCardDrag).
--   * A candidate counts only if a tap on its centre would reach it: the layer asks the EventSystem's
--     raycasters, so a popup, its dark backdrop or a tutorial mask hides what lies below, exactly as for
--     touch. Items of a scroll list that are clipped by its viewport stay reachable; the list scrolls to them.
--   * D-pad or left stick moves the focus to the nearest candidate in that direction (the beam rule of
--     Android's FocusFinder). A presses it with the client's own Game.Utils.ExecutePointerDown/Up/Click
--     events, the calls of its UI test runner, so long-press and hold-to-repeat buttons work too.
--   * B taps the window's close/back/cancel button, or a full-screen "tap to close" backdrop.
--   * LB / RB switch the tab of the top tab bar (a ToggleGroup), or press a left/right arrow button.
--   * Right stick scrolls the list that holds the focus.
--   * Story scenes: A advances the dialogue (Cartoon:OnTouch); the d-pad reaches Skip, menu and choices.
--   * Select turns an optional cursor on and off: the left stick moves it, A taps under it.
-- While the fight HUD has the controls (gamepad_fight.lua), this layer stays idle and only sets
-- GamepadMenu.owner. Every C# call is guarded: an error is logged once ([pad] menu: ...) and the layer
-- carries on; after many errors in a row it turns itself off.
-- patch_gamepad.py places this file at the end of UI.lua, in a do-block, and starts it from UI.Open.
GamepadMenu = GamepadMenu or {}
local M = GamepadMenu

local BTN = { A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, L3 = 8, R3 = 9, START = 10, SELECT = 11 }

M.cfg = M.cfg or {
	dead        = 0.5,     -- stick threshold for a focus step
	repeatDelay = 0.38,    -- hold a direction: first repeat after this many seconds
	repeatGap   = 0.11,    -- then one step per this many seconds
	press       = { BTN.A },
	back        = { BTN.B },
	tabPrev     = { BTN.LB },
	tabNext     = { BTN.RB },
	skip        = { BTN.START },   -- story scenes: the Skip button
	cursor      = { BTN.SELECT },  -- optional cursor on/off
	rStickX     = 4, rStickY = 5,  -- same axis numbers as gamepad_fight.lua
	hatX        = 6, hatY = 7,
	scrollSpeed = 1.6,     -- right stick: viewport heights per second at full tilt
	cursorSpeed = 1.1,     -- cursor: screen heights per second at full tilt
	bigArea     = 0.45,    -- a target that covers this share of the screen is a backdrop
	frame       = { 1.0, 0.80, 0.25 },  -- focus frame colour
	thickness   = 0.006,   -- frame thickness, share of the screen height
	debug       = false,   -- L3 + R3: log focus and button changes
}

-- ---------- small helpers ----------
local UGUI = U3D.UI
local ES = U3D.EventSystems
local V2, V3 = U3D.Vector2, U3D.Vector3

local KC_JOY0 = 330   -- KeyCode.JoystickButton0
local kc = {}
local function key(n)
	local k = kc[n]
	if not k then k = U3D.KeyCode.__CastFrom(KC_JOY0 + n); kc[n] = k end
	return U3D.Input.GetKey(k)
end
local function anyKey(list)
	for _, n in ipairs(list) do if key(n) then return true end end
	return false
end

local absent = {}
local function named(name)
	if absent[name] then return nil end
	local ok, v = pcall(U3D.Input.GetAxisRaw, name)
	if ok then return v end
	absent[name] = true
	return nil
end
local STOCK = { [4] = { "RightHorizontal", 1 }, [5] = { "RightVertical", -1 } }
local function axis(n)
	if not n or n <= 0 then return 0 end
	local v = named("gcgpad_a" .. n)
	if v == nil and STOCK[n] then
		v = named(STOCK[n][1])
		if v then v = v * STOCK[n][2] end
	end
	return v or 0
end

local function now() return U3D.Time.realtimeSinceStartup end

local logged = {}
local function log(msg)
	print("[pad] menu: " .. msg)
end
local function logOnce(msg)
	if logged[msg] then return end
	logged[msg] = true
	log(msg)
end

local function alive(o)
	if o == nil then return false end
	local ok, dead = pcall(Game.Utils.IsDestroyed, o)
	return ok and not dead
end

-- ---------- pure geometry (screen pixels, y up); also run by test_gamepad.py ----------
local G = {}
M._geo = G

function G.center(r) return (r.x0 + r.x1) * 0.5, (r.y0 + r.y1) * 0.5 end

-- r lies beyond src in direction d (both edges further along d)
function G.inDir(src, r, d)
	if d == 'right' then return src.x0 < r.x0 + 0.5 and src.x1 < r.x1 - 0.5 and r.x0 > src.x0 + (src.x1 - src.x0) * 0.25
	elseif d == 'left' then return src.x1 > r.x1 - 0.5 and src.x0 > r.x0 + 0.5 and r.x1 < src.x1 - (src.x1 - src.x0) * 0.25
	elseif d == 'up' then return src.y0 < r.y0 + 0.5 and src.y1 < r.y1 - 0.5 and r.y0 > src.y0 + (src.y1 - src.y0) * 0.25
	else return src.y1 > r.y1 - 0.5 and src.y0 > r.y0 + 0.5 and r.y1 < src.y1 - (src.y1 - src.y0) * 0.25 end
end

local function horizontal(d) return d == 'left' or d == 'right' end

function G.inBeam(src, r, d)
	if horizontal(d) then return r.y1 > src.y0 and r.y0 < src.y1 end
	return r.x1 > src.x0 and r.x0 < src.x1
end

function G.major(src, r, d)
	local v
	if d == 'right' then v = r.x0 - src.x1 elseif d == 'left' then v = src.x0 - r.x1
	elseif d == 'up' then v = r.y0 - src.y1 else v = src.y0 - r.y1 end
	return math.max(0, v)
end

function G.majorFar(src, r, d)
	local v
	if d == 'right' then v = r.x1 - src.x1 elseif d == 'left' then v = src.x0 - r.x0
	elseif d == 'up' then v = r.y1 - src.y1 else v = src.y0 - r.y0 end
	return math.max(1, v)
end

function G.minor(src, r, d)
	local sx, sy = G.center(src)
	local rx, ry = G.center(r)
	if horizontal(d) then return math.abs(sy - ry) end
	return math.abs(sx - rx)
end

local function beamBeats(src, a, b, d)
	local aIn, bIn = G.inBeam(src, a, d), G.inBeam(src, b, d)
	if bIn or not aIn then return false end
	if not G.inDir(src, b, d) then return true end
	if horizontal(d) then return true end
	return G.major(src, a, d) < G.majorFar(src, b, d)
end

local function score(src, r, d)
	local maj, min = G.major(src, r, d), G.minor(src, r, d)
	return 13 * maj * maj + min * min
end

-- best rect of list (each item has .r) from src in direction d, or nil
function G.best(src, list, d, skip)
	local best
	for _, c in ipairs(list) do
		local r = c.nr or c.r
		if c ~= skip and G.inDir(src, r, d) then
			local br = best and (best.nr or best.r)
			if not best then best = c
			elseif beamBeats(src, r, br, d) then best = c
			elseif not beamBeats(src, br, r, d) and score(src, r, d) < score(src, br, d) then best = c end
		end
	end
	return best
end

-- rank of a name as a "back" target: 1 close, 2 back/return, 3 cancel/no; nil otherwise
function G.backRank(name)
	local n = string.lower(name or '')
	if n:find('background', 1, true) or n:find('feedback', 1, true) or n:find('backpack', 1, true) then return nil end
	if n:find('close', 1, true) or n:find('exit', 1, true) then return 1 end
	if n:find('back', 1, true) or n:find('return', 1, true) or n:find('fanhui', 1, true) then return 2 end
	if n:find('cancel', 1, true) or n == 'btnno' or n == 'no' or n:find('btn_no', 1, true) then return 3 end
	return nil
end

-- a full-screen target whose tap is the screen's main action ("Tap Screen to Start", "tap to continue")
function G.isMainAction(name)
	local n = string.lower(name or '')
	for _, w in ipairs({ 'start', 'tap', 'continue', 'next', 'click', 'touch' }) do
		if n:find(w, 1, true) then return true end
	end
	return false
end

-- the box that stands for a main action in focus moves: a third of it, at its centre
function G.mainBox(r)
	local w, h = (r.x1 - r.x0) / 6, (r.y1 - r.y0) / 6
	local cx, cy = G.center(r)
	return { x0 = cx - w, y0 = cy - h, x1 = cx + w, y1 = cy + h }
end

-- a full-screen target that closes a popup when tapped outside it
function G.isBackdrop(name)
	local n = string.lower(name or '')
	for _, w in ipairs({ 'mask', 'bg', 'black', 'blank', 'shadow', 'empty', 'close' }) do
		if n:find(w, 1, true) then return true end
	end
	return false
end

function G.arrowSide(name)
	local n = string.lower(name or '')
	if n:find('left', 1, true) or n:find('prev', 1, true) then return -1 end
	if n:find('right', 1, true) or n:find('next', 1, true) then return 1 end
	return nil
end

function G.isConfirm(name)
	local n = string.lower(name or '')
	return n:find('confirm', 1, true) or n:find('sure', 1, true) or n:find('yes', 1, true)
		or n:match('^btn_?ok') or n == 'ok' or n:match('_ok$') or false
end

-- members of one toggle group in reading order (left to right, or top to bottom when stacked)
function G.order(list)
	local x0, x1, y0, y1 = math.huge, -math.huge, math.huge, -math.huge
	for _, c in ipairs(list) do
		local cx, cy = G.center(c.r)
		x0, x1, y0, y1 = math.min(x0, cx), math.max(x1, cx), math.min(y0, cy), math.max(y1, cy)
	end
	local byX = (x1 - x0) >= (y1 - y0)
	table.sort(list, function(a, b)
		local ax, ay = G.center(a.r)
		local bx, by = G.center(b.r)
		if byX then return ax < bx end
		return ay > by
	end)
	return list
end

-- ---------- engine access ----------
local hitList, ped, pedSystem
local function eventSystem() return ES.EventSystem.current end

local function rayHit(x, y)
	local es = eventSystem()
	if not es then return nil end
	if not hitList then hitList = CS.System.Collections.Generic.List(ES.RaycastResult)() end
	if not ped or pedSystem ~= es then ped = ES.PointerEventData(es); pedSystem = es end
	ped.position = V2(x, y)
	hitList:Clear()
	es:RaycastAll(ped, hitList)
	if hitList.Count == 0 then return nil end
	return hitList[0].gameObject
end

local overlayMode
local function isOverlay(canvas)
	if not overlayMode then overlayMode = U3D.RenderMode.ScreenSpaceOverlay end
	return canvas.renderMode == overlayMode
end

-- screen rect of a RectTransform: {x0, y0, x1, y1, order}
local function screenRect(rt)
	local canvas = rt:GetComponentInParent(typeof(U3D.Canvas))
	if not canvas then return nil end
	local root = canvas.rootCanvas
	local cam = nil
	if not isOverlay(root) then cam = root.worldCamera end
	local r = rt.rect
	local a = U3D.RectTransformUtility.WorldToScreenPoint(cam, rt:TransformPoint(V3(r.xMin, r.yMin, 0)))
	local b = U3D.RectTransformUtility.WorldToScreenPoint(cam, rt:TransformPoint(V3(r.xMax, r.yMax, 0)))
	return { x0 = math.min(a.x, b.x), y0 = math.min(a.y, b.y), x1 = math.max(a.x, b.x), y1 = math.max(a.y, b.y),
		order = root.sortingOrder }
end

local EXTRA = { 'Game.EventTriggerListener', 'UnityEngine.EventSystems.EventTrigger', 'Game.LongPressButton',
	'Game.LongPushCount', 'Game.ScrollItemPushEvent', 'Game.RoleCardDrag' }
local extraTypes
local function typesOf()
	if extraTypes then return extraTypes end
	extraTypes = {}
	for _, path in ipairs(EXTRA) do
		local t = CS
		for part in path:gmatch('[^.]+') do
			local ok, v = pcall(function() return t[part] end)
			t = ok and v or nil
			if not t then break end
		end
		if t then
			local ok, ty = pcall(typeof, t)
			if ok and ty then extraTypes[#extraTypes + 1] = ty end
		end
	end
	return extraTypes
end

local scrollTypes
local function scrollTypesOf()
	if scrollTypes then return scrollTypes end
	scrollTypes = { typeof(UGUI.ScrollRect) }
	local ok, t = pcall(function() return typeof(UGUI.LoopScrollRect) end)
	if ok and t then scrollTypes[2] = t end
	return scrollTypes
end

local function scrollOf(tr, cache)
	local t = tr.parent
	local walked = {}
	local found = false
	while t do
		local id = t:GetInstanceID()
		local c = cache[id]
		if c ~= nil then found = c; break end
		walked[#walked + 1] = id
		for _, ty in ipairs(scrollTypesOf()) do
			local s = t:GetComponent(ty)
			if s and s.isActiveAndEnabled then found = s; break end
		end
		if found then break end
		t = t.parent
	end
	for _, id in ipairs(walked) do cache[id] = found end
	return found or nil
end

local function viewportOf(sr)
	local ok, vp = pcall(function() return sr.viewport end)
	if ok and vp then return vp end
	return sr.transform
end

local windowRoot
local function windowName(tr)
	if not windowRoot then
		local ok, r = pcall(function() return Game.CanvasCamera.Root end)
		windowRoot = ok and r or false
	end
	local t, last = tr, tr
	while t do
		local p = t.parent
		if p == nil or (windowRoot and p == windowRoot) then return t.name end
		last = t
		t = p
	end
	return last.name
end

local typeCache = {}
local function kindOf(sel)
	local function is(name)
		local ty = typeCache[name]
		if ty == nil then
			local ok, t = pcall(function() return typeof(UGUI[name]) end)
			ty = ok and t or false
			typeCache[name] = ty
		end
		return ty and ty:IsInstanceOfType(sel)
	end
	if is('Scrollbar') then return nil end
	if is('Slider') then return 'slider' end
	if is('Toggle') then return 'toggle' end
	if is('InputField') then return 'input' end
	return 'button'
end

-- ---------- candidates ----------
local st = {
	focus = nil, list = {}, byId = {}, nav = {}, memory = {},
	shown = false, cursorOn = false, cx = 0, cy = 0,
	prev = {}, dirHeld = nil, dirNext = 0, pending = nil,
	pressed = nil, lastCheck = 0, lastTick = 0, errors = 0,
	owner = 'menu', hudCheck = 0,
}

local function owner(go, byId)
	local t = go and go.transform
	while t do
		local c = byId[t.gameObject:GetInstanceID()]
		if c then return c end
		t = t.parent
	end
	return nil
end

local function collect()
	local list, byId = {}, {}
	local sw, sh = U3D.Screen.width, U3D.Screen.height
	local function add(comp, kind)
		local go = comp.gameObject
		local id = go:GetInstanceID()
		if byId[id] then return end
		local c = { go = go, rt = go.transform, id = id, kind = kind, comp = comp }
		byId[id] = c
		list[#list + 1] = c
	end
	local sels = UGUI.Selectable.allSelectables
	for i = 0, sels.Count - 1 do
		local s = sels[i]
		if s and s:IsInteractable() then
			local kind = kindOf(s)
			if kind then add(s, kind) end
		end
	end
	for _, ty in ipairs(typesOf()) do
		local arr = U3D.Object.FindObjectsOfType(ty)
		for i = 0, arr.Length - 1 do
			local c = arr[i]
			if c and c.isActiveAndEnabled then add(c, 'trigger') end
		end
	end

	-- keep what a tap would reach
	local result, scrolls, vpHit, vpRect = {}, {}, {}, {}
	for _, c in ipairs(list) do
		local ok, r = pcall(screenRect, c.rt)
		if ok and r and (r.x1 - r.x0) >= 4 and (r.y1 - r.y0) >= 4 then
			c.r = r
			local cx, cy = G.center(r)
			local onScreen = cx >= 0 and cx <= sw and cy >= 0 and cy <= sh
			local hit = onScreen and rayHit(cx, cy) or nil
			if hit and owner(hit, byId) == c then
				c.reach = true
			elseif onScreen and (r.x1 - r.x0) * (r.y1 - r.y0) >= 0.04 * sw * sh then
				-- a large target (a backdrop, a banner) may carry pictures on its centre: try four more points
				for _, q in ipairs({ { 0.25, 0.25 }, { 0.75, 0.25 }, { 0.25, 0.75 }, { 0.75, 0.75 } }) do
					local h = rayHit(r.x0 + (r.x1 - r.x0) * q[1], r.y0 + (r.y1 - r.y0) * q[2])
					if h and owner(h, byId) == c then c.reach = true; c.probe = q; break end
				end
			end
			local sr = scrollOf(c.rt, scrolls)
			if sr then
				c.scroll = sr
				if not c.reach then
					-- clipped by its list: reachable when the list itself can be touched
					local key = sr:GetInstanceID()
					local open = vpHit[key]
					if open == nil then
						open = false
						local vr = screenRect(viewportOf(sr))
						if vr then
							local vx, vy = G.center(vr)
							local h = rayHit(vx, vy)
							open = h ~= nil and h.transform:IsChildOf(sr.transform)
							vpRect[key] = vr
						end
						vpHit[key] = open
					end
					if open then
						local vr = vpRect[key]
						local inside = vr and cx >= vr.x0 and cx <= vr.x1 and cy >= vr.y0 and cy <= vr.y1
						if not inside then c.reach = true; c.clipped = true end
					end
				end
			end
			if c.reach then
				c.big = (r.x1 - r.x0) * (r.y1 - r.y0) >= M.cfg.bigArea * sw * sh
				c.win = windowName(c.rt)
				result[#result + 1] = c
			end
		end
	end
	local nav = {}
	for _, c in ipairs(result) do
		-- a full-screen button (the title's BtnLogin, "Tap Screen to Start") is that screen's main action,
		-- unless its name says backdrop; a full-screen hand-wired trigger (often a drag area) only when it is
		-- a whole window or says so by name. A main action stays in the focus moves, through a box at its centre
		if c.big and not G.isBackdrop(c.go.name)
			and (c.kind ~= 'trigger' or c.go.name == c.win or G.isMainAction(c.go.name)) then
			c.main = true
			c.nr = G.mainBox(c.r)
		end
		if not c.big or c.main then nav[#nav + 1] = c end
	end
	if #nav == 0 then for _, c in ipairs(result) do nav[#nav + 1] = c end end
	local reach = {}
	for _, c in ipairs(result) do reach[c.id] = c end
	st.list, st.byId, st.nav, st.all = result, reach, nav, byId
	return result
end

local function inNav(c)
	for _, n in ipairs(st.nav) do if n == c then return true end end
	return false
end

-- ---------- story scenes ----------
local function storyCartoon()
	if not UI.IsOpen('UI_Cartoon') then return nil end
	local ok, playing = pcall(function() return Game.CartoonMgr.IsPlaying end)
	if not (ok and playing) then return nil end
	local ok2, cartoon = pcall(function() return Game.CartoonMgr.Ins:GetCartoonNow() end)
	return ok2 and cartoon or nil
end

local function choices()
	local out = {}
	for _, c in ipairs(st.nav) do
		if string.find(c.go.name, 'BtnChoice', 1, true) then out[#out + 1] = c end
	end
	return out
end

-- ---------- focus ----------
local function scrollIntoView(c)
	local sr = c.scroll
	if not sr then return end
	local vp = viewportOf(sr)
	local content = sr.content
	if not (vp and content) then return end
	local r = c.rt.rect
	local a = vp:InverseTransformPoint(c.rt:TransformPoint(V3(r.xMin, r.yMin, 0)))
	local b = vp:InverseTransformPoint(c.rt:TransformPoint(V3(r.xMax, r.yMax, 0)))
	local vr = vp.rect
	local pad = 8
	local dx, dy = 0, 0
	if sr.vertical then
		if b.y > vr.yMax then dy = vr.yMax - b.y - pad
		elseif a.y < vr.yMin then dy = vr.yMin - a.y + pad end
	end
	if sr.horizontal then
		if a.x < vr.xMin then dx = vr.xMin - a.x + pad
		elseif b.x > vr.xMax then dx = vr.xMax - b.x - pad end
	end
	if dx == 0 and dy == 0 then return end
	local world = vp:TransformVector(V3(dx, dy, 0))
	local d = content.parent:InverseTransformVector(world)
	local p = content.anchoredPosition
	content.anchoredPosition = V2(p.x + d.x, p.y + d.y)
	pcall(function() sr:StopMovement() end)
end

local function describe(c)
	if not c then return 'none' end
	return (c.win or '?') .. '/' .. c.go.name .. ' (' .. c.kind .. ')'
end

local function setFocus(c)
	if c == st.focus then return end
	st.focus = c
	if c then
		st.memory[c.win] = c.go
		if c.clipped or c.scroll then pcall(scrollIntoView, c) end
	end
	if M.cfg.debug then log('focus ' .. describe(c)) end
end

local SIDE_WINDOWS = { UI_Player = true }

local function topOrder(list)
	local best = -math.huge
	for _, c in ipairs(list) do if c.r.order > best then best = c.r.order end end
	return best
end

local function guideTarget()
	if not UI.IsOpen('UI_Guide') then return nil end
	local g = UI.GetClass('UI_Guide')
	local obj = g and g.obj
	if not alive(obj) then return nil end
	local ok, go = pcall(function() return obj.gameObject end)
	if not ok then return nil end
	local c = owner(go, st.byId)
	return c
end

local function pickInitial(anyway)
	local nav = st.nav
	if #nav == 0 then return nil end
	local g = guideTarget()
	if g then return g end
	if not anyway and storyCartoon() then
		local ch = choices()
		return ch[1]
	end
	-- the page or popup on top; the resource bar sorts above every page, so it wins only when alone
	local pool = {}
	for _, c in ipairs(nav) do if not SIDE_WINDOWS[c.win] then pool[#pool + 1] = c end end
	if #pool == 0 then pool = nav end
	local top = topOrder(pool)
	local inTop = {}
	for _, c in ipairs(pool) do if c.r.order == top then inTop[#inTop + 1] = c end end
	-- the control last used in this window
	for _, c in ipairs(inTop) do
		local m = st.memory[c.win]
		if m and m == c.go then return c end
	end
	for _, c in ipairs(inTop) do
		if c.main then return c end
	end
	for _, c in ipairs(inTop) do
		if G.isConfirm(c.go.name) then return c end
	end
	local sw, sh = U3D.Screen.width * 0.5, U3D.Screen.height * 0.5
	local best, bd
	for _, c in ipairs(inTop) do
		local x, y = G.center(c.r)
		local d = (x - sw) ^ 2 + (y - sh) ^ 2
		if not bd or d < bd then best, bd = c, d end
	end
	return best
end

-- is the focused control still where a tap would reach it?
local function focusValid()
	local c = st.focus
	if not c or not alive(c.go) or not c.go.activeInHierarchy then return false end
	if c.comp and c.kind ~= 'trigger' then
		local ok, on = pcall(function() return c.comp:IsInteractable() end)
		if ok and not on then return false end
	end
	local ok, r = pcall(screenRect, c.rt)
	if not ok or not r then return false end
	c.r = r
	if c.clipped then return true end
	local x, y = G.center(r)
	if c.probe then x, y = r.x0 + (r.x1 - r.x0) * c.probe[1], r.y0 + (r.y1 - r.y0) * c.probe[2] end
	local hit = rayHit(x, y)
	return hit ~= nil and owner(hit, st.all or st.byId) == c
end

local function refresh(keep)
	collect()
	if keep and st.focus and st.byId[st.focus.id] then
		st.focus = st.byId[st.focus.id]
		return
	end
	local story = storyCartoon()
	if story and not st.focus and #choices() == 0 and not guideTarget() then return end
	setFocus(pickInitial())
end

-- ---------- scrolling ----------
local function canScroll(sr, d)
	local vp = viewportOf(sr)
	local vr, cr = screenRect(vp), screenRect(sr.content)
	if not (vr and cr) then return false end
	if d == 'down' then return sr.vertical and cr.y0 < vr.y0 - 2
	elseif d == 'up' then return sr.vertical and cr.y1 > vr.y1 + 2
	elseif d == 'left' then return sr.horizontal and cr.x0 < vr.x0 - 2
	else return sr.horizontal and cr.x1 > vr.x1 + 2 end
end

-- move the list content by (dx, dy) viewport units; positive dy shows what lies below
local function shiftContent(sr, dx, dy)
	local vp = viewportOf(sr)
	local content = sr.content
	local world = vp:TransformVector(V3(-dx, dy, 0))
	local d = content.parent:InverseTransformVector(world)
	local p = content.anchoredPosition
	content.anchoredPosition = V2(p.x + d.x, p.y + d.y)
	pcall(function() sr:StopMovement() end)
end

local function nudge(c, d)
	local sr = c and c.scroll
	if not sr or not canScroll(sr, d) then return false end
	local r = c.rt.rect
	local step = (horizontal(d) and r.width or r.height) * 1.05
	if d == 'down' then shiftContent(sr, 0, step)
	elseif d == 'up' then shiftContent(sr, 0, -step)
	elseif d == 'right' then shiftContent(sr, step, 0)
	else shiftContent(sr, -step, 0) end
	return true
end

-- ---------- actions ----------
local function pressDown(go)
	st.pressed = go
	Game.Utils.ExecutePointerDownEvents(go)
end

local function pressUp(click)
	local go = st.pressed
	st.pressed = nil
	if not alive(go) then return end
	Game.Utils.ExecutePointerUpEvents(go)
	if click then Game.Utils.ExecuteClickEvents(go) end
end

local function move(d)
	if not focusValid() then refresh(false) else refresh(true) end
	local f = st.focus
	if not f then
		setFocus(pickInitial(true))
		return
	end
	if f.kind == 'slider' and horizontal(d) then
		local s = f.comp
		local step = (s.maxValue - s.minValue) / (s.wholeNumbers and math.max(1, s.maxValue - s.minValue) or 20)
		s.value = s.value + (d == 'right' and step or -step)
		return
	end
	local b = G.best(f.nr or f.r, st.nav, d, f)
	if b then setFocus(b); return end
	if nudge(f, d) then st.pending = { d = d, at = now() + 0.08, tries = 2 } end
end

local function back()
	refresh(true)
	local best, br
	for _, c in ipairs(st.list) do
		local rank = G.backRank(c.go.name)
		if not rank and c.big and G.isBackdrop(c.go.name) then rank = 4 end
		if rank then
			-- higher window first, then the lower rank, then the one nearest the top right corner
			local x, y = G.center(c.r)
			local key = { -c.r.order, rank, -(x + y) }
			if not br or key[1] < br[1] or (key[1] == br[1] and (key[2] < br[2] or (key[2] == br[2] and key[3] < br[3]))) then
				best, br = c, key
			end
		end
	end
	if M.cfg.debug then log('back ' .. describe(best)) end
	if best then
		pressDown(best.go)
		pressUp(true)
	end
end

local function tab(side)
	refresh(true)
	-- toggle groups among the reachable toggles
	local groups, order = {}, {}
	for _, c in ipairs(st.list) do
		if c.kind == 'toggle' then
			local ok, g = pcall(function() return c.comp.group end)
			if ok and g then
				local id = g:GetInstanceID()
				if not groups[id] then groups[id] = {}; order[#order + 1] = id end
				table.insert(groups[id], c)
			end
		end
	end
	local pick, py
	for _, id in ipairs(order) do
		local g = groups[id]
		if #g >= 2 then
			local top = -math.huge
			for _, c in ipairs(g) do top = math.max(top, c.r.y1) end
			-- the tab bar nearest the top of the screen, in the highest window
			local key = g[1].r.order * 100000 + top
			if not py or key > py then pick, py = g, key end
		end
	end
	if pick then
		G.order(pick)
		local cur = 1
		for i, c in ipairs(pick) do if c.comp.isOn then cur = i end end
		local nxt = pick[cur + side]
		if nxt then
			if M.cfg.debug then log('tab ' .. describe(nxt)) end
			pressDown(nxt.go); pressUp(true)
			if st.focus and st.focus.kind == 'toggle' then setFocus(nxt) end
		end
		return
	end
	-- arrow buttons (previous / next girl, page, chapter)
	local best, bo
	for _, c in ipairs(st.nav) do
		if G.arrowSide(c.go.name) == side and (not bo or c.r.order > bo) then best, bo = c, c.r.order end
	end
	if best then pressDown(best.go); pressUp(true) end
end

local function skipStory()
	refresh(true)
	for _, c in ipairs(st.nav) do
		if string.find(string.lower(c.go.name), 'skip', 1, true) then
			pressDown(c.go); pressUp(true)
			return
		end
	end
end

-- The list the right stick moves when the focus is in none. The scene scan is costly, so its result
-- (also "no list") is kept for SCROLL_RESCAN seconds while the stick stays tilted.
local SCROLL_RESCAN = 0.25
local function largestScroll()
	local t = now()
	local cached = st.scrollPick
	if cached and t - cached.at < SCROLL_RESCAN
		and (cached.sr == nil or (alive(cached.sr) and cached.sr.isActiveAndEnabled)) then
		return cached.sr
	end
	-- the largest reachable list
	local best, ba
	for _, ty in ipairs(scrollTypesOf()) do
		local arr = U3D.Object.FindObjectsOfType(ty)
		for i = 0, arr.Length - 1 do
			local s = arr[i]
			local vr = s.isActiveAndEnabled and screenRect(viewportOf(s))
			if vr then
				local x, y = G.center(vr)
				local h = rayHit(x, y)
				if h and h.transform:IsChildOf(s.transform) then
					local a = (vr.x1 - vr.x0) * (vr.y1 - vr.y0)
					if not ba or a > ba then best, ba = s, a end
				end
			end
		end
	end
	st.scrollPick = { sr = best, at = t }
	return best
end

local function scrollBy(rx, ry, dt)
	local c = st.focus
	local sr = c and c.scroll
	if not sr then sr = largestScroll() end
	if not sr then return end
	local vr = viewportOf(sr).rect
	local k = M.cfg.scrollSpeed * dt
	-- raw stick axes: right and down are positive, so they map straight to "show what lies right / below"
	shiftContent(sr, sr.horizontal and rx * vr.width * k or 0, sr.vertical and ry * vr.height * k or 0)
end

-- ---------- overlay: focus frame and cursor ----------
local function makeImage(parent, name, color)
	local go = U3D.GameObject(name)
	-- hidden until placed: a new Image is a 100 x 100 white square at the bottom-left anchor
	go:SetActive(false)
	go.transform:SetParent(parent, false)
	local img = go:AddComponent(typeof(UGUI.Image))
	img.raycastTarget = false
	img.color = color
	local rt = go:GetComponent(typeof(U3D.RectTransform))
	rt.anchorMin = V2(0, 0); rt.anchorMax = V2(0, 0); rt.pivot = V2(0, 0)
	return { go = go, rt = rt, img = img }
end

local function overlay()
	local o = M.overlay
	if o and alive(o.root) then return o end
	local root = U3D.GameObject('GamepadMenuOverlay')
	U3D.Object.DontDestroyOnLoad(root)
	local canvas = root:AddComponent(typeof(U3D.Canvas))
	canvas.renderMode = U3D.RenderMode.ScreenSpaceOverlay
	canvas.sortingOrder = 32000
	local f = M.cfg.frame
	o = { root = root, bars = {}, cursor = {} }
	for i = 1, 4 do o.bars[i] = makeImage(root.transform, 'Frame' .. i, U3D.Color(f[1], f[2], f[3], 1)) end
	o.cursor[1] = makeImage(root.transform, 'CursorShadow', U3D.Color(0, 0, 0, 0.6))
	o.cursor[2] = makeImage(root.transform, 'CursorH', U3D.Color(1, 1, 1, 1))
	o.cursor[3] = makeImage(root.transform, 'CursorV', U3D.Color(1, 1, 1, 1))
	M.overlay = o
	return o
end

local function place(item, x, y, w, h)
	item.rt.anchoredPosition = V2(x, y)
	item.rt.sizeDelta = V2(w, h)
end

local function showFrame(r)
	local o = overlay()
	local t = math.max(3, U3D.Screen.height * M.cfg.thickness)
	local pulse = 0.65 + 0.35 * math.abs(math.sin(now() * 3.2))
	local g = 3   -- gap between the control and the frame
	local x0, y0, x1, y1 = r.x0 - g - t, r.y0 - g - t, r.x1 + g, r.y1 + g
	-- a full-screen target (the title's tap area) gets its frame on the screen edges
	local sw, sh = U3D.Screen.width, U3D.Screen.height
	x0, y0 = math.max(0, x0), math.max(0, y0)
	x1, y1 = math.min(sw - t, x1), math.min(sh - t, y1)
	local w, h = x1 - x0 + t, y1 - y0 + t
	place(o.bars[1], x0, y0, w, t)          -- bottom
	place(o.bars[2], x0, y1, w, t)          -- top
	place(o.bars[3], x0, y0, t, h)          -- left
	place(o.bars[4], x1, y0, t, h)          -- right
	local f = M.cfg.frame
	local color = U3D.Color(f[1], f[2], f[3], pulse)
	for i = 1, 4 do
		o.bars[i].img.color = color
		o.bars[i].go:SetActive(true)
	end
end

local function hideFrame()
	local o = M.overlay
	if not (o and alive(o.root)) then return end
	for i = 1, 4 do o.bars[i].go:SetActive(false) end
end

local function showCursor(on)
	local o = on and overlay() or M.overlay
	if not (o and alive(o.root)) then return end
	for i = 1, 3 do o.cursor[i].go:SetActive(on) end
	if not on then return end
	local s = math.max(14, U3D.Screen.height * 0.035)
	local t = math.max(3, s * 0.18)
	place(o.cursor[1], st.cx - s * 0.5 - 2, st.cy - s * 0.5 - 2, s + 4, s + 4)
	place(o.cursor[2], st.cx - s * 0.5, st.cy - t * 0.5, s, t)
	place(o.cursor[3], st.cx - t * 0.5, st.cy - s * 0.5, t, s)
end

-- ---------- input ----------
local function edge(name, list)
	local nowDown = anyKey(list)
	local was = st.prev[name]
	st.prev[name] = nowDown
	if nowDown and not was then return 'down' end
	if was and not nowDown then return 'up' end
	return nil
end

local function stick()
	local x, y = U3D.Input.GetAxisRaw('Horizontal'), U3D.Input.GetAxisRaw('Vertical')
	if x * x + y * y < 0.04 then x, y = axis(M.cfg.hatX), -axis(M.cfg.hatY) end
	return x, y
end

local function direction(x, y)
	local dead = M.cfg.dead
	if math.abs(x) < dead and math.abs(y) < dead then return nil end
	if math.abs(x) >= math.abs(y) then return x > 0 and 'right' or 'left' end
	return y > 0 and 'up' or 'down'
end

local function anyPadInput()
	for n = 0, 11 do if key(n) then return true end end
	local x, y = stick()
	if x * x + y * y > 0.25 then return true end
	local rx, ry = axis(M.cfg.rStickX), axis(M.cfg.rStickY)
	return rx * rx + ry * ry > 0.25
end

-- the fight HUD has the controls while one of its buttons can be tapped
local function hudOwns()
	if not (GamepadFight and GamepadFight.timer and UI.IsOpen('UI_Fight')) then return false end
	if UI.IsOpen('UI_MissionPause') then return false end
	if now() < st.hudCheck then return st.hudOwns end
	st.hudCheck = now() + 0.25
	local root = UI.GetWindowGameObject('UI_Fight')
	local owns = false
	if alive(root) then
		local sels = root:GetComponentsInChildren(typeof(UGUI.Selectable))
		for i = 0, math.min(sels.Length, 12) - 1 do
			local r = screenRect(sels[i].transform)
			if r then
				local x, y = G.center(r)
				local hit = rayHit(x, y)
				if hit and hit.transform:IsChildOf(root.transform) then owns = true; break end
			end
		end
	end
	st.hudOwns = owns
	return owns
end

-- the stock EventSystem sends Submit (button 0) to its selected object: keep nothing selected, so a
-- button that a finger touched earlier is not pressed a second time by A
local function clearSelection()
	local es = eventSystem()
	if not es then return end
	local sel = es.currentSelectedGameObject
	if sel and not sel:GetComponent(typeof(UGUI.InputField)) then es:SetSelectedGameObject(nil) end
end

local function debugToggle()
	if edge('dbgR3', { BTN.R3 }) == 'down' and key(BTN.L3) then
		M.cfg.debug = not M.cfg.debug
		log('debug ' .. tostring(M.cfg.debug))
	end
end

function M.Tick()
	local t = now()
	local dt = math.min(0.1, t - (st.lastTick > 0 and st.lastTick or t))
	st.lastTick = t
	clearSelection()

	if hudOwns() then
		if M.owner ~= 'fight' then
			if st.shown or st.cursorOn then hideFrame(); showCursor(false) end
			-- start from scratch when the HUD gives the pad back: no cursor, and the first pad input only
			-- shows the frame, so A still held from firing does not press the window that opens
			st.shown, st.cursorOn, st.dirHeld, st.prev, st.pending = false, false, nil, {}, nil
			st.focus, st.pressed = nil, nil
		end
		M.owner = 'fight'
		return
	end
	M.owner = 'menu'
	debugToggle()

	-- touch hides the frame; the next pad input brings it back
	if U3D.Input.touchCount > 0 or U3D.Input.GetMouseButton(0) then
		if st.shown then hideFrame(); st.shown = false end
		if st.cursorOn then showCursor(false); st.cursorOn = false end
		return
	end
	if not st.shown and not st.cursorOn then
		if not anyPadInput() then return end
		-- first pad input after touch: show the frame, swallow this press
		st.shown = true
		for name, list in pairs({ press = M.cfg.press, back = M.cfg.back, prev = M.cfg.tabPrev, next = M.cfg.tabNext,
			skip = M.cfg.skip, cursor = M.cfg.cursor }) do st.prev[name] = anyKey(list) end
		st.dirHeld, st.dirNext = direction(stick()), t + M.cfg.repeatDelay
		if not focusValid() then refresh(false) end
		return
	end

	-- optional cursor
	if edge('cursor', M.cfg.cursor) == 'down' then
		st.cursorOn = not st.cursorOn
		if st.cursorOn then
			if st.focus and st.focus.r then st.cx, st.cy = G.center(st.focus.r)
			else st.cx, st.cy = U3D.Screen.width * 0.5, U3D.Screen.height * 0.5 end
			hideFrame()
		else
			showCursor(false)
			st.shown = true
			refresh(false)
		end
		if M.cfg.debug then log('cursor ' .. tostring(st.cursorOn)) end
	end

	local story = storyCartoon()
	local p = edge('press', M.cfg.press)

	if st.cursorOn then
		local x, y = stick()
		local m = math.sqrt(x * x + y * y)
		if m > 0.15 then
			local v = M.cfg.cursorSpeed * U3D.Screen.height * dt * m
			st.cx = math.max(0, math.min(U3D.Screen.width, st.cx + x / m * v))
			st.cy = math.max(0, math.min(U3D.Screen.height, st.cy + y / m * v))
		end
		showCursor(true)
		if p == 'down' then
			collect()
			local c = owner(rayHit(st.cx, st.cy), st.all)
			if c then pressDown(c.go)
			elseif story then pcall(function() story:OnTouch() end) end
		elseif p == 'up' then
			pressUp(true)
		end
	else
		-- focus checks: four times a second, or at once when the focus is gone
		if st.dirty and t >= st.dirty then
			st.dirty = nil
			st.focus = nil
			refresh(false)
			st.lastCheck = t + 0.25
		elseif t >= st.lastCheck then
			-- without a focus (story scenes) look less often: a full scan costs more
			st.lastCheck = t + (st.focus and 0.25 or 0.5)
			if not focusValid() then
				st.focus = nil
				refresh(false)
			end
		end

		-- directions with repeat
		local d = direction(stick())
		if d ~= st.dirHeld then
			st.dirHeld = d
			if d then move(d); st.dirNext = t + M.cfg.repeatDelay end
		elseif d and t >= st.dirNext then
			move(d); st.dirNext = t + M.cfg.repeatGap
		end
		if st.pending and t >= st.pending.at then
			local pd = st.pending
			st.pending = nil
			collect()
			local f = st.focus and st.byId[st.focus.id]
			if f then
				st.focus = f
				local b = G.best(f.nr or f.r, st.nav, pd.d, f)
				if b then setFocus(b)
				elseif pd.tries > 1 then st.pending = { d = pd.d, at = t + 0.08, tries = pd.tries - 1 } end
			end
		end

		if p == 'down' then
			if st.focus and focusValid() then pressDown(st.focus.go)
			elseif story then pcall(function() story:OnTouch() end)
			else refresh(false); if st.focus then pressDown(st.focus.go) end end
		elseif p == 'up' then
			pressUp(true)
		end

		if st.focus and st.focus.r and st.shown then showFrame(st.focus.r) else hideFrame() end
	end

	local b = edge('back', M.cfg.back)
	if b == 'down' then
		if story and st.focus and not st.cursorOn then setFocus(nil) else back() end
	end
	if edge('prev', M.cfg.tabPrev) == 'down' then tab(-1) end
	if edge('next', M.cfg.tabNext) == 'down' then tab(1) end
	if edge('skip', M.cfg.skip) == 'down' and story then skipStory() end

	local rx, ry = axis(M.cfg.rStickX), axis(M.cfg.rStickY)
	if rx * rx + ry * ry > 0.09 then scrollBy(rx, ry, dt) end
end

local function safeTick()
	local ok, err = pcall(M.Tick)
	if ok then
		st.errors = 0
		return
	end
	st.errors = st.errors + 1
	logOnce(tostring(err))
	st.pressed = nil
	if st.errors >= 120 then
		log('turned off after repeated errors')
		M.Stop()
	end
end

-- Called by UI.Open. Start once, and again when the timer has stopped (for example after the timers were
-- cleared). A page or popup that opens takes the focus a moment later, when its controls are in place.
-- UI.Open calls it for every window, so an error is caught here and never stops the window opening.
local function ensure(sClass)
	if type(sClass) == 'string' and not SIDE_WINDOWS[sClass] then st.dirty = now() + 0.15 end
	if M.timer and now() - (st.lastTick or 0) < 1 then return end
	if M.timer then pcall(Game.Timer.Delete, M.timer); M.timer = nil end
	-- real time: the pause menu sets the game's timer scale to 0
	local ok, t = pcall(Game.Timer.Add, 0.01, 0.01, safeTick, true, true)
	if ok then
		M.timer = t
		st.lastTick = now()
		log('started')
	else
		logOnce('start failed: ' .. tostring(t))
	end
end

function M.Ensure(sClass)
	if M.off then return end
	local ok, err = pcall(ensure, sClass)
	if not ok then pcall(logOnce, 'ensure: ' .. tostring(err)) end
end

-- After Stop the layer owns nothing, so the fight layer is never muted by a layer that no longer runs.
function M.Stop()
	M.off = true
	M.owner = nil
	if M.timer then pcall(Game.Timer.Delete, M.timer); M.timer = nil end
	pcall(hideFrame)
	pcall(showCursor, false)
end

M._state = st
