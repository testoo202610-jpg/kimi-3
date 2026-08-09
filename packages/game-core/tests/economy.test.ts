import { describe, expect, it } from 'vitest';
import { World, TICK_MS } from '../src/world';
import { BUILDING_DEFS, canPlace } from '../src/buildings';
import { ECONOMY } from '../src/systems/economy';
import { TILE, Tile } from '../src/map';

function run(w: World, seconds: number) {
  const steps = Math.ceil((seconds * 1000) / TICK_MS);
  for (let i = 0; i < steps; i++) w.tick(TICK_MS);
}

function worldWithTown() {
  const w = new World(11, ['dominion', 'river'], { food: 500, wood: 400, stone: 200, iron: 100, gold: 200 });
  const tc = w.placeBuilding(0, 'townCenter', 12, 12, true)!;
  const worker = w.spawnUnit(0, 'worker', 16, 12)!;
  w.recomputePop(0);
  return { w, tc, worker };
}

describe('placement', () => {
  it('rejects out of bounds, blocked terrain and overlap', () => {
    const w = new World(11, ['dominion']);
    expect(canPlace(w, 'house', -1, 5).ok).toBe(false);
    // mountain tile
    let mt = -1;
    for (let i = 0; i < w.map.tiles.length; i++) if (w.map.tiles[i] === Tile.Mountain) { mt = i; break; }
    expect(mt).toBeGreaterThanOrEqual(0);
    expect(canPlace(w, 'house', mt % w.map.w, Math.floor(mt / w.map.w)).ok).toBe(false);
    // overlap: place town center then try house on same spot
    w.placeBuilding(0, 'townCenter', 12, 12, true);
    expect(canPlace(w, 'house', 12, 12).ok).toBe(false);
  });

  it('accepts valid placements and reports farmland', () => {
    const w = new World(11, ['dominion']);
    // find a farmland tile
    let ft = -1;
    for (let i = 0; i < w.map.tiles.length; i++) if (w.map.tiles[i] === Tile.Farmland) { ft = i; break; }
    expect(ft).toBeGreaterThanOrEqual(0);
    const tx = ft % w.map.w;
    const ty = Math.floor(ft / w.map.w);
    const v = canPlace(w, 'farm', tx, ty);
    expect(v.ok).toBe(true);
    expect(v.onFarmland).toBe(true);
  });
});

describe('building construction', () => {
  it('worker builds a house: cost deducted, progresses, completes, raises pop cap', () => {
    const { w } = worldWithTown();
    const wood0 = w.players[0].res.wood;
    w.enqueue({ type: 'build', player: 0, unitIds: [findWorker(w)!], key: 'house', tx: 17, ty: 12 });
    w.tick(TICK_MS);
    expect(w.players[0].res.wood).toBe(wood0 - BUILDING_DEFS.house.cost.wood!);
    const cap0 = w.players[0].popCap;
    run(w, BUILDING_DEFS.house.buildTime + 4);
    const house = [...w.buildings.values()].find((b) => b.key === 'house')!;
    expect(house.built).toBe(true);
    expect(house.hp).toBe(BUILDING_DEFS.house.hp);
    expect(w.players[0].popCap).toBe(cap0 + BUILDING_DEFS.house.popCap);
  });

  it('rejects building when unaffordable', () => {
    const w = new World(11, ['dominion'], { wood: 0 });
    w.placeBuilding(0, 'townCenter', 12, 12, true);
    const u = w.spawnUnit(0, 'worker', 16, 12)!;
    w.enqueue({ type: 'build', player: 0, unitIds: [u.id], key: 'house', tx: 20, ty: 20 });
    w.tick(TICK_MS);
    expect([...w.buildings.values()].filter((b) => b.key === 'house')).toHaveLength(0);
  });
});

describe('gathering', () => {
  it('worker chops wood, carries to town center, player gains wood; forest depletes', () => {
    const { w, worker } = worldWithTown();
    // nearest forest tile
    let ft: { tx: number; ty: number } | null = null;
    outer: for (let y = 0; y < w.map.h; y++) for (let x = 0; x < w.map.w; x++) {
      if (w.map.tiles[y * w.map.w + x] === Tile.Forest) { ft = { tx: x, ty: y }; break outer; }
    }
    expect(ft).not.toBeNull();
    const wood0 = w.players[0].res.wood;
    const amount0 = w.map.woodAmount[ft!.ty * w.map.w + ft!.tx];
    w.enqueue({ type: 'gather', player: 0, unitIds: [worker.id], tx: ft!.tx, ty: ft!.ty });
    run(w, 140);
    expect(w.players[0].res.wood).toBeGreaterThan(wood0);
    expect(w.map.woodAmount[ft!.ty * w.map.w + ft!.tx]).toBeLessThan(amount0);
    expect(worker.carry === null || worker.carry.amount <= ECONOMY.CARRY_CAP).toBe(true);
  });

  it('worker gathers from a stone deposit and it depletes', () => {
    const { w, worker } = worldWithTown();
    const dep = w.map.deposits.find((d) => d.kind === 'stone')!;
    w.enqueue({ type: 'gather', player: 0, unitIds: [worker.id], tx: dep.tx, ty: dep.ty });
    run(w, 240);
    expect(dep.amount).toBeLessThan(600);
    expect(w.players[0].res.stone).toBeGreaterThan(200);
  });
});

describe('population & training', () => {
  it('town center trains workers within pop cap', () => {
    const { w, tc } = worldWithTown();
    // pop: 1 worker used of 10 cap
    w.enqueue({ type: 'train', player: 0, buildingId: tc.id, unitKey: 'worker' });
    const n0 = w.units.size;
    run(w, 12);
    expect(w.units.size).toBe(n0 + 1);
  });

  it('training rejected when pop is full', () => {
    const { w, tc } = worldWithTown();
    w.players[0].popCap = w.players[0].popUsed; // pretend full
    const n0 = w.units.size;
    w.enqueue({ type: 'train', player: 0, buildingId: tc.id, unitKey: 'worker' });
    run(w, 12);
    expect(w.units.size).toBe(n0);
  });
});

describe('food upkeep & farms', () => {
  it('upkeep drains food; farm produces; starvation flags when empty', () => {
    const { w } = worldWithTown();
    // big pop force starvation
    for (let i = 0; i < 10; i++) w.spawnUnit(0, 'militia', 15 + (i % 3), 15 + (i % 2));
    w.recomputePop(0);
    w.players[0].res.food = 1; // < 10s of upkeep
    run(w, 10);
    expect(w.players[0].res.food).toBe(0);
    expect(w.players[0].starving).toBe(true);

    // farm produces food over upkeep from a single worker
    const w2 = new World(11, ['dominion'], { wood: 1000, stone: 0, gold: 0, food: 100 });
    w2.placeBuilding(0, 'townCenter', 12, 12, true);
    w2.placeBuilding(0, 'farm', 30, 30, true);
    w2.spawnUnit(0, 'worker', 20, 20);
    w2.recomputePop(0);
    const f0 = w2.players[0].res.food;
    run(w2, 20);
    // farm yields 0.25/s, worker upkeep 0.02/s → net positive
    expect(w2.players[0].res.food).toBeGreaterThan(f0);
  });
});

describe('save/load with economy state', () => {
  it('restores buildings, resources, deposits', () => {
    const { w } = worldWithTown();
    w.enqueue({ type: 'build', player: 0, unitIds: [findWorker(w)!], key: 'house', tx: 17, ty: 12 });
    run(w, 14);
    const s = JSON.parse(JSON.stringify(w.serialize()));
    const w2 = World.deserialize(s);
    expect(w2.buildings.size).toBe(w.buildings.size);
    expect(w2.players[0].res.wood).toBeCloseTo(w.players[0].res.wood, 5);
    expect(w2.players[0].popCap).toBe(w.players[0].popCap);
  });
});

function findWorker(w: World): number | undefined {
  const u = [...w.units.values()].find((x) => x.owner === 0 && x.type === 'worker');
  return u?.id;
}

void TILE;
