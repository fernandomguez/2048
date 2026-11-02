# Resumen del proyecto 2048

> Nota de contexto (2026-10-11): documento de orientación rápida tras cerrar
> el sub-bloque 2d. El detalle técnico vive en `docs/DOCUMENTACION.md` (§10) y la
> memoria operativa en `AGENTS.md`.

## Qué es

2048 clásico en HTML + CSS + JavaScript vanilla, **sin frameworks ni build**.
Se sirve por HTTP (`npm start` → localhost:8000). Estructura:

| Archivo | Qué hace |
| --- | --- |
| `js/game-core.js` | Reglas puras del juego (movimiento, fusión, RNG del reto, parser del replay). Sin DOM |
| `app/game.js` | Capa UI: entradas, render, overlays, persistencia, compartir |
| `app/game-fx.js` | Animaciones, sonido y vibración (sin estado de juego) |
| `js/game-share.js` | Dibuja la captura para compartir (canvas) |

## Cómo se juega (funcionalidades base)

- **Mover**: flechas del teclado o swipe en móvil.
- **Fusionar**: dos fichas iguales → una doble; sale una ficha nueva aleatoria.
- **Puntos + récord**: se guardan solos en `localStorage`.
- **Deshacer**: 3 usos por partida; revierte el último movimiento.
- **Bomba**: 1 uso; eliminas una ficha que te estorba.
- **Partida guardada**: recargas o vuelves atrás y sigues donde estabas.
- **Tema claro/oscuro**: sigue al sistema, con preferencia guardada.
- **Feedback**: sonido y vibración sintetizados, con interruptor 🔊.
- **Compartir**: captura del tablero vía Web Share / descarga / portapapeles.
- **Overlays**: bienvenida al entrar, victoria al llegar a 2048, fin de
  partida si te bloqueas. **El game over es definitivo** (decisión del
  2026-10-11: no hay rescate, el jugador es responsable de sus recursos).

## Extras (ya implementados)

### Reto diario — botón calendario (#daily)

- Cada día, el mismo tablero para todos (semilla = fecha local).
- Intentos ilimitados: mismo día ⇒ misma partida.
- Al compartir en reto, el mensaje lleva la fecha.

### Power-ups por hitos

- +1 deshacer al llegar a 128, 512 y 1024.
- +1 bomba al llegar a 256 y al 2048.

### Reproduce mi jugada — botón ▶ (#replay, sub-bloque 2d)

- Al compartir en reto se añade un código tipo
  `2048reto:2026-10-11:LLURDD`.
- Se lo pegas a tu amigo → él pega ese código en "Ver jugada" → **el juego
  reproduce tu partida entera**, paso a paso, sobre la semilla de ese día.
- Sirve para **cualquier fecha** (ver el reto de ayer o de hace un mes).
- Tu partida en curso **no se pierde**: se pausa y vuelve al terminar o con
  "Parar". Durante la reproducción no cambian el récord ni se guarda nada.

## Qué se ha hecho (historial)

1. **Auditoría + Bloque 1** — el juego pasó de "funciona" a "se siente bien":
   animaciones reales, sonido, restaure de partida, tests.
2. **Bloque 3 (PWA)** — instalable en móvil/escritorio, service worker
   offline, iconos.
3. **Bloque 2a** — reto diario + power-ups por hitos.
4. **Game over definitivo** — quitado el rescate con deshacer (decisión del
   usuario).
5. **Bloque 2d** — replay de jugadas compartidas (commiteado y pusheado:
   `993bc66`).

**Estado actual** (2026-10-11): lint 0 · **230 tests / 14 suites** en verde ·
todo commiteado y en GitHub (`github.com/fernandomguez/2048`, rama `main`).

## Qué queda pendiente

- **2b** tamaños de tablero (3×3…6×6) — aplazado.
- **2c** panel de estadísticas — aplazado.
- Pase manual en navegador (checklist en `docs/DOCUMENTACION.md` §7).
- Elegir hosting (GitHub Pages / Netlify) — el juego ya es 100 % estático.
- Revisar la CI en la pestaña Actions de GitHub (el último push la dispara).

## Cómo retomar el trabajo

```bash
npm install     # primera vez
npm start       # juego en http://localhost:8000
npm test        # 230 tests en verde
npm run lint    # 0 problemas
```

Antes de tocar código: leer `AGENTS.md` (convenciones y hechos no obvios) y
la §10 de `docs/DOCUMENTACION.md` (roadmap y estado por sub-bloque).
