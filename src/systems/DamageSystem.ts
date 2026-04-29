import type { GameSystem } from './System';
import type { DamageSystemWorld } from './WorldPorts';

export class DamageSystem<TWorld extends DamageSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'DamageSystem' as const;

  update(world: TWorld, deltaTime: number): void {
    world.updateDamage(deltaTime);
  }
}
