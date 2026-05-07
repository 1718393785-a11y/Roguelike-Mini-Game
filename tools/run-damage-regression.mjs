import http from 'node:http';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

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
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`,
  };
}

async function runDamageScenario(browser, baseUrl, scenario) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await context.addInitScript(() => localStorage.clear());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('Failed to load resource')) errors.push(text);
  });

  const url = new URL(baseUrl);
  url.searchParams.set('seed', '12345');
  for (const [key, value] of Object.entries(scenario.query || {})) {
    if (value) url.searchParams.set(key, String(value));
  }

  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.gameManager, null, { timeout: 10000 });

  const result = await page.evaluate(async () => {
    const gm = window.gameManager;
    gm.startNewGame();
    await new Promise(resolve => setTimeout(resolve, 120));

    const resetCombat = () => {
      gm.enemies.length = 0;
      gm.projectiles.length = 0;
      gm.pickups.length = 0;
      gm.player.hp = gm.player.maxHp;
      gm.player.isInvincible = false;
      gm.player.invincibleTimer = 0;
      gm.player.facingDirX = 1;
      gm.player.facingDirY = 0;
      gm.pushbackCooldown = 0;
    };

    resetCombat();
    const contactEnemy = new Enemy(gm.player.x + 8, gm.player.y, 100, 0);
    contactEnemy.hp = 100;
    contactEnemy.size = 20;
    gm.enemies.push(contactEnemy);
    gm.rebuildSpatialGrid();
    const contactCandidates = gm.queryEnemiesInRange(gm.player.x, gm.player.y, 180).length;
    const playerHpBeforeContact = gm.player.hp;
    gm.updateCollisionSystem(1 / 60);
    const playerHpAfterContact = gm.player.hp;

    resetCombat();
    const projectileEnemy = new Enemy(gm.player.x + 30, gm.player.y, 100, 0);
    projectileEnemy.hp = 100;
    projectileEnemy.size = 20;
    gm.enemies.push(projectileEnemy);
    gm.rebuildSpatialGrid();
    const projectile = new Projectile(gm.player.x, gm.player.y, 1, 0, 25);
    projectile.x = projectileEnemy.x;
    projectile.y = projectileEnemy.y;
    projectile.size = 10;
    gm.projectiles.push(projectile);
    const projectileCandidates = gm.queryEnemiesInRange(projectile.x, projectile.y, 100).length;
    gm.updateProjectileSystem(1 / 60);
    const enemyHpAfterProjectile = projectileEnemy.hp;

    resetCombat();
    const saberEnemy = new Enemy(gm.player.x + 45, gm.player.y, 100, 0);
    saberEnemy.hp = 100;
    saberEnemy.size = 20;
    gm.enemies.push(saberEnemy);
    gm.rebuildSpatialGrid();
    const saber = new Saber(18);
    saber.level = 1;
    saber.timer = 0;
    saber.update(1 / 60, gm.player, gm.enemies, gm.projectiles, gm.specialAreas);
    const enemyHpAfterSaber = saberEnemy.hp;

    return {
      contactCandidates,
      playerHpBeforeContact,
      playerHpAfterContact,
      projectileCandidates,
      enemyHpAfterProjectile,
      projectileCountAfterHit: gm.projectiles.length,
      enemyHpAfterSaber,
    };
  });

  await context.close();
  if (errors.length) throw new Error(`${scenario.name} browser errors:\n${errors.join('\n')}`);

  const failures = [];
  if (result.contactCandidates <= 0) failures.push('contact query returned no candidates');
  if (!(result.playerHpAfterContact < result.playerHpBeforeContact)) failures.push('contact damage did not reduce player HP');
  if (result.projectileCandidates <= 0) failures.push('projectile query returned no candidates');
  if (!(result.enemyHpAfterProjectile < 100)) failures.push('projectile damage did not reduce enemy HP');
  if (result.projectileCountAfterHit !== 0) failures.push('projectile was not consumed after hit');
  if (!(result.enemyHpAfterSaber < 100)) failures.push('saber weapon damage did not reduce enemy HP');
  if (failures.length) {
    throw new Error(`${scenario.name} failed:\n${failures.join('\n')}\n${JSON.stringify(result, null, 2)}`);
  }
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.browser && args.browser !== 'chrome') {
    throw new Error('Only --browser chrome is supported in this damage regression runner.');
  }
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error('Chrome was not found. Set CHROME_PATH or install Chrome at the standard Windows path.');
  }

  const scenarios = [
    { name: 'legacy-canvas', query: {} },
    {
      name: 'art-stack',
      query: {
        artPreview: 1,
        artHud: 1,
        artA1A2: 1,
        artEnemies: 1,
        artPlayer: 1,
        artTiles: 1,
        artBosses: 1,
      },
    },
  ];

  const { server, baseUrl } = await createServer();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });
  try {
    const results = [];
    for (const scenario of scenarios) {
      results.push({ scenario: scenario.name, result: await runDamageScenario(browser, baseUrl, scenario) });
    }
    console.log(JSON.stringify({ ok: true, chromePath, results }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
