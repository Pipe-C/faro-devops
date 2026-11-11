import { describe, expect, it } from 'vitest';
import { createTelemetryClient } from '../src/services/telemetry.js';

const payload = {
  updated_at: '2026-11-05T10:00:00Z',
  interval_seconds: 10,
  history: [{ at: '2026-11-05T10:00:00Z', up: true, latency_ms: 3.5 }],
  certificate: { days_remaining: 30.5, not_after: '2026-12-05T00:00:00Z', subject: 'faro.localhost' },
};

const respond = (body: unknown, status = 200) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe('cliente de telemetría', () => {
  it('traduce snake_case a camelCase', async () => {
    const client = createTelemetryClient('http://sentinel:9100', { fetchImpl: respond(payload) });
    const t = await client.snapshot();
    expect(t?.history[0]).toEqual({ at: payload.history[0]!.at, up: true, latencyMs: 3.5 });
    expect(t?.certificate?.daysRemaining).toBe(30.5);
  });

  it.each([
    ['estado HTTP de error', respond({}, 500)],
    ['cuerpo con forma inesperada', respond({ foo: 1 })],
    ['fallo de red', (async () => { throw new Error('ECONNREFUSED'); }) as unknown as typeof fetch],
  ])('devuelve null ante %s', async (_name, fetchImpl) => {
    expect(await createTelemetryClient('http://sentinel:9100', { fetchImpl }).snapshot()).toBeNull();
  });
});
