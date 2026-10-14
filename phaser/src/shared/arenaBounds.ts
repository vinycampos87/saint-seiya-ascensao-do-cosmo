/** Training ground projected onto the new 1920 x 1080 Sanctuary illustration.
 * This is a deliberately conservative collision ellipse contained inside the
 * sandy floor; temple stairs, stone walls and garden are not traversable in v0.6.
 */
export const ARENA_WORLD = {width: 1920, height: 1080} as const;
export const ARENA_FLOOR = {cx: 960, cy: 640, rx: 795, ry: 223} as const;
export const PLAYER_START = {x: 960, y: 680} as const;
export const ENEMY_SPAWNS = [
  {x: 1190, y: 615}, {x: 720, y: 575}, {x: 945, y: 785},
  {x: 1235, y: 718}, {x: 630, y: 652}, {x: 1110, y: 530},
  {x: 785, y: 755}, {x: 1335, y: 626}
] as const;

/** Check using FEET coordinates, not top-left or sprite image extent. */
export function isInsideArenaFloor(x: number, y: number, radius = 0): boolean {
  const rx = ARENA_FLOOR.rx - radius;
  const ry = ARENA_FLOOR.ry - radius;
  if (rx <= 0 || ry <= 0) return false;
  const dx = (x - ARENA_FLOOR.cx) / rx;
  const dy = (y - ARENA_FLOOR.cy) / ry;
  return dx * dx + dy * dy <= 1;
}