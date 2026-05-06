/**
 * 资源加载器 - 零停机重构项目
 * 支持动态加载武器/敌人/技能/UI等美术资源
 * 支持根据等级自动选择对应图标
 * 支持优雅降级机制
 */

export interface AssetMapping {
  project: string;
  mapping_version: string;
  last_updated: string;
  base_path: string;

  weapons: {
    [weaponId: string]: {
      name: string;
      [level: string]: string;
    };
  };

  enemies: {
    [enemyId: string]: {
      name: string;
      path: string;
      size: number;
    };
  };

  bosses: {
    [bossId: string]: {
      name: string;
      stage: number;
      path: string;
      size: number;
    };
  };

  skills: {
    [skillId: string]: {
      name: string;
      path: string;
      effect: string;
    };
  };

  ui: {
    [key: string]: string;
  };

  pickups: {
    [key: string]: string;
  };
}

export class AssetLoader {
  private mapping: AssetMapping | null = null;
  private cache: Map<string, HTMLImageElement> = new Map();
  private fallback: HTMLImageElement | null = null;
  private basePath: string = '';

  async initialize(mappingUrl: string = 'asset-mapping-template.json'): Promise<void> {
    try {
      const response = await fetch(mappingUrl);
      this.mapping = await response.json();
      this.basePath = this.mapping?.base_path || 'assets/';

      // 预加载占位图
      this.fallback = await this.createFallbackImage();

      console.log(`✅ AssetLoader initialized: ${this.getAssetCount()} assets available`);
    } catch (error) {
      console.error('❌ AssetLoader initialization failed:', error);
      throw error;
    }
  }

  /**
   * 获取武器图标 - 自动选择等级
   * 优先找对应等级图标 -> 降级到 Lv.1 -> 返回占位图
   */
  getWeaponSprite(weaponId: string, level: number = 1): HTMLImageElement {
    if (!this.mapping) return this.getFallback();

    const weapon = this.mapping.weapons[weaponId];
    if (!weapon) return this.getFallback();

    const effectiveLevel = Math.min(Math.max(level, 1), 6);
    const path = weapon[effectiveLevel.toString()] || weapon['1'];

    return path ? this.loadAndCache(this.basePath + path) : this.getFallback();
  }

  /**
   * 获取终极形态图标 (Lv.6)
   */
  getUltimateWeaponSprite(weaponId: string): HTMLImageElement {
    return this.getWeaponSprite(weaponId, 6);
  }

  /**
   * 获取敌人精灵
   */
  getEnemySprite(enemyId: string): HTMLImageElement {
    if (!this.mapping) return this.getFallback();

    const enemy = this.mapping.enemies[enemyId];
    return enemy ? this.loadAndCache(this.basePath + enemy.path) : this.getFallback();
  }

  /**
   * 获取Boss精灵
   */
  getBossSprite(bossId: string): HTMLImageElement {
    if (!this.mapping) return this.getFallback();

    const boss = this.mapping.bosses[bossId];
    return boss ? this.loadAndCache(this.basePath + boss.path) : this.getFallback();
  }

  /**
   * 获取被动技能图标
   */
  getSkillIcon(skillId: string): HTMLImageElement {
    if (!this.mapping) return this.getFallback();

    const skill = this.mapping.skills[skillId];
    return skill ? this.loadAndCache(this.basePath + skill.path) : this.getFallback();
  }

  /**
   * 获取UI资源
   */
  getUI(uiKey: string): HTMLImageElement {
    if (!this.mapping) return this.getFallback();

    const path = this.mapping.ui[uiKey];
    return path ? this.loadAndCache(this.basePath + path) : this.getFallback();
  }

  /**
   * 获取拾取物图标
   */
  getPickupSprite(pickupId: string): HTMLImageElement {
    if (!this.mapping) return this.getFallback();

    const path = this.mapping.pickups[pickupId];
    return path ? this.loadAndCache(this.basePath + path) : this.getFallback();
  }

  /**
   * 预加载所有武器图标（建议在加载界面时调用）
   */
  async preloadAllWeapons(): Promise<void> {
    if (!this.mapping) return;

    const allPaths: string[] = [];
    for (const weapon of Object.values(this.mapping.weapons)) {
      for (let l = 1; l <= 6; l++) {
        const path = weapon[l.toString()];
        if (path) allPaths.push(this.basePath + path);
      }
    }

    await Promise.allSettled(allPaths.map(p => this.preloadSingle(p)));
    console.log(`✅ Preloaded ${allPaths.length} weapon sprites`);
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { total: number; cached: number } {
    return {
      total: this.getAssetCount(),
      cached: this.cache.size
    };
  }

  private getFallback(): HTMLImageElement {
    return this.fallback || this.createFallbackSync();
  }

  private loadAndCache(path: string): HTMLImageElement {
    if (this.cache.has(path)) {
      return this.cache.get(path)!;
    }

    const img = new Image();
    img.src = path;
    this.cache.set(path, img);
    return img;
  }

  private async preloadSingle(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.cache.set(path, img);
        resolve();
      };
      img.onerror = reject;
      img.src = path;
    });
  }

  private async createFallbackImage(): Promise<HTMLImageElement> {
    return new Promise(resolve => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;

      // 绘制简单的占位
      ctx.fillStyle = '#333';
      ctx.fillRect(0, 0, 64, 64);
      ctx.fillStyle = '#666';
      ctx.fillRect(2, 2, 60, 60);
      ctx.fillStyle = '#fff';
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', 32, 40);

      const img = new Image();
      img.src = canvas.toDataURL();
      img.onload = () => resolve(img);
    });
  }

  private createFallbackSync(): HTMLImageElement {
    const img = new Image();
    img.width = 64;
    img.height = 64;
    return img;
  }

  private getAssetCount(): number {
    if (!this.mapping) return 0;

    return (
      Object.keys(this.mapping.weapons).length * 6 +
      Object.keys(this.mapping.enemies).length +
      Object.keys(this.mapping.bosses).length +
      Object.keys(this.mapping.skills).length +
      Object.keys(this.mapping.ui).length +
      Object.keys(this.mapping.pickups).length
    );
  }
}

// 单例导出
export const assetLoader = new AssetLoader();
