/** Testable, renderer-agnostic combat calculations. No Phaser or React dependencies. */
export type Direction = 'down' | 'left' | 'right' | 'up';
export type Vector2 = { x: number; y: number };
export type HitTarget = Vector2 & { radius?: number };
export type AttackKind = 'attack1' | 'attack2' | 'attack3';
export const DIRECTIONS: Direction[] = ['down', 'left', 'right', 'up'];

export const MAX_HP = 150;
export const MAX_COSMO = 100;
export const METEOR_COST = 45;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function normalize(x: number, y: number): Vector2 {
  const len = Math.hypot(x, y);
  return len === 0 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}

export function directionVector(dir: Direction): Vector2 {
  switch (dir) {
    case 'up': return { x: 0, y: -1 };
    case 'down': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

export function directionFromVector(dx: number, dy: number, fallback: Direction = 'down'): Direction {
  if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return fallback;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'right' : 'left';
  return dy >= 0 ? 'down' : 'up';
}

/** Hit cone in scene/world coordinates. Uses scalar projection, not sprite pixels. */
export function isTargetInCone(origin: Vector2, dir: Direction, target: HitTarget, reach: number, halfWidth: number): boolean {
  const axis = directionVector(dir);
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const forward = dx * axis.x + dy * axis.y;
  const sideways = Math.abs(dx * (-axis.y) + dy * axis.x);
  const radius = target.radius ?? 0;
  return forward >= -radius && forward <= reach + radius && sideways <= halfWidth + radius;
}

export function distance(a: Vector2, b: Vector2): number { return Math.hypot(a.x - b.x, a.y - b.y); }

export function applyDamage(hp: number, damage: number, maxHp: number): number {
  return clamp(hp - Math.max(0, damage), 0, maxHp);
}

export function gainCosmo(cosmo: number, amount: number): number {
  return clamp(cosmo + Math.max(0, amount), 0, MAX_COSMO);
}

export function spendCosmo(cosmo: number, cost: number): number | null {
  return cosmo >= cost ? clamp(cosmo - cost, 0, MAX_COSMO) : null;
}

/** Three-stage combo, resetting after a short gap. Returns attack index 0,1,2. */
export function nextComboIndex(previous: number, lastAttackMs: number, nowMs: number, windowMs = 950): number {
  return nowMs - lastAttackMs > windowMs ? 0 : (previous + 1) % 3;
}

export function attackDamage(index: number): number { return [13, 17, 25][clamp(index, 0, 2)]; }