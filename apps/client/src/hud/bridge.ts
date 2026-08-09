import type { Command, World } from '@cr/core';

/** Bridge React HUD -> Phaser scene (scene registers itself on window). */
export function bridgeWorld(): World | null {
  return (window as any).__cr_scene?.world ?? null;
}

export function bridgePlayerId(): number {
  return (window as any).__cr_scene?.playerId ?? 0;
}

export function bridgeEnqueue(cmd: Command) {
  (window as any).__cr_scene?.world.enqueue(cmd);
}
