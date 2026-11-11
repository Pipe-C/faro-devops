import { useEffect, useState } from 'react';

/** Reloj reactivo: re-renderiza cada `intervalMs` para mantener vivos los "hace 5 s". */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
