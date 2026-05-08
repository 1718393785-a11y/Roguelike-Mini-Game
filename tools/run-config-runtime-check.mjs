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
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome not found. Set CHROME_PATH or install Google Chrome.');
  const { server, baseUrl } = await createServer();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const url = new URL('/index.html', baseUrl);
    url.searchParams.set('seed', '12345');
    url.searchParams.set('ENABLE_JSON_CONFIG', '1');
    url.searchParams.set('ENABLE_GAME_SETTINGS', '1');
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SPEC_CONFIG_APPLIED__?.weapons > 0, null, { timeout: 10000 });

    const report = await page.evaluate(() => ({
      loaded: window.__JSON_CONFIG_LOADED__,
      applied: window.__SPEC_CONFIG_APPLIED__,
      hasRuntimeSpec: Boolean(window.__RUNTIME_SPEC_CONFIG__?.weapons && window.__RUNTIME_SPEC_CONFIG__?.waves),
      stageCount: window.__RUNTIME_SPEC_CONFIG__?.waves?.stages?.length ?? 0,
      firstStageName: window.__RUNTIME_SPEC_CONFIG__?.waves?.stages?.[0]?.name ?? null,
      playerSpeed: window.getGameSetting?.('PLAYER.BASE_SPEED', null),
      propHp: window.getGameSetting?.('PROPS.DESTRUCTIBLE.HP', null),
    }));

    const ok = Boolean(
      report.loaded?.weapons >= 6 &&
      report.loaded?.enemies >= 6 &&
      report.loaded?.waves >= 5 &&
      report.hasRuntimeSpec &&
      report.playerSpeed === 200 &&
      report.propHp === 30
    );

    await fs.mkdir(path.join(rootDir, 'reports'), { recursive: true });
    await fs.writeFile(path.join(rootDir, 'reports/config-runtime-check.json'), JSON.stringify({
      type: 'config-runtime-check',
      chromePath,
      ...report,
      ok,
    }, null, 2));

    if (!ok) throw new Error('Runtime config check failed. See reports/config-runtime-check.json.');
    console.log('Runtime config check OK');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
