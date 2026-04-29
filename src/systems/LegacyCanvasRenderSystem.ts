import type { GameSystem } from './System';

export class LegacyCanvasRenderSystem<TWorld = unknown> implements GameSystem<TWorld> {
  readonly name = 'LegacyCanvasRenderSystem';

  update(_world: TWorld, _deltaTime: number): void {}
}
