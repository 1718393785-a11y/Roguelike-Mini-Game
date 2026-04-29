import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';

export class ProjectileEffect implements WeaponEffect {
  readonly type = 'projectile';

  constructor(readonly params: Record<string, unknown>) {}

  apply(_context: WeaponEffectContext): void {}
}
