// @vitest-environment jsdom
// ============================================================
//  Task 9 — Batería de integración y regresión del contrato
//
//  Suite cruzada que protege los riesgos capaces de romper suites enteras:
//    (i)   10 mover() (7 con fusión) → #board.children es 16 SIEMPRE y
//          #fx-layer sin residuos tras esperar los timers;
//    (ii)  textosCeldas() y el handler de la bomba miden SOLO
//          #board.children con flotantes y fantasmas vivos;
//    (iii) stats2048 intacta hasta el primer mover() y partida2048
//          no contamina stats2048;
//    (iv)  sin AudioContext, navigator.vibrate, element.animate ni
//          transitionend nada lanza;
//    (v)   prefers-reduced-motion simulado (matchMedia con matches: true)
//          → sin transform ni fantasmas y sin excepciones;
//    (vi)  flujo completo mover → fusión → deshacer → nueva partida →
//          restauración sin acumular nodos ni timers.
//
//  Esta batería solo AÑADE archivos: no modifica ninguno de los 8 suites
//  existentes.
// ============================================================
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as juego from "../game.js";

// --- HELPERS ---
function tablero() {
  return document.getElementById("board");
}

function capa() {
  return document.getElementById("fx-layer");
}

function celdas() {
  return [...tablero().children];
}

function fichas() {
  return celdas().map(c => c.firstElementChild);
}

function textosCeldas() {
  return celdas().filter(c => c.textContent !== "").map(c => c.textContent);
}

function puntos() {
  return document.getElementById("score").textContent;
}

function contador(id) {
  return document.getElementById(id).textContent;
}

function overlayVisible() {
  return document.getElementById("overlay").hidden === false;
}

// Tablero inicial determinista (Math.random mockeado en tests/setup.js):
// [[2,2,0,0], ...] → mover a la izquierda → [[4,2,0,0], ...] con 4 puntos.
const INICIAL = ["2", "2"];
const TRAS_FUSION_IZQUIERDA = ["4", "2"];

// Secuencia determinista para el caso (i): los 10 movimientos cambian el
// tablero, 7 de ellos fusionan y el marcador final queda en 36. Se halló con
// una simulación de game-core.js + el mismo spawn que game.js (primera celda
// vacía, valor 2); si cambia el spawn o el orden de direcciones, recalcular.
const SECUENCIA_10 = ["left", "down", "right", "up", "left", "down", "right", "up", "down", "right"];
const PUNTOS_ESPERADOS = "36";

// Partida guardada con la forma v1 completa (mismo esquema que
// tests/restauracion.test.js): tablero, marcador, contadores, victoriaAvisada
// y una entrada de historial JSON-safe.
const PARTIDA = {
  v: 1,
  board: [[4, 8, 16, 32], [2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  score: 136,
  deshacerRestantes: 2,
  bombasRestantes: 1,
  victoriaAvisada: false,
  historial: [
    { board: [[2, 4, 16, 32], [2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 128 },
  ],
};

// --- FALSO LAYOUT ---
// Mismo criterio que tests/animacion.test.js: celdas de 90 px separadas 10 px
// en una rejilla 4x4 con origen en (0,0); la capa #fx-layer ocupa el mismo
// hueco. Sin este mock jsdom devuelve rects a 0 y game-fx.js omite slide y
// fantasmas por guard (el residuo observable sería solo el flotante).
let rectOriginal = null;

function activarLayout() {
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
}

function restaurarLayout() {
  if (rectOriginal) {
    Element.prototype.getBoundingClientRect = rectOriginal;
    rectOriginal = null;
  }
}

beforeEach(() => {
  document.getElementById("welcome").hidden = true; // sin modal: la entrada responde
  juego.nuevaPartida();                             // reinicia estado Y borra partida2048
  // OJO: localStorage NO se limpia (mismo criterio que persistencia.test.js):
  // los tests de este archivo comparten la memoria del módulo y van en orden.
});

// ============================================================
//  (iii) Claves aisladas: stats2048 vs partida2048
//  Va PRIMERO a propósito: el primer test exige stats2048 a null y ningún
//  test previo de este archivo puede haber llamado a mover().
// ============================================================

describe("claves aisladas: stats2048 y partida2048 (riesgo 4)", () => {
  it("stats2048 sigue intacta hasta el primer mover()", () => {
    // Ni la importación del módulo ni iniciarTema()/iniciarFeedback() ni
    // nuevaPartida() escriben: solo leerStats().
    expect(localStorage.getItem("stats2048")).toBeNull();
    expect(localStorage.getItem("partida2048")).toBeNull(); // nuevaPartida() la borra

    juego.mover("left"); // primer cambio con puntos → actualizarRecord()

    expect(JSON.parse(localStorage.getItem("stats2048"))).toEqual({ record: 4 });
    // …y la partida en curso vive en OTRA clave (esquema v1, sin record).
    expect(JSON.parse(localStorage.getItem("partida2048")).v).toBe(1);
  });

  it("restaurar partida2048 no contamina stats2048 (byte a byte)", () => {
    const antes = localStorage.getItem("stats2048");
    expect(antes).not.toBeNull(); // el test anterior ya puntuó
    expect(Object.keys(JSON.parse(antes))).toEqual(["record"]);

    localStorage.setItem("partida2048", JSON.stringify(PARTIDA));
    expect(juego.restaurarPartida()).toBe(true);

    expect(localStorage.getItem("stats2048")).toBe(antes); // ni un byte escrito
    expect(Object.keys(JSON.parse(localStorage.getItem("stats2048")))).toEqual(["record"]);
    expect(localStorage.getItem("partida2048")).not.toBeNull(); // sigue en su propia clave
    expect(textosCeldas()).toEqual(["4", "8", "16", "32", "2", "4"]);
  });
});

// ============================================================
//  (i) Diez mover() (7 con fusión): el contrato de #board.children
// ============================================================

describe("10 movimientos (7 con fusión): #board siempre 16, #fx-layer limpio", () => {
  beforeEach(activarLayout);
  afterEach(restaurarLayout);

  it("#board.children es 16 SIEMPRE y ningún nodo FX entra en el tablero", () => {
    for (const direccion of SECUENCIA_10) {
      juego.mover(direccion);

      expect(tablero().children).toHaveLength(16);
      // Flotantes y fantasmas viven SOLO en #fx-layer (riesgo 2).
      expect(tablero().querySelectorAll('[class*="fx-"]')).toHaveLength(0);
      // Cada .cell sigue siendo un slot con UN único .tile persistente.
      expect(celdas().every(c => c.classList.contains("cell") && c.children.length === 1)).toBe(true);
      expect(fichas().every(f => f.classList.contains("tile"))).toBe(true);
    }

    // 7 de los 10 movimientos fusionaron y ningún overlay se coló
    // (sin game over ni victoria en la batería).
    expect(puntos()).toBe(PUNTOS_ESPERADOS);
    expect(overlayVisible()).toBe(false);
  });

  it("#fx-layer queda sin residuos tras esperar los timers", async () => {
    for (const direccion of SECUENCIA_10) juego.mover(direccion);

    // El último turno fusionó (+8): flotantes, fantasmas y transform vivos.
    expect(capa().children.length).toBeGreaterThan(0);

    // > 700 ms del flotante; los demás timers vencen antes
    // (fantasma 140, transform 180, pop 360).
    await new Promise(resolve => setTimeout(resolve, 850));

    expect(capa().children).toHaveLength(0);
    expect(celdas().some(c => c.classList.contains("fusionando"))).toBe(false);
    for (const ficha of fichas()) {
      expect(ficha.style.transform).toBe("");
      expect(ficha.style.transition).toBe("");
    }
    expect(tablero().children).toHaveLength(16);
  });
});

// ============================================================
//  (ii) textosCeldas() y la bomba miden SOLO #board.children
// ============================================================

describe("mediciones sobre #board.children con FX vivos", () => {
  beforeEach(activarLayout);
  afterEach(restaurarLayout);

  it("textosCeldas() ve solo el tablero con flotante y fantasma vivos", () => {
    juego.mover("left"); // fusión 2+2 → fantasma "2" + flotante "+4"

    expect(document.querySelectorAll("#fx-layer .fx-flotante")).toHaveLength(1);
    expect(document.querySelectorAll("#fx-layer .fx-fantasma")).toHaveLength(1);
    expect(document.getElementById("fx-layer").children).toHaveLength(2);

    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA); // el "+4" y el fantasma no cuentan
    expect(tablero().children).toHaveLength(16);
    expect(tablero().querySelectorAll('[class*="fx-"]')).toHaveLength(0);
  });

  it("el handler de la bomba sigue midiendo #board.children con FX vivos", () => {
    juego.mover("left"); // residuos vivos en #fx-layer…
    expect(document.getElementById("fx-layer").children).toHaveLength(2);
    // …y la fuente de índices de la bomba sigue midiendo 16, no 18.
    expect(tablero().children).toHaveLength(16);

    juego.toggleBomba();
    celdas()[0].click(); // la celda [0,0] (el "4"): el dispatch llega con FX vivos

    // La bomba limpia la capa al mutar, pero midió sobre #board: vació la
    // celda correcta y no se comió ningún índice.
    expect(textosCeldas()).toEqual(["2"]);
    expect(tablero().children).toHaveLength(16);
    expect(contador("bomb-count")).toBe("0");
    expect(capa().children).toHaveLength(0);
  });
});

// ============================================================
//  (iv) Entorno jsdom sin APIs de animación modernas (riesgo 3)
// ============================================================

describe("sin AudioContext, vibrate, element.animate ni transitionend", () => {
  it("la batería completa de acciones responde sin lanzar ninguna excepción", () => {
    expect(typeof window.AudioContext).toBe("undefined");
    expect(typeof window.webkitAudioContext).toBe("undefined");
    expect(typeof navigator.vibrate).toBe("undefined");
    expect(typeof Element.prototype.animate).toBe("undefined");

    expect(() => {
      juego.mover("left");                    // fusión → sonido + háptica + animación
      juego.deshacer();                       // interrumpe la capa FX
      juego.toggleBomba();                    // armar sin modal abierto
      celdas().find(c => c.textContent !== "").click(); // gasta la bomba
      juego.nuevaPartida();
      juego.mover("right");                   // cambio sin fusión (cero flotantes)
      juego.mostrarVictoria();                // secuencia ascendente sin Web Audio
      juego.mostrarGameOver();                // secuencia descendente
      juego.deshacer();                       // cierra el overlay de fin
    }).not.toThrow();

    expect(tablero().children).toHaveLength(16);
    expect(capa().children).toHaveLength(0); // limpiarFx() en deshacer/nuevaPartida
    expect(overlayVisible()).toBe(false);    // el deshacer final lo cerró
    expect(textosCeldas()).toEqual(INICIAL);
  });

  it("dispatchar transitionend/animationend no cambia nada (sin listeners)", () => {
    juego.mover("left"); // crea un flotante con timer propio
    const flotante = document.querySelector("#fx-layer .fx-flotante");
    expect(flotante).not.toBeNull();

    expect(() => {
      for (const celda of celdas()) {
        celda.dispatchEvent(new Event("transitionend"));
        celda.firstElementChild.dispatchEvent(new Event("animationend"));
      }
      flotante.dispatchEvent(new Event("transitionend"));
      capa().dispatchEvent(new Event("animationend"));
    }).not.toThrow();

    // Nadie reacciona a esos eventos: la limpieza es SOLO por setTimeout.
    expect(flotante.isConnected).toBe(true);
    expect(tablero().children).toHaveLength(16);
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
  });
});

// ============================================================
//  (v) prefers-reduced-motion simulado (decisión 8)
// ============================================================

describe("prefers-reduced-motion simulado (matchMedia matches: true)", () => {
  let matchMediaOriginal = null;

  beforeEach(() => {
    activarLayout(); // con layout: el guard de "sin transform" sería tautológico
    matchMediaOriginal = window.matchMedia;
    window.matchMedia = (consulta) => ({
      matches: consulta.includes("prefers-reduced-motion"),
      addEventListener() {},
      removeEventListener() {},
    });
  });

  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
    matchMediaOriginal = null;
    restaurarLayout();
  });

  it("sin transform, sin fantasmas y sin pop; el flotante solo desvanece", () => {
    expect(() => juego.mover("left")).not.toThrow();

    // Solo estado final: cero transformaciones en las .tile…
    expect(fichas().every(f => f.style.transform === "")).toBe(true);
    // …cero fantasmas en la capa y cero pop en el tablero.
    expect(document.querySelectorAll("#fx-layer .fx-fantasma")).toHaveLength(0);
    expect(celdas().some(c => c.classList.contains("fusionando"))).toBe(false);

    // El flotante SÍ existe, pero en su variante reducida (solo desvanece,
    // sin translateY): es feedback, no transformación.
    const flotante = document.querySelector("#fx-layer .fx-flotante");
    expect(flotante).not.toBeNull();
    expect(flotante.classList.contains("fx-reducido")).toBe(true);

    // El estado se aplicó igual (sin lock) y nada lanza.
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    expect(tablero().children).toHaveLength(16);

    expect(() => {
      juego.deshacer();
      juego.nuevaPartida();
    }).not.toThrow();
    expect(capa().children).toHaveLength(0);
    expect(textosCeldas()).toEqual(INICIAL);
  });
});

// ============================================================
//  (vi) Ciclo de vida completo sin acumular nodos ni timers
// ============================================================

describe("flujo completo: mover → deshacer → nueva partida → restaurar", () => {
  beforeEach(activarLayout);
  afterEach(restaurarLayout);

  it("el flujo entero deja #board con 16 hijos y #fx-layer vacío (sin timers rezagados)", async () => {
    // 1) Movimiento con fusión: la capa FX cobra vida.
    juego.mover("left");
    expect(capa().children.length).toBeGreaterThan(0);
    expect(tablero().children).toHaveLength(16);

    const guardada = localStorage.getItem("partida2048"); // estado tras la fusión

    // 2) Deshacer: interrumpe la capa y restaura tablero/puntos.
    juego.deshacer();
    expect(capa().children).toHaveLength(0);
    expect(celdas().some(c => c.classList.contains("fusionando"))).toBe(false);
    expect(textosCeldas()).toEqual(INICIAL);
    expect(tablero().children).toHaveLength(16);

    // 3) Nueva partida: borra la clave de la partida en curso y la capa vacía.
    juego.nuevaPartida();
    expect(capa().children).toHaveLength(0);
    expect(localStorage.getItem("partida2048")).toBeNull();
    expect(tablero().children).toHaveLength(16);

    // 4) Restauración de la partida capturada en (1): la recarga simulada.
    localStorage.setItem("partida2048", guardada);
    expect(juego.restaurarPartida()).toBe(true);
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    expect(document.getElementById("score").textContent).toBe("4");
    expect(document.getElementById("undo").disabled).toBe(false); // historial viajó
    expect(capa().children).toHaveLength(0);
    expect(tablero().children).toHaveLength(16);

    // 5) Ningún timer rezagado repuebla la capa ni reaplica estilos
    //    (los callbacks de los turnos anteriores quedaron por generación).
    await new Promise(resolve => setTimeout(resolve, 850));
    expect(capa().children).toHaveLength(0);
    expect(celdas().some(c => c.classList.contains("fusionando"))).toBe(false);
    for (const ficha of fichas()) {
      expect(ficha.style.transform).toBe("");
      expect(ficha.style.transition).toBe("");
    }

    // 6) …y el juego sigue respondiendo después de todo el ciclo.
    juego.mover("right");
    expect(tablero().children).toHaveLength(16);
    expect(textosCeldas()).toEqual(["2", "4", "2"]); // spawn + dos fichas corridas
    expect(document.getElementById("score").textContent).toBe("4"); // sin puntos nuevos
  });
});
