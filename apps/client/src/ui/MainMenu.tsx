import { useEffect, useState } from 'react';
import { World } from '@cr/core';
import { useHud } from '../store';
import { btn, btnPrimary, panel, title } from '../hud/theme';
import { listLocalSaves, listServerSaves, loadLocal, loadServer, type SaveMeta } from './saves';

export function MainMenu() {
  const setScreen = useHud((s) => s.setScreen);
  const setBoot = useHud((s) => s.setBoot);
  const notify = useHud((s) => s.notify);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [showSaves, setShowSaves] = useState(false);

  useEffect(() => {
    setSaves(listLocalSaves());
    listServerSaves()
      .then((remote) => setSaves((cur) => [...cur, ...remote]))
      .catch(() => { /* server offline — local only */ });
  }, []);

  const resume = async (slot: string) => {
    const blob = slot.startsWith('local:')
      ? loadLocal(parseInt(slot.slice(6), 10))
      : await loadServer(slot);
    if (!blob) {
      notify('Save could not be read', 'warn');
      return;
    }
    // validate by attempting a deserialize right here — corrupt blobs never reach the scene
    try {
      World.deserialize(blob);
    } catch {
      notify('Save is corrupted', 'warn');
      return;
    }
    // restore factions boot config from the save itself (player = slot 0)
    setBoot({
      seed: blob.seed,
      factions: blob.factions as never[],
      ai: [], // AI config is inside the save
      save: blob,
    });
    setScreen('game');
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #2b2013 0%, #14100c 70%)' }}>
      <div style={{ ...panel, padding: 40, width: 420, textAlign: 'center' }}>
        <h1 style={{ ...title, fontSize: 40, margin: '0 0 4px' }}>Crimson Ramparts</h1>
        <div style={{ color: '#a8977a', marginBottom: 28, fontStyle: 'italic' }}>Three banners rise. One shall hold the passes.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button style={btnPrimary} onClick={() => setScreen('setup')} data-testid="menu-new-game">New Skirmish</button>
          <button style={btn} onClick={() => setShowSaves(!showSaves)} data-testid="menu-load-game">
            Load Game{saves.length ? ` (${saves.length})` : ''}
          </button>
        </div>
        {showSaves && (
          <div style={{ marginTop: 14, textAlign: 'left' }}>
            {saves.length === 0 && <div style={{ color: '#a8977a', fontSize: 13 }}>No saved games yet.</div>}
            {saves.map((s) => (
              <button
                key={s.slot}
                style={{ ...btn, display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}
                onClick={() => resume(s.slot)}
              >
                {s.name}
                <span style={{ float: 'right', color: '#a8977a', fontSize: 12 }}>
                  {s.slot.startsWith('server:') ? '☁ ' : ''}{new Date(s.ts).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}
        <div style={{ marginTop: 24, fontSize: 12, color: '#7a6a50' }}>
          v0.1 — all art generated in code, no external assets
        </div>
      </div>
    </div>
  );
}
