import { TILE, moveCost, tileAt } from '../map';
import { unitDef } from '../units';
import { speedMultOf } from './army';
import type { World, UnitState } from '../world';

const UNIT_RADIUS = 10; // px, soft body separation
const ARRIVE = 4; // px to consider a waypoint reached

/** Follows assigned paths with local separation steering.
 *  Speed is scaled by terrain cost (roads faster, forests slower). */
export class MovementSystem {
  private grid = new Map<string, UnitState[]>();

  tick(world: World, dtMs: number) {
    const dt = dtMs / 1000;
    this.rebuildHash(world);

    for (const u of world.units.values()) {
      if (!u.order || u.order.kind === 'stop' || u.order.kind === 'hold' || !u.path) continue;
      const wp = u.path[u.pathIdx];
      if (!wp) {
        u.order = null; // arrival; task-phase manager (economy) owns composite orders
        u.path = null;
        continue;
      }
      const def = unitDef(u.type);
      const tx = Math.floor(u.x / TILE);
      const ty = Math.floor(u.y / TILE);
      const terrainCost = moveCost(tileAt(world.map, tx, ty));
      const speed = ((def.speed * speedMultOf(u, world.tickCount)) * TILE) / (terrainCost === Infinity ? 1 : terrainCost);
      if (speed <= 0) continue; // immobilized (defensive formation)

      const wx = wp.tx * TILE + TILE / 2;
      const wy = wp.ty * TILE + TILE / 2;
      let dx = wx - u.x;
      let dy = wy - u.y;
      const dist = Math.hypot(dx, dy);
      // arrival radius must cover one max step or the unit orbits forever
      if (dist < Math.max(ARRIVE, (speed * dt) + 1)) {
        u.pathIdx++;
        if (u.pathIdx >= u.path.length) {
          u.path = null;
          u.order = null; // arrived
        }
        continue;
      }
      dx /= dist;
      dy /= dist;

      // soft separation from neighbours
      let sx = 0;
      let sy = 0;
      for (const o of this.neighbors(u)) {
        if (o === u) continue;
        const ox = u.x - o.x;
        const oy = u.y - o.y;
        const d2 = ox * ox + oy * oy;
        const min = UNIT_RADIUS * 2;
        if (d2 < min * min) {
          // perfectly stacked units get a deterministic push direction by id
          const d = Math.sqrt(d2);
          const push = (min - d) / min;
          const dir = d > 0.01 ? ox / d : (u.id % 2 === 0 ? 1 : -1);
          const dirY = d > 0.01 ? oy / d : (u.id % 3 === 0 ? 0.5 : -0.5);
          sx += dir * push;
          sy += dirY * push;
        }
      }
      const mx = dx + sx * 0.9;
      const my = dy + sy * 0.9;
      const mlen = Math.hypot(mx, my) || 1;
      u.x += (mx / mlen) * speed * dt;
      u.y += (my / mlen) * speed * dt;
    }
  }

  private rebuildHash(world: World) {
    this.grid.clear();
    for (const u of world.units.values()) {
      const key = `${Math.floor(u.x / (TILE * 2))},${Math.floor(u.y / (TILE * 2))}`;
      let arr = this.grid.get(key);
      if (!arr) this.grid.set(key, (arr = []));
      arr.push(u);
    }
  }

  private *neighbors(u: UnitState) {
    const cx = Math.floor(u.x / (TILE * 2));
    const cy = Math.floor(u.y / (TILE * 2));
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const arr = this.grid.get(`${cx + dx},${cy + dy}`);
        if (arr) yield* arr;
      }
  }
}
