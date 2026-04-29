import type { GameSystem } from './System';

export class CollisionSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'CollisionSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
