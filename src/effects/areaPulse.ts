import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';
import { collectCircleHits, type PointLike, type SizedEntity } from './EffectGeometry';

export class AreaPulseEffect implements WeaponEffect {
  readonly type = 'area_pulse';

  constructor(readonly params: Record<string, unknown>) {}

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
