import type { CafeCatalog } from "./cafe-catalog.js";
import { nextCafeFurnitureObjectId } from "./cafe-furniture-data.js";
import { isNativeFixedHouseObjectId } from "./house-data.js";
import type { CafeFurnitureState, Player } from "../persistence/player-repository.js";

const HOUSE_ROOM_IDS = [1, 2, 6] as const;

/**
 * Build the original game's starting café (NCafeDefautItems): four single
 * tables with one business seat each plus decor in room 1, and the rest room
 * set in room 2. Every seat in the café shop costs coffee coin, and coffee coin
 * comes only from served guests, so a café without these seats can never earn.
 *
 * Object IDs come from the shared allocator, after any existing furniture.
 * Each item gets its own pose object: the client keeps a reference to it.
 */
export function makeDefaultCafeFurniture(
  catalog: CafeCatalog,
  existing: readonly CafeFurnitureState[] = [],
): CafeFurnitureState[] {
  let objId = nextCafeFurnitureObjectId(existing);
  return catalog.defaultItems().map((row) => ({
    templateId: row.ItemId,
    objId: objId++,
    parentId: row.parentTemplateId,
    roomId: row.Room,
    pose: {
      templateId: row.ItemId,
      parentTemplateId: row.parentTemplateId,
      place: 0,
      posX: row.posX,
      posY: row.posY,
      rotate: row.rotate,
    },
    status: 0,
    isNew: false,
    bizcount: row.BizCount,
  }));
}

/**
 * Seed the starting café once per profile. A profile qualifies when it owns no
 * furniture yet: native fixed scene objects (floors, walls, counter) that the
 * client saved back do not count. The marker stops a second seed after the
 * player sells or decomposes everything later.
 *
 * Returns the number of items added (0 when nothing changed but the marker).
 */
export function reconcileDefaultCafeFurniture(
  player: Player,
  catalog: CafeCatalog,
): number {
  const cafe = player.cafe;
  if (cafe.defaultFurnitureSeeded) return 0;
  cafe.defaultFurnitureSeeded = true;
  const furniture = cafe.furniture ?? [];
  if (furniture.some((item) => !isNativeFixedHouseObjectId(item.objId))) return 0;
  const seeded = makeDefaultCafeFurniture(catalog, furniture);
  if (seeded.length === 0) return 0;
  cafe.furniture = [...furniture, ...seeded];
  const rooms = (cafe.rooms ??= []);
  for (const roomId of HOUSE_ROOM_IDS)
    if (!rooms.some((room) => room.roomId === roomId))
      rooms.push({
        roomId,
        girlIds: [],
        friendGirlId: 0,
        themeId: 0,
        furnitureIds: [],
      });
  // Same derivation as persistHouseChanges: room membership follows roomId.
  for (const room of rooms)
    room.furnitureIds = cafe.furniture
      .filter((item) => item.roomId === room.roomId)
      .map((item) => item.objId)
      .sort((a, b) => a - b);
  return seeded.length;
}
