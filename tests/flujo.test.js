// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import * as juego from "../app/game.js";

// --- Helpers ---
function pulsarFlecha(key) {
  document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
}

function deslizar(deltaX, deltaY) {
  const inicio = new Event("touchstart", { bubbles: true });
  Object.defineProperty(inicio, "touches", { value: [{ clientX: 100, clientY: 100 }] });
  document.dispatchEvent(inicio);
  const fin = new Event("touchend", { bubbles: true });
  Object.defineProperty(fin, "changedTouches", {
    value: [{ clientX: 100 + deltaX, clientY: 100 + deltaY }],
  });
  document.dispatchEvent(fin);
}

// Valores visibles de las fichas no vacías. Más fiable que contar celdas:
// un movimiento con fusión resta una ficha y el spawn añade otra (= 2 celdas).
function textosCeldas() {
  return [...document.getElementById("board").children]
    .filter(c => c.textContent !== "")
    .map(c => c.textContent);
}

function puntos() {
  return document.getElementById("score").textContent;
}

function contador(id) {
  return document.getElementById(id).textContent;
}

function overlayVisible() {
  return !document.getElementById("overlay").hidden;
}

function bienvenidaVisible() {
  return !document.getElementById("welcome").hidden;
}

// Tablero inicial determinista (Math.random mockeado en tests/setup.js):
// [[2,2,0,0], ...] → mover a la izquierda → [[4,2,0,0], ...] con 4 puntos.
const INICIAL = ["2", "2"];
const TRAS_FUSION_IZQUIERDA = ["4", "2"];

beforeEach(() => {
  juego.nuevaPartida();           // única fuente de verdad para reiniciar el estado
  document.getElementById("welcome").hidden = true; // tests que no la estudian: cerrada
});

describe("P1: la bienvenida bloquea la entrada", () => {
  it("con la bienvenida visible, el teclado NO mueve el tablero", () => {
    document.getElementById("welcome").hidden = false;

    pulsarFlecha("ArrowLeft");
    pulsarFlecha("ArrowUp");

    expect(bienvenidaVisible()).toBe(true);
    expect(textosCeldas()).toEqual(INICIAL); // sin fusión ni spawn: nada se movió
    expect(puntos()).toBe("0");
  });

  it("con la bienvenida visible, el swipe NO mueve el tablero", () => {
    document.getElementById("welcome").hidden = false;

    deslizar(120, 0);
    deslizar(0, 120);

    expect(textosCeldas()).toEqual(INICIAL);
    expect(puntos()).toBe("0");
  });

  it("las acciones bloqueadas no gastan recursos: la bomba no se arma", () => {
    document.getElementById("welcome").hidden = false;

    juego.toggleBomba();

    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);
    expect(contador("bomb-count")).toBe("1");
  });

  it("al cerrar la bienvenida con su botón, el juego responde", async () => {
    document.getElementById("welcome").hidden = false;

    document.getElementById("welcome-close").click();
    await new Promise(resolve => setTimeout(resolve, 260)); // duración de la animación

    expect(bienvenidaVisible()).toBe(false);

    pulsarFlecha("ArrowLeft");

    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    expect(puntos()).toBe("4");
  });
});

describe("P1: deshacer y bomba con el overlay de fin abierto", () => {
  it("el foco entra en el diálogo cuando se abre el overlay de fin", () => {
    juego.mostrarGameOver();
    expect(document.activeElement).toBe(document.querySelector("#overlay-actions button"));
  });

  it("game over → deshacer cierra el overlay, restaura tablero/puntos y consume un uso", () => {
    juego.mover("left"); // crea historial: fusión 2+2 → 4 puntos
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    expect(puntos()).toBe("4");

    juego.mostrarGameOver();
    expect(overlayVisible()).toBe(true);

    juego.deshacer();

    expect(overlayVisible()).toBe(false);     // el bug: antes seguía bloqueado
    expect(textosCeldas()).toEqual(INICIAL);  // tablero inicial restaurado
    expect(puntos()).toBe("0");
    expect(contador("undo-count")).toBe("2");

    // Y ahora el juego vuelve a responder:
    pulsarFlecha("ArrowLeft");
    expect(puntos()).toBe("4");
  });

  it("victoria → deshacer cierra el overlay y restaura", () => {
    juego.mover("left");
    juego.mostrarVictoria();
    expect(overlayVisible()).toBe(true);

    juego.deshacer();

    expect(overlayVisible()).toBe(false);
    expect(textosCeldas()).toEqual(INICIAL);
    expect(contador("undo-count")).toBe("2");
  });

  it("game over → la bomba NO se arma (no hay celdas clicables)", () => {
    juego.mostrarGameOver();

    juego.toggleBomba();

    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);
    expect(contador("bomb-count")).toBe("1");
  });

  it("victoria → la bomba NO se arma", () => {
    juego.mostrarVictoria();

    juego.toggleBomba();

    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);
    expect(contador("bomb-count")).toBe("1");
  });

  it("el overlay de fin bloquea el movimiento (comportamiento preexistente)", () => {
    juego.mover("left");
    juego.mostrarGameOver();

    pulsarFlecha("ArrowLeft");

    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    expect(puntos()).toBe("4");
  });
});

describe("deshacer: usos e historial", () => {
  it("no baja de cero usos y no actúa sin historial", () => {
    // Tres movimientos que sí cambian el tablero…
    juego.mover("left");
    juego.mover("right");
    juego.mover("left");
    expect(contador("undo-count")).toBe("3");

    // …y tres deshaceres consumen todos los usos y vuelven al inicio.
    juego.deshacer();
    juego.deshacer();
    juego.deshacer();
    expect(contador("undo-count")).toBe("0");
    expect(textosCeldas()).toEqual(INICIAL);

    // Sin usos: el siguiente movimiento crea historial, pero deshacer no actúa.
    juego.mover("left");
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA);
    juego.deshacer();

    expect(contador("undo-count")).toBe("0");   // no pasa de 0 a -1
    expect(textosCeldas()).toEqual(TRAS_FUSION_IZQUIERDA); // tablero intacto
    expect(puntos()).toBe("4");
  });

  it("sin historial no consume usos", () => {
    juego.deshacer();
    expect(contador("undo-count")).toBe("3");
    expect(textosCeldas()).toEqual(INICIAL);
  });
});

describe("bomba: semántica actual mantenida", () => {
  it("usar la bomba elimina la ficha y consume el uso", () => {
    juego.toggleBomba();
    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(true);

    [...document.getElementById("board").children].find(c => c.textContent !== "").click();

    expect(textosCeldas()).toEqual(["2"]);  // una de las dos desaparece
    expect(contador("bomb-count")).toBe("0");
    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);
  });

  it("pulsar una celda vacía cancela el modo sin gastar la bomba", () => {
    juego.toggleBomba();
    const vacia = [...document.getElementById("board").children].find(c => c.textContent === "");

    vacia.click();

    expect(contador("bomb-count")).toBe("1");
    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);
    expect(textosCeldas()).toEqual(INICIAL);
  });

  it("con 0 usos el botón queda deshabilitado", () => {
    juego.toggleBomba();
    [...document.getElementById("board").children].find(c => c.textContent !== "").click();
    expect(document.getElementById("bomb").disabled).toBe(true);
  });
});

describe("nueva partida", () => {
  it("reinicia tablero, puntuación, contadores e historial", () => {
    juego.mover("left");
    juego.deshacer();                 // usos: 2, historial: vacío
    juego.toggleBomba();
    [...document.getElementById("board").children].find(c => c.textContent !== "").click(); // bombas: 0
    juego.mostrarGameOver();          // overlay visible

    document.getElementById("new-game").click();
    // Hay progreso: "Nueva partida" pide confirmación (2º botón del overlay).
    document.querySelectorAll("#overlay-actions button")[1].click();

    expect(overlayVisible()).toBe(false);
    expect(textosCeldas()).toEqual(INICIAL);
    expect(puntos()).toBe("0");
    expect(contador("undo-count")).toBe("3");
    expect(contador("bomb-count")).toBe("1");
    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);
    // Sin historial recién iniciado el deshacer queda deshabilitado (como al cargar).
    expect(document.getElementById("undo").disabled).toBe(true);
    expect(document.getElementById("bomb").disabled).toBe(false);
  });
});
