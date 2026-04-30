import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';
import {
  collectLineRectHits,
  collectMeleeArcHits,
  type DirectionLike,
  type PointLike,
  type SizedEntity,
} from './EffectGeometry';

export class MeleeArcEffect implements WeaponEffect {
  readonly type = 'melee_arc';

  constructor(readonly params: Record<string, unknown>) {}

  queryHits(
    origin: PointLike,
    aimAngle: number,
    radius: number,
    halfAngle: number,
    candidates: readonly SizedEntity[],
    excludedIds?: ReadonlySet<SizedEntity['id']>,
  ): SizedEntity['id'][] {
    return collectMeleeArcHits(origin, aimAngle, radius, halfAngle, candidates, excludedIds);
  }

  queryLineRectHits(
    origin: PointLike,
    direction: DirectionLike,
    length: number,
    width: number,
    candidates: readonly SizedEntity[],
    excludedIds?: ReadonlySet<SizedEntity['id']>,
  ): SizedEntity['id'][] {
    return collectLineRectHits(origin, direction, length, width, candidates, excludedIds);
  }

  apply(_context: WeaponEffectContext): void {}
}
