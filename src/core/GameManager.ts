import type { GameSystem } from '../systems/System';
import { SYSTEM_EXECUTION_ORDER } from '../systems/System';

export class GameManager<TWorld> {
  private readonly systems: GameSystem<TWorld>[];

  constructor(systems: GameSystem<TWorld>[]) {
    this.systems = [...systems].sort((a, b) => {
      return SYSTEM_EXECUTION_ORDER.indexOf(a.name as never) - SYSTEM_EXECUTION_ORDER.indexOf(b.name as never);
    });
  }

  update(world: TWorld, deltaTime: number): void {
    for (const system of this.systems) {
      system.update(world, deltaTime);
    }
  }
}
