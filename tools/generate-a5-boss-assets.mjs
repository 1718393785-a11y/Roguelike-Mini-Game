import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const sourceRoot = process.env.BOSS_SOURCE_ROOT || 'D:\\Claude code\\.claude\\games\\时空骇客过五关\\测试\\assets\\5种大boss';
const bossDir = path.join(root, 'assets', 'bosses');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(bossDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

const FRAME_SIZE = 256;
const BOSSES = [
  { id: 'kongxiu', source: 'Kong Xiu_atlas.png', atlas: 'Kong Xiu_atlas.json', frame: 'Kong Xiu_00.png', out: 'asset_boss_kongxiu_idle_01.png' },
  { id: 'hanfu', source: 'Han Fu_atlas.png', atlas: 'Han Fu_atlas.json', frame: 'Han Fu_00.png', out: 'asset_boss_hanfu_idle_01.png' },
  { id: 'bianxi', source: 'Bian Xi_atlas.png', atlas: 'Bian Xi_atlas.json', frame: 'Bian Xi_00.png', out: 'asset_boss_bianxi_idle_01.png' },
  { id: 'wangzhi', source: 'Wang Zhi_atlas.png', atlas: 'Wang Zhi_atlas.json', frame: 'Wang Zhi_00.png', out: 'asset_boss_wangzhi_idle_01.png' },
  { id: 'qinqi', source: 'Qin Qi_atlas.png', atlas: 'Qin Qi_atlas.json', frame: 'Qin Qi_00.png', out: 'asset_boss_qinqi_idle_01.png' },
];

function idx(png, x, y) {
  return (y * png.width + x) * 4;
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

function cropFromAtlas(source, frame) {
  const out = new PNG({ width: frame.w, height: frame.h });
  for (let y = 0; y < frame.h; y++) {
    for (let x = 0; x < frame.w; x++) {
      const si = idx(source, frame.x + x, frame.y + y);
      const di = idx(out, x, y);
      out.data[di] = source.data[si];
      out.data[di + 1] = source.data[si + 1];
      out.data[di + 2] = source.data[si + 2];
      out.data[di + 3] = source.data[si + 3];
    }
  }
  return out;
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

function normalizeFrame(source) {
  const bounds = alphaBounds(source);
  const out = new PNG({ width: FRAME_SIZE, height: FRAME_SIZE });
  if (!bounds) return out;
  const bw = bounds.maxX - bounds.minX + 1;
  const bh = bounds.maxY - bounds.minY + 1;
  const scale = Math.min(218 / bw, 226 / bh);
  const drawW = bw * scale;
  const drawH = bh * scale;
  const targetX = (FRAME_SIZE - drawW) / 2;
  const targetY = 226 - drawH;

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

function blit(dst, src, ox, oy) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = idx(src, x, y);
      const di = idx(dst, ox + x, oy + y);
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

const generated = [];
for (const boss of BOSSES) {
  const atlasPath = path.join(sourceRoot, boss.atlas);
  const imagePath = path.join(sourceRoot, boss.source);
  const atlas = JSON.parse(fs.readFileSync(atlasPath, 'utf8'));
  const source = PNG.sync.read(fs.readFileSync(imagePath));
  const frame = atlas.frames[boss.frame]?.frame;
  if (!frame) throw new Error(`Missing frame ${boss.frame} in ${atlasPath}`);
  const normalized = normalizeFrame(cropFromAtlas(source, frame));
  fs.writeFileSync(path.join(bossDir, boss.out), PNG.sync.write(normalized));
  generated.push({ id: boss.id, output: path.join('assets', 'bosses', boss.out) });
}

const proof = new PNG({ width: FRAME_SIZE * BOSSES.length, height: FRAME_SIZE });
BOSSES.forEach((boss, index) => {
  const frame = PNG.sync.read(fs.readFileSync(path.join(bossDir, boss.out)));
  blit(proof, frame, index * FRAME_SIZE, 0);
});
fs.writeFileSync(path.join(proofDir, 'boss-sprite-preview.png'), PNG.sync.write(proof));

console.log(JSON.stringify({
  sourceRoot,
  generated,
  proof: 'assets/style-proofs/boss-sprite-preview.png',
}, null, 2));
