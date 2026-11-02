# AGENTS.md

> El historial completo de la auditoría y refactorización (decisiones, pendientes
> y estado de git) está en **`docs/DOCUMENTACION.md`**. Léelo antes de cambios grandes.

## Qué es

Layout de carpetas (como Trazen): `js/` = módulos puros sin DOM, `app/` = UI y
efectos, `css/`, `tools/` = scripts de desarrollo, `docs/` = documentación.
En la raíz solo `index.html`, `manifest.json` y `sw.js` (el SW necesita el
scope raíz y su URL no debe cambiar).

2048 estático (HTML + CSS + JS vanilla, **sin frameworks ni build de producción**).
Los módulos ES se sirven por HTTP: abrir `index.html` con `file://` **no funciona**.

- `index.html` — marcado, meta tags y accesibilidad; carga `app/game.js` como `<script type="module">`.
- `js/game-core.js` — lógica pura del juego: recibe datos y devuelve datos. **Sin DOM,
  sin localStorage, sin eventos.** Toda regla nueva va aquí (incluidos
  `semillaDeFecha`/`siguienteRng` del reto diario,
  `calcularHitos`/`hitosAlcanzados` de los power-ups por hitos y
  `parsearCodigoJugada`/`reproducirSecuencia` del replay).
- `app/game.js` — capa UI: entradas, render, overlays, power-ups, persistencia,
  compartir (`obtenerSnapshot()`, `compartir()`, `DURACION_TOAST`) e
  instalación (evento `beforeinstallprompt`). Importa `js/game-core.js`,
  `app/game-fx.js` y `js/game-share.js` y exporta los comandos (`mover`, `deshacer`,
  `toggleBomba`, `nuevaPartida`, `mostrarVictoria`, `mostrarGameOver`,
  `restaurarPartida`, `reproducirJugada`, `pararReplay`,
  `INTERVALO_REPLAY`) que usan los tests de flujo.
- `app/game-fx.js` — capa de efectos y feedback: slide/pop/fantasmas, puntos
  flotantes `+N`, sonido Web Audio y háptica. Recibe la `traza` de
  `js/game-core.js` y **sus nodos FX nuevos viven SOLO en `#fx-layer`** (fuera de
  `#board`); lo único que pinta dentro de `#board` son efectos sobre los 16
  slots ya existentes — el pop añade la clase `.fusionando` a la `.cell`
  destino y el slide escribe `transform`/`transition` inline en su `.tile` —
  sin crear nunca un nodo nuevo ahí. Sin estado del juego.
- `js/game-share.js` — dibujo de la captura: `RAMPA`, `PALETAS`, `MEDIDAS_CAPTURA`
  y `dibujarCaptura()` (canvas 2D puro, **sin DOM ni localStorage**). `RAMPA` es
  la única rampa del proyecto: `tests/share.test.js` la contrasta con la de
  `css/style.css` para que no haya deriva entre CSS y captura.
- `manifest.json` — PWA: `start_url`/`scope` relativos y **2 iconos SVG**
  (`sizes: "any"`: `2048.svg` + `2048-maskable.svg`); no hay PNG 192/512
  (decisión D6) y el `og:image` 1200×630 vive en `icons/`, no en el manifest.
- `sw.js` — service worker `2048-v1`: **network-first** para documento, JS y
  CSS; **cache-first** para iconos, manifest e imágenes (ver "Hechos no
  obvios").
- `icons/` — 4 ficheros commiteados: `2048.svg`, `2048-maskable.svg` (manifest)
  y los PNG `apple-touch-icon-180.png` / `og-image-1200x630.png` (D1/D6).
- `tools/generar-iconos.mjs` + `tools/lib/ctx-software.mjs` — generan esos
  PNG **sin dependencias** (zlib nativo); solo se ejecutan a mano con
  `npm run iconos` (nunca en test ni en CI).
- `css/style.css` — temas y layout.

## Comandos

```bash
npm install     # dependencias SOLO de desarrollo (Vitest, jsdom, ESLint)
npm test        # todos los tests (Vitest)
npm run lint    # ESLint
npm start       # servidor estático propio (tools/servidor.mjs, sin deps) → http://localhost:8000
                # alternativas: python -m http.server 8000 · npx serve .
npm run iconos  # regenera icons/ desde tools/generar-iconos.mjs (SOLO desarrollo:
                # NO corre en test ni en CI; los PNG ya están commiteados)
```

Orden recomendado antes de commit: `npm run lint` → `npm test`.
CI (`.github/workflows/ci.yml`) ejecuta exactamente esos dos pasos en push y PR.

## Tests

- `tests/game-core.test.js` — reglas puras (nodo, sin DOM), incluidas la `traza`
  de animación y `esPartidaValida()`.
- `tests/flujo.test.js` — flujos de UI con jsdom, incluidos los tests de regresión
  de los bugs P1 (entrada bloqueada tras la bienvenida; deshacer cierra el overlay).
- `tests/markup.test.js` — arranca `app/game.js` contra el `index.html` REAL y valida
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
  `app/game.js` como única importación del archivo).
- `tests/integracion.test.js` — batería de regresión del contrato: 16 hijos en
  `#board` siempre, FX fuera del tablero, claves aisladas, guards sin
  `AudioContext`/`vibrate`/`element.animate`, `prefers-reduced-motion` y el
  ciclo completo mover → deshacer → nueva partida → restaurar.
- `tests/pwa.test.js` — PWA (entorno node): `manifest.json`, `sw.js`
  (precache, estrategias, `clients.claim()`, sin `skipWaiting`/`reload`),
  `index.html` (meta/manifest), `app/game.js` (registro del SW), iconos PNG reales
  (firma e IHDR), reglas CSS de `.icon-btn[hidden]`/`.tap-44`/`.toast[hidden]`,
  `eslint.config.js` (override de `sw.js`) y `package.json`/`ci.yml` (sin
  dependencias nuevas en CI).
- `tests/share.test.js` — compartir (entorno jsdom, **cabecera
  `// @vitest-environment jsdom`**): snapshot sin escrituras, cadena de
  fallback de `compartir()` sin Web Share (2 diálogos, sin `role="dialog"` de
  más), canvas desconectado, toast con fake timers, `AbortError` sin descarga,
  `beforeinstallprompt`, anti-deriva `RAMPA`↔`css/style.css`, `dibujarCaptura()`
  con un ctx stub y el botón "Compartir" **segundo** en los overlays de fin.
- `tests/hitos.test.js` — power-ups por hitos (D6/D8, sub-bloque 2a): regla
  pura en `js/game-core.js` (`calcularHitos`, `hitosAlcanzados`, umbrales
  validados por `esPartidaValida`) **y** su integración en la UI: concesión
  +1 deshacer al 128 / +1 bomba al 256 con su toast, idempotencia y backfill
  SIN conceder en guardados antiguos (regresión de `arranque.test.js`).
- `tests/reto.test.js` — reto diario (D5, sub-bloque 2a): `semillaDeFecha` y
  `siguienteRng` puros en `js/game-core.js` **y** la UI (`#daily`):
  restauración del reto al arrancar, `rngEstado` que avanza exactamente 2
  pasos por spawn (D7), mismo día ⇒ mismo tablero (`vi.useFakeTimers({ toFake:
  ["Date"] })`), otro día ⇒ otro tablero, salida a modo normal con
  `#new-game`, snapshot/compartir con fecha y `pagehide`.
- `tests/replay.test.js` — replay del reto (sub-bloque 2d): núcleo PURO
  (`parsearCodigoJugada`, `reproducirSecuencia` con referencia `2026-10-10:
  LDRU`, validación del campo `movimientos`) **y** UI con fake timers
  (`INTERVALO_REPLAY` real): grabación por turno, deshacer (I2), bomba (I1),
  preservación del intento con cero escrituras (R2), teclado/deshacer/bomba
  bloqueados durante la reproducción, récord intacto (Task 6), replay que
  muere sin overlay (R6) y panel `#replay` sin tercer `role="dialog"`.
- `tests/confirmar.test.js` — confirmación al salir de una partida con
  progreso (Nueva partida / Reto diario) y barra inferior con texto.
- `tests/setup.js` crea el DOM de arranque y **mockea `Math.random` a 0**: en tests
  de UI el tablero inicial es siempre `[[2,2,0,0], ...]` y `mover("left")` produce
  `[[4,2,0,0], ...]` con 4 puntos (2 celdas: la fusión resta una y el spawn añade otra).
  **Suites existentes editadas**: en el 2a añadió el botón `#daily` a `.actions`
  (antes de `#share`) y en el 2d el botón `#replay` + panel `#replay-panel`
  (igual que `index.html`); `reto.test.js` adaptó su regex de compartir (R8,
  autorizado) para aceptar el sufijo ` Reproduce: 2048reto:…`.

Total: **239 tests en 15 ficheros** (`npm test` debe dar todo en verde).

## Convenciones del repo

- Comentarios, UI, mensajes y commits en **español**; commits sin prefijo
  conventional-commits.

## Hechos no obvios del código

- **`file://` no funciona** (los módulos ES están bloqueados por CORS): `index.html`
  detecta `location.protocol === "file:"` con un script *clásico* (sí se ejecuta
  en `file://`) y muestra el aviso `#aviso-file` con las instrucciones. No quitar
  ese aviso: sin él la página queda muerta en silencio.
- **Modal centralizado**: `hayModalAbierto()` (en `app/game.js`) es el único punto que
  decide si la entrada está bloqueada; la consultan `mover()` (teclado y swipe) y
  `toggleBomba()`. No repetir esta lógica en cada listener. **Única excepción
  (fase 05-fix)**: `toggleBomba()` comprueba además `timerOverlayFin !== null`
  para no operar dentro de la ventana de 260 ms del overlay de fin pendiente
  (en esa ventana `hayModalAbierto()` es `false` pero el estado ya dice fin de
  partida — enmienda de la decisión 11).
- **Deshacer con overlay abierto** — decisión **SUPERADA el 2026-10-11 por el
  usuario**: el game over es **DEFINITIVO**. `deshacer()` y el botón de
  deshacer se niegan/deshabilitan cuando `esGameOver(board)` es true (ni en
  la ventana de 260 ms ni con Tab hay rescate): el jugador es responsable de
  sus recursos y lo no usado al bloquear el tablero, se pierde. El test P1 de
  `flujo.test.js` ("deshacer cierra el overlay") sigue verde porque fuerza
  `mostrarGameOver()` sobre un tablero VIVO — el guard es por ESTADO, no por
  overlay. La única suite reescrita fue el caso de la ventana en
  `animacion.test.js` (2ª y última excepción autorizada a la línea roja).
  No reabrir esto sin acuerdo explícito.
- **La bomba NO entra en el historial de deshacer** (recurso consumible). Decisión
  de producto documentada en `app/game.js`; no cambiarla sin acordarlo.
- **Barra inferior y confirmación de salida**: `#install`, `#daily`, `#replay`
  y `#share` viven en `.actions.actions-bottom`, DEBAJO del tablero, con icono
  + texto (`.btn-text`); `#share` sigue siendo el último. `#replay-panel` va
  entre el tablero y esa barra. "Nueva partida" y "Reto diario" pasan por
  `confirmarSalida()` (`game.js`): si `partidaEnCurso()` (puntos, jugadas o
  bomba usada, y tablero NO bloqueado; durante un replay se mide el
  `snapshotReplay`) preguntan reutilizando `#overlay` — **jamás un tercer
  `role="dialog"`** — con "Seguir jugando" como botón enfocado. Las funciones
  exportadas (`nuevaPartida`, etc.) NO preguntan; solo los listeners de los
  botones. Tests: `tests/confirmar.test.js`.
- **Reto diario (sub-bloque 2a, D5)**: `#daily` va en la barra inferior ANTES
  de `#share` (el de compartir es siempre el último botón de la barra). En modo
  reto el spawn usa `rndReto()` (mulberry32 con `rngEstado` persistido); el
  `Math.random()` de la página solo queda en el modo normal — **la semilla NO
  vive en `historial`** (D7). La fecha es local (`hoy()` → `YYYY-MM-DD`), los
  intentos son ilimitados (mismo día ⇒ misma secuencia) y el récord se
  comparte con el de siempre (`stats2048.record`, D5d).
- **Replay del reto (sub-bloque 2d, "Reproduce mi jugada")**: el código
  `2048reto:<YYYY-MM-DD>:<LRUD…>` (máx. 5000) determina la partida ENTERA:
  `reproducirSecuencia()` en `js/game-core.js` es un **dry-run puro** (un
  movimiento sin cambio NO avanza el RNG) y en la UI `reproducir()` alimenta
  `mover()` en bucle de `setTimeout` (`INTERVALO_REPLAY = 300`, exportado).
  Mientras dura, el flag `reproduciendo` **silencia récord, guardado,
  overlays de fin (R6) y la entrada del jugador** (teclado/swipe/deshacer/
  bomba); el intento del jugador vive en `snapshotReplay` y `partida2048` NO
  se toca (R2, cero escrituras testeado). La grabación va solo en modo reto:
  cada movimiento con cambio apendea su carácter (`CARACTERES_REPLAY`) y el
  deshacer hace pop (I2); **la bomba limpia la secuencia** (I1: muta el
  tablero sin RNG ⇒ no reproducible). El panel `#replay-panel` NO es modal
  (el invariante siguen siendo 2 `role="dialog"`) y va entre `.actions` y el
  tablero; `#share` sigue siendo el último de `.actions`. Cualquier fecha
  válida se puede reproducir (R5), no solo la de hoy.
- **Único test existente con una línea adaptada en el 2a**: `animacion.test.js`
  "deshacer() durante la ventana cancela el overlay" jugaba una partida
  determinista hasta el tablero bloqueado, por lo que alcanzaba la ficha 128 y
  D6 le concedía +1 deshacer: la aserción pasó de `"2"` a `"3"` (autorizado
  por el usuario en la fase 03). Si otra suite de las 11 originales choca con
  una decisión nueva, **se para y se reporta** antes de tocarla.
- **Persistencia (DOS claves)**: `localStorage["stats2048"]` guarda
  `{ record, tema, fxActivo? }` vía `leerStats/guardarStats` (`fxActivo` solo
  se escribe al pulsar `#fx-toggle`) y `localStorage["partida2048"]` guarda la
  partida en curso. El récord se guarda en `actualizarRecord()`, llamada desde
  `mover()` — **`render()` no persiste nada** (no reintroducir ese efecto).
- **Partida en curso en `partida2048`**: esquema v1 `{ v, board, score,
  deshacerRestantes, bombasRestantes, victoriaAvisada, historial }` (con
  `historial`, si no el deshacer moriría al recargar), **más campos
  OPCIONALES del sub-bloque 2a** (sin migración, `v` sigue en 1): `modo`
  (`"normal" | "reto"`, omitido en normal), `hitos` (umbrales de power-ups ya
  concedidos, omitido si es `[]`) y, SOLO en modo reto, `dia`
  (`YYYY-MM-DD`), `rngEstado` (entero) y `movimientos` (secuencia LRUD del
  intento, sub-bloque 2d; omitido si es `""`). `guardarPartida()` los emite
  únicamente cuando se alejan del valor por defecto — así un guardado de
  partida normal conserva exactamente las 7 claves que espera
  `restauracion.test.js:82`. Al restaurar, lo que no viaja usa el default:
  modo normal y `hitos = hitosAlcanzados(board)` (**backfill SIN conceder**,
  D8: los contadores no suben ni hay toast). **El `historial` no
  tiene tope**: cada entrada (`{board, score}`) ocupa ~100-150 B, de modo que
  1000 movimientos quedan por debajo de ~200 KB frente a los ~5 MiB de cuota,
  y **la clave se borra al acabar la partida** (riesgo 14 documentado, no un
  creep silencioso). Se guarda en `mover()`
  (si hubo cambio; los hitos del turno se aplican ANTES de persistir),
  `deshacer()`, el handler de la bomba, `pagehide` y
  `visibilitychange` oculto; se **borra** en `nuevaPartida()` y al acabar la
  partida. Se restaura SOLO si `esPartidaValida()` (de `js/game-core.js`) la
  valida y no está bloqueada; si no, se borra y empieza partida nueva. Nunca
  `beforeunload`/`unload` y **sin diálogo de confirmación**.
- **`render()` reconcilia, no reconstruye**: `asegurarRejilla()` crea UNA sola
  vez las 16 `.cell` con su `.tile` persistente y a partir de ahí `render()`
  solo actualiza texto, `data-value`, `len3/len4` y `.nueva` (re-fire con
  reflow forzado). La rampa sigue en `.cell`, así que **cero selectores de
  `css/style.css` migrados** y `#board.children` sigue midiendo 16.
- **Animación = capa posterior, SIN lock de entrada**: estado y DOM se
  resuelven síncronos en `mover()`; solo después `app/game-fx.js` anima con
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
  maestro de sonido y háptica (`feedbackActivo` en `app/game-fx.js`), ON por
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
  con `transponer()`/`invertirFilas()` en `js/game-core.js`.
- **`js/game-core.js` sigue PURO** (sin DOM, sin `localStorage`, sin eventos) y
  ahora exporta además `aplicarMovimiento().traza` (`{ movimientos, fusiones }`,
  campo aditivo con el que `app/game-fx.js` anima) y `esPartidaValida()` (valida la
  forma de `partida2048`; nunca lanza). Toda regla nueva sigue yendo ahí.
- **Algoritmo intacto**: el algoritmo de MOVIMIENTO no cambió — `comprimir`,
  fusión sin cadena, `dvh` en el layout y `passive: false` en `touchmove`
  (obligatorio: sin él `preventDefault()` se ignora). Lo que cambió es la
  representación DOM: `render()` **ya no reconstruye** las 16 celdas, las
  reconcilia con sus `.tile` persistentes (ver arriba) y la animación vive en
  `#fx-layer`, una capa aparte.
- **Service worker `sw.js` (`2048-v1`)**: registro **clásico** en `app/game.js`
  (`navigator.serviceWorker.register("./sw.js")`, sin `await` de activación ni
  mensajes). `fetch` **network-first para documento, JS y CSS** (la red manda
  en desarrollo; si falla, caché → `./index.html`) y **cache-first para
  iconos, manifest e imágenes**. **Sin `skipWaiting()`, pero SÍ con
  `clients.claim()`** en `activate` (el SW toma el control de la primera
  carga, que nace sin controlar; no hay que recargar), y **JAMÁS
  `location.reload()`**: una actualización espera a que se cierren todas las
  pestañas. Si hay que forzar recarga en local: DevTools →
  Application → Service Workers → Unregister, o checkbox "Bypass for network".
  `sw.js` tiene override de ESLint en `eslint.config.js` (usa `self`/`caches`).
- **La captura de compartir va en un `<canvas>` SIEMPRE desconectado**
  (`document.createElement` nunca se appendea). Guards en orden:
  `getContext("2d") === null` (jsdom) → `typeof toBlob !== "function"` →
  DPR capado a ×2 → `document.fonts?.ready` con carrera de 150 ms → dibujo →
  `toBlob`. **`crearCaptura()` NO está exportada** (la captura del test 3 se
  hace espiando `document.createElement`); solo se exportan `obtenerSnapshot()`
  y `compartir()`.
- **`compartir()` nunca lanza y jamás escribe en `localStorage`**: cadena
  `canShare({files}) → share({files}) → share({title,text,url}) → descarga
  (ObjectURL + <a download> en `document.body`) → clipboard → mensaje "Este
  navegador no permite compartir"`. **`AbortError` ⇒ `return` silencioso** (el
  usuario canceló el sheet: ni toast ni descarga). El toast usa
  `hidden=false` ANTES de escribir y `clearTimeout` previo (`DURACION_TOAST =
  3000`, exportado para que el test use el valor real): **nunca**
  `transitionend`/`animationend`.
- **`#share`, `#install` y `#status` existen en `index.html` Y en
  `tests/setup.js`** (el setup duplica el markup; si añades un id nuevo,
  añádelo en ambos). `#install` arranca `hidden` y solo se muestra con
  `beforeinstallprompt` (que hace `preventDefault()`, sin escrituras).
- **`RAMPA` es única**: `js/game-share.js` la exporta y `css/style.css` la declara en
  los selectores `.cell[data-value="…"]`; `share.test.js` las contrasta línea
  a línea. Si cambias un color en CSS, cámbialo también en `js/game-share.js` (o
  viceversa).
- **Botones de overlay**: `mostrarVictoria()`/`mostrarGameOver()` reciben los
  botones como array y el de **"Compartir" va SIEMPRE el último** (contrato
  testeado); sigue habiendo exactamente **dos** `role="dialog"` en la página.
- **`npm run iconos` es de desarrollo**: `tools/generar-iconos.mjs` usa
  `tools/lib/ctx-software.mjs` (zlib nativo) y **no corre en test ni en CI**;
  los PNG de `icons/` están commiteados (el test `pwa` valida firma e IHDR de
  los reales).
