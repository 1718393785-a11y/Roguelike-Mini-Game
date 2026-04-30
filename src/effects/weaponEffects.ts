import { AreaPulseEffect } from './areaPulse';
import { MeleeArcEffect } from './meleeArc';
import { OrbitEntityEffect } from './orbitEntity';
import { PersistentAreaEffect } from './persistentArea';
import { ProjectileEffect } from './projectile';

export type WeaponEffectType =
  | 'melee_arc'
  | 'projectile'
  | 'orbit_entity'
  | 'area_pulse'
  | 'persistent_area'
  | 'mod_pierce'
  | 'mod_knockback'
  | 'mod_combo';

export interface WeaponEffectContext {
  readonly deltaTime: number;
  readonly params: Record<string, unknown>;
}

export interface WeaponEffect {
  readonly type: WeaponEffectType;
  apply(context: WeaponEffectContext): void;
}

export type WeaponEffectFactory = (params: Record<string, unknown>) => WeaponEffect;

export class ModifierEffect implements WeaponEffect {
  constructor(readonly type: 'mod_pierce' | 'mod_knockback' | 'mod_combo', readonly params: Record<string, unknown>) {}

  apply(_context: WeaponEffectContext): void {}
}

export const WEAPON_EFFECT_WHITELIST: readonly WeaponEffectType[] = [
  'melee_arc',
  'projectile',
  'orbit_entity',
  'area_pulse',
  'persistent_area',
  'mod_pierce',
  'mod_knockback',
  'mod_combo',
] as const;

export function assertWhitelistedEffect(type: string): asserts type is WeaponEffectType {
  if (!WEAPON_EFFECT_WHITELIST.includes(type as WeaponEffectType)) {
    throw new Error(`Unknown weapon effect type: ${type}`);
  }
}

export const WEAPON_EFFECT_FACTORIES: Record<WeaponEffectType, WeaponEffectFactory> = {
  melee_arc: params => new MeleeArcEffect(params),
  projectile: params => new ProjectileEffect(params),
  orbit_entity: params => new OrbitEntityEffect(params),
  area_pulse: params => new AreaPulseEffect(params),
  persistent_area: params => new PersistentAreaEffect(params),
  mod_pierce: params => new ModifierEffect('mod_pierce', params),
  mod_knockback: params => new ModifierEffect('mod_knockback', params),
  mod_combo: params => new ModifierEffect('mod_combo', params),
};

export function createWeaponEffect(type: string, params: Record<string, unknown> = {}): WeaponEffect {
  assertWhitelistedEffect(type);
  return WEAPON_EFFECT_FACTORIES[type](params);
}
