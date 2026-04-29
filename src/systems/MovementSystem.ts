import type { GameSystem } from './System';

export class MovementSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'MovementSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
