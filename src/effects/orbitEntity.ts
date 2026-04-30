import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';
import {
  buildOrbitPoints,
  collectCircleHits,
  type OrbitConfig,
  type PointLike,
  type SizedEntity,
} from './EffectGeometry';

export class OrbitEntityEffect implements WeaponEffect {
  readonly type = 'orbit_entity';

  constructor(readonly params: Record<string, unknown>) {}

  buildPoints(origin: PointLike, configs: readonly OrbitConfig[]): PointLike[] {
    return buildOrbitPoints(origin, configs);
  }

  queryHits(
    origin: PointLike,
    radius: number,
    candidates: readonly SizedEntity[],
    excludedIds?: ReadonlySet<SizedEntity['id']>,
  ): SizedEntity['id'][] {
    return collectCircleHits(origin, radius, candidates, excludedIds);
  }

  apply(_context: WeaponEffectContext): void {}
}
