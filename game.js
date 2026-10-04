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
  esPartidaValida,
} from "./game-core.js";
import {
  configurarFx,
  animarMovimiento,
  pintarFlotantes,
  limpiarFx,
  sonarMovimiento,
  avisarFusion,
  sonarFinPartida,
  establecerFeedbackActivo,
} from "./game-fx.js";

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

// --- CAPA DE EFECTOS VISUALES (game-fx.js) ---
// El id se lee aquí con literal (markup.test.js lo valida contra index.html y
// tests/setup.js lo declara) y se pasa al módulo por parámetro: game-fx.js no
// consulta ids nuevos por su cuenta (riesgo 12).
configurarFx({ capa: document.getElementById("fx-layer") });

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

// --- INTERRUPTOR DE FEEDBACK (sonido + háptica) ---
// ON por defecto: al arrancar SOLO se lee stats2048.fxActivo (cero
// escrituras → persistencia.test.js sigue viendo stats2048 a null) y el
// estado se sincroniza con aria-checked. La escritura ocurre EXCLUSIVAMENTE
// al pulsar, con el mismo patrón leerStats → mutar → guardarStats que el
// tema: así se preserva "record".
const fxToggleEl = document.getElementById("fx-toggle");

function iniciarFeedback() {
  const activo = leerStats().fxActivo !== false; // ausente = ON
  fxToggleEl.setAttribute("aria-checked", String(activo));
  establecerFeedbackActivo(activo);
}

fxToggleEl.addEventListener("click", () => {
  const activo = fxToggleEl.getAttribute("aria-checked") !== "true";
  fxToggleEl.setAttribute("aria-checked", String(activo));
  establecerFeedbackActivo(activo);
  const stats = leerStats();
  stats.fxActivo = activo; // recuerda la elección sin tocar record
  guardarStats(stats);
});

iniciarFeedback();

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
// Reconciliador con IDENTIDAD DE NODOS: la rejilla de 16 .cell (cada una con
// su .tile persistente) se crea UNA sola vez con asegurarRejilla(); a partir
// de ahí render() solo actualiza texto, atributos y clases. Los mismos nodos
// viven de un turno a otro (posibilita animarlos con transform) y
// #board.children sigue siendo exactamente 16 .cell (bomba y textosCeldas).

// Nodos persistentes en orden row-major, creados en el primer render.
let celdas = null; // las 16 .cell
let fichas = null; // sus .tile internos, en el mismo orden

function asegurarRejilla() {
  if (celdas) return; // ya montada: render() nunca reconstruye
  celdas = [];
  fichas = [];
  for (let i = 0; i < TAMANO * TAMANO; i++) {
    const celda = document.createElement("div");
    celda.className = "cell";
    const ficha = document.createElement("div");
    ficha.className = "tile";
    celda.appendChild(ficha); // el número visible vive dentro de su slot
    boardEl.appendChild(celda);
    celdas.push(celda);
    fichas.push(ficha);
  }
}

// Retira de la celda cualquier clase lenN anterior (los dígitos cambian).
function limpiarClaseLen(celda) {
  for (const clase of [...celda.classList]) {
    if (clase.startsWith("len")) celda.classList.remove(clase);
  }
}

function render() {
  asegurarRejilla();
  for (let fila = 0; fila < TAMANO; fila++) {
    for (let col = 0; col < TAMANO; col++) {
      const indice = fila * TAMANO + col;
      const celda = celdas[indice];
      const ficha = fichas[indice];
      const valor = board[fila][col];

      if (valor === 0) {
        // Celda vacía: todo limpio (texto, rampa y clases).
        ficha.textContent = "";
        celda.removeAttribute("data-value");
        limpiarClaseLen(celda);
        celda.classList.remove("nueva");
        continue;
      }

      ficha.textContent = valor;
      celda.dataset.value = valor;  // la rampa data-value sigue EN .cell
      limpiarClaseLen(celda);
      celda.classList.add("len" + String(valor).length);

      // Al reutilizar nodos, .nueva debe re-fire: quitar la clase, forzar un
      // reflow para que el navegador la olvide y volver a añadirla.
      celda.classList.remove("nueva");
      if (ultimaFichaNueva && ultimaFichaNueva[0] === fila && ultimaFichaNueva[1] === col) {
        void celda.offsetWidth;
        celda.classList.add("nueva");
      }
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

  // Interrumpe la capa visual del turno anterior: estado y DOM siguen
  // resolviéndose síncronos en este tick (sin lock de entrada).
  limpiarFx();

  const scorePrevio = score;
  const resultado = aplicarMovimiento(board, direccion);
  board = resultado.matriz;

  if (resultado.cambio) {
    historial.push({ board: resultado.previo, score: scorePrevio });
    score += resultado.puntos;
    actualizarRecord();
    spawn();
    guardarPartida(); // el turno cambió la partida en curso: se persiste
  } else {
    ultimaFichaNueva = null;
  }

  render();
  actualizarBotonDeshacer();

  // Los efectos van DESPUÉS de aplicar estado + DOM: capa posterior.
  // El feedback sonoro/háptico NO depende de prefers-reduced-motion (solo
  // gobierna las transformaciones visuales, decisión 8).
  if (resultado.cambio) {
    sonarMovimiento();
    for (const fusion of resultado.traza.fusiones) avisarFusion(fusion.valor);
    animarMovimiento({ traza: resultado.traza, previo: resultado.previo });
    pintarFlotantes(resultado.traza.fusiones); // +N sobre cada celda fusionada
  }

  if (!victoriaAvisada && hayVictoria(board)) {
    victoriaAvisada = true;        // estado síncrono…
    // …capa visual diferida, revalidando la victoria al dispararse.
    programarOverlay(mostrarVictoria, () => victoriaAvisada && hayVictoria(board));
  } else if (esGameOver(board)) {
    // board ya aplicado: estado síncrono (revalidado al dispararse).
    programarOverlay(mostrarGameOver, () => esGameOver(board));
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
  limpiarFx(); // interrumpe la capa visual antes de restaurar el estado

  const resultado = aplicarDeshacer({
    board,
    score,
    historial,
    usos: deshacerRestantes,
  });
  if (!resultado.restaurado) return; // sin usos ni historial: nada cambia

  // Solo si algo se restauró tiene sentido cancelar el aviso pendiente:
  // el orden (guard → cancelación) deja claro que sin restauración no hay
  // efectos secundarios (el botón estaba deshabilitado en las mismas
  // condiciones, pero el export lo prueban los tests directamente).
  cancelarOverlayPendiente(); // recuperarse del fin de partida cancela el aviso

  board = resultado.board;
  score = resultado.score;
  historial = resultado.historial;
  deshacerRestantes = resultado.usos;
  ultimaFichaNueva = null;
  guardarPartida(); // restauró → la partida en curso también cambia

  // Si el tablero restaurado está bloqueado se muestra el fin de partida,
  // que es quien BORRA la clave (no tiene sentido guardar una partida acabada).
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
  // Ventana de fin de partida (decisión 11 enmendada): mientras el overlay
  // diferido siga pendiente el estado YA dice fin de partida aunque el
  // diálogo aún no se haya mostrado, así que la bomba tampoco se arma aquí
  // (misma filosofía que hayModalAbierto(), que dentro de esa ventana sería
  // false). Sin esto la bomba operaría sobre un tablero que va a cerrarse.
  if (timerOverlayFin !== null) return;
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
  limpiarFx(); // la bomba muta el tablero: corta cualquier animación en vuelo
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
  guardarPartida(); // la bomba gasta un recurso: también cambia la partida
});

// --- OVERLAY (fin / victoria) ---
// El overlay de fin NO debe tapar el slide/pop del último movimiento: en
// mover() el estado (victoriaAvisada, esGameOver) se aplica SÍNCRONO, pero
// mostrar el diálogo se difiere con setTimeout de ms fijos (mismo patrón y
// orden de magnitud que la bienvenida). Nunca transitionend/animationend:
// no disparan en jsdom y convertirían los tests en espera eterna (decisión 11).
// Enmienda de la decisión 11 (fase 05-fix): la ventana de 260 ms se cierra
// por DOS lados — (a) toggleBomba() no opera mientras haya un overlay
// pendiente y (b) el callback revalida su condición antes de mostrar.
const DURACION_ANIMACION_FIN = 260;
let timerOverlayFin = null;

function programarOverlay(mostrar, condicion) {
  cancelarOverlayPendiente(); // la decisión de fin más reciente manda
  timerOverlayFin = setTimeout(() => {
    timerOverlayFin = null;
    // Revalidación DENTRO de la ventana de 260 ms (decisión 11 enmendada):
    // el estado pudo cambiar mientras el diálogo seguía oculto (p. ej. la
    // bomba actuando en esa ventana). Si la condición ya no se cumple, no se
    // muestra nada: nunca un diálogo de fin sobre un tablero jugable.
    if (condicion && !condicion()) return;
    mostrar();
  }, DURACION_ANIMACION_FIN);
}

// Cancela un overlay pendiente. Lo usan nuevaPartida(), deshacer() y
// restaurarPartida(): restaurar una partida no debe dejar colgado un aviso
// de fin de la partida anterior.
function cancelarOverlayPendiente() {
  if (timerOverlayFin === null) return;
  clearTimeout(timerOverlayFin);
  timerOverlayFin = null;
}

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
  sonarFinPartida(true); // secuencia ascendente
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
  sonarFinPartida(false); // secuencia descendente
  borrarPartida(); // fin de partida: la clave partida2048 deja de existir
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
  limpiarFx(); // la capa visual se vacía en cada reinicio
  cancelarOverlayPendiente(); // ningún overlay de la partida anterior se cuela
  borrarPartida(); // la partida anterior deja de estar "en curso"
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

// --- PARTIDA EN CURSO (clave "partida2048", SEPARADA de stats2048) ---
// Esquema v1 (decisión 6): { v, board, score, deshacerRestantes,
// bombasRestantes, victoriaAvisada, historial }. Sin record/tema (viven en
// stats2048), sin modoBomba (se restaura en false) ni ultimaFichaNueva (solo
// era animación → null). El historial SIEMPRE viaja: sin él el deshacer
// moriría al recargar.
// Se guarda en pagehide y en visibilitychange con document.hidden; NUNCA en
// beforeunload/unload (sin bloqueadores ni diálogos de salida).
const CLAVE_PARTIDA = "partida2048";

function guardarPartida() {
  try {
    const partida = {
      v: 1,
      board,
      score,
      deshacerRestantes,
      bombasRestantes,
      victoriaAvisada,
      historial,
    };
    localStorage.setItem(CLAVE_PARTIDA, JSON.stringify(partida));
  } catch { /* sin almacenamiento disponible */ }
}

function borrarPartida() {
  try { localStorage.removeItem(CLAVE_PARTIDA); } catch { /* sin almacenamiento */ }
}

// Restaura la partida guardada (automática y SIN diálogo: un tercer
// [role="dialog"] rompería markup.test.js). Devuelve false si no hay clave,
// si está corrupta o si la forma no valida: en ese caso se BORRA la clave y
// el llamador inicia una partida nueva (riesgo 5: pantalla muerta al
// arrancar). Tampoco se restaura un tablero ya bloqueado (esGameOver).
export function restaurarPartida() {
  let crudo;
  try { crudo = localStorage.getItem(CLAVE_PARTIDA); } catch { return false; }
  if (!crudo) return false;

  let partida;
  try { partida = JSON.parse(crudo); } catch { partida = null; } // corrupta → null

  // La validación vive en game-core.js: pura, testeable en nodo y que nunca
  // lanza. Cortocircuito: si la forma falla no se llega a mirar el tablero.
  if (!esPartidaValida(partida) || esGameOver(partida.board)) {
    borrarPartida();
    return false;
  }

  limpiarFx();                // corta cualquier animación en vuelo
  cancelarOverlayPendiente(); // y cualquier overlay de fin pospuesto

  board = partida.board;
  score = partida.score;
  deshacerRestantes = partida.deshacerRestantes;
  bombasRestantes = partida.bombasRestantes;
  victoriaAvisada = partida.victoriaAvisada;
  historial = partida.historial;
  ultimaFichaNueva = null; // solo era animación: no hay ficha nueva al volver
  modoBomba = false;        // el modo bomba no se persiste (se reactiva a mano)
  boardEl.classList.remove("modo-bomba");

  render();
  actualizarBotonDeshacer();
  actualizarBotonBomba();
  return true;
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

// --- GUARDADO AL OCULTAR LA PESTAÑA / CERRARLA ---
// pagehide cubre el cierre y la navegación; visibilitychange cubre el cambio
// a otra pestaña o app en móvil. NUNCA beforeunload/unload: no se bloquea ni
// se pregunta al salir (decisión 6).
window.addEventListener("pagehide", guardarPartida);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) guardarPartida(); // solo cuando la pestaña se oculta
});

// --- INICIO ---
// Restaura la partida en curso si existe; si no hay (o no es válida),
// empieza una nueva. Restauración automática, sin diálogo de confirmación.
if (!restaurarPartida()) nuevaPartida();

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
