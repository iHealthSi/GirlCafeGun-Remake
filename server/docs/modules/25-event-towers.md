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

## Slice 3: named-field event towers

Code: `game-data/named-tower-data.ts` (families, layouts, request parsing), `applyNamedTowerRequest` in
`persistence/player-repository.ts` (`PlayerRepository.handleNamedTowerRequest`), a branch in the gateway after the
Tower.txt one. Tables: `resources/tower/{microtower,coopclient,mixonline,bufftower,linkageactivity,2ndanniversary,bosschallenge}`.
The open run is kept in `Player.namedTower` (a slot of its own: a run of one family never matches a Tower.txt
settlement or another family). Enter is `CallServer`; Pass and Fail go through DoSettle 252 and are answered the same
way. Refusals leave the save unchanged. Vigour is charged at the pass (and at a Fail, once), at the cost the client
computes (support plan halving below commander level 35, as for the other towers).

| Family             | Calls                                                      | Task layout (group: keys)                                                                                    |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Micro tower        | 285 echo `{nTowerId}`, 286-288                             | 59: clears `100 + level*5 + diff`, score `200 +`, goal bits `300 +`; story flag 403 is written by the client |
| Armed survey       | 335 echo `{nId}`, 336-338, 339 SaveSp, 261 `[]`            | 68: clear `10 + level` (shared by all events), best SP damage 5                                              |
| Mixed online       | 451-453, 454 `{spCount: 0}`, 455 barrage, 260 cartoon node | 68: event id 1001 (seeded 1, the page writes it), node bits 1002                                             |
| Buff tower         | 377-379, 376 score award                                   | 64: total 5008, got 5009, pass bit `5100 + level` (diff - 1), score `5200 + (level-1)*6 + diff`              |
| Linkage            | 401-403, 404 mission claim, 405 gacha                      | 63: event id 3001 (seeded 1), pass bit `3002 + level`, gacha `3200 + (pond-1)*20 + slot`                     |
| Second anniversary | 529-531, 528 `[]`                                          | 81: pass bit (event - 1) of `30010 + level`                                                                  |
| Boss challenge     | 532-534, 535 score award                                   | 81: got 30104, pass bit `30110 + level`, score `30150 + (level-1)*6 + diff`                                  |

Reply shapes: Pass `{tbData, tbAwards, nMasterExp, nCardExp, newGoalIds, isPass}` (always arrays; micro reads
`tbAwards`); armed survey adds `spKillNum`, `curScore`; boss adds `tbRet [useTime, leftHpRate, score, isNew]`.
Enter `{tbData: {fields of the request}, tbDrop: [], tbDropItems: []}`. Errors: `{nError}`, Fail `{}`.

- Armed survey SP level (type 3): the pass counts `tbKillMonster.tbKillMonster[attribute]` kills (KillAward attribute),
  339 with `bSave` pays `KillAward item * min(kills, max)` once and keeps the best damage; OtherCost (money 51 x 60) is
  charged at the pass, error 17 at Enter when short. [INFER] the kill index and `curScore = kills`.
- Mixed online: the server reads the event from 68/1001. The page must write it when it opens row 2. Type 3 nodes
  (online levels) are refused (error 2).
- Buff tower: score = sum of the chosen buffs' `Score` (positions in `tbBuffs`), best per level, total adjusted.
- Boss challenge score is [INFER] (half of `MaxScore` for a clear, the rest by `leftHpRate`).
- Linkage: missions 5700-5740 and the map nodes' 5741-5743 are `AchievementOther` (group 18). Fights add the counters
  the tables name (type 110 clears of activity type 25, type 24 vigour spent) [INFER]; types 135 (girl affection) and
  45 (owning a card) are read from the save. 404 claims in the lists (a state opens when the one before is claimed);
  the map nodes claim through `GetConverAchieveAward` (new gateway branch, `claimOtherAchievementAward`). Types 29, 220,
  221 (training, richman) have no source: those missions never complete. The last gacha pond opens when the others are
  empty.
- Not served after slice 3: Music, WarChess (slice 4 below), the first Anniversary, the ranking tower, 535 only for
  `BossChallenge` (206 is not).
- Shared records (the client's keys carry no event id): armed survey events share 68/10+, buff events 64/5008...,
  mixed events 68/1002, second anniversary events one task with one bit each. `named-tower-data.test.ts` lists them.
- Seeds: `reconcileNamedTowerSeeds` sets 63/3001 and 68/1001 to the first event at login (`getOrCreate`, `markLogin`).

## Slice 4: concert, event missions, war chess

Tables (`resources/tower/`, byte copies): `musicactivity/` (total, tower, level), `concertexchange/`, `eventmission/`
(MusicMission, MonthMission), `warchesstower/`.

**Concert tower, 371-373** (family `music`, `NAMED_FAMILIES`): group 64, clear bit `diff - 1` of `4100 + level`.
Enter echoes the request `nType` (19 tower, 21 interest levels). Level types 5 (relay) and 7 (music select) are
screens: refused. Type 4 (fixed team) sends no formation and costs nothing. Type 6 (interest, levels 71/72): the
fight tickets are tasks 1/554-556 (first issue) and 557-559 (next): gained, played, best score. Items 15-68 and 15-69
add to 554 and 557 (`TOWER_ITEM_TASKS`). Enter is refused with error 11 when no ticket is left, the settlement (pass
or fail) uses one, a pass pays the `FirstAward` steps `[g-d-p-l-n-score]` for the score reached every run
(`LevelManager:GetScoreReward`) and the fixed award. 373 answers `{}`; `MusicActivityLogic:OnFailTower` does not exist
in the client script, so the nil call after the DoSettle reply is a Lua error that cannot be avoided (the stored
settlement is cleared before it). 391 (relay log) and 282 (BGM log) are accepted without a reply, the relay choices
(64/6000-6998, 6999) are written by the client. 138 is the cafe music (cafe runtime).

**Missions, 374 (group 70) and 436 (group 85, the second anniversary screen).** Request `{Type, nId}` or
`{Type, tbList}`; reply `{Type, tbItem}`, refusal `{Error, Type}` (20002 unknown, 20003 not done, 20005 claimed). A
list pays what is ready. Value = progress * 2 + claimed. `event-mission-data.ts` keeps counters in
`player.eventMissions` (`total`, `today`; daily rows (missionType 1) read `today`, the day changes at 04:00 Shanghai
and zeroes daily values). Fed by the fights of the concert, second anniversary and boss challenge (24 vigour, 192
act clears [issue, type, n], 181 SP clears, 219 clears of a level, 184 [level, diff], 183 kills (`totalkillMonster`),
176 tokens gained (wallet diff of the settlement), 177 interest plays, 191 music game ratings, 178 music game plays)
and by shop purchases (259 tokens spent: only for the money ids the tables name). Read from the save: 45 (wallet
coins by what came in, else inventory), 186 (best interest score), 189 (exchange count, 74/2). No source, never
completes: 179 idol support, 180 and 187/188 collection trading, the pressing mission rows (none in the table).
"Issue" of a concert level = the MusicTowerTotal id its MusicTower row lists it under; of the others the `Id` column.

**Concert exchange, 380-384.** Season task 74/1 (seeded to the first row at login; the page may write another).
380 `{tbData: []}`, 383 `{tbList: []}` (nobody else here), 384 `{Error: 20122}` (the client then removes the entry),
381 `{Error: 0, Type, TypeId}`: `Type` 0 lists (flag bit `TypeId` of 74/3, daily counter 74/4, limit `MaxListing`), 1
cancels. 382 [INFER] takes one of each collection currency (money 37-40), pays the first rare reward not yet received
(TaskId order, flag bit `TaskId % 30` of `74/(10 + TaskId / 30)`) and one random basic reward, 74/2 += 1, reply
`{Items}`; short of a piece: error 20043. The hub opens through FanEvent_GetList (354): answered `{tbNewGirlList: []}`,
357 `{tbList: []}`; 355 and 356 (the idol vote screens) stay unanswered.

**Music game, 388-390.** 388 keeps the best score in 1/(3100 + gameId) (no reply, the client handler is empty), counts
the plays and ratings for the missions. 389 answers an array indexed by game id `[null, {pos: 0, score}]` (pos 0 =
not ranked), 390 `{musicId, tbList: []}`. The GameRank list calls of the result screens are not served.

**War chess, 536-539** (family `chess`, group 97, clear count `110 + level`). 536-538 as the other families (echo `nId`,
`nLevelId`, `nFormationId`); 539 is the board, sub-command `nType`: 1 start `{id, mapId, diff, team1, team2}` (grid ids;
birth cells checked, hard maps need the easy pass bit), 2 reset, 3 move a team (adjacent empty cell, or a boss), 4 end
the player round, 5 boss move `{tbMove}` or, without it, the next round, 7 item (consumes the SpItem item, `skill` 1/2
steps, 3 obstacle, 4 freeze), 8 best rounds. Reply `{nType, nError?}`. The client never sends 536 for a boss fight
(type 1 levels, formation 5106/5107 = team 1/2): the server pushes the 536 reply itself after a team moves onto a boss
or a boss moves onto a team, and opens the run. The fight settles through 537/538 inside DoSettle: a win moves the team
onto the boss's cell and removes the boss, the last boss ends the map (pushed `{nType: 6, tbInfo}`), a loss takes the
team out, both teams out lose the map. Cells, steps, round, health, boss health are the task values of
`warchesstower.lua`. [INFER] one step per team and round, a boss on the cafe loses the map, the hard map score
(1000 - 50 per round - 20 per item), items are consumed.

**Review fixes of slice 3** (landed with slice 4): linkage type 45 reads `[count, G, D, P, L]`, 339 answers the bare list
(`CoopClientEvent.tbSpAward`), refused coop and mixed online passes answer with empty success fields, negative pond
`Count` is unlimited, the linkage daily mission ignores the state lock and resets daily.

## Slice 5: the first Anniversary

Code: `game-data/anniversary-data.ts` (tables, layouts, request parsing, GameRankMsg), the families `anniversary` and
`discovery` in `game-data/named-tower-data.ts`, `applyAnniversaryRequest` in `persistence/player-repository.ts`
(`PlayerRepository.handleAnniversaryRequest`), two branches in the gateway (the hub's LuaCalls and `GameRankMsg`).
Tables: `resources/tower/anniversaryactivity/` (levels, goals, map events, grid maps 1 to 8, discovery maps, capsule
pools, girl stories, puzzle boards) and `anniversaryguess/` (time list, girls, round list, round rates, awards).
Tests: `anniversary-tower`, `anniversary-side`, `anniversary-gateway`; layouts against the Lua with
`GCG_CLIENT_LUA_DIR`.

| Call                          | Request (`tbParam`)                           | Reply (`tbParam`)                                                        |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| 426 / 427 / 428 tower         | named fields as the other towers              | as the second anniversary: `tbData` awards, `{}` for a fail              |
| 421 / 422 / 423 discovery     | the same plus `nMapId`; Pass `tbScore`        | like the tower; Pass adds `newGoalIds`                                   |
| 418 add power, 419 reset map  | `{Val, Reason}` / `{MapID}`                   | none (see below)                                                         |
| 420 move                      | `{MapID, Path}`                               | `{Err: 0, TeamPos, LastPower}`; `{Err: 1}` no power; `{Err: 2}` bad cell |
| 429 strengthen                | `{AttrIdx}`                                   | `{nError: 0}`, `{nError: 1}`                                             |
| 480 exploration reward        | `{MapID, RewardIdx}`                          | `{nError: 0, nMapId, nRewardIdx}`, `{nError: 1}`                         |
| 424 board open                | `{}`                                          | `[photos before]` when a photo unlocks, else no reply                    |
| 425 board award               | `{}`                                          | `[6, 28, 55, 4, 1]` (flat), `[]` refused                                 |
| 437 love                      | `{nType 1 gift or 2 story, girlId, storyIdx}` | `{nType, tbReward}` or `{nError}`                                        |
| 438 capsule                   | `{nId}`                                       | the bare list of rewards (`[]` refused)                                  |
| 440 / 441 puzzle              | `{nGroup, nIndex}`                            | the request with `nRet`: 0, -1 refused, -5 no token                      |
| 430 / 431 / 432 / 433 guess   | see below                                     | `{Error: 0, ...}` or `{Error: 20043 or 20045}`                           |
| 355 / 356 idol vote           | any                                           | `{Error: 20045}`                                                         |
| 206 ranking tower award       | `{}`                                          | `{res: false}`                                                           |
| `GameRankMsg` (not a LuaCall) | `[top, mid, 1, first, [start, limit]]`        | S2C `ServerRankMsg` `{tbData: {tbId, max: 0, me: 0, other: []}}`         |

Task layouts (all in group 81 unless said; `anniversary-side.test.ts` compares them with the Lua): tower clears bit
(event - 1) of 1010 + LevelId; discovery clears 3002 + event \* 100 + LevelId (a counter), star points 20000 + LevelId,
goal flags 20000 + LevelId \* 100 + GoalID; the team stands on 81/<map>; visits are in group 80 at (map - 1) \* 200 +
grid; attributes 4001 to 4003 (50 exp per skill point, 100 exp per level); exploration rewards 19000 + (map - 1) \* 3 +
idx; capsule pond 1901 and drawn counts 1902+; love 2001 + girl; story bits 2501 + girl (bit storyIdx). Board group 83
(1 letter opened, 2 photos, 3 award taken, 4 last day); puzzle group 86 (bits 1 to 18 pieces, 21 to 24 boxes); guess
group 84 (see `GUESS_TASK`).

- Power (money 58) and skill points (money 59) come from the FixAward items 15-86 and 15-87 of the tower levels
  (AutoUse `ItemAddAnniversaryDiscoveryPowerAuto` and `...ExpAuto`, which have no rule in `autouse`):
  `grantTowerAwards` adds them to the wallets (`TOWER_ITEM_WALLETS`).
- 418 and 419 are marked as test commands in `luacall.lua`; the C# build gave out power and let rewards pay again.
  They are accepted, change nothing and get no reply.
- 420 charges one power per new cell; a path the power cannot pay is refused whole (`MoveRsp` does not move the team
  on an error). First arrival pays the cell event's FirstAward once. The walk starts where the team stands (a first
  path cell equal to it is skipped) and ends, with `Err: 0` and `TeamPos` where it stopped, at the first step that
  breaks a rule: a cell that does not share a side with the last one [INFER: the maps put hinders and fights on
  corners, map 2 cells 28, 57 and 88, that a diagonal step would skip]; a new hinder cell (event type 101) while
  strength, spirit and technique are below its needs (`CheckAttr`); a new cell after a fight cell whose level is not
  passed (`CheckFightPass`), also when the team stands on that fight cell: from there only the start and cells it has
  been on are open. Ending the walk instead of an error keeps `MoveRsp` moving the team (it answers nothing else);
  the log line `player.anniversary.note` (`walk_cut`, the reason and the path) shows each cut. The stock client's path
  format (the native `GridMapMgr`) was not read: whether it lists the cell the team stands on and every cell of the
  walk is not checked on a phone (2026-11-21). 429 refuses at the highest level any hinder or story asks for [INFER].
- 480: `done * 1000 >= ProcessPoint * total` over the exploratory degrees (`ProcessSatisfy`).
- 424: the first call also sets 83/1 (the client never does), so the letter plays once. 425 pays the item the screen
  previews (6-28-55-4 is head frame 55: task 11/55 holds the time).
- 437: a gift is item 15-88 (3 love levels); a story needs the love level, the three attribute levels and the tower
  level of its row, and the girl (ids below 21); it is paid once (bit). The unlock date stays on the client.
- 438: one coin (15-89) buys LimitCount draws of the current limited pond and LimitlessCount of the endless one.
- Guess: a round is six of the fourteen girls (task 84/2 counts rounds, 84/7 holds girl, position, tries and results
  of the bout), a match is best of three where draws are not recorded and three tries end it (a match without two
  wins is lost) [INFER]. A throw costs UseNum tries: the 18 free ones of the day (04:00 Shanghai), then wallet 54.
  The gold finger (wallet 55) wins the bout. RoundList fixes the girl's throw for its bout, RoundRate type 2 throws
  the client's hint, type 3 anything but the hint, type 4 sometimes does not throw (the player wins by timeout). 431
  answers `{Error, nType, ServerFist, bGold}` or a timeout shape; 432 pays by bouts, wins against one girl or against
  all; 433 returns the last twenty rounds. The record and the round's girls are in `player.anniversary`.
- Fail replies of 423 and 428 are `{}`; `AnniversaryMainLogic` and `GridActLogic` have no `OnFailTower`, so the client
  runs a nil call after the DoSettle reply (as it does for the concert tower).

Not served: the Event button (NormalActivity 144, the cake page: `NormalActivityGetAward {nActivityId: 144}` and
`SwitchAnniversaryMission` are unanswered); the first Anniversary has no missions in the tables (all 20 rows of
`monthmission.txt` are `missionEvent` 2), so its mission button only shows the tip of the client. The shops 30020 and
30021 are served by the shop module, whose own `shoptabs.txt` closes them by their 2020 dates (as 30040, 30041, 30046,
30047). 355 and 356 are refused, the idol vote is not built. The client writes no task value of these screens.

**Review fixes of slice 4** (landed with slice 5): the pond stock counts unlimited slots, a boss move onto an
occupied cell is answered as done and the boss stays, the mission day rolls before a count is added, mission counters
are kept per mission group (`vigour:<group>`, `kills:<group>:<issue>`, `diff:<group>:<level>:<diff>`; the concert
challenge missions 52 to 57 count buff tower event 1), a shop spend refreshes the mission tasks, the exchange listing
counter rolls with the day at login and at 380, and a team that lost its chess fight leaves the grid.
