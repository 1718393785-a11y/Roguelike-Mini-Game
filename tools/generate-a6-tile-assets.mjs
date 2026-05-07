import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const sourceRoot = process.env.TILE_SOURCE_ROOT
  || 'D:\\Claude code\\.claude\\games\\时空骇客过五关\\测试\\assets\\map';
const tileDir = path.join(root, 'assets', 'tiles');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(tileDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

const TILE_SIZE = 512;
const TILES = [
  { id: 'normal', source: '普通地图材质.png', out: 'asset_tile_normal.png' },
  { id: 'fire', source: '火焰地图材质.png', out: 'asset_tile_fire.png' },
  { id: 'void', source: '黑洞地图材质.png', out: 'asset_tile_void.png' },
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

function resizeToTile(source) {
  const out = new PNG({ width: TILE_SIZE, height: TILE_SIZE });
  const scaleX = source.width / TILE_SIZE;
  const scaleY = source.height / TILE_SIZE;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      const [r, g, b, a] = sampleNearest(source, x * scaleX, y * scaleY);
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
for (const tile of TILES) {
  const sourcePath = path.join(sourceRoot, tile.source);
  if (!fs.existsSync(sourcePath)) throw new Error(`Tile source not found: ${sourcePath}`);
  const source = PNG.sync.read(fs.readFileSync(sourcePath));
  const output = resizeToTile(source);
  const outPath = path.join(tileDir, tile.out);
  fs.writeFileSync(outPath, PNG.sync.write(output));
  generated.push({ id: tile.id, output: path.join('assets', 'tiles', tile.out) });
}

const proof = new PNG({ width: TILE_SIZE * TILES.length, height: TILE_SIZE });
TILES.forEach((tile, index) => {
  const frame = PNG.sync.read(fs.readFileSync(path.join(tileDir, tile.out)));
  blit(proof, frame, index * TILE_SIZE, 0);
});
fs.writeFileSync(path.join(proofDir, 'tile-texture-preview.png'), PNG.sync.write(proof));

console.log(JSON.stringify({
  sourceRoot,
  generated,
  proof: 'assets/style-proofs/tile-texture-preview.png',
}, null, 2));
