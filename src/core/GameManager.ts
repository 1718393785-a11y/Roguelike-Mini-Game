import type { GameSystem } from '../systems/System';
import { getSystemOrder } from '../systems/System';

export class GameManager<TWorld> {
  private readonly systems: GameSystem<TWorld>[];

  constructor(systems: GameSystem<TWorld>[]) {
    this.systems = [...systems].sort((a, b) => {
      return getSystemOrder(a.name) - getSystemOrder(b.name);
    });
  }

  update(world: TWorld, deltaTime: number): void {
    let haltLogic = false;
    for (const system of this.systems) {
      if (haltLogic && system.name !== 'LegacyCanvasRenderSystem') continue;
      const shouldContinue = system.update(world, deltaTime);
      if (shouldContinue === false) {
        haltLogic = true;
      }
    }
  }
}
