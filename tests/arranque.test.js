// @vitest-environment jsdom
// Task 8 — arranque con una partida en curso YA guardada.
// Riesgo A: import DINÁMICO como ÚNICA importación de game.js en este
// archivo: si se importara dos veces (o junto con otro import estático) se
// duplicarían los listeners de teclado/touch. La clave partida2048 se
// escribe ANTES del import, para que la inicialización del módulo la
// encuentre y la restaure en lugar de crear una partida nueva.
import { describe, it, expect } from "vitest";

// Partida válida con el esquema completo: tablero con un 2048 ya anunciado
// (victoriaAvisada), puntuación, los dos contadores y una entrada de
// historial para que el deshacer siga vivo tras "recargar".
const PARTIDA = {
  v: 1,
  board: [[2048, 4, 8, 16], [2, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  score: 9999,
  deshacerRestantes: 2,
  bombasRestantes: 0,
  victoriaAvisada: true,
  historial: [
    { board: [[2048, 4, 8, 16], [4, 2, 4, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 9995 },
  ],
};

localStorage.setItem("partida2048", JSON.stringify(PARTIDA));

// ÚNICA importación de game.js en este archivo (dinámica, tras escribir la clave).
const juego = await import("../app/game.js");

function textosCeldas() {
  return [...document.getElementById("board").children]
    .filter(c => c.textContent !== "")
    .map(c => c.textContent);
}

function contador(id) {
  return document.getElementById(id).textContent;
}

const RESTAURADO = ["2048", "4", "8", "16", "2", "2", "4"];

describe("arranque con partida guardada (Task 8)", () => {
  it("restaura tablero, puntuación y contadores al cargar el módulo", () => {
    expect(textosCeldas()).toEqual(RESTAURADO);
    expect(document.getElementById("score").textContent).toBe("9999");
    expect(contador("undo-count")).toBe("2");
    expect(contador("bomb-count")).toBe("0");
    expect(document.getElementById("undo").disabled).toBe(false); // historial viajó
    expect(document.getElementById("bomb").disabled).toBe(true);  // bombas: 0
    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);
    // Nada de la partida guardada se cuela en stats2048 (invariante clave:
    // persistencia.test.js:20 exige stats2048 a null hasta que algo puntúe).
    expect(localStorage.getItem("stats2048")).toBeNull();
  });

  it("la info NO aparece sola al arrancar (se abre con #info): sin diálogo nuevo", () => {
    expect(document.getElementById("welcome").hidden).toBe(true);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  });

  it("mover tras cerrar la bienvenida funciona y NO re-anuncia la victoria", async () => {
    document.getElementById("welcome-close").click();
    await new Promise(resolve => setTimeout(resolve, 260)); // cierra la bienvenida

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 320)); // > DURACION_ANIMACION_FIN

    // El movimiento sí se aplicó: 2+2 → 4, spawn y +4 puntos.
    expect(textosCeldas()).toEqual(["2048", "4", "8", "16", "4", "4", "2"]);
    expect(document.getElementById("score").textContent).toBe("10003");
    // …pero la victoria ya estaba avisada: el overlay de fin no aparece.
    expect(document.getElementById("overlay").hidden).toBe(true);
  });

  // Depende del test anterior (orden del archivo): al mover se empuja una
  // entrada nueva, así que hacen falta DOS deshaceres para llegar a la que
  // viajó dentro de la clave partida2048.
  it("el deshacer sigue vivo tras el arranque (historial restaurado)", () => {
    document.getElementById("welcome").hidden = true; // por si este test corre suelto

    juego.deshacer(); // 1: deshace el movimiento del test anterior
    expect(document.getElementById("score").textContent).toBe("9999");
    expect(contador("undo-count")).toBe("1");

    juego.deshacer(); // 2: usa la entrada GUARDADA en la clave
    expect(textosCeldas()).toEqual(["2048", "4", "8", "16", "4", "2", "4"]);
    expect(document.getElementById("score").textContent).toBe("9995");
    expect(contador("undo-count")).toBe("0");
    expect(document.getElementById("undo").disabled).toBe(true); // sin usos
  });
});
