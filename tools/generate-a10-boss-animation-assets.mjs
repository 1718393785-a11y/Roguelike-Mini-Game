import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const bossDir = path.join(root, 'assets', 'bosses');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(proofDir, { recursive: true });

const BOSSES = [
  { id: 'kongxiu', file: 'asset_boss_kongxiu_idle_01.png', aura: [72, 220, 112] },
  { id: 'hanfu', file: 'asset_boss_hanfu_idle_01.png', aura: [170, 84, 230] },
  { id: 'bianxi', file: 'asset_boss_bianxi_idle_01.png', aura: [88, 160, 255] },
  { id: 'wangzhi', file: 'asset_boss_wangzhi_idle_01.png', aura: [255, 92, 42] },
  { id: 'qinqi', file: 'asset_boss_qinqi_idle_01.png', aura: [255, 202, 72] },
];

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

function sampleBilinear(src, x, y) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(src.width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(src.height - 1, y0 + 1));
  const tx = x - x0;
  const ty = y - y0;
  const points = [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty],
  ];
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const [sx, sy, weight] of points) {
    const index = (src.width * sy + sx) << 2;
    const a = src.data[index + 3] * weight;
    alpha += a;
    red += src.data[index] * a;
    green += src.data[index + 1] * a;
    blue += src.data[index + 2] * a;
  }
  if (alpha <= 0.01) return [0, 0, 0, 0];
  return [Math.round(red / alpha), Math.round(green / alpha), Math.round(blue / alpha), Math.round(alpha)];
}

function alphaBounds(png, threshold = 4) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const alpha = png.data[((png.width * y + x) << 2) + 3];
      if (alpha > threshold) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (maxX < 0) return { x: 0, y: 0, w: png.width, h: png.height };
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function transformSprite(source, options) {
  const output = new PNG({ width: source.width, height: source.height, colorType: 6 });
  const bounds = alphaBounds(source);
  const cx = bounds.x + bounds.w / 2;
  const footY = bounds.y + bounds.h;
  const scaleX = options.scaleX || 1;
  const scaleY = options.scaleY || 1;
  const dx = options.dx || 0;
  const dy = options.dy || 0;
  const lean = options.lean || 0;

  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const targetX = x - dx - cx;
      const targetY = y - dy - footY;
      const sourceY = targetY / scaleY + footY;
      const vertical = Math.max(0, Math.min(1, (footY - sourceY) / Math.max(1, bounds.h)));
      const sourceX = targetX / scaleX + cx - lean * vertical * bounds.w;
      blendPixel(output, x, y, sampleBilinear(source, sourceX, sourceY), 1);
    }
  }
  return output;
}

function addAura(target, color, strength, radiusScale = 0.48) {
  const cx = target.width / 2;
  const cy = target.height * 0.58;
  const radius = Math.min(target.width, target.height) * radiusScale;
  for (let y = 0; y < target.height; y++) {
    for (let x = 0; x < target.width; x++) {
      const dx = x - cx;
      const dy = (y - cy) * 1.12;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const t = Math.max(0, 1 - dist / radius);
      if (t <= 0) continue;
      const ring = Math.exp(-Math.pow((dist / radius - 0.72) / 0.18, 2));
      const core = Math.max(0, 1 - dist / (radius * 0.52));
      const alpha = strength * (ring * 0.68 + core * core * 0.12);
      blendPixel(target, x, y, [color[0], color[1], color[2], 185], alpha);
    }
  }
}

function addRimLight(source, target, color, strength) {
  for (let y = 1; y < source.height - 1; y++) {
    for (let x = 1; x < source.width - 1; x++) {
      const alpha = source.data[((source.width * y + x) << 2) + 3];
      if (alpha > 35) continue;
      let neighbor = 0;
      neighbor = Math.max(neighbor, source.data[((source.width * y + x - 1) << 2) + 3]);
      neighbor = Math.max(neighbor, source.data[((source.width * y + x + 1) << 2) + 3]);
      neighbor = Math.max(neighbor, source.data[((source.width * (y - 1) + x) << 2) + 3]);
      neighbor = Math.max(neighbor, source.data[((source.width * (y + 1) + x) << 2) + 3]);
      if (neighbor > 35) blendPixel(target, x, y, [color[0], color[1], color[2], 220], strength);
    }
  }
}

function createIdleFrame(source, boss) {
  const frame = transformSprite(source, { scaleX: 1.015, scaleY: 1.025, dy: -2 });
  addAura(frame, boss.aura, 0.055, 0.42);
  addRimLight(source, frame, boss.aura, 0.16);
  return frame;
}

function createCastFrame(source, boss, power) {
  const side = boss.id === 'hanfu' || boss.id === 'qinqi' ? 1 : -1;
  const frame = transformSprite(source, {
    scaleX: 1.03 + power * 0.035,
    scaleY: 0.985 + power * 0.025,
    dx: side * (2 + power * 4),
    dy: -2 - power * 2,
    lean: side * (0.045 + power * 0.05),
  });
  addAura(frame, boss.aura, 0.12 + power * 0.14, 0.52 + power * 0.08);
  addRimLight(source, frame, boss.aura, 0.28 + power * 0.22);
  return frame;
}

function blitScaled(dst, src, dx, dy, size) {
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const pixel = sampleBilinear(src, (x / size) * src.width, (y / size) * src.height);
      blendPixel(dst, dx + x, dy + y, pixel, 1);
    }
  }
}

const generated = [];
for (const boss of BOSSES) {
  const sourcePath = path.join(bossDir, boss.file);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing source boss sprite: ${sourcePath}`);
  const source = PNG.sync.read(fs.readFileSync(sourcePath));

  const idle2 = createIdleFrame(source, boss);
  const cast1 = createCastFrame(source, boss, 0.35);
  const cast2 = createCastFrame(source, boss, 1);
  const files = [
    [`asset_boss_${boss.id}_idle_02.png`, idle2],
    [`asset_boss_${boss.id}_cast_01.png`, cast1],
    [`asset_boss_${boss.id}_cast_02.png`, cast2],
  ];
  for (const [file, png] of files) {
    fs.writeFileSync(path.join(bossDir, file), PNG.sync.write(png));
    generated.push(`bosses/${file}`);
  }
}

const cellSize = 128;
const proof = new PNG({ width: BOSSES.length * cellSize, height: 3 * cellSize, colorType: 6 });
BOSSES.forEach((boss, col) => {
  const files = [
    boss.file,
    `asset_boss_${boss.id}_idle_02.png`,
    `asset_boss_${boss.id}_cast_02.png`,
  ];
  files.forEach((file, row) => {
    const src = PNG.sync.read(fs.readFileSync(path.join(bossDir, file)));
    blitScaled(proof, src, col * cellSize, row * cellSize, cellSize);
  });
});
fs.writeFileSync(path.join(proofDir, 'boss-animation-preview.png'), PNG.sync.write(proof));

console.log(JSON.stringify({
  bossAnimationFrames: generated.length,
  proof: 'assets/style-proofs/boss-animation-preview.png',
}, null, 2));
