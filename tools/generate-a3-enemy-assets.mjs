import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const sourceRoot = process.env.SOURCE_ASSET_ROOT || 'D:\\Claude code\\.claude\\games\\时空骇客过五关\\测试\\assets';
const enemyDir = path.join(root, 'assets', 'enemies');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(enemyDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

if (!fs.existsSync(sourceRoot)) {
  throw new Error(`Source asset directory not found: ${sourceRoot}`);
}

const ENEMIES = [
  {
    id: 'soldier',
    file: 'asset_enemy_soldier.png',
    folder: 'enemies',
    match: ['基础长戈兵', '正常状态'],
    canvas: 256,
    maxWidth: 182,
    maxHeight: 230,
    anchorY: 238,
  },
  {
    id: 'spearman',
    file: 'asset_enemy_spearman.png',
    folder: 'enemies',
    match: ['基础长戈兵', '攻击状态'],
    canvas: 256,
    maxWidth: 244,
    maxHeight: 154,
    anchorY: 224,
  },
  {
    id: 'cavalry',
    file: 'asset_enemy_cavalry.png',
    folder: 'enemies',
    match: ['冲锋兵', '冲刺状态'],
    canvas: 256,
    maxWidth: 244,
    maxHeight: 184,
    anchorY: 224,
  },
  {
    id: 'archer',
    file: 'asset_enemy_archer.png',
    folder: 'enemies',
    match: ['敌方弓箭手', '正常状态'],
    canvas: 256,
    maxWidth: 222,
    maxHeight: 222,
    anchorY: 236,
  },
  {
    id: 'elite',
    file: 'asset_enemy_elite.png',
    folder: 'enemies',
    match: ['虎卫', '攻击状态'],
    canvas: 256,
    maxWidth: 226,
    maxHeight: 214,
    anchorY: 236,
  },
  {
    id: 'wooden_ox',
    file: 'asset_enemy_wooden_ox.png',
    folder: 'enemies',
    match: ['机械木牛', '正常状态'],
    canvas: 256,
    maxWidth: 238,
    maxHeight: 218,
    anchorY: 232,
  },
  {
    id: 'tiger_guard',
    file: 'asset_enemy_tiger_guard.png',
    folder: 'enemies',
    match: ['虎卫', '正常状态'],
    canvas: 256,
    maxWidth: 218,
    maxHeight: 236,
    anchorY: 240,
  },
  {
    id: 'prop',
    file: 'asset_enemy_prop_box.png',
    folder: '木箱',
    match: ['完整木箱'],
    canvas: 128,
    maxWidth: 114,
    maxHeight: 104,
    anchorY: 114,
  },
];

function findAtlasPng(folder, match) {
  const dir = path.join(sourceRoot, folder);
  if (!fs.existsSync(dir)) throw new Error(`Source folder not found: ${dir}`);
  const file = fs.readdirSync(dir)
    .filter(name => name.endsWith('_atlas.png'))
    .find(name => match.every(token => name.includes(token)));
  if (!file) throw new Error(`No atlas matched ${folder}: ${match.join(', ')}`);
  return path.join(dir, file);
}

function alphaBounds(png, threshold = 4, padding = 4) {
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
  if (maxX < 0 || maxY < 0) throw new Error('Source PNG has no visible pixels');
  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    w: Math.min(png.width - Math.max(0, minX - padding), maxX - minX + 1 + padding * 2),
    h: Math.min(png.height - Math.max(0, minY - padding), maxY - minY + 1 + padding * 2),
  };
}

function sampleBilinear(src, x, y) {
  const x0 = Math.max(0, Math.min(src.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(src.height - 1, Math.floor(y)));
  const x1 = Math.max(0, Math.min(src.width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(src.height - 1, y0 + 1));
  const tx = x - x0;
  const ty = y - y0;
  const samples = [
    [x0, y0, (1 - tx) * (1 - ty)],
    [x1, y0, tx * (1 - ty)],
    [x0, y1, (1 - tx) * ty],
    [x1, y1, tx * ty],
  ];
  let alpha = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const [sx, sy, weight] of samples) {
    const index = (src.width * sy + sx) << 2;
    const a = src.data[index + 3] * weight;
    alpha += a;
    red += src.data[index] * a;
    green += src.data[index + 1] * a;
    blue += src.data[index + 2] * a;
  }
  if (alpha <= 0.01) return [0, 0, 0, 0];
  return [
    Math.round(red / alpha),
    Math.round(green / alpha),
    Math.round(blue / alpha),
    Math.round(alpha),
  ];
}

function normalizeSprite(source, spec) {
  const bounds = alphaBounds(source);
  const output = new PNG({ width: spec.canvas, height: spec.canvas, colorType: 6 });
  const scale = Math.min(spec.maxWidth / bounds.w, spec.maxHeight / bounds.h);
  const drawW = Math.max(1, Math.round(bounds.w * scale));
  const drawH = Math.max(1, Math.round(bounds.h * scale));
  const dx = Math.round((spec.canvas - drawW) / 2);
  const dy = Math.round(spec.anchorY - drawH);

  for (let y = 0; y < drawH; y++) {
    for (let x = 0; x < drawW; x++) {
      const sx = bounds.x + (x + 0.5) / scale;
      const sy = bounds.y + (y + 0.5) / scale;
      const pixel = sampleBilinear(source, sx, sy);
      const ox = dx + x;
      const oy = dy + y;
      if (ox < 0 || oy < 0 || ox >= output.width || oy >= output.height) continue;
      const outIndex = (output.width * oy + ox) << 2;
      output.data[outIndex] = pixel[0];
      output.data[outIndex + 1] = pixel[1];
      output.data[outIndex + 2] = pixel[2];
      output.data[outIndex + 3] = pixel[3];
    }
  }

  return output;
}

function blit(dst, src, dx, dy, targetSize) {
  for (let y = 0; y < targetSize; y++) {
    for (let x = 0; x < targetSize; x++) {
      const sx = Math.floor((x / targetSize) * src.width);
      const sy = Math.floor((y / targetSize) * src.height);
      const sourceIndex = (src.width * sy + sx) << 2;
      const targetIndex = (dst.width * (dy + y) + (dx + x)) << 2;
      dst.data[targetIndex] = src.data[sourceIndex];
      dst.data[targetIndex + 1] = src.data[sourceIndex + 1];
      dst.data[targetIndex + 2] = src.data[sourceIndex + 2];
      dst.data[targetIndex + 3] = src.data[sourceIndex + 3];
    }
  }
}

const generated = [];
for (const spec of ENEMIES) {
  const sourceFile = findAtlasPng(spec.folder, spec.match);
  const source = PNG.sync.read(fs.readFileSync(sourceFile));
  const normalized = normalizeSprite(source, spec);
  fs.writeFileSync(path.join(enemyDir, spec.file), PNG.sync.write(normalized));
  generated.push({ id: spec.id, output: path.join('assets', 'enemies', spec.file), source: sourceFile });
}

const atlas = new PNG({ width: 4 * 192, height: 2 * 192, colorType: 6 });
ENEMIES.forEach((spec, index) => {
  const src = PNG.sync.read(fs.readFileSync(path.join(enemyDir, spec.file)));
  blit(atlas, src, (index % 4) * 192 + 16, Math.floor(index / 4) * 192 + 16, 160);
});
fs.writeFileSync(path.join(proofDir, 'enemy-sprite-atlas.png'), PNG.sync.write(atlas));

console.log(JSON.stringify({
  enemies: generated.length,
  sourceRoot,
  proof: 'assets/style-proofs/enemy-sprite-atlas.png',
  generated,
}, null, 2));
