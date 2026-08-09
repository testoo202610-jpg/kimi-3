# AGENTS.md

## Project
Crimson Ramparts — original browser RTS (three-kingdoms-inspired flavour,
fictional names/art). See `GAME_DESIGN.md`, `ARCHITECTURE.md`, `ROADMAP.md`.

## Rules for coding agents
- **No copyrighted assets or content.** All art is generated code (Phaser
  `Graphics` primitives) and all names are original. Never add downloaded
  game assets.
- Sim truth lives in `packages/game-core` only. Phaser scene (`WorldScene`)
  renders; React HUD mirrors via zustand. Do not put gameplay state in React
  or Phaser objects.
- All mutations go through `world.enqueue(command)`. Keep core deterministic
  (seeded RNG, fixed timestep) — multiplayer + replays depend on it.
- Core has **zero runtime dependencies**. Do not add deps to game-core.
- Deliberate simplifications are marked `ponytail:` with the upgrade path.
  If you outgrow one, remove the comment and implement properly.

## Commands
```bash
npm install
npm run dev           # client
npm run dev:server    # api
npm run test          # vitest (game-core)
npm run typecheck
npm run lint
npm run build
```

## Conventions
- TypeScript strict everywhere; `moduleResolution: bundler`.
- Workspace imports: `@cr/core`, `@cr/shared` via tsconfig paths / vite alias.
- Commit style: `feat: ...`, `fix: ...`, one phase per commit (see ROADMAP).
- Tile coordinates = integers `{tx,ty}`; world coords = px. `TILE = 32`.
- Fog: per-faction `explored` + `visible` grids; units/buildings reveal.
