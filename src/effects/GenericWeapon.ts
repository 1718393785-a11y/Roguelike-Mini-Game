import type { WeaponConfig, WeaponLevelConfig } from '../config/Schema';
import { assertWhitelistedEffect, type WeaponEffectType } from './weaponEffects';

export interface GenericWeaponRuntimeStats {
  readonly id: string;
  readonly level: number;
  readonly damage: number;
  readonly attackInterval: number;
  readonly dpsEstimate: number;
  readonly elapsed: number;
}

export class GenericWeapon {
  private elapsed = 0;
  private currentLevel: number;

  constructor(private readonly config: WeaponConfig, level = 1) {
    this.currentLevel = this.clampLevel(level);
    for (const effect of this.getEffectConfigs()) {
      assertWhitelistedEffect(effect.type);
    }
  }

  get id(): string {
    return this.config.id;
  }

  get level(): number {
    return this.currentLevel;
  }

  setLevel(level: number): void {
    this.currentLevel = this.clampLevel(level);
  }

  updateClock(deltaTime: number): void {
    this.elapsed += deltaTime;
  }

  consumeAttackReady(): boolean {
    const interval = this.resolveNumber('attackInterval', this.config.attackInterval);
    if (this.elapsed < interval) return false;
    this.elapsed -= interval;
    return true;
  }

  resolveNumber(key: string, fallback: number): number {
    const param = this.config.params[key];
    let value = typeof param === 'number' ? param : fallback;
    for (const levelConfig of this.getAppliedLevels()) {
      const direct = levelConfig.numericPatches[key];
      if (typeof direct === 'number') {
        value = direct;
      }
      const additive = levelConfig.numericPatches[`${key}Add`];
      if (typeof additive === 'number') {
        value += additive;
      }
      const multiplier = levelConfig.numericPatches[`${key}Multiplier`];
      if (typeof multiplier === 'number') {
        value *= multiplier;
      }
    }
    return value;
  }

  getEffects(): readonly WeaponEffectType[] {
    return this.getEffectConfigs().map(effect => effect.type);
  }

  snapshot(): GenericWeaponRuntimeStats {
    const damage = this.resolveNumber('damage', this.config.damage);
    const attackInterval = this.resolveNumber('attackInterval', this.config.attackInterval);
    return {
      id: this.id,
      level: this.level,
      damage,
      attackInterval,
      dpsEstimate: attackInterval > 0 ? damage / attackInterval : 0,
      elapsed: this.elapsed,
    };
  }

  private clampLevel(level: number): number {
    const maxLevel = Math.max(...this.config.levels.map(item => item.level));
    return Math.max(1, Math.min(level, maxLevel));
  }

  private getAppliedLevels(): WeaponLevelConfig[] {
    return this.config.levels
      .filter(item => item.level <= this.currentLevel)
      .sort((a, b) => a.level - b.level);
  }

  private getEffectConfigs(): Array<{ type: WeaponEffectType; params: Record<string, unknown> }> {
    return [...this.config.effects, ...this.getAppliedLevels().flatMap(level => level.effects)];
  }
}
