import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ConfigManager } from './ConfigManager';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const specDir = path.join(root, 'spec');

async function readJson(fileName: string): Promise<unknown> {
  const raw = await fs.readFile(path.join(specDir, fileName), 'utf8');
  return JSON.parse(raw);
}

async function main(): Promise<void> {
  const rawConfig = {
    weapons: await readJson('weapons.json'),
    enemies: await readJson('enemies.json'),
    balance: await readJson('balance.json'),
    waves: await readJson('waves.json'),
    effects: await readJson('effects.json'),
  };
  const manager = new ConfigManager();
  const result = await manager.loadConfig(rawConfig);
  if (!result.ok) {
    console.error(JSON.stringify(result.errors, null, 2));
    process.exitCode = 1;
    return;
  }
  console.log('Config validation OK');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
