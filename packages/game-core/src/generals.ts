// Named generals — original fictional characters (see GAME_DESIGN.md).
// Generals are units with family 'general'; this table carries the
// strategy stats + ability that the unit def can't express.

export type AbilityKey =
  | 'forcedMarch'
  | 'rally'
  | 'fireAttack'
  | 'rapidRecruitment'
  | 'defensiveFormation'
  | 'ambush';

export interface GeneralDef {
  unitKey: string;
  name: string;
  lean: 'dominion' | 'river' | 'hills';
  leadership: number;
  strategy: number;
  combat: number;
  governance: number;
  ability: { key: AbilityKey; cooldown: number; desc: string }; // cooldown in seconds
}

export const GENERALS: Record<string, GeneralDef> = {
  genPeiShang: {
    unitKey: 'genPeiShang', name: 'Pei Shang "the Ash Duke"', lean: 'dominion',
    leadership: 8, strategy: 6, combat: 9, governance: 4,
    ability: { key: 'forcedMarch', cooldown: 45, desc: '+40% speed 10s, -10 morale' },
  },
  genWusunYara: {
    unitKey: 'genWusunYara', name: 'Lady Wusun Yara', lean: 'dominion',
    leadership: 7, strategy: 8, combat: 6, governance: 5,
    ability: { key: 'rally', cooldown: 30, desc: 'instant +30 morale to the army' },
  },
  genGueMoyu: {
    unitKey: 'genGueMoyu', name: 'Admiral Gué Moyu', lean: 'river',
    leadership: 6, strategy: 8, combat: 7, governance: 6,
    ability: { key: 'fireAttack', cooldown: 40, desc: 'burn enemies in 8 tiles for 20 dmg' },
  },
  genFenRuohai: {
    unitKey: 'genFenRuohai', name: 'Chancellor Fen Ruohai', lean: 'river',
    leadership: 5, strategy: 9, combat: 3, governance: 9,
    ability: { key: 'rapidRecruitment', cooldown: 60, desc: 'queues progress 2× for 20s' },
  },
  genTogan: {
    unitKey: 'genTogan', name: 'Marshal Togan Stone-brow', lean: 'hills',
    leadership: 8, strategy: 5, combat: 9, governance: 4,
    ability: { key: 'defensiveFormation', cooldown: 40, desc: '+3 armor, immobile 15s' },
  },
  genBaQiren: {
    unitKey: 'genBaQiren', name: 'Sage-General Ba Qiren', lean: 'hills',
    leadership: 7, strategy: 9, combat: 5, governance: 6,
    ability: { key: 'ambush', cooldown: 50, desc: '+100% damage for 15s' },
  },
};

export const GENERALS_BY_LEAN: Record<string, string[]> = {
  dominion: ['genPeiShang', 'genWusunYara'],
  river: ['genGueMoyu', 'genFenRuohai'],
  hills: ['genTogan', 'genBaQiren'],
};
