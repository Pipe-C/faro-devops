import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';
import { createMysqlSignalRepository } from './repositories/signals.js';
import { createTelemetryClient } from './services/telemetry.js';

const config = loadConfig();
const pool = createPool(config.db);

const app = await buildApp({
  config,
  repository: createMysqlSignalRepository(pool),
  telemetry: createTelemetryClient(config.sentinelUrl),
});

// Apagado ordenado: Docker envía SIGTERM; se dejan terminar las peticiones en
// curso y se cierran las conexiones antes de salir.
const shutdown = async (signal: string) => {
  app.log.info({ signal }, 'apagando');
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

await app.listen({ host: '0.0.0.0', port: config.port });
