import { afterEach, describe, expect, it } from 'vitest';
import { makeApp } from './helpers.js';

let closer: (() => Promise<unknown>) | undefined;
afterEach(async () => closer?.());

async function setup(...args: Parameters<typeof makeApp>) {
  const ctx = await makeApp(...args);
  closer = () => ctx.app.close();
  return ctx;
}

describe('salud', () => {
  it('live responde 200 aunque la BD esté caída', async () => {
    const { app, repository } = await setup();
    repository.dbDown = true;
    expect((await app.inject('/health/live')).statusCode).toBe(200);
  });

  it('ready responde 503 si la BD no responde', async () => {
    const { app, repository } = await setup();
    expect((await app.inject('/health/ready')).statusCode).toBe(200);
    repository.dbDown = true;
    expect((await app.inject('/health/ready')).statusCode).toBe(503);
  });
});

describe('GET /api/status', () => {
  it('reporta la BD operativa y telemetría nula si el sentinel no responde', async () => {
    const { app } = await setup();
    const body = (await app.inject('/api/status')).json();
    expect(body.database).toEqual({ status: 'ok', latencyMs: 1.23 });
    expect(body.api.status).toBe('ok');
    expect(body.telemetry).toBeNull();
  });

  it('marca la BD como caída sin devolver un error HTTP', async () => {
    const { app, repository } = await setup();
    repository.dbDown = true;
    const res = await app.inject('/api/status');
    expect(res.statusCode).toBe(200);
    expect(res.json().database).toEqual({ status: 'down', latencyMs: null });
  });

  it('incluye la telemetría cuando está disponible', async () => {
    const telemetry = { updatedAt: 'now', intervalSeconds: 10, history: [], certificate: null };
    const { app } = await setup({ snapshot: async () => telemetry });
    expect((await app.inject('/api/status')).json().telemetry).toEqual(telemetry);
  });
});

describe('señales', () => {
  it('crea y lista señales (la más reciente primero)', async () => {
    const { app } = await setup();
    await app.inject({ method: 'POST', url: '/api/signals', payload: { message: 'primera' } });
    const created = await app.inject({ method: 'POST', url: '/api/signals', payload: { message: '  segunda  ' } });
    expect(created.statusCode).toBe(201);
    expect(created.json().signal.message).toBe('segunda'); // se recorta el espacio sobrante

    const list = (await app.inject('/api/signals')).json().signals;
    expect(list.map((s: { message: string }) => s.message)).toEqual(['segunda', 'primera']);
  });

  it.each([
    ['vacío', { message: '   ' }],
    ['demasiado largo', { message: 'x'.repeat(256) }],
    ['con caracteres de control', { message: 'hola\u0000mundo' }],
    ['sin campo', {}],
    ['tipo incorrecto', { message: 42 }],
  ])('rechaza un mensaje %s con 400', async (_name, payload) => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/api/signals', payload });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_request');
  });
});

describe('seguridad y observabilidad', () => {
  it('envía cabeceras de seguridad', async () => {
    const { app } = await setup();
    const res = await app.inject('/health/live');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('expone métricas Prometheus con la ruta como plantilla', async () => {
    const { app } = await setup();
    await app.inject('/api/status');
    const text = (await app.inject('/metrics')).body;
    expect(text).toContain('http_request_duration_seconds_bucket');
    expect(text).toContain('route="/api/status"');
  });
});
