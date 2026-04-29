import type { GameSystem } from './System';
import type { PickupSystemWorld } from './WorldPorts';

export class PickupSystem<TWorld extends PickupSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'PickupSystem' as const;

  update(world: TWorld, deltaTime: number): void {
    world.updatePickups(deltaTime);
  }
}
