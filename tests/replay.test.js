// @vitest-environment jsdom
// Tasks 1-11 — Replay del reto diario (sub-bloque 2d): núcleo PURO en
// game-core.js (parser del código, dry-run de la secuencia y validación del
// campo opcional `movimientos`) y su integración en game.js (grabación,
// persistencia, preservación del intento, bucle de reproducción, panel y
// compartir con código).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  MAX_MOVIMIENTOS_REPLAY,
  parsearCodigoJugada,
  reproducirSecuencia,
  esPartidaValida,
} from "../js/game-core.js";

// ============================================================
//  Task 1 — parsearCodigoJugada
// ============================================================
describe("parsearCodigoJugada (Task 1)", () => {
  it("extrae fecha y secuencia del mensaje completo del compartir", () => {
    const texto = "Reto diario 2026-10-11: 512 puntos. ¿Puedes superarme? "
      + "Reproduce: 2048reto:2026-10-11:LLURDD";

    expect(parsearCodigoJugada(texto)).toEqual({
      fecha: "2026-10-11",
      movimientos: "LLURDD",
    });
  });

  it("acepta el código suelto, sin el resto del mensaje", () => {
    expect(parsearCodigoJugada("2048reto:2026-10-09:LRUD")).toEqual({
      fecha: "2026-10-09",
      movimientos: "LRUD",
    });
  });

  it("si hay varios códigos, toma el primero", () => {
    const texto = "2048reto:2026-10-01:LL 2048reto:2026-10-02:RR";

    expect(parsearCodigoJugada(texto)).toEqual({
      fecha: "2026-10-01",
      movimientos: "LL",
    });
  });

  it("sin código, o con la forma rota, devuelve null", () => {
    expect(parsearCodigoJugada("512 puntos, nada que reproducir")).toBe(null);
    expect(parsearCodigoJugada("2048reto:2026-1-01:LL")).toBe(null);  // mes de 1 dígito
    expect(parsearCodigoJugada("2048reto:2026-10-10:")).toBe(null);   // sin movimientos
    expect(parsearCodigoJugada("2048reto:2026-10-10:XY")).toBe(null); // chars inválidos
    expect(parsearCodigoJugada("")).toBe(null);
    expect(parsearCodigoJugada(null)).toBe(null);
    expect(parsearCodigoJugada(42)).toBe(null);
  });

  it("respeta el tope de MAX_MOVIMIENTOS_REPLAY", () => {
    const justo = "2048reto:2026-10-10:" + "L".repeat(MAX_MOVIMIENTOS_REPLAY);
    const demasido = "2048reto:2026-10-10:" + "L".repeat(MAX_MOVIMIENTOS_REPLAY + 1);

    expect(parsearCodigoJugada(justo)?.movimientos).toHaveLength(MAX_MOVIMIENTOS_REPLAY);
    expect(parsearCodigoJugada(demasido)).toBe(null);
  });
});

// ============================================================
//  Task 2 — reproducirSecuencia (dry-run puro)
// ============================================================
describe("reproducirSecuencia (Task 2)", () => {
  // Caso de referencia calculado con la semilla real de la fecha.
  it("reconstruye la partida exacta de una fecha + secuencia", () => {
    const resultado = reproducirSecuencia("2026-10-10", "LDRU");

    expect(resultado.board).toEqual([
      [0, 2, 4, 4],
      [0, 0, 0, 4],
      [0, 2, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(resultado.score).toBe(4);
  });

  it("secuencia vacía ⇒ el tablero inicial del día (2 fichas, 0 puntos)", () => {
    expect(reproducirSecuencia("2026-10-10", "")).toEqual({
      board: [[0, 0, 0, 0], [0, 0, 0, 2], [0, 0, 0, 0], [0, 0, 4, 0]],
      score: 0,
    });
  });

  it("misma fecha + misma secuencia ⇒ siempre idéntico (determinismo, R5)", () => {
    const a = reproducirSecuencia("2026-10-10", "LLURDDRL");
    const b = reproducirSecuencia("2026-10-10", "LLURDDRL");

    expect(a).toEqual(b);
  });

  it("otra fecha + la misma secuencia ⇒ otro tablero", () => {
    const diez = reproducirSecuencia("2026-10-10", "LDRU");
    const once = reproducirSecuencia("2026-10-11", "LDRU");

    expect(once.board).not.toEqual(diez.board);
  });

  it("un movimiento sin cambio se ignora y NO desalinea la cadena del RNG", () => {
    // El tablero inicial de 2026-11-01 es [[0,0,0,0],…,[0,0,2,4]]: "R" no
    // cambia nada, así que "RL" debe dar EXACTAMENTE lo mismo que "L".
    const conBasura = reproducirSecuencia("2026-11-01", "RL");
    const limpia = reproducirSecuencia("2026-11-01", "L");

    expect(conBasura).toEqual(limpia);
  });
});

// ============================================================
//  Task 3 — `movimientos` como campo opcional de esPartidaValida
// ============================================================
describe("esPartidaValida con el campo `movimientos` (Task 3)", () => {
  const BASE = {
    v: 1,
    board: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    score: 0,
    deshacerRestantes: 3,
    bombasRestantes: 1,
    victoriaAvisada: false,
    historial: [],
  };

  it("secuencia LRUD válida (y vacía) ⇒ true", () => {
    expect(esPartidaValida({ ...BASE, movimientos: "LLURDD" })).toBe(true);
    expect(esPartidaValida({ ...BASE, movimientos: "" })).toBe(true);
  });

  it("ausente ⇒ true (partidas anteriores al 2d y modo normal)", () => {
    expect(esPartidaValida(BASE)).toBe(true);
  });

  it("forma inválida ⇒ false", () => {
    expect(esPartidaValida({ ...BASE, movimientos: "llx" })).toBe(false);
    expect(esPartidaValida({ ...BASE, movimientos: "L L" })).toBe(false);
    expect(esPartidaValida({ ...BASE, movimientos: 123 })).toBe(false);
    expect(esPartidaValida({ ...BASE, movimientos: null })).toBe(false);
    expect(esPartidaValida({
      ...BASE,
      movimientos: "L".repeat(MAX_MOVIMIENTOS_REPLAY + 1),
    })).toBe(false);
  });
});

// ============================================================
//  Tasks 4-10 — Replay contra la UI (game.js)
//
//  Patrón reto.test.js: el estado inicial se siembra ANTES del import
//  dinámico (única importación de game.js de este archivo). Récord en 0
//  para que "el replay no toca el récord" sea un test no vacío (score 4 > 0).
// ============================================================
localStorage.setItem("stats2048", JSON.stringify({ record: 0, tema: "dark" }));

const juego = await import("../app/game.js");
const { INTERVALO_REPLAY } = juego;

const CARACTER = { left: "L", right: "R", up: "U", down: "D" };

function textosCeldas() {
  return [...document.getElementById("board").children].map((c) => c.textContent);
}

function estado() {
  return juego.obtenerSnapshot();
}

function guardada() {
  return JSON.parse(localStorage.getItem("partida2048"));
}

// Juega direcciones en orden hasta que alguna cambie el tablero (los tableros
// de reto dependen de la fecha del sistema, así que no se hardcodean).
function jugarCambio(direcciones = ["left", "up", "right", "down"]) {
  for (const d of direcciones) {
    const antes = JSON.stringify(estado().board);
    juego.mover(d);
    if (JSON.stringify(estado().board) !== antes) return d;
  }
  throw new Error("ninguna dirección cambió el tablero");
}

function pegarYReproducir(codigo) {
  document.getElementById("replay-input").value = codigo;
  document.getElementById("replay-start").click();
}

// Cada avance de INTERVALO_REPLAY dispara EXACTAMENTE un paso del replay.
function pasoReplay() {
  vi.advanceTimersByTime(INTERVALO_REPLAY);
}

function replayActivo() {
  return !document.getElementById("replay-stop").hidden;
}

describe("replay del reto (UI, Tasks 4-10)", () => {
  beforeEach(() => {
    document.getElementById("welcome").hidden = true; // sin modal: la entrada responde
  });

  afterEach(() => {
    // Invariantes tras CADA caso y modo a "normal" para el siguiente.
    juego.nuevaPartida();
    expect(document.getElementById("board").children).toHaveLength(16);
    expect(document.getElementById("fx-layer").children).toHaveLength(0);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    expect(replayActivo()).toBe(false);
  });

  it("el replay no toca el récord (Task 6)", () => {
    vi.useFakeTimers();
    try {
      // Secuencia de referencia: termina con score 4 > best 0.
      pegarYReproducir("2048reto:2026-10-10:LDRU");
      for (let i = 0; i < 10; i++) pasoReplay(); // 4 movimientos + holgura
      expect(replayActivo()).toBe(false);

      expect(document.getElementById("best").textContent).toBe("0");
      expect(JSON.parse(localStorage.getItem("stats2048")).record).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("en modo reto cada movimiento con cambio se graba en `movimientos` (Task 4)", () => {
    document.getElementById("daily").click();

    const d1 = jugarCambio();
    expect(guardada().movimientos).toBe(CARACTER[d1]);

    const d2 = jugarCambio();
    expect(guardada().movimientos).toBe(CARACTER[d1] + CARACTER[d2]);
  });

  it("en modo normal `movimientos` no viaja en el guardado (Task 4)", () => {
    jugarCambio(); // partida normal: el esquema sigue siendo el v1 de 7 claves

    expect(guardada().movimientos).toBeUndefined();
    expect(guardada().modo).toBeUndefined();
  });

  it("el deshacer revierte el último carácter grabado (I2)", () => {
    document.getElementById("daily").click();
    const d1 = jugarCambio();
    const d2 = jugarCambio();
    expect(guardada().movimientos).toBe(CARACTER[d1] + CARACTER[d2]);

    juego.deshacer();

    expect(guardada().movimientos).toBe(CARACTER[d1]);
  });

  it("la bomba limpia la secuencia y el compartir vuelve a solo puntuación (I1)", async () => {
    document.getElementById("daily").click();
    jugarCambio();
    expect(guardada().movimientos).not.toBe("");

    document.getElementById("bomb").click(); // armar
    // Las 16 .cell existen siempre (render reconcilia): se busca la primera
    // con ficha VISIBLE, no la primera con nodo .tile (todas lo tienen).
    const conFicha = [...document.querySelectorAll("#board .cell")]
      .find((celda) => celda.textContent !== "");
    conFicha.click(); // detonar sobre la primera ficha

    expect(guardada().movimientos).toBe("");

    const share = vi.fn(() => Promise.resolve());
    navigator.share = share;
    try {
      await juego.compartir();
      expect(share.mock.calls[0][0].text).not.toContain("Reproduce:");
    } finally {
      delete navigator.share;
    }
  });

  it("el panel #replay abre y cierra sin añadir diálogos (Task 9)", () => {
    const panel = document.getElementById("replay-panel");
    const boton = document.getElementById("replay");

    expect(panel.hidden).toBe(true);
    boton.click();
    expect(panel.hidden).toBe(false);
    expect(boton.getAttribute("aria-expanded")).toBe("true");

    document.getElementById("replay-cancel").click();
    expect(panel.hidden).toBe(true);
    expect(boton.getAttribute("aria-expanded")).toBe("false");
  });

  it("un código no válido muestra su toast y no arranca nada (Task 8)", () => {
    expect(juego.reproducirJugada("512 puntos, nada que reproducir")).toBe(false);

    expect(document.getElementById("status").textContent).toBe("Código de jugada no válido");
    expect(replayActivo()).toBe(false);
    expect(document.getElementById("replay-panel").hidden).toBe(true);
  });

  it("reproduce la secuencia exacta y restaura el intento del jugador (R5/R2)", () => {
    vi.useFakeTimers();
    try {
      document.getElementById("daily").click();
      jugarCambio(); // intento propio con el que comprobar la restauración
      const antes = estado();
      const guardadaAntes = localStorage.getItem("partida2048");

      pegarYReproducir("2048reto:2026-10-10:LDRU");
      expect(replayActivo()).toBe(true);

      // Referencia del núcleo (replay.test.js, Task 2): 4 movimientos.
      for (let i = 0; i < 4; i++) pasoReplay();
      expect(textosCeldas()).toEqual([
        "", "2", "4", "4",
        "", "", "", "4",
        "", "2", "", "",
        "", "", "", "",
      ]);
      expect(document.getElementById("score").textContent).toBe("4");

      pasoReplay(); // agota la secuencia → terminarReplay()
      expect(replayActivo()).toBe(false);
      expect(estado().board).toEqual(antes.board);
      expect(estado().score).toBe(antes.score);
      expect(localStorage.getItem("partida2048")).toBe(guardadaAntes); // cero escrituras
      expect(document.getElementById("status").textContent).toBe("Reproducción terminada");
    } finally {
      vi.useRealTimers();
    }
  });

  it("durante el replay el teclado, el deshacer y la bomba no mueven (Task 6)", () => {
    vi.useFakeTimers();
    try {
      pegarYReproducir("2048reto:2026-10-10:LRLRLRLRLRLRLRLRLRLR");
      pasoReplay();
      const antes = JSON.stringify({ board: estado().board, score: estado().score });

      for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      }
      juego.deshacer();
      juego.toggleBomba();

      expect(JSON.stringify({ board: estado().board, score: estado().score })).toBe(antes);
      expect(replayActivo()).toBe(true); // el bucle sigue vivo

      juego.pararReplay();
      expect(replayActivo()).toBe(false);
      expect(document.getElementById("status").textContent).toBe("Reproducción parada");
    } finally {
      vi.useRealTimers();
    }
  });

  it("una partida nueva cancela el replay en curso y oculta Parar (Task 8)", () => {
    vi.useFakeTimers();
    try {
      pegarYReproducir("2048reto:2026-10-10:LRLRLRLRLR");
      pasoReplay();
      document.getElementById("new-game").click();

      expect(replayActivo()).toBe(false);
      // el bucle muerto no juega más: avanzar el tiempo no mueve el tablero
      const antes = JSON.stringify(estado().board);
      for (let i = 0; i < 5; i++) pasoReplay();
      expect(JSON.stringify(estado().board)).toBe(antes);
    } finally {
      vi.useRealTimers();
    }
  });

  it("un replay que muere NO muestra el overlay de fin y restaura al jugador (R6)", () => {
    vi.useFakeTimers();
    try {
      document.getElementById("daily").click();
      jugarCambio();
      const antes = estado();

      // 41 movimientos calculados con reproducirSecuencia("2026-10-10", …):
      // terminan en el tablero lleno [[16,8,4,2],[2,4,8,4],[4,8,2,8],[8,2,8,4]].
      pegarYReproducir("2048reto:2026-10-10:RRLDURLRRRLRLRRLDULURRRLRLRRLDDDLDLDRRUDD");
      const overlay = document.getElementById("overlay");

      for (let i = 0; i < 41; i++) {
        pasoReplay();
        expect(overlay.hidden).toBe(true); // R6: nunca el diálogo de fin
      }

      pasoReplay(); // agota la secuencia → terminarReplay()
      expect(replayActivo()).toBe(false);
      expect(overlay.hidden).toBe(true);
      expect(estado().board).toEqual(antes.board);
      expect(document.getElementById("status").textContent).toBe("Reproducción terminada");
    } finally {
      vi.useRealTimers();
    }
  });

  it("compartir en reto añade el código de replay al final del texto (Task 10)", async () => {
    document.getElementById("daily").click();
    jugarCambio();

    const share = vi.fn(() => Promise.resolve());
    navigator.share = share;
    try {
      await juego.compartir();
      const texto = share.mock.calls[0][0].text;

      expect(texto).toMatch(/^Reto diario \d{4}-\d{2}-\d{2}: \d+ puntos\. ¿Puedes superarme\? Reproduce: 2048reto:\d{4}-\d{2}-\d{2}:[LRUD]+$/);
    } finally {
      delete navigator.share;
    }
  });
});
