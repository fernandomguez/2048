// ============================================================
//  2048 — game.js
//  Estado del juego + lógica de movimiento y fusión
// ============================================================

// --- ESTADO ---
// La verdad del juego. 0 = celda vacía. Todo lo demás se deriva de aquí.
let board = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];

let score = 0;
const boardEl = document.getElementById("board");

// --- RENDER ---
// Borra el tablero y lo vuelve a dibujar LEYENDO desde 'board'.
// No decide nada del juego: solo refleja el estado actual en pantalla.
function render() {
  boardEl.innerHTML = "";
  for (let fila = 0; fila < 4; fila++) {
    for (let col = 0; col < 4; col++) {
      const valor = board[fila][col];
      const cell = document.createElement("div");
      cell.className = "cell";
      if (valor !== 0) {
        cell.textContent = valor;
        cell.dataset.value = valor; // lo usaremos para colorear por CSS más adelante
      }
      boardEl.appendChild(cell);
    }
  }
}

// --- SPAWN ---
// Coloca una ficha nueva (2 o 4) en una celda vacía elegida al azar.
function spawn() {
  const vacias = [];
  for (let fila = 0; fila < 4; fila++) {
    for (let col = 0; col < 4; col++) {
      if (board[fila][col] === 0) {
        vacias.push([fila, col]);
      }
    }
  }
  if (vacias.length === 0) return; // tablero lleno: no hace nada
  const [fila, col] = vacias[Math.floor(Math.random() * vacias.length)];
  board[fila][col] = Math.random() < 0.9 ? 2 : 4; // 90% un 2, 10% un 4
}

// --- LÓGICA DE UNA FILA ---
// Comprime: manda los no-ceros a la izquierda, ceros al final.
function comprimir(fila) {
  const sinCeros = fila.filter(v => v !== 0);
  while (sinCeros.length < 4) {
    sinCeros.push(0);
  }
  return sinCeros;
}

// Fusiona adyacentes iguales (una sola vez cada una) en una fila YA comprimida.
function fusionar(fila) {
  for (let i = 0; i < 3; i++) {
    if (fila[i] !== 0 && fila[i] === fila[i + 1]) {
      fila[i] = fila[i] * 2;
      fila[i + 1] = 0;
      score += fila[i];
      i++; // salta la siguiente: evita fusión en cadena
    }
  }
  return fila;
}

// Mueve una fila a la izquierda: comprimir -> fusionar -> comprimir.
function moverFilaIzquierda(fila) {
  fila = comprimir(fila);
  fila = fusionar(fila);
  fila = comprimir(fila);
  return fila;
}

// --- TRANSFORMACIONES DE MATRIZ ---
// Invierte cada fila (espejo horizontal). Para el movimiento a la derecha.
function invertirFilas(matriz) {
  return matriz.map(fila => [...fila].reverse());
}

// Transpone la matriz (filas <-> columnas). Para los movimientos verticales.
function transponer(matriz) {
  const resultado = [];
  for (let col = 0; col < 4; col++) {
    const nuevaFila = [];
    for (let fila = 0; fila < 4; fila++) {
      nuevaFila.push(matriz[fila][col]);
    }
    resultado.push(nuevaFila);
  }
  return resultado;
}

// Aplica moverFilaIzquierda a las 4 filas.
function moverMatrizIzquierda(matriz) {
  return matriz.map(fila => moverFilaIzquierda(fila));
}

// --- COPIA Y COMPARACIÓN ---
// Copia profunda de una matriz 4x4 (clona también las filas internas).
function copiar(matriz) {
  return matriz.map(fila => [...fila]);
}

// ¿Dos matrices tienen el mismo contenido?
function sonIguales(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- MOVIMIENTO COMPLETO ---
// Mueve todo el tablero en una dirección y genera ficha nueva SOLO si cambió algo.
function mover(direccion) {
  const previo = copiar(board); // foto del tablero antes de mover

  if (direccion === "left") {
    board = moverMatrizIzquierda(board);
  } else if (direccion === "right") {
    board = invertirFilas(board);
    board = moverMatrizIzquierda(board);
    board = invertirFilas(board);
  } else if (direccion === "up") {
    board = transponer(board);
    board = moverMatrizIzquierda(board);
    board = transponer(board);
  } else if (direccion === "down") {
    board = transponer(board);
    board = invertirFilas(board);
    board = moverMatrizIzquierda(board);
    board = invertirFilas(board);
    board = transponer(board);
  }

  if (!sonIguales(previo, board)) {
    spawn();
  }

  render();
}

// --- INICIO DE PARTIDA ---
spawn();
spawn();
render();