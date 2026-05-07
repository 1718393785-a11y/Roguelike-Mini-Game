import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const playerDir = path.join(root, 'assets', 'player');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(playerDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

const FRAME_SIZE = 256;
const FRAMES = [
  { state: 'idle', index: 1, lean: 0, step: 0, cape: 0 },
  { state: 'idle', index: 2, lean: -2, step: 0, cape: 3 },
  { state: 'move', index: 1, lean: 5, step: 8, cape: -8 },
  { state: 'move', index: 2, lean: 0, step: -5, cape: 2 },
  { state: 'move', index: 3, lean: -5, step: -8, cape: 8 },
  { state: 'move', index: 4, lean: 0, step: 5, cape: -2 },
];

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function putPixel(png, x, y, color) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= png.width || iy >= png.height) return;
  const i = (iy * png.width + ix) * 4;
  const srcA = color[3] / 255;
  const dstA = png.data[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  png.data[i] = Math.round((color[0] * srcA + png.data[i] * dstA * (1 - srcA)) / outA);
  png.data[i + 1] = Math.round((color[1] * srcA + png.data[i + 1] * dstA * (1 - srcA)) / outA);
  png.data[i + 2] = Math.round((color[2] * srcA + png.data[i + 2] * dstA * (1 - srcA)) / outA);
  png.data[i + 3] = Math.round(outA * 255);
}

function fillEllipse(png, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) putPixel(png, x, y, color);
    }
  }
}

function pointInPoly(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function fillPoly(png, points, color) {
  const minX = Math.floor(Math.min(...points.map(p => p[0])));
  const maxX = Math.ceil(Math.max(...points.map(p => p[0])));
  const minY = Math.floor(Math.min(...points.map(p => p[1])));
  const maxY = Math.ceil(Math.max(...points.map(p => p[1])));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (pointInPoly(x + 0.5, y + 0.5, points)) putPixel(png, x, y, color);
    }
  }
}

function drawLine(png, x1, y1, x2, y2, width, color) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const steps = Math.ceil(len * 1.4);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillEllipse(png, x1 + dx * t, y1 + dy * t, width / 2, width / 2, color);
  }
}

function drawFrame(spec) {
  const png = new PNG({ width: FRAME_SIZE, height: FRAME_SIZE });
  const cx = 128 + spec.lean;
  const cy = 132;
  const shadow = rgba('000000', 70);
  const outline = rgba('1f1510', 230);
  const armorDark = rgba('123722', 255);
  const armorMid = rgba('1f6b36', 255);
  const armorLight = rgba('6fbf6b', 240);
  const robe = rgba('235f32', 255);
  const gold = rgba('d5a640', 255);
  const skin = rgba('c38652', 255);
  const beard = rgba('22140f', 255);
  const steel = rgba('dce8df', 255);

  fillEllipse(png, 128, 188, 44, 13, shadow);

  const backLeg = spec.step >= 0 ? -1 : 1;
  drawLine(png, cx - 8, cy + 36, cx - 18 * backLeg, cy + 66, 13, outline);
  drawLine(png, cx + 8, cy + 36, cx + 16 * backLeg, cy + 66, 13, outline);
  drawLine(png, cx - 8, cy + 36, cx - 18 * backLeg, cy + 66, 9, robe);
  drawLine(png, cx + 8, cy + 36, cx + 16 * backLeg, cy + 66, 9, robe);

  fillPoly(png, [
    [cx - 46, cy + 4 + spec.cape],
    [cx - 20, cy - 34],
    [cx - 6, cy + 46],
    [cx - 36, cy + 70],
  ], rgba('6e221e', 235));

  fillPoly(png, [
    [cx - 25, cy - 25],
    [cx + 28, cy - 28],
    [cx + 34, cy + 36],
    [cx, cy + 58],
    [cx - 31, cy + 34],
  ], outline);
  fillPoly(png, [
    [cx - 18, cy - 19],
    [cx + 22, cy - 21],
    [cx + 26, cy + 30],
    [cx, cy + 47],
    [cx - 23, cy + 29],
  ], armorMid);
  fillPoly(png, [
    [cx - 16, cy - 8],
    [cx + 20, cy - 10],
    [cx + 18, cy + 15],
    [cx - 10, cy + 22],
  ], armorDark);
  drawLine(png, cx - 18, cy + 1, cx + 22, cy + 2, 4, gold);
  drawLine(png, cx - 5, cy - 19, cx - 1, cy + 44, 4, gold);
  drawLine(png, cx + 20, cy - 12, cx + 27, cy + 28, 3, armorLight);

  drawLine(png, cx - 21, cy - 6, cx - 46, cy + 20 + spec.step * 0.5, 13, outline);
  drawLine(png, cx + 24, cy - 6, cx + 54, cy + 16 - spec.step * 0.4, 13, outline);
  drawLine(png, cx - 21, cy - 6, cx - 46, cy + 20 + spec.step * 0.5, 8, armorMid);
  drawLine(png, cx + 24, cy - 6, cx + 54, cy + 16 - spec.step * 0.4, 8, armorMid);

  drawLine(png, cx + 36, cy + 20, cx + 73, cy - 35, 7, outline);
  drawLine(png, cx + 36, cy + 20, cx + 73, cy - 35, 4, rgba('7d4b28', 255));
  drawLine(png, cx + 73, cy - 35, cx + 101, cy - 55, 12, outline);
  drawLine(png, cx + 73, cy - 35, cx + 101, cy - 55, 7, steel);
  drawLine(png, cx + 89, cy - 49, cx + 103, cy - 43, 4, gold);

  fillEllipse(png, cx + 5, cy - 48, 20, 22, outline);
  fillEllipse(png, cx + 5, cy - 50, 15, 17, skin);
  fillEllipse(png, cx + 1, cy - 31, 13, 17, beard);
  fillEllipse(png, cx + 10, cy - 56, 4, 4, rgba('f3c28b', 230));
  drawLine(png, cx - 10, cy - 69, cx + 20, cy - 69, 7, outline);
  drawLine(png, cx - 8, cy - 69, cx + 18, cy - 69, 4, gold);

  return png;
}

function writeFrame(spec) {
  const file = `asset_player_guanyu_${spec.state}_${String(spec.index).padStart(2, '0')}.png`;
  fs.writeFileSync(path.join(playerDir, file), PNG.sync.write(drawFrame(spec)));
  return file;
}

const generated = FRAMES.map(writeFrame);
const atlas = new PNG({ width: 1536, height: 256 });
function blit(dst, src, ox, oy) {
  PNG.bitblt(src, dst, 0, 0, src.width, src.height, ox, oy);
}
FRAMES.forEach((spec, index) => {
  const file = `asset_player_guanyu_${spec.state}_${String(spec.index).padStart(2, '0')}.png`;
  const src = PNG.sync.read(fs.readFileSync(path.join(playerDir, file)));
  blit(atlas, src, index * 256, 0);
});
fs.writeFileSync(path.join(proofDir, 'player-guanyu-preview.png'), PNG.sync.write(atlas));

console.log(JSON.stringify({
  player: 'guanyu',
  generated: generated.map(file => path.join('assets', 'player', file)),
  proof: 'assets/style-proofs/player-guanyu-preview.png',
}, null, 2));
