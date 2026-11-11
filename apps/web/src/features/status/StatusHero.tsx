import { formatAgo } from '../../lib/format';
import { explanation, headline, type Layer, type Phase } from '../../lib/health';

interface Props {
  phase: Phase;
  layers: Layer[];
  agoMs: number;
}

export function StatusHero({ phase, layers, agoMs }: Props) {
  return (
    <section className="hero" data-phase={phase} aria-labelledby="hero-title">
      <h1 id="hero-title" className="hero__title">
        {headline(phase, layers)}
      </h1>
      <p className="hero__text" role="status">
        {explanation(phase, formatAgo(agoMs))}
      </p>
    </section>
  );
}
