import type { WeaponEffect, WeaponEffectContext } from './weaponEffects';

export class AreaPulseEffect implements WeaponEffect {
  readonly type = 'area_pulse';

  constructor(readonly params: Record<string, unknown>) {}

  apply(_context: WeaponEffectContext): void {}
}
