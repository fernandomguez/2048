// ============================================================
//  2048 — game.js
//  Estado + movimiento/fusión + fin de partida + récord + power-ups
// ============================================================

// --- TEMA CLARO / OSCURO ---
const themeIcon = document.getElementById("theme-icon");

// Aplica un tema ("light" | "dark") al <html> y actualiza el icono.
function aplicarTema(tema) {
  document.documentElement.setAttribute("data-theme", tema);
  themeIcon.textContent = tema === "dark" ? "☀️" : "🌙";
}

// Al arrancar: si el usuario eligió tema, úsalo; si no, sigue al sistema.
function iniciarTema() {
  const guardado = leerStats().tema;
  if (guardado) {
    aplicarTema(guardado);
  } else {
    const sistemaOscuro = window.matchMedia("(prefers-color-scheme: dark)").matches;
    aplicarTema(sistemaOscuro ? "dark" : "light");
  }
}

document.getElementById("theme-toggle").addEventListener("click", () => {
  const actual = document.documentElement.getAttribute("data-theme");
  const nuevo = actual === "dark" ? "light" : "dark";
  aplicarTema(nuevo);
  const stats = leerStats();
  stats.tema = nuevo;          // recuerda la elección
  guardarStats(stats);
});

iniciarTema(); // llámalo lo antes posible

// --- ESTADO ---
let board = [
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
  [0, 0, 0, 0],
];

let score = 0;
let best = leerRecord();
let victoriaAvisada = false;
let ultimaFichaNueva = null;

// Power-ups
let historial = [];
let deshacerRestantes = 3;
let modoBomba = false;
let bombasRestantes = 1;

// Referencias al DOM
const boardEl   = document.getElementById("board");
const scoreEl   = document.getElementById("score");
const bestEl    = document.getElementById("best");
const overlayEl = document.getElementById("overlay");
const overlayTitleEl   = document.getElementById("overlay-title");
const overlayTextEl    = document.getElementById("overlay-text");
const overlayActionsEl = document.getElementById("overlay-actions");
const undoBtn   = document.getElementById("undo");
const bombBtn   = document.getElementById("bomb");
const undoCount = document.getElementById("undo-count");
const bombCount = document.getElementById("bomb-count");

// --- RENDER ---
function render() {
  boardEl.innerHTML = "";
  for (let fila = 0; fila < 4; fila++) {
    for (let col = 0; col < 4; col++) {
      const valor = board[fila][col];
      const cell = document.createElement("div");
      cell.className = "cell";
      if (valor !== 0) {
        cell.textContent = valor;
        cell.dataset.value = valor;
        cell.classList.add("len" + String(valor).length);
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
  if (!overlayEl.hidden) return;
  if (modoBomba) return;

  const previo = copiar(board);
  const scorePrevio = score;

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
    historial.push({ board: previo, score: scorePrevio });
    spawn();
  } else {
    ultimaFichaNueva = null;
  }

  render();
  actualizarBotonDeshacer();

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
      if (col < 3 && valor === board[fila][col + 1]) return true;
      if (fila < 3 && valor === board[fila + 1][col]) return true;
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

// --- PERSISTENCIA DEL RÉCORD (objeto, preparado para una futura API) ---
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

// --- POWER-UP: DESHACER (pila de estados) ---
function deshacer() {
  if (historial.length === 0 || deshacerRestantes <= 0) return;
  const anterior = historial.pop();
  board = anterior.board;
  score = anterior.score;
  deshacerRestantes--;
  ultimaFichaNueva = null;
  render();
  actualizarBotonDeshacer();
}

function actualizarBotonDeshacer() {
  undoCount.textContent = deshacerRestantes;
  undoBtn.disabled = deshacerRestantes <= 0 || historial.length === 0;
}

// --- POWER-UP: BOMBA ---
function toggleBomba() {
  if (bombasRestantes <= 0) return;
  modoBomba = !modoBomba;
  boardEl.classList.toggle("modo-bomba", modoBomba);
  actualizarBotonBomba();
}

function actualizarBotonBomba() {
  bombCount.textContent = bombasRestantes;
  bombBtn.classList.toggle("armed", modoBomba);
  bombBtn.disabled = bombasRestantes <= 0;
}

boardEl.addEventListener("click", (evento) => {
  if (!modoBomba) return;
  const celdas = [...boardEl.children];
  const celda = evento.target.closest(".cell");
  const indice = celdas.indexOf(celda);
  if (indice === -1) return;
  const fila = Math.floor(indice / 4);
  const col = indice % 4;
  if (board[fila][col] === 0) { // celda vacía: cancela el modo sin gastar bomba
    modoBomba = false;
    boardEl.classList.remove("modo-bomba");
    actualizarBotonBomba();
    return;
  }
  board[fila][col] = 0;
  bombasRestantes--;
  modoBomba = false;
  boardEl.classList.remove("modo-bomba");
  ultimaFichaNueva = null;
  render();
  actualizarBotonBomba();
});

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
  historial = [];
  deshacerRestantes = 3;
  modoBomba = false;
  bombasRestantes = 1;
  boardEl.classList.remove("modo-bomba");
  ocultarOverlay();
  spawn();
  spawn();
  render();
  actualizarBotonDeshacer();
  actualizarBotonBomba();
}

//Para el tema claro / oscuro
function leerStats() {
  try {
    const crudo = localStorage.getItem("stats2048");
    return crudo ? JSON.parse(crudo) : {};
  } catch (e) { return {}; }
}
function guardarStats(stats) {
  try { localStorage.setItem("stats2048", JSON.stringify(stats)); } catch (e) {}
}
function leerRecord() { return leerStats().record || 0; }
function guardarRecord(valor) {
  const stats = leerStats();
  stats.record = valor;
  guardarStats(stats);
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

document.addEventListener("touchstart", (evento) => {
  inicioX = evento.touches[0].clientX;
  inicioY = evento.touches[0].clientY;
}, { passive: true });


document.addEventListener("touchend", (evento) => {
  const deltaX = evento.changedTouches[0].clientX - inicioX;
  const deltaY = evento.changedTouches[0].clientY - inicioY;
  const UMBRAL = 30;
  if (Math.abs(deltaX) < UMBRAL && Math.abs(deltaY) < UMBRAL) return;
  if (Math.abs(deltaX) > Math.abs(deltaY)) {
    mover(deltaX > 0 ? "right" : "left");
  } else {
    mover(deltaY > 0 ? "down" : "up");
  }
}, { passive: true });

// --- BOTONES ---
document.getElementById("new-game").addEventListener("click", nuevaPartida);
undoBtn.addEventListener("click", deshacer);
bombBtn.addEventListener("click", toggleBomba);

// --- INICIO ---
spawn();
spawn();
render();
actualizarBotonDeshacer();
actualizarBotonBomba();

// --- BIENVENIDA (en cada carga de la página, no al reiniciar) ---
const welcomeEl = document.getElementById("welcome");

function cerrarBienvenida() {
  welcomeEl.classList.add("cerrando");
  // Oculta tras la duración de la animación, se dispare o no el evento.
  // Así el botón SIEMPRE cierra, aunque la animación falte o falle.
  setTimeout(() => {
    welcomeEl.hidden = true;
    welcomeEl.classList.remove("cerrando");
  }, 220);
}

document.getElementById("welcome-close").addEventListener("click", cerrarBienvenida);

welcomeEl.hidden = false; // se muestra al arrancar el script (cada carga)
