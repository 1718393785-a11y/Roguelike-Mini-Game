import { RawConfigSchema, type RawConfig, type ValidationIssue, type WeaponConfig } from './Schema';
import { LastKnownGood } from './LastKnownGood';

export type LoadResult =
  | { ok: true; config: RawConfig; poisonPill: number }
  | { ok: false; errors: ValidationIssue[]; rolledBack: boolean };

export type ConfigTeardownReason = 'config_commit' | 'rollback';

export interface ConfigTeardownContext {
  readonly reason: ConfigTeardownReason;
  readonly poisonPill: number;
}

export type ConfigTeardownHook = (context: ConfigTeardownContext) => void;

export class ConfigManager {
  private currentConfig: RawConfig | null = null;
  private lastErrors: ValidationIssue[] = [];
  private poisonPill = 0;
  private readonly teardownHooks = new Set<ConfigTeardownHook>();

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
      return { ok: true, config: parsed.data, poisonPill: this.poisonPill };
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
    this.teardownAllConfigDerivedInstances('rollback');
    this.currentConfig = previous;
    return true;
  }

  getLastErrors(): ValidationIssue[] {
    return this.lastErrors;
  }

  registerTeardownHook(hook: ConfigTeardownHook): () => void {
    this.teardownHooks.add(hook);
    return () => this.teardownHooks.delete(hook);
  }

  getPoisonPill(): number {
    return this.poisonPill;
  }

  assertFresh(poisonPill: number): void {
    if (poisonPill !== this.poisonPill) {
      throw new Error(`Stale config-derived instance: ${poisonPill} !== ${this.poisonPill}`);
    }
  }

  teardownAllConfigDerivedInstances(reason: ConfigTeardownReason = 'config_commit'): void {
    this.poisonPill++;
    const context = { reason, poisonPill: this.poisonPill };
    for (const hook of this.teardownHooks) {
      hook(context);
    }
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
    this.teardownAllConfigDerivedInstances('config_commit');
    this.currentConfig = structuredClone(config);
    this.lastKnownGood.save(config);
    this.lastErrors = [];
  }
}
