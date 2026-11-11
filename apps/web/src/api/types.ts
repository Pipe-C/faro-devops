/** Contrato JSON de la API (camelCase). Mantener sincronizado con apps/api. */
export type Health = 'ok' | 'down';

export interface TelemetrySample {
  at: string;
  up: boolean;
  latencyMs: number | null;
}

export interface Telemetry {
  updatedAt: string;
  intervalSeconds: number;
  history: TelemetrySample[];
  certificate: { daysRemaining: number; notAfter: string; subject: string } | null;
}

export interface StatusResponse {
  generatedAt: string;
  api: { status: 'ok'; uptimeSeconds: number };
  database: { status: Health; latencyMs: number | null };
  telemetry: Telemetry | null;
}

export interface Signal {
  id: number;
  message: string;
  createdAt: string;
}
