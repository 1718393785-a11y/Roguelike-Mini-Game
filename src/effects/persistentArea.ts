import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';

export class PersistentAreaEffect implements WeaponEffect {
  readonly type = 'persistent_area';

  constructor(readonly params: Record<string, unknown>) {}

  apply(_context: WeaponEffectContext): void {}
}
