import type { CSSProperties } from 'react';
import { FACTIONS } from '@cr/shared';
import { useHud, type GameSpeed } from '../store';

const SPEEDS: GameSpeed[] = [0, 0.5, 1, 2, 4];

export function TopBar() {
  const speed = useHud((s) => s.speed);
  const setSpeed = useHud((s) => s.setSpeed);

  return (
    <div style={styles.bar}>
      <span style={styles.title}>Crimson Ramparts</span>
      <span style={styles.faction}>Northern Dominion — the Iron Plains</span>
      <span style={styles.res}>Food — · Wood — · Stone — · Iron — · Gold — · Pop —</span>
      <span style={styles.spacer} />
      {SPEEDS.map((s) => (
        <button
          key={s}
          onClick={() => setSpeed(s)}
          style={{ ...styles.btn, ...(speed === s ? styles.btnActive : {}) }}
        >
          {s === 0 ? '⏸' : `${s}×`}
        </button>
      ))}
    </div>
  );
}

export function factionName(id: number) {
  return FACTIONS[id]?.name ?? '—';
}

const styles: Record<string, CSSProperties> = {
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 36,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 12px',
    background: 'linear-gradient(#2a2118ee, #1c150eee)',
    borderBottom: '1px solid #4a3a24',
    color: '#e8d9b8',
    fontFamily: "'Segoe UI', system-ui, sans-serif",
    fontSize: 13,
    zIndex: 10,
    pointerEvents: 'auto',
  },
  title: { fontWeight: 700, color: '#d8b13a' },
  faction: { color: '#c96a5a' },
  res: { color: '#a99a7c' },
  spacer: { flex: 1 },
  btn: {
    background: '#3a2d1c',
    color: '#e8d9b8',
    border: '1px solid #5a4730',
    borderRadius: 3,
    padding: '2px 8px',
    cursor: 'pointer',
    fontSize: 12,
  },
  btnActive: { background: '#6a5228', borderColor: '#d8b13a', color: '#ffe9a8' },
};
