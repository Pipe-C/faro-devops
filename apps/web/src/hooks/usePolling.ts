import { useCallback, useEffect, useRef, useState } from 'react';

export interface PollingState<T> {
  data: T | undefined;
  error: Error | undefined;
  /** Marca de tiempo (ms) de la última respuesta correcta. */
  updatedAt: number | undefined;
  refresh: () => void;
}

/**
 * Consulta periódica con tres cuidados: cancela la petición en vuelo al
 * desmontar, se pausa con la pestaña oculta y nunca solapa dos peticiones.
 */
export function usePolling<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
): PollingState<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error>();
  const [updatedAt, setUpdatedAt] = useState<number>();
  const [tick, setTick] = useState(0);

  // El fetcher se guarda en una ref: cambiar su identidad no reinicia el ciclo.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      if (document.hidden) {
        timer = setTimeout(run, intervalMs);
        return;
      }
      try {
        const result = await fetcherRef.current(controller.signal);
        setData(result);
        setError(undefined);
        setUpdatedAt(Date.now());
      } catch (e) {
        if (controller.signal.aborted) return;
        setError(e instanceof Error ? e : new Error(String(e)));
      }
      if (!controller.signal.aborted) timer = setTimeout(run, intervalMs);
    };

    void run();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [intervalMs, tick]);

  const refresh = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, updatedAt, refresh };
}
