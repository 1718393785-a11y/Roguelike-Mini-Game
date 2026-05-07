import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const sourcePath = process.env.PLAYER_SHEET_SOURCE
  || 'D:\\Claude code\\.claude\\games\\时空骇客过五关\\测试\\assets\\player\\player_main.png';
const playerDir = path.join(root, 'assets', 'player');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(playerDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

const FRAME_SIZE = 256;
const OUTPUTS = [
  { out: 'asset_player_guanyu_idle_01.png', crop: { x: 590, y: 32, w: 190, h: 260 } },
  { out: 'asset_player_guanyu_idle_02.png', crop: { x: 590, y: 32, w: 190, h: 260 }, nudgeX: 1 },
  { out: 'asset_player_guanyu_move_01.png', crop: { x: 590, y: 32, w: 190, h: 260 } },
  { out: 'asset_player_guanyu_move_02.png', crop: { x: 790, y: 35, w: 178, h: 248 } },
  { out: 'asset_player_guanyu_move_03.png', crop: { x: 970, y: 35, w: 180, h: 248 } },
  { out: 'asset_player_guanyu_move_04.png', crop: { x: 1185, y: 35, w: 180, h: 248 } },
];

function idx(png, x, y) {
  return (y * png.width + x) * 4;
}

function copyCrop(source, crop) {
  const out = new PNG({ width: crop.w, height: crop.h });
  for (let y = 0; y < crop.h; y++) {
    for (let x = 0; x < crop.w; x++) {
      const si = idx(source, crop.x + x, crop.y + y);
      const di = idx(out, x, y);
      out.data[di] = source.data[si];
      out.data[di + 1] = source.data[si + 1];
      out.data[di + 2] = source.data[si + 2];
      out.data[di + 3] = source.data[si + 3];
    }
  }
  return out;
}

function isSheetBackground(png, x, y) {
  const i = idx(png, x, y);
  const r = png.data[i];
  const g = png.data[i + 1];
  const b = png.data[i + 2];
  const a = png.data[i + 3];
  if (a < 16) return true;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const nearBlackBackdrop = max < 78;
  const blueDark = max < 142 && b >= r + 4 && g >= r - 14;
  const desaturatedBackdrop = max < 105 && max - min < 40 && b >= r - 4;
  return nearBlackBackdrop || blueDark || desaturatedBackdrop;
}

function removeConnectedBackground(png) {
  const visited = new Uint8Array(png.width * png.height);
  const queue = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const k = y * png.width + x;
    if (visited[k]) return;
    if (!isSheetBackground(png, x, y)) return;
    visited[k] = 1;
    queue.push([x, y]);
  };

  for (let x = 0; x < png.width; x++) {
    push(x, 0);
    push(x, png.height - 1);
  }
  for (let y = 0; y < png.height; y++) {
    push(0, y);
    push(png.width - 1, y);
  }

  for (let head = 0; head < queue.length; head++) {
    const [x, y] = queue[head];
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (visited[y * png.width + x]) png.data[idx(png, x, y) + 3] = 0;
    }
  }
}

function restoreSilhouetteOutline(png) {
  const originalAlpha = new Uint8Array(png.width * png.height);
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      originalAlpha[y * png.width + x] = png.data[idx(png, x, y) + 3];
    }
  }
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = idx(png, x, y);
      if (png.data[i + 3] !== 0) continue;
      let nearBody = false;
      for (let oy = -2; oy <= 2 && !nearBody; oy++) {
        for (let ox = -2; ox <= 2; ox++) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= png.width || ny >= png.height) continue;
          if (originalAlpha[ny * png.width + nx] > 96) {
            nearBody = true;
            break;
          }
        }
      }
      if (nearBody) {
        png.data[i] = 18;
        png.data[i + 1] = 12;
        png.data[i + 2] = 18;
        png.data[i + 3] = 190;
      }
    }
  }
}

function alphaBounds(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[idx(png, x, y) + 3] > 24) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  return maxX >= minX ? { minX, minY, maxX, maxY } : null;
}

function sampleNearest(source, x, y) {
  const sx = Math.max(0, Math.min(source.width - 1, Math.round(x)));
  const sy = Math.max(0, Math.min(source.height - 1, Math.round(y)));
  const i = idx(source, sx, sy);
  return [
    source.data[i],
    source.data[i + 1],
    source.data[i + 2],
    source.data[i + 3],
  ];
}

function normalizeFrame(source, nudgeX = 0) {
  removeConnectedBackground(source);
  restoreSilhouetteOutline(source);
  const bounds = alphaBounds(source);
  const out = new PNG({ width: FRAME_SIZE, height: FRAME_SIZE });
  if (!bounds) return out;

  const bw = bounds.maxX - bounds.minX + 1;
  const bh = bounds.maxY - bounds.minY + 1;
  const scale = Math.min(188 / bw, 218 / bh);
  const drawW = bw * scale;
  const drawH = bh * scale;
  const targetX = (FRAME_SIZE - drawW) / 2 + nudgeX;
  const targetY = 222 - drawH;

  for (let y = 0; y < FRAME_SIZE; y++) {
    for (let x = 0; x < FRAME_SIZE; x++) {
      const sx = bounds.minX + (x - targetX) / scale;
      const sy = bounds.minY + (y - targetY) / scale;
      if (sx < bounds.minX || sy < bounds.minY || sx > bounds.maxX || sy > bounds.maxY) continue;
      const [r, g, b, a] = sampleNearest(source, sx, sy);
      const di = idx(out, x, y);
      out.data[di] = r;
      out.data[di + 1] = g;
      out.data[di + 2] = b;
      out.data[di + 3] = a;
    }
  }
  return out;
}

function blit(dst, src, ox, oy, scale = 1) {
  const w = Math.round(src.width * scale);
  const h = Math.round(src.height * scale);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = sampleNearest(src, x / scale, y / scale);
      const di = idx(dst, ox + x, oy + y);
      dst.data[di] = r;
      dst.data[di + 1] = g;
      dst.data[di + 2] = b;
      dst.data[di + 3] = a;
    }
  }
}

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Player source sheet not found: ${sourcePath}`);
}

const sheet = PNG.sync.read(fs.readFileSync(sourcePath));
const generated = [];
for (const spec of OUTPUTS) {
  const frame = normalizeFrame(copyCrop(sheet, spec.crop), spec.nudgeX || 0);
  fs.writeFileSync(path.join(playerDir, spec.out), PNG.sync.write(frame));
  generated.push(path.join('assets', 'player', spec.out));
}

const proof = new PNG({ width: FRAME_SIZE * OUTPUTS.length, height: FRAME_SIZE });
for (let i = 0; i < OUTPUTS.length; i++) {
  const frame = PNG.sync.read(fs.readFileSync(path.join(playerDir, OUTPUTS[i].out)));
  blit(proof, frame, i * FRAME_SIZE, 0);
}
fs.writeFileSync(path.join(proofDir, 'player-guanyu-preview.png'), PNG.sync.write(proof));

console.log(JSON.stringify({
  source: sourcePath,
  player: 'guanyu',
  generated,
  proof: 'assets/style-proofs/player-guanyu-preview.png',
}, null, 2));
