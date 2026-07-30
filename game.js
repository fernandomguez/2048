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

// Primer dibujado
render();