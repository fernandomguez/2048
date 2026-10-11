// @vitest-environment jsdom
// Reconciliador de render(): identidad de nodos y contrato de #board.children.
// textosCeldas() es EL MISMO helper que tests/flujo.test.js: si aquí devuelve
// los mismos valores, render() sigue representando el estado en el DOM de
// forma equivalente a la reconstrucción anterior.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as juego from "../game.js";
import { pintarFlotantes } from "../game-fx.js";

// --- Helpers ---
function textosCeldas() {
  return [...document.getElementById("board").children]
    .filter(c => c.textContent !== "")
    .map(c => c.textContent);
}

function celdas() {
  return [...document.getElementById("board").children];
}

// El .tile persistente de cada .cell (un hijo por slot).
function fichas() {
  return celdas().map(c => c.firstElementChild);
}

// Tablero inicial determinista (Math.random mockeado en tests/setup.js):
// [[2,2,0,0], ...] → mover a la izquierda → [[4,2,0,0], ...] con 4 puntos.
const INICIAL = ["2", "2"];
const TRAS_FUSION_IZQUIERDA = ["4", "2"];

beforeEach(() => {
  juego.nuevaPartida();           // única fuente de verdad para reiniciar el estado
  document.getElementById("welcome").hidden = true;
});

describe("reconciliador de render(): identidad de nodos", () => {
  it("las 16 .cell y sus .tile conservan la MISMA referencia tras mover()", () => {
    const celdasAntes = celdas();
    const fichasAntes = fichas();

    juego.mover("left"); // fusión 2+2 → 4 y spawn

    const celdasDespues = celdas();
    const fichasDespues = fichas();
    expect(celdasDespues).toHaveLength(16);
    expect(fichasDespues).toHaveLength(16);
    celdasDespues.forEach((celda, i) => expect(celda).toBe(celdasAntes[i]));
    fichasDespues.forEach((ficha, i) => expect(ficha).toBe(fichasAntes[i]));
  });

  it("cada .cell tiene exactamente un .tile y nada más entra en #board", () => {
    for (const celda of celdas()) {
      expect(celda.classList.contains("cell")).toBe(true);
      expect(celda.children).toHaveLength(1);
      expect(celda.firstElementChild.classList.contains("tile")).toBe(true);
    }
  });

  it("#board.children.length === 16 tras una fusión (con spawn)", () => {
    juego.mover("left");

    expect(document.getElementById("board").children.length).toBe(16);
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
  });

  it("#board.children.length === 16 tras un movimiento con spawn sin fusión", () => {
    juego.mover("left");  // deja [[4,2,0,0], ...]
    juego.mover("right"); // cambia sin fusionar: solo spawn

    expect(document.getElementById("board").children.length).toBe(16);
    expect(document.getElementById("score").textContent).toBe("4"); // sin puntos nuevos
  });

  it("#board.children.length === 16 tras la bomba (y misma identidad)", () => {
    const celdasAntes = celdas();

    juego.toggleBomba();
    celdasAntes.find(c => c.textContent !== "").click();

    expect(document.getElementById("board").children.length).toBe(16);
    celdas().forEach((celda, i) => expect(celda).toBe(celdasAntes[i]));
    expect(textosCeldas()).toEqual(["2"]); // igual que en flujo.test.js
  });

  it("textosCeldas() equivale a la reconstrucción anterior", () => {
    expect(textosCeldas()).toEqual(INICIAL);

    juego.mover("left");

    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    expect(celdas().filter(c => c.textContent === "")).toHaveLength(14);
    // El número vive en el .tile; la .cell lo agrega en textContent.
    expect(celdas()[0].firstElementChild.textContent).toBe("4");
  });

  it(".nueva marca solo la celda de la ficha nueva y se retira si ya no toca", () => {
    juego.mover("left"); // spawn en la primera celda vacía → [0,1]

    const conNueva = celdas().filter(c => c.classList.contains("nueva"));
    expect(conNueva).toHaveLength(1);
    expect(conNueva[0].textContent).toBe("2");

    juego.mover("left"); // sin cambio: no hay ficha recién aparecida
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    expect(celdas().some(c => c.classList.contains("nueva"))).toBe(false);
  });

  it(".nueva RE-FIRE en nodo reutilizado: se quita, fuerza reflow y se reañade", () => {
    juego.mover("left"); // la celda [0,1] queda con .nueva
    const celda = celdas()[1];
    expect(celda.classList.contains("nueva")).toBe(true);

    // Espejamos el reflow forzado para ver el estado de la clase en ese instante.
    let reflows = 0;
    let claseDuranteReflow = null;
    Object.defineProperty(celda, "offsetWidth", {
      configurable: true,
      get() {
        reflows++;
        claseDuranteReflow = celda.classList.contains("nueva");
        return 0;
      },
    });

    // Nueva partida: dos spawns → la segunda ficha cae otra vez en [0,1],
    // pero esta vez sobre el MISMO nodo (ya existente).
    juego.nuevaPartida();

    expect(reflows).toBeGreaterThan(0);        // forzó reflow en esa celda…
    expect(claseDuranteReflow).toBe(false);    // …con .nueva YA quitada
    expect(celda.classList.contains("nueva")).toBe(true); // …y vuelta a añadirla

    delete celda.offsetWidth; // no contaminar a los tests siguientes
  });
});

// ============================================================
//  Task 4 — capa FX (#fx-layer): slide, fantasmas, pop y guards
// ============================================================

describe("capa FX: sin APIs de animación modernas (jsdom real)", () => {
  it("mover('left') no lanza sin AudioContext, vibrate ni element.animate", () => {
    // Entorno jsdom puro: ninguna de esas APIs existe.
    expect(typeof window.AudioContext).toBe("undefined");
    expect(typeof navigator.vibrate).toBe("undefined");
    expect(typeof Element.prototype.animate).toBe("undefined");

    expect(() => juego.mover("left")).not.toThrow();

    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    expect(document.getElementById("board").children).toHaveLength(16);
  });

  it("ningún nodo .fx-* entra en #board (la capa vive fuera)", () => {
    juego.mover("left"); // con fusión: crea fantasma y flotante FX

    const dentroDelTablero = document.getElementById("board")
      .querySelectorAll('[class*="fx-"]');
    expect(dentroDelTablero).toHaveLength(0);
    expect(document.getElementById("board").children).toHaveLength(16);
    // El pop es una CLASE sobre la celda destino existente, no un nodo nuevo.
    expect(celdas().filter(c => c.classList.contains("fusionando"))).toHaveLength(1);
  });

  it("sin layout (rects a 0) no se aplica transform ni fantasma: nunca NaN", () => {
    juego.mover("left");

    for (const ficha of fichas()) {
      expect(ficha.style.transform).toBe("");
    }
    expect(document.querySelectorAll("#fx-layer .fx-fantasma")).toHaveLength(0);
    expect(document.getElementById("fx-layer").innerHTML).not.toContain("NaN");
  });
});

describe("capa FX: slide, fantasmas y limpieza (con layout simulado)", () => {
  let rectOriginal;

  beforeEach(() => {
    // Falso layout: celdas de 90px separadas 10px en una rejilla 4x4 con
    // origen en (0,0). La capa #fx-layer ocupa exactamente el mismo hueco.
    rectOriginal = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      const board = document.getElementById("board");
      if (board && board.contains(this)) {
        const indice = [...board.children].indexOf(this);
        if (indice >= 0) {
          return {
            left: (indice % 4) * 100,
            top: Math.floor(indice / 4) * 100,
            width: 90,
            height: 90,
            right: (indice % 4) * 100 + 90,
            bottom: Math.floor(indice / 4) * 100 + 90,
          };
        }
      }
      return { left: 0, top: 0, width: 90, height: 90, right: 90, bottom: 90 };
    };
  });

  afterEach(() => {
    Element.prototype.getBoundingClientRect = rectOriginal;
  });

  it("la .tile destino parte con translate(dx,dy) desde el origen del slide", () => {
    juego.mover("left"); // [0,1] → [0,0]: dx = 100 − 0

    expect(fichas()[0].style.transform).toBe("translate(100px, 0px)");
  });

  it("la fuente que no es el origen del slide pinta un fantasma en #fx-layer", () => {
    juego.mover("left");

    const fantasma = document.querySelector("#fx-layer .fx-fantasma");
    expect(fantasma).not.toBeNull();
    expect(fantasma.textContent).toBe("2");   // valor en el estado previo
    expect(fantasma.dataset.value).toBe("2"); // reutiliza la rampa data-value
    expect(fantasma.classList.contains("cell")).toBe(true);
    expect(fantasma.parentElement.id).toBe("fx-layer");
  });

  it("limpiarFx() tras nuevaPartida() vacía la capa y los .tile sin estilos", () => {
    juego.mover("left");
    expect(document.getElementById("fx-layer").children.length).toBeGreaterThan(0);

    juego.nuevaPartida();

    expect(document.getElementById("fx-layer").children).toHaveLength(0);
    for (const ficha of fichas()) {
      expect(ficha.style.transform).toBe("");
      expect(ficha.style.transition).toBe("");
    }
    expect(celdas().some(c => c.classList.contains("fusionando"))).toBe(false);
  });

  it("tres movimientos rápidos no acumulan fantasmas", () => {
    juego.mover("left"); // fusión 2+2 → 1 fantasma
    expect(document.querySelectorAll("#fx-layer .fx-fantasma")).toHaveLength(1);

    juego.mover("right"); // cambia sin fusionar → el turno anterior se limpia
    expect(document.querySelectorAll("#fx-layer .fx-fantasma")).toHaveLength(0);

    juego.mover("left"); // sigue sin fusión → nada se reacumula
    expect(document.querySelectorAll("#fx-layer .fx-fantasma")).toHaveLength(0);
    expect(document.getElementById("fx-layer").children).toHaveLength(0);
  });

  it("prefers-reduced-motion: solo estado final (sin transform/fantasma/pop)", () => {
    const matchMediaOriginal = window.matchMedia;
    window.matchMedia = (consulta) => ({
      matches: consulta.includes("prefers-reduced-motion"),
      addEventListener() {},
      removeEventListener() {},
    });
    try {
      juego.mover("left");

      expect(fichas()[0].style.transform).toBe("");
      expect(document.querySelectorAll("#fx-layer .fx-fantasma")).toHaveLength(0);
      expect(celdas().some(c => c.classList.contains("fusionando"))).toBe(false);
      expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA); // estado final aplicado
    } finally {
      window.matchMedia = matchMediaOriginal;
    }
  });
});

// ============================================================
//  Task 5 — overlay de fin diferido con setTimeout(DURACION_ANIMACION_FIN)
// ============================================================

// Juega en bucle determinista (Math.random = 0 en tests/setup.js) hasta que
// ningún movimiento cambia el tablero: partida bloqueada. Son ~173 iteraciones
// y TODO el bloque es síncrono, así que el timer de 260 ms pendiente no puede
// dispararse hasta que el test espere explícitamente.
function jugarHastaTableroBloqueado() {
  const direcciones = ["left", "up", "right", "down"];
  for (let i = 0; i < 500; i++) {
    let huboCambio = false;
    for (const direccion of direcciones) {
      const antes = celdas().map(c => c.textContent).join(",");
      juego.mover(direccion);
      const despues = celdas().map(c => c.textContent).join(",");
      if (antes !== despues) {
        huboCambio = true;
        break;
      }
    }
    if (!huboCambio) return;
  }
  throw new Error("no se alcanzó un tablero bloqueado");
}

describe("overlay de fin diferido (Task 5)", () => {
  it("el overlay NO aparece en el mismo tick que mover() hacia game over", () => {
    jugarHastaTableroBloqueado();

    expect(document.getElementById("overlay").hidden).toBe(true);
  });

  it("el overlay APARECE tras la espera (patrón setTimeout real)", async () => {
    jugarHastaTableroBloqueado();
    expect(document.getElementById("overlay").hidden).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 320)); // > DURACION_ANIMACION_FIN

    expect(document.getElementById("overlay").hidden).toBe(false);
    expect(document.getElementById("overlay-title").textContent).toBe("Sin movimientos");
  });

  it("deshacer() durante la ventana cancela el overlay", async () => {
    jugarHastaTableroBloqueado();

    // La partida completa alcanzó la ficha 128: D6 (sub-bloque 2a) ya concedió
    // +1 deshacer, así que el contador son 4 antes del deshacer y 3 después
    // (3 iniciales + 1 de hito − 1 consumido). Excepción aprobada a la línea
    // roja "no tocar las suites existentes": una sola línea, autorizada por el
    // usuario en la fase 03 del sub-bloque 2a.
    juego.deshacer(); // dentro de la ventana de 260 ms

    expect(document.getElementById("undo-count").textContent).toBe("3"); // consume un uso
    await new Promise(resolve => setTimeout(resolve, 320));

    expect(document.getElementById("overlay").hidden).toBe(true); // nunca llegó
  });

  it("nuevaPartida() durante la ventana cancela el overlay", async () => {
    jugarHastaTableroBloqueado();

    juego.nuevaPartida();
    await new Promise(resolve => setTimeout(resolve, 320));

    expect(document.getElementById("overlay").hidden).toBe(true);
    expect(textosCeldas()).toEqual(INICIAL);
  });

  // Regresión de la enmienda de la decisión 11 (fase 05-fix): mientras haya
  // un overlay de fin PENDIENTE el estado ya dice game over aunque el diálogo
  // siga oculto, así que la bomba no se arma (misma filosofía que
  // hayModalAbierto()). Sin este bloqueo la bomba operaría sobre un tablero
  // que se va a cerrar y se gastaría en vano.
  it("durante la ventana la bomba NO se arma (y el overlay llega igual)", async () => {
    jugarHastaTableroBloqueado();
    expect(document.getElementById("overlay").hidden).toBe(true); // ventana de 260 ms

    juego.toggleBomba(); // bloqueado: timerOverlayFin !== null

    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);
    expect(document.getElementById("bomb-count").textContent).toBe("1"); // sin gastar

    // Solo se bloquea la bomba: el aviso de fin se dispara tras la espera
    // (aquí también se ejercita la revalidación esGameOver(board) del callback).
    await new Promise(resolve => setTimeout(resolve, 320));
    expect(document.getElementById("overlay").hidden).toBe(false);
    expect(document.getElementById("overlay-title").textContent).toBe("Sin movimientos");
  });
});

// ============================================================
//  Task 6 — puntos flotantes +N
// ============================================================

describe("puntos flotantes +N (Task 6)", () => {
  it("mover() con fusión pinta un .fx-flotante '+4' en #fx-layer", () => {
    juego.mover("left"); // fusión 2+2 → 4

    const flotante = document.querySelector("#fx-layer .fx-flotante");
    expect(flotante).not.toBeNull();
    expect(flotante.textContent).toBe("+4");
    expect(flotante.parentElement.id).toBe("fx-layer");
  });

  it("#board.children.length === 16 con flotantes vivos", () => {
    juego.mover("left");

    expect(document.querySelectorAll("#fx-layer .fx-flotante").length).toBeGreaterThan(0);
    expect(document.getElementById("board").children).toHaveLength(16);
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA); // el +4 no contamina textos
    // Ningún nodo .fx-* dentro del tablero.
    expect(document.getElementById("board").querySelectorAll('[class*="fx-"]')).toHaveLength(0);
  });

  it("pintarFlotantes() con dos fusiones crea dos nodos", () => {
    pintarFlotantes([
      { en: [0, 0], valor: 4, desde: [[0, 0], [0, 1]] },
      { en: [2, 3], valor: 8, desde: [[2, 2], [2, 3]] },
    ]);

    const flotantes = [...document.querySelectorAll("#fx-layer .fx-flotante")];
    expect(flotantes).toHaveLength(2);
    expect(flotantes.map(f => f.textContent)).toEqual(["+4", "+8"]);
  });

  it("limpiarFx() (vía nuevaPartida) vacía la capa con flotantes vivos", () => {
    juego.mover("left");
    expect(document.querySelector("#fx-layer .fx-flotante")).not.toBeNull();

    juego.nuevaPartida();

    expect(document.getElementById("fx-layer").children).toHaveLength(0);
    for (const ficha of fichas()) expect(ficha.style.transform).toBe("");
  });
});
