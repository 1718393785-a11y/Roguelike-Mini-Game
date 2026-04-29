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

async function runSnapshot(browser, baseUrl, { seed, record, seconds, flags = {} }) {
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
  await page.goto(url.toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__BASELINE_DONE__, null, { timeout: Math.max(30000, seconds * 2000) });
  const result = await page.evaluate(() => window.__BASELINE_DONE__);
  await context.close();
  if (errors.length || result.error) {
    throw new Error(`Browser baseline error: ${[result.error, ...errors].filter(Boolean).join('\n')}`);
  }
  return result.snapshots;
}

async function runSnapshotWithFlags(browser, baseUrl, { seed, record, seconds, flags }) {
  return await runSnapshot(browser, baseUrl, { seed, record, seconds, flags });
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
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const left = a[i];
    const right = b[i];
    if (JSON.stringify(left) !== JSON.stringify(right)) {
      diffs.push({ index: i, left, right });
      if (diffs.length >= 20) break;
    }
  }
  const bossA = a.findIndex(snapshot => snapshot.bossSpawned);
  const bossB = b.findIndex(snapshot => snapshot.bossSpawned);
  return {
    equal: diffs.length === 0 && a.length === b.length,
    snapshotCountA: a.length,
    snapshotCountB: b.length,
    bossFrameA: bossA >= 0 ? a[bossA].frame : null,
    bossFrameB: bossB >= 0 ? b[bossB].frame : null,
    bossFrameDelta: bossA >= 0 && bossB >= 0 ? Math.abs(a[bossA].frame - b[bossB].frame) : null,
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
  };
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
