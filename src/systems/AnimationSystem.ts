import type { GameSystem } from './System';
import type { AnimationSystemWorld } from './WorldPorts';

export class AnimationSystem<TWorld extends AnimationSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'AnimationSystem' as const;

  update(world: TWorld, deltaTime: number): void {
    world.updateAnimations(deltaTime);
  }
}
