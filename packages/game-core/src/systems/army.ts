import { TILE } from '../map';
import { unitDef } from '../units';
import { GENERALS, type AbilityKey } from '../generals';
import type { World, UnitState } from '../world';

export interface ArmyState {
  id: number;
  owner: number;
  generalId: number; // unit id of the commanding general
  supply: number; // 0..100
}

const AURA_RADIUS = 8 * TILE;
const MORALE_REGEN_PER_LEADERSHIP = 0.15; // /s inside the aura
const DMG_PER_COMBAT = 0.02; // aura damage multiplier per combat point
const SUPPLY_DRAIN = 1.5; // /s off territory
const SUPPLY_REGEN = 6; // /s on own territory
const LOW_SUPPLY = 30;
const LOW_SUPPLY_SPEED = 0.7;
const LOW_SUPPLY_MORALE = 1; // /s
const ATTRITION_HP = 0.5; // /s at 0 supply
export const TICK_S = 16; // sim ticks per second

const buffActive = (u: UnitState, tick: number) => u.buffUntil != null && u.buffUntil > tick;

/** runtime speed multiplier (buffs × supply) */
export function speedMultOf(u: UnitState, tick: number): number {
  let m = u.supplyMult ?? 1;
  if (buffActive(u, tick) && u.buffSpeedMult != null) m *= u.buffSpeedMult;
  return m;
}

export function dmgMultOf(u: UnitState, tick: number): number {
  let m = u.auraDmg ?? 1;
  if (buffActive(u, tick) && u.buffDmgMult != null) m *= u.buffDmgMult;
  return m;
}

export function armorOf(u: UnitState, tick: number): number {
  let a = unitDef(u.type).armor;
  if (buffActive(u, tick) && u.buffArmorAdd != null) a += u.buffArmorAdd;
  return a;
}

/** Armies: general auras, supply drain/regen, ability cooldowns. */
export class ArmySystem {
  tick(world: World, dtMs: number) {
    const dt = dtMs / 1000;
    for (const u of world.units.values()) {
      u.auraDmg = 1; // recomputed below from living generals
      if ((u.abilityCd ?? 0) > 0) u.abilityCd = u.abilityCd! - dt;
    }
    for (const army of world.armies.values()) this.tickArmy(world, army, dt);
  }

  private members(world: World, army: ArmyState): UnitState[] {
    const out: UnitState[] = [];
    for (const u of world.units.values()) if (u.armyId === army.id) out.push(u);
    return out;
  }

  private tickArmy(world: World, army: ArmyState, dt: number) {
    const troops = this.members(world, army);
    const gen = world.units.get(army.generalId);

    // general aura: morale regen + damage bonus within radius
    if (gen && gen.hp > 0) {
      const g = GENERALS[gen.type];
      if (g) {
        for (const u of troops) {
          if (u.id === gen.id) continue;
          const d = Math.hypot(u.x - gen.x, u.y - gen.y);
          if (d > AURA_RADIUS) continue;
          u.morale = Math.min(100, u.morale + g.leadership * MORALE_REGEN_PER_LEADERSHIP * dt);
          u.auraDmg = 1 + g.combat * DMG_PER_COMBAT;
        }
      }
    }

    if (!troops.length) return;
    // supply: off owned territory it drains; on owned it recovers
    const cx = troops.reduce((s, u) => s + u.x, 0) / troops.length;
    const cy = troops.reduce((s, u) => s + u.y, 0) / troops.length;
    const onOwn = world.territory.owns(world, army.owner, Math.floor(cx / TILE), Math.floor(cy / TILE));
    army.supply = Math.max(0, Math.min(100, army.supply + (onOwn ? SUPPLY_REGEN : -SUPPLY_DRAIN) * dt));
    for (const u of troops) {
      u.supplyMult = army.supply < LOW_SUPPLY ? LOW_SUPPLY_SPEED : 1;
      if (army.supply < LOW_SUPPLY) u.morale = Math.max(0, u.morale - LOW_SUPPLY_MORALE * dt);
      if (army.supply <= 0) {
        u.hp -= ATTRITION_HP * dt;
        if (u.hp <= 0) {
          world.units.delete(u.id);
          world.recomputePop(u.owner);
        }
      }
    }
  }

  membersOf(world: World, armyId: number): UnitState[] {
    const out: UnitState[] = [];
    for (const u of world.units.values()) if (u.armyId === armyId) out.push(u);
    return out;
  }

  applyAbility(world: World, gen: UnitState) {
    const g = GENERALS[gen.type];
    if (!g) return;
    const army = [...world.armies.values()].find((a) => a.owner === gen.owner && a.generalId === gen.id);
    const troops = army ? this.membersOf(world, army.id) : [gen];
    const until = world.tickCount + 0; // tick-based durations below
    switch (g.ability.key as AbilityKey) {
      case 'forcedMarch':
        for (const u of troops) {
          u.buffUntil = until + 10 * TICK_S;
          u.buffSpeedMult = 1.4;
          u.morale = Math.max(0, u.morale - 10);
        }
        break;
      case 'rally':
        for (const u of troops) u.morale = Math.min(100, u.morale + 30);
        break;
      case 'fireAttack':
        for (const e of world.units.values()) {
          if (world.friendly(e.owner, gen.owner)) continue;
          if (Math.hypot(e.x - gen.x, e.y - gen.y) > AURA_RADIUS) continue;
          e.hp -= 20;
          e.morale = Math.max(0, e.morale - 10);
          if (e.hp <= 0) {
            world.units.delete(e.id);
            world.recomputePop(e.owner);
          }
        }
        break;
      case 'rapidRecruitment':
        world.players[gen.owner].recruitBoostUntil = until + 20 * TICK_S;
        break;
      case 'defensiveFormation':
        for (const u of troops) {
          u.buffUntil = until + 15 * TICK_S;
          u.buffSpeedMult = 0;
          u.buffArmorAdd = 3;
        }
        break;
      case 'ambush':
        for (const u of troops) {
          u.buffUntil = until + 15 * TICK_S;
          u.buffDmgMult = 2;
        }
        break;
    }
    gen.abilityCd = g.ability.cooldown;
  }
}
