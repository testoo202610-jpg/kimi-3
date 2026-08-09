import { GameMap, Tile, tileAt } from '../map';
import { buildingDef } from '../buildings';
import type { World } from '../world';

const RECOMPUTE_EVERY = 8; // ticks (0.5 s at 16 Hz)
const BASE_RADIUS = 10;
const ERA_RADIUS = 4; // per era
const TAX_PER_TILE = 0.0012; // gold/sec per controlled tile

/** Territory grid per player: BFS influence from town centers.
 *  Effects elsewhere: supply safety (Phase 5), capture (Phase 5), tax income here. */
export class TerritorySystem {
  grids: Uint8Array[] = []; // grids[playerId][ty*w+tx] = 1 if owned

  init(world: World) {
    this.grids = world.players.map(() => new Uint8Array(world.map.w * world.map.h));
    this.compute(world);
  }

  /** True if the tile is inside `player`'s territory. */
  owns(world: World, player: number, tx: number, ty: number): boolean {
    const g = this.grids[player];
    if (!g || tx < 0 || ty < 0 || tx >= world.map.w || ty >= world.map.h) return false;
    return g[ty * world.map.w + tx] === 1;
  }

  tick(world: World) {
    if (world.tickCount % RECOMPUTE_EVERY !== 0) return;
    this.compute(world);
    // tax income: gold trickle scaled by territory size
    for (const p of world.players) {
      const g = this.grids[p.id];
      if (!g) continue;
      let tiles = 0;
      for (let i = 0; i < g.length; i++) tiles += g[i];
      p.res.gold += tiles * TAX_PER_TILE * RECOMPUTE_EVERY / 16;
    }
  }

  private compute(world: World) {
    for (const g of this.grids) g.fill(0);
    for (const p of world.players) {
      const radius = BASE_RADIUS + p.era * ERA_RADIUS;
      for (const b of world.buildings.values()) {
        if (b.owner !== p.id || !b.built || !buildingDef(b.key).projectsTerritory) continue;
        this.flood(world.map, this.grids[p.id], b.tx + 1, b.ty + 1, radius);
      }
    }
  }

  /** 4-dir flood limited by influence budget; mountains stop influence. */
  private flood(map: GameMap, grid: Uint8Array, sx: number, sy: number, budget: number) {
    const { w, h } = map;
    const dist = new Int16Array(w * h).fill(-1);
    const queue: number[] = [sy * w + sx];
    dist[sy * w + sx] = 0;
    // ponytail: plain array scan instead of a proper queue pop — budget is
    // small (< 700 tiles/city); upgrade to ring buffer if map grows past 256².
    while (queue.length) {
      const cur = queue.shift()!;
      const cx = cur % w;
      const cy = (cur / w) | 0;
      const d = dist[cur];
      grid[cur] = 1;
      if (d >= budget) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (dist[ni] !== -1) continue;
        if (tileAt(map, nx, ny) === Tile.Mountain) continue;
        dist[ni] = d + 1;
        queue.push(ni);
      }
    }
  }
}
