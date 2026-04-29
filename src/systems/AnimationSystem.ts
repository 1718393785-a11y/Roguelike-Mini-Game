import type { GameSystem } from './System';

export class AnimationSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'AnimationSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
