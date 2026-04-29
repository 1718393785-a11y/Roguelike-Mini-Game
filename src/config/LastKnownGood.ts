import type { RawConfig } from './Schema';

const STORAGE_KEY = 'chronosHackerLastKnownGoodConfig';

export class LastKnownGood {
  private memoryConfig: RawConfig | null = null;

  save(config: RawConfig): void {
    this.memoryConfig = structuredClone(config);
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  load(): RawConfig | null {
    if (this.memoryConfig) return structuredClone(this.memoryConfig);
    if (typeof localStorage === 'undefined') return null;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as RawConfig;
  }
}
