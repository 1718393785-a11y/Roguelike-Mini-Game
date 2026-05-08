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
  if (ext === '.png') return 'image/png';
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

function setReleaseFlags(url) {
  const flags = [
    'ENABLE_JSON_CONFIG',
    'ENABLE_SYSTEM_SPLIT',
    'ENABLE_GENERIC_WEAPON',
    'ENABLE_PIXI_RENDERER',
    'ENABLE_HOT_RELOAD',
    'ENABLE_PLAYER_IFRAME',
    'ENABLE_HIT_KNOCKBACK',
    'ENABLE_LOW_HP_WARNING',
    'ENABLE_ELITE_MUTATIONS',
    'ENABLE_BOSS_AFFIXES',
    'ENABLE_GAME_SETTINGS',
    'ENABLE_WEAPON_COOLDOWN_HUD',
    'ENABLE_AUDIO_MANAGER',
    'ENABLE_DESTRUCTIBLE_PROPS',
    'ENABLE_LARGE_MAP_CAMERA',
    'ENABLE_SCROLLING_BACKGROUND',
    'ENABLE_ART_ASSETS',
    'ENABLE_ART_WEAPON_ICONS',
    'ENABLE_ART_SKILL_ICONS',
    'ENABLE_ART_PICKUPS',
    'ENABLE_ART_ENEMY_SPRITES',
    'ENABLE_ART_BOSS_SPRITES',
    'ENABLE_ART_PLAYER_SPRITE',
    'ENABLE_ART_TILES',
    'ENABLE_ART_EFFECTS',
    'ENABLE_ART_UI_SKIN',
  ];
  for (const flag of flags) url.searchParams.set(flag, '1');
  url.searchParams.set('seed', '12345');
  url.searchParams.set('debugInitialWeapon', 'saber');
  url.searchParams.set('debugInitialWeaponLevel', '6');
}

async function main() {
  const chromePath = findChrome();
  if (!chromePath) throw new Error('Chrome not found. Set CHROME_PATH or install Google Chrome.');
  const { server, baseUrl } = await createServer();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  const errors = [];

  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => {
      const text = message.text();
      if (message.type() === 'error' && !text.includes('Failed to load resource')) errors.push(text);
    });

    const url = new URL('/index.html', baseUrl);
    setReleaseFlags(url);
    await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__SPEC_CONFIG_APPLIED__?.weapons > 0, null, { timeout: 10000 });
    await page.evaluate(() => window.gameManager.startNewGame());
    await page.waitForFunction(() => window.__PIXI_RENDERER_STATUS__?.presentingCanvasFrame, null, { timeout: 10000 });

    const report = await page.evaluate(async () => {
      const gm = window.gameManager;
      gm.player.hp = 999999;
      gm.player.maxHp = 999999;
      gm.activeWeapons = [];
      gm.player.weapons = [];

      const frame = () => new Promise(resolve => requestAnimationFrame(resolve));
      for (let i = 0; i < 120; i++) await frame();

      const bossResults = [];
      for (let i = 0; i < 5; i++) {
        gm.currentStage = i;
        gm.spawnTimelineBoss(i);
        const boss = gm.enemies.find(enemy => enemy.isBoss && (i < 4 ? !enemy.isFinalBoss : enemy.isFinalBoss));
        if (!boss) {
          bossResults.push({ stage: i, spawned: false });
          continue;
        }
        gm.trySpawnPickup(boss);
        const index = gm.enemies.indexOf(boss);
        if (index >= 0) gm.enemies.splice(index, 1);
        if (i < 4) {
          gm.currentStage = i + 1;
        } else {
          gm.victory();
        }
        bossResults.push({
          stage: i,
          spawned: true,
          finalBoss: Boolean(boss.isFinalBoss),
          pickupsAfterKill: gm.pickups.length,
          stateAfterKill: gm.gameState,
        });
        for (let j = 0; j < 20; j++) await frame();
      }

      for (let i = 0; i < 60; i++) await frame();
      const pixiStatus = window.__PIXI_RENDERER_STATUS__;
      return {
        gameState: gm.gameState,
        isVictory: gm.gameState === 5,
        playerHp: gm.player.hp,
        enemyCount: gm.enemies.length,
        projectileCount: gm.projectiles.length,
        pickupCount: gm.pickups.length,
        currentStage: gm.currentStage,
        bossResults,
        config: window.__SPEC_CONFIG_APPLIED__,
        pixiStatus,
        genericWeaponShadow: window.__GENERIC_WEAPON_SHADOW__ ?? null,
      };
    });

    const ok = Boolean(
      report.isVictory &&
      report.bossResults.length === 5 &&
      report.bossResults.every(item => item.spawned) &&
      report.config?.weapons >= 6 &&
      report.pixiStatus?.presentingCanvasFrame &&
      report.pixiStatus?.frames > 0 &&
      errors.length === 0
    );

    await fs.mkdir(path.join(rootDir, 'reports'), { recursive: true });
    await fs.writeFile(path.join(rootDir, 'reports/release-readiness.json'), JSON.stringify({
      type: 'release-readiness',
      chromePath,
      ...report,
      browserErrors: errors,
      ok,
    }, null, 2));

    if (!ok) throw new Error('Release readiness failed. See reports/release-readiness.json.');
    console.log('Release readiness OK');
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
