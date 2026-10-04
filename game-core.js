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

// --- TRAZA DE ANIMACIÓN ---
// Pipeline paralelo sobre celdas {v, desde} donde "desde" es la lista de
// coordenadas [fila, col] de la matriz ORIGINAL que acaban en la celda.
// Reproduce la composición de trasladar(): así el des-mapeo de coordenadas
// lo hace la propia composición, sin fórmulas manuales por dirección.
// Solo genera la traza: los campos de aplicarMovimiento no cambian.

// Espejo de comprimir() para celdas: agrupa las no nulas a la izquierda.
function comprimirCeldas(fila) {
  const sinCeros = fila.filter(celda => celda.v !== 0);
  while (sinCeros.length < TAMANO) sinCeros.push({ v: 0, desde: [] });
  return sinCeros;
}

// Espejo de fusionar() para celdas: funde el par en una celda nueva que
// acumula los orígenes de las dos (no muta las celdas recibidas).
function fusionarCeldas(fila) {
  for (let i = 0; i < TAMANO - 1; i++) {
    if (fila[i].v !== 0 && fila[i].v === fila[i + 1].v) {
      fila[i] = { v: fila[i].v * 2, desde: [...fila[i].desde, ...fila[i + 1].desde] };
      fila[i + 1] = { v: 0, desde: [] };
      i++; // salta la siguiente: evita fusión en cadena
    }
  }
  return fila;
}

// Espejo de moverFilaIzquierda(): comprimir + fusionar + comprimir.
function moverFilaTrazada(fila) {
  const comprimida = comprimirCeldas(fila);
  const fusionada = fusionarCeldas(comprimida);
  return comprimirCeldas(fusionada);
}

function moverMatrizIzquierdaTrazada(celdas) {
  return celdas.map(fila => moverFilaTrazada(fila));
}

// Misma composición que trasladar(), sobre celdas. Devuelve null si la
// dirección es desconocida.
function trasladarTrazado(celdas, direccion) {
  switch (direccion) {
    case "left":
      return moverMatrizIzquierdaTrazada(celdas);
    case "right":
      return invertirFilas(moverMatrizIzquierdaTrazada(invertirFilas(celdas)));
    case "up":
      return transponer(moverMatrizIzquierdaTrazada(transponer(celdas)));
    case "down":
      return transponer(invertirFilas(
        moverMatrizIzquierdaTrazada(invertirFilas(transponer(celdas)))
      ));
    default:
      return null;
  }
}

// Construye la traza en coordenadas de la matriz original: la posición de la
// celda en el resultado YA está en el marco original porque la composición
// deshace las transformaciones.
function calcularTraza(matriz, direccion) {
  const vacia = { movimientos: [], fusiones: [] };
  const celdas = matriz.map((fila, f) =>
    fila.map((v, c) => ({ v, desde: v !== 0 ? [[f, c]] : [] }))
  );
  const final = trasladarTrazado(celdas, direccion);
  if (!final) return vacia;

  const movimientos = [];
  const fusiones = [];
  for (let f = 0; f < TAMANO; f++) {
    for (let c = 0; c < TAMANO; c++) {
      const celda = final[f][c];
      if (celda.v === 0) continue;
      // Solo los pares con origen distinto del destino (las fichas que no
      // se mueven no generan animación).
      for (const origen of celda.desde) {
        if (origen[0] !== f || origen[1] !== c) {
          movimientos.push({ desde: origen, hasta: [f, c] });
        }
      }
      if (celda.desde.length > 1) {
        fusiones.push({ en: [f, c], valor: celda.v, desde: celda.desde });
      }
    }
  }
  return { movimientos, fusiones };
}

// Aplica un movimiento completo sin tocar la matriz de entrada.
// "left" es la operación base; el resto se componen con transponer/invertir.
// Devuelve además "traza" (aditiva): vacía si no hay cambio o si la dirección
// es desconocida; los demás campos no cambian de forma ni de valor.
export function aplicarMovimiento(matriz, direccion) {
  const previo = copiar(matriz);
  const resultado = trasladar(matriz, direccion);
  const cambio = !sonIguales(previo, resultado.matriz);
  return {
    previo,                       // estado anterior (para el historial de deshacer)
    matriz: resultado.matriz,
    puntos: resultado.puntos,
    cambio,
    traza: cambio
      ? calcularTraza(matriz, direccion)
      : { movimientos: [], fusiones: [] },
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

// --- VALIDACIÓN DE PARTIDA GUARDADA ---
// Número finito (descarta NaN e Infinity, que no sobreviven a JSON pero
// podrían aparecer en datos escritos a mano).
function esNumero(v) {
  return typeof v === "number" && Number.isFinite(v);
}

// Tablero 4x4 de enteros >= 0 (el tablero principal de la partida).
function esBoardEntero(board) {
  if (!Array.isArray(board) || board.length !== TAMANO) return false;
  return board.every(fila =>
    Array.isArray(fila)
    && fila.length === TAMANO
    && fila.every(v => Number.isInteger(v) && v >= 0)
  );
}

// Tablero 4x4 de valores numéricos (entradas del historial de deshacer).
function esBoardNumerico(board) {
  if (!Array.isArray(board) || board.length !== TAMANO) return false;
  return board.every(fila =>
    Array.isArray(fila)
    && fila.length === TAMANO
    && fila.every(esNumero)
  );
}

// Valida la forma de una partida guardada (clave "partida2048").
// Devuelve booleano y NUNCA lanza: una partida corrupta debe poder
// descartarse en game.js sin romper el arranque.
export function esPartidaValida(partida) {
  if (partida === null || typeof partida !== "object" || Array.isArray(partida)) return false;
  if (partida.v !== 1) return false;
  if (!esBoardEntero(partida.board)) return false;
  if (!esNumero(partida.score) || partida.score < 0) return false;
  if (!Number.isInteger(partida.deshacerRestantes) || partida.deshacerRestantes < 0) return false;
  if (!Number.isInteger(partida.bombasRestantes) || partida.bombasRestantes < 0) return false;
  if (typeof partida.victoriaAvisada !== "boolean") return false;
  if (!Array.isArray(partida.historial)) return false;
  return partida.historial.every(entrada =>
    entrada !== null
    && typeof entrada === "object"
    && !Array.isArray(entrada)
    && esBoardNumerico(entrada.board)
    && esNumero(entrada.score)
  );
}
