// @vitest-environment jsdom
// ============================================================
//  Task 10 — Compartir: snapshot, canvas desconectado, cadena de
//  fallbacks, toast, instalación y 2ª entrada en los overlays.
//  Reglas que blinda aquí (G8 / riesgos 2, 5, 7, 12):
//    · cero escrituras en localStorage al arrancar ni al compartir;
//    · el canvas de la captura NUNCA se appendea (isConnected false) y
//      toBlob no se invoca en jsdom (riesgo de test colgado);
//    · el toast se oculta SOLO con setTimeout, nunca con
//      transitionend/animationend;
//    · AbortError corta la cadena (sin descarga sorpresa);
//    · RAMPA de game-share.js no puede derivar de style.css.
//  Este archivo solo AÑADE una suite: no modifica ninguna existente.
// ============================================================
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as juego from "../app/game.js";
import { RAMPA, PALETAS, MEDIDAS_CAPTURA, dibujarCaptura } from "../js/game-share.js";

// OJO con `new URL("literal", import.meta.url)`: Vite lo reescribe a la URL
// del servidor de tests (http://localhost:3000/…) y el scheme ya no es file.
// Igual que markup.test.js, la ruta pasa por una FUNCIÓN (argumento
// variable), que el transformador no analiza.
function leer(ruta) {
  return readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), "utf8");
}

const CSS = leer("../css/style.css"); // leído una sola vez en el módulo (patrón markup.test.js)

// --- HELPERS ---

function estado(id) {
  return document.getElementById(id);
}

function flujo() {
  // Deja que TODOS los microtasks pendientes (la cadena async de
  // compartir()) se resuelvan antes de seguir asertando.
  return new Promise((resolver) => setTimeout(resolver, 0));
}

// Stub de la API 2D reducida que registra las llamadas. A propósito NO
// implementa roundRect: ejercita el fallback a fillRect del contrato D9.
function crearCtxStub() {
  const llamadas = { rects: [], rellenos: [], textos: [] };
  const ctx = {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    globalAlpha: 1,
    fillRect(x, y, w, h) {
      llamadas.rects.push({ x, y, w, h });
      llamadas.rellenos.push(ctx.fillStyle);
    },
    beginPath() {},
    closePath() {},
    fill() {
      llamadas.rellenos.push(ctx.fillStyle); // esquinas redondeadas sin roundRect
    },
    createLinearGradient() {
      return { addColorStop() {} };
    },
    fillText(texto, x, y) {
      llamadas.textos.push({ texto, x, y });
    },
    measureText(texto) {
      return { width: String(texto).length * 12 };
    },
  };
  return { ctx, llamadas };
}

beforeEach(() => {
  estado("welcome").hidden = true; // sin modal: el botón #share es accesible
  juego.nuevaPartida();            // estado conocido + overlay de fin cerrado
  const status = estado("status");
  status.hidden = true;            // cada test parte con el toast oculto
  status.textContent = "";
});

afterEach(() => {
  // Los stubs de navigator/URL se restauran en cada test que los toque;
  // aquí solo se garantiza que el botón Instalar vuelve a su estado inicial.
  estado("install").hidden = true;
});

// ============================================================
//  1) obtenerSnapshot(): copia pura, coherente con el DOM, cero escrituras
// ============================================================

describe("obtenerSnapshot()", () => {
  it("copia el tablero 4×4, refleja el DOM y NO escribe en localStorage", async () => {
    const snapshot = juego.obtenerSnapshot();

    expect(snapshot.board).toHaveLength(4);
    for (const fila of snapshot.board) expect(fila).toHaveLength(4);
    expect(snapshot.score).toBe(Number(estado("score").textContent));
    expect(snapshot.best).toBe(Number(estado("best").textContent));
    expect(["dark", "light"]).toContain(snapshot.tema);

    // Mutar el snapshot NO toca el tablero del juego (copia fila a fila).
    snapshot.board[0][0] = 9999;
    expect(juego.obtenerSnapshot().board[0][0]).not.toBe(9999);

    // Compartir tampoco persiste nada (esquemas stats2048/partida2048 intactos).
    estado("share").click();
    await flujo();

    expect(localStorage.getItem("stats2048")).toBeNull();
    expect(localStorage.getItem("partida2048")).toBeNull();
  });
});

// ============================================================
//  2) Click de #share con TODAS las APIs ausentes
// ============================================================

describe("#share sin Web Share, canvas ni portapapeles", () => {
  it("no lanza, muestra el toast y no añade un tercer diálogo", async () => {
    expect(navigator.share).toBeUndefined();
    expect(navigator.canShare).toBeUndefined();
    expect(navigator.clipboard).toBeUndefined();
    // Vitest inyecta un URL.createObjectURL de compatibilidad: se espía para
    // demostrar que sin captura la descarga TAMPOCO se intenta.
    const crearObjectURL = vi.spyOn(URL, "createObjectURL");

    try {
      expect(() => estado("share").click()).not.toThrow();
      await flujo();

      expect(crearObjectURL).not.toHaveBeenCalled();
      const status = estado("status");
      expect(status.hidden).toBe(false);
      expect(status.textContent).toBe("Este navegador no permite compartir");
      // Ni un tercer role="dialog" ni un aria-modal de más (invariante G4).
      expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
      expect(document.querySelectorAll('[aria-modal="true"]')).toHaveLength(2);
      expect(document.getElementById("board").children).toHaveLength(16);
    } finally {
      crearObjectURL.mockRestore();
    }
  });
});

// ============================================================
//  3) Canvas SIEMPRE desconectado y toBlob jamás invocado (riesgos 2 y 5)
// ============================================================

describe("captura en canvas", () => {
  it("el canvas creado queda desconectado y toBlob no se invoca en jsdom", async () => {
    const creados = [];
    const originalCrear = document.createElement;
    document.createElement = function (...argumentos) {
      const elemento = originalCrear.apply(document, argumentos);
      if (argumentos[0] === "canvas") creados.push(elemento);
      return elemento;
    };
    // Si toBlob se llegara a invocar, su callback nunca se ejecuta en jsdom y
    // el await colgaría el test hasta timeout: el guard lo impide.
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, "toBlob");

    try {
      estado("share").click();
      await flujo();

      expect(creados).toHaveLength(1);
      expect(creados[0].isConnected).toBe(false); // ni #board ni #fx-layer
      expect(toBlob).not.toHaveBeenCalled();
      expect(document.getElementById("board").children).toHaveLength(16);
      expect(document.getElementById("fx-layer").children).toHaveLength(0);
    } finally {
      document.createElement = originalCrear;
      toBlob.mockRestore();
    }
  });
});

// ============================================================
//  4) Toast: SOLO setTimeout, nunca transitionend/animationend
// ============================================================

describe("toast #status", () => {
  it("se oculta exactamente al vencer DURACION_TOAST, sin eventos de transición", async () => {
    vi.useFakeTimers();
    try {
      await juego.compartir(); // todas las APIs ausentes → toast de último recurso

      const status = estado("status");
      expect(status.hidden).toBe(false);

      // Un miliseguno antes sigue visible… (nadie emitió transitionend ni
      // animationend: la ocultación NO depende de eventos de CSS).
      vi.advanceTimersByTime(juego.DURACION_TOAST - 1);
      expect(status.hidden).toBe(false);

      // …y al vencer el plazo se oculta solo.
      vi.advanceTimersByTime(1);
      expect(status.hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("un toast nuevo reinicia el temporizador (clearTimeout + setTimeout)", async () => {
    vi.useFakeTimers();
    try {
      await juego.compartir();
      vi.advanceTimersByTime(juego.DURACION_TOAST - 1); // casi por vencer

      await juego.compartir(); // toast nuevo: el reloj vuelve a 0

      vi.advanceTimersByTime(1);
      expect(estado("status").hidden).toBe(false); // el primer reloj se canceló

      vi.advanceTimersByTime(juego.DURACION_TOAST - 1);
      expect(estado("status").hidden).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// ============================================================
//  5) AbortError ⇒ silencio total y la cadena se corta
// ============================================================

describe("AbortError (cancelación del usuario)", () => {
  it("resuelve sin toast y SIN intentar la descarga", async () => {
    // Captura REAL para que el paso de archivos sí se intente: se stubbean
    // getContext/toBlob (como en el test 3, pero devolviendo un ctx válido).
    const { ctx } = crearCtxStub();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation((callback) => callback(new Blob(["png"], { type: "image/png" })));

    const canShare = vi.fn(() => true);
    const share = vi.fn(() => Promise.reject(new DOMException("cancelado", "AbortError")));
    navigator.canShare = canShare;
    navigator.share = share;
    // Espía el createObjectURL de compatibilidad: si la cadena NO se corta
    // tras el AbortError, el paso de descarga se intentaría y esto lo vería.
    const crearObjectURL = vi.spyOn(URL, "createObjectURL");

    try {
      await expect(juego.compartir()).resolves.toBeUndefined();

      expect(canShare).toHaveBeenCalledTimes(1);
      expect(share).toHaveBeenCalledTimes(1); // tras AbortError NO se repite el share de texto
      expect(crearObjectURL).not.toHaveBeenCalled(); // …ni llega a la descarga
      expect(estado("status").hidden).toBe(true);     // …ni muestra toast
      expect(document.getElementById("board").children).toHaveLength(16);
    } finally {
      getContext.mockRestore();
      toBlob.mockRestore();
      crearObjectURL.mockRestore();
      delete navigator.canShare;
      delete navigator.share;
    }
  });
});

// ============================================================
//  6) beforeinstallprompt / appinstalled (D7 / R6)
// ============================================================

describe("botón #install", () => {
  it("arranca oculto, se revela con beforeinstallprompt y appinstalled lo oculta", () => {
    expect(estado("install").hidden).toBe(true); // sin el evento, nada visible

    const evento = new Event("beforeinstallprompt", { cancelable: true });
    window.dispatchEvent(evento);

    expect(evento.defaultPrevented).toBe(true); // Chromium no debe mostrar su barra
    expect(estado("install").hidden).toBe(false);

    window.dispatchEvent(new Event("appinstalled"));
    expect(estado("install").hidden).toBe(true);
  });
});

// ============================================================
//  7) Anti-deriva: RAMPA (game-share.js) vs style.css (riesgo 12)
// ============================================================

describe("rampa de color", () => {
  it("RAMPA coincide fichero a fichero con .cell[data-value] de style.css", () => {
    const css = CSS;
    // Extrae cada regla .cell[data-value="N"] con su background y color.
    const enCss = new Map();
    for (const [, selectores, cuerpo] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const valores = [...selectores.matchAll(/\.cell\[data-value="(\d+)"\]/g)].map((m) => Number(m[1]));
      if (!valores.length) continue;
      const fondo = (cuerpo.match(/background:\s*([^;]+);/) || [])[1]?.trim();
      const color = (cuerpo.match(/color:\s*([^;]+);/) || [])[1]?.trim();
      for (const valor of valores) enCss.set(valor, { fondo, color });
    }

    // Mismo conjunto de valores en ambos lados (2 … 8192).
    expect([...enCss.keys()].sort((a, b) => a - b)).toEqual(
      Object.keys(RAMPA).map(Number).sort((a, b) => a - b)
    );

    for (const [valor, entrada] of Object.entries(RAMPA)) {
      const regla = enCss.get(Number(valor));
      expect(regla, `falta .cell[data-value="${valor}"] en style.css`).toBeDefined();
      expect(regla.color, `color de ${valor}`).toBe(entrada.texto);
      if (entrada.degradado) {
        expect(regla.fondo).toContain("linear-gradient");
        expect(regla.fondo).toContain(entrada.degradado[0]);
        expect(regla.fondo).toContain(entrada.degradado[1]);
      } else {
        expect(regla.fondo, `fondo de ${valor}`).toBe(entrada.fondo);
      }
    }
  });
});

// ============================================================
//  8) dibujarCaptura() contra un ctx stub (D3)
// ============================================================

describe("dibujarCaptura()", () => {
  it("pinta ≥16 rects de tablero, la marca 2048 y el fondo del tema ACTIVO primero", () => {
    const snapshot = juego.obtenerSnapshot();
    const { ctx, llamadas } = crearCtxStub();

    dibujarCaptura(ctx, snapshot, MEDIDAS_CAPTURA.CAPTURA);

    // Tablero 4×4 completo (huecos + fichas) o más: fondo, cajas y celdas.
    expect(llamadas.rects.length).toBeGreaterThanOrEqual(16);
    // Marca "2048" de la cabecera.
    expect(llamadas.textos.map((t) => t.texto)).toContain("2048");
    // Primer relleno = fondo del tema que el usuario ve (decisión D3).
    expect(llamadas.rellenos[0]).toBe(PALETAS[snapshot.tema].bg);
    expect(PALETAS[snapshot.tema].bg).toBe("#f1f2f6"); // tema claro del fixture jsdom
  });
});

// ============================================================
//  9) 2ª entrada de compartir en los overlays de fin
// ============================================================

describe("2ª entrada: botón Compartir en los overlays", () => {
  it("game over: 'Nueva partida' sigue PRIMERO y 'Compartir' es el último", async () => {
    juego.mostrarGameOver();

    const botones = [...document.querySelectorAll("#overlay-actions button")];
    expect(botones).toHaveLength(2);
    expect(botones[0].textContent).toBe("Nueva partida"); // el foco sigue aquí
    expect(botones[1].textContent).toBe("Compartir");
    expect(document.activeElement).toBe(botones[0]); // flujo.test.js:104
    expect(document.getElementById("board").children).toHaveLength(16);

    // El overlay NO se cierra ni se mueve el foco al compartir (un toast no
    // es un diálogo): el botón del overlay dispara la misma cadena.
    botones[1].click();
    await flujo();
    expect(estado("overlay").hidden).toBe(false);
    expect(document.activeElement).toBe(botones[0]);
    expect(estado("status").hidden).toBe(false); // toast de último recurso
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    expect(document.getElementById("board").children).toHaveLength(16);
  });

  it("victoria: 'Compartir' también cierra la lista, tras las dos acciones", () => {
    juego.mostrarVictoria();

    const botones = [...document.querySelectorAll("#overlay-actions button")];
    expect(botones.map((b) => b.textContent)).toEqual([
      "Seguir jugando",
      "Nueva partida",
      "Compartir",
    ]);
    expect(document.activeElement).toBe(botones[0]);
    expect(document.getElementById("board").children).toHaveLength(16);
  });
});
