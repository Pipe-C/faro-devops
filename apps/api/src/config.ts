import { readFileSync } from 'node:fs';
import { z } from 'zod';

/**
 * Configuración tipada y validada al arrancar: si falta algo, el proceso falla
 * rápido con un mensaje claro en lugar de romperse a mitad de una petición.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DB_HOST: z.string().min(1).default('db'),
  DB_PORT: z.coerce.number().int().default(3306),
  DB_USER: z.string().min(1).default('faro'),
  DB_NAME: z.string().min(1).default('faro'),
  // El secreto se prefiere por archivo (Docker secrets); la variable directa
  // existe solo para desarrollo local.
  DB_PASSWORD: z.string().optional(),
  DB_PASSWORD_FILE: z.string().optional(),
  SENTINEL_URL: z.url().default('http://sentinel:9100'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: string;
  rateLimitMax: number;
  sentinelUrl: string;
  db: { host: string; port: number; user: string; password: string; database: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida → ${detail}`);
  }
  const e = parsed.data;

  const password = e.DB_PASSWORD_FILE
    ? readFileSync(e.DB_PASSWORD_FILE, 'utf8').trim()
    : e.DB_PASSWORD;
  if (!password) {
    throw new Error('Configuración inválida → define DB_PASSWORD_FILE (recomendado) o DB_PASSWORD');
  }

  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    rateLimitMax: e.RATE_LIMIT_MAX,
    sentinelUrl: e.SENTINEL_URL,
    db: { host: e.DB_HOST, port: e.DB_PORT, user: e.DB_USER, password, database: e.DB_NAME },
  };
}
