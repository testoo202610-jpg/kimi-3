// Starting settlements, shared by client boot and the multiplayer server so
// every peer builds the identical world from (seed, factions, strongSlots).
import { GENERALS_BY_LEAN } from './generals';
import type { World } from './world';

/**
 * Pre-built town center + starting forces + two named generals per faction.
 * strongSlots get the full starting army (single-player: {0}; multiplayer:
 * every human slot), other slots get the lean AI kit.
 */
export function spawnStartingForces(world: World, factions: string[], strongSlots: ReadonlySet<number> = new Set([0])) {
  for (let p = 0; p < factions.length; p++) {
    const s = world.map.starts[p];
    world.placeBuilding(p, 'townCenter', s.tx - 1, s.ty - 1, true);
    const strong = strongSlots.has(p);
    const forces = strong
      ? ['worker', 'worker', 'worker', 'worker', 'worker', 'worker', 'militia', 'militia', 'militia']
      : ['worker', 'worker', 'worker', 'worker', 'militia', 'militia'];
    for (const type of forces) {
      for (let i = 0; i < 40; i++) {
        const t = scatter(s.tx + 3, s.ty + 1, i);
        if (world.spawnUnit(p, type, t.tx, t.ty)) break;
      }
    }
    for (const gkey of GENERALS_BY_LEAN[factions[p]] ?? []) {
      for (let i = 0; i < 40; i++) {
        const t = scatter(s.tx + 2, s.ty + 3, i);
        if (world.spawnUnit(p, gkey, t.tx, t.ty)) break;
      }
    }
  }
}

export function scatter(cx: number, cy: number, i: number): { tx: number; ty: number } {
  // small deterministic spiral around the start point
  let x = 0;
  let y = 0;
  let dx = 0;
  let dy = -1;
  for (let s = 0; s < i; s++) {
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) [dx, dy] = [-dy, dx];
    x += dx;
    y += dy;
  }
  return { tx: cx + x, ty: cy + y };
}
