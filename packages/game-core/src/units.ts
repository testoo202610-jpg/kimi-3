// Unit definitions — data-driven registry. All stats fully original work.

export type UnitFamily = 'worker' | 'infantry' | 'archer' | 'cavalry' | 'siege' | 'naval' | 'general';

export interface UnitDef {
  key: string;
  name: string;
  family: UnitFamily;
  hp: number;
  attack: number;
  armor: number;
  range: number; // tiles
  speed: number; // tiles per second
  vision: number; // tiles
  morale: number; // base morale cap contribution
  trainTime: number; // seconds
  cost: Partial<Record<'food' | 'wood' | 'stone' | 'iron' | 'gold' | 'horses', number>>;
  pop: number;
  counters: UnitFamily[]; // families this unit hits for bonus damage
  counterBonus: number; // damage multiplier vs listed families
}

export const UNIT_DEFS: Record<string, UnitDef> = {
  worker: {
    key: 'worker', name: 'Worker', family: 'worker',
    hp: 40, attack: 2, armor: 0, range: 1, speed: 3.2, vision: 6,
    morale: 30, trainTime: 8, cost: { food: 50 }, pop: 1, counters: [], counterBonus: 1,
  },
  militia: {
    key: 'militia', name: 'Militia', family: 'infantry',
    hp: 55, attack: 5, armor: 0, range: 1, speed: 3.4, vision: 7,
    morale: 55, trainTime: 10, cost: { food: 40, gold: 10 }, pop: 1, counters: [], counterBonus: 1,
  },
  spearman: {
    key: 'spearman', name: 'Spearman', family: 'infantry',
    hp: 70, attack: 7, armor: 1, range: 1, speed: 3.2, vision: 7,
    morale: 60, trainTime: 12, cost: { food: 45, wood: 15, gold: 15 }, pop: 1,
    counters: ['cavalry'], counterBonus: 2.2,
  },
  swordsman: {
    key: 'swordsman', name: 'Swordsman', family: 'infantry',
    hp: 85, attack: 10, armor: 2, range: 1, speed: 3.4, vision: 7,
    morale: 65, trainTime: 14, cost: { food: 50, iron: 10, gold: 25 }, pop: 1,
    counters: ['infantry'], counterBonus: 1.4,
  },
  heavyInfantry: {
    key: 'heavyInfantry', name: 'Heavy Infantry', family: 'infantry',
    hp: 130, attack: 12, armor: 4, range: 1, speed: 2.7, vision: 7,
    morale: 75, trainTime: 20, cost: { food: 60, iron: 30, gold: 40 }, pop: 2,
    counters: ['infantry'], counterBonus: 1.5,
  },
  archer: {
    key: 'archer', name: 'Archer', family: 'archer',
    hp: 45, attack: 7, armor: 0, range: 6, speed: 3.3, vision: 8,
    morale: 55, trainTime: 12, cost: { food: 40, wood: 25, gold: 15 }, pop: 1,
    counters: ['infantry'], counterBonus: 1.3,
  },
  crossbowman: {
    key: 'crossbowman', name: 'Crossbowman', family: 'archer',
    hp: 55, attack: 11, armor: 1, range: 7, speed: 3.0, vision: 8,
    morale: 60, trainTime: 16, cost: { food: 45, wood: 20, iron: 15, gold: 30 }, pop: 1,
    counters: ['infantry', 'cavalry'], counterBonus: 1.5,
  },
  scoutCavalry: {
    key: 'scoutCavalry', name: 'Scout Cavalry', family: 'cavalry',
    hp: 60, attack: 5, armor: 1, range: 1, speed: 5.6, vision: 11,
    morale: 60, trainTime: 12, cost: { food: 60, gold: 20, horses: 1 }, pop: 1,
    counters: [], counterBonus: 1,
  },
  lightCavalry: {
    key: 'lightCavalry', name: 'Light Cavalry', family: 'cavalry',
    hp: 85, attack: 9, armor: 1, range: 1, speed: 5.2, vision: 9,
    morale: 65, trainTime: 16, cost: { food: 70, gold: 35, horses: 1 }, pop: 2,
    counters: ['archer', 'siege'], counterBonus: 1.6,
  },
  heavyCavalry: {
    key: 'heavyCavalry', name: 'Heavy Cavalry', family: 'cavalry',
    hp: 130, attack: 13, armor: 3, range: 1, speed: 4.6, vision: 8,
    morale: 75, trainTime: 24, cost: { food: 90, iron: 25, gold: 55, horses: 2 }, pop: 2,
    counters: ['archer', 'siege'], counterBonus: 1.8,
  },
  batteringRam: {
    key: 'batteringRam', name: 'Battering Ram', family: 'siege',
    hp: 180, attack: 40, armor: 2, range: 1, speed: 1.6, vision: 5,
    morale: 50, trainTime: 30, cost: { wood: 120, iron: 20, gold: 40 }, pop: 3,
    counters: ['siege' as UnitFamily], counterBonus: 1, // buildings handled via armor-type bonus (Phase 3)
  },
  catapult: {
    key: 'catapult', name: 'Catapult', family: 'siege',
    hp: 90, attack: 30, armor: 0, range: 9, speed: 1.4, vision: 6,
    morale: 45, trainTime: 35, cost: { wood: 100, stone: 60, gold: 60 }, pop: 3,
    counters: [], counterBonus: 1,
  },
};

export function unitDef(key: string): UnitDef {
  const d = UNIT_DEFS[key];
  if (!d) throw new Error(`unknown unit type: ${key}`);
  return d;
}
