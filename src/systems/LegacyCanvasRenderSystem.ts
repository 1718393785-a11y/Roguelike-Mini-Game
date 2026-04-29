import type { GameSystem } from './System';
import type { LegacyCanvasRenderSystemWorld } from './WorldPorts';

export class LegacyCanvasRenderSystem<TWorld extends LegacyCanvasRenderSystemWorld> implements GameSystem<TWorld> {
  readonly name = 'LegacyCanvasRenderSystem' as const;

  update(world: TWorld, deltaTime: number): void {
    world.renderLegacyCanvas(deltaTime);
  }
}
