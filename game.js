// ============================================================
//  2048 — game.js (capa UI)
//  Entradas, render, overlays, power-ups y persistencia.
//  La lógica pura del juego vive en game-core.js.
// ============================================================

import {
  TAMANO,
  USOS_DESHACER_INICIALES,
  BOMBAS_INICIALES,
  crearTablero,
  agregarFicha,
  aplicarMovimiento,
  aplicarDeshacer,
  esGameOver,
  hayVictoria,
} from "./game-core.js";

// --- REFERENCIAS AL DOM ---
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
const welcomeEl = document.getElementById("welcome");

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
let board = crearTablero();
let score = 0;
let best = leerRecord();
let victoriaAvisada = false;
let ultimaFichaNueva = null;

// Power-ups
let historial = [];
let deshacerRestantes = USOS_DESHACER_INICIALES;
let modoBomba = false;
let bombasRestantes = BOMBAS_INICIALES;

// --- MODALES ---
// Un modal (bienvenida o fin de partida) impide jugar. Este es el ÚNICO sitio
// que lo decide: mover() y toggleBomba() lo consultan, así que teclado, swipe
// y power-ups quedan bloqueados de forma coherente sin repetir la lógica.
function hayModalAbierto() {
  return !welcomeEl.hidden || !overlayEl.hidden;
}

// --- RENDER ---
// Solo representa el estado en el DOM: sin persistencia ni otros efectos.
function render() {
  boardEl.innerHTML = "";
  for (let fila = 0; fila < TAMANO; fila++) {
    for (let col = 0; col < TAMANO; col++) {
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
  const resultado = agregarFicha(board);
  board = resultado.matriz;
  if (resultado.posicion) ultimaFichaNueva = resultado.posicion;
}

// --- MOVIMIENTO COMPLETO ---
export function mover(direccion) {
  if (hayModalAbierto()) return;
  if (modoBomba) return;

  const scorePrevio = score;
  const resultado = aplicarMovimiento(board, direccion);
  board = resultado.matriz;

  if (resultado.cambio) {
    historial.push({ board: resultado.previo, score: scorePrevio });
    score += resultado.puntos;
    actualizarRecord();
    spawn();
  } else {
    ultimaFichaNueva = null;
  }

  render();
  actualizarBotonDeshacer();

  if (!victoriaAvisada && hayVictoria(board)) {
    victoriaAvisada = true;
    mostrarVictoria();
  } else if (esGameOver(board)) {
    mostrarGameOver();
  }
}

// --- MARCADOR ---
function actualizarMarcador() {
  scoreEl.textContent = score;
  bestEl.textContent = best;
}

// El récord se guarda EXPLÍCITAMENTE donde cambia la puntuación, no al renderizar.
function actualizarRecord() {
  if (score > best) {
    best = score;
    guardarRecord(best);
  }
}

// --- POWER-UP: DESHACER (pila de estados) ---
// Decisión de diseño: deshacer funciona también con el overlay de fin abierto.
// Restaurar la partida cierra el overlay (revalidando el estado), de modo que el
// usuario puede recuperarse de un game over en lugar de quedar bloqueado.
export function deshacer() {
  const resultado = aplicarDeshacer({
    board,
    score,
    historial,
    usos: deshacerRestantes,
  });
  if (!resultado.restaurado) return;

  board = resultado.board;
  score = resultado.score;
  historial = resultado.historial;
  deshacerRestantes = resultado.usos;
  ultimaFichaNueva = null;

  if (esGameOver(board)) mostrarGameOver();
  else ocultarOverlay();

  render();
  actualizarBotonDeshacer();
}

function actualizarBotonDeshacer() {
  undoCount.textContent = deshacerRestantes;
  undoBtn.disabled = deshacerRestantes <= 0 || historial.length === 0;
}

// --- POWER-UP: BOMBA ---
// Decisión de diseño: la bomba NO forma parte del historial de deshacer
// (es un recurso consumible que ya no recupera el deshacer). No cambiar sin
// decidirlo como cambio de producto.
export function toggleBomba() {
  if (bombasRestantes <= 0) return;
  if (hayModalAbierto()) return; // con un modal abierto las celdas no son clicables
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
  const fila = Math.floor(indice / TAMANO);
  const col = indice % TAMANO;
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
let focoAnterior = null;

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
  focoAnterior = document.activeElement;
  overlayEl.hidden = false;
  // El foco entra en el diálogo para que teclado y lectores de pantalla lo anuncien.
  const primero = overlayActionsEl.querySelector("button");
  if (primero) primero.focus();
}

function ocultarOverlay() {
  if (overlayEl.hidden) return; // nada que cerrar: no mover el foco
  overlayEl.hidden = true;
  restaurarFoco();
}

function restaurarFoco() {
  const destino = focoAnterior && document.contains(focoAnterior) ? focoAnterior : boardEl;
  focoAnterior = null;
  destino.focus();
}

export function mostrarVictoria() {
  mostrarOverlay(
    "¡2048!",
    "Has llegado. Puedes seguir para superar tu récord.",
    [
      { label: "Seguir jugando", ghost: true, onClick: ocultarOverlay },
      { label: "Nueva partida", onClick: nuevaPartida },
    ]
  );
}

export function mostrarGameOver() {
  mostrarOverlay(
    "Sin movimientos",
    "El tablero está bloqueado. Puntuación: " + score + ".",
    [{ label: "Nueva partida", onClick: nuevaPartida }]
  );
}

// --- NUEVA PARTIDA ---
// Única fuente de verdad para iniciar una partida: la usa el botón, el overlay
// y la inicialización al cargar la página.
export function nuevaPartida() {
  board = crearTablero();
  score = 0;
  victoriaAvisada = false;
  ultimaFichaNueva = null;
  historial = [];
  deshacerRestantes = USOS_DESHACER_INICIALES;
  modoBomba = false;
  bombasRestantes = BOMBAS_INICIALES;
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
  } catch { return {}; }
}
function guardarStats(stats) {
  try { localStorage.setItem("stats2048", JSON.stringify(stats)); } catch { /* sin almacenamiento disponible */ }
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

// Bloquea el scroll del navegador durante cualquier arrastre táctil.
// passive:false es OBLIGATORIO aquí; sin él, preventDefault se ignora.
document.addEventListener("touchmove", (evento) => {
  evento.preventDefault();
}, { passive: false });

// --- BOTONES ---
document.getElementById("new-game").addEventListener("click", nuevaPartida);
undoBtn.addEventListener("click", deshacer);
bombBtn.addEventListener("click", toggleBomba);

// --- INICIO ---
nuevaPartida();

// --- BIENVENIDA (en cada carga de la página, no al reiniciar) ---
const DURACION_ANIMACION_BIENVENIDA = 220;

function cerrarBienvenida() {
  welcomeEl.classList.add("cerrando");
  // Oculta tras la duración de la animación, se dispare o no el evento.
  // Así el botón SIEMPRE cierra, aunque la animación falte o falle.
  setTimeout(() => {
    welcomeEl.hidden = true;
    welcomeEl.classList.remove("cerrando");
    boardEl.focus();
  }, DURACION_ANIMACION_BIENVENIDA);
}

document.getElementById("welcome-close").addEventListener("click", cerrarBienvenida);

welcomeEl.hidden = false; // se muestra al arrancar el script (cada carga)
document.getElementById("welcome-close").focus(); // el foco entra en el diálogo

// Nota: mover/deshacer/toggleBomba/nuevaPartida/mostrarVictoria/mostrarGameOver
// se exportan como API del módulo para que los tests de flujo conduzcan la UI.
