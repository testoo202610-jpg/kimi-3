import type { CSSProperties } from 'react';
import { ERA_COSTS, canAfford } from '@cr/core';
import { FACTIONS } from '@cr/shared';
import { useHud, type GameSpeed } from '../store';
import { bridgeEnqueue, bridgePlayerId } from './bridge';

const SPEEDS: GameSpeed[] = [0, 0.5, 1, 2, 4];
const ERAS = ['Settlement', 'City', 'Kingdom', 'Imperial'];

export function TopBar() {
  const speed = useHud((s) => s.speed);
  const setSpeed = useHud((s) => s.setSpeed);
  const res = useHud((s) => s.res);
  const popUsed = useHud((s) => s.popUsed);
  const popCap = useHud((s) => s.popCap);
  const starving = useHud((s) => s.starving);
  const era = useHud((s) => s.era);
  const faction = FACTIONS[0];

  const nextCost = era < 3 ? ERA_COSTS[era] : null;
  const canAdvance = nextCost != null && res != null && canAfford(res, nextCost);

  return (
    <div style={styles.bar}>
      <span style={styles.title}>Crimson Ramparts</span>
      <span style={styles.faction}>{faction.name} — {faction.epithet}</span>
      <span style={styles.res}>
        Food {fmt(res?.food)} · Wood {fmt(res?.wood)} · Stone {fmt(res?.stone)} · Iron {fmt(res?.iron)} · Gold {fmt(res?.gold)} · Horses {fmt(res?.horses)}
      </span>
      <span style={{ color: starving ? '#e05050' : '#a99a7c' }}>
        Pop {popUsed}/{popCap}{starving ? ' — STARVING' : ''}
      </span>
      <button
        style={{ ...styles.btn, ...(canAdvance ? styles.btnActive : {}) }}
        title={nextCost ? `Advance to ${ERAS[era + 1]}: ${costText(nextCost)}` : 'Max era'}
        disabled={!canAdvance}
        onClick={() => bridgeEnqueue({ type: 'researchEra', player: bridgePlayerId() })}
      >
        Era: {ERAS[era]}{nextCost ? ' →' : ''}
      </button>
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

function costText(cost: Record<string, number | undefined>): string {
  return Object.entries(cost)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
}

function fmt(v: number | undefined): string {
  return v == null ? '—' : String(Math.floor(v));
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
