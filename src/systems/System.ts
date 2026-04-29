export interface GameSystem<TWorld = unknown> {
  readonly name: string;
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
