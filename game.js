// --- ESTADO ---
// La verdad del juego. 0 = celda vacía. Todo lo demás se deriva de aquí.
let board = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];

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
// Coloca una ficha nueva (2 o 4) en una celda vacía elegida al azar.
function spawn() {
  // 1. Recolectar todas las celdas vacías como pares [fila, col].
  const vacias = [];
  for (let fila = 0; fila < 4; fila++) {
    for (let col = 0; col < 4; col++) {
      if (board[fila][col] === 0) {
        vacias.push([fila, col]);
      }
    }
  }

  // 2. Si no hay ninguna vacía, no hacemos nada (esto importará en el hito 7).
  if (vacias.length === 0) return;

  // 3. Elegir una celda vacía al azar.
  const [fila, col] = vacias[Math.floor(Math.random() * vacias.length)];

  // 4. 90% un 2, 10% un 4.
  board[fila][col] = Math.random() < 0.9 ? 2 : 4;
}
// Inicio de partida: dos fichas y a dibujar.
spawn();
spawn();
render();