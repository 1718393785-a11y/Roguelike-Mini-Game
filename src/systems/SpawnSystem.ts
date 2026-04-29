import type { GameSystem } from './System';

export class SpawnSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'SpawnSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
