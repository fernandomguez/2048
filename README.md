# 2048

El clásico juego **2048** en el navegador: desliza las fichas para fusionar
números hasta conseguir la ficha 2048. JavaScript vanilla, sin frameworks ni
build de producción.

## Funcionalidades

- Movimiento con **flechas del teclado** y **swipe** en móvil.
- **Deshacer** (3 usos) y **bomba** para eliminar una ficha (1 uso).
- Puntuación y **récord** guardados en `localStorage`.
- Tema **claro/oscuro** (sigue al sistema, con preferencia guardada).
- **Fichas animadas**: deslizamiento al mover, pop de fusión y rebote de la
  ficha nueva, con identidad de nodos (sin reconstruir el tablero).
- **Puntos flotantes** (`+4`, `+8`…) que suben sobre la celda fusionada.
- **Sonido y vibración** con interruptor (tonos sintetizados, sin archivos;
  la vibración solo funciona en navegadores con soporte).
- **Partida guardada automáticamente**: al recargar o volver atrás sigues
  donde estabas (tablero, puntos, deshacer y bombas).
- Pantalla de bienvenida, overlays de victoria y fin de partida.
- Diseño adaptado a móvil, escritorio y pantallas horizontales bajas.

## Cómo ejecutarlo

Es una aplicación estática, pero usa módulos ES (`type="module"`), así que
hay que servirla por HTTP. **No basta con doblear-clic en `index.html`**: el
navegador bloquea los módulos desde `file://` (si ocurre, el juego muestra un
aviso con estas instrucciones en lugar de arrancar).

```bash
npm start                          # servidor local incluido (sin dependencias)
```

Y abrir <http://localhost:8000>.

Alternativas sin `npm start`:

```bash
python -m http.server 8000   # o: npx serve .
```

## Desarrollo

```bash
npm install       # solo dependencias de desarrollo
npm test          # ejecuta los tests (Vitest)
npm run lint      # reviso de código (ESLint)
```

No hay build: los archivos de `game.js`, `game-core.js`, `game-fx.js`,
`style.css` e `index.html` se sirven tal cual.

## Estructura

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Marcado, meta tags y accesibilidad de los overlays |
| `game-core.js` | Lógica pura del juego (sin DOM ni localStorage) — testeada con Vitest |
| `game.js` | Capa UI: entradas, render, overlays, power-ups, persistencia |
| `game-fx.js` | Efectos: slide/pop/flotantes, sonido Web Audio y háptica (sin estado de juego) |
| `style.css` | Temas (claro/oscuro) y layout `dvh` |
| `tests/` | 9 suites: núcleo puro, flujos de UI (jsdom), markup real, persistencia, animación, feedback, restauración, arranque e integración |

## Tecnologías

- HTML + CSS + JavaScript vanilla (ES modules).
- Vitest + jsdom (tests), ESLint (lint) — todo en dependencias de desarrollo.
- GitHub Actions: lint y tests en cada push/PR.
