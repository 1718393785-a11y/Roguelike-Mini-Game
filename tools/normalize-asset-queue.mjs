import fs from 'node:fs';
import path from 'node:path';

const sourcePath = path.resolve('assets/source/game_desginer/asset-generation-queue.json');
const outDir = path.resolve('assets/prompts');
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });

const buckets = new Map();
const CATEGORY_NAMES = {
  weapon: 'weapons',
  enemy: 'enemies',
  boss: 'bosses',
  skill: 'skills',
  pickup: 'pickups',
  ui: 'ui',
};

function parseSize(size) {
  const match = String(size || '').match(/^(\d+)x(\d+)$/);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

function outputFor(item) {
  if (item.category === 'weapon') {
    const suffix = item.is_ultimate ? `_lv${item.level}_ultimate` : `_lv${item.level}`;
    return `assets/weapons/asset_weapon_${item.weapon_id}${suffix}.png`;
  }
  if (item.category === 'enemy') return `assets/enemies/asset_enemy_${item.enemy_id}_idle_01.png`;
  if (item.category === 'boss') return `assets/bosses/asset_boss_${item.boss_id}_idle_01.png`;
  if (item.category === 'skill') return `assets/skills/asset_skill_${item.skill_id}.png`;
  if (item.category === 'pickup') return `assets/pickups/${item.filename}`;
  if (item.category === 'ui') return `assets/ui/${item.filename}`;
  return `assets/misc/${item.filename}`;
}

for (const item of source.queue || []) {
  const category = CATEGORY_NAMES[item.category] || `${item.category}s`;
  if (!buckets.has(category)) buckets.set(category, []);
  buckets.get(category).push({
    id: item.weapon_id || item.enemy_id || item.boss_id || item.skill_id || item.ui_id || item.pickup_id,
    category: item.category,
    level: item.level ?? null,
    output: outputFor(item),
    sourceSize: parseSize(item.size),
    prompt: item.prompt,
    negativePrompt: item.negative_prompt,
    requiresTransparency: true,
    tags: item.is_ultimate ? ['ultimate'] : [],
  });
}

const requiredEmpty = ['player', 'effects', 'tiles'];
for (const category of requiredEmpty) {
  if (!buckets.has(category)) buckets.set(category, []);
}

for (const [category, entries] of buckets) {
  fs.writeFileSync(
    path.join(outDir, `${category}.prompts.json`),
    JSON.stringify({ category, entries }, null, 2),
  );
}

console.log(JSON.stringify({
  ok: true,
  sourceItems: source.queue?.length || 0,
  outputs: [...buckets.entries()].map(([category, entries]) => ({ category, count: entries.length })),
}, null, 2));
