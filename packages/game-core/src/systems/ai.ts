// AI planner: utility-driven, issues commands through world.enqueue like a
// human player — never touches state directly (anti-cheat by construction).
// Difficulty changes decision cadence and caps ONLY; hard AI gets nothing free.

import { TILE, Tile, tileAt } from '../map';
import { findPath } from '../pathfinding';
import {
  BUILDING_DEFS, buildingDef, canAfford, canPlace, footprintTiles, freeAdjacentTile,
} from '../buildings';
import { unitDef } from '../units';
import type { World, UnitState } from '../world';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Persona {
  armyThreshold: number; // attack when fielded military ≥ this
  workerTarget: number;
  comp: string[]; // train priorities, first affordable wins
  buildOrder: string[]; // buildings, in priority order
  wantsMarket: boolean;
  wantsTowers: boolean;
}

const DIFF: Record<Difficulty, { interval: number; workerCap: number; armyBonus: number }> = {
  easy: { interval: 96, workerCap: 9, armyBonus: 2 }, // 6 s decisions, small army
  normal: { interval: 48, workerCap: 14, armyBonus: 0 },
  hard: { interval: 24, workerCap: 18, armyBonus: -2 }, // faster cadence, pushes earlier — same rules
};

const PERSONAS: Record<string, Persona> = {
  dominion: {
    armyThreshold: 8, workerTarget: 0,
    comp: ['lightCavalry', 'spearman', 'militia'],
    buildOrder: ['farm', 'lumberCamp', 'barracks', 'stable', 'house'],
    wantsMarket: true, wantsTowers: false,
  },
  river: {
    armyThreshold: 12, workerTarget: 0,
    comp: ['archer', 'crossbowman', 'spearman', 'militia'],
    buildOrder: ['farm', 'lumberCamp', 'barracks', 'archeryRange', 'house'],
    wantsMarket: true, wantsTowers: true,
  },
  hills: {
    armyThreshold: 10, workerTarget: 0,
    comp: ['swordsman', 'heavyInfantry', 'spearman', 'militia'],
    buildOrder: ['farm', 'stoneCamp', 'barracks', 'house'],
    wantsMarket: false, wantsTowers: false,
  },
};

const FALLBACK: Persona = PERSONAS.dominion;
const MILITARY = new Set(['infantry', 'archer', 'cavalry', 'siege', 'general']);

export class AISystem {
  private cfgs = new Map<number, Difficulty>();

  add(player: number, difficulty: Difficulty) {
    this.cfgs.set(player, difficulty);
  }

  remove(player: number) {
    this.cfgs.delete(player);
  }

  tick(world: World) {
    for (const [player, difficulty] of this.cfgs) {
      const d = DIFF[difficulty];
      if (world.tickCount % d.interval !== player % d.interval) continue; // staggered cadence
      this.plan(world, player, difficulty);
    }
  }

  // ---------- helpers ----------
  private unitsOf(world: World, player: number): UnitState[] {
    const out: UnitState[] = [];
    for (const u of world.units.values()) if (u.owner === player) out.push(u);
    return out;
  }

  private buildingsOf(world: World, player: number, key?: string, includeUnbuilt = false) {
    const out = [];
    for (const b of world.buildings.values()) {
      if (b.owner !== player) continue;
      if (!includeUnbuilt && !b.built) continue;
      if (key && b.key !== key) continue;
      out.push(b);
    }
    return out;
  }

  private findSpot(world: World, pid: number, key: string, cx: number, cy: number, maxR = 18): { tx: number; ty: number } | null {
    // start tile for the reachability probe: first free tile around (cx, cy)
    let start: { tx: number; ty: number } | null = null;
    for (let r = 0; r <= 6 && !start; r++)
      for (let dy = -r; dy <= r && !start; dy++)
        for (let dx = -r; dx <= r && !start; dx++)
          if (world.gridFor(pid).cost(cx + dx, cy + dy) !== Infinity) start = { tx: cx + dx, ty: cy + dy };
    if (!start) return null;

    const def = buildingDef(key);
    void def;
    const base = world.gridFor(pid);
    let probes = 0; // A* is expensive: try at most a few candidates per decision
    for (let r = 2; r <= maxR; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const tx = cx + dx;
          const ty = cy + dy;
          if (!canPlace(world, key, tx, ty).ok) continue;
          if (probes++ > 6) return null; // try next decision tick instead
          // the build site must be reachable: probe an adjacent work tile
          // while treating the future footprint as solid.
          const footprint = new Set(footprintTiles(key, tx, ty).map((t) => t.ty * world.map.w + t.tx));
          const probe = {
            w: base.w, h: base.h,
            cost: (x: number, y: number) => (footprint.has(y * world.map.w + x) ? Infinity : base.cost(x, y)),
          };
          const ghost = { id: -1, owner: pid, key, tx, ty, hp: 0, progress: 0, built: false, farmFarmland: false, farmBoost: false, queue: [] };
          const adj = freeAdjacentTile(world, ghost, start.tx, start.ty);
          if (adj && findPath(probe, start.tx, start.ty, adj.tx, adj.ty)) return { tx, ty };
        }
      }
    }
    return null;
  }

  /** nearest gatherable target for idle workers — weighted by current needs:
   *  scarce resources beat close-but-unneeded deposits. */
  private nearestResource(world: World, pid: number, tx: number, ty: number): { tx: number; ty: number } | null {
    const res = world.players[pid].res;
    const wanted: Record<string, number> = {
      wood: res.wood < 500 ? 0 : 20,
      game: res.food < 500 ? 0 : 20,
      stone: res.stone < 250 ? 10 : 25,
      iron: res.iron < 150 ? 10 : 25,
      gold: res.gold < 300 ? 10 : 25,
    };
    let best: { tx: number; ty: number } | null = null;
    let bestScore = Infinity;
    for (const d of world.map.deposits) {
      if (d.amount <= 0 || d.kind === 'fish') continue;
      const dist = Math.abs(d.tx - tx) + Math.abs(d.ty - ty);
      const score = dist + (wanted[d.kind] ?? 25);
      if (score < bestScore) { bestScore = score; best = { tx: d.tx, ty: d.ty }; }
    }
    // forest scan: start within 25 tiles, widen to the whole map if needed
    // ponytail: full-map scan once forests run out; a spatial bucket index
    // belongs in map.ts when forest queries turn hot.
    const { w, h } = world.map;
    for (const range of [25, 60, Math.max(w, h)]) {
      for (let y = Math.max(0, ty - range); y < Math.min(h, ty + range); y++) {
        for (let x = Math.max(0, tx - range); x < Math.min(w, tx + range); x++) {
          if (tileAt(world.map, x, y) !== Tile.Forest) continue;
          if (world.map.woodAmount[y * w + x] <= 0) continue;
          const dist = Math.abs(x - tx) + Math.abs(y - ty);
          const score = dist + wanted.wood;
          if (score < bestScore) { bestScore = score; best = { tx: x, ty: y }; }
        }
      }
      if (best) break;
    }
    return best;
  }

  // ---------- the planner ----------
  private plan(world: World, pid: number, difficulty: Difficulty) {
    const p = world.players[pid];
    if (!p) return;
    const persona = PERSONAS[p.faction] ?? FALLBACK;
    const diff = DIFF[difficulty];
    const mine = this.unitsOf(world, pid);
    const workers = mine.filter((u) => u.type === 'worker');
    const military = mine.filter((u) => MILITARY.has(unitDef(u.type).family) && unitDef(u.type).family !== 'general');
    const generals = mine.filter((u) => unitDef(u.type).family === 'general');
    const tcs = this.buildingsOf(world, pid, 'townCenter');
    const tc = tcs[0];
    if (!tc) return;

    // 1) economy: workers up to target (queued ones count — don't over-queue)
    const workerTarget = Math.min(persona.workerTarget || diff.workerCap, diff.workerCap);
    const queuedWorkers = tc.queue.filter((q) => q.unitKey === 'worker').length;
    if (workers.length + queuedWorkers < workerTarget && p.popUsed + 1 <= p.popCap) {
      if (p.res.food > 120 && canAfford(p.res, unitDef('worker').cost)) {
        world.enqueue({ type: 'train', player: pid, buildingId: tc.id, unitKey: 'worker' });
      }
    }

    // 2) idle workers → gather
    const idleWorkers = workers.filter((u) => !u.order && !u.task && !u.combat);
    for (const wk of idleWorkers) {
      const src = this.nearestResource(world, pid, Math.floor(wk.x / TILE), Math.floor(wk.y / TILE));
      if (src) world.enqueue({ type: 'gather', player: pid, unitIds: [wk.id], tx: src.tx, ty: src.ty });
    }

    // 2.5) resume stalled construction sites with idle workers
    const pool = [...idleWorkers];
    for (const ub of this.buildingsOf(world, pid, undefined, true)) {
      if (ub.built) continue;
      const assigned = workers.some((wk) => wk.task?.kind === 'build' && wk.task.buildingId === ub.id);
      if (assigned || !pool.length) continue;
      const crew = pool.splice(0, 2).map((x) => x.id);
      world.enqueue({ type: 'resumeBuild', player: pid, unitIds: crew, buildingId: ub.id });
    }

    // 3) buildings per persona — count unbuilt too or we spam duplicates.
    // Only a TRULY idle worker may take a project; a busy one keeps its task.
    const res = p.res;
    let startedProject = false;
    const startBuild = (key: string, spot: { tx: number; ty: number } | null) => {
      if (startedProject || !spot || !pool.length) return;
      world.enqueue({ type: 'build', player: pid, unitIds: [pool[0].id], key, tx: spot.tx, ty: spot.ty });
      startedProject = true;
    };

    for (const key of persona.buildOrder) {
      if (startedProject) break;
      if ((buildingDef(key).minEra ?? 0) > p.era) continue;
      const existing = this.buildingsOf(world, pid, key, true).length;
      // houses: only when close to the cap (max 6)
      if (key === 'house' && (p.popCap - p.popUsed > 2 || existing >= 6)) continue;
      if (key === 'farm' && existing >= 4) continue;
      if (key !== 'house' && key !== 'farm' && existing >= 1) continue;
      if (!canAfford(res, buildingDef(key).cost)) continue;
      startBuild(key, this.findSpot(world, pid, key, tc.tx + 1, tc.ty + 1));
    }

    const underConstruction = this.buildingsOf(world, pid, undefined, true).some((x) => !x.built);

    // towers for turtle persona
    if (!underConstruction && persona.wantsTowers && p.era >= 1 && this.buildingsOf(world, pid, 'watchtower', true).length < 2) {
      if (canAfford(res, BUILDING_DEFS.watchtower.cost)) {
        startBuild('watchtower', this.findSpot(world, pid, 'watchtower', tc.tx + 4, tc.ty + 4, 12));
      }
    }

    // market when the economy is rolling
    if (!underConstruction && persona.wantsMarket && p.era >= 1 && !this.buildingsOf(world, pid, 'market', true).length) {
      if (canAfford(res, BUILDING_DEFS.market.cost)) {
        startBuild('market', this.findSpot(world, pid, 'market', tc.tx + 3, tc.ty + 3));
      }
    }

    // 4) era push when rich (never easy)
    if (difficulty !== 'easy' && p.era < 2 && res.gold > 500 && res.food > 700) {
      world.enqueue({ type: 'researchEra', player: pid });
    }

    // 5) military production at each barracks-like building
    for (const b of this.buildingsOf(world, pid)) {
      const def = buildingDef(b.key);
      if (!def.trains.some((k) => MILITARY.has(unitDef(k).family))) continue;
      if (b.queue.length >= 2) continue;
      for (const key of persona.comp) {
        if (!def.trains.includes(key)) continue;
        const udef = unitDef(key);
        if ((udef.minEra ?? 0) > p.era) continue;
        if (p.popUsed + udef.pop > p.popCap) continue;
        if (!canAfford(res, udef.cost)) continue;
        world.enqueue({ type: 'train', player: pid, buildingId: b.id, unitKey: key });
        break;
      }
    }

    // 6) army formation + attack
    if (generals.length && military.length >= 4) {
      const gen = generals[0];
      const unassigned = military.filter((u) => u.armyId == null);
      if (unassigned.length) {
        world.enqueue({ type: 'assignArmy', player: pid, generalId: gen.id, unitIds: [...unassigned.map((u) => u.id), gen.id] });
      }
    }
    // push with a cooldown: re-issuing attackMove re-queues long A* paths;
    // armies need ~30 s to cross the map before we redirect them anyway.
    const threshold = persona.armyThreshold + diff.armyBonus;
    const last = this.lastPush.get(pid) ?? -Infinity;
    if (military.length >= threshold && world.tickCount - last > 480) {
      const target = this.enemyCommandPost(world, pid);
      if (target) {
        this.lastPush.set(pid, world.tickCount);
        const idle = military.filter((u) => {
          if (u.combat) return false;
          if (u.order && u.order.kind === 'attackMove'
              && Math.abs(u.order.tx - target.tx) + Math.abs(u.order.ty - target.ty) < 8) return false;
          return true;
        });
        if (idle.length) {
          world.enqueue({
            type: 'attackMove', player: pid,
            unitIds: idle.map((u) => u.id),
            tx: target.tx, ty: target.ty,
          });
        }
      }
    }
  }

  private lastPush = new Map<number, number>(); // player → tick of last army push

  /** nearest enemy town center (public intel — same start positions known to all scouts) */
  private enemyCommandPost(world: World, pid: number): { tx: number; ty: number } | null {
    const own = this.buildingsOf(world, pid, 'townCenter')[0];
    let best: { tx: number; ty: number } | null = null;
    let bestD = Infinity;
    for (const b of world.buildings.values()) {
      if (b.owner === pid || world.friendly(b.owner, pid)) continue;
      if (!buildingDef(b.key).projectsTerritory || !b.built) continue;
      const d = Math.abs(b.tx - (own?.tx ?? 0)) + Math.abs(b.ty - (own?.ty ?? 0));
      if (d < bestD) { bestD = d; best = { tx: b.tx, ty: b.ty }; }
    }
    return best;
  }
}
