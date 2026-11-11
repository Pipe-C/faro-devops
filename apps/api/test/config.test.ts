import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('lee la contraseña desde un archivo y la recorta', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'faro-')), 'db_password');
    writeFileSync(file, 's3creto\n');
    expect(loadConfig({ DB_PASSWORD_FILE: file }).db.password).toBe('s3creto');
  });

  it('falla si no hay ninguna contraseña', () => {
    expect(() => loadConfig({})).toThrow(/DB_PASSWORD/);
  });

  it('falla con un puerto inválido', () => {
    expect(() => loadConfig({ DB_PASSWORD: 'x', PORT: '99999' })).toThrow(/PORT/);
  });
});
