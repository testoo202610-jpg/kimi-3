import { useEffect, useState, type CSSProperties } from 'react';
import { unitDef } from '@cr/core';
import { useHud } from '../store';

interface SelInfo {
  type: string;
  name: string;
  count: number;
  hpAvg: number;
}

/** Bottom command panel: shows selection summary. Order buttons are queue-safe
 *  (Stop/Hold also work via S/H hotkeys handled in the Phaser scene). */
export function CommandPanel() {
  const selection = useHud((s) => s.selection);
  const [info, setInfo] = useState<SelInfo[]>([]);

  useEffect(() => {
    // selection carries ids; unit details read from world via the global scene handle
    const scene = (window as any).__cr_scene;
    if (!scene) return;
    const groups = new Map<string, { count: number; hp: number }>();
    for (const id of selection) {
      const u = scene.world.units.get(id);
      if (!u) continue;
      const g = groups.get(u.type) ?? { count: 0, hp: 0 };
      g.count++;
      g.hp += u.hp;
      groups.set(u.type, g);
    }
    setInfo(
      [...groups.entries()].map(([type, g]) => ({
        type,
        name: unitDef(type).name,
        count: g.count,
        hpAvg: Math.round(g.hp / g.count),
      })),
    );
  }, [selection]);

  return (
    <div style={styles.panel}>
      <div style={styles.left}>
        {info.length === 0 ? (
          <span style={styles.hint}>
            Drag or click to select units · Right-click to move · S stop · H hold · Ctrl+1-9 groups
          </span>
        ) : (
          info.map((i) => (
            <div key={i.type} style={styles.card}>
              <div style={styles.cardName}>{i.name}</div>
              <div style={styles.cardMeta}>×{i.count} · hp {i.hpAvg}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 96,
    display: 'flex',
    alignItems: 'stretch',
    gap: 8,
    padding: 8,
    background: 'linear-gradient(#1c150eee, #2a2118ee)',
    borderTop: '1px solid #4a3a24',
    color: '#e8d9b8',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    zIndex: 10,
    pointerEvents: 'auto',
  },
  left: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  hint: { color: '#8a7c60', fontSize: 13 },
  card: {
    background: '#241b11',
    border: '1px solid #4a3a24',
    borderRadius: 4,
    padding: '6px 10px',
    minWidth: 96,
  },
  cardName: { fontSize: 13, color: '#ffe9a8' },
  cardMeta: { fontSize: 11, color: '#a99a7c' },
};
