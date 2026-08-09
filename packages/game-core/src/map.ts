import { makeRng } from './rng';

export const TILE = 32; // px per tile

export enum Tile {
  Grass = 0,
  Forest = 1,
  Mountain = 2,
  River = 3,
  Road = 4,
  Bridge = 5,
  Farmland = 6, // fertile ground — farms placed here get yield bonus
}

export type ResourceKind = 'wood' | 'stone' | 'iron' | 'gold' | 'fish' | 'game';

export interface Deposit {
  id: number;
  kind: ResourceKind;
  tx: number;
  ty: number;
  amount: number;
}

export interface GameMap {
  seed: number;
  w: number;
  h: number;
  tiles: Uint8Array; // Tile per cell
  woodAmount: Float32Array; // per forest tile (float: chopped in fractions)
  deposits: Deposit[];
  starts: { tx: number; ty: number }[]; // faction start positions
  citySites: { tx: number; ty: number; major: boolean }[]; // settlement locations
}

export const idx = (m: { w: number }, tx: number, ty: number) => ty * m.w + tx;
export const inBounds = (m: GameMap, tx: number, ty: number) => tx >= 0 && ty >= 0 && tx < m.w && ty < m.h;

export function tileAt(m: GameMap, tx: number, ty: number): Tile {
  return inBounds(m, tx, ty) ? (m.tiles[idx(m, tx, ty)] as Tile) : Tile.Mountain;
}

export function isBlocked(m: GameMap, tx: number, ty: number): boolean {
  const t = tileAt(m, tx, ty);
  return t === Tile.Mountain || t === Tile.River;
}

/** Movement cost multiplier for a tile (Infinity = impassable for land units). */
export function moveCost(t: Tile): number {
  switch (t) {
    case Tile.Road: return 0.7;
    case Tile.Bridge: return 1;
    case Tile.Grass: return 1;
    case Tile.Farmland: return 1;
    case Tile.Forest: return 1.8;
    default: return Infinity;
  }
}

/** Deterministic skirmish map: rivers with bridges, mountain ranges with
 *  passes, forests, roads between starts, deposits, settlement sites. */
export function generateMap(seed: number, w = 128, h = 128): GameMap {
  const rng = makeRng(seed);
  const tiles = new Uint8Array(w * h).fill(Tile.Grass);
  const woodAmount = new Float32Array(w * h);
  const deposits: Deposit[] = [];
  let depId = 1;
  const at = (tx: number, ty: number) => ty * w + tx;

  // --- Mountain ranges (two arcs) ---
  const ranges = [
    { x: Math.floor(w * 0.22), spread: 6 },
    { x: Math.floor(w * 0.72), spread: 5 },
  ];
  const passes: number[][] = ranges.map(() => {
    const ys: number[] = [];
    for (let i = 0; i < 3; i++) ys.push(rng.int(12, h - 13));
    return ys;
  });
  ranges.forEach((r, ri) => {
    let x = r.x;
    for (let y = 0; y < h; y++) {
      x += rng.int(-1, 1);
      x = Math.max(2, Math.min(w - 3, x));
      const pass = passes[ri].some((py) => Math.abs(py - y) <= 2);
      if (pass) continue; // mountain pass stays open
      const sw = Math.floor(r.spread / 2);
      for (let dx = -sw; dx <= sw; dx++) {
        if (rng.chance(1 - Math.abs(dx) / (sw + 1))) tiles[at(x + dx, y)] = Tile.Mountain;
      }
    }
  });

  // --- Rivers (two west-east meanders) with bridge tiles where roads cross ---
  const riverRows = [Math.floor(h * 0.33), Math.floor(h * 0.68)];
  for (const rowBase of riverRows) {
    let y = rowBase;
    for (let x = 0; x < w; x++) {
      y += rng.int(-1, 1);
      y = Math.max(3, Math.min(h - 4, y));
      const width = rng.int(1, 2);
      for (let dy = 0; dy < width; dy++) {
        if (tiles[at(x, y + dy)] === Tile.Mountain) continue; // mountains win
        tiles[at(x, y + dy)] = Tile.River;
      }
    }
  }

  // --- Forest noise clusters ---
  const forestCells = rng.int(30, 40);
  for (let i = 0; i < forestCells; i++) {
    const cx = rng.int(4, w - 5);
    const cy = rng.int(4, h - 5);
    const radius = rng.int(3, 7);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const d2 = dx * dx + dy * dy;
        const x = cx + dx;
        const y = cy + dy;
        if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
        if (d2 <= radius * radius && tiles[at(x, y)] === Tile.Grass && rng.chance(0.8)) {
          tiles[at(x, y)] = Tile.Forest;
          woodAmount[at(x, y)] = rng.int(80, 200);
        }
      }
    }
  }

  // --- Start positions: three corners, guaranteed clear + nearby resources ---
  const starts = [
    { tx: 10, ty: 10 },
    { tx: w - 11, ty: h - 11 },
    { tx: w - 11, ty: 10 },
  ];
  for (const s of starts) {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const i = at(s.tx + dx, s.ty + dy);
        if (tiles[i] === Tile.Mountain || tiles[i] === Tile.River) tiles[i] = Tile.Grass;
      }
  }

  // --- Roads: connect starts pairwise (L paths), bridge over rivers ---
  const roadLine = (x0: number, y0: number, x1: number, y1: number) => {
    let x = x0;
    let y = y0;
    while (x !== x1) {
      const i = at(x, y);
      if (tiles[i] === Tile.River) tiles[i] = Tile.Bridge;
      else if (tiles[i] !== Tile.Mountain) tiles[i] = Tile.Road;
      x += Math.sign(x1 - x);
    }
    while (y !== y1) {
      const i = at(x, y);
      if (tiles[i] === Tile.River) tiles[i] = Tile.Bridge;
      else if (tiles[i] !== Tile.Mountain) tiles[i] = Tile.Road;
      y += Math.sign(y1 - y);
    }
  };
  roadLine(starts[0].tx, starts[0].ty, starts[1].tx, starts[1].ty);
  roadLine(starts[0].tx, starts[0].ty, starts[2].tx, starts[2].ty);
  roadLine(starts[2].tx, starts[2].ty, starts[1].tx, starts[1].ty);

  // --- Farmland patches (strategic, fight-worthy) ---
  for (let i = 0; i < 10; i++) {
    const cx = rng.int(8, w - 9);
    const cy = rng.int(8, h - 9);
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) {
        const i = at(cx + dx, cy + dy);
        if (tiles[i] === Tile.Grass && rng.chance(0.75)) tiles[i] = Tile.Farmland;
      }
  }

  // --- Deposits: stone/iron/gold clusters + fish on rivers + game in forests ---
  const deposit = (kind: ResourceKind, tx: number, ty: number, amount: number) => {
    if (tx < 1 || ty < 1 || tx >= w - 1 || ty >= h - 1) return;
    if (tiles[at(tx, ty)] === Tile.Mountain || tiles[at(tx, ty)] === Tile.River) return;
    deposits.push({ id: depId++, kind, tx, ty, amount });
  };
  const cluster = (kind: ResourceKind, cx: number, cy: number, n: number, amount: number) => {
    for (let i = 0; i < n; i++) deposit(kind, cx + rng.int(-2, 2), cy + rng.int(-2, 2), amount + rng.int(0, amount / 2));
  };
  for (const s of starts) {
    cluster('stone', s.tx + 6, s.ty, 3, 600);
    cluster('gold', s.tx, s.ty + 6, 2, 500);
    cluster('iron', s.tx + 6, s.ty + 6, 2, 400);
  }
  for (let i = 0; i < 10; i++) cluster(rng.pick(['stone', 'iron', 'gold'] as const), rng.int(10, w - 11), rng.int(10, h - 11), rng.int(2, 4), 500);
  // fish: on river-adjacent water tiles
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    if (tiles[at(x, y)] === Tile.River && rng.chance(0.012)) deposits.push({ id: depId++, kind: 'fish', tx: x, ty: y, amount: 300 });
  }
  // game: inside forests
  for (let i = 0; i < 400 && deposits.filter((d) => d.kind === 'game').length < 12; i++) {
    const x = rng.int(2, w - 3);
    const y = rng.int(2, h - 3);
    if (tiles[at(x, y)] === Tile.Forest) deposits.push({ id: depId++, kind: 'game', tx: x, ty: y, amount: 200 });
  }

  // --- Settlement sites: 6 major cities + 12 minor settlements ---
  const citySites: GameMap['citySites'] = [];
  const siteSpots = [
    [Math.floor(w * 0.5), Math.floor(h * 0.5), true],
    [Math.floor(w * 0.3), Math.floor(h * 0.55), true],
    [Math.floor(w * 0.62), Math.floor(h * 0.28), true],
    [Math.floor(w * 0.45), Math.floor(h * 0.85), true],
    [Math.floor(w * 0.85), Math.floor(h * 0.45), true],
    [Math.floor(w * 0.15), Math.floor(h * 0.75), true],
    [Math.floor(w * 0.2), Math.floor(h * 0.3), false],
    [Math.floor(w * 0.4), Math.floor(h * 0.15), false],
    [Math.floor(w * 0.55), Math.floor(h * 0.6), false],
    [Math.floor(w * 0.7), Math.floor(h * 0.8), false],
    [Math.floor(w * 0.9), Math.floor(h * 0.25), false],
    [Math.floor(w * 0.1), Math.floor(h * 0.5), false],
    [Math.floor(w * 0.35), Math.floor(h * 0.9), false],
    [Math.floor(w * 0.65), Math.floor(h * 0.45), false],
    [Math.floor(w * 0.5), Math.floor(h * 0.1), false],
    [Math.floor(w * 0.88), Math.floor(h * 0.68), false],
    [Math.floor(w * 0.3), Math.floor(h * 0.45), false],
    [Math.floor(w * 0.75), Math.floor(h * 0.12), false],
  ] as const;
  for (const [x, y, major] of siteSpots) {
    // clear ground around each site
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const X = Math.min(w - 1, Math.max(0, x + dx));
        const Y = Math.min(h - 1, Math.max(0, y + dy));
        const i = at(X, Y);
        if (tiles[i] === Tile.Mountain || tiles[i] === Tile.River) tiles[i] = Tile.Grass;
      }
    citySites.push({ tx: x, ty: y, major });
  }

  return { seed, w, h, tiles, woodAmount, deposits, starts, citySites };
}
