# AGENTS.md

> El historial completo de la auditoría y refactorización (decisiones, pendientes
> y estado de git) está en **`DOCUMENTACION.md`**. Léelo antes de cambios grandes.

## Qué es

2048 estático (HTML + CSS + JS vanilla, **sin frameworks ni build de producción**).
Los módulos ES se sirven por HTTP: abrir `index.html` con `file://` **no funciona**.

- `index.html` — marcado, meta tags y accesibilidad; carga `game.js` como `<script type="module">`.
- `game-core.js` — lógica pura del juego: recibe datos y devuelve datos. **Sin DOM,
  sin localStorage, sin eventos.** Toda regla nueva va aquí.
- `game.js` — capa UI: entradas, render, overlays, power-ups, persistencia.
  Importa `game-core.js` y exporta los comandos (`mover`, `deshacer`, `toggleBomba`,
  `nuevaPartida`, `mostrarVictoria`, `mostrarGameOver`) que usan los tests de flujo.
- `style.css` — temas y layout.

## Comandos

```bash
npm install     # dependencias SOLO de desarrollo (Vitest, jsdom, ESLint)
npm test        # todos los tests (Vitest)
npm run lint    # ESLint
npm start       # servidor estático propio (scripts/servidor.mjs, sin deps) → http://localhost:8000
                # alternativas: python -m http.server 8000 · npx serve .
```

Orden recomendado antes de commit: `npm run lint` → `npm test`.
CI (`.github/workflows/ci.yml`) ejecuta exactamente esos dos pasos en push y PR.

## Tests

- `tests/game-core.test.js` — reglas puras (nodo, sin DOM).
- `tests/flujo.test.js` — flujos de UI con jsdom, incluidos los tests de regresión
  de los bugs P1 (entrada bloqueada tras la bienvenida; deshacer cierra el overlay).
- `tests/markup.test.js` — arranca `game.js` contra el `index.html` REAL y valida
  que todos los ids que consulta existen (evita deriva entre fixture y markup).
- `tests/persistencia.test.js` — récord y tema en `localStorage` (jsdom).
- `tests/setup.js` crea el DOM de arranque y **mockea `Math.random` a 0**: en tests
  de UI el tablero inicial es siempre `[[2,2,0,0], ...]` y `mover("left")` produce
  `[[4,2,0,0], ...]` con 4 puntos (2 celdas: la fusión resta una y el spawn añade otra).

## Convenciones del repo

- Comentarios, UI, mensajes y commits en **español**; commits sin prefijo
  conventional-commits.

## Hechos no obvios del código

- **`file://` no funciona** (los módulos ES están bloqueados por CORS): `index.html`
  detecta `location.protocol === "file:"` con un script *clásico* (sí se ejecuta
  en `file://`) y muestra el aviso `#aviso-file` con las instrucciones. No quitar
  ese aviso: sin él la página queda muerta en silencio.
- **Modal centralizado**: `hayModalAbierto()` (en `game.js`) es el único punto que
  decide si la entrada está bloqueada; la consultan `mover()` (teclado y swipe) y
  `toggleBomba()`. No repetir esta lógica en cada listener.
- **Deshacer con overlay abierto** (decisión de diseño): restaurar la partida cierra
  el overlay de fin revalidando `esGameOver`. No "arreglarlo" deshabilitando el
  deshacer en fin de partida.
- **La bomba NO entra en el historial de deshacer** (recurso consumible). Decisión
  de producto documentada en `game.js`; no cambiarla sin acordarlo.
- **Persistencia**: una sola clave `localStorage["stats2048"]` con `{ record, tema }`
  vía `leerStats/guardarStats`. El récord se guarda en `actualizarRecord()`, llamada
  desde `mover()` — **`render()` no persiste nada** (no reintroducir ese efecto).
- **Temas en CSS**: `:root` es oscuro por defecto; `@media (prefers-color-scheme:
  light) :root:not([data-theme])` evita el FOUC antes de que JS fije `data-theme`;
  `:root[data-theme="light"]` es el claro forzado. El bloque dark explícito se
  eliminó por ser idéntico a `:root`. Si cambias un color del tema claro, tócalo en
  **ambos** bloques claros.
- **Movimiento**: solo "left" está implementado; las otras direcciones se componen
  con `transponer()`/`invertirFilas()` en `game-core.js`.
- **Algoritmo intacto**: `comprimir`, fusión sin cadena, render reconstruyendo las
  16 celdas, `dvh` en el layout y `passive: false` en `touchmove` (obligatorio:
  sin él `preventDefault()` se ignora).
