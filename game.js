// ============================================================
//  2048 — game.js
//  Estado + lógica de movimiento/fusión + fin de partida + récord
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
let best = leerRecord();        // récord de partidas anteriores
let victoriaAvisada = false;    // para no repetir el aviso de victoria cada jugada
let ultimaFichaNueva = null;    // [fila, col] de la última ficha generada (para animar)

// Referencias al DOM
const boardEl   = document.getElementById("board");
const scoreEl   = document.getElementById("score");
const bestEl    = document.getElementById("best");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl   = document.getElementById("overlay-title");
const overlayTextEl    = document.getElementById("overlay-text");
const overlayActionsEl = document.getElementById("overlay-actions");

// --- RENDER ---
// Borra el tablero y lo redibuja LEYENDO desde 'board'. Refleja el estado; no decide nada.
function render() {
  boardEl.innerHTML = "";
  for (let fila = 0; fila < 4; fila++) {
    for (let col = 0; col < 4; col++) {
      const valor = board[fila][col];
      const cell = document.createElement("div");
      cell.className = "cell";
      if (valor !== 0) {
        cell.textContent = valor;
        cell.dataset.value = valor;                 // colorea por CSS según el valor
        cell.classList.add("len" + String(valor).length); // ajusta tamaño de fuente
        // Anima solo la ficha recién aparecida, no todo el tablero.
        if (ultimaFichaNueva && ultimaFichaNueva[0] === fila && ultimaFichaNueva[1] === col) {
          cell.classList.add("nueva");
        }
      }
      boardEl.appendChild(cell);
    }
  }
  actualizarMarcador();
}

// --- SPAWN ---
// Coloca una ficha nueva (2 o 4) en una celda vacía al azar y recuerda su posición.
function spawn() {
  const vacias = [];
  for (let fila = 0; fila < 4; fila++) {
    for (let col = 0; col < 4; col++) {
      if (board[fila][col] === 0) vacias.push([fila, col]);
    }
  }
  if (vacias.length === 0) return;
  const [fila, col] = vacias[Math.floor(Math.random() * vacias.length)];
  board[fila][col] = Math.random() < 0.9 ? 2 : 4;
  ultimaFichaNueva = [fila, col];
}

// --- LÓGICA DE UNA FILA ---
function comprimir(fila) {
  const sinCeros = fila.filter(v => v !== 0);
  while (sinCeros.length < 4) sinCeros.push(0);
  return sinCeros;
}

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

function moverFilaIzquierda(fila) {
  fila = comprimir(fila);
  fila = fusionar(fila);
  fila = comprimir(fila);
  return fila;
}

// --- TRANSFORMACIONES DE MATRIZ ---
function invertirFilas(matriz) {
  return matriz.map(fila => [...fila].reverse());
}

function transponer(matriz) {
  const resultado = [];
  for (let col = 0; col < 4; col++) {
    const nuevaFila = [];
    for (let fila = 0; fila < 4; fila++) nuevaFila.push(matriz[fila][col]);
    resultado.push(nuevaFila);
  }
  return resultado;
}

function moverMatrizIzquierda(matriz) {
  return matriz.map(fila => moverFilaIzquierda(fila));
}

// --- COPIA Y COMPARACIÓN ---
function copiar(matriz) {
  return matriz.map(fila => [...fila]);
}

function sonIguales(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- MOVIMIENTO COMPLETO ---
function mover(direccion) {
  if (!overlayEl.hidden) return; // si hay overlay (fin/victoria), no se mueve

  const previo = copiar(board);

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
  } else {
    ultimaFichaNueva = null; // no hubo cambio: nada que animar
  }

  render();

  // Fin de partida
  if (!victoriaAvisada && hayVictoria()) {
    victoriaAvisada = true;
    mostrarVictoria();
  } else if (esGameOver()) {
    mostrarGameOver();
  }
}

// --- FIN DE PARTIDA ---
function hayVacias() {
  for (let fila = 0; fila < 4; fila++)
    for (let col = 0; col < 4; col++)
      if (board[fila][col] === 0) return true;
  return false;
}

function hayFusionPosible() {
  for (let fila = 0; fila < 4; fila++) {
    for (let col = 0; col < 4; col++) {
      const valor = board[fila][col];
      if (col < 3 && valor === board[fila][col + 1]) return true; // vecina derecha
      if (fila < 3 && valor === board[fila + 1][col]) return true; // vecina abajo
    }
  }
  return false;
}

function esGameOver() {
  return !hayVacias() && !hayFusionPosible();
}

function hayVictoria() {
  for (let fila = 0; fila < 4; fila++)
    for (let col = 0; col < 4; col++)
      if (board[fila][col] === 2048) return true;
  return false;
}

// --- PERSISTENCIA DEL RÉCORD ---
// Guardamos un OBJETO, no un número suelto: así mañana se le añaden campos
// (fecha, última partida...) y viaja tal cual a una API sin reescribir nada.
function guardarRecord(valor) {
  try {
    localStorage.setItem("stats2048", JSON.stringify({ record: valor }));
  } catch (e) { /* si localStorage falla, el juego sigue igual */ }
}

function leerRecord() {
  try {
    const crudo = localStorage.getItem("stats2048");
    if (!crudo) return 0;
    return JSON.parse(crudo).record || 0;
  } catch (e) {
    return 0;
  }
}

// --- MARCADOR ---
function actualizarMarcador() {
  if (score > best) {
    best = score;
    guardarRecord(best);
  }
  scoreEl.textContent = score;
  bestEl.textContent = best;
}

// --- OVERLAY (fin / victoria) ---
function mostrarOverlay(titulo, texto, botones) {
  overlayTitleEl.textContent = titulo;
  overlayTextEl.textContent = texto;
  overlayActionsEl.innerHTML = "";
  botones.forEach(b => {
    const btn = document.createElement("button");
    btn.className = "btn" + (b.ghost ? " ghost" : "");
    btn.textContent = b.label;
    btn.addEventListener("click", b.onClick);
    overlayActionsEl.appendChild(btn);
  });
  overlayEl.hidden = false;
}

function ocultarOverlay() {
  overlayEl.hidden = true;
}

function mostrarVictoria() {
  mostrarOverlay(
    "¡2048!",
    "Has llegado. Puedes seguir para superar tu récord.",
    [
      { label: "Seguir jugando", ghost: true, onClick: ocultarOverlay },
      { label: "Nueva partida", onClick: nuevaPartida },
    ]
  );
}

function mostrarGameOver() {
  mostrarOverlay(
    "Sin movimientos",
    "El tablero está bloqueado. Puntuación: " + score + ".",
    [{ label: "Nueva partida", onClick: nuevaPartida }]
  );
}

// --- NUEVA PARTIDA ---
function nuevaPartida() {
  board = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  score = 0;
  victoriaAvisada = false;
  ultimaFichaNueva = null;
  ocultarOverlay();
  spawn();
  spawn();
  render();
}

// --- ENTRADA: TECLADO ---
document.addEventListener("keydown", (evento) => {
  const direccion = {
    ArrowLeft:  "left",
    ArrowRight: "right",
    ArrowUp:    "up",
    ArrowDown:  "down",
  }[evento.key];
  if (direccion) {
    evento.preventDefault();
    mover(direccion);
  }
});

// --- ENTRADA: TÁCTIL (SWIPE) ---
let inicioX = 0;
let inicioY = 0;

boardEl.addEventListener("touchstart", (evento) => {
  inicioX = evento.touches[0].clientX;
  inicioY = evento.touches[0].clientY;
});

boardEl.addEventListener("touchend", (evento) => {
  const deltaX = evento.changedTouches[0].clientX - inicioX;
  const deltaY = evento.changedTouches[0].clientY - inicioY;
  const UMBRAL = 30;
  if (Math.abs(deltaX) < UMBRAL && Math.abs(deltaY) < UMBRAL) return;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    mover(deltaX > 0 ? "right" : "left");
  } else {
    mover(deltaY > 0 ? "down" : "up");
  }
});

// --- BOTÓN NUEVA PARTIDA ---
document.getElementById("new-game").addEventListener("click", nuevaPartida);

// --- INICIO ---
spawn();
spawn();
render();
