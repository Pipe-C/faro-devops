import { z } from 'zod';

/**
 * El sentinel (Python) responde en snake_case. Este módulo es la capa
 * anticorrupción: valida la respuesta y la traduce al contrato camelCase de
 * la API, de modo que el frontend no depende del formato del sentinel.
 */
const sentinelSchema = z.object({
  updated_at: z.string(),
  interval_seconds: z.number(),
  history: z.array(
    z.object({ at: z.string(), up: z.boolean(), latency_ms: z.number().nullable() }),
  ),
  certificate: z
    .object({
      days_remaining: z.number(),
      not_after: z.string(),
      subject: z.string(),
    })
    .nullable(),
});

export interface Telemetry {
  updatedAt: string;
  intervalSeconds: number;
  history: { at: string; up: boolean; latencyMs: number | null }[];
  certificate: { daysRemaining: number; notAfter: string; subject: string } | null;
}

export interface TelemetryClient {
  /** Devuelve `null` si el sentinel no responde: la telemetría es opcional. */
  snapshot(): Promise<Telemetry | null>;
}

export function createTelemetryClient(
  baseUrl: string,
  { timeoutMs = 1500, fetchImpl = fetch }: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): TelemetryClient {
  return {
    async snapshot() {
      try {
        const res = await fetchImpl(new URL('/snapshot', baseUrl), {
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return null;
        const data = sentinelSchema.parse(await res.json());
        return {
          updatedAt: data.updated_at,
          intervalSeconds: data.interval_seconds,
          history: data.history.map((h) => ({ at: h.at, up: h.up, latencyMs: h.latency_ms })),
          certificate: data.certificate && {
            daysRemaining: data.certificate.days_remaining,
            notAfter: data.certificate.not_after,
            subject: data.certificate.subject,
          },
        };
      } catch {
        return null;
      }
    },
  };
}
