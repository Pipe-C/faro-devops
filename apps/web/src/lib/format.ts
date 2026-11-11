const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const dateTime = new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'medium' });

/** "hace 5 segundos", "hace 2 minutos"… a partir de una diferencia en milisegundos. */
export function formatAgo(diffMs: number): string {
  const s = Math.max(0, Math.round(diffMs / 1000));
  if (s < 2) return 'ahora mismo';
  if (s < 60) return rtf.format(-s, 'second');
  if (s < 3600) return rtf.format(-Math.floor(s / 60), 'minute');
  return rtf.format(-Math.floor(s / 3600), 'hour');
}

/** 7385 → "2 h 3 min"; 45 → "45 s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

export const formatMs = (ms: number): string => `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;

export const formatDateTime = (iso: string): string => dateTime.format(new Date(iso));
