# Crimson Ramparts — Three Realms

An original real-time strategy game prototype inspired by the strategic themes of settlement growth, supply-driven armies, generals, territorial control, and conquest.

> **Project status:** architecture and gameplay exploration. This repository demonstrates a scalable client/server RTS structure and is maintained as a separate concept from the Dragon Kingdoms projects.

## Architecture

- `apps/client`: React, Vite, Phaser 3, and Zustand game client.
- `apps/server`: Fastify API foundation for later authentication, saves, and multiplayer.
- `packages/game-core`: dependency-free deterministic simulation shared by client and server.
- `packages/shared`: constants and shared TypeScript types.
- PostgreSQL via Docker Compose for later persistent game features.

## Engineering focus

- Clear separation between rendering, networking, and simulation.
- Workspace-based TypeScript monorepo structure.
- Pure game-core logic designed for testing and future server authority.
- A phased route toward persistence, authentication, browser tests, and multiplayer.

## Requirements

- Node.js 20+
- npm 10+

## Run locally

```bash
npm install
npm run dev
npm run dev:server
```

## Verify

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## Local database

```bash
docker compose up db
```

Use `apps/server/.env.example` as the reference for optional server configuration.