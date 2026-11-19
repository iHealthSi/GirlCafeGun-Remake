import { CafeCatalog } from "./cafe-catalog.js";
import { INITIAL_COFFEE_TASK_VALUES } from "./cafe-data.js";
import { nextCafeFurnitureObjectId } from "./cafe-furniture-data.js";
import { CafeRuntime, makeCafeBusinessState } from "./cafe-runtime.js";
import { completeHouseRooms, isNativeFixedHouseObjectId } from "./house-data.js";
import type { Player } from "../persistence/player-repository.js";

/** Release starter grant and one-time repair for pre-existing unfurnished cafés. */
export function reconcileStarterCafe(
  player: Player,
  now: number,
  catalog = CafeCatalog.loadDefault(),
): void {
  const cafe = player.cafe;
  cafe.rooms = completeHouseRooms(cafe.rooms);
  if (cafe.starterVersion === 1) return;
  cafe.starterVersion = 1;
  const furniture = (cafe.furniture ??= []);
  // A stored collection is still owned. Never replace a player's layout or
  // replenish a starter grant after they deliberately store/recycle it.
  if (
    furniture.some((item) => !isNativeFixedHouseObjectId(item.objId)) ||
    player.inventory.some((item) => item.genre === 11 && item.count > 0)
  )
    return;
  const theme = catalog.theme(1)!; // Original NCafe CafeDefault, not a paid theme.
  let next = nextCafeFurnitureObjectId(furniture);
  const added = theme.poses.map((pose) => ({
    templateId: pose.templateId,
    objId: next++,
    parentId: pose.parentTemplateId,
    roomId: theme.Area,
    pose: { ...pose, place: theme.Area },
    status: 0,
    isNew: false,
    bizcount: 0,
  }));
  furniture.push(...added);
  const rooms = (cafe.rooms ??= []);
  let room = rooms.find((entry) => entry.roomId === theme.Area);
  if (!room) {
    room = {
      roomId: theme.Area,
      girlIds: [],
      friendGirlId: 0,
      themeId: 0,
      furnitureIds: [],
    };
    rooms.push(room);
  }
  room.furnitureIds = furniture
    .filter((item) => item.roomId === theme.Area)
    .map((item) => item.objId);
  for (const [key, value] of Object.entries(INITIAL_COFFEE_TASK_VALUES))
    player.taskValues[key] = (player.taskValues[key] ?? 0) | value;
  const level = catalog.level(cafe.level ?? 1)!;
  const business = (cafe.business ??= makeCafeBusinessState(Math.floor(now / 1_000)));
  // These are actual stock layout biz points; the client can upload updated
  // reachable seats normally after the player edits the room.
  business.seats = added
    .flatMap((item) =>
      (catalog.furniture(item.templateId)!.raw.Points ?? "")
        .split("|")
        .filter((point) => point.startsWith("biz_"))
        .map((_, index) => ({ position: item.objId * 10 + index })),
    )
    .slice(0, level.SlotEat);
  business.queue = [];
  business.lastGeneratedAt = Math.floor(now / 1_000);
  if (!cafe.coffees.some((coffee) => coffee.count > 0)) {
    const unused = () => {
      throw new Error("Starter preview must not change the economy");
    };
    new CafeRuntime(player, catalog, now, {
      chargeMoney: unused,
      consumeItem: unused,
      grant: unused,
      updatedGirl: unused,
    });
    // Level 1 has one coffee slot. Match a real eligible guest's preference
    // so the first stock can earn café coins, even on different rotation days.
    const guest = catalog.customer(business.weights[0]!.Id)!;
    const recipe = [1, 2, 3, 4]
      .map((id) => catalog.coffee(id)!)
      .find((coffee) => coffee[guest.Prefer] >= guest.Preferfactor)!;
    cafe.coffees = [{ coffeetype: recipe.Id, count: Math.min(60, level.MaxCoffee) }];
  }
}
