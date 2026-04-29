import type { GameSystem } from './System';

export class InputSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'InputSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
