import http from 'node:http';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter(Boolean);
  return candidates.find(candidate => existsSync(candidate));
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'text/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  return 'application/octet-stream';
}

async function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const filePath = path.resolve(rootDir, `.${requested}`);
      if (!filePath.startsWith(rootDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      const data = await fs.readFile(filePath);
      res.writeHead(200, { 'Content-Type': contentType(filePath), 'Cache-Control': 'no-store' });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
  };
}

function countVisiblePixels(buffer) {
  const png = PNG.sync.read(buffer);
  let visible = 0;
  for (let offset = 0; offset < png.data.length; offset += 4) {
    const r = png.data[offset];
    const g = png.data[offset + 1];
    const b = png.data[offset + 2];
    const a = png.data[offset + 3];
    if (a > 0 && r + g + b > 24) visible++;
  }
  return visible;
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome not found. Set CHROME_PATH or install Google Chrome.');
  const { server, baseUrl } = await createServer();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const url = new URL('/index.html', baseUrl);
    url.searchParams.set('ENABLE_JSON_CONFIG', '1');
    url.searchParams.set('ENABLE_SYSTEM_SPLIT', '1');
    url.searchParams.set('ENABLE_GENERIC_WEAPON', '1');
    url.searchParams.set('ENABLE_PIXI_RENDERER', '1');
    url.searchParams.set('ENABLE_HOT_RELOAD', '1');
    url.searchParams.set('seed', '12345');
    url.searchParams.set('debugInitialWeapon', 'saber');
    await page.goto(url.toString());
    await page.waitForFunction(() => window.__JSON_CONFIG_LOADED__?.weapons > 0);
    await page.evaluate(() => window.gameManager.startNewGame());
    await page.waitForFunction(() => {
      const status = window.__PIXI_RENDERER_STATUS__;
      return status?.ready && status.frames > 0 && status.presentingCanvasFrame && status.activeSprites > 0;
    }, null, { timeout: 10000 });

    const screenshotDir = path.join(rootDir, 'reports');
    await fs.mkdir(screenshotDir, { recursive: true });
    const screenshotPath = path.join(screenshotDir, 'pixi-overlay.png');
    const dataUrl = await page.evaluate(() => document.getElementById('pixiOverlayCanvas').toDataURL('image/png'));
    const buffer = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    await fs.writeFile(screenshotPath, buffer);
    const visiblePixels = countVisiblePixels(buffer);
    const status = await page.evaluate(() => window.__PIXI_RENDERER_STATUS__);
    const report = {
      type: 'pixi-renderer-check',
      chromePath,
      status,
      screenshotPath,
      visiblePixels,
      ok: Boolean(
        status?.ready &&
        status.frames > 0 &&
        status.presentingCanvasFrame &&
        status.presentationMode === 'canvas-frame-texture' &&
        status.activeSprites > 0 &&
        visiblePixels > 0
      ),
    };
    await fs.writeFile(path.join(rootDir, 'reports', 'pixi-renderer-check.json'), JSON.stringify(report, null, 2));
    if (!report.ok) throw new Error('Pixi renderer check failed. See reports/pixi-renderer-check.json.');
    console.log(`Pixi renderer check OK: ${visiblePixels} visible pixels`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
