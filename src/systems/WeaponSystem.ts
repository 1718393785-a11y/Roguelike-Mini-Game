import type { GameSystem } from './System';

export class WeaponSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'WeaponSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
