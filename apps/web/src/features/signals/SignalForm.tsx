import { useId, useState, type FormEvent } from 'react';
import { postSignal } from '../../api/client';

const MAX_LENGTH = 255;
type Phase = 'idle' | 'sending' | 'sent' | 'error';

export function SignalForm({ onSent }: { onSent: () => void }) {
  const id = useId();
  const [message, setMessage] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Validación en el cliente solo por comodidad; la API valida de nuevo y es la que manda.
    if (!message.trim()) {
      setError('Escribe un mensaje antes de enviar la señal.');
      setPhase('error');
      return;
    }
    setPhase('sending');
    try {
      await postSignal(message);
      setMessage('');
      setPhase('sent');
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo enviar la señal.');
      setPhase('error');
    }
  }

  return (
    <section className="signal" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="section-title">
        Enviar una señal
      </h2>
      <p className="section-lead">
        El mensaje atraviesa el proxy y la API, y queda guardado en el volumen de MySQL: sobrevive a un
        reinicio de los contenedores.
      </p>
      <form className="signal__form" onSubmit={handleSubmit} noValidate>
        <label className="field__label" htmlFor={`${id}-message`}>
          Mensaje de la señal
        </label>
        <textarea
          id={`${id}-message`}
          className="field__control"
          rows={3}
          maxLength={MAX_LENGTH}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-describedby={`${id}-count ${id}-feedback`}
        />
        <div className="signal__footer">
          <span id={`${id}-count`} className="signal__count">
            {message.length}/{MAX_LENGTH}
          </span>
          <button type="submit" className="button" disabled={phase === 'sending'}>
            {phase === 'sending' ? 'Enviando…' : 'Enviar señal'}
          </button>
        </div>
        <p id={`${id}-feedback`} className="signal__feedback" data-phase={phase} role="status">
          {phase === 'sent' && 'Señal guardada en la bitácora.'}
          {phase === 'error' && error}
        </p>
      </form>
    </section>
  );
}
