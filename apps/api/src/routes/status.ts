import type { FastifyInstance } from 'fastify';
import type { SignalRepository } from '../repositories/signals.js';
import type { TelemetryClient } from '../services/telemetry.js';

const round = (ms: number) => Math.round(ms * 100) / 100;

export function statusRoutes(
  app: FastifyInstance,
  deps: { repo: SignalRepository; telemetry: TelemetryClient },
): void {
  // Siempre responde 200: "degradado" es información para la interfaz, no un
  // error de transporte. Las dos consultas corren en paralelo.
  app.get('/api/status', async () => {
    const [database, telemetry] = await Promise.all([
      deps.repo.ping().then(
        (ms) => ({ status: 'ok' as const, latencyMs: round(ms) }),
        () => ({ status: 'down' as const, latencyMs: null }),
      ),
      deps.telemetry.snapshot(),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      api: { status: 'ok' as const, uptimeSeconds: Math.floor(process.uptime()) },
      database,
      telemetry,
    };
  });
}
