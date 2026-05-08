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

function fillPolygon(png, points, color, alpha = 1) {
  const minY = Math.floor(Math.min(...points.map(p => p[1])));
  const maxY = Math.ceil(Math.max(...points.map(p => p[1])));
  for (let y = minY; y <= maxY; y++) {
    const nodes = [];
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const [xi, yi] = points[i];
      const [xj, yj] = points[j];
      if ((yi < y && yj >= y) || (yj < y && yi >= y)) {
        nodes.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
      }
    }
    nodes.sort((a, b) => a - b);
    for (let i = 0; i < nodes.length; i += 2) {
      if (nodes[i + 1] == null) break;
      for (let x = Math.floor(nodes[i]); x <= Math.ceil(nodes[i + 1]); x++) {
        blendPixel(png, x, y, color, alpha);
      }
    }
  }
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

function drawRadial(png, cx, cy, radius, color, alpha) {
  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const d = Math.hypot(x, y);
      if (d > radius) continue;
      const a = Math.pow(1 - d / radius, 2.2) * alpha;
      blendPixel(png, cx + x, cy + y, color, a);
    }
  }
}

function createPropBreak() {
  const png = new PNG({ width: 512, height: 512, colorType: 6 });
  drawRadial(png, 256, 282, 190, [255, 190, 80, 130], 0.24);
  const colors = [
    [118, 70, 32, 235],
    [164, 96, 44, 235],
    [214, 145, 64, 230],
    [78, 45, 24, 235],
  ];
  for (let i = 0; i < 22; i++) {
    const angle = (Math.PI * 2 * i) / 22 + (i % 3) * 0.09;
    const dist = 42 + (i % 5) * 26;
    const cx = 256 + Math.cos(angle) * dist;
    const cy = 256 + Math.sin(angle) * dist * 0.72;
    const size = 18 + (i % 4) * 8;
    const spin = angle + Math.PI / 4;
    const points = [];
    for (let p = 0; p < 4; p++) {
      const a = spin + (Math.PI * 2 * p) / 4;
      const r = size * (p % 2 === 0 ? 1 : 0.62);
      points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    fillPolygon(png, points, colors[i % colors.length], 0.92);
    drawLine(png, cx - Math.cos(spin) * size, cy - Math.sin(spin) * size, cx + Math.cos(spin) * size, cy + Math.sin(spin) * size, 1.4, [248, 190, 104, 210], 0.65);
  }
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI * 2 * i) / 10;
    drawLine(png, 256, 256, 256 + Math.cos(angle) * (90 + i * 5), 256 + Math.sin(angle) * (60 + i * 4), 2.2, [255, 222, 134, 190], 0.4);
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

const propBreak = createPropBreak();
fs.writeFileSync(path.join(effectDir, 'asset_effect_prop_break.png'), PNG.sync.write(propBreak));

const proof = new PNG({ width: 256, height: 256, colorType: 6 });
blitScaled(proof, propBreak, 0, 0, 256);
fs.writeFileSync(path.join(proofDir, 'prop-break-preview.png'), PNG.sync.write(proof));

console.log(JSON.stringify({
  propBreakAssets: 1,
  proof: 'assets/style-proofs/prop-break-preview.png',
}, null, 2));
