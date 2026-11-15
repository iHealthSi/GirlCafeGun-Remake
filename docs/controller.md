# Controller support

A Bluetooth or USB gamepad connected to the phone controls the shooting stages
and every menu, story scene and popup. The game reads the controller itself
through Unity's legacy Input; there is no touch overlay and no key-to-touch
mapper, and no screen layout changes. Touch controls keep working while a
controller is connected.

Two Lua layers do the work, and only one of them has the pad at a time:

- `release/client/gamepad_fight.lua` (shooting stages). The client already
  carries dormant controller parts: InputManager entries for both sticks and a
  trigger, and a developer keyboard handler whose calls drive a fight. The layer
  makes the same calls each frame. `release/client/patch_gamepad.py` places it in
  the stock `UI_Fight.lua`, starts it when the fight HUD opens and stops it when
  the HUD closes.
- `release/client/gamepad_menu.lua` (everything else). `patch_gamepad.py` places
  it at the end of the stock `UI.lua` and starts it from `UI.Open`. While a
  button of the fight HUD can be tapped, it stays idle; when a window covers the
  HUD (the pause menu, a story scene, results, rewards), it takes the pad and the
  fight layer lets go.

Both layers run on a real-time timer: the pause menu sets the game's timer scale
to 0, and the pad must still work there. No C#, native or server code changes.

## Menus: focus navigation

The menu layer does not move a pointer. A focus frame sits on one of the
controls that a finger could tap at that moment, and the pad moves it and presses
it:

- **Candidates** are the game's own click targets: every interactable Selectable
  (Button, Toggle, Slider, InputField) plus the components the client's Lua wires
  by hand (`EventTriggerListener`, `EventTrigger`, `LongPressButton`,
  `LongPushCount`, `ScrollItemPushEvent`, `RoleCardDrag`).
- **Reach**: a candidate counts only if a tap on its centre would reach it. The
  layer asks the EventSystem's raycasters, so a popup, its dark backdrop or a
  tutorial mask hides what lies below, exactly as for touch. A large target with
  pictures on its centre is tried at four more points. Items of a scroll list
  that its viewport clips stay reachable while the list itself can be touched.
- **Moves** go to the nearest candidate in the pressed direction, with the beam
  rule of Android's FocusFinder: a control straight ahead beats a closer one off
  to the side. At the end of a scroll list the list scrolls by one item and the
  move tries again. A slider takes left and right as value steps.
- **Press**: A sends pointer-down when pressed and pointer-up plus click when
  released, through `Game.Utils.ExecutePointerDownEvents`, `...UpEvents` and
  `ExecuteClickEvents` (the calls of the client's own UI test runner). Hold A on
  a hold-to-repeat button and it repeats, as under a finger.
- **First focus** of a new page or popup: the tutorial's target when a tutorial
  step is open, else the control last used in that window, else a confirm/OK
  button, else the control nearest the screen centre. The resource bar
  (`UI_Player`) sorts above every page, so it gets the first focus only when it
  is alone.
- The stock EventSystem sends Submit (joystick button 0) to its selected object.
  The layer keeps nothing selected (except a text field), so a button that a
  finger touched earlier is not pressed a second time by A.
- A touch hides the frame. The next pad input shows it again and does nothing
  else, so the first press after touch never presses blind.

## Default mapping

Button numbers follow the standard Android layout in Unity (A = 0, B = 1, X = 2,
Y = 3, LB = 4, RB = 5, L3 = 8, R3 = 9, Start = 10, Select = 11).

Shooting stages (`P.cfg` in `gamepad_fight.lua`):

| Control | Action |
| --- | --- |
| Left stick | Move |
| D-pad | Move (see the limits) |
| A, RB, right trigger | Fire while held |
| Right stick | Aim and fire |
| X / Y / B | Skill 1 / 2 / 3 |
| LB | Dodge |
| Start | Pause menu, open and close |
| Select | Auto-fight on and off |
| L3 + R3 | Debug log on and off |

Menus, popups and story scenes (`M.cfg` in `gamepad_menu.lua`):

| Control | Action |
| --- | --- |
| D-pad, left stick | Move the focus (hold to repeat) |
| A | Press the focused control (hold for long-press buttons) |
| B | Back: the window's close, back or cancel button, else a full-screen "tap to close" backdrop |
| LB / RB | Previous / next tab of the top tab bar (a ToggleGroup), else a left / right arrow button |
| Right stick | Scroll the list that holds the focus (else the largest list on screen) |
| Start | Story scene: Skip |
| Select | Cursor on and off (below) |
| L3 + R3 | Debug log on and off |

Story scenes (`UI_Cartoon`): A advances the dialogue (`Cartoon:OnTouch`, the
call a tap makes) while nothing has the focus. The d-pad puts the focus on Skip,
the menu or the choices; B takes it away again, so A advances once more. When
choices appear, the first one takes the focus.

## Optional cursor

Select turns a cursor on. The left stick (or d-pad) moves it and A taps whatever
lies under it with the same pointer events. Select again turns it off and the
focus frame returns. The cursor is for the rare control that focus navigation
does not reach; it is not the main control.

## Axes

Legacy Input reads a joystick axis only through a named InputManager entry. The
stock table names five axes, and the layers use them when nothing else exists:

| Joystick axis | Stock name | Used for |
| --- | --- | --- |
| 1, 2 | `Horizontal`, `Vertical` (also the arrow keys) | Move, focus |
| 3 | `HandleFire` | Right trigger |
| 4, 5 | `RightHorizontal`, `RightVertical` | Aim, scroll |

Controllers do not agree on the axes of the right stick, the triggers and the
d-pad. An optional change to the InputManager in the base APK's `data.unity3d`
adds one raw entry per joystick axis, `gcgpad_a1` to `gcgpad_a28` (type joystick
axis, all joysticks, no dead zone, not inverted). The layers prefer these names
when they exist, and then `rStickX`, `rStickY`, `rTrigger`, `hatX` and `hatY` in
the two configurations can name any axis. The release overlay does not make this
change.

With the debug log on, button and axis changes (fight) and focus, back and tab
choices (menus) are written to logcat:

```sh
adb logcat -s Unity | grep "\[pad\]"
```

`[pad] started` and `[pad] stopped` mark each fight; `[pad] menu: started` marks
the start of the menu layer. A fight call that fails is turned off alone and
reported once as `[pad] <action> disabled: ...`. A menu error is reported once as
`[pad] menu: <error>` and the layer carries on; after 120 errors in a row it
turns itself off.

## Limits

- Only the story and stage HUD (`UI_Fight`) has fight controls. `UI_BattleFight`
  and `UI_FightPvP` are not covered; in them the menu layer runs.
- Girl switching and the weapon skill have no button yet.
- The cafe and other 3D scenes take taps on 3D objects (girls, cats, food). They
  are not UI controls; the cursor does not reach them either.
- The raycast needs `CS.System.Collections.Generic.List(RaycastResult)` from
  xLua. If the client refuses it, the layer logs the error once and does nothing.
- Without the raw entries, a d-pad works only if the controller reports it as
  arrow keys. A d-pad on hat axes, and a right stick or trigger outside axes 3
  to 5, need the raw entries.
- `HandleFire` has a very high sensitivity in the stock table, so the right
  trigger acts as a switch.
- The right stick passes its direction to the game's fire call. Whether the game
  aims with it or keeps auto-aim was not measured.

## Validation

`python release/client/test_gamepad.py` runs the fight layer in a mocked fight
runtime (it needs only `lupa`): 30 steps with raw entries and 13 steps with stock
axes only, plus the placement in a synthetic `UI_Fight.lua`, a second patch pass
that changes nothing, and a Lua syntax check.

`python release/client/test_gamepad_menu.py` runs the menu layer in a mocked UI
runtime: a scene graph with windows, a raycaster with masks and draw order, the
Selectable registry, a toggle group, a scroll list and the client's click
helpers. It walks a menu grid, a popup with a backdrop, a backdrop-only reward
popup, a scroll list past its viewport, a slider, touch and pad changes, a story
scene with choices, the cursor, the hand-over to and from the fight HUD and the
pause menu, and one failing C# call. It also checks the placement in a synthetic
`UI.lua` and the geometry rules alone.

`release/client/build.py` repeats both on the modules inside the built `lua.u`.

The fight layer, with the raw entries, ran on a Galaxy S24+ with an Xbox Wireless
Controller on the English 1.0.9 client: every fight logged start and stop and no
action was disabled. The menu layer, the stock-axes path and this repository's
pinned client have not been tested on a device.
