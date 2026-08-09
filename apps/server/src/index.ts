import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';

// ponytail: phase 1 stub — auth (guest+login), save slots and WS multiplayer
// are added in phases 7/8. Upgrade path: register @fastify/websocket + a
// MatchRunner that wraps @cr/core world and validates every client command.

const PORT = Number(process.env.PORT ?? 4000);

async function main() {
  const app = Fastify({ logger: true });
  await app.register(healthRoutes);
  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
