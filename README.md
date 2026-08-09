# Crimson Ramparts — Three Realms

An original browser-based real-time strategy game inspired by classic Three
Kingdoms-era RTS design: settlement growth, food-driven armies, generals,
territory and conquest. All code, map, art and names are original work —
no copyrighted assets or content from any existing game.

## Stack

- Client: TypeScript + React + Vite + Phaser 3 + Zustand
- Server: Node.js + TypeScript + Fastify (+ WebSocket, later phases)
- Simulation: dependency-free `packages/game-core` (shared by client & server)
- DB: PostgreSQL via docker-compose (persistent saves/auth land in Phase 7–8)
- Tests: Vitest (core logic), Playwright (browser flows, Phase 7)

## Requirements

- Node.js >= 20
- npm >= 10

## Install

```bash
npm install
```

## Develop

```bash
npm run dev          # Vite dev server (game client) on :5173
npm run dev:server   # Fastify API on :4000 (optional in Phase 1)
```

## Test / typecheck / lint / build

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## Docker (local environment)

```bash
docker compose up db      # postgres only (default for dev)
docker compose up         # db + api server
```

Create `apps/server/.env` (see `apps/server/.env.example`) to change ports.

## Layout

```
apps/client        Phaser + React game client
apps/server        Fastify API (auth, saves, multiplayer — later phases)
packages/game-core Deterministic RTS simulation (map, units, systems)
packages/shared    Constants/types shared by client & server
docs are in repo root: ARCHITECTURE.md, GAME_DESIGN.md, ROADMAP.md
```
