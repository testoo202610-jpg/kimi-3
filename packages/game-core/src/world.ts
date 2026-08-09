import { GameMap, TILE, generateMap, isBlocked } from './map';
import { PathQueue, Node } from './pathfinding';
import { moveCost } from './map';
import { MovementSystem } from './systems/movement';
import { FogSystem, FogState } from './systems/fog';

export const TICK_MS = 1000 / 16; // fixed sim step

export type Order =
  | { kind: 'move'; tx: number; ty: number }
  | { kind: 'attackMove'; tx: number; ty: number }
  | { kind: 'stop' }
  | { kind: 'hold' };

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
}

export interface PlayerState {
  id: number;
  faction: string;
  fog: FogState;
}

export type Command =
  | { type: 'move'; player: number; unitIds: number[]; tx: number; ty: number }
  | { type: 'attackMove'; player: number; unitIds: number[]; tx: number; ty: number }
  | { type: 'stop'; player: number; unitIds: number[] }
  | { type: 'hold'; player: number; unitIds: number[] };

export class World {
  map: GameMap;
  units = new Map<number, UnitState>();
  players: PlayerState[] = [];
  queue: Command[] = [];
  pathQueue = new PathQueue(16);
  nextUnitId = 1;
  tickCount = 0;
  private movement = new MovementSystem();
  private fog = new FogSystem();

  constructor(seed: number, factions: string[]) {
    this.map = generateMap(seed);
    factions.forEach((faction, i) => {
      this.players.push({ id: i, faction, fog: this.fog.createState(this.map) });
    });
  }

  get grid() {
    const m = this.map;
    return {
      w: m.w,
      h: m.h,
      cost: (tx: number, ty: number) => {
        if (tx < 0 || ty < 0 || tx >= m.w || ty >= m.h) return Infinity;
        return moveCost(m.tiles[ty * m.w + tx]);
      },
    };
  }

  spawnUnit(owner: number, type: string, tx: number, ty: number): UnitState | null {
    if (isBlocked(this.map, tx, ty)) return null;
    const u: UnitState = {
      id: this.nextUnitId++,
      owner,
      type,
      x: tx * TILE + TILE / 2,
      y: ty * TILE + TILE / 2,
      hp: 100, // overwritten by caller using unitDef; default keeps spawn cheap
      morale: 80,
      order: null,
      path: null,
      pathIdx: 0,
      holdPosition: false,
    };
    this.units.set(u.id, u);
    return u;
  }

  enqueue(cmd: Command) {
    this.queue.push(cmd);
  }

  private apply(cmd: Command) {
    if (cmd.type === 'stop') {
      for (const id of cmd.unitIds) {
        const u = this.units.get(id);
        if (u && u.owner === cmd.player) {
          u.order = null;
          u.path = null;
          u.holdPosition = false;
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
      const sx = Math.floor(u.x / TILE);
      const sy = Math.floor(u.y / TILE);
      u.order = { kind, tx, ty };
      u.holdPosition = false;
      this.pathQueue.request(this.grid, sx, sy, tx, ty, (p) => {
        const unit = this.units.get(id);
        // discard if order changed meanwhile
        if (unit && unit.order && unit.order.kind !== 'stop') {
          unit.path = p;
          unit.pathIdx = p ? 1 : 0; // path[0] is current tile
        }
      });
    }
  }

  tick(dtMs = TICK_MS) {
    this.tickCount++;
    const cmds = this.queue;
    this.queue = [];
    for (const c of cmds) this.apply(c);
    this.pathQueue.drain();
    this.movement.tick(this, dtMs);
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
      units: [...this.units.values()].map((u) => ({ ...u, path: null })),
    };
  }

  static deserialize(s: SerializedWorld): World {
    const w = new World(s.seed, s.factions);
    w.tickCount = s.tick;
    w.nextUnitId = s.nextUnitId;
    for (const u of s.units) {
      w.units.set(u.id, { ...u, path: null, pathIdx: 0 });
    }
    return w;
  }
}

export interface SerializedWorld {
  seed: number;
  factions: string[];
  tick: number;
  nextUnitId: number;
  units: UnitState[];
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
