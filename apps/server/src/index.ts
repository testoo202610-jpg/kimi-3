import Fastify from 'fastify';
import { healthRoutes } from './routes/health.js';
import { saveRoutes } from './routes/saves.js';
import { registerNet } from './net.js';

const PORT = Number(process.env.PORT ?? 4000);

async function main() {
  const app = Fastify({ logger: true });
  // dev client runs on :5173 — allow its API calls (WS is origin-agnostic)
  app.addHook('onSend', async (_req, reply) => {
    reply.header('Access-Control-Allow-Origin', '*');
    reply.header('Access-Control-Allow-Headers', 'content-type');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  });
  app.options('/*', async () => ({}));
  await app.register(healthRoutes);
  await app.register(saveRoutes);
  await app.register(registerNet);
  await app.listen({ port: PORT, host: '0.0.0.0' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
