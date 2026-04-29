export interface SpatialItem {
  x: number;
  y: number;
}

export class SpatialHashGrid<T extends SpatialItem> {
  private readonly cells = new Map<string, T[]>();
  private readonly overflow: T[] = [];

  constructor(
    readonly cellSize: number,
    readonly width: number,
    readonly height: number,
  ) {}

  clear(): void {
    this.cells.clear();
    this.overflow.length = 0;
  }

  rebuild(items: Iterable<T>): void {
    this.clear();
    for (const item of items) {
      this.insert(item);
    }
  }

  insert(item: T): void {
    const col = Math.floor(item.x / this.cellSize);
    const row = Math.floor(item.y / this.cellSize);
    if (col < 0 || row < 0 || item.x > this.width || item.y > this.height) {
      this.overflow.push(item);
      return;
    }
    const key = `${col}:${row}`;
    const bucket = this.cells.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      this.cells.set(key, [item]);
    }
  }

  query(x: number, y: number, radius: number, output: T[] = []): T[] {
    output.length = 0;
    const minCol = Math.floor((x - radius) / this.cellSize);
    const maxCol = Math.floor((x + radius) / this.cellSize);
    const minRow = Math.floor((y - radius) / this.cellSize);
    const maxRow = Math.floor((y + radius) / this.cellSize);

    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const bucket = this.cells.get(`${col}:${row}`);
        if (bucket) output.push(...bucket);
      }
    }

    if (this.overflow.length > 0) output.push(...this.overflow);
    return output;
  }
}
