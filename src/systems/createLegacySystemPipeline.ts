import { GameManager } from '../core/GameManager';
import { AnimationSystem } from './AnimationSystem';
import { CollisionSystem } from './CollisionSystem';
import { DamageSystem } from './DamageSystem';
import { InputSystem } from './InputSystem';
import { LegacyCanvasRenderSystem } from './LegacyCanvasRenderSystem';
import { MovementSystem } from './MovementSystem';
import { PickupSystem } from './PickupSystem';
import { SpawnSystem } from './SpawnSystem';
import { WeaponSystem } from './WeaponSystem';
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
} from './WorldPorts';

export type LegacyPipelineWorld =
  InputSystemWorld &
  MovementSystemWorld &
  CollisionSystemWorld &
  WeaponSystemWorld &
  DamageSystemWorld &
  SpawnSystemWorld &
  PickupSystemWorld &
  AnimationSystemWorld &
  LegacyCanvasRenderSystemWorld;

export function createLegacySystemPipeline<TWorld extends LegacyPipelineWorld>(): GameManager<TWorld> {
  return new GameManager<TWorld>([
    new InputSystem<TWorld>(),
    new MovementSystem<TWorld>(),
    new CollisionSystem<TWorld>(),
    new WeaponSystem<TWorld>(),
    new DamageSystem<TWorld>(),
    new SpawnSystem<TWorld>(),
    new PickupSystem<TWorld>(),
    new AnimationSystem<TWorld>(),
    new LegacyCanvasRenderSystem<TWorld>(),
  ]);
}
