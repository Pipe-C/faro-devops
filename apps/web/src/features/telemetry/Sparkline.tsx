import { formatMs } from '../../lib/format';

const WIDTH = 240;
const HEIGHT = 64;
const PAD = 6;

interface Props {
  values: (number | null)[];
}

/** Línea de latencia en SVG puro (sin librerías de gráficos). Los huecos (null) cortan la línea. */
export function Sparkline({ values }: Props) {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length < 2) return <p className="telemetry__empty">Reuniendo muestras de latencia…</p>;

  const max = Math.max(...nums, 1);
  const step = WIDTH / (values.length - 1);
  const y = (v: number) => HEIGHT - PAD - (v / max) * (HEIGHT - PAD * 2);

  // Un trazo "M…L…" por tramo continuo de muestras válidas.
  let path = '';
  let open = false;
  values.forEach((v, i) => {
    if (v === null) {
      open = false;
      return;
    }
    path += `${open ? 'L' : 'M'}${(i * step).toFixed(1)} ${y(v).toFixed(1)} `;
    open = true;
  });

  const lastIndex = values.findLastIndex((v) => v !== null);
  const last = values[lastIndex] as number;
  const label = `Latencia de la API: mínimo ${formatMs(Math.min(...nums))}, máximo ${formatMs(Math.max(...nums))}, última ${formatMs(last)}.`;

  return (
    <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <path className="sparkline__line" d={path.trim()} vectorEffect="non-scaling-stroke" />
      <circle className="sparkline__dot" cx={lastIndex * step} cy={y(last)} r={4} />
    </svg>
  );
}
