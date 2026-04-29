export type SystemName = (typeof SYSTEM_EXECUTION_ORDER)[number];

export interface GameSystem<TWorld = unknown> {
  readonly name: SystemName;
  update(world: TWorld, deltaTime: number): void;
}

export const SYSTEM_EXECUTION_ORDER = [
  'InputSystem',
  'MovementSystem',
  'CollisionSystem',
  'WeaponSystem',
  'DamageSystem',
  'SpawnSystem',
  'PickupSystem',
  'AnimationSystem',
  'LegacyCanvasRenderSystem',
] as const;

export function getSystemOrder(name: SystemName): number {
  return SYSTEM_EXECUTION_ORDER.indexOf(name);
}
