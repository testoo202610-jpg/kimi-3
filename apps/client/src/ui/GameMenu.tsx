import { useState } from 'react';
import { useHud } from '../store';
import { bridgeWorld } from '../hud/bridge';
import { btn, btnPrimary, panel, title } from '../hud/theme';
import { listLocalSaves, loadLocal, saveLocal, saveServer, loadServer, listServerSaves, type SaveMeta } from './saves';
import { World } from '@cr/core';

/** in-game menu overlay: save / load / settings / quit */
export function GameMenu() {
  const open = useHud((s) => s.gameMenuOpen);
  const setOpen = useHud((s) => s.setGameMenuOpen);
  const setScreen = useHud((s) => s.setScreen);
  const setBoot = useHud((s) => s.setBoot);
  const notify = useHud((s) => s.notify);
  const settings = useHud((s) => s.settings);
  const setSettings = useHud((s) => s.setSettings);
  const [tab, setTab] = useState<'main' | 'save' | 'load' | 'settings'>('main');
  const [saves, setSaves] = useState<SaveMeta[]>([]);

  if (!open) return null;

  const refresh = () => {
    setSaves(listLocalSaves());
    listServerSaves()
      .then((remote) => setSaves((cur) => [...cur.filter((s) => s.slot.startsWith('local:')), ...remote]))
      .catch(() => { /* server offline */ });
  };

  const doSave = async (slot: string) => {
    const world = bridgeWorld();
    if (!world) return;
    const name = `Skirmish ${new Date().toLocaleTimeString()}`;
    let ok = false;
    if (slot.startsWith('local:')) ok = saveLocal(parseInt(slot.slice(6), 10), name, world.serialize());
    else ok = !!(await saveServer(name, world.serialize()));
    notify(ok ? 'Game saved' : 'Save failed (storage unavailable)', ok ? 'good' : 'warn');
    if (ok) setTab('main');
  };

  const doLoad = async (slot: string) => {
    const blob = slot.startsWith('local:')
      ? loadLocal(parseInt(slot.slice(6), 10))
      : await loadServer(slot);
    try {
      if (blob) World.deserialize(blob); // validate before commit
    } catch {
      notify('Save is corrupted', 'warn');
      return;
    }
    if (!blob) {
      notify('Save could not be read', 'warn');
      return;
    }
    setBoot({ seed: blob.seed, factions: blob.factions as never[], ai: [], save: blob });
    setOpen(false);
    setScreen('game'); // remounts the scene with the loaded world
  };

  const quit = () => {
    setBoot(null);
    setOpen(false);
    setScreen('menu');
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 40 }}>
      <div style={{ ...panel, padding: 28, width: 380 }}>
        <h3 style={{ ...title, marginTop: 0, textAlign: 'center' }}>Game Menu</h3>
        {tab === 'main' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button style={btnPrimary} onClick={() => setOpen(false)}>Resume (Esc)</button>
            <button style={btn} onClick={() => { refresh(); setTab('save'); }}>Save</button>
            <button style={btn} onClick={() => { refresh(); setTab('load'); }}>Load</button>
            <button style={btn} onClick={() => setTab('settings')}>Settings</button>
            <button style={btn} onClick={quit} data-testid="menu-quit">Quit to Main Menu</button>
          </div>
        )}
        {(tab === 'save' || tab === 'load') && (
          <div>
            {[0, 1, 2].map((i) => {
              const slot = `local:${i}`;
              const existing = saves.find((s) => s.slot === slot);
              return (
                <button
                  key={slot}
                  style={{ ...btn, display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}
                  onClick={() => (tab === 'save' ? doSave(slot) : doLoad(slot))}
                  data-testid={`${tab}-slot-${i}`}
                >
                  Slot {i + 1}: {existing ? `${existing.name} — ${new Date(existing.ts).toLocaleString()}` : '(empty)'}
                </button>
              );
            })}
            {saves.filter((s) => s.slot.startsWith('server:')).map((s) => (
              <button key={s.slot} style={{ ...btn, display: 'block', width: '100%', marginBottom: 6, textAlign: 'left' }}
                onClick={() => (tab === 'save' ? doSave(s.slot) : doLoad(s.slot))}>
                ☁ {s.name} — {new Date(s.ts).toLocaleString()}
              </button>
            ))}
            <button style={{ ...btn, marginTop: 6 }} onClick={() => setTab('main')}>← Back</button>
          </div>
        )}
        {tab === 'settings' && (
          <div>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              Master volume
              <input
                type="range" min={0} max={1} step={0.05} value={settings.volume}
                onChange={(e) => setSettings({ volume: parseFloat(e.target.value) })}
                data-testid="settings-volume"
              />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              Minimap
              <input type="checkbox" checked={settings.showMinimap} onChange={(e) => setSettings({ showMinimap: e.target.checked })} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              Edge scrolling
              <input type="checkbox" checked={settings.edgeScroll} onChange={(e) => setSettings({ edgeScroll: e.target.checked })} />
            </label>
            <button style={btn} onClick={() => setTab('main')}>← Back</button>
          </div>
        )}
      </div>
    </div>
  );
}
