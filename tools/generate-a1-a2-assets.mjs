import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const outRoot = path.join(root, 'assets');
const skillDir = path.join(outRoot, 'skills');
const pickupDir = path.join(outRoot, 'pickups');
const proofDir = path.join(outRoot, 'style-proofs');

for (const dir of [skillDir, pickupDir, proofDir]) fs.mkdirSync(dir, { recursive: true });

const SKILLS = [
  { id: 'DAMAGE', file: 'asset_skill_DAMAGE.png', color: '#d84235', accent: '#ffb15f', symbol: 'cross' },
  { id: 'SPEED', file: 'asset_skill_SPEED.png', color: '#d9e7ff', accent: '#8cc7ff', symbol: 'wind' },
  { id: 'COOLDOWN', file: 'asset_skill_COOLDOWN.png', color: '#8b5cff', accent: '#d8c3ff', symbol: 'clock' },
  { id: 'MAGNET', file: 'asset_skill_MAGNET.png', color: '#d7a936', accent: '#fff1a8', symbol: 'magnet' },
  { id: 'MAXHP', file: 'asset_skill_MAXHP.png', color: '#2e8cff', accent: '#ffd66b', symbol: 'shield' },
  { id: 'AREA', file: 'asset_skill_AREA.png', color: '#34b37d', accent: '#b9ffd7', symbol: 'rings' },
  { id: 'REGEN', file: 'asset_skill_REGEN.png', color: '#36d7b7', accent: '#d3fff0', symbol: 'leaf' },
  { id: 'EXP', file: 'asset_skill_EXP.png', color: '#f2c94c', accent: '#ffffff', symbol: 'star' },
  { id: 'RESONANCE', file: 'asset_skill_RESONANCE.png', color: '#d97a28', accent: '#ffe0a8', symbol: 'echo' },
  { id: 'ARMOR', file: 'asset_skill_ARMOR.png', color: '#8a6a45', accent: '#f0d0a0', symbol: 'mountain' },
];

const PICKUPS = [
  { id: 'EXP', file: 'asset_pickup_exp.png', color: '#4da3ff', accent: '#d8efff', symbol: 'diamond' },
  { id: 'BOSS_EXP', file: 'asset_pickup_boss_exp.png', color: '#ff3d45', accent: '#ffd45a', symbol: 'diamond2' },
  { id: 'RESONANCE', file: 'asset_pickup_resonance.png', color: '#ff9a2e', accent: '#ffe1a8', symbol: 'shard' },
  { id: 'BUN', file: 'asset_pickup_bun.png', color: '#f1dfb5', accent: '#ffffff', symbol: 'bun' },
  { id: 'CHICKEN', file: 'asset_pickup_chicken.png', color: '#d76a2d', accent: '#ffd085', symbol: 'drumstick' },
  { id: 'MAGNET', file: 'asset_pickup_magnet.png', color: '#b542ff', accent: '#ffd6ff', symbol: 'magnet' },
];

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function blendPixel(png, x, y, color, alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= png.width || y >= png.height || alpha <= 0) return;
  const idx = (png.width * y + x) << 2;
  const srcA = Math.max(0, Math.min(255, alpha * 255));
  const dstA = png.data[idx + 3];
  const outA = srcA + dstA * (1 - srcA / 255);
  if (outA <= 0) return;
  png.data[idx] = Math.round((color.r * srcA + png.data[idx] * dstA * (1 - srcA / 255)) / outA);
  png.data[idx + 1] = Math.round((color.g * srcA + png.data[idx + 1] * dstA * (1 - srcA / 255)) / outA);
  png.data[idx + 2] = Math.round((color.b * srcA + png.data[idx + 2] * dstA * (1 - srcA / 255)) / outA);
  png.data[idx + 3] = Math.round(outA);
}

function circle(png, cx, cy, radius, color, alpha = 1) {
  const c = hexToRgb(color);
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= radius) blendPixel(png, x, y, c, alpha * Math.min(1, radius - d + 1));
    }
  }
}

function ring(png, cx, cy, radius, width, color, alpha = 1) {
  const c = hexToRgb(color);
  for (let y = Math.floor(cy - radius - width); y <= Math.ceil(cy + radius + width); y++) {
    for (let x = Math.floor(cx - radius - width); x <= Math.ceil(cx + radius + width); x++) {
      const d = Math.hypot(x - cx, y - cy);
      const dist = Math.abs(d - radius);
      if (dist <= width) blendPixel(png, x, y, c, alpha * Math.min(1, width - dist + 1));
    }
  }
}

function line(png, x1, y1, x2, y2, width, color, alpha = 1) {
  const c = hexToRgb(color);
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
      if (d <= width) blendPixel(png, x, y, c, alpha * Math.min(1, width - d + 1));
    }
  }
}

function polygon(png, points, color, alpha = 1) {
  const c = hexToRgb(color);
  const minX = Math.floor(Math.min(...points.map(p => p[0])));
  const maxX = Math.ceil(Math.max(...points.map(p => p[0])));
  const minY = Math.floor(Math.min(...points.map(p => p[1])));
  const maxY = Math.ceil(Math.max(...points.map(p => p[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const xi = points[i][0], yi = points[i][1];
        const xj = points[j][0], yj = points[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
      }
      if (inside) blendPixel(png, x, y, c, alpha);
    }
  }
}

function drawSymbol(png, symbol, size, color, accent) {
  const cx = size / 2;
  const cy = size / 2;
  const s = size / 256;
  const a = accent;
  const c = color;
  if (symbol === 'cross') {
    line(png, cx - 44 * s, cy + 46 * s, cx + 42 * s, cy - 40 * s, 9 * s, a, 1);
    line(png, cx - 42 * s, cy - 40 * s, cx + 44 * s, cy + 46 * s, 9 * s, a, 1);
    line(png, cx - 54 * s, cy + 56 * s, cx + 52 * s, cy - 50 * s, 3 * s, c, 1);
  } else if (symbol === 'wind') {
    for (let i = -1; i <= 1; i++) {
      line(png, cx - 62 * s, cy + i * 26 * s, cx + 54 * s, cy - 20 * s + i * 18 * s, 6 * s, a, 0.9);
    }
    circle(png, cx + 34 * s, cy - 28 * s, 14 * s, c, 0.75);
  } else if (symbol === 'clock') {
    ring(png, cx, cy, 52 * s, 5 * s, a, 1);
    line(png, cx, cy, cx, cy - 38 * s, 6 * s, a, 1);
    line(png, cx, cy, cx + 34 * s, cy + 18 * s, 6 * s, a, 1);
    line(png, cx - 60 * s, cy - 36 * s, cx - 34 * s, cy - 58 * s, 5 * s, c, 1);
  } else if (symbol === 'magnet') {
    line(png, cx - 44 * s, cy - 34 * s, cx - 44 * s, cy + 34 * s, 13 * s, a, 1);
    line(png, cx + 44 * s, cy - 34 * s, cx + 44 * s, cy + 34 * s, 13 * s, a, 1);
    ring(png, cx, cy - 32 * s, 44 * s, 10 * s, c, 0.85);
    line(png, cx - 44 * s, cy + 34 * s, cx - 20 * s, cy + 34 * s, 13 * s, a, 1);
    line(png, cx + 20 * s, cy + 34 * s, cx + 44 * s, cy + 34 * s, 13 * s, a, 1);
  } else if (symbol === 'shield') {
    polygon(png, [[cx, cy - 64 * s], [cx + 54 * s, cy - 34 * s], [cx + 42 * s, cy + 48 * s], [cx, cy + 70 * s], [cx - 42 * s, cy + 48 * s], [cx - 54 * s, cy - 34 * s]], a, 0.95);
    polygon(png, [[cx, cy - 46 * s], [cx + 32 * s, cy - 24 * s], [cx + 22 * s, cy + 32 * s], [cx, cy + 48 * s], [cx - 22 * s, cy + 32 * s], [cx - 32 * s, cy - 24 * s]], c, 0.85);
  } else if (symbol === 'rings') {
    ring(png, cx, cy, 28 * s, 4 * s, a, 1);
    ring(png, cx, cy, 52 * s, 4 * s, a, 0.8);
    ring(png, cx, cy, 76 * s, 4 * s, c, 0.65);
  } else if (symbol === 'leaf') {
    polygon(png, [[cx - 8 * s, cy + 62 * s], [cx + 42 * s, cy - 62 * s], [cx + 66 * s, cy - 24 * s], [cx + 28 * s, cy + 38 * s]], a, 0.9);
    polygon(png, [[cx - 8 * s, cy + 62 * s], [cx - 52 * s, cy - 44 * s], [cx - 72 * s, cy - 10 * s], [cx - 34 * s, cy + 36 * s]], c, 0.9);
    line(png, cx - 42 * s, cy + 44 * s, cx + 50 * s, cy - 48 * s, 4 * s, '#ffffff', 0.8);
  } else if (symbol === 'star') {
    const pts = [];
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 === 0 ? 64 : 28) * s;
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      pts.push([cx + Math.cos(ang) * r, cy + Math.sin(ang) * r]);
    }
    polygon(png, pts, a, 0.95);
    circle(png, cx, cy, 20 * s, c, 0.9);
  } else if (symbol === 'echo') {
    line(png, cx - 58 * s, cy, cx + 58 * s, cy, 5 * s, a, 1);
    for (let i = 1; i <= 3; i++) ring(png, cx, cy, i * 24 * s, 3 * s, i === 3 ? c : a, 0.9 - i * 0.15);
  } else if (symbol === 'mountain') {
    polygon(png, [[cx - 78 * s, cy + 58 * s], [cx - 24 * s, cy - 38 * s], [cx + 10 * s, cy + 18 * s], [cx + 38 * s, cy - 58 * s], [cx + 84 * s, cy + 58 * s]], a, 0.95);
    line(png, cx - 24 * s, cy - 38 * s, cx + 8 * s, cy + 16 * s, 4 * s, c, 0.9);
  } else if (symbol === 'diamond' || symbol === 'diamond2') {
    polygon(png, [[cx, cy - 54 * s], [cx + 52 * s, cy], [cx, cy + 54 * s], [cx - 52 * s, cy]], a, 0.95);
    polygon(png, [[cx, cy - 30 * s], [cx + 28 * s, cy], [cx, cy + 30 * s], [cx - 28 * s, cy]], symbol === 'diamond2' ? '#ffffff' : c, 0.75);
  } else if (symbol === 'shard') {
    polygon(png, [[cx - 20 * s, cy - 58 * s], [cx + 42 * s, cy - 20 * s], [cx + 12 * s, cy + 62 * s], [cx - 46 * s, cy + 20 * s]], a, 0.95);
    line(png, cx - 12 * s, cy - 42 * s, cx + 10 * s, cy + 50 * s, 3 * s, '#ffffff', 0.75);
  } else if (symbol === 'bun') {
    circle(png, cx, cy + 8 * s, 52 * s, a, 0.95);
    for (let i = -1; i <= 1; i++) line(png, cx + i * 22 * s, cy - 20 * s, cx + i * 12 * s, cy + 28 * s, 3 * s, c, 0.6);
  } else if (symbol === 'drumstick') {
    circle(png, cx - 8 * s, cy - 12 * s, 36 * s, c, 0.95);
    line(png, cx + 18 * s, cy + 18 * s, cx + 52 * s, cy + 52 * s, 10 * s, a, 1);
    circle(png, cx + 60 * s, cy + 58 * s, 10 * s, a, 1);
  }
}

function makeIcon({ color, accent, symbol }, size, outPath) {
  const png = new PNG({ width: size, height: size, colorType: 6 });
  const cx = size / 2;
  const cy = size / 2;
  const s = size / 256;
  for (let r = 110 * s; r >= 18 * s; r -= 3 * s) {
    circle(png, cx, cy, r, color, 0.015);
  }
  circle(png, cx, cy, 78 * s, '#0f1117', 0.76);
  ring(png, cx, cy, 82 * s, 5 * s, accent, 0.85);
  ring(png, cx, cy, 96 * s, 2 * s, color, 0.35);
  drawSymbol(png, symbol, size, color, accent);
  fs.writeFileSync(outPath, PNG.sync.write(png));
}

function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (src.width * y + x) << 2;
      const di = (dst.width * (dy + y) + (dx + x)) << 2;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

for (const spec of SKILLS) makeIcon(spec, 256, path.join(skillDir, spec.file));
for (const spec of PICKUPS) makeIcon(spec, 128, path.join(pickupDir, spec.file));

const atlas = new PNG({ width: 5 * 160, height: 4 * 160, colorType: 6 });
let cell = 0;
for (const spec of [...SKILLS, ...PICKUPS]) {
  const dir = SKILLS.includes(spec) ? skillDir : pickupDir;
  const src = PNG.sync.read(fs.readFileSync(path.join(dir, spec.file)));
  const row = Math.floor(cell / 5);
  const col = cell % 5;
  const scaled = new PNG({ width: 128, height: 128, colorType: 6 });
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const sx = Math.floor(x * src.width / 128);
      const sy = Math.floor(y * src.height / 128);
      const si = (src.width * sy + sx) << 2;
      const di = (128 * y + x) << 2;
      scaled.data[di] = src.data[si];
      scaled.data[di + 1] = src.data[si + 1];
      scaled.data[di + 2] = src.data[si + 2];
      scaled.data[di + 3] = src.data[si + 3];
    }
  }
  blit(atlas, scaled, col * 160 + 16, row * 160 + 16);
  cell++;
}
fs.writeFileSync(path.join(proofDir, 'skill-pickup-icon-atlas.png'), PNG.sync.write(atlas));

console.log(JSON.stringify({
  skills: SKILLS.length,
  pickups: PICKUPS.length,
  proof: 'assets/style-proofs/skill-pickup-icon-atlas.png',
}, null, 2));
