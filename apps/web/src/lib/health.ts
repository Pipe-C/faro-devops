import type { StatusResponse } from '../api/types';
import { formatMs } from './format';

/** Lógica pura de presentación del estado: sin React, fácil de probar. */
export type Phase = 'loading' | 'ok' | 'degraded' | 'unreachable';
export type LayerState = 'ok' | 'down' | 'unknown';

export interface Layer {
  id: 'proxy' | 'web' | 'api' | 'database';
  name: string;
  role: string;
  state: LayerState;
  detail: string;
}

export interface Observation {
  status?: StatusResponse | undefined;
  /** Presente cuando la última consulta falló. `httpStatus` 0 = sin conexión. */
  failure?: { httpStatus: number } | undefined;
}

export function derivePhase({ status, failure }: Observation): Phase {
  // Un fallo reciente manda sobre los datos antiguos: no se muestra "todo bien" con información vieja.
  if (failure) return 'unreachable';
  if (!status) return 'loading';
  return status.database.status === 'ok' ? 'ok' : 'degraded';
}

const DETAIL: Record<LayerState, string> = { ok: 'Responde', down: 'Sin respuesta', unknown: 'Sin datos' };

/**
 * Cada capa se infiere de la propia petición: si la respuesta llegó, el proxy
 * la enrutó; si la interfaz cargó, la web responde; el resto lo informa la API.
 */
export function buildLayers(obs: Observation): Layer[] {
  const phase = derivePhase(obs);
  const answeredByProxy = obs.failure ? obs.failure.httpStatus > 0 : phase !== 'loading';
  const noConnection = obs.failure?.httpStatus === 0;

  const proxy: LayerState = noConnection ? 'down' : answeredByProxy ? 'ok' : 'unknown';
  const api: LayerState =
    phase === 'ok' || phase === 'degraded' ? 'ok' : phase === 'unreachable' && answeredByProxy ? 'down' : 'unknown';
  const db: LayerState = phase === 'ok' ? 'ok' : phase === 'degraded' ? 'down' : 'unknown';
  const dbMs = obs.status?.database.latencyMs;

  return [
    { id: 'proxy', name: 'Proxy', role: 'Termina TLS y limita peticiones', state: proxy, detail: DETAIL[proxy] },
    { id: 'web', name: 'Web', role: 'Sirve esta interfaz', state: 'ok', detail: DETAIL.ok },
    { id: 'api', name: 'API', role: 'Valida y registra señales', state: api, detail: DETAIL[api] },
    {
      id: 'database',
      name: 'Base de datos',
      role: 'Guarda la bitácora',
      state: db,
      detail: db === 'ok' && dbMs != null ? `Responde en ${formatMs(dbMs)}` : DETAIL[db],
    },
  ];
}

export function headline(phase: Phase, layers: Layer[]): string {
  switch (phase) {
    case 'loading':
      return 'Comprobando el recorrido…';
    case 'ok':
      return 'Todo el recorrido responde.';
    case 'degraded':
      return 'La base de datos no responde.';
    case 'unreachable':
      return layers.find((l) => l.id === 'proxy')?.state === 'down'
        ? 'No hay conexión con el proxy.'
        : 'La API no responde.';
  }
}

export function explanation(phase: Phase, agoText: string): string {
  switch (phase) {
    case 'loading':
      return 'Enviando la primera consulta de estado.';
    case 'ok':
      return `Proxy, web, API y base de datos respondieron ${agoText}.`;
    case 'degraded':
      return 'La API recibe peticiones, pero no logra consultar MySQL. Revisa los registros del contenedor db.';
    case 'unreachable':
      return 'La consulta de estado falló. Se reintenta automáticamente cada 5 segundos.';
  }
}
