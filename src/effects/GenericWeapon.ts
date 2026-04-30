import type { WeaponConfig, WeaponLevelConfig } from '../config/Schema';
import { assertWhitelistedEffect, type WeaponEffectType } from './weaponEffects';

export interface GenericWeaponRuntimeStats {
  readonly id: string;
  readonly level: number;
  readonly damage: number;
  readonly attackInterval: number;
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
    const interval = this.getNumber('attackInterval', this.config.attackInterval);
    if (this.elapsed < interval) return false;
    this.elapsed -= interval;
    return true;
  }

  getNumber(key: string, fallback: number): number {
    const patched = this.levelConfig.numericPatches[key];
    if (typeof patched === 'number') return patched;
    const param = this.config.params[key];
    return typeof param === 'number' ? param : fallback;
  }

  getEffects(): readonly WeaponEffectType[] {
    return [...this.config.effects, ...this.levelConfig.effects].map(effect => effect.type);
  }

  snapshot(): GenericWeaponRuntimeStats {
    return {
      id: this.id,
      level: this.level,
      damage: this.getNumber('damage', this.config.damage),
      attackInterval: this.getNumber('attackInterval', this.config.attackInterval),
      elapsed: this.elapsed,
    };
  }

  private findLevel(level: number): WeaponLevelConfig {
    return this.config.levels.find(item => item.level === level) ?? this.config.levels[0];
  }
}
