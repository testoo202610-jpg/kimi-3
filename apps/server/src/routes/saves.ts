import type { FastifyInstance } from 'fastify';

// ponytail: in-memory save slots — lost on restart, shared across all users.
// Upgrade path: Postgres persistence + auth-scoped slots (docker-compose db
// is already provisioned for this).
interface Slot {
  name: string;
  ts: number;
  blob: unknown;
}
const saves = new Map<string, Slot>();
const MAX_SAVES = 32;

export async function saveRoutes(app: FastifyInstance) {
  app.get('/api/saves', async () =>
    [...saves.entries()].map(([slot, s]) => ({ slot: `server:${slot}`, name: s.name, ts: s.ts })),
  );

  app.post('/api/saves', async (req, reply) => {
    const body = req.body as { name?: string; blob?: unknown } | null;
    if (!body?.name || body.blob == null) return reply.code(400).send({ error: 'name + blob required' });
    if (saves.size >= MAX_SAVES) {
      const oldest = [...saves.entries()].sort((a, b) => a[1].ts - b[1].ts)[0][0];
      saves.delete(oldest);
    }
    const slot = `s${Date.now().toString(36)}`;
    saves.set(slot, { name: body.name, ts: Date.now(), blob: body.blob });
    return { slot: `server:${slot}` };
  });

  app.get('/api/saves/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const s = saves.get(id.replace(/^server:/, ''));
    if (!s) return reply.code(404).send({ error: 'not found' });
    return { slot: `server:${id}`, name: s.name, ts: s.ts, blob: s.blob };
  });
}
