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
    match: ['基础长戈兵', '正常状态'],
    canvas: 256,
    maxWidth: 204,
    maxHeight: 240,
    anchorY: 240,
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

const PROMPT_STYLES = {
  soldier: {
    shadow: '#4b1018',
    mid: '#a8242b',
    high: '#f0a35a',
    accent: '#ffd06a',
    tint: 0.7,
    lift: 28,
    contrast: 1.1,
  },
  spearman: {
    shadow: '#481018',
    mid: '#9f2630',
    high: '#f6b45d',
    accent: '#76dfff',
    tint: 0.6,
    lift: 22,
    contrast: 1.12,
  },
  cavalry: {
    shadow: '#5a2610',
    mid: '#c77824',
    high: '#ffdc72',
    accent: '#58e8ff',
    tint: 0.5,
    lift: 24,
    contrast: 1.08,
  },
  archer: {
    shadow: '#3d2116',
    mid: '#8a5630',
    high: '#e3ad68',
    accent: '#82f0d6',
    tint: 0.66,
    lift: 30,
    contrast: 1.08,
  },
  elite: {
    shadow: '#66320c',
    mid: '#d17a1f',
    high: '#ffe276',
    accent: '#fff4a8',
    tint: 0.62,
    lift: 34,
    contrast: 1.1,
  },
  wooden_ox: {
    shadow: '#4a2a14',
    mid: '#9a632e',
    high: '#e5b86a',
    accent: '#54e7ff',
    tint: 0.58,
    lift: 24,
    contrast: 1.04,
  },
  tiger_guard: {
    shadow: '#5c3a12',
    mid: '#d08a25',
    high: '#ffe17b',
    accent: '#fff2a0',
    tint: 0.68,
    lift: 30,
    contrast: 1.1,
  },
  prop: {
    shadow: '#4b2514',
    mid: '#9b5a2a',
    high: '#e7b169',
    accent: '#f6df91',
    tint: 0.42,
    lift: 12,
    contrast: 1.02,
  },
};

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

function mixChannel(a, b, amount) {
  return a + (b - a) * amount;
}

function mixRgb(a, b, amount) {
  return {
    r: mixChannel(a.r, b.r, amount),
    g: mixChannel(a.g, b.g, amount),
    b: mixChannel(a.b, b.b, amount),
  };
}

function paletteAt(style, lum) {
  const shadow = hexToRgb(style.shadow);
  const mid = hexToRgb(style.mid);
  const high = hexToRgb(style.high);
  const t = Math.max(0, Math.min(1, lum / 255));
  return t < 0.55
    ? mixRgb(shadow, mid, t / 0.55)
    : mixRgb(mid, high, (t - 0.55) / 0.45);
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

function drawLine(png, x1, y1, x2, y2, width, hex, alpha = 1) {
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
      const distance = Math.hypot(x - px, y - py);
      if (distance <= width) blendPixel(png, x, y, color, alpha * Math.min(1, width - distance + 0.5));
    }
  }
}

function drawEllipse(png, cx, cy, rx, ry, hex, alpha = 1) {
  const color = hexToRgb(hex);
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const d = ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry);
      if (d <= 1) blendPixel(png, x, y, color, alpha * Math.min(1, (1 - d) * 3));
    }
  }
}

function brightenAndTint(png, id) {
  const style = PROMPT_STYLES[id];
  if (!style) return png;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const index = (png.width * y + x) << 2;
      const alpha = png.data[index + 3];
      if (alpha <= 3) continue;
      const r = png.data[index];
      const g = png.data[index + 1];
      const b = png.data[index + 2];
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      const target = paletteAt(style, lum);
      const outline = lum < 34;
      const tint = outline ? 0.12 : style.tint;
      const contrastPivot = 116;
      png.data[index] = clampByte((mixChannel(r, target.r, tint) - contrastPivot) * style.contrast + contrastPivot + style.lift);
      png.data[index + 1] = clampByte((mixChannel(g, target.g, tint) - contrastPivot) * style.contrast + contrastPivot + style.lift);
      png.data[index + 2] = clampByte((mixChannel(b, target.b, tint) - contrastPivot) * style.contrast + contrastPivot + style.lift);
    }
  }
  return png;
}

function addPromptDetails(png, id) {
  const style = PROMPT_STYLES[id] || PROMPT_STYLES.soldier;
  const accent = style.accent;
  if (id === 'soldier') {
    drawLine(png, 104, 104, 148, 148, 4, accent, 0.52);
    drawLine(png, 154, 116, 178, 92, 3, '#f4e7c0', 0.78);
    drawEllipse(png, 128, 64, 16, 8, '#ffca70', 0.35);
  } else if (id === 'spearman') {
    drawLine(png, 68, 150, 206, 104, 4, '#f3dfb0', 0.82);
    drawLine(png, 194, 102, 224, 92, 5, '#85edff', 0.8);
    drawLine(png, 86, 118, 128, 150, 5, '#c83438', 0.55);
  } else if (id === 'cavalry') {
    drawLine(png, 42, 146, 212, 130, 3, '#76f4ff', 0.42);
    drawLine(png, 54, 174, 190, 166, 3, '#ffe06b', 0.55);
    drawEllipse(png, 82, 204, 42, 9, '#77eaff', 0.18);
  } else if (id === 'archer') {
    drawLine(png, 84, 160, 176, 138, 3, '#e8b66d', 0.48);
    drawLine(png, 92, 176, 188, 146, 2, '#22140e', 0.56);
    drawEllipse(png, 134, 82, 14, 8, '#7cf5dc', 0.35);
  } else if (id === 'elite') {
    drawLine(png, 96, 96, 158, 158, 5, '#fff09b', 0.62);
    drawEllipse(png, 128, 62, 26, 12, '#ffe27a', 0.36);
    drawLine(png, 94, 126, 80, 212, 8, '#d63c2f', 0.42);
    drawLine(png, 164, 118, 188, 88, 4, '#fff2b4', 0.76);
  } else if (id === 'wooden_ox') {
    drawEllipse(png, 128, 88, 24, 18, '#63ecff', 0.34);
    drawLine(png, 76, 150, 182, 150, 4, '#f1c16f', 0.65);
    drawLine(png, 104, 106, 154, 106, 4, '#f1c16f', 0.5);
  } else if (id === 'tiger_guard') {
    drawEllipse(png, 130, 70, 24, 16, '#ffd65a', 0.55);
    drawLine(png, 104, 82, 154, 82, 4, '#2d1608', 0.72);
    drawLine(png, 112, 128, 170, 106, 4, '#ffdf75', 0.52);
    drawLine(png, 116, 68, 122, 88, 3, '#2d1608', 0.68);
    drawLine(png, 142, 68, 134, 88, 3, '#2d1608', 0.68);
  } else if (id === 'prop') {
    drawLine(png, 20, 58, 108, 56, 4, '#f0c276', 0.58);
    drawLine(png, 34, 30, 90, 88, 3, '#f0c276', 0.34);
    drawEllipse(png, 66, 62, 16, 10, '#f6df91', 0.32);
  }
}

function stylizeSprite(png, id) {
  brightenAndTint(png, id);
  addPromptDetails(png, id);
  return png;
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
  const normalized = stylizeSprite(normalizeSprite(source, spec), spec.id);
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
