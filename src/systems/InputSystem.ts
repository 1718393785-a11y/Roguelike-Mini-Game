import type { GameSystem } from './System';
import type { InputSystemWorld } from './WorldPorts';

export class InputSystem<TWorld extends InputSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'InputSystem' as const;

  update(world: TWorld, deltaTime: number): void {
    world.updateInput(deltaTime);
  }
}
