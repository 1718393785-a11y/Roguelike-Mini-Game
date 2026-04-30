import type {
  AnimationSystemWorld,
  CollisionSystemWorld,
  DamageSystemWorld,
  InputSystemWorld,
  LegacyCanvasRenderSystemWorld,
  MovementSystemWorld,
  PickupSystemWorld,
  SpawnSystemWorld,
  WeaponSystemWorld,
} from '../systems/WorldPorts';

export interface LegacyGameManagerPort {
  readonly gameState?: string | number;
  handleInput(deltaTime: number): void;
  update(deltaTime: number): void;
  updateSpawnSystem?(deltaTime: number): void;
  updateMovementSystem?(deltaTime: number): void;
  updateDamageSystem?(deltaTime: number): void;
  updateProjectileSystem?(deltaTime: number): void | boolean;
  updateAnimationSystem?(deltaTime: number): void;
  updateCollisionSystem?(deltaTime: number): void | boolean;
  updatePickupSystem?(deltaTime: number): void;
  updateWeaponSystem?(deltaTime: number): void;
  updateLevelProgressionSystem?(): void;
  render(deltaTime: number): void;
}

export class LegacyWorldAdapter
  implements
    InputSystemWorld,
    MovementSystemWorld,
    CollisionSystemWorld,
    WeaponSystemWorld,
    DamageSystemWorld,
    SpawnSystemWorld,
    PickupSystemWorld,
    AnimationSystemWorld,
    LegacyCanvasRenderSystemWorld
{
  constructor(private readonly legacy: LegacyGameManagerPort) {}

  updateInput(deltaTime: number): void {
    this.legacy.handleInput(deltaTime);
  }

  updateMovement(deltaTime: number): void {
    this.legacy.updateMovementSystem?.(deltaTime);
  }

  updateCollision(deltaTime: number): void | boolean {
    return this.legacy.updateCollisionSystem?.(deltaTime);
  }

  updateWeapons(deltaTime: number): void {
    this.legacy.updateWeaponSystem?.(deltaTime);
    this.legacy.updateLevelProgressionSystem?.();
  }

  updateDamage(deltaTime: number): void | boolean {
    this.legacy.updateDamageSystem?.(deltaTime);
    return this.legacy.updateProjectileSystem?.(deltaTime);
  }

  updateSpawn(deltaTime: number): void {
    if (this.legacy.gameState === 1 || this.legacy.gameState === 'playing' || this.legacy.gameState === 'PLAYING') {
      if (this.legacy.updateSpawnSystem) {
        this.legacy.updateSpawnSystem(deltaTime);
      } else {
        this.legacy.update(deltaTime);
      }
    }
  }

  updatePickups(deltaTime: number): void {
    this.legacy.updatePickupSystem?.(deltaTime);
  }

  updateAnimations(deltaTime: number): void {
    this.legacy.updateAnimationSystem?.(deltaTime);
  }

  renderLegacyCanvas(deltaTime: number): void {
    this.legacy.render(deltaTime);
  }
}
