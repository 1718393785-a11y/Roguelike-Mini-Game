import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';
import { selectForwardConeTarget, type DirectionLike, type PointLike, type SizedEntity } from './EffectGeometry';

export class ProjectileEffect implements WeaponEffect {
  readonly type = 'projectile';

  constructor(readonly params: Record<string, unknown>) {}

  selectTarget<T extends SizedEntity>(
    origin: PointLike,
    facing: DirectionLike,
    candidates: readonly T[],
    maxAngleDiff = Math.PI / 4,
  ): T | null {
    return selectForwardConeTarget(origin, facing, candidates, maxAngleDiff);
  }

  apply(_context: WeaponEffectContext): void {}
}
