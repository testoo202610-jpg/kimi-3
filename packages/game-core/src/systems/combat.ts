import { TILE } from '../map';
import { unitDef } from '../units';
import { buildingDef, buildingCenter, freeAdjacentTile, type BuildingState } from '../buildings';
import type { World, UnitState } from '../world';

export interface Projectile {
  id: number;
  x: number;
  y: number;
  shooterId?: number; // unit that fired (towers: none)
  targetUnitId?: number;
  targetBuildingId?: number;
  speed: number; // px/s
  damage: number;
}

const ATTACK_COOLDOWN = 1.2; // seconds between swings
const AGGRO_RANGE = 8 * TILE; // attack-move scan radius
const KILL_MORALE_DELTA = 5; // killer gains
const CASUALTY_MORALE_LOSS = 6; // allies near a death lose
const CASUALTY_RADIUS = 6 * TILE;
const SIEGE_BUILDING_BONUS = 2.5; // siege vs buildings

let nextProjectileId = 1;

/** Real-time combat: aggro, cooldowns, armor, counters, projectiles, morale. */
export class CombatSystem {
  projectiles: Projectile[] = [];

  tick(world: World, dtMs: number) {
    const dt = dtMs / 1000;
    this.tickUnits(world, dt);
    this.tickTowers(world, dt);
    this.tickProjectiles(world, dt);
  }

  // ---- towers: buildings with atk fire on nearest enemy in range ----
  private tickTowers(world: World, dt: number) {
    for (const b of world.buildings.values()) {
      const def = buildingDef(b.key);
      if (!def.atk || !def.rangeT || !b.built) continue;
      b.atkCd = (b.atkCd ?? 0) - dt;
      if (b.atkCd > 0) continue;
      const c = buildingCenter(b);
      let best: UnitState | null = null;
      let bestD = def.rangeT * TILE;
      for (const u of world.units.values()) {
        if (world.friendly(u.owner, b.owner)) continue;
        const d = Math.hypot(u.x - c.x, u.y - c.y);
        if (d < bestD) { bestD = d; best = u; }
      }
      if (!best) { b.atkCd = 0.5; continue; }
      b.atkCd = ATTACK_COOLDOWN;
      this.projectiles.push({
        id: nextProjectileId++,
        x: c.x,
        y: c.y,
        targetUnitId: best.id,
        speed: 320,
        damage: def.atk,
      });
    }
  }

  // ---- units ----
  private tickUnits(world: World, dt: number) {
    for (const u of world.units.values()) {
      const combat = u.combat;
      if (!combat) continue;

      if (combat.cooldown > 0) combat.cooldown -= dt;

      // target validation
      let target: UnitState | null = null;
      let targetBuilding = combat.buildingId != null ? world.buildings.get(combat.buildingId) ?? null : null;
      if (combat.unitId != null) {
        target = world.units.get(combat.unitId) ?? null;
        if (!target) {
          combat.unitId = null;
          if (combat.buildingId == null) { u.combat = null; this.resumeAttackMove(world, u); continue; }
        }
      }
      if (!target && !targetBuilding) { u.combat = null; this.resumeAttackMove(world, u); continue; }

      const def = unitDef(u.type);
      const rangePx = def.range * TILE + TILE * 0.6; // melee reach tolerance

      // distance check
      let dx: number, dy: number;
      if (target) { dx = target.x - u.x; dy = target.y - u.y; }
      else {
        const bd = buildingDef(targetBuilding!.key);
        const cx = (targetBuilding!.tx + bd.w / 2) * TILE;
        const cy = (targetBuilding!.ty + bd.h / 2) * TILE;
        dx = cx - u.x; dy = cy - u.y;
      }
      const dist = Math.hypot(dx, dy);

      if (dist > rangePx) {
        // out of range: move toward target (path if no current order)
        if (!u.order && !u.path) {
          if (target) {
            world.requestPath(u, Math.floor(target.x / TILE), Math.floor(target.y / TILE));
          } else if (targetBuilding) {
            const curTx = Math.floor(u.x / TILE);
            const curTy = Math.floor(u.y / TILE);
            const adj = freeAdjacentTile(world, targetBuilding, curTx, curTy);
            if (adj) world.requestPath(u, adj.tx, adj.ty);
          }
        }
        continue;
      }

      // in range: stop walking, swing on cooldown
      if (u.order || u.path) { u.order = null; u.path = null; }
      if (combat.cooldown <= 0) {
        combat.cooldown = ATTACK_COOLDOWN;
        const moraleFactor = 0.6 + (u.morale / 100) * 0.4;
        let dmg = def.attack * moraleFactor;

        if (target) {
          const tdef = unitDef(target.type);
          if (def.counters.includes(tdef.family)) dmg *= def.counterBonus;
          dmg = Math.max(1, dmg - tdef.armor);
          if (def.range > 1) this.fireProjectile(u, { unitId: target.id }, dmg);
          else this.applyDamage(world, u, target, dmg);
        } else if (targetBuilding) {
          if (def.family === 'siege') dmg *= SIEGE_BUILDING_BONUS;
          if (def.range > 1) this.fireProjectile(u, { buildingId: targetBuilding.id }, dmg);
          else this.applyDamageBuilding(world, targetBuilding, dmg);
        }
      }
    }
  }

  private fireProjectile(shooter: UnitState, tgt: { unitId?: number; buildingId?: number }, damage: number) {
    this.projectiles.push({
      id: nextProjectileId++,
      x: shooter.x,
      y: shooter.y,
      shooterId: shooter.id,
      targetUnitId: tgt.unitId,
      targetBuildingId: tgt.buildingId,
      speed: 320,
      damage,
    });
    shooter.combat!.awaitingProjectile = (shooter.combat!.awaitingProjectile ?? 0) + 1;
  }

  applyDamage(world: World, attacker: UnitState, target: UnitState, dmg: number) {
    target.hp -= dmg;
    target.morale = Math.max(0, target.morale - dmg * 0.25);
    if (target.hp <= 0) {
      // death: remove unit, morale shock for nearby allies of the victim
      world.units.delete(target.id);
      world.recomputePop(target.owner);
      attacker.morale = Math.min(100, attacker.morale + KILL_MORALE_DELTA);
      for (const ally of world.units.values()) {
        if (ally.owner !== target.owner) continue;
        const d = Math.hypot(ally.x - target.x, ally.y - target.y);
        if (d <= CASUALTY_RADIUS) ally.morale = Math.max(0, ally.morale - CASUALTY_MORALE_LOSS);
      }
    }
  }

  applyDamageBuilding(world: World, b: BuildingState, dmg: number) {
    b.hp -= dmg;
    if (b.hp <= 0) {
      world.buildings.delete(b.id);
      world.applyGranaryAuras(b.owner);
      world.recomputePop(b.owner);
      // workers inside drop their build tasks
      for (const u of world.units.values()) {
        if (u.task?.buildingId === b.id) u.task = null;
        if (u.combat?.buildingId === b.id) u.combat = null;
      }
    }
  }

  // ---- projectiles ----
  private tickProjectiles(world: World, dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      let tx: number | null = null;
      let ty: number | null = null;
      let targetUnit: UnitState | null = null;
      let targetBuilding: import('../buildings').BuildingState | null = null;

      if (p.targetUnitId != null) {
        targetUnit = world.units.get(p.targetUnitId) ?? null;
        if (!targetUnit) { this.projectiles.splice(i, 1); continue; }
        tx = targetUnit.x; ty = targetUnit.y;
      } else if (p.targetBuildingId != null) {
        targetBuilding = world.buildings.get(p.targetBuildingId) ?? null;
        if (!targetBuilding) { this.projectiles.splice(i, 1); continue; }
        const bd = buildingDef(targetBuilding.key);
        tx = (targetBuilding.tx + bd.w / 2) * TILE;
        ty = (targetBuilding.ty + bd.h / 2) * TILE;
      }
      if (tx == null || ty == null) { this.projectiles.splice(i, 1); continue; }

      const dx = tx - p.x;
      const dy = ty - p.y;
      const dist = Math.hypot(dx, dy);
      const step = p.speed * dt;
      if (dist <= step + 4) {
        // hit
        const attacker = p.shooterId != null ? world.units.get(p.shooterId) ?? null : null;
        if (targetUnit) {
          targetUnit.hp -= p.damage;
          targetUnit.morale = Math.max(0, targetUnit.morale - p.damage * 0.25);
          if (targetUnit.hp <= 0) {
            world.units.delete(targetUnit.id);
            world.recomputePop(targetUnit.owner);
            if (attacker) attacker.morale = Math.min(100, attacker.morale + KILL_MORALE_DELTA);
            for (const ally of world.units.values()) {
              if (ally.owner !== targetUnit.owner) continue;
              const d = Math.hypot(ally.x - targetUnit.x, ally.y - targetUnit.y);
              if (d <= CASUALTY_RADIUS) ally.morale = Math.max(0, ally.morale - CASUALTY_MORALE_LOSS);
            }
          }
          if (attacker?.combat?.awaitingProjectile) attacker.combat.awaitingProjectile--;
        } else if (targetBuilding) {
          this.applyDamageBuilding(world, targetBuilding, p.damage);
          if (attacker?.combat?.awaitingProjectile) attacker.combat.awaitingProjectile--;
        }
        this.projectiles.splice(i, 1);
      } else {
        p.x += (dx / dist) * step;
        p.y += (dy / dist) * step;
      }
    }
  }

  // ---- aggro for attack-move and idle defenders ----
  scanAggro(world: World, u: UnitState) {
    if (u.combat) return; // already engaged
    const def = unitDef(u.type);
    if (def.family === 'worker') return; // workers don't auto-engage
    let best: UnitState | null = null;
    let bestD = AGGRO_RANGE;
    for (const e of world.units.values()) {
      if (world.friendly(e.owner, u.owner)) continue;
      const d = Math.hypot(e.x - u.x, e.y - u.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      u.combat = { unitId: best.id, buildingId: null, cooldown: 0 };
      // remember an attack-move order to resume it once the fight is over
      if (u.order?.kind === 'attackMove') {
        u.attackMoveResume = u.order;
        u.order = null;
        u.path = null;
      }
    }
  }

  private resumeAttackMove(world: World, u: UnitState) {
    if (!u.attackMoveResume) return;
    const o = u.attackMoveResume;
    u.attackMoveResume = null;
    u.order = o;
    const tx = o.kind === 'attackMove' || o.kind === 'move' ? o.tx : 0;
    const ty = o.kind === 'attackMove' || o.kind === 'move' ? o.ty : 0;
    world.requestPath(u, tx, ty);
  }
}
