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
      const dist = Math.hypot(x - px, y - py);
      const coverage = Math.max(0, 1 - dist / width);
      if (coverage > 0) blendPixel(png, x, y, color, alpha * coverage * coverage);
    }
  }
}

function drawRadial(png, cx, cy, radius, color, alpha, inner = 0, ring = false) {
  const min = Math.floor(-radius);
  const max = Math.ceil(radius);
  for (let y = min; y <= max; y++) {
    for (let x = min; x <= max; x++) {
      const d = Math.hypot(x, y);
      if (d > radius || d < inner) continue;
      const t = d / radius;
      const a = ring
        ? Math.exp(-Math.pow((t - 0.72) / 0.18, 2)) * alpha
        : Math.pow(1 - t, 1.8) * alpha;
      blendPixel(png, cx + x, cy + y, color, a);
    }
  }
}

function drawWedge(png, cx, cy, angle, length, spread, color, alpha) {
  const tipX = cx + Math.cos(angle) * length;
  const tipY = cy + Math.sin(angle) * length;
  const leftX = cx + Math.cos(angle + Math.PI - spread) * length * 0.42;
  const leftY = cy + Math.sin(angle + Math.PI - spread) * length * 0.42;
  const rightX = cx + Math.cos(angle + Math.PI + spread) * length * 0.42;
  const rightY = cy + Math.sin(angle + Math.PI + spread) * length * 0.42;
  for (let i = 0; i < 36; i++) {
    const t = i / 35;
    drawLine(
      png,
      leftX * (1 - t) + rightX * t,
      leftY * (1 - t) + rightY * t,
      tipX,
      tipY,
      2.2,
      color,
      alpha * (0.25 + 0.75 * (1 - Math.abs(t - 0.5) * 2))
    );
  }
}

function createArrow({ dark = false } = {}) {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  const color = dark ? [40, 16, 74, 245] : [255, 74, 58, 235];
  const edge = dark ? [185, 86, 255, 230] : [255, 210, 88, 220];
  drawRadial(png, 168, 256, 128, dark ? [92, 28, 160, 190] : [255, 98, 24, 160], 0.26);
  drawLine(png, 88, 256, 390, 256, 22, [8, 8, 12, 210], 0.72);
  drawLine(png, 104, 256, 384, 256, 13, color, 0.92);
  drawLine(png, 112, 250, 340, 250, 3, edge, 0.72);
  drawWedge(png, 368, 256, 0, 74, 0.42, color, 0.85);
  drawWedge(png, 380, 256, 0, 56, 0.36, edge, 0.5);
  for (let i = 0; i < 5; i++) {
    const y = 222 + i * 17;
    drawLine(png, 142 - i * 4, y, 78, y - 22 + i * 11, 4, edge, 0.34);
  }
  return png;
}

function createGroundEffect({ scorched = false } = {}) {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  const core = scorched ? [96, 45, 190, 210] : [255, 74, 20, 230];
  const hot = scorched ? [255, 96, 212, 190] : [255, 220, 84, 220];
  const smoke = scorched ? [38, 22, 62, 160] : [92, 24, 10, 150];
  drawRadial(png, 256, 256, 238, core, 0.18, 0, false);
  drawRadial(png, 256, 256, 232, core, 0.48, 78, true);
  drawRadial(png, 256, 256, 186, hot, 0.24, 96, true);
  for (let i = 0; i < 18; i++) {
    const angle = (Math.PI * 2 * i) / 18 + (i % 2) * 0.11;
    const r1 = 48 + (i % 4) * 7;
    const r2 = 170 + (i % 5) * 10;
    drawLine(
      png,
      256 + Math.cos(angle) * r1,
      256 + Math.sin(angle) * r1 * 0.78,
      256 + Math.cos(angle + 0.18) * r2,
      256 + Math.sin(angle + 0.18) * r2 * 0.78,
      scorched ? 4 : 5,
      i % 3 === 0 ? hot : smoke,
      i % 3 === 0 ? 0.42 : 0.28
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

function blitScaled(dst, src, dx, dy, w, h) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const pixel = sampleNearest(src, (x / w) * src.width, (y / h) * src.height);
      blendPixel(dst, dx + x, dy + y, pixel, 1);
    }
  }
}

const outputs = [
  ['asset_effect_boss_dark_arrow.png', createArrow({ dark: true })],
  ['asset_effect_boss_affix_arrow.png', createArrow({ dark: false })],
  ['asset_effect_boss_fire_area.png', createGroundEffect({ scorched: false })],
  ['asset_effect_boss_scorched_ground.png', createGroundEffect({ scorched: true })],
];

for (const [file, png] of outputs) {
  fs.writeFileSync(path.join(effectDir, file), PNG.sync.write(png));
}

const preview = new PNG({ width: 1024, height: 512, colorType: 6 });
outputs.forEach(([file], index) => {
  const src = PNG.sync.read(fs.readFileSync(path.join(effectDir, file)));
  blitScaled(preview, src, (index % 2) * 512, Math.floor(index / 2) * 256, 512, 256);
});
fs.writeFileSync(path.join(proofDir, 'boss-effect-preview.png'), PNG.sync.write(preview));

console.log(JSON.stringify({
  bossEffectAssets: outputs.length,
  proof: 'assets/style-proofs/boss-effect-preview.png',
}, null, 2));
