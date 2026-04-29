import type { GameSystem } from './System';
import type { WeaponSystemWorld } from './WorldPorts';

export class WeaponSystem<TWorld extends WeaponSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'WeaponSystem' as const;

  update(world: TWorld, deltaTime: number): void {
    world.updateWeapons(deltaTime);
  }
}
