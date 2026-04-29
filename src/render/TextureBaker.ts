export interface BakedTexture {
  readonly id: string;
  readonly source: unknown;
}

export class TextureBaker {
  private readonly textures = new Map<string, BakedTexture>();

  register(texture: BakedTexture): void {
    this.textures.set(texture.id, texture);
  }

  get(id: string): BakedTexture | undefined {
    return this.textures.get(id);
  }

  clear(): void {
    this.textures.clear();
  }
}
