# Event towers

## Status

Core implementation; automated tests only, no phone playtest yet.

The past event towers of `Tower.txt` are playable: enter a level, settle or fail
it, claim the node tower point rewards, draw from the lottery pools and claim
the swimwear score awards. There is no date check: this build is offline and
every past event is open. The client decides what it shows.

## Client contract

Source: `ActivitiesLogic.lua`, the `*TowerLogic.lua` files, `SwimwearLogic.lua`,
`AbsorbPeakLogic.lua`, `VariegatedTowerLogic.lua`, `UI_Lottery.lua` (and its
Seventh, Fireworks and Twentieth copies), `UI_TowerScoreInfo.lua`,
`UI_SecondTowerReward.lua` and `LuaCall.lua` of the 0.1.3 client.

| LuaCall                                     | Request (`tbParam`)                                                       | Reply (`tbParam`)                                                                                  |
| ------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 53 `Activities_GetTower`                    | `[towerId, activityType]`                                                 | `{TowerId}`, swimwear and absorb peak add `tbExpParam {nSwimServerScore, nAllSwimServerScore}`     |
| 54 `Activities_EnterTower`                  | `[activityType, towerId, node, levelId, formationId]`                     | `{tbData [type, tower, node, level], tbDrop [], tbDropItems []}` or `{nError}`                     |
| 55 `Activities_PassTower` (inside DoSettle) | `[type, tower, node, level, formation, report, stars, killParam, roleId]` | `{tbData, nMasterExp, nCardExp, newGoalIds, nGetScore, nCardAddScore, nPetAddScore}` or `{nError}` |
| 56 `Activities_FailTower` (inside DoSettle) | `[type, tower, node, level, formation]`                                   | `{}`                                                                                               |
| 61 `Activities_GetSwimwearServerScore`      | `{nTowerId}`                                                              | `{nTowerId, Score}`                                                                                |
| 62 / 63 swimwear score / server awards      | `{nTowerId, Index}` (62: Index 0 claims every reached award)              | `{nTowerId, tbAward}` or `{nTowerId, nError}`                                                      |
| 176 `GetNodePointReward`                    | `{activeId, rewardIds?}`                                                  | `{res: true, Reward}` or `{res: false}`                                                            |
| 177 `GetPondReward`                         | `{TowerId, nType, nPondId}`                                               | `{nTowerId, nPondId, tbItem [slot numbers]}` or `{nTowerId, nError}`                               |
| 178 `ResetNodePond`                         | `{TowerId, nPondId}`                                                      | `{nResult, nPondId}` or `{nTowerId, nError}`                                                       |

- `GameManager.SendInfoToServer` wraps 55 and 56 in `LuaCall.DoSettle` (252). The
  reply goes back the same way: `DoSettle` clears the stored settlement that the
  client resends after a reconnect, then dispatches the inner command. Not tried on
  a phone. Remake's other settlement replies (bounty 51, `ChapterMsg`) are bare; if
  the wrapped reply misbehaves, answering bare (`{sCmd: 55, tbParam}`) is the
  fallback and only costs the clearing of the stored settlement.
- Argument lists arrive as arrays with `null` for nil holes (argument 7 of 55 is
  nil for most classes, 6 and 7 for the sixteenth tower). This follows from the
  client's `json.lua` encoder; no packet was captured. An object with the keys
  "1".."n" is read the same way.
- `OnGetTower` of 17 classes does nothing and the client does not wait for the 53
  reply (`UpdateGetTower` runs at once); the reply only exists so the call is
  answered. Only swimwear and absorb peak read the server score from it.
- Error codes are `ActivitiesLogic.tbErrorCode`: 2 invalid, 5 vigour, 8 points,
  9 pool empty, 10 formation, 12 no award, 13 award already claimed. 176 is
  refused with `{res: false}` because `UI_TowerScoreInfo` reacts to `res == true`
  only.

## Served towers

28 Tower.txt ids of 20 score, count and node classes: 1, 2, 3, 5, 6, 7, 9-21, 101-107,
201, 303 (the twenty-first tower is a score tower with offset 1701, group 96, level
record 1801 and goals 60000), plus the two card towers Animalize (4) and EighthTower
(8), which have their own catalog (see "Slice 2"). Left on the unhandled path: the
ranking tower (activity type 6, whatever the id), and every id that is not in
`resources/tower/tower.txt`. 53 to 56 accept the card towers; 61 to 63, 176 to 178
and 527 take only the towers that have the matching tables.

## Task layout

`TOWER_LAYOUTS` in `event-tower-data.ts` holds, per class, the task group, the
level record base, the goal base and what the record means. The values are copied
from the top of each `*Logic.lua`; `event-tower-data.test.ts` compares all 19
with the scripts when `GCG_CLIENT_LUA_DIR` points at them.

- Score classes (small, chess, ninth, twelfth, thirteenth, fourteenth,
  seventeenth to twentieth) keep the best `nScore` (at least 1) at
  `levelBase + LevelId`; the client unlocks the next level when it is not 0.
- Pass count classes (tenth, fifteenth, sixteenth, swimwear, absorb peak,
  variegated) keep a clear count.
- Node classes (node, seventh, eleventh) keep star bits (8 = all) and, relative to
  the class offset: +4 act score, +5 pool id, +6 pool resets, +20 point reward
  flags, +50 node cleared, +150 SP score, +200 pool records (20 per pool), +450 SP
  clear count.
- Type 3 levels keep goal points at `goalBase + LevelId` and one flag per goal at
  `goalBase + LevelId * 100 + GoalID`.
- Variegated levels use the slot `area * 20 + position` (`GetLevelIndex`).
- The 0.1.3 thirteenth tower script is the ninth tower's script with other names
  and paths (`diff` shows nothing else), so it uses the ninth tower's slots
  (group 9, 2500, 60000), not the EN 1.0.9 ones (64, 9100, 40000).
- A task key holds no tower id, so towers of one class share every record:
  towers 1 and 201 (two SmallTower rows, 26 level ids), the ninth and thirteenth,
  and the eight variegated towers (101-107 and 303; they share the score task 2804
  and overlapping level slots). The first clear award, goal flags and goal rewards
  are then paid once for all of them. `event-tower-data.test.ts` lists every
  shared slot.

## Server behaviour

- Entry: the level must exist, the formation must exist (story levels need none)
  and vigour must cover the cost the client computes: `RewardActivityLogic:
GetActivityEnergySale` cuts 50% below commander level 35 (the support plan; only
  the en_US and ko_KR clients skip it, this one is zh_CN) and rounds up, like
  chapters and bounties. The card towers also subtract their card-buff discount.
  Nothing is charged at entry.
- The run (tower, level, open flag, stored reply) is kept in the save
  (`Player.eventTower`). Settlement, replay and refusal happen inside one store
  update, so a refusal changes nothing.
- Settlement: charges the vigour, rolls first clear, `FixAward` (weight out of 10000) and `RandomAward` with `rollChapterAwards`, grants them, writes the level
  record, node progress, goal points and thresholds, adds the master exp and counts
  the fight for the oath tasks as a `tower` event with the activity type as
  `activityId` ([INFER]: `lvpara` is described as the activity type, -1 = any; the
  only `TowerFight` task wants type 3, which no served tower sends, so only
  `ArbitraryFight` tasks advance; not covered by a test). A settlement with no matching open
  entry is refused; one for a closed entry replays the stored reply.
- Failure (56): charges the vigour once and closes the entry.
- Score and exp items (15-17, 15-18, 15-19, 15-30, 15-31, 15-32, 15-47..50, 15-105,
  15-106) are AutoUse items that add to a task value: swimwear and absorb peak
  score and equipment exp, tenth and fifteenth tower talent exp. Other event
  currencies are wallets through `autouse.txt`.
- Lottery: the wallet is the tower's `Money1GDPL` currency (Lottery 14, Seventh 21,
  Eleventh 44, Twentieth 82). A draw takes `LotteryTimes` slots by weight; the
  client disables a draw when fewer are left, and the server refuses it too. A
  reset needs the key item drawn or the pool emptied. `Loop` is "number of resets,
  0 = unlimited": pools 1-7 move on to the next pool, pool 8 (Loop 0) clears in
  place and counts the resets, which `UI_Lottery` adds to the pool number in its
  title. Counting resets only for that pool is [INFER] from the title.
- Server-wide awards (63): the client shows an award when
  `floor(1000 * serverScore / allServiceScore) >= Score`, with `allServiceScore`
  2000000000 (swimwear) or 200000000 (absorb peak). The server score is the
  player's own score, so these awards stay out of reach, as on a server with no
  other player.

## Phone package

The server needs `tower` in its `--resources` list, like `card`.

## Known gaps

- Calls the tower screens send that are still unanswered here: the ranking tower
  (`Challenge`, activity type 6) and `BossChallenge_GetScoreAward` 535 with `Challenge_Award_Some`
  206 (the named-field slice answers 535). 510 to 513 and 527 are answered (see below);
  250 `AssistList` is answered with an empty list by `background-lua-data.ts`.
- Records are shared between towers of one class (see Task layout).
- No achievements, mission counters (conditions 99, 105, 108, 110, 181) or daily
  mission counts other than vigour are updated by a tower fight.
- Card exp is shown (`nCardExp`) but, as for chapters, not applied.
- Monster drops (`tbDrop`, `tbDropItems`) are empty at entry; random awards come at
  settlement.
- The event-specific vigour discounts of the `RewardActivity` tables
  (`tbLevelEnergySaleActivity`) are not applied; the low-level support plan and the
  Animalize/Eighth card-buff discount are.
- The card round can deal box and fate cards without end (the C# `AnimalizeHandler`
  does the same): nothing limits how long the player draws before a fight card or the
  boss comes.
- 176 and `BossChallenge` scoring (`UI_2ndBossChallengeScoreInfo`) use the same
  command with an `activeId` that can equal a tower id; there is no way to tell them
  apart.
- Items 15-121 and 15-122 (twentieth tower) have no AutoUse rule and stay as stacks;
  the client counts them from the inventory.
- The client writes task 96/600 itself (`SeventeenthTowerLogic.IsNewUnlock`); no
  other `SetTaskValue` was found in the tower logic files and tower, lottery and
  score screens. This branch has no `TASK_CHANGE_REQ` allowlist; one must allow
  that value.

## Slice 2: card towers, tower skills, boss rush SP

| LuaCall                                  | Request (`tbParam`)                                    | Reply (`tbParam`)                                                                           |
| ---------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| 64 `Activities_AnimalizeChoiseDiff`      | `{TowerId, Diff}`                                      | `{Error: 0, Diff, tbRandom [3 x {CardId, Type}]}` or `{Error: 1}`                           |
| 65 `Activities_AnimalizeChoiseCard`      | `{TowerId, Index}` (1 to 3)                            | the three `{CardId, Type}` (Type 1 = chosen) or `{nError}`                                  |
| 66 `Activities_AnimalizeClickCard`       | `{TowerId}`                                            | `{bNextRandom: true, tbAward}`, `{bNextRandom: false, cardId}` (a level card) or `{nError}` |
| 67 `Activities_AnimalizeNextStage`       | `{TowerId}`                                            | `{nError}` (0 = ok)                                                                         |
| 68 `Activities_AnimalizeGetAchieveAward` | `{TowerId}`                                            | `{tbAward}` or `{nError: 12}`                                                               |
| 69 `Activities_AnimalizeReset`           | `{TowerId}`                                            | `{nError}`: 0 ok, 1 not enough vigour, 2 invalid                                            |
| 54 to 56 for tower 4 and 8               | `[type, tower, difficulty, levelId, formation, ...]`   | as slice 1; the difficulty is argument 3 (`node`), 0 for the stories                        |
| 527 `UpgradeTowerSkill`                  | `[20 or 21, skillId]` (the table's Id)                 | `{isOk: 1, skillId}`, `{isOk: 3}` at the top level, `{nError: 8}` without items             |
| 510 `BossRush_SelectSpBoss`              | `[levelId, idx]`                                       | `{}`                                                                                        |
| 511 `BossRush_SaveSpFormation`           | `{}`                                                   | `{}`                                                                                        |
| 512 `BossRush_ResetSp`                   | `{}`                                                   | `{}`                                                                                        |
| 513 `BossRush_SaveSpResult`              | `{tbResult {blood, shield, passTime, LevelId}, bSave}` | `{}`                                                                                        |

The client branches of `luacall.lua` give the reply shapes (its `MODULE_SERVER` branches
call logic functions that this client does not contain).

### Card towers (Animalize 4 and EighthTower 8)

The two towers are one script (`AnimalizeLogic.lua`, `EighthTowerLogic.lua`) with two
offsets (1000 and 3000, group 34). `CARD_TASK` lists the fields; the test compares them
with the Lua. Levels are keyed by tower, difficulty and level id (the ids repeat for every
difficulty), so they live in `catalog.cardLevels`, not in `catalog.levels`;
`TowerLevel.node` holds the difficulty.

A round: the story of the stage (difficulty 0 levels; the LevelId is the round: 1, 3, 5,
10, 13), 64, then draws of three cards. 65 marks one chosen, 66 opens it: box cards pay
(the score item adds to the score at offset + 8 and to the round's token count at

- 202), fate cards add their buffs, both deal again; act and SP cards answer
  `bNextRandom: false` and the client opens the level panel, whose entry (54) is accepted
  only for that card's level at the current difficulty. A won act level deals again, a lost
  one leaves the card open. Winning the SP level (card 53, level 6) ends the round: the
  difficulty award is paid, the next difficulty opens and the screen shows the summary
  (state 4). 67 starts the next round (a story first when the new round has an unplayed
  one). 69 gives a round up for 5 vigour while cards are drawn. 68 pays every score award
  that the score reaches (once). Vigour is charged at settlement (54 checks it), less the
  energy buffs.

Buffs: slot value = id | turns left << 16. `EffectTime` 1 lasts the round, 2 the next
`Count` draws (the "show cards" and "boss next" buffs), 3 the next `Count` fights (no row
uses it).

[INFER] and gaps:

- When the boss card turns up (nothing in the client or tables says): never before draw 8,
  forced on the twentieth draw and by the "boss next" buff, in the first slot.
- The unlock value is `difficulty << 1 | seen`: a newly opened difficulty is written with
  bit 0 clear (the screen then plays its unlock animation) and set when the player picks it.
- The "show cards" buff does nothing: the client never reads it.
- Achievements: `tbAnimalizeAchievement` is never loaded by the client and the memory
  screen opens only the stories and the score awards. No table copied, no counters.
- No mission counters (113, 114 and the others of the C# build).
- The client writes 34/(offset + 499) (auto fight) and 34/(offset + 10) (clears the award
  flag) itself; a `TASK_CHANGE_REQ` allowlist must allow both for both towers.
- The client forces the state back to the difficulty screen and refuses to pick a
  difficulty when the tower's `EndTime` has passed (towers 4 and 8 ended in 2020): the
  client page that opens these towers must also move the end time.

### Tower skills (527)

`towerskill.txt` of the twentieth and twenty-first tower: the level is the task at
`offset + 10 + Id` (1211 + Id and 1711 + Id, group 96); the cost of the next level is
`UpgradeCost[level]`, paid from plain stacks of `UpgradeItem` (15-121 and 15-126; neither
has an AutoUse rule). A maxed skill answers `isOk: 3`. The client checks the count first.

### Boss rush SP (510 to 513)

Slots of `SixteenthTowerLogic` (group 64): 60003 teams saved, 60010 + team and 60020 + team
health and shield percent (teams 1 to 5), 60200 + level the picked boss, 60300 + level the
clear time. 510 needs one of the four SP levels (5 to 8) and one of the four bosses and is
refused after the teams are saved; 511 needs all four picked, sets health to 100 and does
nothing when resent; 512 clears the saved flag, health, picks and times of the SP levels
only (60310, the time of the TSP level, stays); 513 with `bSave` writes the health of the
teams that fought (holes in `blood` are skipped, values clamped to 0 to 100) and the clear
time, rounded up to at least 1 because 0 means "not passed". All four answer `{}`.
The TSP level's time is not written (its source would be the kill parameter of 55).
