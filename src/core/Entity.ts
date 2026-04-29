import type { Component, ComponentMap } from './Component';

let nextEntityId = 1;

export class Entity {
  readonly id: number;
  readonly components: ComponentMap = new Map();
  active = true;

  constructor(id = nextEntityId++) {
    this.id = id;
  }

  add(component: Component): this {
    this.components.set(component.type, component);
    return this;
  }

  get<T extends Component>(type: string): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  has(type: string): boolean {
    return this.components.has(type);
  }

  remove(type: string): this {
    this.components.delete(type);
    return this;
  }
}
