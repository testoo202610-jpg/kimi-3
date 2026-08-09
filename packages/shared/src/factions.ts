export type FactionId = 'dominion' | 'river' | 'hills';

export interface FactionDef {
  id: FactionId;
  name: string;
  epithet: string;
  color: number; // hex int for rendering (original palette)
  colorCss: string;
  summary: string;
  bonuses: string[];
  uniqueTech: string;
  eliteUnit: string;
  aiPersona: 'raider' | 'turtle-trader' | 'mountain-hammer';
}

export const FACTIONS: readonly FactionDef[] = [
  {
    id: 'dominion',
    name: 'Northern Dominion',
    epithet: 'the Iron Plains',
    color: 0x9a2b2b,
    colorCss: '#9a2b2b',
    summary: 'Steppe-born cavalry and disciplined economy.',
    bonuses: ['Cavalry cost −15%', 'Market income +10%', 'Drilled Ranks: infantry +1 armor'],
    uniqueTech: 'Requisition Wagons',
    eliteUnit: 'Dominion Lancer',
    aiPersona: 'raider',
  },
  {
    id: 'river',
    name: 'River Kingdom',
    epithet: 'the Jade Delta',
    color: 0x2b6e9a,
    colorCss: '#2b6e9a',
    summary: 'Archers, walls and trade over the water.',
    bonuses: ['Ships +20% speed', 'Archers +1 range', 'Trade +25% gold', 'Walls +20% hp'],
    uniqueTech: 'Chain Harbors',
    eliteUnit: 'Crossbow Guard',
    aiPersona: 'turtle-trader',
  },
  {
    id: 'hills',
    name: 'Western Alliance',
    epithet: 'the Hollow Hills',
    color: 0x6d6a2f,
    colorCss: '#6d6a2f',
    summary: 'Stone-hearted infantry led by famed generals.',
    bonuses: ['Infantry train −15% time', 'Generals +25% XP', 'Morale decays slower in mountains'],
    uniqueTech: 'Cliff War-drums',
    eliteUnit: 'Oath-sworn Guard',
    aiPersona: 'mountain-hammer',
  },
] as const;

export const FACTION_BY_ID: Record<FactionId, FactionDef> = Object.fromEntries(
  FACTIONS.map((f) => [f.id, f]),
) as Record<FactionId, FactionDef>;
