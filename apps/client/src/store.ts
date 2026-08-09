import { create } from 'zustand';
import type { ResTable } from '@cr/core';

export type GameSpeed = 0 | 0.5 | 1 | 2 | 4; // 0 = paused

interface HudState {
  selection: number[]; // unit ids
  selectedBuilding: number | null;
  buildKey: string | null; // placement mode
  res: ResTable | null;
  popUsed: number;
  popCap: number;
  starving: boolean;
  era: number;
  speed: GameSpeed;
  setSelection: (ids: number[]) => void;
  setSelectedBuilding: (id: number | null) => void;
  setBuildKey: (key: string | null) => void;
  setEconomy: (res: ResTable, popUsed: number, popCap: number, starving: boolean, era: number) => void;
  setSpeed: (s: GameSpeed) => void;
}

export const useHud = create<HudState>((set) => ({
  selection: [],
  selectedBuilding: null,
  buildKey: null,
  res: null,
  popUsed: 0,
  popCap: 0,
  starving: false,
  era: 0,
  speed: 1,
  setSelection: (selection) => set({ selection, selectedBuilding: null }),
  setSelectedBuilding: (selectedBuilding) => set({ selectedBuilding, selection: [] }),
  setBuildKey: (buildKey) => set({ buildKey }),
  setEconomy: (res, popUsed, popCap, starving, era) => set({ res, popUsed, popCap, starving, era }),
  setSpeed: (speed) => set({ speed }),
}));
