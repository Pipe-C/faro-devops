import type { Signal, StatusResponse } from './types';

/**
 * Error de la API. `httpStatus === 0` significa que la petición ni siquiera
 * llegó a un servidor (red caída, proxy apagado); cualquier otro valor indica
 * que el proxy sí respondió.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('No se pudo conectar con el servidor.', 0);
  }
  if (!res.ok) {
    // La API devuelve { message } en español; si no es JSON (p. ej. un 502 de Nginx) se usa un texto genérico.
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(body?.message ?? `El servidor respondió con el estado ${res.status}.`, res.status);
  }
  return (await res.json()) as T;
}

export const getStatus = (signal?: AbortSignal) => request<StatusResponse>('/api/status', { signal });

export const getSignals = async (signal?: AbortSignal) =>
  (await request<{ signals: Signal[] }>('/api/signals', { signal })).signals;

export const postSignal = async (message: string) =>
  (
    await request<{ signal: Signal }>('/api/signals', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message }),
    })
  ).signal;
