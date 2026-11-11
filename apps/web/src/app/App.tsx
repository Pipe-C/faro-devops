import { useEffect, useRef, useState } from 'react';
import { ApiError, getSignals, getStatus } from '../api/client';
import { SignalForm } from '../features/signals/SignalForm';
import { SignalLog } from '../features/signals/SignalLog';
import { RouteMap } from '../features/status/RouteMap';
import { StatusHero } from '../features/status/StatusHero';
import { Telemetry } from '../features/telemetry/Telemetry';
import { usePolling } from '../hooks/usePolling';
import { useNow } from '../hooks/useNow';
import { buildLayers, derivePhase } from '../lib/health';
import { Masthead } from './Masthead';

const STATUS_INTERVAL_MS = 5_000;
const SIGNALS_INTERVAL_MS = 15_000;

export function App() {
  const status = usePolling(getStatus, STATUS_INTERVAL_MS);
  const signals = usePolling(getSignals, SIGNALS_INTERVAL_MS);
  const now = useNow();

  // Cada incremento de `pulse` relanza la animación del haz que recorre las capas.
  const [pulse, setPulse] = useState(0);
  const announcedFirstLoad = useRef(false);
  useEffect(() => {
    if (status.data && !announcedFirstLoad.current) {
      announcedFirstLoad.current = true;
      setPulse((n) => n + 1);
    }
  }, [status.data]);

  const failure = status.error
    ? { httpStatus: status.error instanceof ApiError ? status.error.httpStatus : 0 }
    : undefined;
  const observation = { status: status.data, failure };
  const phase = derivePhase(observation);
  const layers = buildLayers(observation);

  const handleSignalSent = () => {
    signals.refresh();
    status.refresh();
    setPulse((n) => n + 1);
  };

  return (
    <div className="shell">
      <Masthead />
      <main className="page">
        <StatusHero phase={phase} layers={layers} agoMs={status.updatedAt ? now - status.updatedAt : 0} />
        <RouteMap layers={layers} pulse={pulse} />
        <div className="workbench">
          <SignalForm onSent={handleSignalSent} />
          <SignalLog signals={signals.data} failed={Boolean(signals.error)} />
        </div>
        <Telemetry status={status.data} phase={phase} />
      </main>
      <footer className="footer">
        <p>
          Las métricas completas están en Grafana, accesible solo desde la VPN. Consulta el README para
          conectar un cliente WireGuard.
        </p>
      </footer>
    </div>
  );
}
