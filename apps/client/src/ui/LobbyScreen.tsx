import { useEffect, useState } from 'react';
import { FACTIONS, MAX_PLAYERS, type FactionId } from '@cr/shared';
import { useHud } from '../store';
import { btn, btnActive, btnPrimary, panel, title } from '../hud/theme';
import { net } from '../game/net';

/** Multiplayer lobby: create/join a room, pick faction, ready up, host starts. */
export function LobbyScreen() {
  const setScreen = useHud((s) => s.setScreen);
  const setBoot = useHud((s) => s.setBoot);
  const notify = useHud((s) => s.notify);
  const [name, setName] = useState(() => localStorage.getItem('cr_name') ?? 'warlord');
  const [room, setRoom] = useState('');
  const [ai, setAi] = useState(0);
  const [joined, setJoined] = useState(false);
  const [, force] = useState(0);
  const refresh = () => force((n) => n + 1);

  useEffect(() => {
    net.onLobby = () => {
      setJoined(true);
      refresh();
    };
    net.onReject = (reason) => notify(`Server: ${reason}`, 'warn');
    net.onStart = () => {
      setBoot({ seed: net.seed, factions: net.factions as never[], ai: [], mp: true });
      setScreen('game');
    };
    return () => {
      net.onLobby = net.onStart = net.onReject = null;
    };
  }, [setBoot, setScreen, notify]);

  const enter = async (mode: 'create' | 'join') => {
    if (!room.trim()) return notify('Room code required', 'warn');
    localStorage.setItem('cr_name', name);
    try {
      if (mode === 'create') await net.create(room.trim(), name, (Date.now() % 100000) | 1, ai);
      else await net.join(room.trim(), name);
    } catch {
      notify('Server unreachable — is dev:server running?', 'warn');
    }
  };

  const me = net.players.find((p) => p.slot === net.you);
  const isHost = net.you === 0;

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at center, #2b2013 0%, #14100c 70%)' }}>
      <div style={{ ...panel, padding: 32, width: 560 }}>
        <h2 style={{ ...title, marginTop: 0 }}>Multiplayer</h2>

        {!joined && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <label style={{ flex: 1 }}>
                <div style={{ marginBottom: 4, color: '#a8977a', fontSize: 13 }}>Name</div>
                <input value={name} onChange={(e) => setName(e.target.value)} style={{ ...btn, cursor: 'text', width: '100%', boxSizing: 'border-box' }} data-testid="lobby-name" />
              </label>
              <label style={{ flex: 1 }}>
                <div style={{ marginBottom: 4, color: '#a8977a', fontSize: 13 }}>Room code</div>
                <input value={room} onChange={(e) => setRoom(e.target.value)} style={{ ...btn, cursor: 'text', width: '100%', boxSizing: 'border-box' }} data-testid="lobby-room" />
              </label>
              <label style={{ width: 90 }}>
                <div style={{ marginBottom: 4, color: '#a8977a', fontSize: 13 }}>AI lords</div>
                <input type="number" min={0} max={3} value={ai} onChange={(e) => setAi(+e.target.value)} style={{ ...btn, cursor: 'text', width: '100%', boxSizing: 'border-box' }} data-testid="lobby-ai" />
              </label>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button style={btnPrimary} onClick={() => enter('create')} data-testid="lobby-create">Create Room</button>
              <button style={btn} onClick={() => enter('join')} data-testid="lobby-join">Join Room</button>
            </div>
          </>
        )}

        {joined && (
          <>
            <div style={{ marginBottom: 4, color: '#a8977a', fontSize: 13 }}>
              Room <b style={{ color: '#ffe9a8' }}>{net.room}</b> · {net.players.length}/{MAX_PLAYERS} commanders
            </div>
            <div style={{ marginBottom: 16 }} data-testid="lobby-players">
              {net.players.map((p) => (
                <div key={p.slot} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid #3a2d1c' }}>
                  <span style={{ color: '#ffe9a8', flex: 1 }}>
                    {p.name}{p.slot === 0 ? ' 👑' : ''}{p.slot === net.you ? ' (you)' : ''}
                  </span>
                  <span style={{ color: FACTIONS.find((f) => f.id === p.faction)?.colorCss, fontSize: 12 }}>
                    {FACTIONS.find((f) => f.id === p.faction)?.name}
                  </span>
                  <span style={{ fontSize: 12, color: p.ready ? '#7fe090' : '#a8977a' }}>{p.ready ? '✓ ready' : 'waiting'}</span>
                </div>
              ))}
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 6, color: '#a8977a', fontSize: 13 }}>Your banner</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {FACTIONS.map((f) => (
                  <button
                    key={f.id}
                    style={{ ...(me?.faction === f.id ? btnActive : btn), flex: 1, borderTop: `3px solid ${f.colorCss}` }}
                    onClick={() => net.setFaction(f.id as FactionId)}
                    data-testid={`lobby-faction-${f.id}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button style={me?.ready ? btnActive : btn} onClick={() => net.setReady(!me?.ready)} data-testid="lobby-ready">
                {me?.ready ? '✓ Ready' : 'Ready up'}
              </button>
              {isHost && (
                <button style={btnPrimary} onClick={() => net.requestStart()} data-testid="lobby-start">March →</button>
              )}
            </div>
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <button style={btn} onClick={() => { net.leave(); setScreen('menu'); }}>← Back</button>
        </div>
      </div>
    </div>
  );
}
