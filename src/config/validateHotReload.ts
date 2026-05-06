import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigManager, type ConfigTeardownContext } from './ConfigManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const specDir = path.join(root, 'spec');

async function readJson(fileName: string): Promise<unknown> {
  const raw = await fs.readFile(path.join(specDir, fileName), 'utf8');
  return JSON.parse(raw);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function readRawConfig(): Promise<Record<string, unknown>> {
  return {
    weapons: await readJson('weapons.json'),
    enemies: await readJson('enemies.json'),
    balance: await readJson('balance.json'),
    waves: await readJson('waves.json'),
    effects: await readJson('effects.json'),
  };
}

async function main(): Promise<void> {
  const manager = new ConfigManager();
  const teardownContexts: ConfigTeardownContext[] = [];
  const unsubscribe = manager.registerTeardownHook(context => {
    teardownContexts.push(context);
  });

  const rawConfig = await readRawConfig();
  const first = await manager.loadConfig(rawConfig);
  assert(first.ok, 'initial config should load');
  assert(first.poisonPill === 1, 'initial commit should issue poison pill 1');
  assert(teardownContexts.length === 1, 'initial commit should notify teardown boundary');
  manager.assertFresh(first.poisonPill);

  const updated = await manager.updateWeapon('saber', { damage: 999 });
  assert(updated, 'valid weapon hot update should commit');
  assert(manager.getPoisonPill() === 2, 'hot update should advance poison pill');
  assert(teardownContexts.at(-1)?.reason === 'config_commit', 'hot update should use config_commit reason');

  let staleRejected = false;
  try {
    manager.assertFresh(first.poisonPill);
  } catch {
    staleRejected = true;
  }
  assert(staleRejected, 'old config-derived instances must be rejected after hot update');

  const invalidConfig = structuredClone(manager.getConfig());
  assert(invalidConfig, 'manager should keep current config');
  invalidConfig.weapons.saber.id = '';
  const invalid = await manager.loadConfig(invalidConfig);
  assert(!invalid.ok, 'invalid hot update should fail validation');
  assert(invalid.rolledBack, 'invalid hot update should roll back to last known good');
  assert(manager.getPoisonPill() === 3, 'rollback should advance poison pill');
  assert(teardownContexts.at(-1)?.reason === 'rollback', 'rollback should notify runtime teardown');
  assert(manager.getConfig()?.weapons.saber.damage === 999, 'rollback should restore last known good config');

  unsubscribe();
  console.log('Hot reload validation OK');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
