import { describe, it, expect } from "vitest";
import {
  TAMANO,
  crearTablero,
  copiar,
  sonIguales,
  comprimir,
  fusionar,
  moverFilaIzquierda,
  invertirFilas,
  transponer,
  aplicarMovimiento,
  agregarFicha,
  esGameOver,
  hayFusionPosible,
  hayVictoria,
  aplicarDeshacer,
} from "../game-core.js";

// Tablero de referencia asimétrico para probar las 4 direcciones.
const INICIAL = [
  [2, 0, 2, 0],
  [0, 0, 0, 0],
  [0, 4, 0, 0],
  [0, 0, 0, 8],
];

describe("crearTablero / copiar / sonIguales", () => {
  it("crearTablero devuelve un tablero TAMANO x TAMANO lleno de ceros", () => {
    const t = crearTablero();
    expect(t).toHaveLength(TAMANO);
    expect(t.every(fila => fila.length === TAMANO)).toBe(true);
    expect(sonIguales(t, Array.from({ length: 4 }, () => [0, 0, 0, 0]))).toBe(true);
  });

  it("copiar hace una copia profunda (mutar la copia no afecta al original)", () => {
    const copia = copiar(INICIAL);
    copia[0][0] = 99;
    expect(INICIAL[0][0]).toBe(2);
  });

  it("sonIguales compara tableros por valor", () => {
    expect(sonIguales(INICIAL, copiar(INICIAL))).toBe(true);
    expect(sonIguales(INICIAL, crearTablero())).toBe(false);
  });
});

describe("comprimir", () => {
  it("agrupa a la izquierda y rellena con ceros", () => {
    expect(comprimir([0, 2, 0, 4])).toEqual([2, 4, 0, 0]);
    expect(comprimir([0, 0, 0, 0])).toEqual([0, 0, 0, 0]);
    expect(comprimir([2, 4, 8, 16])).toEqual([2, 4, 8, 16]);
    expect(comprimir([0, 0, 0, 7])).toEqual([7, 0, 0, 0]);
  });
});

describe("fusionar", () => {
  it("[2,2,2,2] → [4,0,4,0] con 8 puntos (sin fusión en cadena)", () => {
    const r = fusionar([2, 2, 2, 2]);
    expect(r.fila).toEqual([4, 0, 4, 0]);
    expect(r.puntos).toBe(8);
  });

  it("[4,2,2,0] → [4,4,0,0] con 4 puntos", () => {
    const r = fusionar([4, 2, 2, 0]);
    expect(r.fila).toEqual([4, 4, 0, 0]);
    expect(r.puntos).toBe(4);
  });

  it("no fusiona ceros entre sí", () => {
    const r = fusionar([0, 0, 0, 0]);
    expect(r.fila).toEqual([0, 0, 0, 0]);
    expect(r.puntos).toBe(0);
  });

  it("[4,4,8,8] → [8,0,16,0] con 24 puntos", () => {
    const r = fusionar([4, 4, 8, 8]);
    expect(r.fila).toEqual([8, 0, 16, 0]);
    expect(r.puntos).toBe(24);
  });
});

describe("moverFilaIzquierda (comprimir + fusionar + comprimir)", () => {
  it("[2,2,2,2] → [4,4,0,0] (NO [8,0,0,0])", () => {
    const r = moverFilaIzquierda([2, 2, 2, 2]);
    expect(r.fila).toEqual([4, 4, 0, 0]);
    expect(r.puntos).toBe(8);
  });

  it("[4,2,2,0] → [4,4,0,0]", () => {
    const r = moverFilaIzquierda([4, 2, 2, 0]);
    expect(r.fila).toEqual([4, 4, 0, 0]);
    expect(r.puntos).toBe(4);
  });

  it("[2,2,4,0] → [4,4,0,0] (el 4 no se fusiona con el resultado)", () => {
    const r = moverFilaIzquierda([2, 2, 4, 0]);
    expect(r.fila).toEqual([4, 4, 0, 0]);
    expect(r.puntos).toBe(4);
  });

  it("[2,2,2,0] → [4,2,0,0]: sin fusión en cadena", () => {
    const r = moverFilaIzquierda([2, 2, 2, 0]);
    expect(r.fila).toEqual([4, 2, 0, 0]);
    expect(r.puntos).toBe(4);
  });

  it("fila sin posibles fusiones no cambia ni puntúa", () => {
    const r = moverFilaIzquierda([4, 2, 0, 0]);
    expect(r.fila).toEqual([4, 2, 0, 0]);
    expect(r.puntos).toBe(0);
  });
});

describe("transformaciones de matriz", () => {
  it("invertirFilas invierte cada fila", () => {
    expect(invertirFilas([[1, 2, 0, 0], [0, 0, 0, 0]])).toEqual([[0, 0, 2, 1], [0, 0, 0, 0]]);
  });

  it("transponer convierte columnas en filas", () => {
    expect(transponer([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 0, 1, 2],
      [3, 4, 5, 6],
    ])).toEqual([
      [1, 5, 9, 3],
      [2, 6, 0, 4],
      [3, 7, 1, 5],
      [4, 8, 2, 6],
    ]);
  });

  it("doble transposición devuelve la matriz original", () => {
    expect(sonIguales(transponer(transponer(INICIAL)), INICIAL)).toBe(true);
  });
});

describe("aplicarMovimiento (las 4 direcciones)", () => {
  it("left", () => {
    const r = aplicarMovimiento(INICIAL, "left");
    expect(r.matriz).toEqual([
      [4, 0, 0, 0],
      [0, 0, 0, 0],
      [4, 0, 0, 0],
      [8, 0, 0, 0],
    ]);
    expect(r.puntos).toBe(4);
    expect(r.cambio).toBe(true);
  });

  it("right", () => {
    const r = aplicarMovimiento(INICIAL, "right");
    expect(r.matriz).toEqual([
      [0, 0, 0, 4],
      [0, 0, 0, 0],
      [0, 0, 0, 4],
      [0, 0, 0, 8],
    ]);
    expect(r.puntos).toBe(4);
    expect(r.cambio).toBe(true);
  });

  it("up", () => {
    const r = aplicarMovimiento(INICIAL, "up");
    expect(r.matriz).toEqual([
      [2, 4, 2, 8],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]);
    expect(r.puntos).toBe(0);
    expect(r.cambio).toBe(true);
  });

  it("down", () => {
    const r = aplicarMovimiento(INICIAL, "down");
    expect(r.matriz).toEqual([
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [2, 4, 2, 8],
    ]);
    expect(r.puntos).toBe(0);
    expect(r.cambio).toBe(true);
  });

  it("previo devuelve el estado anterior sin mutar la entrada", () => {
    const antes = copiar(INICIAL);
    const r = aplicarMovimiento(INICIAL, "left");
    expect(r.previo).toEqual(antes);
    expect(INICIAL).toEqual(antes);
  });

  it("movimiento que no cambia nada: cambio=false y 0 puntos", () => {
    const estatico = [
      [2, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ];
    const r = aplicarMovimiento(estatico, "left");
    expect(r.cambio).toBe(false);
    expect(r.puntos).toBe(0);
    expect(r.matriz).toEqual(estatico);
  });

  it("dirección desconocida no cambia el tablero", () => {
    const r = aplicarMovimiento(INICIAL, "diagonal");
    expect(r.cambio).toBe(false);
    expect(r.puntos).toBe(0);
    expect(r.matriz).toEqual(INICIAL);
  });
});

describe("agregarFicha (spawn)", () => {
  it("en tablero completo no cambia nada y devuelve posicion null", () => {
    const lleno = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 4],
      [4, 2, 4, 2],
    ];
    const r = agregarFicha(lleno, () => 0);
    expect(r.matriz).toEqual(lleno);
    expect(r.posicion).toBeNull();
  });

  it("coloca la ficha en la primera vacía con el valor por defecto (2)", () => {
    const r = agregarFicha(crearTablero(), () => 0);
    expect(r.posicion).toEqual([0, 0]);
    expect(r.matriz[0][0]).toBe(2);
  });

  it("un rnd >= 0.9 produce una ficha de valor 4", () => {
    const respuestas = [0, 0.95]; // 1ª llamada: posición, 2ª: valor
    const r = agregarFicha(crearTablero(), () => respuestas.shift());
    expect(r.posicion).toEqual([0, 0]);
    expect(r.matriz[0][0]).toBe(4);
  });

  it("no muta el tablero de entrada", () => {
    const original = crearTablero();
    agregarFicha(original, () => 0);
    expect(original[0][0]).toBe(0);
  });
});

describe("detección de fin de partida", () => {
  const LLENO_SIN_FUSION = [
    [2, 4, 2, 4],
    [4, 2, 4, 2],
    [2, 4, 2, 4],
    [4, 2, 4, 2],
  ];

  it("tablero lleno sin fusiones → game over", () => {
    expect(esGameOver(LLENO_SIN_FUSION)).toBe(true);
  });

  it("tablero lleno con pareja horizontal → no es game over", () => {
    const conFusion = [
      [2, 2, 4, 8],
      [16, 32, 64, 128],
      [2, 4, 8, 16],
      [32, 64, 128, 256],
    ];
    expect(hayFusionPosible(conFusion)).toBe(true);
    expect(esGameOver(conFusion)).toBe(false);
  });

  it("tablero lleno con pareja vertical → no es game over", () => {
    const conFusionVertical = [
      [2, 4, 8, 16],
      [2, 4, 8, 16],
      [4, 8, 16, 32],
      [8, 16, 32, 64],
    ];
    expect(hayFusionPosible(conFusionVertical)).toBe(true);
    expect(esGameOver(conFusionVertical)).toBe(false);
  });

  it("tablero con huecos → no es game over", () => {
    const conHueco = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 0, 4],
      [4, 2, 4, 2],
    ];
    expect(esGameOver(conHueco)).toBe(false);
  });
});

describe("detección de victoria", () => {
  it("2048 en el tablero → victoria", () => {
    const con2048 = crearTablero();
    con2048[3][3] = 2048;
    expect(hayVictoria(con2048)).toBe(true);
  });

  it("4096 sin 2048 → no es victoria (la condición es el valor exacto)", () => {
    const con4096 = crearTablero();
    con4096[0][0] = 4096;
    expect(hayVictoria(con4096)).toBe(false);
  });

  it("sin 2048 → no es victoria", () => {
    expect(hayVictoria(crearTablero())).toBe(false);
  });
});

describe("aplicarDeshacer", () => {
  const TABLERO_ACTUAL = [
    [4, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  const TABLERO_ANTERIOR = [
    [2, 2, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  function estado(overrides = {}) {
    return {
      board: TABLERO_ACTUAL,
      score: 100,
      historial: [{ board: TABLERO_ANTERIOR, score: 60 }],
      usos: 3,
      ...overrides,
    };
  }

  it("restaura tablero y puntuación, consume un uso y recorta el historial", () => {
    const r = aplicarDeshacer(estado());
    expect(r.restaurado).toBe(true);
    expect(r.board).toEqual(TABLERO_ANTERIOR);
    expect(r.score).toBe(60);
    expect(r.usos).toBe(2);
    expect(r.historial).toHaveLength(0);
  });

  it("con 0 usos no restaura ni baja de cero", () => {
    const r = aplicarDeshacer(estado({ usos: 0 }));
    expect(r.restaurado).toBe(false);
    expect(r.usos).toBe(0);
    expect(r.board).toEqual(TABLERO_ACTUAL);
    expect(r.score).toBe(100);
    expect(r.historial).toHaveLength(1);
  });

  it("sin historial no restaura y no consume usos", () => {
    const r = aplicarDeshacer(estado({ historial: [] }));
    expect(r.restaurado).toBe(false);
    expect(r.usos).toBe(3);
    expect(r.board).toEqual(TABLERO_ACTUAL);
  });

  it("no muta el estado recibido", () => {
    const e = estado();
    const historialOriginal = e.historial;
    aplicarDeshacer(e);
    expect(e.historial).toBe(historialOriginal);
    expect(e.historial).toHaveLength(1);
    expect(e.usos).toBe(3);
    expect(e.board).toEqual(TABLERO_ACTUAL);
  });

  it("pila de dos movimientos: restaura el más reciente", () => {
    const primero = { board: crearTablero(), score: 0 };
    const r = aplicarDeshacer(estado({
      historial: [primero, { board: TABLERO_ANTERIOR, score: 60 }],
    }));
    expect(r.board).toEqual(TABLERO_ANTERIOR);
    expect(r.historial).toEqual([primero]);
  });
});
