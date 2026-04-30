import { strict as assert } from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AreaPulseEffect } from './areaPulse';
import { MeleeArcEffect } from './meleeArc';
import { OrbitEntityEffect } from './orbitEntity';
import { PersistentAreaEffect } from './persistentArea';
import { ProjectileEffect } from './projectile';
import type { SizedEntity } from './EffectGeometry';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

const entities: SizedEntity[] = [
  { id: 1, x: 40, y: 0, size: 10 },
  { id: 2, x: 35, y: 35, size: 10 },
  { id: 3, x: -10, y: 0, size: 10 },
  { id: 4, x: 20, y: 15, size: 20 },
];

async function main(): Promise<void> {
  const meleeArc = new MeleeArcEffect({});
  const projectile = new ProjectileEffect({});
  const orbit = new OrbitEntityEffect({});
  const areaPulse = new AreaPulseEffect({});
  const persistentArea = new PersistentAreaEffect({});

  const results = {
    meleeArc: meleeArc.queryHits({ x: 0, y: 0 }, 0, 50, Math.PI / 4, entities),
    lineRect: meleeArc.queryLineRectHits({ x: 0, y: 0 }, { x: 1, y: 0 }, 45, 20, entities),
    projectileTarget: projectile.selectTarget({ x: 0, y: 0 }, { x: 1, y: 0 }, entities)?.id ?? null,
    orbitPoints: orbit.buildPoints({ x: 10, y: 20 }, [{ count: 2, baseAngle: 0, direction: 1, radius: 5 }]),
    orbitHits: orbit.queryHits({ x: 40, y: 0 }, 20, entities),
    areaPulse: areaPulse.queryHits({ x: 0, y: 0 }, 35, entities),
    persistentArea: persistentArea.queryHits({ x: 0, y: 0 }, 35, entities),
  };

  assert.deepEqual(results.meleeArc, [1, 2, 4]);
  assert.deepEqual(results.lineRect, [1, 4]);
  assert.equal(results.projectileTarget, 4);
  assert.deepEqual(results.orbitPoints.map(point => [Math.round(point.x), Math.round(point.y)]), [[15, 20], [5, 20]]);
  assert.deepEqual(results.orbitHits, [1, 4]);
  assert.deepEqual(results.areaPulse, [3, 4]);
  assert.deepEqual(results.persistentArea, [1, 3, 4]);

  await mkdir(path.join(rootDir, 'reports'), { recursive: true });
  await writeFile(path.join(rootDir, 'reports', 'effect-geometry-validation.json'), JSON.stringify(results, null, 2));
  console.log('Effect geometry validation OK');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
