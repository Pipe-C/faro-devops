import type { FastifyInstance } from 'fastify';
import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Métricas Prometheus. Se usa un registro propio (no el global) para que cada
 * instancia de la app —y cada prueba— tenga contadores independientes.
 */
export function registerMetrics(app: FastifyInstance): Registry {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const duration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duración de las peticiones HTTP en segundos',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    registers: [registry],
  });
  const signalsCreated = new Counter({
    name: 'faro_signals_created_total',
    help: 'Señales registradas en la bitácora',
    registers: [registry],
  });

  app.decorate('signalsCreated', signalsCreated);

  app.addHook('onResponse', async (req, reply) => {
    // `routeOptions.url` es la plantilla de la ruta (p. ej. /api/signals), no la
    // URL real: evita explosión de cardinalidad en las etiquetas.
    const route = req.routeOptions.url ?? 'no_encontrada';
    duration.observe(
      { method: req.method, route, status_code: reply.statusCode },
      reply.elapsedTime / 1000,
    );
  });

  // Solo es accesible desde la red de gestión: el proxy no enruta /metrics.
  app.get('/metrics', { config: { rateLimit: false } }, async (_req, reply) => {
    return reply.header('content-type', registry.contentType).send(await registry.metrics());
  });

  return registry;
}

declare module 'fastify' {
  interface FastifyInstance {
    signalsCreated: Counter;
  }
}
