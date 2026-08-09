import { useEffect, useRef } from 'react';
import { bootGame } from './game/boot';
import { TopBar } from './hud/TopBar';
import { CommandPanel } from './hud/CommandPanel';
import { MainMenu } from './ui/MainMenu';
import { SetupScreen } from './ui/SetupScreen';
import { LobbyScreen } from './ui/LobbyScreen';
import { Minimap } from './ui/Minimap';
import { Toasts } from './ui/Toasts';
import { GameMenu } from './ui/GameMenu';
import { useHud } from './store';

export default function App() {
  const screen = useHud((s) => s.screen);
  const boot = useHud((s) => s.boot);
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {screen === 'menu' && <MainMenu />}
      {screen === 'setup' && <SetupScreen />}
      {screen === 'lobby' && <LobbyScreen />}
      {screen === 'game' && boot && <GameView key={JSON.stringify({ s: boot.seed, f: boot.factions, saved: !!boot.save })} />}
      <Toasts />
    </div>
  );
}

function GameView() {
  const host = useRef<HTMLDivElement>(null);
  const boot = useHud((s) => s.boot);

  useEffect(() => {
    const game = bootGame(host.current!, boot!);
    return () => game.destroy(true);
    // boot is fixed for this mount (key-gated); deps intentionally empty
  }, []);

  return (
    <>
      <div id="game" ref={host} style={{ position: 'absolute', inset: 0 }} />
      <TopBar />
      <CommandPanel />
      <Minimap />
      <GameMenu />
    </>
  );
}
