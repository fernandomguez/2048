// @vitest-environment jsdom
// Task 8 — guardar y restaurar la partida en curso (clave partida2048).
// Invariantes: partida2048 es una clave SEPARADA de stats2048 (el arranque y
// restaurarPartida() no añaden campos a stats2048) y las claves se borran al
// empezar una partida o al mostrar el fin de partida.
import { describe, it, expect, beforeEach } from "vitest";
import * as juego from "../app/game.js";

function clave() {
  return localStorage.getItem("partida2048");
}

function stats() {
  const crudo = localStorage.getItem("stats2048");
  return crudo ? JSON.parse(crudo) : null;
}

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
  return document.getElementById("overlay").hidden === false;
}

const INICIAL = ["2", "2"];

// Partida con forma completa: tablero, marcador, ambos contadores,
// victoriaAvisada y una entrada de historial JSON-safe.
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

// Tablero lleno sin ninguna fusión posible → esGameOver === true.
const TABLERO_BLOQUEADO = [
  [2, 4, 8, 16],
  [32, 64, 128, 256],
  [512, 1024, 2048, 4],
  [8, 16, 32, 64],
];

beforeEach(() => {
  document.getElementById("welcome").hidden = true;
  juego.nuevaPartida(); // reinicia el estado Y borra partida2048
});

describe("guardar la partida en curso (Task 8)", () => {
  it("mover() guarda la partida con el esquema v1 completo", () => {
    expect(clave()).toBeNull(); // nada guardado tras iniciar

    juego.mover("left"); // fusión 2+2 → [[4,2,0,0]] + spawn + 4 puntos

    const partida = JSON.parse(clave());
    expect(partida.v).toBe(1);
    expect(partida.board).toEqual([[4, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]);
    expect(partida.score).toBe(4);
    expect(partida.deshacerRestantes).toBe(3);
    expect(partida.bombasRestantes).toBe(1);
    expect(partida.victoriaAvisada).toBe(false);
    expect(partida.historial).toEqual([
      { board: [[2, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 0 },
    ]);
    // Sin campos ajenos: ni record ni tema (viven en stats2048).
    expect(Object.keys(partida).sort()).toEqual(
      ["board", "bombasRestantes", "deshacerRestantes", "historial", "score", "v", "victoriaAvisada"]
    );
  });

  it("un movimiento sin cambio no guarda la partida", () => {
    expect(clave()).toBeNull();

    // "up" sobre el tablero inicial no mueve nada (las dos 2 ya están arriba):
    // sin cambio no hay spawn, no hay guardado.
    juego.mover("up");

    expect(clave()).toBeNull();
    expect(textosCeldas()).toEqual(INICIAL);
    expect(puntos()).toBe("0");
  });

  it("pagehide guarda la partida en curso", () => {
    expect(clave()).toBeNull();
    juego.mover("left");
    localStorage.removeItem("partida2048"); // se pierde lo guardado

    window.dispatchEvent(new Event("pagehide"));

    expect(clave()).not.toBeNull();
    expect(JSON.parse(clave()).score).toBe(4);
  });

  it("visibilitychange solo guarda cuando la pestaña queda oculta", () => {
    juego.mover("left");
    localStorage.removeItem("partida2048");

    // Estado por defecto (visible): no debe guardarse.
    document.dispatchEvent(new Event("visibilitychange"));
    expect(clave()).toBeNull();

    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    try {
      document.dispatchEvent(new Event("visibilitychange"));
    } finally {
      delete document.hidden; // restaura el getter original del prototipo
    }

    expect(clave()).not.toBeNull();
    expect(JSON.parse(clave()).score).toBe(4);
  });
});

describe("restaurar la partida (Task 8)", () => {
  it("sin clave devuelve false y no toca el estado", () => {
    expect(clave()).toBeNull();

    expect(juego.restaurarPartida()).toBe(false);

    expect(textosCeldas()).toEqual(INICIAL);
    expect(puntos()).toBe("0");
  });

  it("restaura tablero, puntos, contadores e historial (deshacer habilitado)", () => {
    localStorage.setItem("partida2048", JSON.stringify(PARTIDA));

    expect(juego.restaurarPartida()).toBe(true);

    expect(textosCeldas()).toEqual(["4", "8", "16", "32", "2", "4"]);
    expect(puntos()).toBe("136");
    expect(contador("undo-count")).toBe("2");
    expect(contador("bomb-count")).toBe("1");
    expect(document.getElementById("undo").disabled).toBe(false); // historial viajó
    expect(document.getElementById("bomb").disabled).toBe(false);
    // El modo bomba NO se restaura (decisión 6): solo el contador.
    expect(document.getElementById("board").classList.contains("modo-bomba")).toBe(false);

    // El deshacer sigue vivo tras "recargar": consume un uso y vuelve al
    // tablero del historial.
    juego.deshacer();

    expect(textosCeldas()).toEqual(["2", "4", "16", "32", "2", "4"]);
    expect(puntos()).toBe("128");
    expect(contador("undo-count")).toBe("1");
    expect(clave()).not.toBeNull(); // deshacer() vuelve a guardar
  });

  it("victoriaAvisada restaurada evita re-anunciar la victoria", async () => {
    localStorage.setItem("partida2048", JSON.stringify({
      ...PARTIDA,
      board: [[2048, 4, 8, 16], [2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      victoriaAvisada: true,
    }));

    expect(juego.restaurarPartida()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 320)); // > DURACION_ANIMACION_FIN

    expect(overlayVisible()).toBe(false); // la victoria ya estaba anunciada
  });

  it("sin victoriaAvisada la victoria SÍ se anuncia (contraste)", async () => {
    localStorage.setItem("partida2048", JSON.stringify({
      ...PARTIDA,
      board: [[2048, 4, 8, 16], [2, 4, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      victoriaAvisada: false,
    }));

    expect(juego.restaurarPartida()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
    await new Promise(resolve => setTimeout(resolve, 320));

    expect(overlayVisible()).toBe(true);
    expect(document.getElementById("overlay-title").textContent).toBe("¡2048!");
    juego.nuevaPartida(); // cierra el overlay para los tests siguientes
  });
});

describe("claves inválidas (riesgo 5) (Task 8)", () => {
  it("clave corrupta (JSON basura) → partida nueva sin excepción", () => {
    localStorage.setItem("partida2048", "{esto no es json");

    expect(() => {
      if (!juego.restaurarPartida()) juego.nuevaPartida(); // línea de arranque
    }).not.toThrow();

    expect(clave()).toBeNull(); // la clave inválida se borró
    expect(textosCeldas()).toEqual(INICIAL);
    expect(puntos()).toBe("0");
  });

  it("clave con forma inválida → se borra y no se restaura", () => {
    localStorage.setItem("partida2048", JSON.stringify({ v: 2, board: [[1, 2], [3, 4]] }));

    expect(juego.restaurarPartida()).toBe(false);

    expect(clave()).toBeNull();
    expect(textosCeldas()).toEqual(INICIAL);
  });

  it("tablero válido pero BLOQUEADO → se borra y empieza una partida nueva", () => {
    localStorage.setItem("partida2048", JSON.stringify({
      ...PARTIDA,
      board: TABLERO_BLOQUEADO,
      historial: [],
    }));

    expect(juego.restaurarPartida()).toBe(false);

    expect(clave()).toBeNull();
    expect(textosCeldas()).toEqual(INICIAL); // partida nueva, no la bloqueada
    expect(puntos()).toBe("0");
  });
});

describe("borrado de la clave partida2048 (Task 8)", () => {
  it("nuevaPartida() borra la clave", () => {
    juego.mover("left");
    expect(clave()).not.toBeNull();

    juego.nuevaPartida();

    expect(clave()).toBeNull();
  });

  it("mostrarGameOver() borra la clave", () => {
    juego.mover("left");
    expect(clave()).not.toBeNull();

    juego.mostrarGameOver();

    expect(clave()).toBeNull();
  });

  it("al llegar al fin de partida REAL la clave se borra (overlay diferido)", async () => {
    jugarHastaTableroBloqueado();
    expect(clave()).not.toBeNull(); // el último movimiento la guardó

    await new Promise(resolve => setTimeout(resolve, 320)); // llega el overlay

    expect(overlayVisible()).toBe(true);
    expect(document.getElementById("overlay-title").textContent).toBe("Sin movimientos");
    expect(clave()).toBeNull();
    juego.nuevaPartida();
  });
});

describe("stats2048 no gana campos (invariante persistencia.test.js:20)", () => {
  it("guardar/restaurar la partida NO escribe en stats2048", () => {
    const antes = JSON.stringify(stats()); // solo actualizarRecord() la escribe

    localStorage.setItem("partida2048", JSON.stringify(PARTIDA));
    expect(juego.restaurarPartida()).toBe(true);

    expect(JSON.stringify(stats())).toBe(antes); // byte a byte: cero escrituras
    expect(clave()).not.toBeNull(); // la partida vive en OTRA clave
  });

  it("stats2048 solo conoce el campo record (la partida no contamina su esquema)", () => {
    expect(stats()).not.toBeNull(); // algún movimiento ya puntuó en este archivo
    expect(Object.keys(stats())).toEqual(["record"]);
  });
});

// Juega en bucle determinista (Math.random = 0 en tests/setup.js) hasta que
// ningún movimiento cambia el tablero: partida bloqueada. Mismo patrón que
// tests/animacion.test.js (todo síncrono: el timer de 260 ms no puede
// dispararse hasta que el test espere).
function jugarHastaTableroBloqueado() {
  const direcciones = ["left", "up", "right", "down"];
  for (let i = 0; i < 500; i++) {
    let huboCambio = false;
    for (const direccion of direcciones) {
      const antes = textosCeldas().join(",");
      juego.mover(direccion);
      const despues = textosCeldas().join(",");
      if (antes !== despues) {
        huboCambio = true;
        break;
      }
    }
    if (!huboCambio) return;
  }
  throw new Error("no se alcanzó un tablero bloqueado");
}
