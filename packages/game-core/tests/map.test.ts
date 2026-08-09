import { describe, expect, it } from 'vitest';
import { Tile, generateMap, idx } from '../src/map';

describe('map generation', () => {
  it('is deterministic for a seed', () => {
    const a = generateMap(42);
    const b = generateMap(42);
    expect([...a.tiles]).toEqual([...b.tiles]);
    expect(a.deposits).toEqual(b.deposits);
  });

  it('has 3 clear starts, 6 major and 12 minor sites, deposits', () => {
    const m = generateMap(7);
    expect(m.starts).toHaveLength(3);
    for (const s of m.starts) {
      expect(m.tiles[idx(m, s.tx, s.ty)]).not.toBe(Tile.Mountain);
      expect(m.tiles[idx(m, s.tx, s.ty)]).not.toBe(Tile.River);
    }
    expect(m.citySites.filter((c) => c.major)).toHaveLength(6);
    expect(m.citySites.filter((c) => !c.major)).toHaveLength(12);
    expect(m.deposits.length).toBeGreaterThan(20);
    for (const kind of ['stone', 'iron', 'gold'] as const) {
      expect(m.deposits.some((d) => d.kind === kind)).toBe(true);
    }
  });
});
