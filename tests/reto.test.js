// @vitest-environment jsdom
// Tasks 4 y 11 — reto diario (D5): RNG sembrado en game-core.js (núcleo PURO)
// y su integración contra la UI (#daily, determinismo por fecha, compartir).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { semillaDeFecha, siguienteRng } from "../game-core.js";

describe("semillaDeFecha (D5a: fecha local YYYY-MM-DD)", () => {
  it("la misma fecha produce SIEMPRE el mismo número", () => {
    expect(semillaDeFecha("2026-10-10")).toBe(semillaDeFecha("2026-10-10"));
  });

  it("fechas distintas producen números distintos", () => {
    const semillas = ["2026-10-09", "2026-10-10", "2026-10-11", "2025-10-10", "2027-01-01"]
      .map(semillaDeFecha);

    expect(new Set(semillas).size).toBe(semillas.length);
  });

  it("devuelve un entero dentro de uint32 (JSON-safe)", () => {
    const semilla = semillaDeFecha("2026-01-01");

    expect(Number.isInteger(semilla)).toBe(true);
    expect(semilla).toBeGreaterThanOrEqual(0);
    expect(semilla).toBeLessThanOrEqual(0xffffffff);
    expect(JSON.parse(JSON.stringify({ semilla })).semilla).toBe(semilla);
  });
});

describe("siguienteRng (mulberry32 con estado explícito)", () => {
  function secuencia(estado, pasos) {
    const valores = [];
    for (let i = 0; i < pasos; i++) {
      const r = siguienteRng(estado);
      estado = r.estado;
      valores.push(r.valor);
    }
    return valores;
  }

  it("misma semilla ⇒ misma secuencia de 5 valores en [0, 1)", () => {
    const semilla = semillaDeFecha("2026-10-10");
    const a = secuencia(semilla, 5);
    const b = secuencia(semilla, 5);

    expect(b).toEqual(a);
    for (const valor of a) {
      expect(valor).toBeGreaterThanOrEqual(0);
      expect(valor).toBeLessThan(1);
    }
  });

  it("estados distintos ⇒ secuencias distintas", () => {
    expect(secuencia(1, 5)).not.toEqual(secuencia(2, 5));
  });

  it("el estado devuelto es un entero >= 0 que sobrevive a JSON", () => {
    const r = siguienteRng(424242);

    expect(Number.isInteger(r.estado)).toBe(true);
    expect(r.estado).toBeGreaterThanOrEqual(0);
    // Tras un viaje por JSON (guardar → recargar) el estado repite la secuencia.
    const trasRecargar = JSON.parse(JSON.stringify(r)).estado;
    expect(siguienteRng(trasRecargar)).toEqual(siguienteRng(r.estado));
  });

  it("arranca también desde 0 (estado por defecto de una partida sin reto)", () => {
    const r = siguienteRng(0);

    expect(r.valor).toBeGreaterThanOrEqual(0);
    expect(r.valor).toBeLessThan(1);
    expect(Number.isInteger(r.estado)).toBe(true);
  });

  it("la semilla de una fecha alimenta una secuencia estable (D5b)", () => {
    const semilla = semillaDeFecha("2026-10-10");
    // Dos intentos del mismo día: los primeros 10 números son idénticos.
    expect(secuencia(semilla, 10)).toEqual(secuencia(semilla, 10));
  });
});

// ============================================================
//  Task 11 — reto diario contra la UI (game.js)
//
//  Patrón arranque.test.js: la clave partida2048 se escribe ANTES del import
//  DINÁMICO (única importación de game.js de este archivo), para que el
//  módulo la restaure al cargar en lugar de crear una partida normal. Así se
//  cubre "la recarga continúa el reto idéntico" (riesgo R4).
// ============================================================
const PARTIDA_RETO = {
  v: 1,
  board: [[8, 8, 2, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  score: 240,
  deshacerRestantes: 3,
  bombasRestantes: 1,
  victoriaAvisada: false,
  historial: [],
  modo: "reto",
  dia: "2026-10-09",
  rngEstado: 424242,
  hitos: [],
};

localStorage.setItem("partida2048", JSON.stringify(PARTIDA_RETO));

const juego = await import("../game.js");

// Textos de las 16 celdas en orden (vacíos incluidos): comparar tableros completos.
function textosCeldas() {
  return [...document.getElementById("board").children].map(c => c.textContent);
}

function fichasVisibles() {
  return textosCeldas().filter(texto => texto !== "");
}

function ariaPressedDaily() {
  return document.getElementById("daily").getAttribute("aria-pressed");
}

describe("reto diario (UI, Task 11)", () => {
  beforeEach(() => {
    document.getElementById("welcome").hidden = true; // sin modal: la entrada responde
  });

  afterEach(() => {
    // Invariantes tras CADA caso y modo a "normal" para el siguiente:
    // nuevaPartida() limpia la capa FX y borra la partida en curso.
    juego.nuevaPartida();
    expect(document.getElementById("board").children).toHaveLength(16);
    expect(document.getElementById("fx-layer").children).toHaveLength(0);
  });

  it("arranca restaurando la partida de reto guardada (modo, día y tablero)", () => {
    expect(ariaPressedDaily()).toBe("true");
    expect(fichasVisibles()).toEqual(["8", "8", "2"]);
    expect(document.getElementById("score").textContent).toBe("240");
    // Sin diálogos nuevos: la bienvenida sigue siendo el 2º role="dialog".
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
  });

  it("tras un movimiento, el guardado conserva el reto y avanza el RNG (D7)", () => {
    // El afterEach anterior devolvió el modo a "normal": se restaura otra vez
    // la misma partida de reto (como haría una recarga) antes de jugar.
    localStorage.setItem("partida2048", JSON.stringify(PARTIDA_RETO));
    expect(juego.restaurarPartida()).toBe(true);

    juego.mover("left"); // [8,8] → 16 + spawn: consume 2 números del RNG

    const guardada = JSON.parse(localStorage.getItem("partida2048"));
    expect(guardada.modo).toBe("reto");
    expect(guardada.dia).toBe("2026-10-09");
    // Exactamente los 2 pasos del spawn sobre el estado restaurado (424242).
    expect(guardada.rngEstado).toBe(siguienteRng(siguienteRng(424242).estado).estado);
  });

  it("misma fecha local ⇒ mismo tablero y misma secuencia (D5b, intentos ilimitados)", () => {
    vi.useFakeTimers({ toFake: ["Date"] }); // solo Date: los setTimeout siguen reales
    try {
      vi.setSystemTime(new Date(2026, 9, 10, 9, 0, 0));

      document.getElementById("daily").click(); // arranca el reto del "2026-10-10"
      expect(ariaPressedDaily()).toBe("true");
      expect(document.getElementById("status").textContent).toBe("Reto diario 2026-10-10");

      juego.mover("left");
      const trasPrimerMovimiento = textosCeldas();
      juego.mover("down");
      const intentoA = juego.obtenerSnapshot();

      document.getElementById("daily").click(); // 2º intento del MISMO día
      expect(document.getElementById("status").textContent).toBe("Reto diario 2026-10-10");
      juego.mover("left");
      expect(textosCeldas()).toEqual(trasPrimerMovimiento); // misma secuencia de spawns
      juego.mover("down");
      const intentoB = juego.obtenerSnapshot();

      expect(intentoB.board).toEqual(intentoA.board);
      expect(intentoB.score).toBe(intentoA.score);
      expect(intentoA.modo).toBe("reto");
      expect(intentoA.dia).toBe("2026-10-10");
    } finally {
      vi.useRealTimers();
    }
  });

  it("otra fecha ⇒ otro tablero (la semilla cambia con el día)", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(2026, 9, 10, 9, 0, 0));
      document.getElementById("daily").click();
      juego.mover("left");
      const delDiez = textosCeldas();

      vi.setSystemTime(new Date(2026, 9, 11, 9, 0, 0));
      document.getElementById("daily").click();
      expect(document.getElementById("status").textContent).toBe("Reto diario 2026-10-11");
      juego.mover("left");

      expect(textosCeldas()).not.toEqual(delDiez);
    } finally {
      vi.useRealTimers();
    }
  });

  it("#new-game sale del modo reto (aria-pressed y guardado sin campos de reto)", () => {
    document.getElementById("daily").click();
    document.getElementById("new-game").click();

    expect(ariaPressedDaily()).toBe("false");

    juego.mover("left"); // un turno para persistir la partida en curso
    const guardada = JSON.parse(localStorage.getItem("partida2048"));
    // El modo normal es el valor por defecto: no viajan ni modo ni día (D5).
    expect(guardada.modo).toBeUndefined();
    expect(guardada.dia).toBeUndefined();
    expect(guardada.rngEstado).toBeUndefined();
  });

  it("obtenerSnapshot() y compartir() en modo reto llevan la fecha (D5)", async () => {
    document.getElementById("daily").click();
    juego.mover("left");

    const snapshot = juego.obtenerSnapshot();
    expect(snapshot.modo).toBe("reto");
    expect(snapshot.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    const share = vi.fn(() => Promise.resolve());
    navigator.share = share;
    try {
      await juego.compartir();

      expect(share).toHaveBeenCalledTimes(1);
      // Con secuencia grabada (2d) el texto añade el código de replay al final;
      // sin él (o tras una bomba, I1) se queda en solo puntuación.
      expect(share.mock.calls[0][0].text).toMatch(/^Reto diario \d{4}-\d{2}-\d{2}: \d+ puntos\. ¿Puedes superarme\?( Reproduce: 2048reto:\d{4}-\d{2}-\d{2}:[LRUD]+)?$/);
    } finally {
      delete navigator.share;
    }
  });

  it("pagehide guarda la partida de reto con modo, día y rngEstado", () => {
    document.getElementById("daily").click();
    juego.mover("left");
    localStorage.removeItem("partida2048");

    window.dispatchEvent(new Event("pagehide"));

    const guardada = JSON.parse(localStorage.getItem("partida2048"));
    expect(guardada.modo).toBe("reto");
    expect(guardada.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isInteger(guardada.rngEstado)).toBe(true);
  });
});
