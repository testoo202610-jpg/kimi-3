import { create } from 'zustand';

export type GameSpeed = 0 | 0.5 | 1 | 2 | 4; // 0 = paused

interface HudState {
  selection: number[]; // unit ids
  speed: GameSpeed;
  setSelection: (ids: number[]) => void;
  setSpeed: (s: GameSpeed) => void;
}

export const useHud = create<HudState>((set) => ({
  selection: [],
  speed: 1,
  setSelection: (selection) => set({ selection }),
  setSpeed: (speed) => set({ speed }),
}));
