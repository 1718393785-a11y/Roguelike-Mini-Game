import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const root = process.cwd();
const uiDir = path.join(root, 'assets', 'ui');
const proofDir = path.join(root, 'assets', 'style-proofs');
fs.mkdirSync(uiDir, { recursive: true });
fs.mkdirSync(proofDir, { recursive: true });

const UI_ASSETS = [
  { id: 'menu_panel', file: 'asset_ui_menu_panel.png', size: [1024, 768], theme: 'menu' },
  { id: 'button_frame', file: 'asset_ui_button_frame.png', size: [512, 160], theme: 'button' },
  { id: 'upgrade_card', file: 'asset_ui_upgrade_card_frame.png', size: [512, 768], theme: 'card' },
  { id: 'dialog_panel', file: 'asset_ui_dialog_panel.png', size: [1200, 760], theme: 'dialog' },
  { id: 'hud_bar_frame', file: 'asset_ui_hud_bar_frame.png', size: [768, 96], theme: 'hud' },
  { id: 'status_panel', file: 'asset_ui_status_panel.png', size: [512, 1024], theme: 'status' },
  { id: 'warning_banner', file: 'asset_ui_warning_banner.png', size: [1200, 220], theme: 'warning' },
  { id: 'pause_panel', file: 'asset_ui_pause_panel.png', size: [720, 360], theme: 'pause' },
];

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

function fillRect(png, x, y, w, h, hex, alpha = 1) {
  const color = hexToRgb(hex);
  for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
    for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
      blendPixel(png, xx, yy, color, alpha);
    }
  }
}

function line(png, x1, y1, x2, y2, width, hex, alpha = 1) {
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
      const d = Math.hypot(x - px, y - py);
      if (d <= width) blendPixel(png, x, y, color, alpha * Math.min(1, width - d + 1));
    }
  }
}

function roundedRect(png, x, y, w, h, radius, fill, fillAlpha, border, borderAlpha, borderWidth = 3) {
  const fillColor = hexToRgb(fill);
  const borderColor = hexToRgb(border);
  for (let yy = Math.floor(y); yy < Math.ceil(y + h); yy++) {
    for (let xx = Math.floor(x); xx < Math.ceil(x + w); xx++) {
      const left = x + radius;
      const right = x + w - radius - 1;
      const top = y + radius;
      const bottom = y + h - radius - 1;
      const cx = xx < left ? left : (xx > right ? right : xx);
      const cy = yy < top ? top : (yy > bottom ? bottom : yy);
      const d = Math.hypot(xx - cx, yy - cy);
      if (d > radius) continue;
      const edgeDist = Math.min(xx - x, x + w - 1 - xx, yy - y, y + h - 1 - yy, radius - d);
      const isBorder = edgeDist <= borderWidth;
      blendPixel(png, xx, yy, isBorder ? borderColor : fillColor, isBorder ? borderAlpha : fillAlpha);
    }
  }
}

function radialGlow(png, cx, cy, radius, hex, alpha = 1, squeezeY = 1) {
  const color = hexToRgb(hex);
  for (let y = Math.floor(cy - radius * squeezeY); y <= Math.ceil(cy + radius * squeezeY); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const d = Math.hypot(x - cx, (y - cy) / squeezeY);
      if (d <= radius) {
        const t = 1 - d / radius;
        blendPixel(png, x, y, color, alpha * t * t);
      }
    }
  }
}

function drawCornerBrackets(png, x, y, w, h, color, alpha = 1, scale = 1) {
  const len = 78 * scale;
  const inset = 22 * scale;
  const width = 5 * scale;
  line(png, x + inset, y + inset, x + inset + len, y + inset, width, color, alpha);
  line(png, x + inset, y + inset, x + inset, y + inset + len, width, color, alpha);
  line(png, x + w - inset, y + inset, x + w - inset - len, y + inset, width, color, alpha);
  line(png, x + w - inset, y + inset, x + w - inset, y + inset + len, width, color, alpha);
  line(png, x + inset, y + h - inset, x + inset + len, y + h - inset, width, color, alpha);
  line(png, x + inset, y + h - inset, x + inset, y + h - inset - len, width, color, alpha);
  line(png, x + w - inset, y + h - inset, x + w - inset - len, y + h - inset, width, color, alpha);
  line(png, x + w - inset, y + h - inset, x + w - inset, y + h - inset - len, width, color, alpha);
}

function drawRunes(png, cx, cy, radius, count, color, alpha = 1) {
  for (let i = 0; i < count; i++) {
    const angle = i * Math.PI * 2 / count;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    line(png, x - Math.cos(angle) * 13, y - Math.sin(angle) * 13, x + Math.cos(angle) * 13, y + Math.sin(angle) * 13, 2, color, alpha);
    line(png, x - Math.sin(angle) * 8, y + Math.cos(angle) * 8, x + Math.sin(angle) * 8, y - Math.cos(angle) * 8, 1.5, '#42e9ff', alpha * 0.65);
  }
}

function drawPanelTexture(png, theme) {
  const w = png.width;
  const h = png.height;
  radialGlow(png, w * 0.5, h * 0.42, Math.min(w, h) * 0.58, '#18424a', 0.22, 0.75);
  radialGlow(png, w * 0.5, h * 0.5, Math.min(w, h) * 0.48, '#c18423', 0.12, 0.9);
  roundedRect(png, 18, 18, w - 36, h - 36, 20, '#101217', theme === 'menu' ? 0.72 : 0.8, '#b8860b', 0.86, 4);
  roundedRect(png, 38, 38, w - 76, h - 76, 14, '#0b1015', 0.32, '#42e9ff', 0.26, 2);
  drawCornerBrackets(png, 20, 20, w - 40, h - 40, '#f0c46a', 0.74, Math.min(w, h) / 768);
  for (let i = 0; i < 9; i++) {
    const y = 64 + i * ((h - 128) / 8);
    line(png, 76, y, w - 76, y, 1, i % 2 ? '#42e9ff' : '#b8860b', 0.06);
  }
  drawRunes(png, w * 0.5, h * 0.5, Math.min(w, h) * 0.37, 18, '#d6a545', 0.16);
}

function drawButtonTexture(png) {
  const w = png.width;
  const h = png.height;
  radialGlow(png, w * 0.5, h * 0.5, w * 0.42, '#2f7d52', 0.34, 0.24);
  roundedRect(png, 10, 10, w - 20, h - 20, 16, '#18251f', 0.86, '#e0c071', 0.86, 4);
  roundedRect(png, 24, 24, w - 48, h - 48, 10, '#0d1518', 0.28, '#42e9ff', 0.28, 2);
  line(png, 54, h * 0.5, 154, h * 0.5, 3, '#b8860b', 0.52);
  line(png, w - 54, h * 0.5, w - 154, h * 0.5, 3, '#b8860b', 0.52);
  drawCornerBrackets(png, 8, 8, w - 16, h - 16, '#f0c46a', 0.72, 0.45);
}

function drawUpgradeCardTexture(png) {
  const w = png.width;
  const h = png.height;
  radialGlow(png, w * 0.5, h * 0.26, w * 0.43, '#c18423', 0.24, 0.72);
  radialGlow(png, w * 0.5, h * 0.5, h * 0.48, '#42e9ff', 0.12, 0.8);
  roundedRect(png, 18, 18, w - 36, h - 36, 12, '#14161b', 0.88, '#b8860b', 0.9, 5);
  roundedRect(png, 36, 36, w - 72, h - 72, 8, '#090d12', 0.24, '#42e9ff', 0.24, 2);
  drawCornerBrackets(png, 18, 18, w - 36, h - 36, '#f0c46a', 0.7, 0.62);
  for (let i = 0; i < 5; i++) {
    line(png, 66, 182 + i * 74, w - 66, 182 + i * 74, 1.5, i % 2 ? '#42e9ff' : '#b8860b', 0.1);
  }
  drawRunes(png, w * 0.5, h * 0.52, w * 0.31, 12, '#d6a545', 0.14);
}

function drawHudTexture(png) {
  const w = png.width;
  const h = png.height;
  roundedRect(png, 8, 8, w - 16, h - 16, 8, '#071014', 0.78, '#b8860b', 0.78, 3);
  roundedRect(png, 24, 26, w - 48, h - 52, 4, '#0b1a1f', 0.6, '#42e9ff', 0.28, 2);
  line(png, 34, h * 0.5, w - 34, h * 0.5, 2, '#42e9ff', 0.16);
  drawCornerBrackets(png, 8, 8, w - 16, h - 16, '#f0c46a', 0.52, 0.32);
}

function drawStatusPanelTexture(png) {
  const w = png.width;
  const h = png.height;
  radialGlow(png, w * 0.5, h * 0.22, w * 0.55, '#18424a', 0.2, 1.1);
  roundedRect(png, 16, 16, w - 32, h - 32, 10, '#070b10', 0.72, '#9a741f', 0.72, 3);
  roundedRect(png, 32, 32, w - 64, h - 64, 6, '#081317', 0.2, '#42e9ff', 0.22, 1.5);
  for (let i = 0; i < 17; i++) {
    const y = 70 + i * ((h - 140) / 16);
    line(png, 44, y, w - 44, y, 1, i % 2 ? '#42e9ff' : '#b8860b', 0.08);
  }
  drawCornerBrackets(png, 14, 14, w - 28, h - 28, '#f0c46a', 0.58, 0.54);
}

function drawWarningBannerTexture(png) {
  const w = png.width;
  const h = png.height;
  radialGlow(png, w * 0.5, h * 0.5, w * 0.38, '#9a1620', 0.34, 0.22);
  radialGlow(png, w * 0.5, h * 0.5, w * 0.46, '#42e9ff', 0.1, 0.2);
  roundedRect(png, 18, 18, w - 36, h - 36, 14, '#10080a', 0.76, '#c8372d', 0.82, 4);
  roundedRect(png, 42, 46, w - 84, h - 92, 8, '#120f0f', 0.35, '#f0c46a', 0.52, 2);
  line(png, 96, h * 0.5, w - 96, h * 0.5, 3, '#f0c46a', 0.28);
  drawCornerBrackets(png, 18, 18, w - 36, h - 36, '#ffef9a', 0.68, 0.46);
}

function drawPausePanelTexture(png) {
  const w = png.width;
  const h = png.height;
  radialGlow(png, w * 0.5, h * 0.48, w * 0.42, '#18424a', 0.3, 0.52);
  roundedRect(png, 16, 16, w - 32, h - 32, 14, '#081014', 0.84, '#b8860b', 0.82, 4);
  roundedRect(png, 38, 38, w - 76, h - 76, 8, '#05080c', 0.26, '#42e9ff', 0.28, 2);
  line(png, 120, h * 0.5, w - 120, h * 0.5, 2, '#42e9ff', 0.18);
  drawCornerBrackets(png, 16, 16, w - 32, h - 32, '#f0c46a', 0.7, 0.58);
}

function createAsset(spec) {
  const [width, height] = spec.size;
  const png = new PNG({ width, height, colorType: 6 });
  if (spec.theme === 'button') drawButtonTexture(png);
  else if (spec.theme === 'card') drawUpgradeCardTexture(png);
  else if (spec.theme === 'hud') drawHudTexture(png);
  else if (spec.theme === 'status') drawStatusPanelTexture(png);
  else if (spec.theme === 'warning') drawWarningBannerTexture(png);
  else if (spec.theme === 'pause') drawPausePanelTexture(png);
  else drawPanelTexture(png, spec.theme);
  fs.writeFileSync(path.join(uiDir, spec.file), PNG.sync.write(png));
  return png;
}

function blitScaled(dst, src, dx, dy, dw, dh) {
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = Math.floor(x * src.width / dw);
      const sy = Math.floor(y * src.height / dh);
      const si = (src.width * sy + sx) << 2;
      const color = { r: src.data[si], g: src.data[si + 1], b: src.data[si + 2] };
      blendPixel(dst, dx + x, dy + y, color, src.data[si + 3] / 255);
    }
  }
}

const generated = UI_ASSETS.map(spec => ({ spec, png: createAsset(spec) }));
const preview = new PNG({ width: 1200, height: 780, colorType: 6 });
fillRect(preview, 0, 0, preview.width, preview.height, '#111318', 1);
blitScaled(preview, generated[0].png, 36, 40, 360, 270);
blitScaled(preview, generated[1].png, 454, 78, 320, 100);
blitScaled(preview, generated[2].png, 834, 36, 250, 375);
blitScaled(preview, generated[3].png, 70, 356, 620, 392);
blitScaled(preview, generated[4].png, 760, 538, 360, 45);
blitScaled(preview, generated[5].png, 812, 420, 210, 330);
blitScaled(preview, generated[6].png, 420, 208, 430, 80);
blitScaled(preview, generated[7].png, 806, 600, 300, 150);
fs.writeFileSync(path.join(proofDir, 'ui-skin-preview.png'), PNG.sync.write(preview));

console.log(JSON.stringify({
  uiAssets: UI_ASSETS.length,
  proof: 'assets/style-proofs/ui-skin-preview.png',
  generated: UI_ASSETS.map(spec => `assets/ui/${spec.file}`),
}, null, 2));
