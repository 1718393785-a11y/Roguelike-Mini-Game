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
  private levelConfig: WeaponLevelConfig;

  constructor(private readonly config: WeaponConfig, level = 1) {
    this.levelConfig = this.findLevel(level);
    for (const effect of [...config.effects, ...this.levelConfig.effects]) {
      assertWhitelistedEffect(effect.type);
    }
  }

  get id(): string {
    return this.config.id;
  }

  get level(): number {
    return this.levelConfig.level;
  }

  setLevel(level: number): void {
    this.levelConfig = this.findLevel(level);
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
    const direct = this.levelConfig.numericPatches[key];
    if (typeof direct === 'number') {
      value = direct;
    }
    const additive = this.levelConfig.numericPatches[`${key}Add`];
    if (typeof additive === 'number') {
      value += additive;
    }
    const multiplier = this.levelConfig.numericPatches[`${key}Multiplier`];
    if (typeof multiplier === 'number') {
      value *= multiplier;
    }
    return value;
  }

  getEffects(): readonly WeaponEffectType[] {
    return [...this.config.effects, ...this.levelConfig.effects].map(effect => effect.type);
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

  private findLevel(level: number): WeaponLevelConfig {
    return this.config.levels.find(item => item.level === level) ?? this.config.levels[0];
  }
}
