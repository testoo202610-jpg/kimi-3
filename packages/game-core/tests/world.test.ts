import { describe, expect, it } from 'vitest';
import { World, TICK_MS } from '../src/world';
import { TILE } from '../src/map';

function makeWorld() {
  const w = new World(11, ['dominion', 'river']);
  return w;
}

describe('world movement', () => {
  it('spawned unit moves toward ordered tile and stops', () => {
    const w = makeWorld();
    const u = w.spawnUnit(0, 'worker', 10, 10)!;
    expect(u).not.toBeNull();
    w.enqueue({ type: 'move', player: 0, unitIds: [u.id], tx: 14, ty: 10 });
    for (let i = 0; i < 400; i++) w.tick(TICK_MS);
    expect(Math.abs(u.x - (14 * TILE + TILE / 2))).toBeLessThan(TILE);
    expect(Math.abs(u.y - (10 * TILE + TILE / 2))).toBeLessThan(TILE);
    expect(u.order).toBeNull();
  });

  it('rejects orders for other players units', () => {
    const w = makeWorld();
    const u = w.spawnUnit(0, 'worker', 10, 10)!;
    const x0 = u.x;
    w.enqueue({ type: 'move', player: 1, unitIds: [u.id], tx: 20, ty: 20 });
    for (let i = 0; i < 100; i++) w.tick(TICK_MS);
    expect(u.x).toBe(x0);
  });

  it('stop command halts unit', () => {
    const w = makeWorld();
    const u = w.spawnUnit(0, 'worker', 10, 10)!;
    w.enqueue({ type: 'move', player: 0, unitIds: [u.id], tx: 30, ty: 10 });
    for (let i = 0; i < 30; i++) w.tick(TICK_MS);
    w.enqueue({ type: 'stop', player: 0, unitIds: [u.id] });
    w.tick(TICK_MS);
    const xAtStop = u.x;
    for (let i = 0; i < 50; i++) w.tick(TICK_MS);
    expect(u.x).toBeCloseTo(xAtStop, 3);
  });

  it('units separate instead of stacking', () => {
    const w = makeWorld();
    const a = w.spawnUnit(0, 'worker', 10, 10)!;
    const b = w.spawnUnit(0, 'worker', 10, 10)!;
    w.enqueue({ type: 'move', player: 0, unitIds: [a.id, b.id], tx: 16, ty: 10 });
    for (let i = 0; i < 500; i++) w.tick(TICK_MS);
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    expect(d).toBeGreaterThan(8);
  });

  it('fog reveals around units', () => {
    const w = makeWorld();
    w.spawnUnit(0, 'worker', 10, 10);
    for (let i = 0; i < 8; i++) w.tick(TICK_MS);
    const fog = w.players[0].fog;
    const idx = 10 * w.map.w + 10;
    expect(fog.visible[idx]).toBe(1);
    expect(fog.explored[idx]).toBe(1);
    // far corner unseen
    expect(fog.explored[(w.map.h - 2) * w.map.w + w.map.w - 2]).toBe(0);
  });

  it('serializes and restores', () => {
    const w = makeWorld();
    w.spawnUnit(0, 'worker', 10, 10);
    for (let i = 0; i < 8; i++) w.tick(TICK_MS);
    const s = World.deserialize(JSON.parse(JSON.stringify(w.serialize())));
    expect(s.units.size).toBe(w.units.size);
    expect(s.tickCount).toBe(w.tickCount);
    expect(s.nextUnitId).toBe(w.nextUnitId);
    expect([...s.units.values()][0].x).toBe([...w.units.values()][0].x);
  });

  it('save round-trips fog exploration, formations and AI config', () => {
    const w = makeWorld();
    w.spawnUnit(0, 'worker', 10, 10);
    for (let i = 0; i < 8; i++) w.tick(TICK_MS); // fog explored around spawn
    w.playerFormation[0] = 'wedge';
    w.ai.add(1, 'hard');
    const s = World.deserialize(JSON.parse(JSON.stringify(w.serialize())));
    const idx = 10 * s.map.w + 10;
    expect(s.players[0].fog.explored[idx]).toBe(1); // explored memory survives
    expect(s.players[0].fog.explored[(s.map.h - 2) * s.map.w + s.map.w - 2]).toBe(0);
    expect(s.playerFormation[0]).toBe('wedge');
    expect(s.ai.snapshot()).toEqual([[1, 'hard']]);
  });
});
