import { TILE } from '../map';
import { buildingDef, freeAdjacentTile, buildingCenter, type BuildingState } from '../buildings';
import type { World, UnitState } from '../world';

const SPAWN_CD = 45; // seconds between caravans per market
const GOLD_PER_TILE = 0.7; // reward per manhattan tile of route distance

/** Trade routes: each market periodically spawns a caravan that shuttles to
 *  the owner's farthest other market; gold on arrival scales with distance.
 *  Caravans are civilian units — killable (raided) on route. ponytail: raiding
 *  drops no loot yet; credit the killer's faction in Phase 5 spoils pass. */
export class TradeSystem {
  tick(world: World, dtMs: number) {
    const dt = dtMs / 1000;
    this.tickMarkets(world, dt);
    this.tickCaravans(world);
  }

  private marketsOf(world: World, owner: number): BuildingState[] {
    const out: BuildingState[] = [];
    for (const b of world.buildings.values()) {
      if (b.owner === owner && b.built && (buildingDef(b.key).goldPerSec ?? 0) > 0) out.push(b);
    }
    return out;
  }

  private tickMarkets(world: World, dt: number) {
    for (const p of world.players) {
      const markets = this.marketsOf(world, p.id);
      for (const m of markets) {
        p.res.gold += (buildingDef(m.key).goldPerSec ?? 0) * dt;
        if (markets.length < 2) continue;
        m.tradeCd = (m.tradeCd ?? SPAWN_CD) - dt;
        if (m.tradeCd > 0) continue;
        m.tradeCd = SPAWN_CD;
        this.spawnCaravan(world, m, markets);
      }
    }
  }

  private spawnCaravan(world: World, home: BuildingState, markets: BuildingState[]) {
    let target: BuildingState | null = null;
    let best = -1;
    for (const m of markets) {
      if (m.id === home.id) continue;
      const d = Math.abs(m.tx - home.tx) + Math.abs(m.ty - home.ty);
      if (d > best) { best = d; target = m; }
    }
    if (!target) return;
    const adj = freeAdjacentTile(world, home, home.tx, home.ty);
    if (!adj) return;
    const u = world.spawnUnit(home.owner, 'caravan', adj.tx, adj.ty);
    if (!u) return;
    const leg = freeAdjacentTile(world, target, adj.tx, adj.ty);
    if (!leg) return;
    u.task = { kind: 'trade', phase: 'goto', tx: leg.tx, ty: leg.ty, buildingId: target.id, homeId: home.id };
    world.requestPath(u, leg.tx, leg.ty);
  }

  private tickCaravans(world: World) {
    for (const u of world.units.values()) {
      if (u.type !== 'caravan' || u.task?.kind !== 'trade') continue;
      if (u.order || u.path) continue; // still walking
      const target = u.task.buildingId != null ? world.buildings.get(u.task.buildingId) : null;
      const home = u.task.homeId != null ? world.buildings.get(u.task.homeId) : null;
      if (u.task.phase === 'goto') {
        if (!target || !target.built) { u.task = null; continue; }
        // arrived at foreign market: pay the owner, turn back
        const cHome = home ? buildingCenter(home) : { x: u.x, y: u.y };
        const cTgt = buildingCenter(target);
        const distTiles = Math.abs(cTgt.x - cHome.x) / TILE + Math.abs(cTgt.y - cHome.y) / TILE;
        world.players[u.owner].res.gold += distTiles * GOLD_PER_TILE;
        u.task.phase = 'delivering';
        this.legHome(world, u, home);
      } else {
        // arrived home: re-route to (possibly new) farthest market
        if (!home || !home.built) { u.task = null; continue; }
        const markets = this.marketsOf(world, u.owner).filter((m) => m.id !== home.id);
        let next: BuildingState | null = null;
        let best = -1;
        for (const m of markets) {
          const d = Math.abs(m.tx - home.tx) + Math.abs(m.ty - home.ty);
          if (d > best) { best = d; next = m; }
        }
        if (!next) { u.task = null; continue; }
        const adj = freeAdjacentTile(world, next, Math.floor(u.x / TILE), Math.floor(u.y / TILE));
        if (!adj) { u.task = null; continue; }
        u.task = { kind: 'trade', phase: 'goto', tx: adj.tx, ty: adj.ty, buildingId: next.id, homeId: home.id };
        world.requestPath(u, adj.tx, adj.ty);
      }
    }
  }

  private legHome(world: World, u: UnitState, home: BuildingState | null | undefined) {
    if (!home || !home.built) { u.task = null; return; }
    const adj = freeAdjacentTile(world, home, Math.floor(u.x / TILE), Math.floor(u.y / TILE));
    if (!adj) { u.task = null; return; }
    u.task!.tx = adj.tx;
    u.task!.ty = adj.ty;
    world.requestPath(u, adj.tx, adj.ty);
  }
}
