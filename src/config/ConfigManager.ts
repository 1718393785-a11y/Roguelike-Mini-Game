import { RawConfigSchema, type RawConfig, type ValidationIssue, type WeaponConfig } from './Schema';
import { LastKnownGood } from './LastKnownGood';

export type LoadResult =
  | { ok: true; config: RawConfig }
  | { ok: false; errors: ValidationIssue[]; rolledBack: boolean };

export class ConfigManager {
  private currentConfig: RawConfig | null = null;
  private lastErrors: ValidationIssue[] = [];

  constructor(private readonly lastKnownGood = new LastKnownGood()) {}

  async loadConfig(config: unknown): Promise<LoadResult> {
    const parsed = RawConfigSchema.safeParse(config);
    if (!parsed.success) {
      this.lastErrors = parsed.error.issues;
      return { ok: false, errors: this.lastErrors, rolledBack: this.rollback() };
    }

    try {
      this.stageConfig(parsed.data);
      this.commitConfig(parsed.data);
      return { ok: true, config: parsed.data };
    } catch {
      return { ok: false, errors: this.lastErrors, rolledBack: this.rollback() };
    }
  }

  async updateWeapon(weaponId: string, patch: Partial<WeaponConfig>): Promise<boolean> {
    if (!this.currentConfig || !this.currentConfig.weapons[weaponId]) return false;
    const nextConfig: RawConfig = structuredClone(this.currentConfig);
    nextConfig.weapons[weaponId] = { ...nextConfig.weapons[weaponId], ...patch };
    const result = await this.loadConfig(nextConfig);
    return result.ok;
  }

  rollback(): boolean {
    const previous = this.lastKnownGood.load();
    if (!previous) return false;
    this.currentConfig = previous;
    return true;
  }

  getLastErrors(): ValidationIssue[] {
    return this.lastErrors;
  }

  teardownAllConfigDerivedInstances(): void {
    // Stage 1 defines the poison-pill boundary. Runtime teardown hooks are wired in Stage 5.
  }

  getConfig(): RawConfig | null {
    return this.currentConfig;
  }

  private stageConfig(config: RawConfig): void {
    if (!config.weapons || !config.enemies || !config.balance || !config.waves || !config.effects) {
      throw new Error('Incomplete staged config');
    }
  }

  private commitConfig(config: RawConfig): void {
    this.teardownAllConfigDerivedInstances();
    this.currentConfig = structuredClone(config);
    this.lastKnownGood.save(config);
    this.lastErrors = [];
  }
}
