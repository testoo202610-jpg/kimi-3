import { describe, expect, it } from 'vitest';
import {
  ERA_COSTS, Tile, World, buildingDef, canPlace, tileAt, unitDef,
} from '../src';

const RICH = { food: 5000, wood: 5000, stone: 5000, iron: 5000, gold: 5000, horses: 100 };

function run(world: World, ticks: number) {
  for (let i = 0; i < ticks; i++) world.tick();
}

/** find a clear grass tile near the faction start (spiral search) */
function freeTile(world: World, cx: number, cy: number): { tx: number; ty: number } {
  for (let r = 0; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tileAt(world.map, tx, ty) !== Tile.Grass) continue;
        if (world.buildingAt(tx, ty)) continue;
        return { tx, ty };
      }
    }
  }
  throw new Error('no free tile');
}

describe('territory', () => {
  it('town center projects territory, radius grows with era', () => {
    const world = new World({ seed: 7, factions: ['dominion'] });
    const s = world.map.starts[0];
    world.placeBuilding(0, 'townCenter', s.tx - 1, s.ty - 1, true);
    run(world, 16); // 2 recompute cycles
    expect(world.territory.owns(world, 0, s.tx, s.ty)).toBe(true);
    expect(world.territory.owns(world, 0, s.tx + 9, s.ty)).toBe(true);
    expect(world.territory.owns(world, 0, s.tx + 30, s.ty)).toBe(false);

    world.players[0].era = 1;
    run(world, 16);
    expect(world.territory.owns(world, 0, s.tx + 13, s.ty)).toBe(true);
  });

  it('owned territory pays gold tax', () => {
    const world = new World({ seed: 7, factions: ['dominion'], startResources: { gold: 0 } });
    const s = world.map.starts[0];
    world.placeBuilding(0, 'townCenter', s.tx - 1, s.ty - 1, true);
    run(world, 64);
    expect(world.players[0].res.gold).toBeGreaterThan(0.05);
  });
});

describe('era upgrades', () => {
  it('researchEra pays cost and gates buildings/units', () => {
    const world = new World({ seed: 3, factions: ['dominion'], startResources: RICH });
    const s = world.map.starts[0];
    world.placeBuilding(0, 'townCenter', s.tx - 1, s.ty - 1, true);
    const w = world.spawnUnit(0, 'worker', s.tx + 3, s.ty + 1)!;

    // era 0: watchtower (minEra 1) rejected
    const spot = freeTile(world, s.tx + 4, s.ty + 4);
    world.enqueue({ type: 'build', player: 0, unitIds: [w.id], key: 'watchtower', tx: spot.tx, ty: spot.ty });
    world.tick();
    expect([...world.buildings.values()].some((b) => b.key === 'watchtower')).toBe(false);

    const goldBefore = world.players[0].res.gold;
    world.enqueue({ type: 'researchEra', player: 0 });
    world.tick();
    expect(world.players[0].era).toBe(1);
    expect(world.players[0].res.gold).toBeLessThanOrEqual(goldBefore - (ERA_COSTS[0]!.gold!));

    world.enqueue({ type: 'build', player: 0, unitIds: [w.id], key: 'watchtower', tx: spot.tx, ty: spot.ty });
    world.tick();
    expect([...world.buildings.values()].some((b) => b.key === 'watchtower')).toBe(true);
  });

  it('era-gated units cannot be trained early', () => {
    const world = new World({ seed: 3, factions: ['dominion'], startResources: RICH });
    const s = world.map.starts[0];
    world.placeBuilding(0, 'townCenter', s.tx - 1, s.ty - 1, true);
    world.placeBuilding(0, 'barracks', s.tx + 3, s.ty - 1, true);
    const bk = { type: 'train' as const, player: 0, buildingId: 2, unitKey: 'swordsman' };
    world.enqueue(bk);
    world.tick();
    expect(world.buildings.get(2)!.queue.length).toBe(0);
    world.players[0].era = 1;
    world.enqueue(bk);
    world.tick();
    expect(world.buildings.get(2)!.queue.length).toBe(1);
  });
});

describe('wall / gate', () => {
  it('gate is passable for owner, blocked for enemies', () => {
    const world = new World({ seed: 9, factions: ['dominion', 'river'] });
    const s = world.map.starts[0];
    const g = freeTile(world, s.tx + 4, s.ty + 2);
    canPlace(world, 'gate', g.tx, g.ty);
    world.placeBuilding(0, 'gate', g.tx, g.ty, true);

    // fully encircle start with walls except gate: simpler — just test cost grid
    expect(world.gridFor(0).cost(g.tx, g.ty)).toBe(1); // owner passes
    expect(world.gridFor(1).cost(g.tx, g.ty)).toBe(Infinity); // enemy blocked
    const w = freeTile(world, s.tx + 6, s.ty + 2);
    world.placeBuilding(0, 'wall', w.tx, w.ty, true);
    expect(world.gridFor(0).cost(w.tx, w.ty)).toBe(Infinity); // wall blocks all
  });
});

describe('watchtower', () => {
  it('tower shoots enemies in range', () => {
    const world = new World({ seed: 5, factions: ['dominion', 'river'] });
    const s = world.map.starts[0];
    const t = freeTile(world, s.tx + 5, s.ty + 5);
    world.placeBuilding(0, 'watchtower', t.tx, t.ty, true);
    const e = world.spawnUnit(1, 'militia', t.tx + 3, t.ty)!;
    const hp0 = e.hp;
    run(world, 240); // 15 s
    expect(e.hp).toBeLessThan(hp0);
  });
});

describe('market & trade routes', () => {
  it('market drips gold; two markets spawn a caravan that pays route gold', () => {
    const world = new World({ seed: 11, factions: ['dominion'], startResources: { gold: 0 } });
    const s = world.map.starts[0];
    const a = freeTile(world, s.tx + 3, s.ty + 6);
    const b = freeTile(world, s.tx + 14, s.ty + 8);
    world.placeBuilding(0, 'market', a.tx, a.ty, true);
    world.placeBuilding(0, 'market', b.tx, b.ty, true);

    run(world, 16);
    const drip = world.players[0].res.gold;
    expect(drip).toBeGreaterThan(0); // passive income works

    run(world, 50 * 16); // let caravan spawn
    const caravan = [...world.units.values()].find((u) => u.type === 'caravan');
    expect(caravan).toBeTruthy();
    expect(caravan!.task?.kind).toBe('trade');

    const before = world.players[0].res.gold;
    run(world, 60 * 16); // complete at least one leg
    // passive only would be 0.6*2*60 = 72; route reward must exceed passive
    expect(world.players[0].res.gold - before).toBeGreaterThan(72);
  });
});

describe('defs sanity', () => {
  it('new buildings/units exist with era gates', () => {
    expect(buildingDef('wall').minEra).toBe(1);
    expect(buildingDef('gate').minEra).toBe(1);
    expect(buildingDef('market').goldPerSec).toBeGreaterThan(0);
    expect(buildingDef('watchtower').atk).toBeGreaterThan(0);
    expect(unitDef('caravan').family).toBe('civil');
    expect(unitDef('heavyInfantry').minEra).toBe(2);
  });
});
