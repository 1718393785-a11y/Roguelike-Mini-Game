import http from 'node:http';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

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
  const originalWeapons = JSON.parse(await fs.readFile(path.join(rootDir, 'src/spec/weapons.json'), 'utf8'));
  const hotWeapons = structuredClone(originalWeapons);
  hotWeapons.saber.damage = 777;
  let serveHotWeapons = false;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      if (requested === '/src/spec/weapons.json') {
        const body = JSON.stringify(serveHotWeapons ? hotWeapons : originalWeapons);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(body);
        return;
      }

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
    enableHotWeapons: () => {
      serveHotWeapons = true;
    },
  };
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome not found. Set CHROME_PATH or install Google Chrome.');
  const { server, baseUrl, enableHotWeapons } = await createServer();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const url = new URL('/index.html', baseUrl);
    url.searchParams.set('ENABLE_JSON_CONFIG', '1');
    url.searchParams.set('ENABLE_GENERIC_WEAPON', '1');
    url.searchParams.set('ENABLE_HOT_RELOAD', '1');
    url.searchParams.set('debugInitialWeapon', 'saber');
    await page.goto(url.toString());
    await page.waitForFunction(() => window.__JSON_CONFIG_LOADED__?.weapons > 0);
    await page.evaluate(() => window.gameManager.startNewGame());
    const before = await page.evaluate(() => ({
      damage: window.gameManager.activeWeapons[0].baseDamage,
      poisonPill: window.__HOT_RELOAD_STATUS__?.poisonPill ?? 0,
    }));

    enableHotWeapons();
    await page.waitForFunction(() => {
      const weapon = window.gameManager?.activeWeapons?.[0];
      return window.__HOT_RELOAD_STATUS__?.poisonPill >= 1 && weapon?.baseDamage === 777;
    }, null, { timeout: 5000 });

    const after = await page.evaluate(() => ({
      damage: window.gameManager.activeWeapons[0].baseDamage,
      poisonPill: window.__HOT_RELOAD_STATUS__.poisonPill,
      hash: window.__HOT_RELOAD_STATUS__.weaponConfigHash,
    }));

    await fs.mkdir(path.join(rootDir, 'reports'), { recursive: true });
    await fs.writeFile(path.join(rootDir, 'reports/hot-reload-check.json'), JSON.stringify({
      type: 'hot-reload-check',
      chromePath,
      before,
      after,
      ok: before.damage !== after.damage && after.damage === 777 && after.poisonPill > before.poisonPill,
    }, null, 2));

    if (after.damage !== 777 || after.poisonPill <= before.poisonPill) {
      throw new Error('Hot reload check failed. See reports/hot-reload-check.json.');
    }
    console.log('Hot reload browser check OK');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
