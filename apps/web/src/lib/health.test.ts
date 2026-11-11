import { describe, expect, it } from 'vitest';
import type { StatusResponse } from '../api/types';
import { formatDuration } from './format';
import { buildLayers, derivePhase, headline } from './health';

const status = (db: 'ok' | 'down'): StatusResponse => ({
  generatedAt: '2026-11-05T10:00:00Z',
  api: { status: 'ok', uptimeSeconds: 10 },
  database: { status: db, latencyMs: db === 'ok' ? 2.5 : null },
  telemetry: null,
});

describe('derivePhase', () => {
  it('distingue las cuatro fases', () => {
    expect(derivePhase({})).toBe('loading');
    expect(derivePhase({ status: status('ok') })).toBe('ok');
    expect(derivePhase({ status: status('down') })).toBe('degraded');
    expect(derivePhase({ failure: { httpStatus: 502 } })).toBe('unreachable');
  });

  it('un fallo reciente prevalece sobre datos antiguos', () => {
    expect(derivePhase({ status: status('ok'), failure: { httpStatus: 0 } })).toBe('unreachable');
  });
});

describe('buildLayers', () => {
  const states = (obs: Parameters<typeof buildLayers>[0]) =>
    Object.fromEntries(buildLayers(obs).map((l) => [l.id, l.state]));

  it('todo operativo', () => {
    expect(states({ status: status('ok') })).toEqual({ proxy: 'ok', web: 'ok', api: 'ok', database: 'ok' });
  });

  it('BD caída: el resto responde', () => {
    expect(states({ status: status('down') })).toEqual({ proxy: 'ok', web: 'ok', api: 'ok', database: 'down' });
  });

  it('502 del proxy: la API es la que falla', () => {
    const obs = { failure: { httpStatus: 502 } };
    expect(states(obs)).toEqual({ proxy: 'ok', web: 'ok', api: 'down', database: 'unknown' });
    expect(headline('unreachable', buildLayers(obs))).toBe('La API no responde.');
  });

  it('sin conexión: se culpa al proxy', () => {
    const obs = { failure: { httpStatus: 0 } };
    expect(states(obs).proxy).toBe('down');
    expect(headline('unreachable', buildLayers(obs))).toBe('No hay conexión con el proxy.');
  });

  it('incluye la latencia de la BD en el detalle', () => {
    expect(buildLayers({ status: status('ok') }).at(-1)?.detail).toBe('Responde en 2.5 ms');
  });
});

describe('formatDuration', () => {
  it.each([
    [45, '45 s'],
    [125, '2 min'],
    [7385, '2 h 3 min'],
    [90000, '1 d 1 h'],
  ])('%s s → %s', (s, expected) => expect(formatDuration(s)).toBe(expected));
});
