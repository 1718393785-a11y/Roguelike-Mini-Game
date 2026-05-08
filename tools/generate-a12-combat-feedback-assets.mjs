import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const effectDir = path.join(root, 'assets', 'effects');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(effectDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function blendPixel(png, x, y, rgba, alpha = 1) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= png.width || y >= png.height || alpha <= 0 || rgba[3] <= 0) return;
  const index = (png.width * y + x) << 2;
  const srcA = Math.max(0, Math.min(255, rgba[3] * alpha));
  const dstA = png.data[index + 3];
  const outA = srcA + dstA * (1 - srcA / 255);
  if (outA <= 0) return;
  png.data[index] = clampByte((rgba[0] * srcA + png.data[index] * dstA * (1 - srcA / 255)) / outA);
  png.data[index + 1] = clampByte((rgba[1] * srcA + png.data[index + 1] * dstA * (1 - srcA / 255)) / outA);
  png.data[index + 2] = clampByte((rgba[2] * srcA + png.data[index + 2] * dstA * (1 - srcA / 255)) / outA);
  png.data[index + 3] = clampByte(outA);
}

function drawLine(png, x1, y1, x2, y2, width, color, alpha = 1) {
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
      const coverage = Math.max(0, 1 - d / width);
      if (coverage > 0) blendPixel(png, x, y, color, alpha * coverage * coverage);
    }
  }
}

function drawRadial(png, cx, cy, radius, color, alpha, ringAt = null) {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const d = Math.hypot(x, y);
      if (d > radius) continue;
      const t = d / radius;
      const a = ringAt == null
        ? Math.pow(1 - t, 1.9) * alpha
        : Math.exp(-Math.pow((t - ringAt) / 0.13, 2)) * alpha;
      blendPixel(png, cx + x, cy + y, color, a);
    }
  }
}

function createLightningAoe() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  drawRadial(png, 256, 256, 230, [72, 150, 255, 180], 0.24);
  drawRadial(png, 256, 256, 214, [130, 220, 255, 210], 0.52, 0.74);
  drawRadial(png, 256, 256, 92, [250, 255, 255, 230], 0.3);
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI * 2 * i) / 16 + (i % 2) * 0.12;
    let x = 256;
    let y = 256;
    const segments = 3 + (i % 3);
    for (let s = 0; s < segments; s++) {
      const step = 44 + s * 18;
      const nextAngle = angle + Math.sin(i * 7 + s) * 0.22;
      const nx = x + Math.cos(nextAngle) * step;
      const ny = y + Math.sin(nextAngle) * step;
      drawLine(png, x, y, nx, ny, s === 0 ? 4.5 : 2.7, [220, 250, 255, 245], 0.78 - s * 0.12);
      drawLine(png, x, y, nx, ny, s === 0 ? 9 : 5, [65, 150, 255, 190], 0.28);
      x = nx;
      y = ny;
    }
  }
  return png;
}

function createLightningColumn() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  for (let y = 0; y < 512; y++) {
    const drift = Math.sin(y * 0.045) * 18 + Math.sin(y * 0.113) * 8;
    const cx = 256 + drift;
    drawLine(png, cx, y - 8, cx + Math.sin(y * 0.2) * 12, y + 16, 18, [72, 160, 255, 160], 0.26);
    drawLine(png, cx, y - 8, cx + Math.sin(y * 0.2) * 12, y + 16, 7, [210, 250, 255, 245], 0.74);
  }
  for (let i = 0; i < 18; i++) {
    const y = 24 + i * 28;
    const side = i % 2 === 0 ? -1 : 1;
    drawLine(png, 256, y, 256 + side * (62 + (i % 4) * 14), y + 18, 3.2, [190, 240, 255, 230], 0.6);
  }
  drawRadial(png, 256, 256, 226, [80, 160, 255, 120], 0.14);
  return png;
}

function createLevelupNova() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  drawRadial(png, 256, 256, 240, [255, 205, 72, 210], 0.42, 0.78);
  drawRadial(png, 256, 256, 172, [255, 245, 182, 220], 0.32, 0.48);
  drawRadial(png, 256, 256, 78, [255, 255, 230, 235], 0.28);
  for (let i = 0; i < 24; i++) {
    const angle = (Math.PI * 2 * i) / 24;
    const r1 = 64 + (i % 3) * 12;
    const r2 = 210 - (i % 4) * 8;
    drawLine(
      png,
      256 + Math.cos(angle) * r1,
      256 + Math.sin(angle) * r1,
      256 + Math.cos(angle) * r2,
      256 + Math.sin(angle) * r2,
      3,
      i % 2 === 0 ? [255, 248, 186, 230] : [255, 160, 48, 190],
      0.38
    );
  }
  return png;
}

function sampleNearest(src, x, y) {
  const sx = Math.max(0, Math.min(src.width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(src.height - 1, Math.round(y)));
  const index = (src.width * sy + sx) << 2;
  return [src.data[index], src.data[index + 1], src.data[index + 2], src.data[index + 3]];
}

function blitScaled(dst, src, dx, dy, size) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      blendPixel(dst, dx + x, dy + y, sampleNearest(src, (x / size) * src.width, (y / size) * src.height), 1);
    }
  }
}

const outputs = [
  ['asset_effect_lightning_aoe.png', createLightningAoe()],
  ['asset_effect_lightning_column.png', createLightningColumn()],
  ['asset_effect_levelup_nova.png', createLevelupNova()],
];

for (const [file, png] of outputs) {
  fs.writeFileSync(path.join(effectDir, file), PNG.sync.write(png));
}

const proof = new PNG({ width: 768, height: 256, colorType: 6 });
outputs.forEach(([file], index) => {
  const src = PNG.sync.read(fs.readFileSync(path.join(effectDir, file)));
  blitScaled(proof, src, index * 256, 0, 256);
});
fs.writeFileSync(path.join(proofDir, 'combat-feedback-preview.png'), PNG.sync.write(proof));

console.log(JSON.stringify({
  combatFeedbackAssets: outputs.length,
  proof: 'assets/style-proofs/combat-feedback-preview.png',
}, null, 2));
