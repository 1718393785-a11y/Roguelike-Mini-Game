import { z } from 'zod';

export const WeaponEffectSchema = z.object({
  type: z.enum([
    'melee_arc',
    'projectile',
    'orbit_entity',
    'area_pulse',
    'persistent_area',
    'mod_pierce',
    'mod_knockback',
    'mod_combo',
  ]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const WeaponLevelSchema = z.object({
  level: z.number().int().min(1).max(6),
  name: z.string().min(1).max(40),
  desc: z.string().min(1).max(240),
  numericPatches: z.record(z.string(), z.number()).default({}),
  effects: z.array(WeaponEffectSchema).default([]),
});

export const WeaponConfigSchema = z.object({
  id: z.string().min(1).max(32),
  name: z.string().min(1).max(40),
  damage: z.number().min(0).max(9999).default(10),
  attackInterval: z.number().min(0.016).max(60).default(1),
  range: z.number().min(0).max(9999).default(80),
  angle: z.number().min(0).max(360).optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  levels: z.array(WeaponLevelSchema).min(1).max(6),
  effects: z.array(WeaponEffectSchema).default([]),
});

export const WeaponsConfigSchema = z.record(z.string(), WeaponConfigSchema);

export const EnemyConfigSchema = z.object({
  name: z.string().min(1).max(40),
  hp: z.number().min(1).max(999999),
  speed: z.number().min(0).max(9999),
  size: z.number().min(1).max(1000),
  damage: z.number().min(0).max(9999),
  exp: z.number().min(0).max(999999),
  resonanceDrop: z.number().min(0).max(9999).default(0),
  flags: z.array(z.string().min(1).max(32)).default([]),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const EnemiesConfigSchema = z.record(z.string(), EnemyConfigSchema);

export const BalanceConfigSchema = z.object({
  player: z.object({
    hp: z.number().min(1).max(999999),
    size: z.number().min(1).max(1000),
    speed: z.number().min(0).max(9999),
    baseDamage: z.number().min(0).max(9999),
    expToNextLevel: z.number().min(1).max(999999),
  }),
  drops: z.object({
    expChance: z.number().min(0).max(1),
    resonanceChance: z.number().min(0).max(1),
    maxExpPickups: z.number().int().min(1).max(10000),
  }),
  spatialHash: z.object({
    cellSize: z.number().min(16).max(1000),
  }),
});

export const WaveStageSchema = z.object({
  name: z.string().min(1).max(40),
  boss: z.string().min(1).max(40),
  description: z.string().max(160).default(''),
  minSpawnCount: z.number().int().min(0).max(10000),
  maxSpawnCount: z.number().int().min(0).max(10000),
  spawnInterval: z.number().min(0.016).max(60),
  bossHp: z.number().min(1).max(9999999),
  bossSpeed: z.number().min(0).max(9999),
  bossAbility: z.string().min(1).max(64),
});

export const WavesConfigSchema = z.object({
  stages: z.array(WaveStageSchema).min(1).max(100),
});

export const EffectConfigSchema = z.object({
  duration: z.number().min(0).max(3600).optional(),
  fadeOut: z.number().min(0).max(3600).optional(),
  color: z.string().min(1).max(64).optional(),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const EffectsConfigSchema = z.record(z.string(), EffectConfigSchema);

export const RawConfigSchema = z.object({
  weapons: WeaponsConfigSchema,
  enemies: EnemiesConfigSchema,
  balance: BalanceConfigSchema,
  waves: WavesConfigSchema,
  effects: EffectsConfigSchema,
});

export type WeaponConfig = z.infer<typeof WeaponConfigSchema>;
export type RawConfig = z.infer<typeof RawConfigSchema>;
export type ValidationIssue = z.ZodIssue;
