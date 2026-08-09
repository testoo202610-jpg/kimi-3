# Roadmap

Each phase ends with: tests green, `typecheck` green, `lint` green,
`build` green, git commit.

- [x] Phase 1 — Foundation: repo, docs, game-core (map gen, A*, movement,
      fog), Phaser scene, camera, selection, right-click move, server stub.
- [x] Phase 2 — Core RTS: resources on map, worker gather/carry/drop-off,
      building placement/preview/construction, population cap, houses/farms,
      granary bonus, idle worker ping.
- [x] Phase 3 — Military: unit defs (infantry/archers/cavalry), barracks
      training, combat (armor, counters, projectiles), basic morale,
      formations (line/wedge/square/loose).
- [x] Phase 4 — City & economy: city zones, market, gold, trade routes,
      territory projection, era upgrades, wall/gate/tower.
- [x] Phase 5 — Strategic: generals, armies, abilities, supply system,
      diplomacy, city capture by occupation.
- [ ] Phase 6 — AI: economy/expansion/military planners, faction personas,
      difficulty tiers, anti-cheat audit test (Hard AI gains no free stuff).
- [ ] Phase 7 — UX: main menu, faction select, skirmish setup, minimap,
      notifications, settings, game speeds, save/load (local + server),
      Playwright flows (new game / place building / train unit / move order).
- [ ] Phase 8 — Multiplayer: rooms, lobby, ready, 2–4 players, server-
      authoritative sim with command validation, reconnect basics.
- [ ] Phase 9 — Polish: art pass (original), audio architecture + sfx,
      siege/naval completion, perf profile ≥60 FPS @500 units, balance.
