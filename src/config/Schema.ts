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
    baseFireRate: z.number().min(0).max(9999).default(0.5),
    magnetRadius: z.number().min(0).max(9999).default(75),
    rerolls: z.number().int().min(0).max(9999).default(3),
    expToNextLevel: z.number().min(1).max(999999),
  }),
  drops: z.object({
    expChance: z.number().min(0).max(1),
    resonanceChance: z.number().min(0).max(1),
    maxExpPickups: z.number().int().min(1).max(10000),
    rare: z.record(z.string(), z.record(z.string(), z.number().min(0).max(999999))).default({}),
  }),
  spatialHash: z.object({
    cellSize: z.number().min(16).max(1000),
  }),
  passiveSkills: z.record(z.string(), z.object({
    stat: z.string().min(1).max(64),
    baseValue: z.number().min(-9999).max(9999),
  })).default({}),
  combat: z.record(z.string(), z.number().min(0).max(999999)).default({}),
  spawn: z.record(z.string(), z.number().min(0).max(999999)).default({}),
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
  timeline: z.object({
    durationMinutes: z.number().min(1).max(999).default(10),
    specialMinuteStart: z.number().int().min(1).max(999).default(1),
    specialMinuteEnd: z.number().int().min(1).max(999).default(10),
    miniBossOddMinutes: z.boolean().default(true),
    stageBossEvenMinutes: z.boolean().default(true),
    finalCutsceneBossIndex: z.number().int().min(0).max(999).default(4),
    destructiblePropsPerMinute: z.number().int().min(0).max(1000).default(1),
    initialDestructibleProps: z.number().int().min(0).max(1000).default(2),
    cutsceneDuration: z.number().min(0).max(3600).default(5),
  }),
  miniBoss: z.object({
    baseHp: z.number().min(0).max(999999).default(400),
    hpPerMinute: z.number().min(0).max(999999).default(200),
    hpPerMinuteSquared: z.number().min(0).max(999999).default(40),
    playerLevelHpMultiplier: z.number().min(0).max(999999).default(0.15),
    spawnOffset: z.number().min(0).max(999999).default(200),
    speedMultiplier: z.number().min(0).max(999999).default(1.2),
    size: z.number().min(1).max(9999).default(50),
    resonanceDrop: z.number().min(0).max(999999).default(10),
  }),
  tigerGuards: z.object({
    triggerMinutes: z.array(z.number().int().min(1).max(999)).default([3, 6, 9]),
    orbitRadiusBase: z.number().min(0).max(999999).default(180),
    orbitRadiusPerMinuteAfter3: z.number().min(0).max(999999).default(15),
    bodySpacing: z.number().min(1).max(999999).default(38),
    spawnRadiusPadding: z.number().min(0).max(999999).default(200),
    baseHp: z.number().min(0).max(999999).default(5),
    hpPerMinute: z.number().min(0).max(999999).default(2),
    hpPerStage: z.number().min(0).max(999999).default(2),
    playerLevelHpMultiplier: z.number().min(0).max(999999).default(0.15),
  }),
  swarm: z.object({
    startMinute: z.number().int().min(1).max(999).default(1),
    endMinute: z.number().int().min(1).max(999).default(9),
    baseLayers: z.number().int().min(0).max(999).default(3),
    layerPerMinutes: z.number().min(1).max(999).default(2),
    maxLayers: z.number().int().min(1).max(999).default(6),
    countPerLayerBase: z.number().int().min(0).max(9999).default(20),
    countPerLayerRandom: z.number().int().min(0).max(9999).default(10),
    spacingX: z.number().min(0).max(999999).default(30),
    spacingY: z.number().min(0).max(999999).default(40),
    depthOffsetBase: z.number().min(0).max(999999).default(50),
    jitter: z.number().min(0).max(999999).default(5),
    cavalryMainChance: z.number().min(0).max(1).default(0.5),
    cavalryChanceWhenMain: z.number().min(0).max(1).default(0.8),
    cavalryChanceWhenSupport: z.number().min(0).max(1).default(0.2),
    cavalryBaseHp: z.number().min(0).max(999999).default(3),
    cavalryHpPerWave: z.number().min(0).max(999999).default(1),
    cavalrySpeedBase: z.number().min(0).max(999999).default(2.5),
    cavalrySpeedRandom: z.number().min(0).max(999999).default(0.5),
    spearmanBaseHp: z.number().min(0).max(999999).default(5),
    spearmanHpPerWave: z.number().min(0).max(999999).default(2),
    spearmanSpeedBase: z.number().min(0).max(999999).default(2),
    spearmanSpeedRandom: z.number().min(0).max(999999).default(0.2),
    playerLevelHpMultiplier: z.number().min(0).max(999999).default(0.15),
    mobSize: z.number().min(1).max(9999).default(16),
    cavalryExp: z.number().min(0).max(999999).default(1),
    spearmanExp: z.number().min(0).max(999999).default(2),
  }),
  finalBoss: z.object({
    phantomCount: z.number().int().min(0).max(100).default(4),
    phantomDistance: z.number().min(0).max(999999).default(150),
    phantomHpMultiplier: z.number().min(0).max(1).default(0.4),
    phantomSize: z.number().min(1).max(9999).default(30),
  }),
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
export type WeaponLevelConfig = z.infer<typeof WeaponLevelSchema>;
export type RawConfig = z.infer<typeof RawConfigSchema>;
export type ValidationIssue = z.ZodIssue;
