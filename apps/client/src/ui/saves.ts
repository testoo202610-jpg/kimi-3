import type { SerializedWorld } from '@cr/core';

export interface SaveMeta {
  slot: string; // 'local:0'..'local:2' or 'server:<id>'
  name: string;
  ts: number; // epoch ms
  tick: number;
}

interface SaveRecord {
  name: string;
  ts: number;
  blob: SerializedWorld;
}

const LOCAL_SLOTS = 3;
const key = (i: number) => `cr_save_${i}`;

export function listLocalSaves(): SaveMeta[] {
  const out: SaveMeta[] = [];
  for (let i = 0; i < LOCAL_SLOTS; i++) {
    try {
      const raw = localStorage.getItem(key(i));
      if (!raw) continue;
      const r = JSON.parse(raw) as SaveRecord;
      out.push({ slot: `local:${i}`, name: r.name, ts: r.ts, tick: r.blob.tick });
    } catch { /* corrupted slot — skip */ }
  }
  return out;
}

export function saveLocal(slot: number, name: string, blob: SerializedWorld): boolean {
  try {
    const r: SaveRecord = { name, ts: Date.now(), blob };
    localStorage.setItem(key(slot), JSON.stringify(r));
    return true;
  } catch {
    return false; // quota exceeded
  }
}

export function loadLocal(slot: number): SerializedWorld | null {
  try {
    const raw = localStorage.getItem(key(slot));
    return raw ? (JSON.parse(raw) as SaveRecord).blob : null;
  } catch {
    return null;
  }
}

// ---- server side (optional: offline silently disabled) ----
const API = `${location.protocol}//${location.hostname}:4000`;

export async function listServerSaves(): Promise<SaveMeta[]> {
  const r = await fetch(`${API}/api/saves`);
  if (!r.ok) return [];
  return (await r.json()) as SaveMeta[];
}

export async function saveServer(name: string, blob: SerializedWorld): Promise<SaveMeta | null> {
  const r = await fetch(`${API}/api/saves`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, blob }),
  });
  return r.ok ? ((await r.json()) as SaveMeta) : null;
}

export async function loadServer(slot: string): Promise<SerializedWorld | null> {
  const id = slot.replace('server:', '');
  const r = await fetch(`${API}/api/saves/${id}`);
  if (!r.ok) return null;
  const rec = (await r.json()) as SaveRecord;
  return rec.blob;
}
