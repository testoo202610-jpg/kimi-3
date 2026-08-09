import { TILE, Tile, tileAt } from '../map';
import { unitDef } from '../units';
import {
  DEPOSIT_TO_RES, Resource, buildingDef, buildingCenter, freeAdjacentTile, type BuildingState,
} from '../buildings';
import type { World, UnitState } from '../world';

const GATHER_RATE = 0.55; // resource per second
const CARRY_CAP = 10;
const UPKEEP_FOOD_PER_POP = 0.02; // per second
const STARVE_MORALE_DRAIN = 2; // per second while starving
const BUILD_RATE = 1; // 1.0 = one builder finishes def.buildTime seconds of work per second
const GRANARY_FARM_MULT = 1.3;

/** Workers gather/carry/drop, build, farms produce, upkeep drains food, training queues progress. */
export class EconomySystem {
  tick(world: World, dtMs: number) {
    const dt = dtMs / 1000;
    for (const b of world.buildings.values()) this.tickBuilding(world, b, dt);
    for (const u of world.units.values()) this.tickWorker(world, u, dt);
    this.tickUpkeep(world, dt);
  }

  // ---- buildings: construction, farm yield, training ----
  private tickBuilding(world: World, b: BuildingState, dt: number) {
    const def = buildingDef(b.key);

    if (!b.built) {
      // worked on by adjacent workers with build task (counted here)
      let workers = 0;
      for (const u of world.units.values()) {
        if (u.task?.kind === 'build' && u.task.buildingId === b.id && u.order === null && u.path === null) workers++;
      }
      if (workers > 0) {
        b.progress += (workers * BUILD_RATE * dt) / def.buildTime;
        b.hp = Math.max(b.hp, Math.ceil(def.hp * Math.max(b.progress, 0.1)));
        if (b.progress >= 1) {
          b.progress = 1;
          b.built = true;
          b.hp = def.hp;
          for (const u of world.units.values()) {
            if (u.task?.kind === 'build' && u.task.buildingId === b.id) u.task = null; // builders go idle
          }
          world.applyGranaryAuras(b.owner);
          world.recomputePop(b.owner);
        }
      }
      return;
    }

    // farms: passive yield, boosted on farmland/granary
    if (def.farmYield > 0) {
      const mult = b.farmBoost ? GRANARY_FARM_MULT : 1;
      world.players[b.owner].res.food += def.farmYield * mult * dt;
    }

    // training (Rapid Recruitment doubles progress while active)
    const item = b.queue[0];
    if (item) {
      const boost = (world.players[b.owner].recruitBoostUntil ?? 0) > world.tickCount ? 2 : 1;
      item.remaining -= dt * boost;
      if (item.remaining <= 0) {
        b.queue.shift();
        const udef = unitDef(item.unitKey);
        if (world.players[b.owner].popUsed + udef.pop <= world.players[b.owner].popCap) {
          const spawn = freeAdjacentTile(world, b, b.tx, b.ty);
          if (spawn) world.spawnUnit(b.owner, item.unitKey, spawn.tx, spawn.ty);
        }
      }
    }
  }

  // ---- workers ----
  private tickWorker(world: World, u: UnitState, dt: number) {
    if (!u.task || u.type !== 'worker') return;
    if (u.order || u.path) return; // still walking to current leg

    if (u.task.kind === 'build') {
      const b = u.task.buildingId != null ? world.buildings.get(u.task.buildingId) : null;
      if (!b || b.built) {
        u.task = null;
        return;
      }
      // path from current spot to the remembered adjacency tile is done → working
      u.task.phase = 'working';
      return; // construction progress counted in tickBuilding
    }

    if (u.task.kind === 'gather') {
      if (u.task.phase === 'goto') {
        u.task.phase = 'working';
        return;
      }
      if (u.task.phase === 'working') {
        const capacityLeft = u.carry ? CARRY_CAP - u.carry.amount : CARRY_CAP;
        const gain = Math.min(GATHER_RATE * dt, this.sourceAvailable(world, u), capacityLeft);
        if (gain <= 0) {
          u.task = null; // source depleted (ponytail: auto-retarget nearest source later)
          return;
        }
        this.takeFromSource(world, u, gain);
        if (!u.carry) u.carry = { kind: this.sourceKind(world, u), amount: 0 };
        u.carry.amount += gain;
        if (u.carry.amount >= CARRY_CAP) {
          u.task.phase = 'delivering';
          const drop = this.nearestDropoff(world, u);
          if (!drop) {
            u.task = null;
            return;
          }
          u.task.buildingId = drop.id;
          const adj = freeAdjacentTile(world, drop, Math.floor(u.x / TILE), Math.floor(u.y / TILE));
          if (adj) world.requestPath(u, adj.tx, adj.ty);
          else u.task = null;
        }
        return;
      }
      if (u.task.phase === 'delivering') {
        const b = u.task.buildingId != null ? world.buildings.get(u.task.buildingId) : null;
        if (!b || !b.built) {
          // dropoff gone: find another of the same owner's
          const alt = this.nearestDropoff(world, u);
          if (!alt) {
            u.task = null;
            return;
          }
          u.task.buildingId = alt.id;
          const adj = freeAdjacentTile(world, alt, Math.floor(u.x / TILE), Math.floor(u.y / TILE));
          if (adj) world.requestPath(u, adj.tx, adj.ty);
          return;
        }
        // deposit carried resources
        if (u.carry) {
          world.players[u.owner].res[u.carry.kind] += u.carry.amount;
          u.carry = null;
        }
        // head back to the resource
        u.task.phase = 'goto';
        world.requestPath(u, u.task.tx, u.task.ty);
      }
    }
  }

  private sourceKind(world: World, u: UnitState): Resource {
    if (u.task!.depositId != null) {
      const d = world.map.deposits.find((x) => x.id === u.task!.depositId);
      if (d) return DEPOSIT_TO_RES[d.kind];
    }
    return 'wood'; // forest tiles
  }

  private sourceAvailable(world: World, u: UnitState): number {
    const t = u.task!;
    if (t.depositId != null) {
      const d = world.map.deposits.find((x) => x.id === t.depositId);
      return d ? d.amount : 0;
    }
    const tree = tileAt(world.map, t.tx, t.ty);
    return tree === Tile.Forest ? world.map.woodAmount[t.ty * world.map.w + t.tx] : 0;
  }

  private takeFromSource(world: World, u: UnitState, amount: number) {
    const t = u.task!;
    if (t.depositId != null) {
      const d = world.map.deposits.find((x) => x.id === t.depositId);
      if (d) d.amount = Math.max(0, d.amount - amount);
      return;
    }
    const i = t.ty * world.map.w + t.tx;
    world.map.woodAmount[i] = Math.max(0, world.map.woodAmount[i] - amount);
    // ponytail: harvested forest tiles stay visually full; add regrowth/deplete
    // rendering swap when art pass lands (map.tiles[i] -> Tile.Grass at 0).
  }

  private nearestDropoff(world: World, u: UnitState): BuildingState | null {
    const kind = u.carry?.kind ?? this.sourceKind(world, u);
    let best: BuildingState | null = null;
    let bestD = Infinity;
    for (const b of world.buildings.values()) {
      if (b.owner !== u.owner || !b.built || !buildingDef(b.key).dropoff.includes(kind as Resource)) continue;
      const c = buildingCenter(b);
      const d = Math.abs(c.x - u.x) + Math.abs(c.y - u.y);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  }

  // ---- upkeep ----
  private tickUpkeep(world: World, dt: number) {
    for (const p of world.players) {
      const need = p.popUsed * UPKEEP_FOOD_PER_POP * dt;
      if (p.res.food >= need) {
        p.res.food -= need;
        p.starving = false;
      } else {
        p.res.food = 0;
        p.starving = true;
        for (const u of world.units.values()) {
          if (u.owner === p.id) u.morale = Math.max(0, u.morale - STARVE_MORALE_DRAIN * dt);
        }
      }
    }
  }
}

export const ECONOMY = { GATHER_RATE, CARRY_CAP, UPKEEP_FOOD_PER_POP, GRANARY_FARM_MULT };
