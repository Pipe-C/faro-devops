import type { Layer } from '../../lib/health';

interface Props {
  layers: Layer[];
  /** Al cambiar, el haz de luz vuelve a recorrer el trayecto (ver route.css). */
  pulse: number;
}

export function RouteMap({ layers, pulse }: Props) {
  return (
    <section className="route" aria-labelledby="route-title">
      <h2 id="route-title" className="visually-hidden">
        Recorrido de una petición
      </h2>
      <ol className="route__list">
        {layers.map((layer) => (
          <li key={layer.id} className="route__stop" data-state={layer.state}>
            <span className="route__node" aria-hidden="true" />
            <span className="route__name">{layer.name}</span>
            <span className="route__role">{layer.role}</span>
            <span className="route__detail">{layer.detail}</span>
          </li>
        ))}
      </ol>
      {/* `key` fuerza a React a remontar el elemento y, con ello, a reiniciar la animación CSS. */}
      {pulse > 0 && <span key={pulse} className="route__beam" aria-hidden="true" />}
    </section>
  );
}
