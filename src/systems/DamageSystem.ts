import type { GameSystem } from './System';

export class DamageSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'DamageSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
