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
  Importa `game-core.js` y `game-fx.js` y exporta los comandos (`mover`,
  `deshacer`, `toggleBomba`, `nuevaPartida`, `mostrarVictoria`, `mostrarGameOver`,
  `restaurarPartida`) que usan los tests de flujo.
- `game-fx.js` — capa de efectos y feedback: slide/pop/fantasmas, puntos
  flotantes `+N`, sonido Web Audio y háptica. Recibe la `traza` de
  `game-core.js` y **sus nodos FX nuevos viven SOLO en `#fx-layer`** (fuera de
  `#board`); lo único que pinta dentro de `#board` son efectos sobre los 16
  slots ya existentes — el pop añade la clase `.fusionando` a la `.cell`
  destino y el slide escribe `transform`/`transition` inline en su `.tile` —
  sin crear nunca un nodo nuevo ahí. Sin estado del juego.
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

- `tests/game-core.test.js` — reglas puras (nodo, sin DOM), incluidas la `traza`
  de animación y `esPartidaValida()`.
- `tests/flujo.test.js` — flujos de UI con jsdom, incluidos los tests de regresión
  de los bugs P1 (entrada bloqueada tras la bienvenida; deshacer cierra el overlay).
- `tests/markup.test.js` — arranca `game.js` contra el `index.html` REAL y valida
  que todos los ids que consulta existen (evita deriva entre fixture y markup).
- `tests/persistencia.test.js` — récord y tema en `localStorage` (jsdom).
- `tests/animacion.test.js` — reconciliador de `render()` (identidad de nodos),
  capa `#fx-layer` (slide, fantasmas, pop, guards), overlay de fin diferido y
  flotantes `+N`.
- `tests/feedback.test.js` — interruptor `#fx-toggle` (sonido + háptica) y
  `stats2048.fxActivo` escrito solo al pulsarlo.
- `tests/restauracion.test.js` — clave `partida2048`: guardar, restaurar,
  borrar, claves inválidas y `stats2048` sin contaminar.
- `tests/arranque.test.js` — arranque con partida guardada (import dinámico de
  `game.js` como única importación del archivo).
- `tests/integracion.test.js` — batería de regresión del contrato: 16 hijos en
  `#board` siempre, FX fuera del tablero, claves aisladas, guards sin
  `AudioContext`/`vibrate`/`element.animate`, `prefers-reduced-motion` y el
  ciclo completo mover → deshacer → nueva partida → restaurar.
- `tests/setup.js` crea el DOM de arranque y **mockea `Math.random` a 0**: en tests
  de UI el tablero inicial es siempre `[[2,2,0,0], ...]` y `mover("left")` produce
  `[[4,2,0,0], ...]` con 4 puntos (2 celdas: la fusión resta una y el spawn añade otra).

Total: **142 tests en 9 ficheros** (`npm test` debe dar todo en verde).

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
  `toggleBomba()`. No repetir esta lógica en cada listener. **Única excepción
  (fase 05-fix)**: `toggleBomba()` comprueba además `timerOverlayFin !== null`
  para no operar dentro de la ventana de 260 ms del overlay de fin pendiente
  (en esa ventana `hayModalAbierto()` es `false` pero el estado ya dice fin de
  partida — enmienda de la decisión 11).
- **Deshacer con overlay abierto** (decisión de diseño): restaurar la partida cierra
  el overlay de fin revalidando `esGameOver`. No "arreglarlo" deshabilitando el
  deshacer en fin de partida.
- **La bomba NO entra en el historial de deshacer** (recurso consumible). Decisión
  de producto documentada en `game.js`; no cambiarla sin acordarlo.
- **Persistencia (DOS claves)**: `localStorage["stats2048"]` guarda
  `{ record, tema, fxActivo? }` vía `leerStats/guardarStats` (`fxActivo` solo
  se escribe al pulsar `#fx-toggle`) y `localStorage["partida2048"]` guarda la
  partida en curso. El récord se guarda en `actualizarRecord()`, llamada desde
  `mover()` — **`render()` no persiste nada** (no reintroducir ese efecto).
- **Partida en curso en `partida2048`**: esquema v1 `{ v, board, score,
  deshacerRestantes, bombasRestantes, victoriaAvisada, historial }` (con
  `historial`, si no el deshacer moriría al recargar). **El `historial` no
  tiene tope**: cada entrada (`{board, score}`) ocupa ~100-150 B, de modo que
  1000 movimientos quedan por debajo de ~200 KB frente a los ~5 MiB de cuota,
  y **la clave se borra al acabar la partida** (riesgo 14 documentado, no un
  creep silencioso). Se guarda en `mover()`
  (si hubo cambio), `deshacer()`, el handler de la bomba, `pagehide` y
  `visibilitychange` oculto; se **borra** en `nuevaPartida()` y al acabar la
  partida. Se restaura SOLO si `esPartidaValida()` (de `game-core.js`) la
  valida y no está bloqueada; si no, se borra y empieza partida nueva. Nunca
  `beforeunload`/`unload` y **sin diálogo de confirmación**.
- **`render()` reconcilia, no reconstruye**: `asegurarRejilla()` crea UNA sola
  vez las 16 `.cell` con su `.tile` persistente y a partir de ahí `render()`
  solo actualiza texto, `data-value`, `len3/len4` y `.nueva` (re-fire con
  reflow forzado). La rampa sigue en `.cell`, así que **cero selectores de
  `style.css` migrados** y `#board.children` sigue midiendo 16.
- **Animación = capa posterior, SIN lock de entrada**: estado y DOM se
  resuelven síncronos en `mover()`; solo después `game-fx.js` anima con
  `transform`. `limpiarFx()` al inicio de `mover()`, `deshacer()`,
  `nuevaPartida()` y del handler de bomba interrumpe el turno anterior (los
  timers viejos mueren por "generación"): no acumula nodos/listeners y
  **jamás difiere el estado** por animación.
- **Los `.cell` de `#fx-layer` son FANTASMAS temporales** (y los `+N` son
  `.fx-flotante`): la capa vive FUERA de `#board`, con `aria-hidden` y
  `pointer-events: none`, para no romper `textosCeldas()` ni la aritmética de
  la bomba. **Contar o medir celdas SIEMPRE dentro de `#board`**, nunca sobre
  `document` entero.
- **Interruptor único `#fx-toggle`** (`role="switch"` en `.actions`): gate
  maestro de sonido y háptica (`feedbackActivo` en `game-fx.js`), ON por
  defecto y **cero escrituras al arranque** (se preserva
  `expect(stats()).toBeNull()` de `persistencia.test.js`). `prefers-reduced-motion`
  gobierna SOLO las transformaciones visuales, no el feedback.
- **Overlay de fin diferido**: `DURACION_ANIMACION_FIN = 260` ms con
  `setTimeout` (nunca `transitionend`/`animationend`: no disparan en jsdom y
  convertirían los tests en espera eterna). El estado (`esGameOver`,
  `victoriaAvisada`) se aplica **síncrono**; el diálogo espera a que termine
  el slide/pop. El timer se cancela en `nuevaPartida()`, en `deshacer()`
  (**solo si restauró**: el guard `if (!resultado.restaurado) return` va
  antes) y en `restaurarPartida()`. Además, el callback **revalida** su
  condición antes de mostrar (`esGameOver(board)` / `victoriaAvisada &&
  hayVictoria(board)`): la ventana es solo cosmética, nunca concede un turno
  con un diálogo de fin pendiente (enmienda de la decisión 11, fase 05-fix).
- **Temas en CSS**: `:root` es oscuro por defecto; `@media (prefers-color-scheme:
  light) :root:not([data-theme])` evita el FOUC antes de que JS fije `data-theme`;
  `:root[data-theme="light"]` es el claro forzado. El bloque dark explícito se
  eliminó por ser idéntico a `:root`. Si cambias un color del tema claro, tócalo en
  **ambos** bloques claros.
- **Movimiento**: solo "left" está implementado; las otras direcciones se componen
  con `transponer()`/`invertirFilas()` en `game-core.js`.
- **`game-core.js` sigue PURO** (sin DOM, sin `localStorage`, sin eventos) y
  ahora exporta además `aplicarMovimiento().traza` (`{ movimientos, fusiones }`,
  campo aditivo con el que `game-fx.js` anima) y `esPartidaValida()` (valida la
  forma de `partida2048`; nunca lanza). Toda regla nueva sigue yendo ahí.
- **Algoritmo intacto**: el algoritmo de MOVIMIENTO no cambió — `comprimir`,
  fusión sin cadena, `dvh` en el layout y `passive: false` en `touchmove`
  (obligatorio: sin él `preventDefault()` se ignora). Lo que cambió es la
  representación DOM: `render()` **ya no reconstruye** las 16 celdas, las
  reconcilia con sus `.tile` persistentes (ver arriba) y la animación vive en
  `#fx-layer`, una capa aparte.
