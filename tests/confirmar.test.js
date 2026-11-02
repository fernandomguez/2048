// @vitest-environment jsdom
// Confirmación al salir de una partida con progreso: "Nueva partida" y
// "Reto diario" piden confirmar antes de sustituir el tablero. Reutiliza el
// overlay de fin (#overlay): el invariante de exactamente 2 role="dialog" se
// mantiene. También cubre la barra inferior (iconos con texto).
import { describe, it, expect, beforeEach } from "vitest";
import * as juego from "../app/game.js";

const $ = (id) => document.getElementById(id);
const overlayAbierto = () => $("overlay").hidden === false;
const botonesOverlay = () => [...document.querySelectorAll("#overlay-actions button")];
const textosCeldas = () =>
  [...$("board").children].filter((c) => c.textContent !== "").map((c) => c.textContent);

beforeEach(() => {
  localStorage.clear();
  $("welcome").hidden = true;
  juego.nuevaPartida(); // partida limpia, sin progreso
});

describe("confirmar la salida de la partida", () => {
  it("sin progreso no pregunta: Reto diario y Nueva partida actúan al instante", () => {
    $("daily").click();
    expect(overlayAbierto()).toBe(false);
    expect($("daily").getAttribute("aria-pressed")).toBe("true");

    $("new-game").click();
    expect(overlayAbierto()).toBe(false);
    expect($("daily").getAttribute("aria-pressed")).toBe("false");
  });

  it("con progreso, Reto diario pregunta y NO toca el tablero hasta confirmar", () => {
    juego.mover("left");
    const antes = textosCeldas();
    const puntosAntes = $("score").textContent;

    $("daily").click();

    expect(overlayAbierto()).toBe(true);
    expect($("overlay-title").textContent).toBe("¿Salir de la partida?");
    expect($("daily").getAttribute("aria-pressed")).toBe("false");
    expect(textosCeldas()).toEqual(antes);
    expect($("score").textContent).toBe(puntosAntes);
  });

  it("el primer botón (con foco) es 'Seguir jugando' y conserva la partida", () => {
    juego.mover("left");
    const antes = textosCeldas();

    $("new-game").click();
    const [seguir, salir] = botonesOverlay();
    expect(seguir.textContent).toBe("Seguir jugando");
    expect(salir.textContent).toBe("Nueva partida");
    expect(document.activeElement).toBe(seguir);

    seguir.click();
    expect(overlayAbierto()).toBe(false);
    expect(textosCeldas()).toEqual(antes);
    expect($("score").textContent).not.toBe("0");
  });

  it("confirmar 'Nueva partida' empieza de cero", () => {
    juego.mover("left");
    $("new-game").click();
    botonesOverlay()[1].click();

    expect(overlayAbierto()).toBe(false);
    expect($("score").textContent).toBe("0");
    expect(textosCeldas()).toEqual(["2", "2"]);
  });

  it("confirmar 'Empezar reto' arranca el reto diario", () => {
    juego.mover("left");
    $("daily").click();
    const [, empezar] = botonesOverlay();
    expect(empezar.textContent).toBe("Empezar reto");

    empezar.click();
    expect(overlayAbierto()).toBe(false);
    expect($("daily").getAttribute("aria-pressed")).toBe("true");
    expect($("score").textContent).toBe("0");
  });

  it("mientras pregunta, el teclado queda bloqueado (modal)", () => {
    juego.mover("left");
    $("daily").click();
    const antes = textosCeldas();

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(textosCeldas()).toEqual(antes);
  });

  it("no añade un tercer role=dialog", () => {
    juego.mover("left");
    $("daily").click();
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  });

  it("el guard es por ESTADO: un overlay de fin forzado sobre tablero vivo sigue preguntando", () => {
    juego.mover("left");
    juego.mostrarGameOver(); // tablero VIVO ⇒ sigue siendo partida en curso
    $("new-game").click();
    expect(botonesOverlay()[0].textContent).toBe("Seguir jugando");
  });
});

describe("barra inferior", () => {
  it("instalar, reto diario, ver jugada y compartir llevan texto y van debajo del tablero", () => {
    const barra = document.querySelector(".actions-bottom");
    const ids = [...barra.querySelectorAll("button")].map((b) => b.id);
    expect(ids).toEqual(["install", "daily", "replay", "share"]); // #share, el último

    for (const id of ids) {
      expect($(id).querySelector(".btn-text").textContent.trim()).not.toBe("");
    }
    const tablero = document.querySelector(".board-wrap");
    expect(
      tablero.compareDocumentPosition(barra) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // La barra de arriba ya no los contiene.
    expect(document.querySelector(".actions:not(.actions-bottom) #daily")).toBeNull();
  });
});
