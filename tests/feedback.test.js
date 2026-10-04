// @vitest-environment jsdom
// Task 7 — interruptor de feedback (#fx-toggle): sonido Web Audio + háptica.
// Invariante clave: al arranque NO se escribe stats2048 (el gate es ON por
// defecto en game-fx.js) y "fxActivo" solo aparece al pulsar el interruptor,
// sin pisar el "record" ya guardado.
import { describe, it, expect, beforeEach } from "vitest";
import * as juego from "../game.js";

function stats() {
  const crudo = localStorage.getItem("stats2048");
  return crudo ? JSON.parse(crudo) : null;
}

function toggle() {
  return document.getElementById("fx-toggle");
}

function textosCeldas() {
  return [...document.getElementById("board").children]
    .filter(c => c.textContent !== "")
    .map(c => c.textContent);
}

const INICIAL = ["2", "2"];

beforeEach(() => {
  document.getElementById("welcome").hidden = true;
  juego.nuevaPartida();
  // OJO: localStorage NO se limpia aquí (mismo criterio que
  // persistencia.test.js): los tests de este archivo comparten la memoria
  // del módulo y van en orden deliberado.
});

describe("interruptor #fx-toggle (Task 7)", () => {
  it("arranca ON sin escribir stats2048: cero escrituras al arranque", () => {
    // El módulo ya se importó (arriba del archivo) y ya corrió iniciarFeedback():
    // solo LEE stats2048.fxActivo, nunca escribe.
    expect(stats()).toBeNull();

    expect(toggle().getAttribute("role")).toBe("switch");
    expect(toggle().getAttribute("aria-checked")).toBe("true"); // ON por defecto
  });

  it("el click alterna aria-checked y guarda fxActivo:false CONSERVANDO el record", () => {
    juego.mover("left"); // 4 puntos > récord 0 → stats2048 = { record: 4 }
    expect(stats()).toEqual({ record: 4 });
    expect(toggle().getAttribute("aria-checked")).toBe("true");

    toggle().click();

    expect(toggle().getAttribute("aria-checked")).toBe("false");
    expect(stats().fxActivo).toBe(false);
    expect(stats().record).toBe(4); // leerStats → mutar → guardarStats: no pisa el récord

    toggle().click(); // vuelve a ON

    expect(toggle().getAttribute("aria-checked")).toBe("true");
    expect(stats().fxActivo).toBe(true);
    expect(stats().record).toBe(4);
    expect(Object.keys(stats()).sort()).toEqual(["fxActivo", "record"]);
  });

  it("mover() no lanza sin AudioContext ni vibrate (jsdom puro)", () => {
    expect(typeof window.AudioContext).toBe("undefined");
    expect(typeof navigator.vibrate).toBe("undefined");

    expect(() => {
      juego.mover("left");     // fusión → sonarMovimiento + avisarFusion
      juego.mostrarVictoria(); // secuencia ascendente de finPartida
      juego.mostrarGameOver(); // secuencia descendente de finPartida
    }).not.toThrow();

    expect(document.getElementById("board").children).toHaveLength(16);
    expect(textosCeldas()).toEqual(["4", "2"]);
  });

  it("con el interruptor apagado el juego sigue respondiendo (gate en game-fx.js)", () => {
    toggle().click(); // fxActivo: false → sonido y háptica en no-op

    expect(() => juego.mover("left")).not.toThrow();

    expect(textosCeldas()).toEqual(["4", "2"]);
    expect(stats().fxActivo).toBe(false);
  });

  it("nuevaPartida() no pisa fxActivo (ni el record)", () => {
    juego.mover("left"); // record: 4
    // Estado conocido OFF: el test anterior puede dejar el interruptor en ON.
    if (toggle().getAttribute("aria-checked") === "true") toggle().click();
    expect(stats().fxActivo).toBe(false);
    expect(stats().record).toBe(4);

    juego.nuevaPartida();

    expect(stats().fxActivo).toBe(false); // la elección sobrevive al reinicio
    expect(stats().record).toBe(4);
    expect(toggle().getAttribute("aria-checked")).toBe("false"); // aria solo cambia al pulsar
    expect(textosCeldas()).toEqual(INICIAL);
  });
});
