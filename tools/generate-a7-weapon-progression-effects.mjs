import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const assetRoot = path.join(root, 'assets');
const weaponDir = path.join(assetRoot, 'weapons');
const effectDir = path.join(assetRoot, 'effects');
const proofDir = path.join(assetRoot, 'style-proofs');

for (const dir of [weaponDir, effectDir, proofDir]) fs.mkdirSync(dir, { recursive: true });

const WEAPONS = [
  { id: 'saber', name: '百炼环首刀', color: '#ff8a3d', accent: '#fff2a0', energy: '#49f5ff', motif: 'saber' },
  { id: 'spear', name: '青龙偃月枪', color: '#8ce7ff', accent: '#f6f0c0', energy: '#af6cff', motif: 'spear' },
  { id: 'crossbow', name: '诸葛连弩', color: '#b56cff', accent: '#ffd86b', energy: '#5ff3ff', motif: 'crossbow' },
  { id: 'qinggang', name: '青釭剑阵', color: '#43f1d4', accent: '#eaffff', energy: '#5b9cff', motif: 'qinggang' },
  { id: 'shield', name: '玄武护阵', color: '#ffd15a', accent: '#fff4b8', energy: '#ff6a3d', motif: 'shield' },
  { id: 'taiping', name: '太平火卷', color: '#ff563d', accent: '#ffde7a', energy: '#ff9b2f', motif: 'taiping' },
];

const EFFECTS = [
  { id: 'saber_arc', file: 'asset_effect_saber_arc.png', sourceSize: [512, 512], weapon: 'saber' },
  { id: 'spear_stab', file: 'asset_effect_spear_stab.png', sourceSize: [512, 512], weapon: 'spear' },
  { id: 'crossbow_arrow', file: 'asset_effect_crossbow_arrow.png', sourceSize: [512, 512], weapon: 'crossbow' },
  { id: 'qinggang_orbit', file: 'asset_effect_qinggang_orbit.png', sourceSize: [512, 512], weapon: 'qinggang' },
  { id: 'shield_pulse', file: 'asset_effect_shield_pulse.png', sourceSize: [512, 512], weapon: 'shield' },
  { id: 'taiping_tornado', file: 'asset_effect_taiping_tornado.png', sourceSize: [512, 512], weapon: 'taiping' },
];

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function blendPixel(png, x, y, color, alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= png.width || y >= png.height || alpha <= 0) return;
  const index = (png.width * y + x) << 2;
  const srcA = Math.max(0, Math.min(255, alpha * 255));
  const dstA = png.data[index + 3];
  const outA = srcA + dstA * (1 - srcA / 255);
  if (outA <= 0) return;
  png.data[index] = clampByte((color.r * srcA + png.data[index] * dstA * (1 - srcA / 255)) / outA);
  png.data[index + 1] = clampByte((color.g * srcA + png.data[index + 1] * dstA * (1 - srcA / 255)) / outA);
  png.data[index + 2] = clampByte((color.b * srcA + png.data[index + 2] * dstA * (1 - srcA / 255)) / outA);
  png.data[index + 3] = clampByte(outA);
}

function circle(png, cx, cy, radius, hex, alpha = 1) {
  const color = hexToRgb(hex);
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius) {
        blendPixel(png, x, y, color, alpha * Math.min(1, radius - d + 1));
      }
    }
  }
}

function radialGlow(png, cx, cy, radius, hex, alpha = 1, squeezeY = 1) {
  const color = hexToRgb(hex);
  for (let y = Math.floor(cy - radius * squeezeY); y <= Math.ceil(cy + radius * squeezeY); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx;
      const dy = (y - cy) / squeezeY;
      const d = Math.hypot(dx, dy);
      if (d <= radius) {
        const t = 1 - d / radius;
        blendPixel(png, x, y, color, alpha * t * t);
      }
    }
  }
}

function line(png, x1, y1, x2, y2, width, hex, alpha = 1) {
  const color = hexToRgb(hex);
  const minX = Math.floor(Math.min(x1, x2) - width);
  const maxX = Math.ceil(Math.max(x1, x2) + width);
  const minY = Math.floor(Math.min(y1, y2) - width);
  const maxY = Math.ceil(Math.max(y1, y2) + width);
  const vx = x2 - x1;
  const vy = y2 - y1;
  const lenSq = vx * vx + vy * vy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = Math.max(0, Math.min(1, ((x - x1) * vx + (y - y1) * vy) / lenSq));
      const px = x1 + vx * t;
      const py = y1 + vy * t;
      const d = Math.hypot(x - px, y - py);
      if (d <= width) blendPixel(png, x, y, color, alpha * Math.min(1, width - d + 1));
    }
  }
}

function polygon(png, points, hex, alpha = 1) {
  const color = hexToRgb(hex);
  const minX = Math.floor(Math.min(...points.map(point => point[0])));
  const maxX = Math.ceil(Math.max(...points.map(point => point[0])));
  const minY = Math.floor(Math.min(...points.map(point => point[1])));
  const maxY = Math.ceil(Math.max(...points.map(point => point[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) blendPixel(png, x, y, color, alpha);
    }
  }
}

function ring(png, cx, cy, radius, width, hex, alpha = 1, squeezeY = 1) {
  const color = hexToRgb(hex);
  for (let y = Math.floor(cy - radius * squeezeY - width); y <= Math.ceil(cy + radius * squeezeY + width); y++) {
    for (let x = Math.floor(cx - radius - width); x <= Math.ceil(cx + radius + width); x++) {
      const dx = x - cx;
      const dy = (y - cy) / squeezeY;
      const d = Math.hypot(dx, dy);
      const dist = Math.abs(d - radius);
      if (dist <= width) blendPixel(png, x, y, color, alpha * Math.min(1, width - dist + 1));
    }
  }
}

function arc(png, cx, cy, radius, start, end, width, hex, alpha = 1, squeezeY = 1) {
  const steps = Math.max(20, Math.ceil(Math.abs(end - start) * radius / 10));
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = start + (end - start) * t;
    const point = [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius * squeezeY];
    if (prev) line(png, prev[0], prev[1], point[0], point[1], width, hex, alpha * (0.45 + 0.55 * t));
    prev = point;
  }
}

function sampleNearest(src, x, y) {
  const sx = Math.max(0, Math.min(src.width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(src.height - 1, Math.round(y)));
  const index = (src.width * sy + sx) << 2;
  return [src.data[index], src.data[index + 1], src.data[index + 2], src.data[index + 3]];
}

function blitScaled(dst, src, dx, dy, dw, dh, alpha = 1) {
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const [r, g, b, a] = sampleNearest(src, (x / dw) * src.width, (y / dh) * src.height);
      if (a <= 0) continue;
      blendPixel(dst, dx + x, dy + y, { r, g, b }, alpha * (a / 255));
    }
  }
}

function blitBase(dst, src, spec, level) {
  const tint = hexToRgb(spec.color);
  const lift = 1 + level * 0.025;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const index = (src.width * y + x) << 2;
      const a = src.data[index + 3];
      if (a <= 0) continue;
      const amount = Math.min(0.26, level * 0.035);
      const color = {
        r: clampByte(mix(src.data[index], tint.r, amount) * lift),
        g: clampByte(mix(src.data[index + 1], tint.g, amount) * lift),
        b: clampByte(mix(src.data[index + 2], tint.b, amount) * lift),
      };
      blendPixel(dst, x, y, color, a / 255);
    }
  }
}

function addRunes(png, spec, level) {
  const cx = png.width / 2;
  const cy = png.height / 2;
  for (let i = 0; i < level + 3; i++) {
    const angle = -Math.PI / 2 + i * (Math.PI * 2 / (level + 3));
    const r = 202 + (i % 2) * 14;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    line(png, x - Math.cos(angle) * 10, y - Math.sin(angle) * 10, x + Math.cos(angle) * 10, y + Math.sin(angle) * 10, 3, spec.accent, 0.45 + level * 0.06);
    line(png, x - Math.sin(angle) * 8, y + Math.cos(angle) * 8, x + Math.sin(angle) * 8, y - Math.cos(angle) * 8, 2, spec.energy, 0.3 + level * 0.04);
  }
}

function drawIconMotif(png, spec, level) {
  const cx = png.width / 2;
  const cy = png.height / 2;
  const power = level / 6;
  if (spec.motif === 'saber') {
    for (let i = 0; i < Math.min(3, level); i++) {
      arc(png, cx - 14 + i * 8, cy + 18 - i * 10, 118 + i * 18, -0.92, 1.05, 7 + level, i % 2 ? spec.energy : spec.accent, 0.34 + power * 0.42, 0.62);
    }
    line(png, cx - 92, cy + 90, cx + 118, cy - 108, 4 + level, '#ffffff', 0.35 + power * 0.35);
  } else if (spec.motif === 'spear') {
    for (let i = 0; i < Math.min(5, level); i++) {
      const offset = (i - 2) * 16;
      line(png, cx - 116, cy + 84 + offset * 0.4, cx + 130, cy - 92 + offset * 0.25, 4 + level * 0.8, i % 2 ? spec.energy : spec.accent, 0.32 + power * 0.34);
    }
    polygon(png, [[cx + 116, cy - 102], [cx + 168, cy - 126], [cx + 138, cy - 70]], spec.energy, 0.52 + power * 0.28);
  } else if (spec.motif === 'crossbow') {
    for (let i = 0; i < level + 1; i++) {
      const y = cy - 70 + i * (140 / (level + 1));
      line(png, cx - 132, y + 30, cx + 122, y - 24, 3 + level * 0.7, i % 2 ? spec.energy : spec.color, 0.3 + power * 0.4);
      polygon(png, [[cx + 114, y - 28], [cx + 150, y - 42], [cx + 128, y - 6]], spec.accent, 0.45 + power * 0.25);
    }
    ring(png, cx + 72, cy - 32, 42 + level * 4, 3, spec.energy, 0.25 + power * 0.35);
  } else if (spec.motif === 'qinggang') {
    for (let i = 0; i < 2 + Math.floor(level / 2); i++) {
      arc(png, cx, cy, 100 + i * 26, i * 0.82, i * 0.82 + Math.PI * 1.28, 4 + level, i % 2 ? spec.accent : spec.energy, 0.32 + power * 0.32, 0.72);
    }
    for (let i = 0; i < Math.min(6, level + 1); i++) {
      const angle = i * Math.PI * 2 / Math.min(6, level + 1);
      const x = cx + Math.cos(angle) * 128;
      const y = cy + Math.sin(angle) * 94;
      line(png, x - 18, y + 22, x + 22, y - 28, 4, '#ffffff', 0.28 + power * 0.36);
    }
  } else if (spec.motif === 'shield') {
    for (let i = 0; i < 1 + Math.floor(level / 2); i++) {
      ring(png, cx, cy, 104 + i * 34, 5 + level, i % 2 ? spec.energy : spec.accent, 0.26 + power * 0.3, 0.72);
    }
    polygon(png, [[cx, cy - 112], [cx + 92, cy - 48], [cx + 72, cy + 76], [cx, cy + 122], [cx - 72, cy + 76], [cx - 92, cy - 48]], spec.color, 0.12 + power * 0.18);
    line(png, cx - 96, cy + 100, cx + 96, cy + 100, 5 + level, spec.energy, 0.2 + power * 0.35);
  } else if (spec.motif === 'taiping') {
    for (let i = 0; i < 4 + level; i++) {
      const start = i * 0.72 + level * 0.1;
      arc(png, cx, cy, 34 + i * 18, start, start + Math.PI * 0.9, 6 + level * 0.75, i % 2 ? spec.accent : spec.energy, 0.24 + power * 0.36, 0.84);
    }
    radialGlow(png, cx, cy, 92 + level * 14, spec.color, 0.16 + power * 0.2, 1);
  }
}

function makeWeaponIcon(spec, level) {
  const basePath = path.join(weaponDir, `asset_weapon_${spec.id}_lv1.png`);
  if (!fs.existsSync(basePath)) throw new Error(`Missing base weapon icon: ${basePath}`);
  const base = PNG.sync.read(fs.readFileSync(basePath));
  const png = new PNG({ width: 512, height: 512, colorType: 6 });

  radialGlow(png, 256, 256, 226, spec.color, 0.12 + level * 0.025, 0.92);
  radialGlow(png, 256, 256, 164, spec.energy, 0.07 + level * 0.018, 0.78);
  ring(png, 256, 256, 202, 4 + level * 0.6, spec.accent, 0.2 + level * 0.045);
  if (level >= 4) ring(png, 256, 256, 226, 3, spec.energy, 0.16 + level * 0.03);
  if (level >= 5) addRunes(png, spec, level);
  blitBase(png, base, spec, level);
  drawIconMotif(png, spec, level);
  if (level >= 6) {
    ring(png, 256, 256, 238, 5, '#ffffff', 0.24);
    radialGlow(png, 256, 256, 92, '#ffffff', 0.08, 1);
  }
  return png;
}

function makeSaberEffect() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  radialGlow(png, 256, 276, 220, '#ff6a2f', 0.18, 0.55);
  for (let i = 0; i < 7; i++) arc(png, 238, 282, 130 + i * 13, -2.4, -0.1, 9 - i * 0.55, i < 3 ? '#fff0a0' : '#ff8a3d', 0.62 - i * 0.055, 0.62);
  arc(png, 238, 282, 206, -2.32, -0.15, 4, '#49f5ff', 0.48, 0.62);
  for (let i = 0; i < 24; i++) circle(png, 90 + i * 14, 328 - Math.sin(i * 0.4) * 56, 2 + (i % 3), '#fff2a0', 0.34);
  return png;
}

function makeSpearEffect() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  radialGlow(png, 262, 254, 210, '#5ff3ff', 0.12, 0.34);
  for (let i = 0; i < 5; i++) {
    const y = 214 + i * 18;
    line(png, 48, y + 72, 438, y - 42, 8 - i * 0.8, i % 2 ? '#8ce7ff' : '#f6f0c0', 0.38 + i * 0.04);
  }
  polygon(png, [[402, 150], [488, 124], [440, 206]], '#eaffff', 0.78);
  polygon(png, [[388, 164], [456, 150], [426, 198]], '#af6cff', 0.42);
  line(png, 44, 306, 446, 172, 3, '#ffffff', 0.55);
  return png;
}

function makeCrossbowEffect() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  radialGlow(png, 266, 248, 190, '#b56cff', 0.16, 0.48);
  for (let i = 0; i < 4; i++) {
    const y = 196 + i * 34;
    line(png, 52, y + 44, 408, y - 22, 5, '#5ff3ff', 0.58);
    line(png, 86, y + 38, 374, y - 18, 2, '#ffffff', 0.72);
    polygon(png, [[404, y - 32], [474, y - 44], [422, y + 8]], '#ffd86b', 0.78);
  }
  for (let i = 0; i < 8; i++) {
    const x = 164 + i * 30;
    line(png, x, 186 + (i % 2) * 28, x + 18, 210 + (i % 3) * 22, 3, '#b56cff', 0.48);
  }
  return png;
}

function makeQinggangEffect() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  radialGlow(png, 256, 256, 224, '#43f1d4', 0.14, 0.72);
  ring(png, 256, 256, 126, 8, '#43f1d4', 0.48, 0.72);
  ring(png, 256, 256, 174, 5, '#5b9cff', 0.36, 0.72);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI * 2 / 6 + 0.18;
    const x = 256 + Math.cos(angle) * 164;
    const y = 256 + Math.sin(angle) * 118;
    line(png, x - Math.cos(angle + 0.8) * 18, y - Math.sin(angle + 0.8) * 18, x + Math.cos(angle + 0.8) * 46, y + Math.sin(angle + 0.8) * 46, 7, '#eaffff', 0.68);
    polygon(png, [[x + Math.cos(angle + 0.8) * 48, y + Math.sin(angle + 0.8) * 48], [x + Math.cos(angle + 0.8) * 72 - Math.sin(angle) * 10, y + Math.sin(angle + 0.8) * 72 + Math.cos(angle) * 10], [x + Math.cos(angle + 0.8) * 64 + Math.sin(angle) * 10, y + Math.sin(angle + 0.8) * 64 - Math.cos(angle) * 10]], '#43f1d4', 0.72);
  }
  return png;
}

function makeShieldEffect() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  radialGlow(png, 256, 276, 218, '#ffd15a', 0.18, 0.62);
  for (let i = 0; i < 5; i++) ring(png, 256, 274, 82 + i * 32, 5, i % 2 ? '#ff6a3d' : '#fff4b8', 0.5 - i * 0.055, 0.62);
  polygon(png, [[256, 102], [374, 180], [350, 342], [256, 414], [162, 342], [138, 180]], '#ffd15a', 0.18);
  line(png, 156, 344, 356, 344, 8, '#ff6a3d', 0.34);
  line(png, 172, 204, 340, 204, 5, '#ffffff', 0.26);
  return png;
}

function makeTaipingEffect() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  radialGlow(png, 256, 256, 230, '#ff563d', 0.2, 0.9);
  for (let i = 0; i < 12; i++) {
    const start = i * 0.56;
    arc(png, 256, 256, 34 + i * 14, start, start + 1.35, 8 - i * 0.18, i % 2 ? '#ffde7a' : '#ff9b2f', 0.55 - i * 0.025, 0.92);
  }
  for (let i = 0; i < 28; i++) {
    const angle = i * 0.58;
    const r = 58 + i * 5.5;
    circle(png, 256 + Math.cos(angle) * r, 256 + Math.sin(angle) * r * 0.9, 3 + (i % 4), i % 2 ? '#fff0a0' : '#ff563d', 0.34);
  }
  return png;
}

function makeEffectTexture(effect) {
  if (effect.id === 'saber_arc') return makeSaberEffect();
  if (effect.id === 'spear_stab') return makeSpearEffect();
  if (effect.id === 'crossbow_arrow') return makeCrossbowEffect();
  if (effect.id === 'qinggang_orbit') return makeQinggangEffect();
  if (effect.id === 'shield_pulse') return makeShieldEffect();
  if (effect.id === 'taiping_tornado') return makeTaipingEffect();
  throw new Error(`Unknown effect: ${effect.id}`);
}

function makeWeaponProgressionAtlas() {
  const cellSize = 192;
  const atlas = new PNG({ width: WEAPONS.length * cellSize, height: 6 * cellSize, colorType: 6 });
  for (let weaponIndex = 0; weaponIndex < WEAPONS.length; weaponIndex++) {
    for (let level = 1; level <= 6; level++) {
      const file = `asset_weapon_${WEAPONS[weaponIndex].id}_lv${level}.png`;
      const src = PNG.sync.read(fs.readFileSync(path.join(weaponDir, file)));
      blitScaled(atlas, src, weaponIndex * cellSize + 16, (level - 1) * cellSize + 16, 160, 160);
    }
  }
  const outPath = path.join(proofDir, 'weapon-progression-atlas.png');
  fs.writeFileSync(outPath, PNG.sync.write(atlas));
  return outPath;
}

function makeEffectPreview(generated) {
  const cell = 256;
  const atlas = new PNG({ width: 3 * cell, height: 2 * cell, colorType: 6 });
  generated.forEach((entry, index) => {
    const src = PNG.sync.read(fs.readFileSync(entry.path));
    blitScaled(atlas, src, (index % 3) * cell, Math.floor(index / 3) * cell, cell, cell);
  });
  const outPath = path.join(proofDir, 'weapon-effect-preview.png');
  fs.writeFileSync(outPath, PNG.sync.write(atlas));
  return outPath;
}

const weaponOutputs = [];
for (let weaponIndex = 0; weaponIndex < WEAPONS.length; weaponIndex++) {
  const spec = WEAPONS[weaponIndex];
  for (let level = 2; level <= 6; level++) {
    const file = `asset_weapon_${spec.id}_lv${level}.png`;
    const png = makeWeaponIcon(spec, level);
    const outPath = path.join(weaponDir, file);
    fs.writeFileSync(outPath, PNG.sync.write(png));
    weaponOutputs.push({ id: spec.id, level, file, path: outPath, weaponIndex });
  }
}

const effectOutputs = [];
for (const effect of EFFECTS) {
  const png = makeEffectTexture(effect);
  const outPath = path.join(effectDir, effect.file);
  fs.writeFileSync(outPath, PNG.sync.write(png));
  effectOutputs.push({ id: effect.id, file: effect.file, path: outPath });
}

const weaponProof = makeWeaponProgressionAtlas();
const effectProof = makeEffectPreview(effectOutputs);

console.log(JSON.stringify({
  weaponIcons: weaponOutputs.length,
  effects: effectOutputs.length,
  proofs: [
    path.relative(root, weaponProof).replaceAll(path.sep, '/'),
    path.relative(root, effectProof).replaceAll(path.sep, '/'),
  ],
}, null, 2));
