import { vi } from "vitest";

// Solo en entornos con DOM (jsdom): fixture mínimo con los ids que game.js
// necesita al cargarse. Los tests de núcleo (node) no llevan DOM.
if (typeof document !== "undefined") {
  document.body.innerHTML = `
    <main class="app">
      <header class="topbar">
        <div class="panel">
          <div class="score-box">
            <span class="score-label">Puntos</span>
            <span class="score-value" id="score">0</span>
          </div>
          <div class="score-box">
            <span class="score-label">Récord</span>
            <span class="score-value" id="best">0</span>
          </div>
          <button class="btn ghost icon-btn theme-toggle" id="theme-toggle">
            <span id="theme-icon">🌙</span>
          </button>
        </div>
      </header>
      <div class="actions">
        <button class="btn" id="new-game">Nueva partida</button>
        <button class="btn ghost icon-btn" id="undo">
          <span class="count" id="undo-count">3</span>
        </button>
        <button class="btn ghost icon-btn" id="bomb">
          <span class="count" id="bomb-count">1</span>
        </button>
        <button class="btn ghost fx-toggle" id="fx-toggle" role="switch" aria-checked="true">
          <span aria-hidden="true">🔊</span> Sonido
        </button>
        <button class="btn ghost icon-btn tap-44" id="install" hidden aria-label="Instalar la aplicación">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"></svg>
        </button>
        <button class="btn ghost icon-btn tap-44" id="daily" aria-pressed="false" aria-label="Reto diario">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"></svg>
        </button>
        <button class="btn ghost icon-btn tap-44" id="replay"
                aria-label="Ver jugada" aria-expanded="false" aria-controls="replay-panel">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"></svg>
        </button>
        <button class="btn ghost icon-btn tap-44" id="share" aria-label="Compartir tablero">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"></svg>
        </button>
      </div>
      <div id="replay-panel" hidden>
        <label for="replay-input">Pega el mensaje o el código de una jugada compartida</label>
        <textarea id="replay-input" rows="2" autocomplete="off" spellcheck="false"></textarea>
        <div class="replay-actions">
          <button class="btn tap-44" id="replay-start">Reproducir</button>
          <button class="btn ghost tap-44" id="replay-cancel">Cancelar</button>
          <button class="btn tap-44" id="replay-stop" hidden>Parar</button>
        </div>
      </div>
      <div class="board-wrap">
        <div id="board" class="board" tabindex="-1"></div>
        <div id="fx-layer" aria-hidden="true"></div>
        <div class="overlay" id="overlay" hidden role="dialog" aria-modal="true"
             aria-labelledby="overlay-title">
          <div class="overlay-card">
            <h2 class="overlay-title" id="overlay-title">Fin</h2>
            <p class="overlay-text" id="overlay-text"></p>
            <div class="overlay-actions" id="overlay-actions"></div>
          </div>
        </div>
        <div class="overlay welcome-overlay" id="welcome" hidden role="dialog"
             aria-modal="true" aria-labelledby="welcome-title">
          <div class="welcome-card">
            <h2 class="welcome-title" id="welcome-title">Bienvenido a 2048</h2>
            <div class="overlay-actions">
              <button class="btn" id="welcome-close">Entendido</button>
            </div>
          </div>
        </div>
      </div>
      <div class="toast" id="status" role="status" aria-live="polite" aria-atomic="true" hidden></div>
    </main>
  `;

  // jsdom no implementa matchMedia; iniciarTema() lo usa al arrancar.
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    });
  }

  // Aleatoriedad determinista en tests de UI: la primera ficha vacía y valor 2.
  // Así el tablero inicial es siempre [[2,2,0,0], ...] y los movimientos son
  // predecibles (una jugada con cambio siempre genera 3 fichas).
  vi.spyOn(Math, "random").mockReturnValue(0);
}
