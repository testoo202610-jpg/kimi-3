import type { FastifyInstance } from 'fastify';

export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async () => ({ ok: true, ts: Date.now() }));
  app.get('/api/info', async () => ({
    name: 'Crimson Ramparts API',
    version: 1,
    modes: ['skirmish'],
    multiplayer: 'planned (Phase 8 — server-authoritative game-core sim over WS)',
  }));
}
