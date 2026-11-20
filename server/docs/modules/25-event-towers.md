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
  reply goes back the same way, which also clears the stored settlement the
  client resends after a reconnect.
- The client's JSON encoder writes a Lua array with holes as `[.., null, ..]`:
  argument 7 of 55 is nil for most classes (6 and 7 for the sixteenth tower).
- `OnGetTower` of 17 classes does nothing and the client does not wait for the 53
  reply (`UpdateGetTower` runs at once); the reply only exists so the call is
  answered. Swimwear and absorb peak read the server score from it.
- Error codes are `ActivitiesLogic.tbErrorCode`: 2 invalid, 5 vigour, 8 points,
  9 pool empty, 10 formation, 12 no award, 13 award already claimed. 176 is
  refused with `{res: false}` because `UI_TowerScoreInfo` reacts to `res == true`
  only.

## Served towers

27 Tower.txt ids of 19 classes: 1, 2, 3, 5, 6, 7, 9-20, 101-107, 201, 303. Not served
and left on the unhandled path: Animalize (4), EighthTower (8), TwentyFirstTower
(21), the ranking tower (activity type 6, whatever the id), and every id that is
not in `resources/tower/tower.txt`.

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
- The 0.1.3 thirteenth tower script uses the ninth tower's slots (group 9, 2500,
  60000), not the EN 1.0.9 ones (64, 9100, 40000). The two towers therefore share
  records on the client.

## Server behaviour

- Entry: the level must exist, the formation must exist (story levels need none)
  and vigour must cover the cost (half, rounded up, below commander level 35).
  Nothing is charged at entry.
- The run (tower, level, open flag, stored reply) is kept in the save
  (`Player.eventTower`). Settlement, replay and refusal happen inside one store
  update, so a refusal changes nothing.
- Settlement: charges the vigour, rolls first clear, `FixAward` (weight out of 10000) and `RandomAward` with `rollChapterAwards`, grants them, writes the level
  record, node progress, goal points and thresholds, adds the master exp and counts
  the fight for the oath tasks (`TowerFight`). A settlement with no matching open
  entry is refused; one for a closed entry replays the stored reply.
- Failure (56): charges the vigour once and closes the entry.
- Score and exp items (15-17, 15-18, 15-19, 15-30, 15-31, 15-32, 15-47..50, 15-105,
  15-106) are AutoUse items that add to a task value: swimwear and absorb peak
  score and equipment exp, tenth and fifteenth tower talent exp. Other event
  currencies are wallets through `autouse.txt`.
- Lottery: the wallet is the tower's `Money1GDPL` currency (Lottery 14, Seventh 21,
  Eleventh 44, Twentieth 82). A draw takes `LotteryTimes` slots by weight; the
  client disables a draw when fewer are left, and the server refuses it too. A
  reset needs the key item drawn or the pool emptied; pool 8 has `Loop` 0, so it
  clears in place and counts the resets (the client shows pool id + resets).
- Server-wide awards (63): the client shows an award when
  `floor(1000 * serverScore / allServiceScore) >= Score`, with `allServiceScore`
  2000000000 (swimwear) or 200000000 (absorb peak). The server score is the
  player's own score, so these awards stay out of reach, as on a server with no
  other player.

## Phone package

The server needs `tower` in its `--resources` list, like `card`.

## Known gaps

- Sixteenth tower: its boss rush calls `BossRush_ResetSp`, `BossRush_SaveSpResult`,
  `BossRush_SelectSpBoss` and `BossRush_SaveSpFormation` are not handled (they hang);
  its HP and shield carry-over tasks are not written.
- No achievements, mission counters (conditions 99, 105, 108, 110, 181) or daily
  mission counts other than vigour are updated by a tower fight.
- Card exp is shown (`nCardExp`) but, as for chapters, not applied.
- Monster drops (`tbDrop`, `tbDropItems`) are empty at entry; random awards come at
  settlement.
- Event vigour discounts of `RewardActivity` tables and the Animalize/Eighth
  `GetEnergySale` are not applied.
- 176 and `BossChallenge` scoring (`UI_2ndBossChallengeScoreInfo`) use the same
  command with an `activeId` that can equal a tower id; there is no way to tell them
  apart.
- Items 15-121 and 15-122 (twentieth tower) have no AutoUse rule and stay as stacks;
  the client counts them from the inventory.
- The client writes task 96/600 itself (`SeventeenthTowerLogic.IsNewUnlock`). This
  branch has no `TASK_CHANGE_REQ` allowlist; one must allow that value.
