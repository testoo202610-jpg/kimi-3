import { describe, expect, it } from 'vitest';
import { World, spawnStartingForces, type Command } from '@cr/core';
import { CMD_DELAY, Room, Rooms } from '../src/rooms.js';

describe('rooms', () => {
  it('assigns seats, rejects a 5th player, frees lobby seats on leave', () => {
    const room = new Room('r1', 42, 0);
    expect(room.join('a')).toBe(0);
    expect(room.join('b')).toBe(1);
    expect(room.join('c')).toBe(2);
    expect(room.join('d')).toBe(3);
    expect(room.join('e')).toBe(-1);
    room.leave(1); // lobby seat is freed
    expect(room.join('e')).toBe(1);
  });

  it('reconnect reclaims the seat by name', () => {
    const rooms = new Rooms();
    const room = rooms.create('r2', 7, 1)!;
    room.join('alice');
    room.join('bob');
    room.leave(1);
    expect(room.join('bob')).toBe(1); // same seat back
  });

  it('start builds a world: town centers + forces per faction, AI appended', () => {
    const room = new Room('r3', 42, 1);
    room.join('alice');
    room.join('bob');
    room.setReady(0, true);
    room.setReady(1, true);
    expect(room.canStart(1)).toBe(false); // only host (seat 0)
    expect(room.canStart(0)).toBe(true);
    const world = room.start();
    const factions = room.factions();
    expect(factions).toHaveLength(3); // 2 humans + 1 AI
    for (let p = 0; p < 3; p++) {
      expect([...world.buildings.values()].some((b) => b.owner === p && b.key === 'townCenter')).toBe(true);
    }
    expect(world.ai.snapshot().map(([pid]) => pid)).toEqual([2]); // AI only on the last slot
    // both humans are "strong" starts (6 workers), AI is lean (4)
    const workers = (o: number) => [...world.units.values()].filter((u) => u.owner === o && u.type === 'worker').length;
    expect(workers(0)).toBe(6);
    expect(workers(1)).toBe(6);
    expect(workers(2)).toBe(4);
  });

  it('stamp forces the seat as player and schedules into the future', () => {
    const room = new Room('r4', 42, 1);
    room.join('alice');
    room.join('bob');
    room.setReady(0, true);
    room.setReady(1, true);
    room.start();
    const cmd: Command = { type: 'stop', player: 99, unitIds: [] };
    const at = room.stamp(1, cmd);
    expect(at).toBe(room.world!.tickCount + CMD_DELAY);
    expect(cmd.player).toBe(1); // claimed player overwritten
    expect(room.stamp(1, cmd)).toBeGreaterThan(0);
  });

  it('lockstep determinism: two worlds fed identical stamped commands stay identical', () => {
    const seed = 99;
    const factions = ['dominion', 'jade'];
    const a = new World(seed | 1, factions);
    const b = new World(seed | 1, factions);
    const strong = new Set([0, 1]);
    spawnStartingForces(a, factions, strong);
    spawnStartingForces(b, factions, strong);

    const cmds: Command[] = [];
    const workersOf = (w: World, o: number) => [...w.units.values()].filter((u) => u.owner === o && u.type === 'worker');
    const w0 = workersOf(a, 0)[0];
    cmds.push({ type: 'move', player: 0, unitIds: [w0.id], tx: w0.tx + 3, ty: w0.ty });
    a.enqueueAt(cmds[0], 1 + CMD_DELAY);
    b.enqueueAt(cmds[0], 1 + CMD_DELAY);
    for (let i = 0; i < 120; i++) {
      a.tick();
      b.tick();
    }
    const ua = a.units.get(w0.id)!;
    const ub = b.units.get(w0.id)!;
    expect(ua.x).toBe(ub.x);
    expect(ua.y).toBe(ub.y);
    expect(ua.x).not.toBe(0);
  });
});
