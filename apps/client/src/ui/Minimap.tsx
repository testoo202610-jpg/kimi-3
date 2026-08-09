import { useEffect, useRef } from 'react';
import { TILE, Tile } from '@cr/core';
import { FACTION_BY_ID, type FactionId } from '@cr/shared';
import { bridgeCameraTo, bridgeWorld, bridgePlayerId } from '../hud/bridge';
import { useHud } from '../store';

const SIZE = 192;

const TERRAIN: Record<number, string> = {
  [Tile.Grass]: '#3c5227',
  [Tile.Forest]: '#24401f',
  [Tile.Mountain]: '#7a7569',
  [Tile.River]: '#2c5075',
  [Tile.Road]: '#8a6d45',
  [Tile.Bridge]: '#6e5335',
  [Tile.Farmland]: '#8a6d3a',
};

/** bottom-right minimap: explored terrain + unit dots + camera rect, click to jump */
export function Minimap() {
  const ref = useRef<HTMLCanvasElement>(null);
  const show = useHud((s) => s.settings.showMinimap);

  useEffect(() => {
    if (!show) return;
    const id = setInterval(() => {
      const cv = ref.current;
      const w = bridgeWorld();
      if (!cv || !w) return;
      const ctx = cv.getContext('2d');
      if (!ctx) return;
      const pid = bridgePlayerId();
      const fog = w.players[pid].fog;
      const { w: mw, h: mh, tiles, deposits } = w.map;
      const sx = SIZE / mw;
      const sy = SIZE / mh;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, SIZE, SIZE);
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const i = y * mw + x;
          if (fog.explored[i] !== 1) continue;
          ctx.fillStyle = fog.visible[i] === 1 ? TERRAIN[tiles[i]] : shadeColor(TERRAIN[tiles[i]] ?? '#000', 0.55);
          ctx.fillRect(x * sx, y * sy, Math.ceil(sx), Math.ceil(sy));
        }
      }
      // resources glint through explored fog
      ctx.fillStyle = '#d8b13a';
      for (const d of deposits) {
        if (d.amount <= 0 || fog.explored[d.ty * mw + d.tx] !== 1) continue;
        if (d.kind === 'fish') ctx.fillStyle = '#77c0c8';
        else if (d.kind === 'stone') ctx.fillStyle = '#9a9a94';
        else if (d.kind === 'iron') ctx.fillStyle = '#7a4a3a';
        else ctx.fillStyle = '#d8b13a';
        ctx.fillRect(d.tx * sx - 0.5, d.ty * sy - 0.5, 2, 2);
      }
      // buildings: faction squares
      for (const b of w.buildings.values()) {
        const f = FACTION_BY_ID[w.players[b.owner].faction as FactionId];
        ctx.fillStyle = f.colorCss;
        const bw = Math.max(2, 3 * sx);
        ctx.fillRect(b.tx * sx - bw / 2, b.ty * sy - bw / 2, bw, bw);
      }
      // units: player gold, others red-grey (only where visible)
      for (const u of w.units.values()) {
        const i = Math.floor(u.y / TILE) * mw + Math.floor(u.x / TILE);
        const own = u.owner === pid;
        if (!own && fog.visible[i] !== 1) continue;
        ctx.fillStyle = own ? '#ffd860' : '#e05040';
        ctx.fillRect((u.x / TILE) * sx - 0.5, (u.y / TILE) * sy - 0.5, 2, 2);
      }
      // camera rect
      const scene = (window as any).__cr_scene;
      const cam = scene?.cameras?.main;
      if (cam) {
        ctx.strokeStyle = '#ffe9b0';
        ctx.lineWidth = 1;
        const vw = cam.worldView;
        ctx.strokeRect(vw.x / TILE * sx, vw.y / TILE * sy, vw.width / TILE * sx, vw.height / TILE * sy);
      }
    }, 400);
    return () => clearInterval(id);
  }, [show]);

  if (!show) return null;

  return (
    <canvas
      ref={ref}
      width={SIZE}
      height={SIZE}
      data-testid="minimap"
      onClick={(e) => {
        const w = bridgeWorld();
        const cv = ref.current;
        if (!w || !cv) return;
        const r = cv.getBoundingClientRect();
        bridgeCameraTo(
          ((e.clientX - r.left) / r.width) * w.map.w * TILE,
          ((e.clientY - r.top) / r.height) * w.map.h * TILE,
        );
      }}
      style={{ position: 'absolute', right: 8, bottom: 8, border: '2px solid #5a4730', borderRadius: 3, zIndex: 20, cursor: 'crosshair', imageRendering: 'pixelated' }}
    />
  );
}

function shadeColor(css: string, f: number): string {
  const n = parseInt(css.slice(1), 16);
  const c = (v: number) => Math.min(255, Math.floor(v * f));
  return `rgb(${c(n >> 16)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
