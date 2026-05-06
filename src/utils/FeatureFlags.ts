export const FEATURE_FLAGS = {
  ENABLE_JSON_CONFIG: false,
  ENABLE_SYSTEM_SPLIT: false,
  ENABLE_GENERIC_WEAPON: false,
  ENABLE_PIXI_RENDERER: false,
  ENABLE_HOT_RELOAD: false,
  ENABLE_PLAYER_IFRAME: false,
  ENABLE_HIT_KNOCKBACK: false,
} as const;

export type FeatureFlagName = keyof typeof FEATURE_FLAGS;
