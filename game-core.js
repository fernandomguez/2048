// ============================================================
//  2048 — game-core.js
//  Lógica PURA del juego: recibe datos y devuelve datos.
//  Sin DOM, sin localStorage, sin eventos, sin UI.
//  Toda la capa de presentación vive en game.js.
// ============================================================

// --- CONSTANTES DE REGLA ---
export const TAMANO = 4;                       // tablero TAMANO x TAMANO
export const VALOR_VICTORIA = 2048;
export const PROBABILIDAD_DOS = 0.9;           // 90% de nuevas fichas = 2
export const USOS_DESHACER_INICIALES = 3;
export const BOMBAS_INICIALES = 1;

// --- UTILIDADES DE MATRIZ ---
export function crearTablero() {
  return Array.from({ length: TAMANO }, () => Array(TAMANO).fill(0));
}

export function copiar(matriz) {
  return matriz.map(fila => [...fila]);
}

export function sonIguales(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- LÓGICA DE UNA FILA ---
export function comprimir(fila) {
  const sinCeros = fila.filter(v => v !== 0);
  while (sinCeros.length < TAMANO) sinCeros.push(0);
  return sinCeros;
}

// Fusiona pares adyacentes. NO muta el estado de la app: devuelve la fila
// resultante y los puntos ganados, y el llamador decide qué hacer con ellos.
export function fusionar(fila) {
  let puntos = 0;
  for (let i = 0; i < TAMANO - 1; i++) {
    if (fila[i] !== 0 && fila[i] === fila[i + 1]) {
      fila[i] = fila[i] * 2;
      fila[i + 1] = 0;
      puntos += fila[i];
      i++; // salta la siguiente: evita fusión en cadena
    }
  }
  return { fila, puntos };
}

export function moverFilaIzquierda(fila) {
  const comprimida = comprimir(fila);
  const fusionada = fusionar(comprimida);
  return { fila: comprimir(fusionada.fila), puntos: fusionada.puntos };
}

// --- TRANSFORMACIONES DE MATRIZ ---
export function invertirFilas(matriz) {
  return matriz.map(fila => [...fila].reverse());
}

export function transponer(matriz) {
  const resultado = [];
  for (let col = 0; col < TAMANO; col++) {
    const nuevaFila = [];
    for (let fila = 0; fila < TAMANO; fila++) nuevaFila.push(matriz[fila][col]);
    resultado.push(nuevaFila);
  }
  return resultado;
}

function moverMatrizIzquierda(matriz) {
  let puntos = 0;
  const resultado = matriz.map(fila => {
    const r = moverFilaIzquierda(fila);
    puntos += r.puntos;
    return r.fila;
  });
  return { matriz: resultado, puntos };
}

function trasladar(matriz, direccion) {
  switch (direccion) {
    case "left":
      return moverMatrizIzquierda(matriz);
    case "right": {
      const r = moverMatrizIzquierda(invertirFilas(matriz));
      return { matriz: invertirFilas(r.matriz), puntos: r.puntos };
    }
    case "up": {
      const r = moverMatrizIzquierda(transponer(matriz));
      return { matriz: transponer(r.matriz), puntos: r.puntos };
    }
    case "down": {
      const r = moverMatrizIzquierda(invertirFilas(transponer(matriz)));
      return { matriz: transponer(invertirFilas(r.matriz)), puntos: r.puntos };
    }
    default:
      return { matriz: copiar(matriz), puntos: 0 };
  }
}

// Aplica un movimiento completo sin tocar la matriz de entrada.
// "left" es la operación base; el resto se componen con transponer/invertir.
export function aplicarMovimiento(matriz, direccion) {
  const previo = copiar(matriz);
  const resultado = trasladar(matriz, direccion);
  return {
    previo,                       // estado anterior (para el historial de deshacer)
    matriz: resultado.matriz,
    puntos: resultado.puntos,
    cambio: !sonIguales(previo, resultado.matriz),
  };
}

// --- SPAWN ---
export function celdasVacias(matriz) {
  const vacias = [];
  for (let fila = 0; fila < TAMANO; fila++) {
    for (let col = 0; col < TAMANO; col++) {
      if (matriz[fila][col] === 0) vacias.push([fila, col]);
    }
  }
  return vacias;
}

// Devuelve el tablero nuevo y la posición de la ficha (null si no hay hueco).
// "rnd" es inyectable para poder testear sin aleatoriedad real.
export function agregarFicha(matriz, rnd = Math.random) {
  const vacias = celdasVacias(matriz);
  if (vacias.length === 0) return { matriz, posicion: null };
  const [fila, col] = vacias[Math.floor(rnd() * vacias.length)];
  const resultado = copiar(matriz);
  resultado[fila][col] = rnd() < PROBABILIDAD_DOS ? 2 : 4;
  return { matriz: resultado, posicion: [fila, col] };
}

// --- FIN DE PARTIDA ---
export function hayFusionPosible(matriz) {
  for (let fila = 0; fila < TAMANO; fila++) {
    for (let col = 0; col < TAMANO; col++) {
      const valor = matriz[fila][col];
      if (col < TAMANO - 1 && valor === matriz[fila][col + 1]) return true;
      if (fila < TAMANO - 1 && valor === matriz[fila + 1][col]) return true;
    }
  }
  return false;
}

export function esGameOver(matriz) {
  return celdasVacias(matriz).length === 0 && !hayFusionPosible(matriz);
}

export function hayVictoria(matriz, valor = VALOR_VICTORIA) {
  return matriz.some(fila => fila.includes(valor));
}

// --- DESHACER ---
// Máquina de estados pura: nunca modifica el estado recibido.
export function aplicarDeshacer({ board, score, historial, usos }) {
  if (usos <= 0 || historial.length === 0) {
    return { board, score, historial, usos, restaurado: false };
  }
  const anterior = historial[historial.length - 1];
  return {
    board: copiar(anterior.board),
    score: anterior.score,
    historial: historial.slice(0, -1),
    usos: usos - 1,
    restaurado: true,
  };
}
