import type { GameSystem } from './System';
import type { SpawnSystemWorld } from './WorldPorts';

export class SpawnSystem<TWorld extends SpawnSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'SpawnSystem' as const;

  update(world: TWorld, deltaTime: number): void {
    world.updateSpawn(deltaTime);
  }
}
