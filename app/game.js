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
  semillaDeFecha,
  siguienteRng,
  HITOS_POWERUPS,
  calcularHitos,
  hitosAlcanzados,
  parsearCodigoJugada,
  reproducirSecuencia,
  DIRECCIONES_REPLAY,
  CARACTERES_REPLAY,
} from "../js/game-core.js";
import {
  configurarFx,
  animarMovimiento,
  pintarFlotantes,
  pintarExplosion,
  limpiarFx,
  sonarMovimiento,
  avisarFusion,
  sonarFinPartida,
  establecerFeedbackActivo,
} from "./game-fx.js";
// Composición de la captura compartible (datos → canvas). Módulo SIN DOM en
// top-level, así que importarlo aquí no añade estado ni efectos secundarios.
import { dibujarCaptura, MEDIDAS_CAPTURA } from "../js/game-share.js";

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
const dailyBtn   = document.getElementById("daily");
const replayBtn      = document.getElementById("replay");
const replayPanelEl  = document.getElementById("replay-panel");
const replayInputEl  = document.getElementById("replay-input");
const replayStartBtn = document.getElementById("replay-start");
const replayCancelBtn = document.getElementById("replay-cancel");
const replayStopBtn  = document.getElementById("replay-stop");
const shareBtn   = document.getElementById("share");
const installBtn = document.getElementById("install");
const statusEl   = document.getElementById("status");

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

  // theme-color dinámico (barra/ARIA del navegador = --bg del tema). Se
  // consulta con querySelector (no con getElementById: el meta no tiene id
  // y así markup.test.js no amplía su escaneo) y con guard null: en jsdom
  // solo se monta el <body>, el <head> no existe y meta sería null.
  const metaTema = document.querySelector('meta[name="theme-color"]');
  if (metaTema) metaTema.content = tema === "dark" ? "#131722" : "#f1f2f6";
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

// --- MODO DE PARTIDA (sub-bloque 2a) ---
// "normal" o "reto" (reto diario con semilla fija, D5). En modo reto la
// aleatoriedad sale de un RNG con estado EXPLÍCITO (siguienteRng) que viaja
// en partida2048, no en el historial: el deshacer no rebobina el RNG (D7).
let modo = "normal";
let diaReto = null;   // "YYYY-MM-DD" local, solo en modo reto
let rngEstado = 0;    // estado del RNG del reto (entero serializable)
let hitos = [];       // umbrales de power-ups ya concedidos (D6)
let movimientos = ""; // secuencia LRUD del reto en curso (sub-bloque 2d)

// --- REPLAY DEL RETO (sub-bloque 2d) ---
// `reproduciendo` silencia récord, guardado y overlays de fin mientras el
// juego se auto-juega una secuencia compartida; el intento del jugador se
// preserva en `snapshotReplay` (R2) y la clave partida2048 no se toca.
let reproduciendo = false;
let snapshotReplay = null;
let timerReplay = null;

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
// Fecha local "YYYY-MM-DD" (D5a): la capa UI es quien conoce Date, el núcleo
// solo recibe la cadena ya formada.
function hoy() {
  const fecha = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return fecha.getFullYear() + "-" + pad(fecha.getMonth() + 1) + "-" + pad(fecha.getDate());
}

// Siguiente número del RNG del reto: el estado avanza y queda en la variable
// de módulo, listo para persistirse con la partida.
function rndReto() {
  const paso = siguienteRng(rngEstado);
  rngEstado = paso.estado;
  return paso.valor;
}

function spawn() {
  // En modo reto NO se toca Math.random: este ternario es su ÚNICA
  // referencia en game.js (determinismo total dados el estado y los movimientos).
  const resultado = agregarFicha(board, modo === "reto" ? rndReto : Math.random);
  board = resultado.matriz;
  if (resultado.posicion) ultimaFichaNueva = resultado.posicion;
}

// --- HITOS DE POWER-UPS (D6) ---
// Se evalúa tras spawn() y ANTES de guardarPartida(): el propio guardado ya
// persiste `hitos`, así que no hay doble concesión al recargar (R2). Los
// usos iniciales (3/1) no cambian: el hito es un EXTRA sobre ellos.
function aplicarHitos() {
  const res = calcularHitos(board, hitos);
  if (res.ganados.deshacer === 0 && res.ganados.bomba === 0) return;

  const nuevos = res.concedidos.filter(umbral => !hitos.includes(umbral));
  hitos = res.concedidos;

  if (res.ganados.deshacer > 0) {
    const umbral = nuevos.filter(u => HITOS_POWERUPS.deshacer.includes(u)).pop();
    deshacerRestantes += res.ganados.deshacer;
    mostrarToast("+1 deshacer: ficha " + umbral);
    actualizarBotonDeshacer();
  }
  if (res.ganados.bomba > 0) {
    const umbral = nuevos.filter(u => HITOS_POWERUPS.bomba.includes(u)).pop();
    bombasRestantes += res.ganados.bomba;
    mostrarToast("+1 bomba: ficha " + umbral);
    actualizarBotonBomba();
  }
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
    aplicarHitos();      // hitos del nuevo tablero (D6), antes de persistir
    // Grabación del replay (2d): solo el reto real, nunca durante una
    // reproducción (la secuencia que se reproduce no es "tuya").
    if (modo === "reto" && !reproduciendo) movimientos += CARACTERES_REPLAY[direccion];
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

  // Replay (2d, R6): los overlays de fin no se muestran sobre una partida
  // que no es del usuario — el replay simplemente se detiene (terminarReplay).
  if (reproduciendo) return;

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
  if (reproduciendo) return; // un replay no marca récord (2d)
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
  // Fin de partida DEFINITIVO (decisión 2026-10-11): con el tablero bloqueado
  // no hay rescate — ni durante los 260 ms del overlay ni con Tab. El jugador
  // es responsable de sus recursos; usarlos antes de morir o perderlos.
  if (esGameOver(board)) return;
  if (reproduciendo) return; // el replay controla el tablero (2d)

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
  // Replay (2d, I2): el deshacer revierte un movimiento, así que la secuencia
  // grabada pierde su último carácter (1:1 con historial).
  if (modo === "reto" && movimientos.length > 0) movimientos = movimientos.slice(0, -1);
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
  // Con el tablero bloqueado el botón queda apagado: el fin es definitivo.
  undoBtn.disabled = deshacerRestantes <= 0 || historial.length === 0 || esGameOver(board);
}

// --- POWER-UP: BOMBA ---
// Decisión de diseño: la bomba NO forma parte del historial de deshacer
// (es un recurso consumible que ya no recupera el deshacer). No cambiar sin
// decidirlo como cambio de producto.
export function toggleBomba() {
  if (bombasRestantes <= 0) return;
  if (hayModalAbierto()) return; // con un modal abierto las celdas no son clicables
  if (reproduciendo) return;     // el replay controla el tablero (2d)
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
  const valorEliminado = board[fila][col];
  board[fila][col] = 0;
  bombasRestantes--;
  // Replay (2d, I1): la bomba muta el tablero sin RNG ni movimiento, así que
  // el intento deja de ser reproducible y se limpia la secuencia.
  if (modo === "reto") movimientos = "";
  modoBomba = false;
  boardEl.classList.remove("modo-bomba");
  ultimaFichaNueva = null;
  render();
  pintarExplosion([fila, col], valorEliminado); // animación de la bomba
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
      // 2ª entrada de compartir (P2): SIEMPRE la última, nunca la primera
      // (mostrarOverlay enfoca el primer botón y los tests asocian ese foco
      // con la acción principal). El overlay no se cierra ni se mueve el foco.
      { label: "Compartir", ghost: true, onClick: () => compartir() },
    ]
  );
}

export function mostrarGameOver() {
  sonarFinPartida(false); // secuencia descendente
  borrarPartida(); // fin de partida: la clave partida2048 deja de existir
  mostrarOverlay(
    "Sin movimientos",
    "El tablero está bloqueado. Puntuación: " + score + ".",
    [
      { label: "Nueva partida", onClick: nuevaPartida },
      // 2ª entrada de compartir: última para conservar "Nueva partida"
      // como primer botón enfocado (invariante de flujo.test.js).
      { label: "Compartir", ghost: true, onClick: () => compartir() },
    ]
  );
}

// --- CONFIRMAR SALIDA DE LA PARTIDA ---
// Los botones que sustituyen el tablero (Nueva partida, Reto diario) piden
// confirmación si hay una partida con progreso. Reutiliza el overlay de fin
// (#overlay): NUNCA un tercer role="dialog". Mientras está abierto,
// hayModalAbierto() bloquea teclado, swipe y power-ups como en cualquier modal.
// Durante un replay el intento del jugador vive en `snapshotReplay`, así que el
// progreso se mide ahí. Una partida bloqueada o sin jugadas no pregunta.
function partidaEnCurso() {
  const intento = reproduciendo && snapshotReplay ? snapshotReplay : null;
  const tablero = intento ? intento.board : board;
  const puntos = intento ? intento.score : score;
  const jugadas = intento ? intento.historial.length : historial.length;
  const bombas = intento ? intento.bombasRestantes : bombasRestantes;
  if (esGameOver(tablero)) return false;
  return puntos > 0 || jugadas > 0 || bombas < BOMBAS_INICIALES;
}

function confirmarSalida(etiquetaAccion, accion) {
  if (!partidaEnCurso()) {
    accion();
    return;
  }
  const puntos = reproduciendo && snapshotReplay ? snapshotReplay.score : score;
  mostrarOverlay(
    "¿Salir de la partida?",
    "Perderás la partida en curso (" + puntos + " puntos).",
    [
      // El primer botón recibe el foco: el seguro es "Seguir jugando".
      { label: "Seguir jugando", ghost: true, onClick: ocultarOverlay },
      { label: etiquetaAccion, onClick: () => accion() },
    ]
  );
}

// --- NUEVA PARTIDA ---
// Única fuente de verdad para iniciar una partida: la usan el botón, el
// overlay, el reto diario y la inicialización al cargar la página.
// El modo entra como PARÁMETRO EXPLÍCITO en empezarPartida(); nuevaPartida()
// se mantiene SIN parámetros (riesgo 1) porque sus llamantes son listeners de
// click (#new-game y los botones de los overlays) que le ENTREGAN el Event como
// primer argumento: con firma "nuevaPartida(modo)" se arrancaría la partida en
// modo "Event" cada vez que se pulsara un botón.
function empezarPartida(nuevoModo) {
  // Un replay en curso muere con la partida que lo sustituye (2d).
  if (timerReplay !== null) { clearTimeout(timerReplay); timerReplay = null; }
  reproduciendo = false;
  snapshotReplay = null;
  replayStopBtn.hidden = true; // el control "Parar" solo vive con un replay vivo
  limpiarFx(); // la capa visual se vacía en cada reinicio
  cancelarOverlayPendiente(); // ningún overlay de la partida anterior se cuela
  borrarPartida(); // la partida anterior deja de estar "en curso"
  modo = nuevoModo;
  diaReto = modo === "reto" ? hoy() : null;
  rngEstado = modo === "reto" ? semillaDeFecha(diaReto) : 0; // semilla del día
  hitos = [];
  movimientos = "";
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
  actualizarBotonReto();
}

export function nuevaPartida() {
  empezarPartida("normal");
}

// El botón de reto refleja el modo con aria-pressed (el estado vive en la
// variable `modo`, no en el DOM).
function actualizarBotonReto() {
  dailyBtn.setAttribute("aria-pressed", String(modo === "reto"));
}

// ============================================================
//  REPLAY DEL RETO DIARIO (sub-bloque 2d) — "Reproduce mi jugada"
//  La secuencia LRUD + la semilla de la fecha determinan la partida ENTERA
//  (R1/R5): reproducir es alimentar mover() en bucle. Mientras dura,
//  `reproduciendo` silencia récord/guardado/overlays y el intento del
//  jugador vive en `snapshotReplay` — la clave partida2048 no se toca (R2).
// ============================================================

// Exportado para que los tests usen el valor real (mismo patrón que
// DURACION_TOAST).
export const INTERVALO_REPLAY = 300;

// Lista fija de campos del intento: si alguna variable de partida crece,
// añádela aquí (el test UI compara el snapshot entero antes/después).
function snapshotPartida() {
  return {
    board: board.map((fila) => fila.slice()),
    score,
    deshacerRestantes,
    bombasRestantes,
    victoriaAvisada,
    historial: historial.map((entrada) => ({
      board: entrada.board.map((fila) => fila.slice()),
      score: entrada.score,
    })),
    modo,
    diaReto,
    rngEstado,
    hitos: hitos.slice(),
    movimientos,
  };
}

function restaurarSnapshot(s) {
  board = s.board.map((fila) => fila.slice());
  score = s.score;
  deshacerRestantes = s.deshacerRestantes;
  bombasRestantes = s.bombasRestantes;
  victoriaAvisada = s.victoriaAvisada;
  historial = s.historial.map((entrada) => ({
    board: entrada.board.map((fila) => fila.slice()),
    score: entrada.score,
  }));
  modo = s.modo;
  diaReto = s.diaReto;
  rngEstado = s.rngEstado;
  hitos = s.hitos.slice();
  movimientos = s.movimientos;
  ultimaFichaNueva = null;
}

// Monta un juego de reto LIMPIO con la semilla de la fecha del código (cualquier
// fecha sirve, R5) y arranca el bucle de reproducción.
function iniciarReplay(fecha, secuencia) {
  snapshotReplay = snapshotPartida(); // el intento del jugador queda preservado
  limpiarFx();
  cancelarOverlayPendiente();
  modoBomba = false;
  boardEl.classList.remove("modo-bomba");
  modo = "reto";
  diaReto = fecha;
  rngEstado = semillaDeFecha(fecha);
  hitos = [];
  movimientos = "";
  board = crearTablero();
  spawn(); // las 2 fichas iniciales del día, igual que reproducirSecuencia
  spawn();
  score = 0;
  victoriaAvisada = false;
  historial = [];
  deshacerRestantes = USOS_DESHACER_INICIALES;
  bombasRestantes = BOMBAS_INICIALES;
  reproduciendo = true;
  render();
  actualizarBotonDeshacer();
  actualizarBotonBomba();
  actualizarBotonReto();
  replayStopBtn.hidden = false;
  reproducir(secuencia);
}

// Bucle encadenado de setTimeout (nunca transitionend: patrón del repo).
function reproducir(secuencia) {
  let indice = 0;
  const paso = () => {
    if (indice >= secuencia.length) {
      terminarReplay("Reproducción terminada");
      return;
    }
    mover(DIRECCIONES_REPLAY[secuencia[indice]]);
    indice++;
    timerReplay = setTimeout(paso, INTERVALO_REPLAY);
  };
  timerReplay = setTimeout(paso, INTERVALO_REPLAY);
}

// Devuelve el tablero del jugador exactamente como estaba (R2).
function terminarReplay(mensaje) {
  if (timerReplay !== null) {
    clearTimeout(timerReplay);
    timerReplay = null;
  }
  reproduciendo = false;
  if (snapshotReplay) {
    restaurarSnapshot(snapshotReplay);
    snapshotReplay = null;
  }
  limpiarFx();
  render();
  actualizarBotonDeshacer();
  actualizarBotonBomba();
  actualizarBotonReto();
  replayStopBtn.hidden = true;
  if (mensaje) mostrarToast(mensaje);
}

export function pararReplay() {
  if (!reproduciendo) return;
  terminarReplay("Reproducción parada");
}

// Valida el texto pegado (mensaje completo o código suelto) SIN tocar estado:
// un dry-run puro del núcleo decide si el código es bueno antes de arrancar.
export function reproducirJugada(texto) {
  const codigo = parsearCodigoJugada(texto);
  if (!codigo) {
    mostrarToast("Código de jugada no válido");
    return false;
  }
  try {
    reproducirSecuencia(codigo.fecha, codigo.movimientos); // dry-run
  } catch {
    mostrarToast("Código de jugada no válido");
    return false;
  }
  if (reproduciendo) pararReplay(); // un código nuevo sustituye al anterior
  mostrarToast("Reproduciendo jugada " + codigo.fecha);
  iniciarReplay(codigo.fecha, codigo.movimientos);
  return true;
}

// --- PANEL "VER JUGADA" (NO modal: el invariante son 2 role="dialog") ---
function abrirPanelReplay() {
  replayPanelEl.hidden = false;
  replayBtn.setAttribute("aria-expanded", "true");
  replayInputEl.focus();
}

function cerrarPanelReplay() {
  replayPanelEl.hidden = true;
  replayBtn.setAttribute("aria-expanded", "false");
  if (reproduciendo) pararReplay();
  replayBtn.focus(); // el foco vuelve al disparador (patrón de los overlays)
}

replayBtn.addEventListener("click", () => {
  if (replayPanelEl.hidden) abrirPanelReplay();
  else cerrarPanelReplay();
});

replayStartBtn.addEventListener("click", () => {
  reproducirJugada(replayInputEl.value);
});

replayCancelBtn.addEventListener("click", cerrarPanelReplay);

replayStopBtn.addEventListener("click", pararReplay);

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
// Sub-bloque 2a: campos OPCIONALES (v sigue siendo 1, sin migración):
// { modo, hitos } y, solo en modo reto, { dia, rngEstado }. Si no viajan,
// los valores por defecto son modo normal y el backfill de hitos (D8).
// Se guarda en pagehide y en visibilitychange con document.hidden; NUNCA en
// beforeunload/unload (sin bloqueadores ni diálogos de salida).
const CLAVE_PARTIDA = "partida2048";

function guardarPartida() {
  if (reproduciendo) return; // un replay NUNCA pisa el intento del jugador (2d)
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
    // Sub-bloque 2a: los campos NUEVOS solo viajan cuando se alejan de los
    // valores por defecto (modo normal sin hitos). Así un guardado de partida
    // normal conserva exactamente el esquema v1 byte a byte — lo exige
    // restauracion.test.js:82 — y al restaurar el backfill reconstruye `hitos`.
    if (modo === "reto") {
      partida.modo = "reto";
      partida.dia = diaReto;
      partida.rngEstado = rngEstado;
      partida.movimientos = movimientos; // secuencia LRUD del intento (2d)
    }
    if (hitos.length > 0) partida.hitos = hitos;
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

  // Modo y power-ups (sub-bloque 2a): campos OPCIONALES. Un guardado antiguo
  // no los trae → modo normal y, para `hitos`, backfill SIN conceder (D8):
  // los umbrales ya superados por el tablero quedan marcados para no volver a
  // sumar usos, pero los contadores NO suben (protege arranque.test.js).
  modo = partida.modo === "reto" ? "reto" : "normal";
  diaReto = partida.dia ?? null;
  rngEstado = partida.rngEstado ?? 0;
  hitos = partida.hitos ?? hitosAlcanzados(partida.board);
  movimientos = partida.movimientos ?? ""; // secuencia del intento (2d)
  if (modo === "reto" && diaReto === null) diaReto = hoy(); // nunca "Reto diario null"

  render();
  actualizarBotonDeshacer();
  actualizarBotonBomba();
  actualizarBotonReto();
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
    if (reproduciendo) return; // el replay controla el tablero (2d)
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
  if (reproduciendo) return; // el replay controla el tablero (2d)
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
  // La tarjeta de info necesita scroll propio en móvil (si no, el botón
  // "Entendido" queda inalcanzable).
  if (evento.target.closest && evento.target.closest(".welcome-card")) return;
  evento.preventDefault();
}, { passive: false });

// --- BOTONES ---
document.getElementById("new-game").addEventListener("click", () => {
  confirmarSalida("Nueva partida", nuevaPartida);
});
undoBtn.addEventListener("click", deshacer);
bombBtn.addEventListener("click", toggleBomba);

// Reto diario (D5c/#daily): arranca una partida determinista con la semilla
// de HOY (fecha local) e informa del día por toast. #share sigue siendo el
// último hijo de .actions (contrato de orden de tabulación).
dailyBtn.addEventListener("click", () => {
  confirmarSalida("Empezar reto", () => {
    empezarPartida("reto");
    mostrarToast("Reto diario " + diaReto);
  });
});

// ============================================================
//  COMPARTIR (P1) E INSTALACIÓN (P2)
//  Bloque opt-in y silencioso: CERO escrituras en localStorage, CERO nodos
//  añadidos a #board ni a #fx-layer y jamás un tercer diálogo (el feedback
//  es el toast #status con role="status").
// ============================================================

// Duración del toast. Se oculta SOLO con setTimeout: NUNCA con
// transitionend/animationend (no disparan en jsdom y dejarían timers vivos
// que vigilan las suites del Bloque 1).
export const DURACION_TOAST = 3000;
let timerToast = null;

function mostrarToast(texto) {
  statusEl.hidden = false;      // desocultar ANTES de escribir: el live region
  statusEl.textContent = texto; // debe estar en el árbol accesible al actualizar
  if (timerToast !== null) clearTimeout(timerToast); // un toast nuevo reinicia el reloj
  timerToast = setTimeout(() => {
    timerToast = null;
    statusEl.hidden = true;
  }, DURACION_TOAST);
}

// Snapshot del estado para la captura: construido AQUÍ (game.js es el único
// que ve board/score/best), como datos puros. Sin localStorage, sin estado
// nuevo y sin tocar los esquemas stats2048/partida2048: el tablero se copia
// fila a fila, de modo que mutarlo no afecta al juego.
export function obtenerSnapshot() {
  return {
    board: board.map((fila) => fila.slice()),
    score,
    best,
    tema: document.documentElement.getAttribute("data-theme") || "dark",
    // Aditivo (sub-bloque 2a): el modo y el día del reto viajan en la captura
    // y en el texto compartible. `dia` es null en modo normal.
    modo,
    dia: diaReto,
  };
}

// Captura en un <canvas> SIEMPRE DESCONECTADO: jamás se appendea al DOM (ni
// en #board ni en #fx-layer). Un nodo extra en #board rompería los 16 hijos
// y haría que la bomba (celdas.indexOf) borrara la celda equivocada;
// limpiarFx() vaciaría #fx-layer en el siguiente turno.
// Guards en este orden:
//   1) ctx nulo → return ANTES de toDataURL/toBlob (en jsdom getContext
//      devuelve null y toBlob NUNCA invoca el callback: un await sobre él
//      colgaría el test hasta timeout);
//   2) toBlob ausente → return;
//   3) DPR con tope ×2;
//   4) fuentes listas con tope ~150 ms (no romper la activación transient
//      del gesto de compartir);
//   5) dibujarCaptura() con la paleta del tema activo (D3);
//   6) toBlob → File para el share.
async function crearCaptura(snapshot) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  if (typeof canvas.toBlob !== "function") return null;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(MEDIDAS_CAPTURA.CAPTURA.ancho * dpr);
  canvas.height = Math.round(MEDIDAS_CAPTURA.CAPTURA.alto * dpr);

  if (document.fonts && document.fonts.ready) {
    await Promise.race([
      document.fonts.ready,
      new Promise((resolver) => setTimeout(resolver, 150)),
    ]);
  }

  dibujarCaptura(ctx, snapshot, { ancho: canvas.width, alto: canvas.height });

  const blob = await new Promise((resolver) => canvas.toBlob(resolver, "image/png"));
  if (!blob) return null;
  return new File([blob], "tablero-2048.png", { type: "image/png" });
}

// Cadena de fallbacks (U6/R7):
//   canShare({files}) → share({files}) → share({title,text,url}) →
//   descarga PNG → copiar enlace → aviso.
// AbortError (cancelación del usuario) ⇒ RETURN silencioso: no es error y la
// cadena NO sigue (cancelar la hoja de compartir no debe disparar una
// descarga sorpresa). Cualquier otro error cae al paso siguiente y, si se
// agota, al toast de último recurso: nunca un diálogo ni un rechazo sin
// capturar. Cada paso lleva su feature-detect (en jsdom todos ausentes).
// El código de replay en el mensaje compartido está DESACTIVADO de momento
// (el botón "Ver jugada" está oculto, así que nadie podría usarlo). Ponlo a
// true junto con quitar `hidden` de #replay en index.html para reactivarlo.
export const INCLUIR_CODIGO_REPLAY = false;

export async function compartir() {
  const snapshot = obtenerSnapshot();
  // Texto según el modo (D5): el reto comparte su FECHA, que es el código
  // compartible (el mismo tablero para todos los que juegan ese día). Con
  // secuencia grabada (2d) se añade el código de replay; sin ella (o tras
  // una bomba, I1) el texto vuelve al de solo puntuación.
  const texto = modo === "reto"
    ? `Reto diario ${snapshot.dia}: ${snapshot.score} puntos. ¿Puedes superarme?`
      + (INCLUIR_CODIGO_REPLAY && movimientos !== "" ? ` Reproduce: 2048reto:${snapshot.dia}:${movimientos}` : "")
    : `He hecho ${snapshot.score} puntos en 2048. ¿Puedes superarme?`;

  // Sin captura (jsdom, canvas roto, etc.) la cadena sigue con los pasos de
  // texto: nunca un rechazo sin capturar.
  const captura = await crearCaptura(snapshot).catch(() => null);

  // 1) Compartir la captura PNG (solo si el navegador acepta archivos).
  //    canShare() también va DENTRO del try: algunos navegadores pueden
  //    lanzar ahí y ningún paso posterior debe quedar sin capturar.
  if (captura) {
    try {
      if (
        typeof navigator.canShare === "function" &&
        navigator.canShare({ files: [captura] }) === true
      ) {
        await navigator.share({
          files: [captura],
          title: "2048",
          text: texto,
          url: location.href,
        });
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }

  // 2) Web Share sin archivos: título, texto y enlace.
  if (typeof navigator.share === "function") {
    try {
      await navigator.share({ title: "2048", text: texto, url: location.href });
      return;
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
  }

  // 3) Descarga del PNG (createObjectURL con feature-detect + <a download>
  //    temporal en document.body, NUNCA dentro de #board).
  if (captura && typeof URL.createObjectURL === "function") {
    try {
      const url = URL.createObjectURL(captura);
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = "tablero-2048.png";
      document.body.appendChild(enlace);
      enlace.click();
      enlace.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      mostrarToast("Captura descargada");
      return;
    } catch {
      /* sin soporte: siguiente paso */
    }
  }

  // 4) Copiar el enlace al portapapeles.
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(location.href);
      mostrarToast("Enlace copiado");
      return;
    } catch {
      /* sin permisos: último recurso */
    }
  }

  // 5) Último recurso: ni compartir, ni descargar, ni copiar.
  mostrarToast("Este navegador no permite compartir");
}

// El listener nunca deja una promesa rechazada sin capturar (defensa extra:
// compartir() ya no lanza en la práctica, pero el costo de cubrirla es 1 línea).
shareBtn.addEventListener("click", () => {
  void compartir().catch(() => {});
});

// --- INSTALACIÓN DE LA PWA (D7/R6) ---
// #install arranca OCULTO y solo se revela en beforeinstallprompt (Chromium);
// iOS/Firefox nunca disparan ese evento, por eso la instrucción estática vive
// en #welcome y aquí no hay botón muerto. CERO escrituras al arranque.
let eventoInstalacion = null;

window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();   // que el navegador no muestre su propia barra
  eventoInstalacion = evento;
  installBtn.hidden = false; // único momento en que se revela
});

installBtn.addEventListener("click", async () => {
  if (!eventoInstalacion) return; // sin evento pendiente: nada que instalar
  const evento = eventoInstalacion;
  eventoInstalacion = null;
  try {
    await evento.prompt();
    await evento.userChoice;
  } catch {
    /* instalación cancelada o no disponible */
  }
  installBtn.hidden = true; // se oculta vuelva a pasar lo que pase
});

window.addEventListener("appinstalled", () => {
  eventoInstalacion = null;
  installBtn.hidden = true;
});

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
actualizarBotonReto(); // #daily refleja el modo en CUALQUIER arranque

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

// La info ya NO aparece sola al cargar (bloqueaba el juego en móvil): se abre
// con el botón "i" de la cabecera.
function abrirInfo() {
  if (!welcomeEl.hidden) return;
  welcomeEl.hidden = false;
  // preventScroll: si no, enfocar el botón de abajo hace que la tarjeta se abra
  // desplazada al final. Debe empezar arriba.
  document.getElementById("welcome-close").focus({ preventScroll: true });
  const tarjeta = welcomeEl.querySelector(".welcome-card");
  if (tarjeta) tarjeta.scrollTop = 0;
}
document.getElementById("info").addEventListener("click", abrirInfo);

// Nota: mover/deshacer/toggleBomba/nuevaPartida/mostrarVictoria/mostrarGameOver
// se exportan como API del módulo para que los tests de flujo conduzcan la UI.

// --- SERVICE WORKER (decisión D8) ---
// Registro opt-in, silencioso y JAMÁS en file:// (allí los módulos ES ni
// siquiera se ejecutan: el script clásico #aviso-file ya cubre ese caso,
// este guard es defensa redundante). Sin diálogo si falla (coherente con
// D2, offline silencioso) y CERO escrituras en localStorage. Se espera al
// evento load para no competir con la carga inicial de la partida.
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const registrar = () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  };
  if (document.readyState === "complete") registrar();
  else window.addEventListener("load", registrar);
}
