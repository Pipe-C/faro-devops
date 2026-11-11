import type { FastifyInstance } from 'fastify';
import type { SignalRepository } from '../repositories/signals.js';

export function healthRoutes(app: FastifyInstance, repo: SignalRepository): void {
  const opts = { config: { rateLimit: false } };

  // Liveness: el proceso está vivo. No toca dependencias para no reiniciar
  // el contenedor por un fallo de la base de datos.
  app.get('/health/live', opts, async () => ({ status: 'ok' }));

  // Readiness: la API puede atender tráfico (la base de datos responde).
  app.get('/health/ready', opts, async (_req, reply) => {
    try {
      await repo.ping();
      return { status: 'ok' };
    } catch {
      return reply.code(503).send({ status: 'unavailable', reason: 'database' });
    }
  });
}
