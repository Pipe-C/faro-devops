import type { Signal } from '../../api/types';
import { formatDateTime } from '../../lib/format';

interface Props {
  signals: Signal[] | undefined;
  failed: boolean;
}

export function SignalLog({ signals, failed }: Props) {
  return (
    <section className="log" aria-labelledby="log-title">
      <h2 id="log-title" className="section-title">
        Bitácora
      </h2>
      {signals === undefined ? (
        <p className="log__empty">{failed ? 'No se pudo leer la bitácora. Se reintentará en unos segundos.' : 'Cargando la bitácora…'}</p>
      ) : signals.length === 0 ? (
        <p className="log__empty">Aún no hay señales. Envía la primera y comprueba que llega a la base de datos.</p>
      ) : (
        <ol className="log__list">
          {signals.map((signal) => (
            <li key={signal.id} className="log__item">
              <time className="log__time" dateTime={signal.createdAt}>
                {formatDateTime(signal.createdAt)}
              </time>
              {/* React escapa el texto: un mensaje con HTML se muestra literal, no se ejecuta. */}
              <p className="log__message">{signal.message}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
