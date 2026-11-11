import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export interface Signal {
  id: number;
  message: string;
  createdAt: string; // ISO 8601 en UTC
}

/**
 * Contrato de persistencia. Las rutas dependen de esta interfaz y no de MySQL,
 * lo que permite probarlas con un repositorio en memoria.
 */
export interface SignalRepository {
  list(limit: number): Promise<Signal[]>;
  create(message: string): Promise<Signal>;
  /** Ejecuta `SELECT 1` y devuelve la latencia en milisegundos. */
  ping(): Promise<number>;
}

interface SignalRow extends RowDataPacket {
  id: number;
  message: string;
  created_at: Date;
}

const toSignal = (row: SignalRow): Signal => ({
  id: row.id,
  message: row.message,
  createdAt: row.created_at.toISOString(),
});

export function createMysqlSignalRepository(pool: Pool): SignalRepository {
  return {
    async list(limit) {
      // Consultas preparadas: el contenido del usuario nunca se concatena al SQL.
      const [rows] = await pool.execute<SignalRow[]>(
        'SELECT id, message, created_at FROM signals ORDER BY id DESC LIMIT ?',
        [String(limit)],
      );
      return rows.map(toSignal);
    },

    async create(message) {
      const [result] = await pool.execute<ResultSetHeader>(
        'INSERT INTO signals (message) VALUES (?)',
        [message],
      );
      const [rows] = await pool.execute<SignalRow[]>(
        'SELECT id, message, created_at FROM signals WHERE id = ?',
        [result.insertId],
      );
      const row = rows[0];
      if (!row) throw new Error('La señal insertada no se pudo leer');
      return toSignal(row);
    },

    async ping() {
      const start = performance.now();
      await pool.query('SELECT 1');
      return performance.now() - start;
    },
  };
}
