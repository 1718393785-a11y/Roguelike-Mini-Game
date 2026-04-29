export interface SnapshotPlayer {
  x: number;
  y: number;
  hp: number;
  level: number;
  exp: number;
}

export interface StateSnapshot {
  frame: number;
  gameState: number;
  gameTime: number;
  player: SnapshotPlayer | null;
  enemies: { count: number; totalHp: number };
  projectiles: { count: number };
  pickups: { count: number };
  bossSpawned: boolean;
  killCount: number;
  dps: number;
}

export interface SnapshotWorld {
  gameState: number;
  gameTime: number;
  player?: SnapshotPlayer | null;
  enemies: Array<{ hp: number; isBoss?: boolean; isMiniBoss?: boolean; isLevelBoss?: boolean; isFinalBoss?: boolean }>;
  projectiles: unknown[];
  pickups: unknown[];
  killCount: number;
  damageTotal: number;
}

function round(value: number): number {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}

export function captureStateSnapshot(frame: number, world: SnapshotWorld): StateSnapshot {
  const totalEnemyHp = world.enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.hp || 0), 0);
  return {
    frame,
    gameState: world.gameState,
    gameTime: round(world.gameTime),
    player: world.player
      ? {
          x: round(world.player.x),
          y: round(world.player.y),
          hp: round(world.player.hp),
          level: world.player.level,
          exp: round(world.player.exp),
        }
      : null,
    enemies: {
      count: world.enemies.length,
      totalHp: round(totalEnemyHp),
    },
    projectiles: { count: world.projectiles.length },
    pickups: { count: world.pickups.length },
    bossSpawned: world.enemies.some(enemy => enemy.isBoss || enemy.isMiniBoss || enemy.isLevelBoss || enemy.isFinalBoss),
    killCount: world.killCount,
    dps: round(world.damageTotal / Math.max(1, world.gameTime)),
  };
}

export function diffSnapshots(left: readonly StateSnapshot[], right: readonly StateSnapshot[]): number[] {
  const diffIndexes: number[] = [];
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i++) {
    if (JSON.stringify(left[i]) !== JSON.stringify(right[i])) {
      diffIndexes.push(i);
    }
  }
  return diffIndexes;
}
