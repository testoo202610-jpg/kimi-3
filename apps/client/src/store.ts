import { create } from 'zustand';
import type { Difficulty, ResTable, SerializedWorld } from '@cr/core';
import type { FactionId } from '@cr/shared';

export type GameSpeed = 0 | 0.5 | 1 | 2 | 4; // 0 = paused
export type Screen = 'menu' | 'setup' | 'game';

export interface BootConfig {
  seed: number;
  factions: FactionId[]; // player + AI factions, player first
  ai: { player: number; difficulty: Difficulty }[];
  save?: SerializedWorld; // resume instead of fresh world
  saveSlot?: number; // which slot this session writes to
}

export interface Settings {
  volume: number; // 0..1 master
  showMinimap: boolean;
  edgeScroll: boolean;
}

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'good';
}

interface HudState {
  screen: Screen;
  boot: BootConfig | null;
  selection: number[]; // unit ids
  selectedBuilding: number | null;
  buildKey: string | null; // placement mode
  res: ResTable | null;
  popUsed: number;
  popCap: number;
  starving: boolean;
  era: number;
  speed: GameSpeed;
  toasts: Toast[];
  settings: Settings;
  gameMenuOpen: boolean;
  setScreen: (s: Screen) => void;
  setBoot: (b: BootConfig | null) => void;
  setSelection: (ids: number[]) => void;
  setSelectedBuilding: (id: number | null) => void;
  setBuildKey: (key: string | null) => void;
  setEconomy: (res: ResTable, popUsed: number, popCap: number, starving: boolean, era: number) => void;
  setSpeed: (s: GameSpeed) => void;
  notify: (text: string, kind?: Toast['kind']) => void;
  setSettings: (s: Partial<Settings>) => void;
  setGameMenuOpen: (open: boolean) => void;
}

const SETTINGS_KEY = 'cr_settings';
let toastId = 1;

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { volume: 0.5, showMinimap: true, edgeScroll: true, ...JSON.parse(raw) };
  } catch { /* corrupted → defaults */ }
  return { volume: 0.5, showMinimap: true, edgeScroll: true };
}

export const useHud = create<HudState>((set, get) => ({
  screen: 'menu',
  boot: null,
  selection: [],
  selectedBuilding: null,
  buildKey: null,
  res: null,
  popUsed: 0,
  popCap: 0,
  starving: false,
  era: 0,
  speed: 1,
  toasts: [],
  settings: loadSettings(),
  gameMenuOpen: false,
  setScreen: (screen) => set({ screen }),
  setBoot: (boot) => set({ boot }),
  setSelection: (selection) => set({ selection, selectedBuilding: null }),
  setSelectedBuilding: (selectedBuilding) => set({ selectedBuilding, selection: [] }),
  setBuildKey: (buildKey) => set({ buildKey }),
  setEconomy: (res, popUsed, popCap, starving, era) => set({ res, popUsed, popCap, starving, era }),
  setSpeed: (speed) => set({ speed }),
  notify: (text, kind = 'info') => {
    const id = toastId++;
    set({ toasts: [...get().toasts.slice(-4), { id, text, kind }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 4500);
  },
  setSettings: (partial) => {
    const settings = { ...get().settings, ...partial };
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* quota */ }
    set({ settings });
  },
  setGameMenuOpen: (gameMenuOpen) => set({ gameMenuOpen }),
}));
