import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';
import { collectPersistentAreaHits, type PointLike, type SizedEntity } from './EffectGeometry';

export class PersistentAreaEffect implements WeaponEffect {
  readonly type = 'persistent_area';

  constructor(readonly params: Record<string, unknown>) {}

  queryHits(
    origin: PointLike,
    radius: number,
    candidates: readonly SizedEntity[],
  ): SizedEntity['id'][] {
    return collectPersistentAreaHits(origin, radius, candidates);
  }

  apply(_context: WeaponEffectContext): void {}
}
