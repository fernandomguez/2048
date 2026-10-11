// @vitest-environment jsdom
// Tasks 4 y 11 — regla de hitos (D6/D8): núcleo PURO en game-core.js y su
// integración en la capa UI (game.js).
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  HITOS_POWERUPS,
  calcularHitos,
  hitosAlcanzados,
  esPartidaValida,
} from "../game-core.js";

const CERO = [0, 0, 0, 0];

// Tablero 4×4 con el valor dado en [0][0] y el resto vacío.
function tableroCon(valor) {
  const primera = [...CERO];
  primera[0] = valor;
  return [primera, [...CERO], [...CERO], [...CERO]];
}

describe("HITOS_POWERUPS (D6)", () => {
  it("los umbrales aprobados son fijos: 3 de deshacer y 2 de bomba", () => {
    expect(HITOS_POWERUPS.deshacer).toEqual([128, 512, 1024]);
    expect(HITOS_POWERUPS.bomba).toEqual([256, 2048]);
  });

  it("ningún umbral se repite entre deshacer y bomba", () => {
    const todos = [...HITOS_POWERUPS.deshacer, ...HITOS_POWERUPS.bomba];
    expect(new Set(todos).size).toBe(todos.length);
  });
});

describe("calcularHitos (D6)", () => {
  it("tablero por debajo del primer umbral: nada concedido", () => {
    const res = calcularHitos(tableroCon(64), []);

    expect(res.concedidos).toEqual([]);
    expect(res.ganados).toEqual({ deshacer: 0, bomba: 0 });
  });

  it("cruzar un umbral concede todos los que quedan por debajo y no estaban dados", () => {
    expect(calcularHitos(tableroCon(128), [])).toEqual({
      concedidos: [128],
      ganados: { deshacer: 1, bomba: 0 },
    });
    // El 256 llega con el 128 ya concedido: solo se gana la bomba…
    expect(calcularHitos(tableroCon(256), [128])).toEqual({
      concedidos: [128, 256],
      ganados: { deshacer: 0, bomba: 1 },
    });
    // …pero sin nada concedido, el umbral más bajo también es nuevo.
    expect(calcularHitos(tableroCon(256), [])).toEqual({
      concedidos: [128, 256],
      ganados: { deshacer: 1, bomba: 1 },
    });
  });

  it("un tablero de 2048 concede los 5 umbrales, ordenados de menor a mayor", () => {
    expect(calcularHitos(tableroCon(2048), [])).toEqual({
      concedidos: [128, 256, 512, 1024, 2048],
      ganados: { deshacer: 3, bomba: 2 },
    });
  });

  it("los umbrales ya presentes en `concedidos` no se vuelven a conceder", () => {
    const res = calcularHitos(tableroCon(512), [128, 256]);

    expect(res.concedidos).toEqual([128, 256, 512]);
    expect(res.ganados).toEqual({ deshacer: 1, bomba: 0 }); // solo el 512 es nuevo
  });

  it("es idempotente: dos llamadas con el mismo tablero dan los mismos resultados", () => {
    const primera = calcularHitos(tableroCon(1024), []);
    const segunda = calcularHitos(tableroCon(1024), primera.concedidos);

    expect(segunda.concedidos).toEqual(primera.concedidos);
    expect(segunda.ganados).toEqual({ deshacer: 0, bomba: 0 });
  });

  it("NO muta ni el tablero ni la lista de concedidos recibida", () => {
    const tablero = tableroCon(512);
    const concedidos = [128];
    const tableroCopia = JSON.parse(JSON.stringify(tablero));
    const concedidosCopia = [...concedidos];

    calcularHitos(tablero, concedidos);

    expect(tablero).toEqual(tableroCopia);
    expect(concedidos).toEqual(concedidosCopia);
  });

  it("un tablero vacío no concede nada (máximo = 0)", () => {
    expect(calcularHitos(tableroCon(0), [])).toEqual({
      concedidos: [],
      ganados: { deshacer: 0, bomba: 0 },
    });
  });
});

describe("hitosAlcanzados (backfill de D8)", () => {
  it("tablero con 2048 ⇒ los 5 umbrales ya superados", () => {
    expect(hitosAlcanzados(tableroCon(2048))).toEqual([128, 256, 512, 1024, 2048]);
  });

  it("tablero de 32 ⇒ vacío (nada que marcar)", () => {
    expect(hitosAlcanzados(tableroCon(32))).toEqual([]);
  });

  it("el tablero real se mira entero, no solo la celda inicial", () => {
    const tablero = [[8, 16, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 128, 0]];
    expect(hitosAlcanzados(tablero)).toEqual([128]);
  });
});

describe("esPartidaValida con los campos opcionales del sub-bloque 2a (Task 3)", () => {
  // Forma v1 completa y válida SIN los campos nuevos: un guardado anterior.
  const BASE = {
    v: 1,
    board: tableroCon(4),
    score: 0,
    deshacerRestantes: 3,
    bombasRestantes: 1,
    victoriaAvisada: false,
    historial: [],
  };

  it("un guardado sin los campos nuevos sigue siendo válido (retrocompatible)", () => {
    expect(esPartidaValida(BASE)).toBe(true);
  });

  it("acepta los 4 campos con forma válida", () => {
    expect(esPartidaValida({
      ...BASE,
      modo: "reto",
      dia: "2026-10-10",
      rngEstado: 123456,
      hitos: [128, 256],
    })).toBe(true);
    expect(esPartidaValida({ ...BASE, modo: "normal" })).toBe(true);
  });

  it("modo con forma inválida ⇒ false (nunca lanza)", () => {
    expect(esPartidaValida({ ...BASE, modo: "partido" })).toBe(false);
    expect(esPartidaValida({ ...BASE, modo: 42 })).toBe(false);
    expect(esPartidaValida({ ...BASE, modo: null })).toBe(false);
  });

  it("dia que no es una fecha YYYY-MM-DD ⇒ false", () => {
    expect(esPartidaValida({ ...BASE, dia: "10-10-2026" })).toBe(false);
    expect(esPartidaValida({ ...BASE, dia: "2026-10-10T00:00" })).toBe(false);
    expect(esPartidaValida({ ...BASE, dia: 20261010 })).toBe(false);
  });

  it("rngEstado que no es un entero >= 0 ⇒ false", () => {
    expect(esPartidaValida({ ...BASE, rngEstado: -1 })).toBe(false);
    expect(esPartidaValida({ ...BASE, rngEstado: 1.5 })).toBe(false);
    expect(esPartidaValida({ ...BASE, rngEstado: "7" })).toBe(false);
  });

  it("hitos que no son un array de umbrales conocidos ⇒ false", () => {
    expect(esPartidaValida({ ...BASE, hitos: "128" })).toBe(false);
    expect(esPartidaValida({ ...BASE, hitos: [64] })).toBe(false); // umbral inexistente
    expect(esPartidaValida({ ...BASE, hitos: [128, 2048] })).toBe(true);
    expect(esPartidaValida({ ...BASE, hitos: [] })).toBe(true);
  });
});

// ============================================================
//  Task 11 — integración de los hitos en la UI (game.js)
//
//  game.js se importa DINÁMICA y es la ÚNICA importación del módulo en este
//  archivo (patrón arranque.test.js: importarlo dos veces duplicaría los
//  listeners de teclado/touch).
// ============================================================
const juego = await import("../game.js");

function partidaGuardada() {
  return JSON.parse(localStorage.getItem("partida2048"));
}

function contador(id) {
  return document.getElementById(id).textContent;
}

function toast() {
  const status = document.getElementById("status");
  return status.hidden ? "" : status.textContent;
}

// Partida con dos 64: el primer movimiento a la izquierda crea un 128 (D6).
const PARTIDA_64 = {
  v: 1,
  board: [[64, 64, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  score: 1000,
  deshacerRestantes: 3,
  bombasRestantes: 1,
  victoriaAvisada: false,
  historial: [],
  hitos: [],
};

// Estado que deja el caso anterior tras crear el 128 (128 ya concedido):
// [[128,2,0,0], …] con el spawn del turno y el contador ya en 4.
const PARTIDA_CON_128 = {
  v: 1,
  board: [[128, 2, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
  score: 1128,
  deshacerRestantes: 4,
  bombasRestantes: 1,
  victoriaAvisada: false,
  historial: [
    { board: [[64, 64, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]], score: 1000 },
  ],
  hitos: [128],
};

// Guardado del esquema ANTERIOR al sub-bloque 2a: sin `hitos`, sin `modo`.
// Tablero ya con 2048 (mismo patrón que arranque.test.js).
const PARTIDA_ANTIGUA = {
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

describe("concesión de hitos en la UI (Task 11)", () => {
  beforeEach(() => {
    document.getElementById("welcome").hidden = true; // sin modal: la entrada responde
    const status = document.getElementById("status");
    status.hidden = true; // cada test arranca sin toast
    status.textContent = "";
    juego.nuevaPartida(); // estado conocido: modo normal, hitos vacíos
  });

  afterEach(() => {
    // Invariantes tras CADA caso: 16 slots en el tablero y la capa FX vacía
    // (nuevaPartida() limpia los residuos de animación del turno anterior).
    juego.nuevaPartida();
    expect(document.getElementById("board").children).toHaveLength(16);
    expect(document.getElementById("fx-layer").children).toHaveLength(0);
  });

  it("una partida nueva no concede nada (sin campo hitos en el guardado)", () => {
    juego.mover("left"); // cualquier turno con cambio persiste la partida

    expect(partidaGuardada().hitos ?? []).toEqual([]);
    expect(contador("undo-count")).toBe("3");
    expect(contador("bomb-count")).toBe("1");
    expect(toast()).toBe("");
  });

  it("crear el 128 concede +1 deshacer con su toast y viaja al guardado", () => {
    localStorage.setItem("partida2048", JSON.stringify(PARTIDA_64));
    expect(juego.restaurarPartida()).toBe(true);
    expect(contador("undo-count")).toBe("3");

    juego.mover("left"); // [64,64] → 128 + spawn

    expect(contador("undo-count")).toBe("4");
    expect(toast()).toBe("+1 deshacer: ficha 128");
    expect(partidaGuardada().hitos).toEqual([128]);
  });

  it("crear el 256 concede +1 bomba (el 128 ya estaba concedido)", () => {
    localStorage.setItem("partida2048", JSON.stringify({
      ...PARTIDA_CON_128,
      board: [[128, 128, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
    }));
    expect(juego.restaurarPartida()).toBe(true);
    expect(contador("bomb-count")).toBe("1");

    juego.mover("left"); // [128,128] → 256 + spawn

    expect(contador("bomb-count")).toBe("2");
    expect(contador("undo-count")).toBe("4"); // el de deshacer no se mueve
    expect(toast()).toBe("+1 bomba: ficha 256");
    expect(partidaGuardada().hitos).toEqual([128, 256]);
  });

  it("restaurar el MISMO estado otra vez NO concede dos veces (idempotencia)", () => {
    localStorage.setItem("partida2048", JSON.stringify(PARTIDA_CON_128));
    expect(juego.restaurarPartida()).toBe(true);
    expect(contador("undo-count")).toBe("4");

    juego.mover("right"); // cambio sin nuevo umbral (máximo = 128)

    expect(contador("undo-count")).toBe("4"); // intacto
    expect(toast()).toBe("");                 // …ni un toast de hito
    expect(partidaGuardada().hitos).toEqual([128]);
  });

  it("guardado antiguo sin hitos con un 2048: backfill SIN conceder (D8)", () => {
    localStorage.setItem("partida2048", JSON.stringify(PARTIDA_ANTIGUA));
    expect(juego.restaurarPartida()).toBe(true);

    // Regresión directa de arranque.test.js: los contadores NO suben.
    expect(contador("undo-count")).toBe("2");
    expect(contador("bomb-count")).toBe("0");
    expect(toast()).toBe(""); // ningún aviso de hito al restaurar

    juego.mover("left"); // [2,2] fusiona: turno con cambio, sin nuevo umbral

    expect(contador("undo-count")).toBe("2"); // sigue sin conceder (D8)
    expect(contador("bomb-count")).toBe("0");
    expect(partidaGuardada().hitos).toEqual([128, 256, 512, 1024, 2048]);
  });
});
