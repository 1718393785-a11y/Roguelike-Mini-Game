import type { IRenderer, RendererFrame } from './IRenderer';
import { SpritePool, type PoolableSprite } from './SpritePool';
import { TextureBaker } from './TextureBaker';

interface RenderableEntity {
  readonly x: number;
  readonly y: number;
  readonly size?: number;
  readonly color?: number;
  readonly alpha?: number;
}

interface RenderableWorld {
  readonly player?: RenderableEntity | null;
  readonly enemies?: readonly RenderableEntity[];
  readonly projectiles?: readonly RenderableEntity[];
}

type PixiModule = typeof import('pixi.js');
type PixiApplication = import('pixi.js').Application;
type PixiSprite = import('pixi.js').Sprite & PoolableSprite;

export class PixiRendererAdapter<TWorld extends RenderableWorld = RenderableWorld> implements IRenderer<TWorld> {
  readonly name = 'pixi';
  private pixi: PixiModule | null = null;
  private app: PixiApplication | null = null;
  private readonly textureBaker = new TextureBaker();
  private spritePool: SpritePool<PixiSprite> | null = null;

  async initialize(target: HTMLCanvasElement): Promise<void> {
    this.pixi = await import('pixi.js');
    this.app = new this.pixi.Application();
    await this.app.init({
      canvas: target,
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });
    this.textureBaker.register({ id: 'solid', source: this.pixi.Texture.WHITE });
    this.spritePool = new SpritePool<PixiSprite>(
      () => {
        const texture = this.textureBaker.get('solid')?.source;
        if (!texture || !this.app) throw new Error('Pixi solid texture is not baked.');
        const sprite = new this.pixi!.Sprite(texture) as PixiSprite;
        sprite.anchor.set(0.5);
        sprite.active = false;
        sprite.visible = false;
        this.app.stage.addChild(sprite);
        return sprite;
      },
      sprite => {
        sprite.visible = true;
      },
      sprite => {
        sprite.visible = false;
      },
    );
  }

  render(frame: RendererFrame<TWorld>): void {
    if (!this.app || !this.spritePool) {
      throw new Error('PixiRendererAdapter must be initialized before render.');
    }
    this.spritePool.releaseAll();
    const entities = this.collectEntities(frame.world);
    for (const entity of entities) {
      const sprite = this.spritePool.acquire();
      const size = entity.size ?? 8;
      sprite.x = entity.x;
      sprite.y = entity.y;
      sprite.width = size;
      sprite.height = size;
      sprite.tint = entity.color ?? 0xffffff;
      sprite.alpha = entity.alpha ?? 1;
    }
  }

  destroy(): void {
    this.spritePool?.releaseAll();
    this.spritePool = null;
    this.textureBaker.clear();
    this.app?.destroy(false);
    this.app = null;
    this.pixi = null;
  }

  private collectEntities(world: TWorld): RenderableEntity[] {
    const entities: RenderableEntity[] = [];
    if (world.player) entities.push({ color: 0xb8860b, ...world.player });
    for (const enemy of world.enemies ?? []) entities.push({ color: 0x8b0000, ...enemy });
    for (const projectile of world.projectiles ?? []) entities.push({ color: 0xe8e8e8, ...projectile });
    return entities;
  }
}
