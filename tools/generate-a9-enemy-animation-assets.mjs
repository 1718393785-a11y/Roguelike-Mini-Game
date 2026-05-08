import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const enemyDir = path.join(root, 'assets', 'enemies');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(enemyDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

const ENEMIES = [
  { id: 'soldier', file: 'asset_enemy_soldier.png', canvas: 256, attack: true },
  { id: 'spearman', file: 'asset_enemy_spearman.png', canvas: 256, attack: true },
  { id: 'cavalry', file: 'asset_enemy_cavalry.png', canvas: 256, attack: true },
  { id: 'archer', file: 'asset_enemy_archer.png', canvas: 256, attack: true },
  { id: 'elite', file: 'asset_enemy_elite.png', canvas: 256, attack: true },
  { id: 'wooden_ox', file: 'asset_enemy_wooden_ox.png', canvas: 256, attack: false },
  { id: 'tiger_guard', file: 'asset_enemy_tiger_guard.png', canvas: 256, attack: true },
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
  const angle = options.angle || 0;
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const scaleX = options.scaleX || 1;
  const scaleY = options.scaleY || 1;
  const lean = options.lean || 0;
  const dx = options.dx || 0;
  const dy = options.dy || 0;

  for (let y = 0; y < output.height; y++) {
    for (let x = 0; x < output.width; x++) {
      const tx = x - dx - cx;
      const ty = y - dy - footY;
      const rx = tx * cos - ty * sin;
      const ry = tx * sin + ty * cos;
      const sourceY = ry / scaleY + footY;
      const vertical = Math.max(0, Math.min(1, (footY - sourceY) / Math.max(1, bounds.h)));
      const sourceX = rx / scaleX + cx - lean * vertical * bounds.w;
      const pixel = sampleBilinear(source, sourceX, sourceY);
      blendPixel(output, x, y, pixel, 1);
    }
  }
  return output;
}

function addMotionGhost(source, target, dx, dy, alpha) {
  for (let y = 0; y < source.height; y++) {
    for (let x = 0; x < source.width; x++) {
      const index = (source.width * y + x) << 2;
      const pixel = [source.data[index], source.data[index + 1], source.data[index + 2], source.data[index + 3]];
      if (pixel[3] > 0) blendPixel(target, x + dx, y + dy, pixel, alpha);
    }
  }
}

function createMoveFrame(source, side) {
  const frame = transformSprite(source, {
    angle: side * 0.035,
    scaleX: 1.02,
    scaleY: 0.985,
    lean: side * 0.035,
    dx: side * 3,
    dy: side > 0 ? 1 : -1,
  });
  addMotionGhost(source, frame, -side * 5, 2, 0.16);
  return frame;
}

function createAttackFrame(source, side, power) {
  const frame = transformSprite(source, {
    angle: side * (0.08 + power * 0.04),
    scaleX: 1.05 + power * 0.04,
    scaleY: 0.96,
    lean: side * (0.08 + power * 0.08),
    dx: side * (5 + power * 6),
    dy: power > 0.5 ? -2 : 0,
  });
  addMotionGhost(source, frame, -side * (8 + power * 5), 2, 0.12);
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
for (const enemy of ENEMIES) {
  const sourcePath = path.join(enemyDir, enemy.file);
  if (!fs.existsSync(sourcePath)) throw new Error(`Missing source enemy sprite: ${sourcePath}`);
  const source = PNG.sync.read(fs.readFileSync(sourcePath));
  const move1 = createMoveFrame(source, -1);
  const move2 = createMoveFrame(source, 1);
  const move1File = `asset_enemy_${enemy.id}_move_01.png`;
  const move2File = `asset_enemy_${enemy.id}_move_02.png`;
  fs.writeFileSync(path.join(enemyDir, move1File), PNG.sync.write(move1));
  fs.writeFileSync(path.join(enemyDir, move2File), PNG.sync.write(move2));
  generated.push({ id: enemy.id, state: 'move', file: move1File });
  generated.push({ id: enemy.id, state: 'move', file: move2File });
  if (enemy.attack) {
    const attack1 = createAttackFrame(source, -1, 0.35);
    const attack2 = createAttackFrame(source, 1, 1);
    const attack1File = `asset_enemy_${enemy.id}_attack_01.png`;
    const attack2File = `asset_enemy_${enemy.id}_attack_02.png`;
    fs.writeFileSync(path.join(enemyDir, attack1File), PNG.sync.write(attack1));
    fs.writeFileSync(path.join(enemyDir, attack2File), PNG.sync.write(attack2));
    generated.push({ id: enemy.id, state: 'attack', file: attack1File });
    generated.push({ id: enemy.id, state: 'attack', file: attack2File });
  }
}

const cellSize = 128;
const atlas = new PNG({ width: 7 * cellSize, height: 4 * cellSize, colorType: 6 });
ENEMIES.forEach((enemy, col) => {
  const files = [
    enemy.file,
    `asset_enemy_${enemy.id}_move_01.png`,
    `asset_enemy_${enemy.id}_move_02.png`,
    enemy.attack ? `asset_enemy_${enemy.id}_attack_01.png` : `asset_enemy_${enemy.id}_move_01.png`,
  ];
  files.forEach((file, row) => {
    const src = PNG.sync.read(fs.readFileSync(path.join(enemyDir, file)));
    blitScaled(atlas, src, col * cellSize, row * cellSize, cellSize);
  });
});
fs.writeFileSync(path.join(proofDir, 'enemy-animation-preview.png'), PNG.sync.write(atlas));

console.log(JSON.stringify({
  enemyAnimationFrames: generated.length,
  proof: 'assets/style-proofs/enemy-animation-preview.png',
}, null, 2));
