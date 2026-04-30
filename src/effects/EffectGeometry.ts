export interface PointLike {
  readonly x: number;
  readonly y: number;
}

export interface SizedEntity extends PointLike {
  readonly id: number | string;
  readonly size: number;
}

export interface DirectionLike extends PointLike {}

export interface OrbitConfig {
  readonly count: number;
  readonly baseAngle: number;
  readonly direction: 1 | -1;
  readonly radius: number;
}

export function angleDeltaAbs(left: number, right: number): number {
  const diff = Math.abs(left - right);
  return Math.min(diff, 2 * Math.PI - diff);
}

export function collectMeleeArcHits(
  origin: PointLike,
  aimAngle: number,
  radius: number,
  halfAngle: number,
  candidates: readonly SizedEntity[],
  excludedIds: ReadonlySet<SizedEntity['id']> = new Set(),
): SizedEntity['id'][] {
  return sortHitIds(candidates
    .filter(entity => !excludedIds.has(entity.id))
    .filter(entity => {
      const dx = entity.x - origin.x;
      const dy = entity.y - origin.y;
      if (Math.hypot(dx, dy) > radius) return false;
      return angleDeltaAbs(Math.atan2(dy, dx), aimAngle) <= halfAngle;
    })
    .map(entity => entity.id));
}

export function collectLineRectHits(
  origin: PointLike,
  direction: DirectionLike,
  length: number,
  width: number,
  candidates: readonly SizedEntity[],
  excludedIds: ReadonlySet<SizedEntity['id']> = new Set(),
): SizedEntity['id'][] {
  return sortHitIds(candidates
    .filter(entity => !excludedIds.has(entity.id))
    .filter(entity => {
      const dx = entity.x - origin.x;
      const dy = entity.y - origin.y;
      const projLength = dx * direction.x + dy * direction.y;
      const projWidth = dx * (-direction.y) + dy * direction.x;
      return projLength >= 0 && projLength <= length && Math.abs(projWidth) <= width / 2 + entity.size / 2;
    })
    .map(entity => entity.id));
}

export function collectCircleHits(
  origin: PointLike,
  radius: number,
  candidates: readonly SizedEntity[],
  excludedIds: ReadonlySet<SizedEntity['id']> = new Set(),
): SizedEntity['id'][] {
  return sortHitIds(candidates
    .filter(entity => !excludedIds.has(entity.id))
    .filter(entity => Math.hypot(entity.x - origin.x, entity.y - origin.y) < radius + entity.size / 2)
    .map(entity => entity.id));
}

export function collectPersistentAreaHits(
  origin: PointLike,
  radius: number,
  candidates: readonly SizedEntity[],
): SizedEntity['id'][] {
  return sortHitIds(candidates
    .filter(entity => {
      const dx = entity.x - origin.x;
      const dy = entity.y - origin.y;
      const effectiveRadius = radius + entity.size / 2;
      return dx * dx + dy * dy <= effectiveRadius * effectiveRadius;
    })
    .map(entity => entity.id));
}

export function selectForwardConeTarget<T extends SizedEntity>(
  origin: PointLike,
  facing: DirectionLike,
  candidates: readonly T[],
  maxAngleDiff: number,
): T | null {
  const facingAngle = Math.atan2(facing.y, facing.x);
  let closest: T | null = null;
  let closestDistanceSq = Infinity;
  for (const entity of candidates) {
    const dx = entity.x - origin.x;
    const dy = entity.y - origin.y;
    if (angleDeltaAbs(Math.atan2(dy, dx), facingAngle) > maxAngleDiff) continue;
    const distSq = dx * dx + dy * dy;
    if (distSq < closestDistanceSq) {
      closestDistanceSq = distSq;
      closest = entity;
    }
  }
  return closest;
}

export function buildOrbitPoints(origin: PointLike, configs: readonly OrbitConfig[]): PointLike[] {
  const points: PointLike[] = [];
  for (const orbit of configs) {
    for (let index = 0; index < orbit.count; index++) {
      const currentAngle = orbit.baseAngle + (Math.PI * 2 / orbit.count) * index;
      const actualAngle = currentAngle * orbit.direction;
      points.push({
        x: origin.x + Math.cos(actualAngle) * orbit.radius,
        y: origin.y + Math.sin(actualAngle) * orbit.radius,
      });
    }
  }
  return points;
}

function sortHitIds(ids: SizedEntity['id'][]): SizedEntity['id'][] {
  return [...ids].sort((left, right) => {
    if (typeof left === 'number' && typeof right === 'number') return left - right;
    return String(left).localeCompare(String(right));
  });
}
