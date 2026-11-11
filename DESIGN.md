# Sistema de diseño: Faro

Dirección: **carta náutica vista de día**. Niebla fría, tinta azul marino y un único ámbar.

## Dónde vive cada cosa
| Capa | Ubicación |
|---|---|
| Tokens (color, tipografía, movimiento) | `apps/web/src/styles/tokens.css` |
| Estilos de base y accesibilidad | `apps/web/src/styles/base.css` |
| Estilos por componente (Tailwind `@apply`) | `apps/web/src/styles/components/*.css` |
| Marcado y comportamiento | `apps/web/src/**/*.tsx` (solo nombres de clase semánticos) |

`npm run lint:design` impide escribir utilidades de Tailwind en el JSX.

## Color (OKLCH)
| Token | Claro | Uso |
|---|---|---|
| `surface` | `oklch(97.5% .007 225)` | Fondo (niebla) |
| `ink` | `oklch(23% .045 245)` | Texto y trazos |
| `ink-soft` | `oklch(44% .035 245)` | Texto secundario (5,2:1) |
| `line` | `oklch(84% .02 235)` | Filetes |
| `signal` | `oklch(82% .165 82)` | Ámbar: haz, botón, selección |
| `ok` / `fail` | `oklch(45% .115 172)` / `oklch(47% .19 28)` | Estados, siempre con texto |

Existe variante oscura (`prefers-color-scheme`) con los mismos roles.

## Tipografía
Una sola familia, **Schibsted Grotesk** (variable, autoalojada vía `@fontsource-variable`).
El contraste sale del peso (800 en el titular, 400 en el cuerpo) y del tamaño, no de mezclar fuentes.
Cifras tabulares en todo el sitio. Cuerpo ≥ 16 px, líneas de ≤ 60 caracteres.

## Composición
- Alineación a la izquierda, sin tarjetas anidadas: las secciones se separan con espacio y filetes.
- Titular de estado (`text-display`) → recorrido de cuatro capas → dos columnas (formulario / bitácora) → telemetría.
- En móvil el recorrido pasa a vertical.

## Movimiento
Un solo gesto: el haz ámbar cruza el recorrido al cargar y al enviar una señal (1,6 s, ease-out expo,
sin rebote). Se desactiva con `prefers-reduced-motion`.

## Accesibilidad
Foco visible de 3 px, etiquetas siempre visibles, `role="status"` en mensajes dinámicos, estados con texto
además de color, objetivos táctiles ≥ 44 px.

## Control de calidad
`npx impeccable detect src/` (también en CI) busca los patrones de "diseño genérico de IA".
