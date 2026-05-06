import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const allowMissing = process.argv.includes('--allow-missing');
const manifestPath = path.join(root, 'assets', 'asset-manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const issues = [];
const refs = [];

function addRef(value, label) {
  if (!value) return;
  refs.push({ value, label });
}

function collectFrames(group, prefix) {
  for (const [id, states] of Object.entries(group || {})) {
    for (const [state, entry] of Object.entries(states || {})) {
      for (const frame of entry.frames || []) {
        addRef(frame, `${prefix}.${id}.${state}`);
      }
      addRef(entry.src, `${prefix}.${id}.${state}`);
    }
  }
}

for (const [id, weapon] of Object.entries(manifest.weapons || {})) {
  for (const [level, entry] of Object.entries(weapon.levels || {})) {
    addRef(entry.src, `weapons.${id}.${level}`);
  }
}
for (const [id, entry] of Object.entries(manifest.skills || {})) addRef(entry.src, `skills.${id}`);
for (const [id, entry] of Object.entries(manifest.pickups || {})) addRef(entry.src, `pickups.${id}`);
for (const [id, entry] of Object.entries(manifest.effects || {})) addRef(entry.src, `effects.${id}`);
for (const [id, entry] of Object.entries(manifest.ui || {})) addRef(entry.src, `ui.${id}`);
for (const [id, entry] of Object.entries(manifest.tiles || {})) addRef(entry.src, `tiles.${id}`);
for (const [id, entry] of Object.entries(manifest.styleProofs || {})) addRef(entry.src, `styleProofs.${id}`);
collectFrames(manifest.player, 'player');
collectFrames(manifest.enemies, 'enemies');
collectFrames(manifest.bosses, 'bosses');

for (const ref of refs) {
  if (ref.value.includes('..') || path.isAbsolute(ref.value)) {
    issues.push(`UNSAFE_PATH ${ref.label}: ${ref.value}`);
    continue;
  }
  const abs = path.join(root, manifest.basePath || 'assets', ref.value);
  if (!fs.existsSync(abs)) {
    if (!allowMissing) issues.push(`MISSING ${ref.label}: ${ref.value}`);
    continue;
  }
  const ext = path.extname(abs).toLowerCase();
  if (!['.png', '.webp', '.json'].includes(ext)) {
    issues.push(`BAD_EXT ${ref.label}: ${ref.value}`);
  }
  const stat = fs.statSync(abs);
  if (stat.size === 0) issues.push(`EMPTY ${ref.label}: ${ref.value}`);
}

const result = {
  ok: issues.length === 0,
  allowMissing,
  references: refs.length,
  issues,
};

console.log(JSON.stringify(result, null, 2));
if (issues.length > 0) process.exit(1);
