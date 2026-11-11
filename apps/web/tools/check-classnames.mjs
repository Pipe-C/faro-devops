#!/usr/bin/env node
/**
 * Garantiza la separación diseño/código:
 *  1. Todo `className` en .tsx debe ser un literal de texto (nada dinámico).
 *  2. Cada clase usada debe estar definida en src/styles (así se detectan
 *     utilidades de Tailwind escritas a mano en el JSX y también errores de tipeo).
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../src/', import.meta.url).pathname;

function walk(dir, ext) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, ext) : path.endsWith(ext) ? [path] : [];
  });
}

// 1) Clases definidas en el CSS (se ignoran comentarios y líneas @apply).
const defined = new Set();
for (const file of walk(join(root, 'styles'), '.css')) {
  const css = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@apply[^;]*;/g, '');
  for (const [, name] of css.matchAll(/\.([a-zA-Z_][\w-]*)/g)) defined.add(name);
}

// 2) Clases usadas en el JSX.
const errors = [];
for (const file of walk(root, '.tsx')) {
  const source = readFileSync(file, 'utf8');
  const where = relative(root, file);

  for (const [, rest] of source.matchAll(/className=(.{0,60})/g)) {
    if (!rest.startsWith('"')) errors.push(`${where}: className debe ser un literal de texto, encontrado «${rest.slice(0, 30)}»`);
  }
  for (const [, value] of source.matchAll(/className="([^"]*)"/g)) {
    for (const token of value.split(/\s+/).filter(Boolean)) {
      if (!defined.has(token)) errors.push(`${where}: la clase «${token}» no existe en src/styles (¿utilidad de Tailwind en el JSX?)`);
    }
  }
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ Diseño separado del código: ${defined.size} clases definidas, ninguna utilidad en los .tsx`);
