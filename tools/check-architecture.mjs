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

function extractStringArray(text, constName) {
  const match = text.match(new RegExp(`const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map(item => item[1]);
}

function assertSystemOrderMatchesRuntime() {
  const runtimeOrder = extractStringArray(readText('game.js'), 'LEGACY_SYSTEM_EXECUTION_ORDER');
  const tsOrder = extractStringArray(readText(path.join('src', 'systems', 'System.ts')), 'SYSTEM_EXECUTION_ORDER');
  if (!runtimeOrder || !tsOrder) {
    fail('Could not read runtime or TypeScript System execution order');
    return;
  }
  if (JSON.stringify(runtimeOrder) !== JSON.stringify(tsOrder)) {
    fail(`System execution order mismatch: runtime=${runtimeOrder.join(',')} ts=${tsOrder.join(',')}`);
  }
}

function assertGenericWeaponMigrationStatus() {
  const text = readText(path.join('src', 'effects', 'migrationStatus.ts'));
  for (const weaponId of ['saber', 'spear', 'crossbow', 'qinggang', 'shield', 'taiping']) {
    if (!text.includes(`${weaponId}:`)) {
      fail(`Generic weapon migration status is missing ${weaponId}`);
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
assertSystemOrderMatchesRuntime();
assertGenericWeaponMigrationStatus();
assertBackupPreserved();

if (failures.length > 0) {
  console.error('Architecture check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Architecture check OK');
