-- Controller (Bluetooth/USB gamepad) input for shooting stages.
-- Adapted from GirlCafeGun-Offline tools/lua/GamepadFight.lua (MIT, GCG2-Offline contributors).
--
-- Unity's legacy Input receives Android controller events natively. Each frame this layer reads it and
-- makes the calls of the client's own developer keyboard handler (Game.Keyboard.UpdateInput, whose body
-- is not reachable in release clients):
--   move  -> Game.FightJoystick.SetMoveOffset(dir)          fire  -> fightCamera:OnFight(v) / OnFightStop()
--   skill -> Game.UI_FightProxy.OnUseSkillByIdx(0..2, nil)   dodge -> OnUseSkillByIdx(3, dir or nil)
-- Touch keeps working: the pad sends "stop" only for an action that it started. Every C# call is
-- guarded; a failure disables that one action and is logged once (logcat tag Unity, prefix [pad]).
-- patch_gamepad.py places this file inside UI_Fight.lua, in a do-block, so no local leaks into it.
--
-- How the client aims (read from libil2cpp of the 0.1.3 client):
--   OnFight(v) -> TeamFighting.SetAttackStart -> each girl's SchoolPlayerController.SetAttackStart, which
--   picks a target in a cone around v (|v| < 0.5: the nearest one) and keeps that direction and target
--   until the next OnFight. Offline every OnFight call is applied, so this layer re-aims while the fire
--   button stays down: it calls OnFight again when the wanted direction turns by more than reaimAngle.
--   A dash (move skill) runs along each girl's facing (MoveController.RunMove uses transform.forward),
--   and while she fires the game turns her to the fire direction. So a dash stops fire, turns the girls
--   to the move stick (or away from the team center), and fire comes back when the dash ends.
GamepadFight = GamepadFight or {}
local P = GamepadFight

-- Unity joystick button numbers on Android (standard gamepad layout)
local BTN = { A = 0, B = 1, X = 2, Y = 3, LB = 4, RB = 5, L3 = 8, R3 = 9, START = 10, SELECT = 11 }

P.cfg = P.cfg or {
	dead       = 0.25,             -- move stick dead zone (radial)
	aimDead    = 0.3,              -- aim stick dead zone (radial)
	trigger    = 0.45,             -- trigger press threshold
	fire       = { BTN.RB },       -- hold to fire (plus right trigger)
	lock       = { BTN.A },        -- lock on the nearest enemy; press again: the next nearest one
	dodge      = { BTN.LB },       -- move skill (idx 3)
	skill1     = { BTN.X },        -- skill idx 0
	skill2     = { BTN.Y },        -- skill idx 1
	skill3     = { BTN.B },        -- skill idx 2
	pause      = { BTN.START },
	auto       = { BTN.SELECT },   -- auto-fight toggle
	stickFires = false,            -- true: the aim stick fires as well (classic twin-stick)
	autoAim    = true,             -- fire with no aim stick and no lock: aim at the nearest enemy, kept current
	aimHold    = 0.35,             -- s: the last aim stick direction stays this long after the stick is let go
	aimEvery   = 0.1,              -- s: how often lock and auto aim read enemy positions
	reaimAngle = 12,               -- degrees: smaller turns do not re-aim (each OnFight restarts a charge)
	reaimGap   = 0.05,             -- s: at most one re-aim per this time (stick latency stays low)
	relock     = true,             -- the locked enemy dies: lock the nearest one left
	dashTurn   = true,             -- dash with the move stick: face that way first
	scatter    = true,             -- dash with the move stick at rest: each girl dashes away from the team center
	dashBuffer = 0.25,             -- s: a dash pressed during its cooldown fires when the cooldown ends
	dashMin    = 0.15,             -- s: fire stays off at least this long after a dash ...
	dashPause  = 0.6,              -- s: ... and at most this long (sooner when the game says the dash ended)
	-- Joystick axis numbers (Unity "Nth axis"), 0 = off. Controllers differ: turn on debug (L3+R3) and
	-- read logcat to find yours. One axis per role.
	rStickX    = 4, rStickY = 5,
	rTrigger   = 3,
	hatX       = 6, hatY = 7,      -- d-pad as hat axes (assumed layout)
	debug      = false,            -- L3+R3 toggles: logs every button / axis change
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
-- returns true when fn ran without an error
local function try(name, fn, ...)
	if broken[name] then return false end
	local ok, err = pcall(fn, ...)
	if not ok then
		broken[name] = true
		print("[pad] " .. name .. " disabled: " .. tostring(err))
	end
	return ok
end

local function now()
	local ok, t = pcall(function() return U3D.Time.realtimeSinceStartup end)
	return ok and t or 0
end

local function norm(x, y)
	local m = math.sqrt(x * x + y * y)
	if m < 1e-6 then return 0, 0 end
	return x / m, y / m
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
local function skill(idx, dir)
	Game.UI_FightProxy.OnUseSkillByIdx(idx, dir)
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

-- ---------- the team and its enemies (world x/z plane) ----------
local function localTeam()
	return Game.Fight.GetLocalTeam()
end
local function teamCenter(team)
	local p = team.center.transform.position
	return p.x, p.z
end
-- world direction on the ground -> unit direction in OnFight's (screen) space
local function screenDir(dx, dz)
	local v = fightCamera():GetScreenDirection(U3D.Vector3(dx, 0, dz))
	return norm(v.x, v.y)
end
local function alive(c)
	local ok, v = pcall(function() return c.IsAlive end)
	return ok and v == true
end
-- living enemies that the game itself would auto-aim at, nearest to the team center first
local function enemies(cx, cz)
	local list, out = Game.DamageCompentList.Instance.ComList, {}
	for i = 0, list.Count - 1 do
		local c = list[i]
		if c and c.IsMonster and c.IsAlive and c.CanAutoAim and not c.IsDestructible then
			local p = c.CurrPostion
			local dx, dz = p.x - cx, p.z - cz
			out[#out + 1] = { c = c, dx = dx, dz = dz, d = dx * dx + dz * dz }
		end
	end
	table.sort(out, function(a, b) return a.d < b.d end)
	return out
end
local function cooling()
	local ok, v = pcall(function() return localTeam().TeamMoveSkill.IsCDTime end)
	return ok and v == true
end
local function dashing()
	local ok, v = pcall(function() return localTeam():IsSkillMoving() end)
	return ok and v == true
end
-- turn every living girl: fn(dx, dz, i) gets her offset from the team center and returns a world
-- direction, or nil to leave her. moveRotateToDirection keeps the turn while the move stick rests.
local function faceTeam(fn)
	local team = localTeam()
	local cx, cz = teamCenter(team)
	local ms = team.members
	for i = 0, ms.Count - 1 do
		local pc = ms[i].playerController
		if pc and not pc.IsDead then
			local tr = pc.transform
			local p = tr.position
			local wx, wz = fn(p.x - cx, p.z - cz, i)
			if wx and wx * wx + wz * wz > 1e-6 then
				local q = U3D.Quaternion.LookRotation(U3D.Vector3(wx, 0, wz))
				tr.rotation = q
				pc.moveRotateToDirection = q
			end
		end
	end
end

-- ---------- state ----------
local st = { moving = false, firing = false, prev = {}, dbg = {},
             fx = 0, fy = 0, ax = 0, ay = 0, sx = 0, sy = 0, sentAt = 0, aimNext = 0 }

local function pressed(name, list)
	local now = anyKey(list)
	local was = st.prev[name]
	st.prev[name] = now
	return now and not was
end

-- while the pause menu or another window has the pad, keep the button states current, so a button
-- that is still down when the HUD gets the pad back is not taken as a new press (A confirms in menus)
local EDGES = { dodge = 'dodge', s1 = 'skill1', s2 = 'skill2', s3 = 'skill3', auto = 'auto', lock = 'lock' }
local function syncEdges(cfg)
	for name, key in pairs(EDGES) do st.prev[name] = anyKey(cfg[key]) end
end

-- ---------- aim ----------
-- 0, 0 means "no direction": the game aims at the nearest target itself
local function changed(ax, ay, bx, by)
	local az, bz = ax == 0 and ay == 0, bx == 0 and by == 0
	if az or bz then return az ~= bz end
	return ax * bx + ay * by < math.cos(math.rad(P.cfg.reaimAngle))
end

local function lockNext()
	local cx, cz = teamCenter(localTeam())
	local list = enemies(cx, cz)
	if #list == 0 then
		st.lock = nil
		print("[pad] lock: no enemy")
		return
	end
	local pick = 1
	if st.lock then
		for i, e in ipairs(list) do if e.c == st.lock then pick = i % #list + 1 end end
	end
	st.lock, st.freeAt, st.aimNext = list[pick].c, nil, 0
	print(string.format("[pad] lock %d/%d", pick, #list))
end

local function evalTarget(cfg)
	local cx, cz = teamCenter(localTeam())
	local dx, dz
	if st.lock and not alive(st.lock) then
		st.lock = nil
		if cfg.relock then
			local e = enemies(cx, cz)[1]
			if e then st.lock = e.c; dx, dz = e.dx, e.dz end
		end
	elseif st.lock then
		local p = st.lock.CurrPostion
		dx, dz = p.x - cx, p.z - cz
	elseif cfg.autoAim then
		local e = enemies(cx, cz)[1]
		if e then dx, dz = e.dx, e.dz end
	end
	if dx and dx * dx + dz * dz > 0.01 then
		st.ax, st.ay = screenDir(dx, dz)
	else
		st.ax, st.ay = 0, 0
	end
end

local function aimAt(t, cfg)
	if st.freeAt and t - st.freeAt <= cfg.aimHold then return st.fx, st.fy end
	if not (st.lock or cfg.autoAim) then return 0, 0 end
	if t >= st.aimNext then
		st.aimNext = t + cfg.aimEvery
		if not try("target", evalTarget, cfg) then st.ax, st.ay = 0, 0 end
	end
	return st.ax, st.ay
end

-- ---------- dash ----------
local function dash(cfg, t, mx, my)
	if st.firing then
		try("fire", fireStop)
		st.firing = false
		st.dashAt, st.dashUntil = t, t + cfg.dashPause
	end
	if mx then
		if cfg.dashTurn then
			try("dashturn", function()
				local w = fightCamera():GetRealDirection(U3D.Vector2(mx, my))
				faceTeam(function() return w.x, w.z end)
			end)
		end
		if try("dashdir", skill, 3, U3D.Vector2(mx, my)) then return end
	elseif cfg.scatter then
		try("scatter", faceTeam, function(dx, dz, i)
			if dx * dx + dz * dz > 0.04 then return dx, dz end
			local a = i * 2.0944        -- girl on the center: spread 120 degrees apart
			return math.cos(a), math.sin(a)
		end)
	end
	try("dodge", skill, 3, nil)
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

-- once per fight, when the team exists: which game calls this client answers (read the log after a phone run)
local function caps()
	local team = localTeam()
	if not team then return end
	P.capsDone = true
	local function probe(fn) local ok, v = pcall(fn); return ok and tostring(v) or "no" end
	print("[pad] caps members=" .. probe(function() return team.members.Count end)
		.. " enemies=" .. probe(function() local cx, cz = teamCenter(team); return #enemies(cx, cz) end)
		.. " screenDir=" .. probe(function() local x, y = screenDir(1, 0); return string.format("%.2f,%.2f", x, y) end)
		.. " cd=" .. probe(function() return team.TeamMoveSkill.IsCDTime end))
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
	if not P.capsDone then try("caps", caps) end
	local t = now()

	-- move: stock Horizontal/Vertical (left stick = joystick axes 1/2, and the arrow keys), else the hat
	local x, y = U3D.Input.GetAxisRaw("Horizontal"), U3D.Input.GetAxisRaw("Vertical")
	if x * x + y * y < cfg.dead * cfg.dead then
		x, y = axis(cfg.hatX), -axis(cfg.hatY)
	end
	local mx, my
	if x * x + y * y >= cfg.dead * cfg.dead then
		mx, my = norm(x, y)
		try("move", move, mx, my)
		st.moving = true
	elseif st.moving then
		try("move", move, 0, 0)
		st.moving = false
	end

	-- aim stick: free aim; it also ends a lock
	local rx, ry = axis(cfg.rStickX), axis(cfg.rStickY)
	local aimed = rx * rx + ry * ry >= cfg.aimDead * cfg.aimDead
	if aimed then
		st.fx, st.fy = norm(rx, -ry)
		st.freeAt = t
		if st.lock then st.lock = nil; print("[pad] lock off") end
	end
	if pressed("lock", cfg.lock) then try("lock", lockNext) end

	-- dash (a press during its cooldown waits up to dashBuffer)
	if pressed("dodge", cfg.dodge) then st.dashBuf = t + cfg.dashBuffer end
	if st.dashBuf then
		if t > st.dashBuf then st.dashBuf = nil
		elseif not cooling() then st.dashBuf = nil; dash(cfg, t, mx, my) end
	end

	-- fire: buttons, right trigger (and the aim stick if stickFires); off for the length of a dash
	local wantFire = anyKey(cfg.fire) or axis(cfg.rTrigger) > cfg.trigger or (cfg.stickFires and aimed)
	if st.dashUntil then
		if t >= st.dashUntil or (t - st.dashAt >= cfg.dashMin and not dashing()) then st.dashUntil = nil end
	end
	if st.dashUntil then
		-- fire was stopped for the dash; it starts again below once the dash is over
	elseif wantFire then
		local ax, ay = aimAt(t, cfg)
		if not st.firing then
			try("fire", fireStart, ax, ay)
			st.firing, st.sx, st.sy, st.sentAt = true, ax, ay, t
		elseif t - st.sentAt >= cfg.reaimGap and changed(ax, ay, st.sx, st.sy) then
			try("aim", fireStart, ax, ay)
			st.sx, st.sy, st.sentAt = ax, ay, t
		end
	elseif st.firing then
		try("fire", fireStop)
		st.firing = false
	end

	-- skills (edge-triggered)
	if pressed("s1", cfg.skill1) then try("skill", skill, 0, nil) end
	if pressed("s2", cfg.skill2) then try("skill", skill, 1, nil) end
	if pressed("s3", cfg.skill3) then try("skill", skill, 2, nil) end
	if pressed("auto", cfg.auto) then try("auto", autoFight) end
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
	P.capsDone = false
	-- never break the fight HUD: a failure here only turns the controller off
	-- real time: the pause menu sets the game's timer scale to 0, and Start must still close it
	local ok, t = pcall(Game.Timer.Add, 0.01, 0.01, tick, true, false)
	if ok then P.timer = t; P.lastTick = now(); print("[pad] started") else print("[pad] start failed: " .. tostring(t)) end
end

-- release what the pad holds and forget aim, lock and dash (pause menu, a window over the HUD, end of fight)
function P.Reset()
	if st.moving then try("move", move, 0, 0) end
	if st.firing then try("fire", fireStop) end
	st.moving, st.firing = false, false
	st.lock, st.freeAt, st.dashBuf, st.dashUntil = nil, nil, nil, nil
	st.ax, st.ay, st.sx, st.sy, st.aimNext = 0, 0, 0, 0, 0
end

function P.Stop()
	if P.timer then pcall(Game.Timer.Delete, P.timer); P.timer = nil end
	P.Reset()
	broken, errors, errLogged = {}, 0, {}
	print("[pad] stopped")
end
