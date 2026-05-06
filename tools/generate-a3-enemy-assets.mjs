import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const enemyDir = path.join(root, 'assets', 'enemies');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(enemyDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

const ENEMIES = [
  { id: 'soldier', file: 'asset_enemy_soldier.png', size: 256, body: '#8b2635', trim: '#cfa45b', weapon: 'blade' },
  { id: 'spearman', file: 'asset_enemy_spearman.png', size: 256, body: '#7f1d1d', trim: '#c8c8c8', weapon: 'spear' },
  { id: 'cavalry', file: 'asset_enemy_cavalry.png', size: 256, body: '#b8860b', trim: '#f1d071', weapon: 'horse' },
  { id: 'archer', file: 'asset_enemy_archer.png', size: 256, body: '#315f45', trim: '#b88955', weapon: 'bow' },
  { id: 'elite', file: 'asset_enemy_elite.png', size: 256, body: '#d8902d', trim: '#fff0a0', weapon: 'halberd' },
  { id: 'wooden_ox', file: 'asset_enemy_wooden_ox.png', size: 256, body: '#9b6a34', trim: '#e0b86a', weapon: 'gear' },
  { id: 'tiger_guard', file: 'asset_enemy_tiger_guard.png', size: 256, body: '#4d4d4d', trim: '#d5a23c', weapon: 'shield' },
  { id: 'prop', file: 'asset_enemy_prop_box.png', size: 128, body: '#8b5a2b', trim: '#d5a45d', weapon: 'crate' },
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
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius) blendPixel(png, x, y, c, alpha * Math.min(1, radius - d + 1));
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

function drawEnemy(spec) {
  const png = new PNG({ width: spec.size, height: spec.size, colorType: 6 });
  const s = spec.size / 256;
  const cx = spec.size / 2;
  const cy = spec.size / 2;
  for (let r = 92 * s; r > 30 * s; r -= 4 * s) circle(png, cx, cy + 12 * s, r, spec.body, 0.012);
  circle(png, cx, cy + 32 * s, 46 * s, '#08090c', 0.42);

  if (spec.weapon === 'crate') {
    polygon(png, [[cx - 58 * s, cy - 44 * s], [cx + 56 * s, cy - 44 * s], [cx + 62 * s, cy + 52 * s], [cx - 62 * s, cy + 52 * s]], spec.body, 0.95);
    line(png, cx - 54 * s, cy - 36 * s, cx + 54 * s, cy + 44 * s, 7 * s, spec.trim, 0.9);
    line(png, cx + 54 * s, cy - 36 * s, cx - 54 * s, cy + 44 * s, 7 * s, spec.trim, 0.9);
    line(png, cx - 62 * s, cy - 44 * s, cx + 62 * s, cy - 44 * s, 5 * s, '#2b170d', 0.9);
    line(png, cx - 62 * s, cy + 52 * s, cx + 62 * s, cy + 52 * s, 5 * s, '#2b170d', 0.9);
    return png;
  }

  polygon(png, [[cx, cy - 66 * s], [cx + 42 * s, cy - 26 * s], [cx + 34 * s, cy + 58 * s], [cx, cy + 82 * s], [cx - 34 * s, cy + 58 * s], [cx - 42 * s, cy - 26 * s]], spec.body, 0.94);
  circle(png, cx, cy - 52 * s, 22 * s, spec.trim, 0.9);
  line(png, cx - 34 * s, cy - 18 * s, cx + 34 * s, cy - 18 * s, 5 * s, spec.trim, 0.75);
  line(png, cx - 24 * s, cy + 18 * s, cx + 24 * s, cy + 18 * s, 5 * s, spec.trim, 0.6);
  line(png, cx - 30 * s, cy + 76 * s, cx - 42 * s, cy + 100 * s, 7 * s, spec.body, 0.9);
  line(png, cx + 30 * s, cy + 76 * s, cx + 42 * s, cy + 100 * s, 7 * s, spec.body, 0.9);

  if (spec.weapon === 'blade') {
    line(png, cx + 38 * s, cy - 18 * s, cx + 72 * s, cy - 58 * s, 5 * s, '#d8d8d8', 1);
    line(png, cx + 26 * s, cy - 4 * s, cx + 42 * s, cy - 18 * s, 6 * s, spec.trim, 1);
  } else if (spec.weapon === 'spear') {
    line(png, cx - 72 * s, cy + 48 * s, cx + 76 * s, cy - 74 * s, 5 * s, spec.trim, 1);
    polygon(png, [[cx + 76 * s, cy - 74 * s], [cx + 92 * s, cy - 100 * s], [cx + 66 * s, cy - 84 * s]], '#f0f0f0', 1);
  } else if (spec.weapon === 'horse') {
    polygon(png, [[cx - 74 * s, cy + 22 * s], [cx + 78 * s, cy + 4 * s], [cx + 58 * s, cy + 52 * s], [cx - 64 * s, cy + 66 * s]], '#7b4a20', 0.92);
    circle(png, cx + 80 * s, cy - 2 * s, 14 * s, '#7b4a20', 0.95);
    line(png, cx - 76 * s, cy + 62 * s, cx - 92 * s, cy + 88 * s, 5 * s, '#7b4a20', 1);
    line(png, cx + 50 * s, cy + 48 * s, cx + 66 * s, cy + 82 * s, 5 * s, '#7b4a20', 1);
  } else if (spec.weapon === 'bow') {
    line(png, cx + 48 * s, cy - 54 * s, cx + 70 * s, cy + 50 * s, 4 * s, spec.trim, 1);
    line(png, cx + 48 * s, cy - 54 * s, cx + 70 * s, cy + 50 * s, 1 * s, '#e8e8e8', 0.8);
    line(png, cx + 24 * s, cy - 2 * s, cx + 82 * s, cy - 8 * s, 3 * s, '#d8d8d8', 0.9);
  } else if (spec.weapon === 'halberd') {
    line(png, cx - 68 * s, cy + 56 * s, cx + 64 * s, cy - 70 * s, 6 * s, spec.trim, 1);
    polygon(png, [[cx + 64 * s, cy - 70 * s], [cx + 94 * s, cy - 82 * s], [cx + 76 * s, cy - 46 * s]], '#fff0a0', 0.95);
  } else if (spec.weapon === 'gear') {
    circle(png, cx - 42 * s, cy + 22 * s, 20 * s, spec.trim, 0.95);
    circle(png, cx + 42 * s, cy + 22 * s, 20 * s, spec.trim, 0.95);
    polygon(png, [[cx - 54 * s, cy - 20 * s], [cx + 52 * s, cy - 28 * s], [cx + 70 * s, cy + 38 * s], [cx - 64 * s, cy + 48 * s]], spec.body, 0.9);
  } else if (spec.weapon === 'shield') {
    polygon(png, [[cx + 42 * s, cy - 52 * s], [cx + 84 * s, cy - 24 * s], [cx + 78 * s, cy + 44 * s], [cx + 46 * s, cy + 68 * s], [cx + 18 * s, cy + 44 * s], [cx + 18 * s, cy - 24 * s]], spec.trim, 0.96);
    polygon(png, [[cx + 48 * s, cy - 34 * s], [cx + 68 * s, cy - 18 * s], [cx + 64 * s, cy + 34 * s], [cx + 48 * s, cy + 44 * s], [cx + 32 * s, cy + 34 * s], [cx + 32 * s, cy - 18 * s]], '#5c4033', 0.85);
  }
  return png;
}

function blit(dst, src, dx, dy, targetSize = 128) {
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const sx = Math.floor(x * src.width / targetSize);
      const sy = Math.floor(y * src.height / targetSize);
      const si = (src.width * sy + sx) << 2;
      const di = (dst.width * (dy + y) + (dx + x)) << 2;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

for (const spec of ENEMIES) {
  fs.writeFileSync(path.join(enemyDir, spec.file), PNG.sync.write(drawEnemy(spec)));
}

const atlas = new PNG({ width: 4 * 160, height: 2 * 160, colorType: 6 });
ENEMIES.forEach((spec, i) => {
  const src = PNG.sync.read(fs.readFileSync(path.join(enemyDir, spec.file)));
  blit(atlas, src, (i % 4) * 160 + 16, Math.floor(i / 4) * 160 + 16, 128);
});
fs.writeFileSync(path.join(proofDir, 'enemy-sprite-atlas.png'), PNG.sync.write(atlas));

console.log(JSON.stringify({
  enemies: ENEMIES.length,
  proof: 'assets/style-proofs/enemy-sprite-atlas.png',
}, null, 2));
