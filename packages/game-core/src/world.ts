import { GameMap, TILE, Tile, generateMap, isBlocked, moveCost, tileAt } from './map';
import { PathQueue, Node } from './pathfinding';
import { MovementSystem } from './systems/movement';
import { FogSystem, FogState } from './systems/fog';
import { EconomySystem } from './systems/economy';
import { CombatSystem } from './systems/combat';
import { TerritorySystem } from './systems/territory';
import { TradeSystem } from './systems/trade';
import { ArmySystem, type ArmyState } from './systems/army';
import { AISystem } from './systems/ai';
import {
  BuildingState, ResTable, buildingDef, canAfford, canPlace, footprintTiles, freeAdjacentTile, payCost,
} from './buildings';
import { unitDef } from './units';

export const TICK_MS = 1000 / 16; // fixed sim step

export type Order =
  | { kind: 'move'; tx: number; ty: number }
  | { kind: 'attackMove'; tx: number; ty: number }
  | { kind: 'stop' }
  | { kind: 'hold' };

export type TaskPhase = 'goto' | 'working' | 'delivering';

export interface CombatState {
  unitId: number | null;
  buildingId: number | null;
  cooldown: number;
  awaitingProjectile?: number;
  pendingDamage?: number;
}

export type Formation = 'loose' | 'line' | 'wedge' | 'square';

export interface UnitTask {
  kind: 'gather' | 'build' | 'trade';
  phase: TaskPhase;
  tx: number; // primary target (resource tile / building tile)
  ty: number;
  depositId?: number; // for gather from discrete deposits
  buildingId?: number; // for build / delivery / destination market
  homeId?: number; // trade: home market
}

export interface UnitState {
  id: number;
  owner: number;
  type: string;
  x: number; // px
  y: number; // px
  hp: number;
  morale: number; // 0..100
  order: Order | null;
  path: Node[] | null;
  pathIdx: number;
  holdPosition: boolean;
  task: UnitTask | null;
  carry: { kind: keyof ResTable; amount: number } | null;
  combat: CombatState | null;
  attackMoveResume: Order | null; // attack-move order to resume after a kill
  pathSeq?: number; // request generation: stale queued callbacks are ignored
  pathReqAt?: number; // tick of last path request (throttle)
  armyId?: number | null;
  abilityCd?: number; // seconds left (generals)
  // one active buff per unit: until = tick it expires
  buffUntil?: number;
  buffSpeedMult?: number;
  buffDmgMult?: number;
  buffArmorAdd?: number;
  supplyMult?: number; // supply penalty (ArmySystem, per tick)
  auraDmg?: number; // general aura damage multiplier (recomputed per tick)
}

export interface PlayerState {
  id: number;
  faction: string;
  fog: FogState;
  res: ResTable;
  popUsed: number;
  popCap: number;
  starving: boolean;
  era: number; // 0 Settlement → 1 City → 2 Kingdom → 3 Imperial
  recruitBoostUntil?: number; // tick when Rapid Recruitment expires
}

export type Relation = 'ally' | 'hostile';

export type Command =
  | { type: 'move'; player: number; unitIds: number[]; tx: number; ty: number }
  | { type: 'attackMove'; player: number; unitIds: number[]; tx: number; ty: number }
  | { type: 'stop'; player: number; unitIds: number[] }
  | { type: 'hold'; player: number; unitIds: number[] }
  | { type: 'gather'; player: number; unitIds: number[]; tx: number; ty: number }
  | { type: 'build'; player: number; unitIds: number[]; key: string; tx: number; ty: number }
  | { type: 'resumeBuild'; player: number; unitIds: number[]; buildingId: number } // assign builders to an existing unbuilt/started site
  | { type: 'train'; player: number; buildingId: number; unitKey: string }
  | { type: 'attack'; player: number; unitIds: number[]; targetUnitId?: number; targetBuildingId?: number }
  | { type: 'formation'; player: number; unitIds: number[]; formation: Formation }
  | { type: 'researchEra'; player: number }
  | { type: 'assignArmy'; player: number; generalId: number; unitIds: number[] }
  | { type: 'ability'; player: number; generalId: number }
  | { type: 'setRelation'; player: number; target: number; relation: Relation };

export const ERA_NAMES = ['Settlement', 'City', 'Kingdom', 'Imperial'] as const;
export const ERA_COSTS: Partial<ResTable>[] = [
  { food: 350, gold: 250 }, // → City
  { food: 700, gold: 500, stone: 150 }, // → Kingdom
  { food: 1200, gold: 900, iron: 200 }, // → Imperial
];

export interface WorldOptions {
  seed: number;
  factions: string[];
  startResources?: Partial<ResTable>;
}

const DEFAULT_START_RES: ResTable = { food: 300, wood: 200, stone: 120, iron: 60, gold: 150, horses: 6 };

export class World {
  map: GameMap;
  units = new Map<number, UnitState>();
  buildings = new Map<number, BuildingState>();
  private buildingTiles = new Map<number, BuildingState>(); // tile idx → building footprint
  players: PlayerState[] = [];
  queue: Command[] = [];
  pathQueue = new PathQueue(16);
  nextUnitId = 1;
  nextBuildingId = 1;
  tickCount = 0;
  playerFormation: Formation[] = [];
  armies = new Map<number, ArmyState>();
  nextArmyId = 1;
  diplomacy: Relation[][] = []; // symmetric relation matrix
  private movement = new MovementSystem();
  private fog = new FogSystem();
  private economy = new EconomySystem();
  private combat = new CombatSystem();
  private trade = new TradeSystem();
  private army = new ArmySystem();
  ai = new AISystem();
  territory = new TerritorySystem();

  constructor(seed: number, factions: string[], startResources?: Partial<ResTable>);
  constructor(opts: WorldOptions);
  constructor(a: number | WorldOptions, factions?: string[], startResources?: Partial<ResTable>) {
    const opts: WorldOptions = typeof a === 'number' ? { seed: a, factions: factions!, startResources } : a;
    this.map = generateMap(opts.seed);
    opts.factions.forEach((faction, i) => {
      this.players.push({
        id: i,
        faction,
        fog: this.fog.createState(this.map),
        res: { ...DEFAULT_START_RES, ...opts.startResources },
        popUsed: 0,
        popCap: 0,
        starving: false,
        era: 0,
      });
      this.playerFormation.push('loose');
    });
    const n = this.players.length;
    this.diplomacy = Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) => (a === b ? 'ally' as Relation : 'hostile' as Relation)),
    );
    this.territory.init(this);
  }

  /** Allies are never targeted; hostiles are fair game. */
  friendly(a: number, b: number): boolean {
    return a === b || this.diplomacy[a]?.[b] === 'ally';
  }

  /** Pathing grid for a given owner: own gates are open, enemy buildings block. */
  gridFor(owner: number) {
    const m = this.map;
    return {
      w: m.w,
      h: m.h,
      cost: (tx: number, ty: number) => {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return Infinity;
        const t = m.tiles[ty * m.w + tx] as Tile;
        if (t === Tile.Bridge || t === Tile.Road) return moveCost(t);
        if (t === Tile.River || t === Tile.Mountain) return Infinity;
        const b = this.buildingAt(tx, ty);
        if (b) {
          if (b.key === 'gate' && this.friendly(b.owner, owner)) return 1;
          return Infinity;
        }
        return moveCost(t);
      },
    };
  }

  get grid() {
    return this.gridFor(-1); // neutral: every building blocks
  }

  buildingAt(tx: number, ty: number): BuildingState | null {
    // O(1) footprint lookup — gridFor cost() calls this per A* node
    return this.buildingTiles.get(ty * this.map.w + tx) ?? null;
  }

  recomputePop(owner: number) {
    const p = this.players[owner];
    let used = 0;
    for (const u of this.units.values()) if (u.owner === owner) used += unitDef(u.type).pop;
    let cap = 0;
    for (const b of this.buildings.values()) if (b.owner === owner && b.built) cap += buildingDef(b.key).popCap;
    p.popUsed = used;
    p.popCap = cap;
  }

  spawnUnit(owner: number, type: string, tx: number, ty: number): UnitState | null {
    if (isBlocked(this.map, tx, ty) || this.buildingAt(tx, ty)) return null;
    const def = unitDef(type);
    const u: UnitState = {
      id: this.nextUnitId++,
      owner,
      type,
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      hp: def.hp,
      morale: 80,
      order: null,
      path: null,
      pathIdx: 0,
      holdPosition: false,
      task: null,
      carry: null,
      combat: null,
      attackMoveResume: null,
    };
    this.units.set(u.id, u);
    this.recomputePop(owner);
    return u;
  }

  placeBuilding(owner: number, key: string, tx: number, ty: number, built = false): BuildingState | null {
    const v = canPlace(this, key, tx, ty);
    if (!v.ok) return null;
    const def = buildingDef(key);
    const b: BuildingState = {
      id: this.nextBuildingId++,
      owner,
      key,
      tx,
      ty,
      hp: built ? def.hp : Math.ceil(def.hp * 0.1),
      progress: built ? 1 : 0,
      built,
      farmFarmland: def.farmYield > 0 && !!v.onFarmland,
      farmBoost: def.farmYield > 0 && !!v.onFarmland,
      queue: [],
    };
    // construction clears the ground: forest under the footprint is felled
    for (const t of footprintTiles(key, tx, ty)) {
      const i = t.ty * this.map.w + t.tx;
      if (this.map.tiles[i] === Tile.Forest) {
        this.map.tiles[i] = Tile.Grass;
        this.map.woodAmount[i] = 0;
      }
    }
    this.buildings.set(b.id, b);
    for (const t of footprintTiles(key, tx, ty)) {
      this.buildingTiles.set(t.ty * this.map.w + t.tx, b);
    }
    this.applyGranaryAuras(owner);
    this.recomputePop(owner);
    return b;
  }

  removeBuilding(id: number) {
    const b = this.buildings.get(id);
    if (!b) return;
    this.buildings.delete(id);
    for (const t of footprintTiles(b.key, b.tx, b.ty)) {
      this.buildingTiles.delete(t.ty * this.map.w + t.tx);
    }
  }

  /** Farms within a granary radius get +30% yield (flagged on the farm). */
  applyGranaryAuras(owner: number) {
    const granaries = [...this.buildings.values()].filter((b) => b.owner === owner && b.built && buildingDef(b.key).radius > 0);
    for (const f of this.buildings.values()) {
      if (f.owner !== owner || buildingDef(f.key).farmYield <= 0 || !f.built) continue;
      const near = granaries.some(
        (g) => Math.abs(g.tx - f.tx) <= buildingDef(g.key).radius && Math.abs(g.ty - f.ty) <= buildingDef(g.key).radius,
      );
      f.farmBoost = f.farmFarmland || near;
    }
  }

  enqueue(cmd: Command) {
    this.queue.push(cmd);
  }

  private apply(cmd: Command) {
    const player = this.players[cmd.player];
    if (!player) return;
    if (cmd.type === 'setRelation') {
      if (this.players[cmd.target] && cmd.target !== cmd.player) {
        this.diplomacy[cmd.player][cmd.target] = cmd.relation;
        this.diplomacy[cmd.target][cmd.player] = cmd.relation;
      }
      return;
    }
    if (cmd.type === 'assignArmy') {
      const gen = this.units.get(cmd.generalId);
      if (!gen || gen.owner !== cmd.player || unitDef(gen.type).family !== 'general') return;
      let army = [...this.armies.values()].find((a) => a.owner === cmd.player && a.generalId === gen.id);
      if (!army) {
        army = { id: this.nextArmyId++, owner: cmd.player, generalId: gen.id, supply: 100 };
        this.armies.set(army.id, army);
      }
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (!u || u.owner !== cmd.player) continue;
        if (unitDef(u.type).family === 'worker' || unitDef(u.type).family === 'civil') continue;
        u.armyId = army.id;
      }
      gen.armyId = army.id;
      return;
    }
    if (cmd.type === 'ability') {
      const gen = this.units.get(cmd.generalId);
      if (!gen || gen.owner !== cmd.player || unitDef(gen.type).family !== 'general') return;
      if ((gen.abilityCd ?? 0) > 0) return;
      this.army.applyAbility(this, gen);
      return;
    }
    if (cmd.type === 'stop') {
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (u && u.owner === cmd.player) {
          u.order = null;
          u.path = null;
          u.holdPosition = false;
          u.task = null;
          u.combat = null;
        }
      }
      return;
    }
    if (cmd.type === 'formation') {
      this.playerFormation[cmd.player] = cmd.formation;
      return;
    }
    if (cmd.type === 'attack') {
      const tgtU = cmd.targetUnitId != null ? this.units.get(cmd.targetUnitId) : null;
      const tgtB = cmd.targetBuildingId != null ? this.buildings.get(cmd.targetBuildingId) : null;
      if (!tgtU && !tgtB) return;
      if (tgtU && this.friendly(tgtU.owner, cmd.player)) return;
      if (tgtB && this.friendly(tgtB.owner, cmd.player)) return;
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (!u || u.owner !== cmd.player) continue;
        const def = unitDef(u.type);
        if (def.family === 'worker') continue; // workers don't fight on command (they flee later)
        u.task = null;
        u.holdPosition = false;
        u.combat = {
          unitId: tgtU ? tgtU.id : null,
          buildingId: tgtB ? tgtB.id : null,
          cooldown: 0,
        };
        // move toward the target
        const gx = tgtU ? tgtU.x : (tgtB!.tx + buildingDef(tgtB!.key).w / 2) * TILE;
        const gy = tgtU ? tgtU.y : (tgtB!.ty + buildingDef(tgtB!.key).h / 2) * TILE;
        this.requestPath(u, Math.floor(gx / TILE), Math.floor(gy / TILE));
      }
      return;
    }
    if (cmd.type === 'hold') {
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (u && u.owner === cmd.player) {
          u.order = { kind: 'hold' };
          u.path = null;
          u.holdPosition = true;
        }
      }
      return;
    }
    if (cmd.type === 'researchEra') {
      const next = player.era + 1;
      if (next > 3) return;
      const cost = ERA_COSTS[player.era];
      if (!cost || !canAfford(player.res, cost)) return;
      payCost(player.res, cost);
      player.era = next;
      return;
    }
    if (cmd.type === 'build') {
      const def = buildingDef(cmd.key);
      if ((def.minEra ?? 0) > player.era) return;
      if (!canPlace(this, cmd.key, cmd.tx, cmd.ty).ok) return;
      if (!canAfford(player.res, def.cost)) return;
      payCost(player.res, def.cost);
      const b = this.placeBuilding(cmd.player, cmd.key, cmd.tx, cmd.ty);
      if (!b) return;
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (!u || u.owner !== cmd.player || u.type !== 'worker') continue;
        const fromTx = Math.floor(u.x / TILE);
        const fromTy = Math.floor(u.y / TILE);
        const adj = freeAdjacentTile(this, b, fromTx, fromTy);
        if (!adj) continue;
        u.task = { kind: 'build', phase: 'goto', tx: adj.tx, ty: adj.ty, buildingId: b.id };
        this.requestPath(u, adj.tx, adj.ty);
      }
      return;
    }
    if (cmd.type === 'resumeBuild') {
      const b = this.buildings.get(cmd.buildingId);
      if (!b || b.owner !== cmd.player || b.built) return;
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (!u || u.owner !== cmd.player || u.type !== 'worker') continue;
        const adj = freeAdjacentTile(this, b, Math.floor(u.x / TILE), Math.floor(u.y / TILE));
        if (!adj) continue;
        u.task = { kind: 'build', phase: 'goto', tx: adj.tx, ty: adj.ty, buildingId: b.id };
        this.requestPath(u, adj.tx, adj.ty);
      }
      return;
    }
    if (cmd.type === 'gather') {
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (!u || u.owner !== cmd.player || u.type !== 'worker') continue;
        const deposit = this.map.deposits.find((d) => d.tx === cmd.tx && d.ty === cmd.ty && d.amount > 0);
        const isForest = tileAt(this.map, cmd.tx, cmd.ty) === Tile.Forest;
        if (!deposit && !isForest) continue;
        u.task = { kind: 'gather', phase: 'goto', tx: cmd.tx, ty: cmd.ty, depositId: deposit?.id };
        this.requestPath(u, cmd.tx, cmd.ty);
      }
      return;
    }
    if (cmd.type === 'train') {
      const b = this.buildings.get(cmd.buildingId);
      if (!b || b.owner !== cmd.player || !b.built) return;
      const def = buildingDef(b.key);
      if (!def.trains.includes(cmd.unitKey)) return;
      if (b.queue.length >= 5) return;
      const udef = unitDef(cmd.unitKey);
      if ((udef.minEra ?? 0) > player.era) return;
      if (player.popUsed + udef.pop > player.popCap) return; // pop cap enforced
      if (!canAfford(player.res, udef.cost)) return;
      payCost(player.res, udef.cost);
      b.queue.push({ unitKey: cmd.unitKey, remaining: udef.trainTime, total: udef.trainTime });
      return;
    }
    // move / attackMove: path per unit, formation offsets around the point
    const kind = cmd.type;
    const offsets = formationOffsets(this.playerFormation[cmd.player] ?? 'loose');
    let n = 0;
    for (const id of cmd.unitIds) {
      const u = this.units.get(id);
      if (!u || u.owner !== cmd.player) continue;
      const ring = n === 0 ? [0, 0] : offsets[n % offsets.length];
      n++;
      const rawTx = cmd.tx + ring[0];
      const rawTy = cmd.ty + ring[1];
      const { tx, ty } = this.reachableTarget(rawTx, rawTy, u.owner);
      u.order = { kind, tx, ty };
      u.holdPosition = false;
      u.task = null; // manual move cancels work tasks
      if (kind === 'move') u.combat = null; // explicit move disengages
      this.requestPath(u, tx, ty);
    }
  }

  /** A command target may land inside a building/water: snap to the nearest
   *  reachable tile (ring search) so orders are never silently cancelled. */
  reachableTarget(tx: number, ty: number, owner: number): { tx: number; ty: number } {
    const g = this.gridFor(owner);
    if (g.cost(tx, ty) !== Infinity) return { tx, ty };
    for (let r = 1; r <= 8; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const x = tx + dx;
          const y = ty + dy;
          if (g.cost(x, y) !== Infinity) return { tx: x, ty: y };
        }
      }
    }
    return { tx, ty }; // totally sealed — requestPath will cancel safely
  }

  requestPath(u: UnitState, tx: number, ty: number) {
    const sx = Math.floor(u.x / TILE);
    const sy = Math.floor(u.y / TILE);
    if (sx === tx && sy === ty) {
      // already standing on the target tile: instant arrival, no path
      // (a 1-node path is never consumed by the movement system — it leaves
      // a stale path that blocks task processing forever)
      u.pathSeq = (u.pathSeq ?? 0) + 1; // invalidate any still-queued callback
      u.order = null;
      u.path = null;
      u.pathIdx = 0;
      return;
    }
    // throttle: pursuers of unreachable targets re-request every tick
    // otherwise — each miss costs a full-map A*. 4 ticks ≈ 250ms, invisible.
    if (u.pathReqAt != null && this.tickCount - u.pathReqAt < 4) return;
    u.pathReqAt = this.tickCount;
    const seq = (u.pathSeq = (u.pathSeq ?? 0) + 1);
    u.order = { kind: 'move', tx, ty }; // task legs are move orders
    this.pathQueue.request(this.gridFor(u.owner), sx, sy, tx, ty, (p) => {
      const unit = this.units.get(u.id);
      if (!unit || unit.pathSeq !== seq) return; // superseded by a newer request
      if (!p || p.length <= 1) {
        // unreachable (water, sealed pocket) or degenerate: cancel, go idle
        unit.task = null;
        unit.order = null;
        unit.path = null;
        return;
      }
      unit.path = p;
      unit.pathIdx = 1; // path[0] is the current tile
    });
  }

  tick(dtMs = TICK_MS) {
    this.tickCount++;
    const cmds = this.queue;
    this.queue = [];
    for (const c of cmds) this.apply(c);
    this.pathQueue.drain();
    this.movement.tick(this, dtMs);
    this.economy.tick(this, dtMs);
    this.trade.tick(this, dtMs);
    this.combat.tick(this, dtMs);
    this.army.tick(this, dtMs);
    this.scanAggroSubset();
    this.territory.tick(this);
    this.fog.update(this);
    this.ai.tick(this);
  }

  private aggroCursor = 0;
  /** Round-robin aggro scan: 1/16th of units per tick (O(n²) amortized). */
  private scanAggroSubset() {
    const list = [...this.units.values()];
    if (!list.length) return;
    const chunk = Math.max(1, Math.ceil(list.length / 16));
    const start = this.aggroCursor % list.length;
    for (let i = start; i < start + chunk && i < list.length; i++) {
      const u = list[i];
      if (u.combat || u.task) continue;
      if (u.holdPosition || (u.order && u.order.kind === 'attackMove') || !u.order) {
        this.combat.scanAggro(this, u);
      }
    }
    this.aggroCursor = (start + chunk) % list.length;
  }

  /** Projectiles visible to renderers (client-side effect layer). */
  get projectiles() {
    return this.combat.projectiles;
  }

  unitAtPx(x: number, y: number, r = 14): UnitState | null {
    for (const u of this.units.values()) {
      const dx = u.x - x;
      const dy = u.y - y;
      if (dx * dx + dy * dy <= r * r) return u;
    }
    return null;
  }

  serialize(): SerializedWorld {
    return {
      seed: this.map.seed,
      factions: this.players.map((p) => p.faction),
      tick: this.tickCount,
      nextUnitId: this.nextUnitId,
      nextBuildingId: this.nextBuildingId,
      nextArmyId: this.nextArmyId,
      units: [...this.units.values()].map((u) => ({ ...u, path: null })),
      buildings: [...this.buildings.values()],
      players: this.players.map((p) => ({
        id: p.id, res: p.res, popUsed: p.popUsed, popCap: p.popCap, starving: p.starving, era: p.era,
        recruitBoostUntil: p.recruitBoostUntil,
      })),
      armies: [...this.armies.values()],
      diplomacy: this.diplomacy.map((row) => [...row]),
      deposits: this.map.deposits.map((d) => ({ ...d })),
      woodAmount: [...this.map.woodAmount],
      fogExplored: this.players.map((p) => Array.from(p.fog.explored)),
      formations: [...this.playerFormation],
      ai: this.ai.snapshot(),
    };
  }

  static deserialize(s: SerializedWorld): World {
    const w = new World(s.seed, s.factions);
    s.deposits.forEach((d, i) => {
      if (w.map.deposits[i] && w.map.deposits[i].id === d.id) w.map.deposits[i].amount = d.amount;
    });
    s.woodAmount.forEach((v, i) => (w.map.woodAmount[i] = v));
    w.tickCount = s.tick;
    w.nextUnitId = s.nextUnitId;
    w.nextBuildingId = s.nextBuildingId;
    w.nextArmyId = s.nextArmyId ?? 0;
    if (s.armies) for (const a of s.armies) w.armies.set(a.id, { ...a });
    if (s.diplomacy) w.diplomacy = s.diplomacy.map((row) => [...row]);
    s.players.forEach((sp, i) => {
      Object.assign(w.players[i].res, sp.res);
      w.players[i].popUsed = sp.popUsed;
      w.players[i].popCap = sp.popCap;
      w.players[i].starving = sp.starving;
      w.players[i].era = sp.era ?? 0;
      w.players[i].recruitBoostUntil = sp.recruitBoostUntil;
    });
    for (const u of s.units) w.units.set(u.id, { ...u, path: null, pathIdx: 0 });
    for (const b of s.buildings) {
      const copy = { ...b, queue: b.queue.map((q) => ({ ...q })) };
      w.buildings.set(b.id, copy);
      for (const t of footprintTiles(b.key, b.tx, b.ty)) {
        w.buildingTiles.set(t.ty * w.map.w + t.tx, copy);
      }
    }
    if (s.fogExplored) s.fogExplored.forEach((grid, i) => {
      if (w.players[i] && grid.length === w.players[i].fog.explored.length) {
        w.players[i].fog.explored.set(grid);
        w.players[i].fog.dirty = true;
      }
    });
    if (s.formations) s.formations.forEach((f, i) => (w.playerFormation[i] = f));
    if (s.ai) for (const [pid, diff] of s.ai) w.ai.add(pid, diff);
    return w;
  }
}

export interface SerializedWorld {
  seed: number;
  factions: string[];
  tick: number;
  nextUnitId: number;
  nextBuildingId: number;
  nextArmyId?: number;
  units: UnitState[];
  buildings: BuildingState[];
  players: { id: number; res: ResTable; popUsed: number; popCap: number; starving: boolean; era?: number; recruitBoostUntil?: number }[];
  armies?: ArmyState[];
  diplomacy?: Relation[][];
  deposits: { id: number; amount: number }[];
  woodAmount: number[];
  fogExplored?: number[][];
  formations?: Formation[];
  ai?: [number, import('./systems/ai').Difficulty][];
}

// formation offsets for group move targets — prevents stacking, shapes the army
const SPIRAL: [number, number][] = [];
{
  let x = 0;
  let y = 0;
  let dx = 0;
  let dy = -1;
  for (let i = 0; i < 64; i++) {
    SPIRAL.push([x, y]);
    if (x === y || (x < 0 && x === -y) || (x > 0 && x === 1 - y)) [dx, dy] = [-dy, dx];
    x += dx;
    y += dy;
  }
}

const FORMATIONS: Record<Formation, [number, number][]> = {
  loose: SPIRAL,
  line: [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [3, 0], [-3, 0], [4, 0], [-4, 0], [0, 1], [1, 1], [-1, 1], [2, 1], [-2, 1], [3, 1], [-3, 1]],
  wedge: [[0, 0], [-1, 1], [1, 1], [-2, 2], [0, 2], [2, 2], [-3, 3], [-1, 3], [1, 3], [3, 3], [-4, 4], [-2, 4], [0, 4], [2, 4], [4, 4]],
  square: [[-1, -1], [0, -1], [1, -1], [2, -1], [-1, 0], [2, 0], [-1, 1], [2, 1], [-1, 2], [0, 2], [1, 2], [2, 2], [0, 0], [1, 0], [0, 1], [1, 1]],
};

export function formationOffsets(f: Formation): [number, number][] {
  return FORMATIONS[f] ?? SPIRAL;
}
