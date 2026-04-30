import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import weaponsJson from '../spec/weapons.json' with { type: 'json' };
import { WeaponsConfigSchema } from '../config/Schema';
import { GenericWeapon } from './GenericWeapon';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');

function simulateAttackCount(weapon: GenericWeapon, seconds: number, fixedDelta: number): number {
  let attacks = 0;
  const frames = Math.round(seconds / fixedDelta);
  for (let frame = 0; frame < frames; frame++) {
    weapon.updateClock(fixedDelta);
    if (weapon.consumeAttackReady()) attacks++;
  }
  return attacks;
}

async function main(): Promise<void> {
  const weapons = WeaponsConfigSchema.parse(weaponsJson);
  const report = {
    type: 'generic-weapon-validation',
    fixedDelta: 1 / 60,
    seconds: 60,
    weapons: Object.values(weapons).map(config => {
      return {
        id: config.id,
        levels: config.levels.map(levelConfig => {
          const weapon = new GenericWeapon(config, levelConfig.level);
          const attacksPerMinute = simulateAttackCount(weapon, 60, 1 / 60);
          const snapshot = weapon.snapshot();
          return {
            ...snapshot,
            attacksPerMinute,
            effects: weapon.getEffects(),
            effectInstanceCount: weapon.getEffectInstances().length,
          };
        }),
      };
    }),
  };

  await mkdir(path.join(rootDir, 'reports'), { recursive: true });
  await writeFile(path.join(rootDir, 'reports', 'generic-weapon-validation.json'), JSON.stringify(report, null, 2));
  console.log(`Generic weapon validation OK: ${report.weapons.length} weapons`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
