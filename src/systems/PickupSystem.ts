import type { GameSystem } from './System';

export class PickupSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'PickupSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
