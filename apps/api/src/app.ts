import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config.js';
import { registerMetrics } from './plugins/metrics.js';
import type { SignalRepository } from './repositories/signals.js';
import { healthRoutes } from './routes/health.js';
import { signalRoutes } from './routes/signals.js';
import { statusRoutes } from './routes/status.js';
import type { TelemetryClient } from './services/telemetry.js';

export interface AppDeps {
  config: Pick<Config, 'logLevel' | 'rateLimitMax'>;
  repository: SignalRepository;
  telemetry: TelemetryClient;
}

/**
 * Fábrica de la aplicación: recibe sus dependencias en lugar de crearlas,
 * así `server.ts` cablea MySQL real y las pruebas inyectan dobles.
 */
export async function buildApp({ config, repository, telemetry }: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie'],
    },
    // La API solo es alcanzable a través del proxy, que fija X-Forwarded-For.
    trustProxy: true,
    bodyLimit: 4096,
  });

  await app.register(helmet);
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: '1 minute',
    errorResponseBuilder: (_req, ctx) => ({
      statusCode: 429,
      error: 'too_many_requests',
      message: `Demasiadas peticiones. Inténtalo de nuevo en ${Math.ceil(ctx.ttl / 1000)} s.`,
    }),
  });

  registerMetrics(app);
  healthRoutes(app, repository);
  statusRoutes(app, { repo: repository, telemetry });
  signalRoutes(app, repository);

  // Los errores 5xx no filtran detalles internos al cliente; quedan en el log.
  app.setErrorHandler((error: { statusCode?: number; code?: string; message: string }, req, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      req.log.error({ err: error }, 'error no controlado');
      return reply.code(500).send({ error: 'internal_error', message: 'Error interno del servidor.' });
    }
    return reply.code(status).send({ error: error.code ?? 'bad_request', message: error.message });
  });

  return app;
}
