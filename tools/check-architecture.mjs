import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const failures = [];

function fail(message) {
  failures.push(message);
}

function readText(relativePath) {
  return readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function assertSpecFilesArePureJson() {
  const specDir = path.join(rootDir, 'src', 'spec');
  for (const fileName of readdirSync(specDir)) {
    if (!fileName.endsWith('.json')) {
      fail(`src/spec contains non-JSON file: ${fileName}`);
      continue;
    }

    const filePath = path.join(specDir, fileName);
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
      const text = JSON.stringify(parsed);
      if (/\bfunction\b|=>/.test(text)) {
        fail(`src/spec/${fileName} contains function-like text`);
      }
    } catch (error) {
      fail(`src/spec/${fileName} is invalid JSON: ${error.message}`);
    }
  }
}

function assertSystemBoundaries() {
  const systemsDir = path.join(rootDir, 'src', 'systems');
  for (const fileName of readdirSync(systemsDir)) {
    if (!fileName.endsWith('.ts')) continue;

    const relativePath = path.join('src', 'systems', fileName);
    const text = readText(relativePath);
    const lines = text.split(/\r?\n/);
    if (lines.length > 100) {
      fail(`${relativePath} exceeds 100 lines (${lines.length})`);
    }
    if (/\bctx\s*\./.test(text)) {
      fail(`${relativePath} contains direct Canvas ctx calls`);
    }
  }
}

function assertWeaponEffectWhitelist() {
  const text = readText(path.join('src', 'effects', 'weaponEffects.ts'));
  if (!text.includes('WEAPON_EFFECT_WHITELIST')) {
    fail('src/effects/weaponEffects.ts does not export WEAPON_EFFECT_WHITELIST');
  }
  for (const type of ['melee_arc', 'projectile', 'orbit_entity', 'area_pulse', 'persistent_area']) {
    if (!text.includes(`'${type}'`)) {
      fail(`WEAPON_EFFECT_WHITELIST is missing ${type}`);
    }
  }
}

function assertBackupPreserved() {
  const backupPath = path.join(rootDir, 'backup', 'game.js');
  if (!existsSync(backupPath)) {
    fail('backup/game.js is missing');
    return;
  }

  const sourcePath = 'D:\\Claude code\\.claude\\games\\时空骇客过五关\\game_mvp\\old_backup\\game.js';
  if (existsSync(sourcePath) && sha256(backupPath) !== sha256(sourcePath)) {
    fail('backup/game.js differs from the original old_backup/game.js');
  }
}

assertSpecFilesArePureJson();
assertSystemBoundaries();
assertWeaponEffectWhitelist();
assertBackupPreserved();

if (failures.length > 0) {
  console.error('Architecture check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Architecture check OK');
