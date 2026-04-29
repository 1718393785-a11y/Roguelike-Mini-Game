import { Entity } from './Entity';

export class Query {
  constructor(private readonly entities: readonly Entity[]) {}

  with(...componentTypes: string[]): Entity[] {
    return this.entities.filter(entity => entity.active && componentTypes.every(type => entity.has(type)));
  }
}
