import type { StatusResponse } from '../../api/types';
import { formatDuration, formatMs } from '../../lib/format';
import type { Phase } from '../../lib/health';
import { Sparkline } from './Sparkline';

const CERT_WARNING_DAYS = 14;

function certificateText(days: number): string {
  if (days < 0) return 'Vencido: renuévalo ya';
  if (days < CERT_WARNING_DAYS) return `Vence en ${Math.floor(days)} días: renuévalo pronto`;
  return `Vence en ${Math.floor(days)} días`;
}

export function Telemetry({ status, phase }: { status: StatusResponse | undefined; phase: Phase }) {
  const telemetry = status?.telemetry ?? null;
  const lastSample = telemetry?.history.findLast((s) => s.latencyMs !== null);

  return (
    <section className="telemetry" aria-labelledby="telemetry-title">
      <h2 id="telemetry-title" className="section-title">
        Telemetría del sentinel
      </h2>
      {telemetry === null ? (
        <p className="telemetry__empty">
          {phase === 'loading'
            ? 'Esperando la primera lectura…'
            : 'El sentinel no está reportando datos. Revisa su contenedor con make logs.'}
        </p>
      ) : (
        <div className="telemetry__body">
          <div>
            <Sparkline values={telemetry.history.map((s) => s.latencyMs)} />
            <p className="telemetry__caption">
              Latencia de la API en los últimos {formatDuration(telemetry.history.length * telemetry.intervalSeconds)}.
            </p>
          </div>
          <dl className="telemetry__facts">
            <div className="telemetry__fact">
              <dt className="telemetry__label">Latencia actual de la API</dt>
              <dd className="telemetry__value">{lastSample?.latencyMs != null ? formatMs(lastSample.latencyMs) : 'Sin datos'}</dd>
            </div>
            <div className="telemetry__fact">
              <dt className="telemetry__label">Certificado TLS</dt>
              <dd
                className="telemetry__value"
                data-tone={telemetry.certificate && telemetry.certificate.daysRemaining < CERT_WARNING_DAYS ? 'warn' : 'normal'}
              >
                {telemetry.certificate ? certificateText(telemetry.certificate.daysRemaining) : 'Sin certificado'}
              </dd>
            </div>
            <div className="telemetry__fact">
              <dt className="telemetry__label">API activa desde hace</dt>
              <dd className="telemetry__value">{status ? formatDuration(status.api.uptimeSeconds) : '—'}</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  );
}
