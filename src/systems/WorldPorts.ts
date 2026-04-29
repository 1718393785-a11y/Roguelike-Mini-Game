export interface InputSystemWorld {
  updateInput(deltaTime: number): void;
}

export interface MovementSystemWorld {
  updateMovement(deltaTime: number): void;
}

export interface CollisionSystemWorld {
  updateCollision(deltaTime: number): void;
}

export interface WeaponSystemWorld {
  updateWeapons(deltaTime: number): void;
}

export interface DamageSystemWorld {
  updateDamage(deltaTime: number): void;
}

export interface SpawnSystemWorld {
  updateSpawn(deltaTime: number): void;
}

export interface PickupSystemWorld {
  updatePickups(deltaTime: number): void;
}

export interface AnimationSystemWorld {
  updateAnimations(deltaTime: number): void;
}

export interface LegacyCanvasRenderSystemWorld {
  renderLegacyCanvas(deltaTime: number): void;
}
