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

function normalizeRecordPath(recordPath) {
  return recordPath.replaceAll('\\', '/');
}

async function runSnapshot(browser, baseUrl, { seed, record, seconds, flags = {}, query = {} }) {
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
  url.searchParams.set('seed', seed);
  url.searchParams.set('autoplay', normalizeRecordPath(record));
  url.searchParams.set('snapshot', '1');
  url.searchParams.set('baselineSeconds', String(seconds));
  for (const [name, enabled] of Object.entries(flags)) {
    if (enabled) url.searchParams.set(name, '1');
  }
  for (const [name, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== false) url.searchParams.set(name, String(value));
  }
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BASELINE_DONE__, null, { timeout: Math.max(30000, seconds * 2000) });
  const result = await page.evaluate(() => window.__BASELINE_DONE__);
  const genericWeaponShadow = await page.evaluate(() => window.__GENERIC_WEAPON_SHADOW__ ?? null);
  await context.close();
  if (errors.length || result.error) {
    throw new Error(`Browser baseline error: ${[result.error, ...errors].filter(Boolean).join('\n')}`);
  }
  return { snapshots: result.snapshots, genericWeaponShadow };
}

async function runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags, query = {} }) {
  return await runSnapshot(browser, baseUrl, { seed, record, seconds, flags, query });
}

async function runRngProbe(browser, baseUrl, { seed, count }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const url = new URL(baseUrl);
  url.searchParams.set('seed', seed);
  url.searchParams.set('rngProbe', String(count));
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(() => window.__BASELINE_RNG_PROBE__);
  await context.close();
  return result;
}

function diffSnapshots(a, b) {
  const diffs = [];
  const leftSnapshots = Array.isArray(a) ? a : a.snapshots;
  const rightSnapshots = Array.isArray(b) ? b : b.snapshots;
  const len = Math.max(leftSnapshots.length, rightSnapshots.length);
  for (let i = 0; i < len; i++) {
    const left = leftSnapshots[i];
    const right = rightSnapshots[i];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      diffs.push({ index: i, left, right });
      if (diffs.length >= 20) break;
    }
  }
  const bossA = leftSnapshots.findIndex(snapshot => snapshot.bossSpawned);
  const bossB = rightSnapshots.findIndex(snapshot => snapshot.bossSpawned);
  return {
    equal: diffs.length === 0 && leftSnapshots.length === rightSnapshots.length,
    snapshotCountA: leftSnapshots.length,
    snapshotCountB: rightSnapshots.length,
    bossFrameA: bossA >= 0 ? leftSnapshots[bossA].frame : null,
    bossFrameB: bossB >= 0 ? rightSnapshots[bossB].frame : null,
    bossFrameDelta: bossA >= 0 && bossB >= 0 ? Math.abs(leftSnapshots[bossA].frame - rightSnapshots[bossB].frame) : null,
    firstDiffs: diffs,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.browser && args.browser !== 'chrome') {
    throw new Error('Only --browser chrome is supported in this baseline runner.');
  }

  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error('Chrome was not found. Set CHROME_PATH or install Chrome at the standard Windows path.');
  }

  const seed = String(args.seed ?? '12345');
  const seconds = Number(args.seconds ?? 60);
  const record = String(args.record ?? 'records/smoke.json');
  const rngProbe = args['rng-probe'] ? Number(args['rng-probe']) : 0;
  const defaultFlags = {
    ENABLE_JSON_CONFIG: Boolean(args['json-config']),
    ENABLE_SYSTEM_SPLIT: Boolean(args['system-split']),
    ENABLE_GENERIC_WEAPON: Boolean(args['generic-weapon']),
    ENABLE_PIXI_RENDERER: Boolean(args['pixi-renderer']),
    ENABLE_HOT_RELOAD: Boolean(args['hot-reload']),
    ENABLE_PLAYER_IFRAME: Boolean(args['player-iframe']),
    ENABLE_HIT_KNOCKBACK: Boolean(args['hit-knockback']),
    ENABLE_LOW_HP_WARNING: Boolean(args['low-hp-warning']),
    ENABLE_ELITE_MUTATIONS: Boolean(args['elite-mutations']),
    ENABLE_BOSS_AFFIXES: Boolean(args['boss-affixes']),
    ENABLE_GAME_SETTINGS: Boolean(args['game-settings']),
    ENABLE_WEAPON_COOLDOWN_HUD: Boolean(args['weapon-cooldown-hud']),
    ENABLE_AUDIO_MANAGER: Boolean(args['audio-manager']),
    ENABLE_DESTRUCTIBLE_PROPS: Boolean(args['destructible-props']),
    ENABLE_LARGE_MAP_CAMERA: Boolean(args['large-map-camera']),
    ENABLE_SCROLLING_BACKGROUND: Boolean(args['scrolling-background']),
    ENABLE_ART_ASSETS: Boolean(args['art-assets']),
    ENABLE_ART_WEAPON_ICONS: Boolean(args['art-weapon-icons']),
    ENABLE_ART_SKILL_ICONS: Boolean(args['art-skill-icons']),
    ENABLE_ART_PICKUPS: Boolean(args['art-pickups']),
    ENABLE_ART_ENEMY_SPRITES: Boolean(args['art-enemy-sprites']),
    ENABLE_ART_PLAYER_SPRITE: Boolean(args['art-player-sprite']),
    ENABLE_ART_EFFECTS: Boolean(args['art-effects']),
    ENABLE_ART_UI_SKIN: Boolean(args['art-ui-skin']),
    ENABLE_ART_PIXI_TEXTURES: Boolean(args['art-pixi-textures']),
    ENABLE_ART_DEBUG_PREVIEW: Boolean(args['art-preview']),
  };
  if (args['art-hud']) {
    defaultFlags.ENABLE_ART_ASSETS = true;
    defaultFlags.ENABLE_ART_WEAPON_ICONS = true;
    defaultFlags.ENABLE_WEAPON_COOLDOWN_HUD = true;
  }
  if (args['art-a1-a2']) {
    defaultFlags.ENABLE_ART_ASSETS = true;
    defaultFlags.ENABLE_ART_SKILL_ICONS = true;
    defaultFlags.ENABLE_ART_PICKUPS = true;
  }
  if (args['art-enemies']) {
    defaultFlags.ENABLE_ART_ASSETS = true;
    defaultFlags.ENABLE_ART_ENEMY_SPRITES = true;
  }
  if (Object.entries(defaultFlags).some(([name, enabled]) => name.startsWith('ENABLE_ART_') && name !== 'ENABLE_ART_ASSETS' && enabled)) {
    defaultFlags.ENABLE_ART_ASSETS = true;
  }
  await fs.mkdir(path.join(rootDir, 'reports'), { recursive: true });
  const { server, baseUrl } = await createServer();
  const browser = await chromium.launch({ executablePath: chromePath, headless: true });

  try {
    if (args['compare-json-config']) {
      const legacy = await runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags: {} });
      const jsonConfig = await runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags: { ENABLE_JSON_CONFIG: true } });
      const diff = diffSnapshots(legacy, jsonConfig);
      const report = {
        type: 'json-config-flag-compare',
        seed,
        seconds,
        record,
        chromePath,
        legacyFlag: false,
        jsonConfigFlag: true,
        ...diff,
      };
      await fs.writeFile(path.join(rootDir, 'reports', 'json-config-compare.json'), JSON.stringify(report, null, 2));
      if (!diff.equal) throw new Error('JSON config flag output differs from legacy. See reports/json-config-compare.json.');
      console.log(`JSON config compare OK: ${diff.snapshotCountA} frames, zero diff.`);
      return;
    }

    if (args['compare-system-split']) {
      const legacy = await runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags: {} });
      const systemSplit = await runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags: { ENABLE_SYSTEM_SPLIT: true } });
      const diff = diffSnapshots(legacy, systemSplit);
      const report = {
        type: 'system-split-flag-compare',
        seed,
        seconds,
        record,
        chromePath,
        legacyFlag: false,
        systemSplitFlag: true,
        ...diff,
      };
      await fs.writeFile(path.join(rootDir, 'reports', 'system-split-compare.json'), JSON.stringify(report, null, 2));
      if (!diff.equal) throw new Error('System split flag output differs from legacy. See reports/system-split-compare.json.');
      console.log(`System split compare OK: ${diff.snapshotCountA} frames, zero diff.`);
      return;
    }

    if (args['compare-enabled-flags']) {
      const enabledFlags = Object.fromEntries(Object.entries(defaultFlags).filter(([, enabled]) => enabled));
      const legacy = await runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags: {} });
      const enabled = await runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags: enabledFlags });
      const diff = diffSnapshots(legacy, enabled);
      const genericDpsThreshold = Number(args['generic-dps-threshold'] ?? 0.01);
      const genericWeaponShadow = enabled.genericWeaponShadow;
      const report = {
        type: 'enabled-flags-compare',
        seed,
        seconds,
        record,
        chromePath,
        enabledFlags,
        genericDpsThreshold,
        genericWeaponShadow,
        ...diff,
      };
      await fs.writeFile(path.join(rootDir, 'reports', 'enabled-flags-compare.json'), JSON.stringify(report, null, 2));
      if (!diff.equal) throw new Error('Enabled feature flags output differs from legacy. See reports/enabled-flags-compare.json.');
      if (enabledFlags.ENABLE_GENERIC_WEAPON) {
        if (!genericWeaponShadow || genericWeaponShadow.samples <= 0) {
          throw new Error('Generic weapon shadow produced no samples. See reports/enabled-flags-compare.json.');
        }
        if (genericWeaponShadow.maxDpsDiffRatio >= genericDpsThreshold) {
          throw new Error('Generic weapon shadow DPS diff exceeded threshold. See reports/enabled-flags-compare.json.');
        }
        if (genericWeaponShadow.behaviorMismatches > 0) {
          throw new Error('Generic weapon behavior shadow mismatch. See reports/enabled-flags-compare.json.');
        }
      }
      console.log(`Enabled flags compare OK: ${diff.snapshotCountA} frames, zero diff.`);
      return;
    }

    if (args['compare-generic-weapon-matrix']) {
      const weaponIds = String(args.weapons ?? 'saber,spear,crossbow,qinggang,shield,taiping').split(',').filter(Boolean);
      const levels = String(args.levels ?? '1').split(',').map(Number).filter(Number.isFinite);
      const genericDpsThreshold = Number(args['generic-dps-threshold'] ?? 0.01);
      const entries = [];
      for (const weaponId of weaponIds) {
        for (const level of levels) {
          const query = { debugInitialWeapon: weaponId, debugInitialWeaponLevel: level };
          const legacyFlags = {
            ENABLE_JSON_CONFIG: true,
            ENABLE_SYSTEM_SPLIT: true,
          };
          const enabledFlags = {
            ENABLE_JSON_CONFIG: true,
            ENABLE_SYSTEM_SPLIT: true,
            ENABLE_GENERIC_WEAPON: true,
          };
          const legacy = await runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags: legacyFlags, query });
          const enabled = await runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags: enabledFlags, query });
          const diff = diffSnapshots(legacy, enabled);
          const genericWeaponShadow = enabled.genericWeaponShadow;
          const entry = {
            weaponId,
            level,
            genericDpsThreshold,
            genericWeaponShadow,
            ...diff,
          };
          entries.push(entry);
          if (!diff.equal) throw new Error(`Generic weapon matrix snapshot diff for ${weaponId} level ${level}. See reports/generic-weapon-matrix.json.`);
          if (!genericWeaponShadow || genericWeaponShadow.samples <= 0) {
            throw new Error(`Generic weapon matrix produced no samples for ${weaponId} level ${level}. See reports/generic-weapon-matrix.json.`);
          }
          if (genericWeaponShadow.maxDpsDiffRatio >= genericDpsThreshold) {
            throw new Error(`Generic weapon matrix DPS diff exceeded threshold for ${weaponId} level ${level}. See reports/generic-weapon-matrix.json.`);
          }
          if (genericWeaponShadow.behaviorMismatches > 0) {
            throw new Error(`Generic weapon behavior shadow mismatch for ${weaponId} level ${level}. See reports/generic-weapon-matrix.json.`);
          }
        }
      }
      const report = {
        type: 'generic-weapon-matrix',
        seed,
        seconds,
        record,
        chromePath,
        entries,
      };
      await fs.writeFile(path.join(rootDir, 'reports', 'generic-weapon-matrix.json'), JSON.stringify(report, null, 2));
      console.log(`Generic weapon matrix OK: ${entries.length} weapons, zero diff.`);
      return;
    }

    if (rngProbe > 0) {
      const first = await runRngProbe(browser, baseUrl, { seed, count: rngProbe });
      const second = await runRngProbe(browser, baseUrl, { seed, count: rngProbe });
      const report = {
        type: 'rng-probe',
        seed,
        count: rngProbe,
        chromePath,
        jsonConfig: defaultFlags.ENABLE_JSON_CONFIG,
        first,
        second,
        equal: first.hash === second.hash,
      };
      await fs.writeFile(path.join(rootDir, 'reports', 'rng-probe.json'), JSON.stringify(report, null, 2));
      if (!report.equal) throw new Error('RNG probe mismatch.');
      console.log(`RNG probe OK: ${rngProbe} values, hash ${first.hash}`);
      return;
    }

    const first = await runSnapshot(browser, baseUrl, { seed, record, seconds, flags: defaultFlags });
    const second = await runSnapshot(browser, baseUrl, { seed, record, seconds, flags: defaultFlags });
    const diff = diffSnapshots(first, second);
    const report = {
      type: 'snapshot-diff',
      seed,
      seconds,
      record,
      chromePath,
      flags: defaultFlags,
      ...diff,
    };
    await fs.writeFile(path.join(rootDir, 'reports', 'baseline-diff.json'), JSON.stringify(report, null, 2));
    if (!diff.equal) throw new Error('Snapshot diff is not zero. See reports/baseline-diff.json.');
    if (diff.bossFrameDelta !== null && diff.bossFrameDelta >= 1) throw new Error('Boss frame delta must be < 1.');
    console.log(`Baseline OK: ${diff.snapshotCountA} frames, zero diff.`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
