import { useEffect, useRef } from 'react';
import { bootGame } from './game/boot';
import { TopBar } from './hud/TopBar';
import { CommandPanel } from './hud/CommandPanel';

export default function App() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = bootGame(host.current!);
    return () => game.destroy(true);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div id="game" ref={host} style={{ position: 'absolute', inset: 0 }} />
      <TopBar />
      <CommandPanel />
    </div>
  );
}
