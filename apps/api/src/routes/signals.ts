import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SignalRepository } from '../repositories/signals.js';

// Rechaza caracteres de control (salvo que sean espacios normales): evita
// registros ilegibles o intentos de inyección en logs.
const hasNoControlChars = (s: string) => !/[\u0000-\u001F\u007F]/.test(s);

const createSignalSchema = z.object({
  message: z
    .string({ error: 'El mensaje es obligatorio.' })
    .trim()
    .min(1, 'Escribe un mensaje antes de enviar la señal.')
    .max(255, 'El mensaje admite como máximo 255 caracteres.')
    .refine(hasNoControlChars, 'El mensaje no puede contener caracteres de control.'),
});

export function signalRoutes(app: FastifyInstance, repo: SignalRepository): void {
  app.get('/api/signals', async () => ({ signals: await repo.list(20) }));

  app.post(
    '/api/signals',
    // Escritura: límite más estricto que el global para frenar abusos.
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const parsed = createSignalSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_request',
          message: parsed.error.issues[0]?.message ?? 'Petición inválida.',
        });
      }
      const signal = await repo.create(parsed.data.message);
      app.signalsCreated.inc();
      return reply.code(201).send({ signal });
    },
  );
}
