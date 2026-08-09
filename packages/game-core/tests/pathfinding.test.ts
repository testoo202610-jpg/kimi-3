import { describe, expect, it } from 'vitest';
import { findPath, PathQueue } from '../src/pathfinding';

const flat = (w: number, h: number, blocked: [number, number][] = []) => ({
  w,
  h,
  cost: (x: number, y: number) =>
    blocked.some(([bx, by]) => bx === x && by === y) ? Infinity : 1,
});

describe('A*', () => {
  it('finds straight path on open grid', () => {
    const p = findPath(flat(16, 16), 1, 1, 4, 1)!;
    expect(p).not.toBeNull();
    expect(p[0]).toEqual({ tx: 1, ty: 1 });
    expect(p[p.length - 1]).toEqual({ tx: 4, ty: 1 });
  });

  it('routes around obstacles', () => {
    const wall: [number, number][] = [];
    for (let y = 0; y < 10; y++) wall.push([5, y]); // wall with gap below y=10? no gap — fully closed to edge
    const grid = { w: 12, h: 12, cost: (x: number, y: number) => (x === 5 && y < 10 ? Infinity : 1) };
    const p = findPath(grid, 1, 1, 9, 1)!;
    expect(p).not.toBeNull(); // must go around bottom (y>=10)
    for (const n of p) expect(grid.cost(n.tx, n.ty)).not.toBe(Infinity);
  });

  it('does not cut diagonal corners through blocked tiles', () => {
    // blocked (2,1) and (1,2): (1,1)->(2,2) diagonal cut must be refused,
    // route must go around the top instead
    const grid = flat(6, 6, [[2, 1], [1, 2]]);
    const p = findPath(grid, 1, 1, 3, 3)!;
    expect(p).not.toBeNull();
    const hasBadCut = p.some((n, i) => {
      if (i === 0) return false;
      const prev = p[i - 1];
      const dx = Math.abs(n.tx - prev.tx);
      const dy = Math.abs(n.ty - prev.ty);
      return dx === 1 && dy === 1 && (grid.cost(prev.tx + (n.tx - prev.tx), prev.ty) === Infinity || grid.cost(prev.tx, prev.ty + (n.ty - prev.ty)) === Infinity);
    });
    expect(hasBadCut).toBe(false);
  });

  it('returns null when target unreachable', () => {
    expect(findPath(flat(8, 8), 0, 0, 3, 3, 0)).toBeNull();
    const cage = flat(8, 8, [[3, 2], [4, 2], [2, 3], [3, 4], [4, 4], [2, 4], [2, 2], [4, 3], [2, 1], [3, 1], [4, 1]]);
    expect(findPath(cage, 0, 7, 3, 3)).toBeNull();
  });

  it('path queue drains with budget', () => {
    const q = new PathQueue(2);
    const g = flat(8, 8);
    let done = 0;
    for (let i = 0; i < 4; i++) q.request(g, 0, 0, 7, 7, () => done++);
    q.drain();
    expect(done).toBe(2);
    q.drain();
    expect(done).toBe(4);
  });
});
