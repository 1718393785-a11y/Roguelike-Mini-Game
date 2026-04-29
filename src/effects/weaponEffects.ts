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
