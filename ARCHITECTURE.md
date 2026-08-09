# Architecture

## Overview

```
┌──────────────┐   WebSocket (Phase 8)   ┌──────────────┐
│ React + Phaser│  ◀──────────────────▶  │ Fastify server│
│   (client)    │                        │  (authoritative)│
└──────┬───────┘                        └──────┬───────┘
       │ imports (source)                       │ imports
       ▼                                        ▼
┌──────────────────────────────────────────────────────┐
│              packages/game-core (TS, no deps)         │
│  Deterministic sim: World tick(dt) + command queue    │
└──────────────────────────────────────────────────────┘
                         ▲ imports types
              packages/shared (factions, protocol)
```

Single-player runs `game-core` inside the browser (80 Hz sim, decoupled
from RAF render). Multiplayer runs the **same** core on the server; clients
send commands, server simulates, snapshots/state deltas stream back. This is
the anti-cheat story: the client never owns truth.

## game-core contract

- `World` holds all state: map, units, buildings, factions, resources, fog.
- `world.enqueue(cmd)` — the *only* mutation path (used by UI, AI, netcode).
- `world.tick(dtMs)` — advances systems in fixed order:
  MovementSystem → EconomySystem → BuildingSystem → TrainingSystem →
  CombatSystem → SupplySystem → TerritorySystem → FogSystem → AISystem.
- Fixed timestep 1/16 s, seeded RNG (`rng.ts`) → replays + lockstep later.
- Save = `world.serialize()` into a JSON snapshot (Postgres `jsonb`), never
  per-frame rows.

Runtime systems (implemented / planned):
`pathfinding` (A* grid + group flow) · `movement` · `economy` (gather/carry/
upkeep) · `building` (placement/construction) · `unit/training` · `combat`
(counters, projectiles, morale) · `fog` (explored/visible per faction) ·
`territory` (city influence BFS) · `supply` · `technology` · `diplomacy` ·
`ai` (utility scoring per faction persona).

## Client layers

- `src/game/scenes/WorldScene.ts` — Phaser scene: terrain RenderTexture,
  fog overlay, unit sprite pool, effects. Renders core state; holds no sim
  truth.
- `src/game/camera.ts` + `src/game/input/Selection.ts` — RTS controls:
  WASD/arrows, edge scroll, middle-drag, wheel zoom; click/drag-box/shift/
  dbl-click/Ctrl+1-9 groups.
- `src/store.ts` (Zustand) — UI mirror of selection/resources/HUD intent
  (build mode, orders). Updated at ~4 Hz from the scene to avoid re-render
  churn.
- `src/hud/*` — React overlay (top bar, command panel, minimap later).

Simplifications (each marked in-code with `ponytail:`):
- Fog layer 2 redrawn via Graphics each 250 ms (fine at 128²; upgrade: RT diff).
- No flow-fields yet (upgrade path: per-army flow field in `pathfinding.ts`).
- Server is a stub in Phase 1 (auth/saves/MP land as phrased in ROADMAP).

## Server

Fastify + `@fastify/websocket` (Phase 8). Layers:
`routes/` (REST: auth, saves) · `ws/` (rooms, lobby, command intake) ·
`services/` (match runner wrapping game-core) · `db/` (Prisma in Phase 7).
Validation: every command schema-checked (zod) before `world.enqueue`;
server sim is the only one that matters.

## Data flow (single player)

UI/orders → `world.enqueue` → `world.tick` → scene reads state → render +
zustand mirror → React HUD.

## Folder map

```
apps/client      Vite+React+Phaser
apps/server      Fastify
packages/game-core  sim (tests: vitest)
packages/shared     faction defs, protocol types
```

## Performance notes (Phase 1 baseline)

- Terrain: one RenderTexture, painted once.
- Units: pooled Graphics/Container objects, capped float coalescing.
- Pathfinding budget: max N A* per tick, queue overflow to next ticks.
- 16 Hz sim vs 60 FPS render: interpolated on render only.

Target: 60 FPS, ~500 units. Profiling gates Phase 9.
