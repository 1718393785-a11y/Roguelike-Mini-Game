import type { GameSystem } from './System';
import type { MovementSystemWorld } from './WorldPorts';

export class MovementSystem<TWorld extends MovementSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'MovementSystem' as const;

  update(world: TWorld, deltaTime: number): void {
    world.updateMovement(deltaTime);
  }
}
