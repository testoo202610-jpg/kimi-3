import { GameMap, TILE, Tile, generateMap, isBlocked, moveCost, tileAt } from './map';
import { PathQueue, Node } from './pathfinding';
import { MovementSystem } from './systems/movement';
import { FogSystem, FogState } from './systems/fog';
import { EconomySystem } from './systems/economy';
import {
  BuildingState, ResTable, buildingDef, canAfford, canPlace, freeAdjacentTile, payCost,
} from './buildings';
import { unitDef } from './units';

export const TICK_MS = 1000 / 16; // fixed sim step

export type Order =
  | { kind: 'move'; tx: number; ty: number }
  | { kind: 'attackMove'; tx: number; ty: number }
  | { kind: 'stop' }
  | { kind: 'hold' };

export type TaskPhase = 'goto' | 'working' | 'delivering';

export interface UnitTask {
  kind: 'gather' | 'build';
  phase: TaskPhase;
  tx: number; // primary target (resource tile / building tile)
  ty: number;
  depositId?: number; // for gather from discrete deposits
  buildingId?: number; // for build / delivery
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
}

export interface PlayerState {
  id: number;
  faction: string;
  fog: FogState;
  res: ResTable;
  popUsed: number;
  popCap: number;
  starving: boolean;
}

export type Command =
  | { type: 'move'; player: number; unitIds: number[]; tx: number; ty: number }
  | { type: 'attackMove'; player: number; unitIds: number[]; tx: number; ty: number }
  | { type: 'stop'; player: number; unitIds: number[] }
  | { type: 'hold'; player: number; unitIds: number[] }
  | { type: 'gather'; player: number; unitIds: number[]; tx: number; ty: number }
  | { type: 'build'; player: number; unitIds: number[]; key: string; tx: number; ty: number }
  | { type: 'train'; player: number; buildingId: number; unitKey: string };

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
  players: PlayerState[] = [];
  queue: Command[] = [];
  pathQueue = new PathQueue(16);
  nextUnitId = 1;
  nextBuildingId = 1;
  tickCount = 0;
  private movement = new MovementSystem();
  private fog = new FogSystem();
  private economy = new EconomySystem();

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
      });
    });
  }

  get grid() {
    const m = this.map;
    return {
      w: m.w,
      h: m.h,
      cost: (tx: number, ty: number) => {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return Infinity;
        const t = m.tiles[ty * m.w + tx] as Tile;
        if (t === Tile.Bridge || t === Tile.Road) return moveCost(t);
        if (t === Tile.River || t === Tile.Mountain) return Infinity;
        if (this.buildingAt(tx, ty)) return Infinity;
        return moveCost(t);
      },
    };
  }

  buildingAt(tx: number, ty: number): BuildingState | null {
    for (const b of this.buildings.values()) {
      const d = buildingDef(b.key);
      if (tx >= b.tx && tx < b.tx + d.w && ty >= b.ty && ty < b.ty + d.h) return b;
    }
    return null;
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
    this.buildings.set(b.id, b);
    this.applyGranaryAuras(owner);
    this.recomputePop(owner);
    return b;
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
    if (cmd.type === 'stop') {
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (u && u.owner === cmd.player) {
          u.order = null;
          u.path = null;
          u.holdPosition = false;
          u.task = null;
        }
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
    if (cmd.type === 'build') {
      const def = buildingDef(cmd.key);
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
      if (player.popUsed + udef.pop > player.popCap) return; // pop cap enforced
      if (!canAfford(player.res, udef.cost)) return;
      payCost(player.res, udef.cost);
      b.queue.push({ unitKey: cmd.unitKey, remaining: udef.trainTime, total: udef.trainTime });
      return;
    }
    // move / attackMove: path per unit, spread group targets around the point
    const kind = cmd.type;
    let n = 0;
    for (const id of cmd.unitIds) {
      const u = this.units.get(id);
      if (!u || u.owner !== cmd.player) continue;
      const ring = n === 0 ? [0, 0] : SPIRAL[n % SPIRAL.length];
      n++;
      const tx = cmd.tx + ring[0];
      const ty = cmd.ty + ring[1];
      u.order = { kind, tx, ty };
      u.holdPosition = false;
      u.task = null; // manual move cancels work tasks
      this.requestPath(u, tx, ty);
    }
  }

  requestPath(u: UnitState, tx: number, ty: number) {
    const sx = Math.floor(u.x / TILE);
    const sy = Math.floor(u.y / TILE);
    u.order = { kind: 'move', tx, ty }; // task legs are move orders
    this.pathQueue.request(this.grid, sx, sy, tx, ty, (p) => {
      const unit = this.units.get(u.id);
      if (!unit) return;
      if (!p) {
        // unreachable (water, sealed pocket): cancel the task, go idle
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
    this.fog.update(this);
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
      units: [...this.units.values()].map((u) => ({ ...u, path: null })),
      buildings: [...this.buildings.values()],
      players: this.players.map((p) => ({
        id: p.id, res: p.res, popUsed: p.popUsed, popCap: p.popCap, starving: p.starving,
      })),
      deposits: this.map.deposits.map((d) => ({ ...d })),
      woodAmount: [...this.map.woodAmount],
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
    s.players.forEach((sp, i) => {
      Object.assign(w.players[i].res, sp.res);
      w.players[i].popUsed = sp.popUsed;
      w.players[i].popCap = sp.popCap;
      w.players[i].starving = sp.starving;
    });
    for (const u of s.units) w.units.set(u.id, { ...u, path: null, pathIdx: 0 });
    for (const b of s.buildings) w.buildings.set(b.id, { ...b, queue: b.queue.map((q) => ({ ...q })) });
    return w;
  }
}

export interface SerializedWorld {
  seed: number;
  factions: string[];
  tick: number;
  nextUnitId: number;
  nextBuildingId: number;
  units: UnitState[];
  buildings: BuildingState[];
  players: { id: number; res: ResTable; popUsed: number; popCap: number; starving: boolean }[];
  deposits: { id: number; amount: number }[];
  woodAmount: number[];
}

// ring offsets for group move targets — keeps formations from stacking
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
