import type { IRenderer, RendererFrame } from './IRenderer';

export class CanvasRendererAdapter<TWorld = unknown> implements IRenderer<TWorld> {
  readonly name = 'canvas';
  private canvas: HTMLCanvasElement | null = null;

  initialize(target: HTMLCanvasElement): void {
    this.canvas = target;
  }

  render(_frame: RendererFrame<TWorld>): void {
    if (!this.canvas) {
      throw new Error('CanvasRendererAdapter must be initialized before render.');
    }
  }

  destroy(): void {
    this.canvas = null;
  }
}
