import { describe, expect, it } from 'vitest';
import { TICK_MS, World, dmgMultOf, speedMultOf, unitDef } from '../src';

function run(w: World, seconds: number) {
  const steps = Math.ceil((seconds * 1000) / TICK_MS);
  for (let i = 0; i < steps; i++) w.tick(TICK_MS);
}

describe('armies & generals', () => {
  it('assignArmy groups units under a general; generals are unique defs', () => {
    const w = new World({ seed: 5, factions: ['dominion'] });
    const s = w.map.starts[0];
    const gen = w.spawnUnit(0, 'genPeiShang', s.tx + 2, s.ty + 2)!;
    const a = w.spawnUnit(0, 'spearman', s.tx + 3, s.ty + 2)!;
    const b = w.spawnUnit(0, 'archer', s.tx + 2, s.ty + 3)!;
    w.enqueue({ type: 'assignArmy', player: 0, generalId: gen.id, unitIds: [a.id, b.id] });
    w.tick();
    expect(a.armyId).toBe(b.armyId);
    expect(w.armies.get(a.armyId!)?.generalId).toBe(gen.id);
    expect(unitDef('genPeiShang').family).toBe('general');
  });

  it('general aura regenerates army morale within radius', () => {
    const w = new World({ seed: 5, factions: ['dominion'] });
    const s = w.map.starts[0];
    const gen = w.spawnUnit(0, 'genBaQiren', s.tx + 2, s.ty + 2)!;
    const a = w.spawnUnit(0, 'spearman', s.tx + 4, s.ty + 2)!;
    a.morale = 50;
    w.enqueue({ type: 'assignArmy', player: 0, generalId: gen.id, unitIds: [a.id] });
    w.tick();
    run(w, 10);
    expect(a.morale).toBeGreaterThan(59); // 7 leadership * 0.15/s ≈ +10.5
  });

  it('supply drains off territory, slows and starves the army; recovers on own land', () => {
    const w = new World({ seed: 6, factions: ['dominion'] });
    const s = w.map.starts[0];
    w.placeBuilding(0, 'townCenter', s.tx - 1, s.ty - 1, true);
    const gen = w.spawnUnit(0, 'genTogan', s.tx + 2, s.ty + 2)!;
    const a = w.spawnUnit(0, 'spearman', s.tx + 3, s.ty + 2)!;
    w.enqueue({ type: 'assignArmy', player: 0, generalId: gen.id, unitIds: [a.id] });
    w.tick();
    const army = w.armies.get(a.armyId!)!;
    run(w, 3);
    expect(army.supply).toBe(100); // on own land it stays full

    // teleport far away: no territory out there
    a.x = 120 * 32; a.y = 120 * 32;
    gen.x = 120 * 32; gen.y = 120 * 32;
    run(w, 60);
    expect(army.supply).toBeLessThan(30);
    expect(a.supplyMult).toBe(0.7);

    // back home: recovered
    a.x = (s.tx + 2) * 32; a.y = (s.tx + 2) * 32;
    gen.x = a.x; gen.y = a.y;
    run(w, 60);
    expect(army.supply).toBeGreaterThan(90);
    expect(a.supplyMult).toBe(1);
  });

  it('abilities apply effects and respect cooldown', () => {
    const w = new World({ seed: 5, factions: ['dominion'] });
    const s = w.map.starts[0];
    const gen = w.spawnUnit(0, 'genPeiShang', s.tx + 2, s.ty + 2)!;
    const a = w.spawnUnit(0, 'spearman', s.tx + 3, s.ty + 2)!;
    w.enqueue({ type: 'assignArmy', player: 0, generalId: gen.id, unitIds: [a.id] });
    w.tick();

    const morale0 = a.morale;
    w.enqueue({ type: 'ability', player: 0, generalId: gen.id });
    w.tick();
    expect(speedMultOf(a, w.tickCount)).toBeCloseTo(1.4); // forcedMarch buff
    expect(a.morale).toBeLessThan(morale0); // costs morale
    expect(gen.abilityCd).toBeGreaterThan(0);

    // second activation blocked by cooldown
    const until = a.buffUntil;
    w.enqueue({ type: 'ability', player: 0, generalId: gen.id });
    w.tick();
    expect(a.buffUntil).toBe(until);
  });

  it('ambush doubles damage of the army while active', () => {
    const w = new World({ seed: 5, factions: ['hills'] });
    const s = w.map.starts[2] ?? w.map.starts[0];
    const gen = w.spawnUnit(0, 'genBaQiren', s.tx + 2, s.ty + 2)!;
    const a = w.spawnUnit(0, 'swordsman', s.tx + 3, s.ty + 2)!;
    w.enqueue({ type: 'assignArmy', player: 0, generalId: gen.id, unitIds: [a.id] });
    w.tick();
    w.enqueue({ type: 'ability', player: 0, generalId: gen.id });
    w.tick();
    // ambush 2× × aura (combat 5 → 1.1)
    expect(dmgMultOf(a, w.tickCount)).toBeCloseTo(2.2, 3);
  });
});

describe('diplomacy', () => {
  it('allies never auto-engage; hostile pairs do', () => {
    const w = new World({ seed: 8, factions: ['dominion', 'river'] });
    const s = w.map.starts[0];
    const a = w.spawnUnit(0, 'swordsman', s.tx + 2, s.ty + 2)!;
    w.spawnUnit(1, 'militia', s.tx + 4, s.ty + 2);
    run(w, 2);
    expect(a.combat).not.toBeNull(); // default hostile: engaged

    const w2 = new World({ seed: 8, factions: ['dominion', 'river'] });
    w2.enqueue({ type: 'setRelation', player: 0, target: 1, relation: 'ally' });
    w2.tick();
    const b = w2.spawnUnit(0, 'swordsman', s.tx + 2, s.ty + 2)!;
    w2.spawnUnit(1, 'militia', s.tx + 4, s.ty + 2);
    run(w2, 2);
    expect(b.combat).toBeNull(); // ally: never engaged
    expect(w2.friendly(0, 1)).toBe(true);
    expect(w2.friendly(1, 0)).toBe(true); // symmetric
  });

  it('attack command against an ally is rejected', () => {
    const w = new World({ seed: 8, factions: ['dominion', 'river'] });
    const s = w.map.starts[0];
    w.enqueue({ type: 'setRelation', player: 0, target: 1, relation: 'ally' });
    w.tick();
    const a = w.spawnUnit(0, 'swordsman', s.tx + 2, s.ty + 2)!;
    const e = w.spawnUnit(1, 'militia', s.tx + 5, s.ty + 2)!;
    w.enqueue({ type: 'attack', player: 0, unitIds: [a.id], targetUnitId: e.id });
    w.tick();
    expect(a.combat).toBeNull();
  });
});

// starts are cleared ±4 tiles; p1 town center placed inside that zone so the
// test never depends on generated terrain.
describe('city capture', () => {
  it('hostile occupation flips town center ownership after 20s uncontested', () => {
    const w = new World({ seed: 12, factions: ['dominion', 'river'] });
    const s = w.map.starts[0];
    const tc = w.placeBuilding(1, 'townCenter', s.tx + 2, s.ty - 1, true)!;
    w.spawnUnit(0, 'spearman', s.tx + 1, s.ty + 1);
    w.spawnUnit(0, 'spearman', s.tx + 1, s.ty);
    run(w, 26);
    expect(w.buildings.get(tc.id)?.owner).toBe(0);
  });

  it('workers do not block capture (non-military)', () => {
    const w = new World({ seed: 12, factions: ['dominion', 'river'] });
    const s = w.map.starts[0];
    const tc = w.placeBuilding(1, 'townCenter', s.tx + 2, s.ty - 1, true)!;
    w.spawnUnit(1, 'worker', s.tx + 2, s.ty + 2); // civilian defender: can't hold
    w.spawnUnit(0, 'spearman', s.tx + 1, s.ty + 1);
    w.spawnUnit(0, 'spearman', s.tx + 1, s.ty);
    run(w, 26);
    expect(w.buildings.get(tc.id)?.owner).toBe(0);
  });

  it('a defending soldier holds the city', () => {
    const w = new World({ seed: 12, factions: ['dominion', 'river'] });
    const s = w.map.starts[0];
    const tc = w.placeBuilding(1, 'townCenter', s.tx + 2, s.ty - 1, true)!;
    w.spawnUnit(1, 'heavyInfantry', s.tx + 2, s.ty + 2); // defender
    w.spawnUnit(0, 'militia', s.tx + 1, s.ty + 1); // attacker (will fight, not capture)
    run(w, 26);
    expect(w.buildings.get(tc.id)?.owner).toBe(1);
  });
});

describe('general death', () => {
  it('morale shock hits all nearby allies', () => {
    const w = new World({ seed: 9, factions: ['dominion', 'river'] });
    const s = w.map.starts[0];
    const gen = w.spawnUnit(0, 'genFenRuohai', s.tx + 2, s.ty + 2)!;
    gen.hp = 10;
    const ally = w.spawnUnit(0, 'spearman', s.tx + 5, s.ty + 2)!;
    ally.morale = 80;
    const killer = w.spawnUnit(1, 'swordsman', s.tx + 3, s.ty + 2)!;
    w.enqueue({ type: 'attack', player: 1, unitIds: [killer.id], targetUnitId: gen.id });
    run(w, 6);
    expect(w.units.has(gen.id)).toBe(false);
    expect(ally.morale).toBeLessThan(60); // −25 general shock + combat spill
  });
});
