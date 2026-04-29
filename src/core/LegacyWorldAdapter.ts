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

  updateMovement(_deltaTime: number): void {}

  updateCollision(_deltaTime: number): void {}

  updateWeapons(_deltaTime: number): void {}

  updateDamage(_deltaTime: number): void {}

  updateSpawn(deltaTime: number): void {
    if (this.legacy.gameState === 1 || this.legacy.gameState === 'playing' || this.legacy.gameState === 'PLAYING') {
      this.legacy.update(deltaTime);
    }
  }

  updatePickups(_deltaTime: number): void {}

  updateAnimations(_deltaTime: number): void {}

  renderLegacyCanvas(deltaTime: number): void {
    this.legacy.render(deltaTime);
  }
}
