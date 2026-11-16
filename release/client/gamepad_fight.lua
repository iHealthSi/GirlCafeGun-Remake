-- Controller (Bluetooth/USB gamepad) input for shooting stages.
-- Adapted from GirlCafeGun-Offline tools/lua/GamepadFight.lua (MIT, GCG2-Offline contributors).
--
-- Unity's legacy Input receives Android controller events natively. Each frame this layer reads it and
-- makes the calls of the client's own developer keyboard handler (Game.Keyboard.UpdateInput, whose body
-- is not reachable in release clients):
--   move  -> Game.FightJoystick.SetMoveOffset(dir)          fire  -> fightCamera:OnFight(v) / OnFightStop()
--   skill -> Game.UI_FightProxy.OnUseSkillByIdx(0..2, nil)   dodge -> OnUseSkillByIdx(3, nil)
-- Touch keeps working: the pad sends "stop" only for an action that it started. Every C# call is
-- guarded; a failure disables that one action and is logged once (logcat tag Unity, prefix [pad]).
-- patch_gamepad.py places this file inside UI_Fight.lua, in a do-block, so no local leaks into it.
GamepadFight = GamepadFight or {}
local P = GamepadFight

-- Unity joystick button numbers on Android (standard gamepad layout)
local BTN = { A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, L3 = 8, R3 = 9, START = 10, SELECT = 11 }

P.cfg = P.cfg or {
	dead      = 0.25,              -- stick dead zone
	trigger   = 0.45,              -- trigger press threshold
	fire      = { BTN.A, BTN.RB }, -- hold to fire (plus right trigger)
	dodge     = { BTN.LB },        -- move skill (idx 3)
	skill1    = { BTN.X },         -- skill idx 0
	skill2    = { BTN.Y },         -- skill idx 1
	skill3    = { BTN.B },         -- skill idx 2
	pause     = { BTN.START },
	auto      = { BTN.SELECT },    -- auto-fight toggle
	twinStick = true,              -- right stick = aim + fire
	-- Joystick axis numbers (Unity "Nth axis"), 0 = off. Controllers differ: turn on debug (L3+R3) and
	-- read logcat to find yours. One axis per role.
	rStickX   = 4, rStickY = 5,
	rTrigger  = 3,
	hatX      = 6, hatY = 7,       -- d-pad as hat axes (assumed layout)
	debug     = false,             -- L3+R3 toggles: logs every button / axis change
}

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

-- Legacy Input reads a joystick axis only through a named InputManager entry, and an unknown name
-- raises an error. The optional InputManager patch adds "gcgpad_aN" for every axis N (raw, not
-- inverted). Without it the stock table still names axes 3, 4 and 5; RightVertical is stored
-- inverted, hence the sign. An absent name is asked once and then remembered.
local STOCK = { [3] = { "HandleFire", 1 }, [4] = { "RightHorizontal", 1 }, [5] = { "RightVertical", -1 } }
local absent = {}
local function named(name)
	if absent[name] then return nil end
	local ok, v = pcall(U3D.Input.GetAxisRaw, name)
	if ok then return v end
	absent[name] = true
	return nil
end
local function axis(n)
	if not n or n <= 0 then return 0 end
	local v = named("gcgpad_a" .. n)
	if v == nil and STOCK[n] then
		v = named(STOCK[n][1])
		if v then v = v * STOCK[n][2] end
	end
	return v or 0
end

local broken = {}
local function try(name, fn, ...)
	if broken[name] then return end
	local ok, err = pcall(fn, ...)
	if not ok then
		broken[name] = true
		print("[pad] " .. name .. " disabled: " .. tostring(err))
	end
end

-- ---------- game actions (same calls as Game.Keyboard.UpdateInput) ----------
local function fightCamera()
	local gm = Game.GameMode.instance
	return gm and gm.fightCamera
end
local function move(x, y)
	Game.FightJoystick.SetMoveOffset(U3D.Vector2(x, y))
end
local function fireStart(x, y)
	local cam = fightCamera(); if cam then cam:OnFight(U3D.Vector2(x or 0, y or 0)) end
end
local function fireStop()
	local cam = fightCamera(); if cam then cam:OnFightStop() end
end
local function skill(idx)
	Game.UI_FightProxy.OnUseSkillByIdx(idx, nil)
end
local function pause()
	if Game.Map.isOnline or Game.CartoonMgr.IsPlaying or Game.GameMode.IsEnd then return end
	local gm = Game.GameMode.instance
	if not (gm and gm.isBegin) then return end
	if UI.IsOpen("UI_MissionPause") then UI.Close("UI_MissionPause") else UI.Open("UI_MissionPause") end
end
local function autoFight()
	local ui = Game.UI_Fight.Ins
	if ui then ui:OnClickBtnAuto() end
end

-- ---------- state ----------
local st = { moving = false, firing = false, prev = {}, dbg = {} }

local function pressed(name, list)
	local now = anyKey(list)
	local was = st.prev[name]
	st.prev[name] = now
	return now and not was
end

-- while the pause menu or another window has the pad, keep the button states current, so a button
-- that is still down when the HUD gets the pad back is not taken as a new press
local EDGES = { dodge = 'dodge', s1 = 'skill1', s2 = 'skill2', s3 = 'skill3', auto = 'auto' }
local function syncEdges(cfg)
	for name, key in pairs(EDGES) do st.prev[name] = anyKey(cfg[key]) end
end

local function joystickNames()
	local t, n = {}, U3D.Input.GetJoystickNames()
	for i = 0, n.Length - 1 do t[#t + 1] = n[i] end
	return table.concat(t, ", ")
end

local function debugDump()
	for n = 0, 19 do
		local now = key(n)
		if now ~= (st.dbg["b" .. n] or false) then
			st.dbg["b" .. n] = now
			print(string.format("[pad] button %d %s", n, now and "down" or "up"))
		end
	end
	for n = 1, 28 do
		local v = axis(n)
		local q = math.floor(v * 4 + 0.5) / 4
		if q ~= (st.dbg[n] or 0) then
			st.dbg[n] = q
			print(string.format("[pad] axis %d = %.2f", n, v))
		end
	end
end

function P.Tick()
	local cfg = P.cfg
	-- L3 + R3: debug log on/off
	if pressed("dbg", { BTN.R3 }) and key(BTN.L3) then
		cfg.debug = not cfg.debug
		local ok, names = pcall(joystickNames)
		print("[pad] debug " .. tostring(cfg.debug) .. ", raw axes " ..
			(named("gcgpad_a1") and "present" or "absent (stock axes 3-5 only)") ..
			", joysticks: " .. (ok and names or "?"))
	end
	if cfg.debug then debugDump() end

	-- pause works even while the fight HUD is hidden
	if pressed("pause", cfg.pause) then try("pause", pause) end
	if UI.IsOpen("UI_MissionPause") then P.Reset(); syncEdges(cfg); return end
	-- a window covers the HUD (story, results, rewards): the menu layer (gamepad_menu.lua) has the pad
	if GamepadMenu and GamepadMenu.owner == 'menu' and not GamepadMenu.off then P.Reset(); syncEdges(cfg); return end

	-- move: stock Horizontal/Vertical (left stick = joystick axes 1/2, and the arrow keys), else the hat
	local x, y = U3D.Input.GetAxisRaw("Horizontal"), U3D.Input.GetAxisRaw("Vertical")
	if x * x + y * y < cfg.dead * cfg.dead then
		x, y = axis(cfg.hatX), -axis(cfg.hatY)
	end
	if x * x + y * y >= cfg.dead * cfg.dead then
		local m = math.sqrt(x * x + y * y)
		try("move", move, x / m, y / m)
		st.moving = true
	elseif st.moving then
		try("move", move, 0, 0)
		st.moving = false
	end

	-- fire: buttons, right trigger, or right stick (twin-stick aim)
	local ax, ay = 0, 0
	local aimed = false
	if cfg.twinStick then
		local rx, ry = axis(cfg.rStickX), axis(cfg.rStickY)
		if rx * rx + ry * ry >= cfg.dead * cfg.dead then ax, ay, aimed = rx, -ry, true end
	end
	local wantFire = aimed or anyKey(cfg.fire) or axis(cfg.rTrigger) > cfg.trigger
	if wantFire and not st.firing then
		try("fire", fireStart, ax, ay)
		st.firing = true
	elseif not wantFire and st.firing then
		try("fire", fireStop)
		st.firing = false
	end

	-- skills (edge-triggered)
	if pressed("dodge", cfg.dodge) then try("dodge", skill, 3) end
	if pressed("s1", cfg.skill1) then try("skill", skill, 0) end
	if pressed("s2", cfg.skill2) then try("skill", skill, 1) end
	if pressed("s3", cfg.skill3) then try("skill", skill, 2) end
	if pressed("auto", cfg.auto) then try("auto", autoFight) end
end

local function now()
	local ok, t = pcall(function() return U3D.Time.realtimeSinceStartup end)
	return ok and t or 0
end

-- A failed tick (for example while the scene loads) is skipped and logged once. After this many
-- failures in a row the controller turns itself off until the next fight.
local MAX_ERRORS = 120
local errors, errLogged = 0, {}
local function tick()
	P.lastTick = now()
	if broken.tick then return end
	local ok, err = pcall(P.Tick)
	if ok then errors = 0; return end
	errors = errors + 1
	local msg = tostring(err)
	if not errLogged[msg] then errLogged[msg] = true; print("[pad] tick error: " .. msg) end
	if errors >= MAX_ERRORS then
		broken.tick = true
		P.Reset()
		print("[pad] tick disabled after " .. errors .. " errors in a row")
	end
end

function P.Start()
	if P.timer then
		-- the timer runs every 10 ms: one that has not run for a second was cleared without OnClose
		if now() - (P.lastTick or 0) < 1 then return end
		pcall(Game.Timer.Delete, P.timer); P.timer = nil
		broken, errors, errLogged = {}, 0, {}
		print("[pad] the old timer stopped: restarting")
	end
	P.Reset()
	-- never break the fight HUD: a failure here only turns the controller off
	-- real time: the pause menu sets the game's timer scale to 0, and Start must still close it
	local ok, t = pcall(Game.Timer.Add, 0.01, 0.01, tick, true, false)
	if ok then P.timer = t; P.lastTick = now(); print("[pad] started") else print("[pad] start failed: " .. tostring(t)) end
end

function P.Reset()
	if st.moving then try("move", move, 0, 0) end
	if st.firing then try("fire", fireStop) end
	st.moving, st.firing = false, false
end

function P.Stop()
	if P.timer then pcall(Game.Timer.Delete, P.timer); P.timer = nil end
	P.Reset()
	broken, errors, errLogged = {}, 0, {}
	print("[pad] stopped")
end
