import { useState } from 'react';
import type { Difficulty } from '@cr/core';
import { FACTIONS, type FactionId } from '@cr/shared';
import { useHud } from '../store';
import { btn, btnActive, btnPrimary, panel, title } from '../hud/theme';

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
];

export function SetupScreen() {
  const setScreen = useHud((s) => s.setScreen);
  const setBoot = useHud((s) => s.setBoot);
  const [faction, setFaction] = useState<FactionId>('dominion');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');
  const [opponents, setOpponents] = useState(1);
  const [seed, setSeed] = useState(() => (Date.now() % 100000) | 1);

  const start = () => {
    const others = FACTIONS.map((f) => f.id).filter((f) => f !== faction);
    const factions: FactionId[] = [faction, ...others.slice(0, opponents)];
    setBoot({
      seed: seed | 1,
      factions,
      ai: factions.slice(1).map((_, i) => ({ player: i + 1, difficulty })),
    });
    setScreen('game');
  };

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #2b2013 0%, #14100c 70%)' }}>
      <div style={{ ...panel, padding: 32, width: 560 }}>
        <h2 style={{ ...title, marginTop: 0 }}>Skirmish Setup</h2>

        <div style={{ marginBottom: 16 }}>
          <div style={{ marginBottom: 6, color: '#a8977a' }}>Your banner</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {FACTIONS.map((f) => (
              <button
                key={f.id}
                style={{ ...(faction === f.id ? btnActive : btn), flex: 1, borderTop: `3px solid ${f.colorCss}` }}
                onClick={() => setFaction(f.id)}
                title={f.summary}
                data-testid={`faction-${f.id}`}
              >
                <div style={{ fontWeight: 600 }}>{f.name}</div>
                <div style={{ fontSize: 11, color: '#a8977a' }}>{f.epithet}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6, color: '#a8977a' }}>Nearby lords (AI)</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {[1, 2].map((n) => (
                <button key={n} style={opponents === n ? btnActive : btn} onClick={() => setOpponents(n)}>{n}</button>
              ))}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ marginBottom: 6, color: '#a8977a' }}>Difficulty</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {DIFFICULTIES.map((d) => (
                <button key={d.id} style={difficulty === d.id ? btnActive : btn} onClick={() => setDifficulty(d.id)} data-testid={`difficulty-${d.id}`}>
                  {d.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ marginBottom: 6, color: '#a8977a' }}>Map seed (same seed = same map)</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={seed}
              onChange={(e) => setSeed(parseInt(e.target.value, 10) || 1)}
              style={{ ...btn, cursor: 'text', flex: 1 }}
              data-testid="seed-input"
            />
            <button style={btn} onClick={() => setSeed((Date.now() % 100000) | 1)}>🎲</button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button style={btn} onClick={() => setScreen('menu')}>← Back</button>
          <button style={btnPrimary} onClick={start} data-testid="setup-start">March →</button>
        </div>
      </div>
    </div>
  );
}
