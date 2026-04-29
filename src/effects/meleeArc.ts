import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';

export class MeleeArcEffect implements WeaponEffect {
  readonly type = 'melee_arc';

  constructor(readonly params: Record<string, unknown>) {}

  apply(_context: WeaponEffectContext): void {}
}
