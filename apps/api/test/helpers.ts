import type { SignalRepository, Signal } from '../src/repositories/signals.js';
import type { TelemetryClient } from '../src/services/telemetry.js';
import { buildApp } from '../src/app.js';

/** Repositorio en memoria con un interruptor para simular la caída de la BD. */
export function fakeRepository(): SignalRepository & { dbDown: boolean } {
  const signals: Signal[] = [];
  const repo = {
    dbDown: false,
    async list(limit: number) {
      return signals.slice(-limit).reverse();
    },
    async create(message: string) {
      const signal = { id: signals.length + 1, message, createdAt: new Date().toISOString() };
      signals.push(signal);
      return signal;
    },
    async ping() {
      if (repo.dbDown) throw new Error('db down');
      return 1.234;
    },
  };
  return repo;
}

export const noTelemetry: TelemetryClient = { snapshot: async () => null };

export async function makeApp(telemetry: TelemetryClient = noTelemetry) {
  const repository = fakeRepository();
  const app = await buildApp({
    config: { logLevel: 'silent', rateLimitMax: 1000 },
    repository,
    telemetry,
  });
  return { app, repository };
}
