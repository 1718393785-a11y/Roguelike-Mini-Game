export interface RendererFrame<TWorld = unknown> {
  readonly world: TWorld;
  readonly deltaTime: number;
}

export interface IRenderer<TWorld = unknown> {
  readonly name: string;
  initialize(target: HTMLCanvasElement): void | Promise<void>;
  render(frame: RendererFrame<TWorld>): void;
  destroy(): void;
}
