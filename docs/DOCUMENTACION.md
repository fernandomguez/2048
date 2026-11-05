# Documentación de la evolución del proyecto

> **Para qué sirve este documento:** recoge todo el trabajo realizado en la sesión
> de auditoría + refactorización, para que una sesión nueva (agente o persona)
> pueda continuar sin necesidad de contexto previo. `AGENTS.md` resume las reglas
> cortas para trabajar en el repo; este archivo es el historial completo.

---

## 1. Punto de partida

Repositorio 2048 estático (HTML + CSS + JS vanilla, sin frameworks, sin build):

| Archivo | Rol original |
| --- | --- |
| `index.html` | Marcado, Google Fonts, power-ups |
| `app/game.js` | Script clásico único (lógica + UI + storage mezclados, ~445 líneas) |
| `css/style.css` | Temas claro/oscuro y layout `dvh` |

Características previas: movimientos por flechas y swipe, deshacer (3 usos),
bomba (1 uso), récord y tema en `localStorage["stats2048"]`, pantalla de
bienvenida en cada carga, overlays de victoria/game over. Sin tests, sin lint,
sin CI, sin README.

Git: rama `main`, trabajo limpio, commits en español sin convención fija.
Últimos commits: `a0dee4a Centra con dvh y adapta el layout a horizontal en movil`…

## 2. Auditoría técnica (fase previa)

Se realizó una auditoría completa de solo lectura (18 secciones, sin modificar
archivos). Conclusiones clave:

- **Sin P0.** El algoritmo del juego, el render, el `localStorage`, el layout `dvh`
  y la ausencia de dependencias estaban **correctos y no tocados**.
- **Dos bugs P1:**
  1. El juego aceptaba teclado/swipe **con la bienvenida `#welcome` visible**
     (la comprobación solo miraba el overlay `#overlay`).
  2. `deshacer()` restauraba tablero/puntos **detrás del overlay de fin** sin
     cerrarlo ni revalidar → partida "fantasma" bloqueada.
- Deuda detectada: `fusionar()` mutaba el `score` global; `render()` persistía el
  récord como efecto secundario; lógica de dominio intesteable (script clásico);
  init duplicado respecto a `nuevaPartida()`; sin tests/lint/CI/README/meta tags.
- Fases propuestas: **1** (P1), **2** (núcleo separado de UI), **3** (tests, lint,
  CI, a11y, docs), **4** (rendimiento) **descartada por prematura**.

## 3. Trabajo realizado

### Fase 1 — Bugs P1

**P1-1 · Entrada bloqueable de forma coherente** (`app/game.js`)

- Nuevo predicado central `hayModalAbierto()` = `!welcomeEl.hidden || !overlayEl.hidden`.
- Es el **único** punto que decide si la entrada está bloqueada. Lo consultan:
  - `mover()` → cubre a la vez **teclado y swipe** (ambos pasan por él),
  - `toggleBomba()` → no se puede armar la bomba con un modal abierto (con el
    overlay visible las celdas están cubiertas: antes era un callejón sin salida).
- Ningún listener conoce overlays individuales.

**P1-2 · Deshacer con overlay de fin abierto** (`app/game.js`)

- **Decisión de diseño (opción 1 de la auditoría):** `deshacer()` **funciona**
  durante el fin de partida; restaurar la partida **cierra el overlay**
  revalidando `esGameOver(board)`. Coherente con la UX: el botón de deshacer
  está visible junto al tablero y es la vía de recuperación. No se deshabilita.
- `ocultarOverlay()` tiene guardia (`if (overlayEl.hidden) return`) para no
  robar foco cuando no había overlay (p. ej. deshacer en partida normal).

### Fase 2 — Separación núcleo / UI

- `index.html` → `<script type="module" src="app/game.js">`. **Sin bundler.**
- **Nuevo `js/game-core.js`** (puro, datos → datos; verificado por grep: **cero**
  referencias a `document`, `localStorage` o eventos):
  - Constantes: `TAMANO`, `VALOR_VICTORIA`, `PROBABILIDAD_DOS`,
    `USOS_DESHACER_INICIALES`, `BOMBAS_INICIALES`.
  - Filas: `comprimir`, `fusionar` → `{fila, puntos}`, `moverFilaIzquierda`.
  - Matriz: `invertirFilas`, `transponer`, `aplicarMovimiento` →
    `{previo, matriz, puntos, cambio}` (solo `"left"` es primitiva; el resto se
    compone con transponer/invertir, igual que el original).
  - `agregarFicha(matriz, rnd)` (spawn con aleatoriedad **inyectable**),
    `celdasVacias`, `copiar`, `sonIguales`, `crearTablero`.
  - Fin: `hayFusionPosible`, `esGameOver`, `hayVictoria`.
  - `aplicarDeshacer({board, score, historial, usos})` → máquina de estados pura.
- **`fusionar()` ya no muta `score`**: devuelve los puntos; `mover()` los suma.
- **`render()` ya no persiste**: solo pinta (`actualizarMarcador()`). El récord se
  guarda en `actualizarRecord()`, llamado **explícitamente desde `mover()`**
  (único punto donde `score` sube).
- **Init sin duplicación**: el arranque del script llama a `nuevaPartida()`,
  única fuente de verdad (tablero, score, historial, contadores, power-ups,
  overlays, render).
- `app/game.js` exporta la capa de comandos que usan los tests: `mover`, `deshacer`,
  `toggleBomba`, `nuevaPartida`, `mostrarVictoria`, `mostrarGameOver`.

### Fase 3 — Testing, lint, CI, a11y, docs

- **Vitest + jsdom** (solo devDependencies). 4 archivos, **64 tests** (recuento
  actual en §5):
  | Archivo | Tests | Qué cubre |
  | --- | --- | --- |
  | `tests/game-core.test.js` | 39 | Fusión sin cadena, comprimir, 4 direcciones, game over, victoria, spawn, deshacer puro |
  | `tests/flujo.test.js` | 16 | **Regresión P1** (bienvenida bloquea teclado/swipe/bomba; game over y victoria → deshacer cierra overlay), bomba, contadores, nueva partida |
  | `tests/markup.test.js` | 5 | Arranca `app/game.js` contra el **`index.html` real**; todos los ids consultados existen; meta/aria presentes |
  | `tests/persistencia.test.js` | 4 | Récord y tema en `localStorage` |
  | `tests/setup.js` | — | Fixture DOM + `matchMedia` stub + **`Math.random` mockeado a 0** (tablero inicial determinista `[[2,2,0,0],…]`) |
- **ESLint** (flat config, `@eslint/js` recommended + globals browser/node).
- **CI** `.github/workflows/ci.yml`: `npm ci → npm run lint → npm test` en
  `push` y `pull_request` (Node 22).
- **README.md**: qué es, cómo ejecutarlo, cómo probarlo, estructura, tecnologías.
- **Meta tags**: `description`, `og:type/title/description`, `twitter:card`.
  **Sin `og:image`** (no existe imagen en el repo; no se inventó).
- **Accesibilidad**: `role="dialog"` + `aria-modal` + `aria-labelledby` en ambos
  overlays; foco entra al abrir y se restaura al cerrar (fallback al tablero,
  ahora `tabindex="-1"`); `aria-live="polite"` en el marcador; foco inicial en
  el botón de la bienvenida. Sin focus-trap (ver pendientes).
- **CSS**: eliminado el bloque `:root[data-theme="dark"]` (idéntico a `:root`,
  redundante). Se conserva la rama `@media (prefers-color-scheme: light)
  :root:not([data-theme])` **que evita el FOUC**. La duplicación del tema claro
  (2 ramas) queda a propósito.

### Fase 4 (post-feedback) — `file://` y `npm start`

Contexto: el usuario reportó **"no funciona el juego"**. Diagnóstico con Chrome
headless:

| Cómo se abre | Resultado |
| --- | --- |
| `http://localhost:8000` | ✅ 16 celdas, 2 fichas, arranca |
| `file:///…/index.html` (doble clic) | ❌ `app/game.js` bloqueado por CORS (módulos ES), 0 celdas |

Los módulos ES exigen HTTP: **doble-clic dejó de servir** (coste aceptado de la
Fase 2, inherente a usar ESM sin bundler). Soluciones implementadas:

1. **`tools/servidor.mjs`** — servidor estático propio, ~45 líneas, **cero
   dependencias**, con MIME correcto, anti-`path traversal` y mensaje amigable en
   `EADDRINUSE` (no traza de Node). Alias: **`npm start`** → puerto 8000
   (configurable con `PORT=8080 npm start`).
2. **Aviso `#aviso-file` en `index.html`** — un `<script>` **clásico** (sí se
   ejecuta en `file://`) detecta `location.protocol === "file:"` y muestra una
   tarjeta con las instrucciones (`npm start` y alternativa con Python) en lugar
   de una página muerta. Servido por HTTP, no aparece.
3. README, AGENTS.md y `eslint.config.js` actualizados (scripts con globals node).

## 4. Decisiones de diseño (no "arreglar" sin acordarlo)

| Decisión | Rationale |
| --- | --- |
| `deshacer()` cierra el overlay de fin | Recuperación de partida elegida como producto; el botón está fuera del overlay |
| La bomba **no** entra en el historial de deshacer | Recurso consumible; documentado en `app/game.js` y `AGENTS.md` |
| Sin bundler / sin frameworks | Principio del proyecto; ESM es nativo |
| `file://` no soportado | Consecuencia de ESM; cubierto con `npm start` + aviso |
| Tema claro duplicado en CSS | Evita FOUC antes de que JS fije `data-theme` |
| `render()` **reconcilia** 16 slots (ya no reconstruye) | Identidad de nodos para animar con `transform`; **revoca** la fila previa "Render reconstruye las 16 celdas". La rampa `data-value`/`lenN` sigue en `.cell`: cero selectores migrados de `css/style.css` |
| Sin focus-trap en diálogos | Tab debe llegar al botón de deshacer (está fuera del overlay) |
| Animación **sin lock de entrada** (decisión 3) | Estado + DOM síncronos en `mover()`; la capa FX (`#fx-layer`) es posterior e interrumpible (`limpiarFx()` al inicio de cada ciclo). Nunca se difiere estado por animación: conserva los tests de flujo y markup (riesgo 1) |
| Partida en curso en clave `partida2048` (decisión 6) | Clave SEPARADA de `stats2048` para no romper `expect(stats()).toBeNull()`; esquema v1 con `historial` y `victoriaAvisada`, validado por `esPartidaValida()`; **restauración automática sin diálogo** (un tercer `[role="dialog"]` rompería `markup.test.js`); guardado en `pagehide`/`visibilitychange`, borrado en `nuevaPartida()` y al acabar |
| UN único interruptor `#fx-toggle` (decisión 8) | Sonido y háptica con un solo `role="switch"` ON por defecto; `stats2048.fxActivo` solo se escribe al pulsarlo; `prefers-reduced-motion` gobierna **solo** lo visual, no el feedback |
| Overlay de fin diferido 260 ms (decisión 11) | `setTimeout` de ms fijos, **nunca** `transitionend`/`animationend` (no disparan en jsdom); el estado se aplica síncrono y el diálogo no tapa el slide/pop |
| Háptica con feature-detect (decisión 12) | `navigator.vibrate` no existe en iOS/Firefox: mejora progresiva (sonido + feedback visual) documentada como **límite de plataforma**, no como bug |

## 5. Comandos

```bash
npm install     # solo devDependencies
npm start       # servidor local → http://localhost:8000
npm test        # 230 tests (14 ficheros)
npm run lint    # ESLint
npm run iconos  # regenera los 2 PNG de icons/ (SOLO desarrollo: no forma
                # parte de npm test ni de la CI; los binarios se commitean)
```

Orden recomendado antes de commit: `npm run lint` → `npm test`.

## 6. Estado actual de git — ✅ **TODO COMMITEADO** (auditoría 2026-10-03 · Bloque 1 y Bloque 3, 2026-10-04/10)

Se aplicó el plan de commits atómicos con el skill `git-commit-planner`.
Sobre `a0dee4a`, los 7 commits del plan son (a ellos se suman los de
seguimiento: `.gitignore`/`.opencode` y las actualizaciones de esta memoria):

| Mensaje | Contenido |
| --- | --- |
| `Añade la lógica pura del juego en js/game-core.js` | `js/game-core.js` |
| `Separa la lógica en js/game-core.js y usa módulos ES` | `app/game.js`, `index.html`, `css/style.css` |
| `Añade tooling de desarrollo: npm, ESLint, Vitest y servidor local` | `package.json`, `package-lock.json`, ESLint, Vitest, `tests/setup.js`, `tools/servidor.mjs`, `.gitignore` |
| `Añade tests del núcleo puro en js/game-core.js` | `tests/game-core.test.js` |
| `Añade tests de la capa de UI: flujos, markup y persistencia` | `tests/flujo.test.js`, `markup.test.js`, `persistencia.test.js` |
| `Añade CI con lint y tests en GitHub Actions` | `.github/workflows/ci.yml` |
| `Añade documentación: README, AGENTS y memoria de la auditoría` | `README.md`, `AGENTS.md`, `DOCUMENTACION.md` |

Dos incidencias del proceso, documentadas para no repetirlas:

- El plan preveía separar meta/accesibilidad y el dedupe del tema oscuro en
  commits propios, pero **`git commit -m … -- <rutas>` toma el working tree,
  no el índice**: esos cambios quedaron absorbidos en el segundo commit. Para
  staging parcial, hacer `git add <rutas>` y **`git commit` sin pathspec**.
- Los tres primeros mensajes se redactaron sin tildes/ñ y se corrigieron con
  `git rebase -i` (`reword`) **antes de ningún push**; el árbol quedó idéntico.
  Queda la rama de respaldo `respaldo-antes-reword` para poder comparar
  (`git diff respaldo-antes-reword HEAD` → vacío) y borrarla cuando convenga.

Estado:

- Working tree limpio tras los commits del **Bloque 1 — Jugabilidad** (2026-10-04:
  animación con identidad de nodos, puntos flotantes, sonido/háptica con
  interruptor y partida en curso; 64 → 142 tests) y del **Bloque 3 — PWA**
  (2026-10-10: `482a121` código+tests+assets y `a421eb0` documentación;
  142 → 167 tests). Ver `git log` desde `3837b55`.
- `.opencode/` está en `.gitignore` (configuración local del agente, no del
  proyecto): el estado del pipeline multiagente vive en `.opencode/workflow/`
  solo en disco.
- **⚠️ SIN PUSH:** `origin/main` está por detrás (**`git rev-list --count
  origin/main..HEAD` = 17**): los commits de la auditoría, del Bloque 1 y del
  Bloque 3 siguen locales. **Esta fase tampoco hace push** (decisión D12 del
  plan del Bloque 3): el push y la activación del CI los decide el usuario al
  final. Ver §8.5.
- CI funcionará en el primer push (ya existe `package-lock.json`).

## 7. Validación final

- **Tests** → ✅ 64/64 (validación de esa fase; recuento actual: **230 en 14
  ficheros**, ver §5 y §10)
- **Lint** → ✅ 0 problemas
- **Build** → No aplica (no hay build de producción, por diseño)
- **Chrome headless (HTTP)** → ✅ arranca con 16 celdas/2 fichas
- **Chrome headless (`file://`)** → ✅ muestra el aviso con instrucciones
- **Servidor propio** → ✅ responde `200 text/html`; `EADDRINUSE` con mensaje amigable
- **Flujos interactivos manuales en navegador** → ⚠️ la sesión no tenía navegador
  de escritorio conectado; los cubre `tests/flujo.test.js` + `tests/markup.test.js`
  (jsdom con el markup real). Conviene un paseo manual: bienvenida, flechas,
  swipe, deshacer tras game over, bomba, nueva partida, récord y tema.
- **Verificación manual del Bloque 3 en Chrome** → ⏳ **pendiente (Task 12)**:
  la CI no cubre service worker, canvas ni Web Share. Checklist en §10.

## 8. Pendientes conocidos (y por qué se dejaron)

1. **`og:image`** — ✅ **HECHO (Bloque 3)**: `icons/og-image-1200x630.png`
   (1200×630, generado con el mismo código de dibujo) y `og:url`/`og:image`
   están en `index.html`, pero con **ruta relativa**: antes de publicar hay que
   completar la **URL absoluta** al elegir el hosting (decisión D1); idem para
   `start_url`/`scope` del manifest.
2. **Duplicación del tema claro en CSS (2 ramas)** — P3; una rama protege del
   FOUC. Solo fusionar si se encuentra una solución sin FOUC.
3. **`touchmove` con `preventDefault` global** (P3) — bloquea también el zoom;
   comportamiento original, no tocado.
4. **Sin focus-trap** en diálogos — mejora posible; tendría que permitir alcanzar
   el deshacer (fuera del overlay) o moverlo dentro.
5. **Sin push** — `origin/main` está por detrás: los commits de esta auditoría
   siguen locales (conteo: `git rev-list --count origin/main..HEAD`). Subirlos
   dispara el CI, que solo correrá después. Ver §6.
6. **Possibile conversión a APK** — evaluada (recomendado Capacitor, `web-dir .`);
   no se ha hecho nada, solo consultada la viabilidad.

## 9. Estructura actual del código

```text
index.html ──<script type="module">──► app/game.js (UI: entradas, render,
                                          overlays, power-ups, storage,
                                          compartir e instalación)
                                            │ importa
                          ┌─────────────────┴─────────────────┐
                          ▼                                   ▼
                 app/game-fx.js (efectos y feedback:      js/game-core.js (puro: datos → datos;
                 slide/pop/fantasmas y flotantes +N   traza de animación y
                 en #fx-layer; sonido y háptica)      esPartidaValida)
                          │                                   ▲
                          └────────────── importa ────────────┘

js/game-share.js  → captura para compartir: RAMPA, PALETAS, MEDIDAS_CAPTURA y
                 dibujarCaptura (canvas 2D SIEMPRE desconectado); lo importa
                 app/game.js, que exporta obtenerSnapshot(), compartir() y
                 DURACION_TOAST
manifest.json  → PWA: start_url/scope + iconos (SVG en icons/, PNG 180 y
                 og 1200×630)
sw.js          → service worker 2048-v2: network-first para documento, JS y
                 CSS; cache-first para iconos, manifest e imágenes; sin
                 skipWaiting ni recarga automática (clients.claim() sí)
icons/         → 2048.svg · 2048-maskable.svg · apple-touch-icon-180.png
                 · og-image-1200x630.png  (los 2 PNG, commiteados)
tools/generar-iconos.mjs + tools/lib/ctx-software.mjs
                 → npm run iconos (SOLO desarrollo, sin dependencias)

tests/ (Vitest: núcleo en nodo, UI en jsdom) — 230 tests en 14 ficheros
  originales: game-core · flujo · markup · persistencia
  Bloque 1:   animacion · feedback · restauracion · arranque · integracion
  Bloque 3:   pwa · share
  Bloque 2a:  hitos · reto
  Bloque 2d:  replay
  setup.js (fixture DOM + matchMedia stub + Math.random = 0 + #daily + #replay-panel)
tools/servidor.mjs  → npm start (dev, sin dependencias)
.github/workflows/ci.yml → lint + tests en push/PR
```

## 10. Roadmap de mejoras propuestas

> Propuesta de 2026-10-03 para que el juego "deje de ser simple" y se convierta
> en una app como tal. **El Bloque 1 está HECHO** (2026-10-04) y **el Bloque 3
> (PWA) también** (2026-10-04, commiteado el 2026-10-10); del **Bloque 2**, los
> **sub-bloques 2a (reto diario + power-ups) y 2d (replay del reto) están
> IMPLEMENTADOS** (ambos el 2026-10-11) y siguen **aplazados 2b y 2c**. El primer paso
> (ordenar el historial en commits atómicos, el "Bloque 4" original) ya estaba
> completo; el orden seguido fue **Bloque 1 → PWA (Bloque 3) → Bloque 2**.

### Bloque 1 — Se siente jugable (impacto alto, esfuerzo medio) — ✅ HECHO (2026-10-04)

- **Animación real** ✅ — slide + pop de fusión + spawn con identidad de nodos
  (`.tile` persistente + `transform`), **sin recrear el DOM**: `render()` pasó a
  **reconciliar** 16 slots, se revoca "render reconstruye las 16 celdas" y
  `AGENTS.md` quedó actualizado. La animación es una capa posterior e
  interrumpible **sin lock de entrada** (`limpiarFx()` al inicio de cada
  ciclo) y vive en `#fx-layer`, **fuera de `#board`**. Rama
  `prefers-reduced-motion` en CSS y guard en JS.
- **Puntos flotantes** ✅ — `+N` subiendo y desvaneciéndose sobre la celda
  fusionada (un nodo por fusión), siempre en `#fx-layer` y nunca en `#board`.
- **Háptica + sonido** ✅ — `navigator.vibrate` SOLO en fusión (feature-detect)
  y tonos Web Audio generados (sin archivos), con **un único interruptor
  `#fx-toggle`** ON por defecto persistido en `stats2048.fxActivo` (escrito
  solo al pulsarlo). *Matiz de plataforma:* `navigator.vibrate` existe en
  **Chromium/Android**; en iOS y Firefox queda sonido + feedback visual
  (mejora progresiva, no bug). *Manifest y service worker:* se quedaron para
  el Bloque 3, **ya HECHO** (más abajo).
- **Guardar/restaurar partida en curso** ✅ — clave `partida2048` **separada**
  de `stats2048` con tablero, puntos, contadores, `victoriaAvisada` e
  `historial`; se guarda en cada turno, en `pagehide`/`visibilitychange` y se
  restaura sola al recargar (validada por `esPartidaValida()`, **sin
  diálogo**). Se borra al empezar partida nueva y al acabar la partida.

> Validación del Bloque 1: `npm run lint` → 0 y `npm test` → **142 tests en
> 9 ficheros** (los 64 originales intactos + traza, `esPartidaValida`,
> animación, feedback, restauración, arranque e integración).

### Bloque 2 — Profundidad (retención) — 🟢 **2a y 2d HECHOS (2026-10-11), 2b/2c aplazados**

- **Tamaños de tablero**: 3×3 / 4×4 / 5×5 / 6×6 (`TAMANO` ya es constante
  paramétrica; ojo con el CSS y con el cálculo del índice de celda).
- **Panel de estadísticas**: partidas jugadas, puntuación media, ficha máxima,
  tiempo medio, últimas partidas.
- **Reto diario con semilla fija**: `agregarFicha` ya inyecta `rnd`, así que
  hacer una partida determinista (mismo tablero para todos + código
  compartible) es **muy barato** y es el gancho de retención más clásico.
  ✅ en el sub-bloque 2a, con su extensión de replay en el 2d.
- **Progresión de power-ups**: ganar deshacer/bomba por hitos (llegar a 512,
  etc.) en vez de números fijos. ✅ en el sub-bloque 2a.
- **Replay de jugadas compartidas**: "Reproduce mi jugada" — reproducir la
  secuencia LRUD de un reto ajeno sobre la semilla de su fecha. ✅ en el
  sub-bloque 2d.

**Sub-bloque 2a — implementado (2026-10-11)** ✅:

- **Reto diario con semilla fija** — `semillaDeFecha(fecha)` (FNV-1a → uint32)
  y `siguienteRng(estado)` (mulberry32 con estado explícito) viven en
  `js/game-core.js`; `hoy()` usa la fecha **local** `YYYY-MM-DD` (D5a), los
  intentos son **ilimitados** (mismo día ⇒ misma secuencia, D5b) y el botón
  `#daily` en `.actions` va **antes de `#share`** (D5c) con
  `aria-pressed`. El récord sigue siendo el compartido `stats2048.record`
  (D5d) y `compartir()` anteponen `Reto diario <fecha>` en modo reto.
  `rngEstado` se persiste en `partida2048` **NO en `historial`** (D7) y
  `nuevaPartida()` **sigue sin parámetros** (sus llamantes son listeners de
  click que le pasan el `Event`).
- **Power-ups por hitos (D6)** — `HITOS_POWERUPS = { deshacer: [128, 512,
  1024], bomba: [256, 2048] }` con `calcularHitos()`/`hitosAlcanzados()`
  puros: +1 deshacer y +1 bomba **sobre los iniciales**, idempotentes y con
  toast por ficha. Al restaurar un guardado antiguo se **backfillea `hitos`
  SIN conceder** (D8): contadores intactos, cero toasts.
- **Persistencia retrocompatible** — campos `modo`/`dia`/`rngEstado`/`hitos`
  OPCIONALES con `v` sin cambiar; `guardarPartida()` solo los emite cuando se
  alejan del default (modo normal sin hitos), para no romper el `toEqual` de
  claves de `restauracion.test.js:82`.
- **Validación** — `npm run lint` → **0** y `npm test` → **205 tests en 13
  ficheros** (los 167 anteriores intactos, salvo **una sola línea** en
  `animacion.test.js` autorizada por el usuario: su partida determinista
  alcanzaba el 128 y D6 le concede +1 deshacer, así que la aserción pasó de
  `"2"` a `"3"`; ver `AGENTS.md`).
- **Decisión de producto (2026-10-11, CERRADA)** — propuesta descartada de
  ofrecer "todavía tienes X bombas" en el diálogo de fin: **el jugador es
  responsable de sus recursos** y lo no usado al bloquear el tablero se
  pierde. Además, a petición del usuario, el game over pasó a ser **100 %
  final en código**: `deshacer()` y su botón se bloquean con `esGameOver`
  (ni ventana de 260 ms ni Tab). Tests: 205/13 en verde; única suite
  reescrita el caso de la ventana de `animacion.test.js` (excepción
  autorizada). No reabrir sin acuerdo explícito.

**Sub-bloque 2d — implementado (2026-10-11)** ✅ ("Reproduce mi jugada",
pipeline completo fases 01-06):

- **Código de replay** — `2048reto:<YYYY-MM-DD>:<LRUD…>` (máx.
  `MAX_MOVIMIENTOS_REPLAY = 5000`). `parsearCodigoJugada()` acepta el mensaje
  completo del compartir o el código suelto y devuelve `{fecha, movimientos}`;
  la forma inválida ⇒ `null` y toast "Código de jugada no válido". Cualquier
  fecha válida se puede reproducir (R5), no solo la de hoy.
- **Dry-run puro en `js/game-core.js`** — `reproducirSecuencia(fecha, seq)`
  reconstruye la partida entera sin tocar la UI; un movimiento **sin cambio
  NO avanza el RNG** (referencia: `"RL"` ≡ `"L"` en `2026-11-01`). La misma
  fecha + la misma secuencia ⇒ siempre el tablero exacto.
- **Grabación en `app/game.js`** — en modo reto cada movimiento con cambio
  apendea su carácter (`CARACTERES_REPLAY`); el **deshacer hace pop** (I2,
  1:1 con `historial`) y **la bomba limpia la secuencia** (I1: muta el
  tablero sin RNG ⇒ el intento deja de ser reproducible y el compartir vuelve
  a solo puntuación). `movimientos` viaja en `partida2048` SOLO en modo reto
  (esquema retrocompatible, campo opcional validado por `esPartidaValida`).
- **Reproducción sin pisar al jugador (R2)** — `reproducir()` alimenta
  `mover()` en bucle de `setTimeout` (`INTERVALO_REPLAY = 300`, exportado;
  nunca `transitionend`). El intento del jugador se congela en
  `snapshotReplay` y se restaura al terminar o parar: `partida2048` NO recibe
  **ninguna escritura** durante el replay (test de igualdad de cadena). El
  flag `reproduciendo` silencia récord (Task 6), guardado, overlays de fin
  (R6) y la entrada del jugador (teclado, swipe, deshacer, bomba).
- **Panel no modal** — botón `#replay` en `.actions` ANTES de `#share`
  (sigue siendo el último) con `aria-expanded`/`aria-controls`; el panel
  `#replay-panel` (textarea + Reproducir/Cancelar/Parar) vive entre
  `.actions` y el tablero y **no es un `role="dialog"`** (el invariante
  sigue siendo exactamente 2). "Parar" devuelve el tablero del jugador.
- **Compartir con código (Task 10)** — el texto del reto añade al final
  ` Reproduce: 2048reto:<dia>:<seq>`; sin secuencia grabada (partida limpia
  o tras bomba) el texto es el de siempre. Regex de `reto.test.js` adaptada
  (R8, autorizado por el usuario).
- **Validación** — `npm run lint` → **0** y `npm test` → **230 tests en 14
  ficheros** (las 13 suites anteriores intactas salvo la regex de compartir
  de `reto.test.js` —R8—; la nueva `tests/replay.test.js` aporta 25: 13 de
  núcleo puro y 12 de UI). Bombas de referencia: secuencia muerta de 41
  movimientos en `2026-10-10` (tablero lleno, score 140) para el test R6.
- **Sin anti-cheat (R7)** — decisión explícita: el código es texto plano y
  cualquiera puede fabricarse uno; la reproducibilidad importa más que
  proteger un marcador local.

**Estado por sub-bloque** (decisiones de producto en
`.opencode/workflow/outputs/01-analysis.md` §7):

| Sub-bloque | Estado | Decisión clave ya tomada |
| --- | --- | --- |
| **2a** reto diario + power-ups por hitos | ✅ **IMPLEMENTADO (2026-10-11)** — fases 03-06 del pipeline | semilla local `YYYY-MM-DD`, intentos ilimitados, botón `#daily`, récord compartido; +1 deshacer al 128/512/1024 y +1 bomba al 256/2048 **sobre los iniciales**; `rngEstado` en `partida2048` y **backfill sin conceder** en guardados antiguos |
| **2d** replay del reto ("Reproduce mi jugada") | ✅ **IMPLEMENTADO (2026-10-11)** — pipeline completo 01-06 | código `2048reto:<fecha>:<LRUD…>` (máx. 5000), dry-run puro en `js/game-core.js`, grabación con pop en deshacer (I2) y limpieza con bomba (I1), intento preservado sin escrituras (R2), sin overlays ni récord durante la reproducción (R6/Task 6), panel **no modal**, cualquier fecha reproducible (R5), sin anti-cheat (R7) |
| **2b** tamaños de tablero | ⏸ aplazado | **Opción B: derivar el tamaño del propio tablero** (`matriz.length`) — exige aprobación explícita de la línea roja "algoritmo intacto" al abrir ese pipeline; `js/game-share.js:224` también divide entre 4 |
| **2c** panel de estadísticas | ⏸ aplazado | **clave nueva `estadisticas2048`** + **panel no modal** (no romper el invariante de 2 `role="dialog"`) |

Informes del pipeline del 2a archivados en
`.opencode/workflow/outputs/reto-diario-2a/`; los del 2d viven en
`.opencode/workflow/outputs/` (`01-analysis.md`, `02-plan.md`,
`03-implementation.md`, `04-review.md`, `05-fix.md` y
`06-final-validation.md`). `.opencode/` está en `.gitignore`: los informes
no se commitean.

### Bloque 3 — Que sea "una app" literalmente — ✅ HECHO (2026-10-04)

Alcance P0..P3 de `.opencode/workflow/outputs/bloque-3/01-analysis.md`,
implementado en 11 tasks
(`.opencode/workflow/outputs/bloque-3/02-plan.md`); **sin dependencias nuevas, sin
build, sin backend**.

- **P0 — Instalable y offline** ✅
  - `manifest.json` con `start_url`/`scope` relativos, `theme-color` (estático
    en el head y dinámico en `aplicarTema`) e iconos: **SVG `sizes: "any"`**
    (2048.svg + 2048-maskable.svg) según D6 — no hay PNG 192/512.
  - `apple-touch-icon` 180 PNG + `<link rel=icon>` (fichero PNG real,
    generado).
  - `sw.js` (`2048-v2`): precache de los 12 recursos, **network-first para
    documento, JS y CSS** con fallback a caché y cache-first para iconos,
    manifest e imágenes; sin Google Fonts en caché (D4), **sin `skipWaiting()`
    ni recarga automática** (G7; `clients.claim()` sí toma el control de la
    primera carga); registro con feature-detect en `app/game.js` (D8) y guard
    `file://`. Cómo apagarlo en DevTools: Application → Service Workers →
    Unregister, o "Bypass for network".
  - Override de ESLint para `sw.js` (`self`, `caches`).
- **P1 — Compartir tablero** ✅ — `obtenerSnapshot()` + captura en canvas
  **siempre desconectado** (guards: sin contexto 2D, sin `toBlob`, DPR capado
  a ×2, `document.fonts.ready` con carrera de 150 ms), botón "Compartir" en
  `.actions`, cadena `canShare({files}) → share({files}) → share(texto) →
  descarga → clipboard → mensaje`, toast `role="status"` con regla `[hidden]`
  explícita y `AbortError` silenciado.
- **P2 — Coherencia y cierre** ✅ — segunda entrada de compartir en los
  overlays de fin (el botón va **el último**), instrucción iOS **estática** en
  `#welcome` (D7, sin sniffing de UA), `AGENTS.md`/`DOCUMENTACION.md`
  actualizados y tests nuevos **solo en ficheros añadidos**
  (`tests/pwa.test.js`, `tests/share.test.js`).
- **P3 — `og:image`** ✅ — `icons/og-image-1200x630.png` (1200×630, generado
  con el mismo código de dibujo) con `og:image` + `width/height/type/alt` y
  **ruta relativa**: la URL absoluta se completa al elegir hosting (D1,
  §8.1).
- **Fuera de alcance confirmado** — leaderboard online (backend prohibido),
  `js/game-core.js` intacto, cero claves nuevas de persistencia (compartir **no
  escribe** en `localStorage`), cero dependencias, cero build, **sin banner ni
  chip de offline** (D2) y sin cachear fuentes (D4).

**Decisiones del Bloque 3 (no reabiertas):** D1 `og:image` PNG estático con
ruta relativa · D2 offline silencioso · D3 captura con el tema activo · D4 sin
Google Fonts en caché · D5 SW network-first + DevTools Unregister · D6 iconos
192/512 como SVG `sizes: "any"` · D7 `#install` oculto hasta
`beforeinstallprompt` + instrucción iOS estática · D8 registro del SW en
`app/game.js` (no un `<script>` clásico) · D9 dibujo en `js/game-share.js` (Node lo
reutiliza para los iconos) · D10 tests nuevos en ficheros nuevos · D11 sí se
documenta (`AGENTS.md`/`DOCUMENTACION.md`) · D12 **sin push** en esta fase.

> Validación del Bloque 3: `npm run lint` → **0** y `npm test` → **167 tests
> en 11 ficheros** (los 142 del Bloque 1 intactos + 14 de `pwa` + 11 de
> `share`). Revisión de la fase 04 cerrada el **2026-10-10** (correcciones de
> documentación F1-F7, comentario de `sw.js` y hardening de `compartir()`; ver
> `outputs/bloque-3/05-fix.md` y `06-final-validation.md`) y **commiteada** en
> `482a121` + `a421eb0`.
> **⏳ Pendiente:** verificación manual en Chrome (Task 12) — la CI no cubre
> service worker, canvas ni Web Share; checklist en `outputs/bloque-3/02-plan.md`
> (manifest, SW `activated`, caché `2048-v2`, offline, captura, Web Share e
> instalación).
