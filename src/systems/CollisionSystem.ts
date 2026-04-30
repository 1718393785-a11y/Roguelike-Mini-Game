import type { GameSystem } from './System';
import type { CollisionSystemWorld } from './WorldPorts';

export class CollisionSystem<TWorld extends CollisionSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'CollisionSystem' as const;

  update(world: TWorld, deltaTime: number): void | boolean {
    return world.updateCollision(deltaTime);
  }
}
