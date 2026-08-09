import { useEffect, useState, type CSSProperties } from 'react';
import { BUILDING_DEFS, buildingDef, unitDef } from '@cr/core';
import { useHud } from '../store';
import { bridgeEnqueue, bridgePlayerId, bridgeWorld } from './bridge';

interface SelInfo {
  type: string;
  name: string;
  count: number;
  hpAvg: number;
}

/** Bottom command panel: selection, build menu (workers), building card + training. */
export function CommandPanel() {
  const selection = useHud((s) => s.selection);
  const selectedBuilding = useHud((s) => s.selectedBuilding);
  const buildKey = useHud((s) => s.buildKey);
  useHud((s) => s.res); // subscribe: refresh train queue/progress display 4 Hz
  const [info, setInfo] = useState<SelInfo[]>([]);

  useEffect(() => {
    const w = bridgeWorld();
    if (!w) return;
    const groups = new Map<string, { count: number; hp: number }>();
    for (const id of selection) {
      const u = w.units.get(id);
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

  const w = bridgeWorld();
  const hasWorker = selection.some((id) => w?.units.get(id)?.type === 'worker');
  const b = selectedBuilding != null ? w?.buildings.get(selectedBuilding) : null;
  const bdef = b ? buildingDef(b.key) : null;

  return (
    <div style={styles.panel}>
      <div style={styles.left}>
        {!b && info.length === 0 && (
          <span style={styles.hint}>
            Drag or click to select units · Right-click: move / gather (forest & deposits) · S stop · H hold · Ctrl+1-9 groups
          </span>
        )}
        {!b && info.map((i) => (
          <div key={i.type} style={styles.card}>
            <div style={styles.cardName}>{i.name}</div>
            <div style={styles.cardMeta}>×{i.count} · hp {i.hpAvg}</div>
          </div>
        ))}
        {b && bdef && (
          <div style={styles.card}>
            <div style={styles.cardName}>{bdef.name}</div>
            <div style={styles.cardMeta}>
              {b.built ? `hp ${Math.round(b.hp)}/${bdef.hp}` : `building… ${Math.round(b.progress * 100)}%`}
            </div>
            {b.queue[0] && (
              <div style={styles.cardMeta}>
                training {unitDef(b.queue[0].unitKey).name} {Math.ceil(b.queue[0].remaining)}s
                {b.queue.length > 1 ? ` (+${b.queue.length - 1} queued)` : ''}
              </div>
            )}
          </div>
        )}
      </div>
      <div style={styles.right}>
        {b && bdef?.trains.map((u) => (
          <TrainButton key={u} buildingId={b.id} unitKey={u} />
        ))}
        {hasWorker &&
          Object.values(BUILDING_DEFS).map((d) => (
            <button
              key={d.key}
              style={{ ...styles.btn, ...(buildKey === d.key ? styles.btnActive : {}) }}
              title={costText(d.cost)}
              onClick={() => useHud.getState().setBuildKey(buildKey === d.key ? null : d.key)}
            >
              {d.name}
            </button>
          ))}
      </div>
    </div>
  );
}

function TrainButton({ buildingId, unitKey }: { buildingId: number; unitKey: string }) {
  const def = unitDef(unitKey);
  return (
    <button
      style={styles.btn}
      title={`${costText(def.cost)} · ${def.trainTime}s`}
      onClick={() => bridgeEnqueue({ type: 'train', player: bridgePlayerId(), buildingId, unitKey })}
    >
      Train {def.name}
    </button>
  );
}

function costText(cost: Record<string, number | undefined>): string {
  return Object.entries(cost)
    .filter(([, v]) => v)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
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
  left: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 },
  right: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', maxWidth: '55%', justifyContent: 'flex-end' },
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
  btn: {
    background: '#3a2d1c',
    color: '#e8d9b8',
    border: '1px solid #5a4730',
    borderRadius: 3,
    padding: '4px 10px',
    cursor: 'pointer',
    fontSize: 12,
  },
  btnActive: { background: '#6a5228', borderColor: '#d8b13a', color: '#ffe9a8' },
};
