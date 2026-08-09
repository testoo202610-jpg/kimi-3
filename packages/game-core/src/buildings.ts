import type { World } from './world';
import { TILE, Tile, tileAt, type GameMap, type ResourceKind } from './map';

export type Resource = 'food' | 'wood' | 'stone' | 'iron' | 'gold' | 'horses';
export const RESOURCES: Resource[] = ['food', 'wood', 'stone', 'iron', 'gold', 'horses'];
export type ResTable = Record<Resource, number>;
export const emptyRes = (): ResTable => ({ food: 0, wood: 0, stone: 0, iron: 0, gold: 0, horses: 0 });

export const DEPOSIT_TO_RES: Record<ResourceKind, Resource> = {
  wood: 'wood', stone: 'stone', iron: 'iron', gold: 'gold', fish: 'food', game: 'food',
};

export interface BuildingDef {
  key: string;
  name: string;
  w: number; // footprint tiles
  h: number;
  hp: number;
  buildTime: number; // seconds for one builder
  cost: Partial<ResTable>;
  popCap: number; // housing added
  dropoff: Resource[]; // accepts these resources (empty = none)
  trains: string[]; // unit keys
  farmYield: number; // food/sec if farm
  terrain: 'any' | 'farmland';
  radius: number; // aura radius (granary), 0 = none
}

export const BUILDING_DEFS: Record<string, BuildingDef> = {
  townCenter: {
    key: 'townCenter', name: 'Town Center', w: 3, h: 3, hp: 1400, buildTime: 30,
    cost: { wood: 250, stone: 100, gold: 100 }, popCap: 10,
    dropoff: ['food', 'wood', 'stone', 'iron', 'gold'], trains: ['worker'], farmYield: 0, terrain: 'any', radius: 0,
  },
  house: {
    key: 'house', name: 'House', w: 2, h: 2, hp: 300, buildTime: 8,
    cost: { wood: 30 }, popCap: 5, dropoff: [], trains: [], farmYield: 0, terrain: 'any', radius: 0,
  },
  farm: {
    key: 'farm', name: 'Farm', w: 2, h: 2, hp: 250, buildTime: 8,
    cost: { wood: 40 }, popCap: 0, dropoff: [], trains: [], farmYield: 0.25, terrain: 'any', radius: 0,
  },
  granary: {
    key: 'granary', name: 'Granary', w: 2, h: 2, hp: 500, buildTime: 12,
    cost: { wood: 80 }, popCap: 0, dropoff: ['food'], trains: [], farmYield: 0, terrain: 'any', radius: 7,
  },
  lumberCamp: {
    key: 'lumberCamp', name: 'Lumber Camp', w: 2, h: 2, hp: 400, buildTime: 10,
    cost: { wood: 60 }, popCap: 0, dropoff: ['wood'], trains: [], farmYield: 0, terrain: 'any', radius: 0,
  },
  stoneCamp: {
    key: 'stoneCamp', name: 'Stone Camp', w: 2, h: 2, hp: 400, buildTime: 10,
    cost: { wood: 60 }, popCap: 0, dropoff: ['stone'], trains: [], farmYield: 0, terrain: 'any', radius: 0,
  },
  mineCamp: {
    key: 'mineCamp', name: 'Mine Camp', w: 2, h: 2, hp: 400, buildTime: 10,
    cost: { wood: 70 }, popCap: 0, dropoff: ['iron', 'gold'], trains: [], farmYield: 0, terrain: 'any', radius: 0,
  },
  warehouse: {
    key: 'warehouse', name: 'Warehouse', w: 2, h: 2, hp: 500, buildTime: 12,
    cost: { wood: 90 }, popCap: 0, dropoff: ['food', 'wood', 'stone', 'iron', 'gold'], trains: [], farmYield: 0, terrain: 'any', radius: 0,
  },
  watchtower: {
    key: 'watchtower', name: 'Watchtower', w: 1, h: 1, hp: 450, buildTime: 14,
    cost: { stone: 80, wood: 20 }, popCap: 0, dropoff: [], trains: [], farmYield: 0, terrain: 'any', radius: 0,
  },
};

export function buildingDef(key: string): BuildingDef {
  const d = BUILDING_DEFS[key];
  if (!d) throw new Error(`unknown building: ${key}`);
  return d;
}

export interface BuildingState {
  id: number;
  owner: number;
  key: string;
  tx: number;
  ty: number;
  hp: number;
  progress: number; // 0..1 construction
  built: boolean;
  farmFarmland: boolean; // placed on fertile tiles
  farmBoost: boolean; // granary aura applied or on farmland
  queue: { unitKey: string; remaining: number; total: number }[];
}

export interface PlacementResult {
  ok: boolean;
  reason?: string;
  onFarmland?: boolean;
}

export function footprintTiles(key: string, tx: number, ty: number): { tx: number; ty: number }[] {
  const d = buildingDef(key);
  const out: { tx: number; ty: number }[] = [];
  for (let y = ty; y < ty + d.h; y++) for (let x = tx; x < tx + d.w; x++) out.push({ tx: x, ty: y });
  return out;
}

/** Pure placement validation — shared by client ghost preview and command validation. */
export function canPlace(world: World, key: string, tx: number, ty: number): PlacementResult {
  const def = buildingDef(key);
  const { w: mw, h: mh } = world.map;
  for (const t of footprintTiles(key, tx, ty)) {
    if (t.tx < 0 || t.ty < 0 || t.tx >= mw || t.ty >= mh) return { ok: false, reason: 'out of bounds' };
    const tile = tileAt(world.map, t.tx, t.ty);
    if (tile === Tile.Mountain || tile === Tile.River || tile === Tile.Bridge)
      return { ok: false, reason: 'terrain' };
    if (world.buildingAt(t.tx, t.ty)) return { ok: false, reason: 'occupied' };
  }
  if (def.terrain === 'farmland' && !placementTouches(world.map, key, tx, ty, Tile.Farmland))
    return { ok: false, reason: 'needs farmland' };
  return { ok: true, onFarmland: placementTouches(world.map, key, tx, ty, Tile.Farmland) };
}

function placementTouches(map: GameMap, key: string, tx: number, ty: number, t: Tile): boolean {
  return footprintTiles(key, tx, ty).some((p) => tileAt(map, p.tx, p.ty) === t);
}

export function canAfford(res: ResTable, cost: Partial<ResTable>): boolean {
  return Object.entries(cost).every(([k, v]) => res[k as Resource] >= (v ?? 0));
}

export function payCost(res: ResTable, cost: Partial<ResTable>) {
  for (const [k, v] of Object.entries(cost)) res[k as Resource] -= v ?? 0;
}

export function buildingCenter(b: BuildingState): { x: number; y: number } {
  const d = buildingDef(b.key);
  return { x: (b.tx + d.w / 2) * TILE, y: (b.ty + d.h / 2) * TILE };
}

/** Nearest free tile adjacent to a building footprint (for workers/delivery/training spawns). */
export function freeAdjacentTile(world: World, b: BuildingState, fromTx: number, fromTy: number): { tx: number; ty: number } | null {
  const d = buildingDef(b.key);
  let best: { tx: number; ty: number } | null = null;
  let bestDist = Infinity;
  for (let y = b.ty - 1; y <= b.ty + d.h; y++) {
    for (let x = b.tx - 1; x <= b.tx + d.w; x++) {
      const edge = x === b.tx - 1 || x === b.tx + d.w || y === b.ty - 1 || y === b.ty + d.h;
      if (!edge) continue;
      if (x < 0 || y < 0 || x >= world.map.w || y >= world.map.h) continue;
      const t = tileAt(world.map, x, y);
      if (t === Tile.Mountain || t === Tile.River || t === Tile.Bridge) continue;
      if (world.buildingAt(x, y)) continue;
      const dist = Math.abs(x - fromTx) + Math.abs(y - fromTy);
      if (dist < bestDist) {
        bestDist = dist;
        best = { tx: x, ty: y };
      }
    }
  }
  return best;
}
