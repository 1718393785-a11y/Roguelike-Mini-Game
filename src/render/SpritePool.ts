export interface PoolableSprite {
  active: boolean;
}

export class SpritePool<TSprite extends PoolableSprite> {
  private readonly available: TSprite[] = [];
  private readonly active = new Set<TSprite>();

  constructor(private readonly createSprite: () => TSprite) {}

  acquire(): TSprite {
    const sprite = this.available.pop() ?? this.createSprite();
    sprite.active = true;
    this.active.add(sprite);
    return sprite;
  }

  release(sprite: TSprite): void {
    if (!this.active.delete(sprite)) return;
    sprite.active = false;
    this.available.push(sprite);
  }

  releaseAll(): void {
    for (const sprite of this.active) {
      sprite.active = false;
      this.available.push(sprite);
    }
    this.active.clear();
  }
}
