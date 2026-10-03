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
| `game.js` | Script clásico único (lógica + UI + storage mezclados, ~445 líneas) |
| `style.css` | Temas claro/oscuro y layout `dvh` |

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

**P1-1 · Entrada bloqueable de forma coherente** (`game.js`)

- Nuevo predicado central `hayModalAbierto()` = `!welcomeEl.hidden || !overlayEl.hidden`.
- Es el **único** punto que decide si la entrada está bloqueada. Lo consultan:
  - `mover()` → cubre a la vez **teclado y swipe** (ambos pasan por él),
  - `toggleBomba()` → no se puede armar la bomba con un modal abierto (con el
    overlay visible las celdas están cubiertas: antes era un callejón sin salida).
- Ningún listener conoce overlays individuales.

**P1-2 · Deshacer con overlay de fin abierto** (`game.js`)

- **Decisión de diseño (opción 1 de la auditoría):** `deshacer()` **funciona**
  durante el fin de partida; restaurar la partida **cierra el overlay**
  revalidando `esGameOver(board)`. Coherente con la UX: el botón de deshacer
  está visible junto al tablero y es la vía de recuperación. No se deshabilita.
- `ocultarOverlay()` tiene guardia (`if (overlayEl.hidden) return`) para no
  robar foco cuando no había overlay (p. ej. deshacer en partida normal).

### Fase 2 — Separación núcleo / UI

- `index.html` → `<script type="module" src="game.js">`. **Sin bundler.**
- **Nuevo `game-core.js`** (puro, datos → datos; verificado por grep: **cero**
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
- `game.js` exporta la capa de comandos que usan los tests: `mover`, `deshacer`,
  `toggleBomba`, `nuevaPartida`, `mostrarVictoria`, `mostrarGameOver`.

### Fase 3 — Testing, lint, CI, a11y, docs

- **Vitest + jsdom** (solo devDependencies). 4 archivos, **64 tests**:
  | Archivo | Tests | Qué cubre |
  | --- | --- | --- |
  | `tests/game-core.test.js` | 39 | Fusión sin cadena, comprimir, 4 direcciones, game over, victoria, spawn, deshacer puro |
  | `tests/flujo.test.js` | 16 | **Regresión P1** (bienvenida bloquea teclado/swipe/bomba; game over y victoria → deshacer cierra overlay), bomba, contadores, nueva partida |
  | `tests/markup.test.js` | 5 | Arranca `game.js` contra el **`index.html` real**; todos los ids consultados existen; meta/aria presentes |
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
| `file:///…/index.html` (doble clic) | ❌ `game.js` bloqueado por CORS (módulos ES), 0 celdas |

Los módulos ES exigen HTTP: **doble-clic dejó de servir** (coste aceptado de la
Fase 2, inherente a usar ESM sin bundler). Soluciones implementadas:

1. **`scripts/servidor.mjs`** — servidor estático propio, ~45 líneas, **cero
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
| La bomba **no** entra en el historial de deshacer | Recurso consumible; documentado en `game.js` y `AGENTS.md` |
| Sin bundler / sin frameworks | Principio del proyecto; ESM es nativo |
| `file://` no soportado | Consecuencia de ESM; cubierto con `npm start` + aviso |
| Tema claro duplicado en CSS | Evita FOUC antes de que JS fije `data-theme` |
| Render reconstruye las 16 celdas | Irrelevante para el rendimiento (auditoría fase 4 descartada) |
| Sin focus-trap en diálogos | Tab debe llegar al botón de deshacer (está fuera del overlay) |

## 5. Comandos

```bash
npm install     # solo devDependencies
npm start       # servidor local → http://localhost:8000
npm test        # 64 tests
npm run lint    # ESLint
```

Orden recomendado antes de commit: `npm run lint` → `npm test`.

## 6. Estado actual de git — ✅ **TODO COMMITEADO** (2026-10-03)

Se aplicó el plan de commits atómicos con el skill `git-commit-planner`.
Sobre `a0dee4a`, los 7 commits del plan son (a ellos se suman los de
seguimiento: `.gitignore`/`.opencode` y las actualizaciones de esta memoria):

| Mensaje | Contenido |
| --- | --- |
| `Añade la lógica pura del juego en game-core.js` | `game-core.js` |
| `Separa la lógica en game-core.js y usa módulos ES` | `game.js`, `index.html`, `style.css` |
| `Añade tooling de desarrollo: npm, ESLint, Vitest y servidor local` | `package.json`, `package-lock.json`, ESLint, Vitest, `tests/setup.js`, `scripts/servidor.mjs`, `.gitignore` |
| `Añade tests del núcleo puro en game-core.js` | `tests/game-core.test.js` |
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

- Working tree limpio; `.opencode/` está en `.gitignore` (configuración local
  del agente, no del proyecto).
- **⚠️ SIN PUSH:** `origin/main` está por detrás; todos los commits de esta
  auditoría siguen locales (conteo: `git rev-list --count origin/main..HEAD`).
  Ver §8.5.
- CI funcionará en el primer push (ya existe `package-lock.json`).

## 7. Validación final

- **Tests** → ✅ 64/64
- **Lint** → ✅ 0 problemas
- **Build** → No aplica (no hay build de producción, por diseño)
- **Chrome headless (HTTP)** → ✅ arranca con 16 celdas/2 fichas
- **Chrome headless (`file://`)** → ✅ muestra el aviso con instrucciones
- **Servidor propio** → ✅ responde `200 text/html`; `EADDRINUSE` con mensaje amigable
- **Flujos interactivos manuales en navegador** → ⚠️ la sesión no tenía navegador
  de escritorio conectado; los cubre `tests/flujo.test.js` + `tests/markup.test.js`
  (jsdom con el markup real). Conviene un paseo manual: bienvenida, flechas,
  swipe, deshacer tras game over, bomba, nueva partida, récord y tema.

## 8. Pendientes conocidos (y por qué se dejaron)

1. **`og:image`** — no hay imagen en el proyecto; si se quiere, subir una
   captura y usar URL absoluta. No se inventó una.
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
index.html ──<script type="module">──► game.js (UI: entradas, render,
                                          overlays, power-ups, storage)
                                            │ importa
                                            ▼
                                       game-core.js (puro: datos → datos)
                                            ▲
                                            │ importa
                              tests (Vitest: núcleo en nodo, UI en jsdom)
scripts/servidor.mjs  → npm start (dev, sin dependencias)
.github/workflows/ci.yml → lint + tests en push/PR
```

## 10. Roadmap de mejoras propuestas (no implementadas)

> Propuesta de 2026-10-03 para que el juego "deje de ser simple" y se convierta
> en una app como tal. **Nada de esto está hecho**: es una lista para decidir
> por dónde seguir. El primer paso (ordenar el historial en commits atómicos,
> el "Bloque 4" original) ya está completo; después el orden sugerido era
> **Bloque 1 → PWA (Bloque 3) → Bloque 2**.

### Bloque 1 — Se siente jugable (impacto alto, esfuerzo medio)

- **Animación real**: slide de fichas + pop de fusión + spawn, manteniendo
  identidad de nodos en vez de recrearlos (FLIP o `transform`).
  *Ojo: hoy `render()` reconstruye las 16 celdas (§ "Algoritmo intacto"); esto
  obliga a cambiar esa decisión y a actualizar `AGENTS.md`.*
- **Puntos flotantes** (`+8` subiendo sobre la celda fusionada).
- **Háptica en móvil** (`navigator.vibrate` en fusión) y **sonido con Web Audio
  API** (tonos generados, sin archivos de audio) con interruptor on/off.
- **Guardar partida en curso** → recargas y sigues donde estabas (hoy solo se
  persisten récord y tema).

### Bloque 2 — Profundidad (retención)

- **Tamaños de tablero**: 3×3 / 4×4 / 5×5 / 6×6 (`TAMANO` ya es constante
  paramétrica; ojo con el CSS y con el cálculo del índice de celda).
- **Panel de estadísticas**: partidas jugadas, puntuación media, ficha máxima,
  tiempo medio, últimas partidas.
- **Reto diario con semilla fija**: `agregarFicha` ya inyecta `rnd`, así que
  hacer una partida determinista (mismo tablero para todos + código
  compartible) es **muy barato** y es el gancho de retención más clásico.
- **Progresión de power-ups**: ganar deshacer/bomba por hitos (llegar a 512,
  etc.) en vez de números fijos.

### Bloque 3 — Que sea "una app" literalmente

- **PWA**: manifest + service worker offline + iconos 192/512 + `theme-color`.
  Se instala en el móvil y funciona sin conexión, **sin build**.
- **Compartir tablero**: Web Share API + captura en canvas (de paso cubre el
  `og:image` de §8.1).
- ⚠️ **Leaderboard online**: **fuera de la recomendación**, porque rompe el
  "estático sin dependencias" y exige backend.
