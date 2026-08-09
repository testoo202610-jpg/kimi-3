// A* on the tile grid. Octile heuristic, diagonal moves disallow corner cutting.
// ponytail: group flow-fields not implemented; when armies >100 units regularly
// path to the same target, add per-target flow field over this same grid.

export interface Node {
  tx: number;
  ty: number;
}

export interface CostGrid {
  w: number;
  h: number;
  /** movement cost of tile; Infinity = impassable */
  cost: (tx: number, ty: number) => number;
}

class Heap {
  keys: number[] = [];
  vals: number[] = [];
  get size() { return this.keys.length; }
  push(k: number, v: number) {
    this.keys.push(k);
    this.vals.push(v);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(i, p);
      i = p;
    }
  }
  pop(): number {
    const top = this.vals[0];
    const lk = this.keys.pop()!;
    const lv = this.vals.pop()!;
    if (this.keys.length) {
      this.keys[0] = lk;
      this.vals[0] = lv;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]];
  }
}

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const;

// scratch buffers reused across searches (sim is single-threaded) — a fresh
// 16K-tile alloc per A* was the top GC/allocation cost in profiling
let gBuf = new Float32Array(0);
let cameBuf = new Int32Array(0);
let closedBuf = new Uint8Array(0);
let stamp = new Uint32Array(0);
let stampGen = 0;

/** Returns path INCLUDING start tile and end tile, cheapest first; null if unreachable. */
export function findPath(
  grid: CostGrid,
  sx: number,
  sy: number,
  ex: number,
  ey: number,
  maxIter = 20000,
): Node[] | null {
  if (sx === ex && sy === ey) return [{ tx: sx, ty: sy }];
  const { w, h } = grid;
  if (ex < 0 || ey < 0 || ex >= w || ey >= h || grid.cost(ex, ey) === Infinity) return null;
  const N = w * h;
  if (gBuf.length < N) {
    gBuf = new Float32Array(N);
    cameBuf = new Int32Array(N);
    closedBuf = new Uint8Array(N);
    stamp = new Uint32Array(N);
    stampGen = 0;
  }
  // stamping avoids re-filling g/came/closed each call: a cell counts as
  // fresh when its stamp differs from the current generation
  stampGen++;
  const g = gBuf;
  const came = cameBuf;
  const closed = closedBuf;
  const heap = new Heap();
  const s0 = sy * w + sx;
  stamp[s0] = stampGen;
  g[s0] = 0;
  closed[s0] = 0;
  came[s0] = -1;
  heap.push(0, s0);
  // 0.7 = cheapest tile cost (roads): keeps the heuristic admissible so A*
  // explores far fewer nodes while staying correct.
  const hOctile = (x: number, y: number) => {
    const dx = Math.abs(x - ex);
    const dy = Math.abs(y - ey);
    return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) * 0.7;
  };
  let iter = 0;
  while (heap.size && iter++ < maxIter) {
    const cur = heap.pop();
    if (stamp[cur] === stampGen && closed[cur]) continue;
    stamp[cur] = stampGen;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    if (cx === ex && cy === ey) {
      const path: Node[] = [];
      let c = cur;
      while (c !== -1) {
        path.push({ tx: c % w, ty: (c / w) | 0 });
        c = came[c];
      }
      path.reverse();
      return path;
    }
    for (const [dx, dy, base] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const c = grid.cost(nx, ny);
      if (c === Infinity) continue;
      if (dx !== 0 && dy !== 0) {
        // no cutting corners past blocked orthogonal neighbours
        if (grid.cost(cx + dx, cy) === Infinity || grid.cost(cx, cy + dy) === Infinity) continue;
      }
      const ni = ny * w + nx;
      if (stamp[ni] !== stampGen) {
        stamp[ni] = stampGen;
        g[ni] = Infinity;
        closed[ni] = 0;
      }
      const ng = g[cur] + base * c;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ng + hOctile(nx, ny), ni);
      }
    }
  }
  return null;
}

/** Budget-limited path request queue; sim drains N requests per tick. */
export class PathQueue {
  private pending: { grid: CostGrid; sx: number; sy: number; ex: number; ey: number; cb: (p: Node[] | null) => void }[] = [];
  constructor(private perTick = 16) {}
  request(grid: CostGrid, sx: number, sy: number, ex: number, ey: number, cb: (p: Node[] | null) => void) {
    this.pending.push({ grid, sx, sy, ex, ey, cb });
  }
  drain() {
    for (let i = 0; i < this.perTick && this.pending.length; i++) {
      const r = this.pending.shift()!;
      r.cb(findPath(r.grid, r.sx, r.sy, r.ex, r.ey));
    }
  }
}
