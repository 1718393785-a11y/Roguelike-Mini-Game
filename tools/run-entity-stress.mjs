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
    url.searchParams.set('ENABLE_LARGE_MAP_CAMERA', '1');
    url.searchParams.set('ENABLE_SCROLLING_BACKGROUND', '1');
    await page.goto(url.toString());
    await page.evaluate(() => window.gameManager.startNewGame());
    await page.evaluate(() => {
      const gm = window.gameManager;
      gm.activeWeapons = [];
      gm.player.weapons = [];
      gm.player.hp = 999999;
      gm.player.maxHp = 999999;
      gm.enemies = [];
      const centerX = gm.player.x;
      const centerY = gm.player.y;
      for (let i = 0; i < 2000; i++) {
        const angle = (Math.PI * 2 * i) / 2000;
        const radius = 450 + (i % 20) * 18;
        const enemy = new Enemy(
          centerX + Math.cos(angle) * radius,
          centerY + Math.sin(angle) * radius,
          999999,
          0.8
        );
        gm.enemies.push(enemy);
      }
      gm.rebuildSpatialGrid();
    });

    const result = await page.evaluate(async () => {
      let frames = 0;
      const start = performance.now();
      await new Promise(resolve => {
        function tick() {
          frames++;
          if (performance.now() - start >= 5000) {
            resolve();
            return;
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
      const durationSeconds = (performance.now() - start) / 1000;
      const gm = window.gameManager;
      return {
        durationSeconds,
        frames,
        averageFps: frames / durationSeconds,
        enemyCount: gm.enemies.length,
        projectileCount: gm.projectiles.length,
        gameState: gm.gameState,
      };
    });

    const report = {
      type: 'entity-stress',
      chromePath,
      targetEnemies: 2000,
      ...result,
      ok: result.averageFps >= 15 && result.enemyCount >= 1900,
    };
    await fs.mkdir(path.join(rootDir, 'reports'), { recursive: true });
    await fs.writeFile(path.join(rootDir, 'reports', 'entity-stress.json'), JSON.stringify(report, null, 2));
    if (!report.ok) throw new Error('Entity stress check failed. See reports/entity-stress.json.');
    console.log(`Entity stress OK: ${report.enemyCount} enemies, ${report.averageFps.toFixed(1)} fps`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
