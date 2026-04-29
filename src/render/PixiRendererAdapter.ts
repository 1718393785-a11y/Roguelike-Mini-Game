import type { IRenderer, RendererFrame } from './IRenderer';

export class PixiRendererAdapter<TWorld = unknown> implements IRenderer<TWorld> {
  readonly name = 'pixi';
  private initialized = false;

  initialize(_target: HTMLCanvasElement): void {
    this.initialized = true;
  }

  render(_frame: RendererFrame<TWorld>): void {
    if (!this.initialized) {
      throw new Error('PixiRendererAdapter must be initialized before render.');
    }
  }

  destroy(): void {
    this.initialized = false;
  }
}
