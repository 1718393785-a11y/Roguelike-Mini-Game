import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';

export class OrbitEntityEffect implements WeaponEffect {
  readonly type = 'orbit_entity';

  constructor(readonly params: Record<string, unknown>) {}

  apply(_context: WeaponEffectContext): void {}
}
