# 2048

El clásico **2048** en el navegador: desliza las fichas, fusiona números iguales
y llega a la ficha 2048. Hecho con **HTML, CSS y JavaScript vanilla**: sin
frameworks, sin build y sin dependencias de producción.

[![CI](https://github.com/fernandomguez/2048/actions/workflows/ci.yml/badge.svg)](https://github.com/fernandomguez/2048/actions/workflows/ci.yml)

## Características

**Juego**

- Controles con **flechas del teclado** y **swipe** en móvil.
- **Deshacer** (3 usos) y **bomba** para eliminar una ficha (1 uso).
- **Power-ups por hitos**: +1 deshacer al llegar a 128, 512 y 1024; +1 bomba al
  llegar a 256 y a 2048.
- **Partida guardada automáticamente**: recarga o vuelve atrás y sigues donde
  estabas (tablero, puntos, deshacer y bombas).
- Puntuación y **récord** persistentes en `localStorage`.
- El game over es definitivo: no hay rescate una vez bloqueado el tablero.

**Reto diario y replay**

- **Reto diario**: cada día el mismo tablero para todos (semilla derivada de la
  fecha local), con intentos ilimitados.
- **Reproduce mi jugada**: al compartir en modo reto se añade un código
  `2048reto:<fecha>:<secuencia>`. Quien lo pegue en el panel de replay ve la
  partida entera reproducida paso a paso, de cualquier fecha. Tu partida en
  curso no se pierde ni se modifica durante la reproducción.

**Experiencia**

- Animaciones de deslizamiento, fusión y aparición de fichas, con puntos
  flotantes (`+4`, `+8`…). Respeta `prefers-reduced-motion`.
- Sonido y vibración sintetizados (Web Audio, sin archivos de audio), con
  interruptor.
- Tema **claro/oscuro** (sigue al sistema, con preferencia guardada).
- **Compartir** una captura del tablero (Web Share, descarga o portapapeles).
- **PWA instalable** y jugable sin conexión gracias al service worker.
- Diseño adaptado a móvil, escritorio y pantallas horizontales bajas.

## Cómo ejecutarlo

Es una aplicación estática, pero usa módulos ES, así que hay que servirla por
HTTP. **Abrir `index.html` con doble clic (`file://`) no funciona**: el
navegador bloquea los módulos (si ocurre, el juego muestra un aviso con estas
instrucciones).

```bash
git clone https://github.com/fernandomguez/2048.git
cd 2048
npm install      # solo dependencias de desarrollo; no hace falta para jugar
npm start        # servidor local incluido, sin dependencias
```

Abre <http://localhost:8000>. Alternativas sin `npm start`:

```bash
python -m http.server 8000     # o: npx serve .
```

Al ser 100 % estático, también se puede publicar tal cual en GitHub Pages,
Netlify o cualquier hosting de ficheros.

## Desarrollo

```bash
npm test         # tests (Vitest + jsdom)
npm run lint     # ESLint
```

Los tests y el lint se ejecutan en cada push y pull request con GitHub Actions.
No hay paso de build: los ficheros se sirven tal cual.

## Arquitectura

La lógica del juego está separada de la interfaz y de los efectos:

```
.
├── index.html · manifest.json · sw.js   # raíz: el service worker debe vivir aquí (scope)
├── js/      # módulos puros (sin DOM): reglas y dibujo de la captura
├── app/     # interfaz: entradas, render, overlays y efectos
├── css/     # estilos y temas
├── icons/   # iconos PWA y og:image
├── tests/   # Vitest (14 suites)
├── tools/   # servidor local y generador de iconos (solo desarrollo)
└── docs/    # documentación de diseño y estado del proyecto
```

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Marcado, meta tags y accesibilidad |
| `js/game-core.js` | Reglas puras: movimiento, fusión, RNG del reto, parser del replay. Sin DOM ni `localStorage` |
| `app/game.js` | Capa de UI: entradas, render, overlays, persistencia, compartir e instalación |
| `app/game-fx.js` | Efectos: animaciones, sonido Web Audio y háptica (sin estado de juego) |
| `js/game-share.js` | Dibujo de la captura para compartir (canvas 2D) |
| `css/style.css` | Temas claro/oscuro y layout |
| `sw.js`, `manifest.json` | PWA: service worker y manifiesto |
| `tools/` | Servidor local y generador de iconos (solo desarrollo) |
| `tests/` | 14 suites, 230 tests: reglas, flujos de UI, persistencia, animación, PWA, compartir, reto y replay |

Para más detalle sobre decisiones de diseño y convenciones, consulta
[`AGENTS.md`](AGENTS.md) y [`docs/DOCUMENTACION.md`](docs/DOCUMENTACION.md).

## Privacidad

El juego no usa analítica ni envía datos a ningún servidor. Todo se guarda en
tu navegador (`localStorage`). La única petición externa es la fuente
*Space Grotesk* de Google Fonts.
