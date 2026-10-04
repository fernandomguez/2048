// ============================================================
//  2048 — game-fx.js (capa de efectos visuales y feedback)
//  Slide de movimiento, fantasmas de fusión, pop, flotantes +N,
//  sonido Web Audio y háptica.
//  Todo se pinta en #fx-layer (fuera de #board) salvo el pop, que es
//  una clase sobre la celda destino ya existente: #board.children
//  sigue siendo exactamente 16 .cell (bomba y textosCeldas intactas).
//  Sin estado del juego: recibe la traza de game-core.js y la representa.
//  Interrumpible por diseño: limpiarFx() al inicio de cada ciclo de juego.
// ============================================================

import { TAMANO } from "./game-core.js";

// Duraciones en ms: deben casar con las de style.css.
const DURACION_SLIDE_MS = 120;          // transición transform del slide
const DURACION_POP_MS = 180;            // keyframes de la fusión (delay = slide)
const DURACION_FANTASMA_MS = DURACION_SLIDE_MS + 20; // fantasma hasta el fin del slide
const DURACION_CLASE_POP_MS = DURACION_SLIDE_MS + DURACION_POP_MS + 60;
const DURACION_FLOTANTE_MS = 700;       // subida + desvanecimiento del +N

// Capa inyectada por game.js (el id lo lee game.js con literal para que
// markup.test.js lo valide contra index.html y el fixture lo declare).
let capa = null;

// Temporizadores pendientes. limpiarFx() incrementa "generacion", así que
// ningún callback pospuesto (setTimeout ni requestAnimationFrame) puede
// re-aplicar estilos después de una interrupción.
let temporizadores = [];
let generacion = 0;

// Registra un temporizador cancelable por limpiarFx().
function programar(fn, ms) {
  const gen = generacion;
  const id = setTimeout(() => {
    if (gen !== generacion) return;
    fn();
  }, ms);
  temporizadores.push(id);
}

// Ejecuta en el siguiente frame (fallback a setTimeout si no hay rAF).
function enSiguienteFrame(fn) {
  const gen = generacion;
  const cb = () => {
    if (gen !== generacion) return;
    fn();
  };
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(cb);
  else setTimeout(cb, 0);
}

// prefers-reduced-motion se consulta EN CADA animación (nunca solo al
// arranque): el usuario puede cambiar la preferencia en caliente.
// El stub de tests/setup.js basta; sin matchMedia → sin preferencia.
function movimientoReducido() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Las 16 .cell del tablero en orden row-major.
function celdasTablero() {
  const boardEl = document.getElementById("board");
  return boardEl ? [...boardEl.children] : [];
}

function clave(pos) {
  return pos[0] + "," + pos[1];
}

// Recibe la capa #fx-layer desde game.js (nunca consulta ids nuevos por sí
// mismo: markup.test.js solo escanea getElementById en game.js).
export function configurarFx({ capa: elemento }) {
  capa = elemento || null;
}

// Vuelca #fx-layer y retira el estado inline y las clases de las celdas del
// tablero. Se llama al inicio de mover(), deshacer(), nuevaPartida() y del
// handler de bomba: la animación es una capa posterior e interrumpible,
// jamás un lock de entrada (decisión 3 del plan).
export function limpiarFx() {
  generacion++;
  for (const id of temporizadores) clearTimeout(id);
  temporizadores = [];

  if (capa) {
    while (capa.firstChild) capa.removeChild(capa.firstChild);
  }

  for (const celda of celdasTablero()) {
    celda.classList.remove("fusionando");
    const ficha = celda.firstElementChild;
    if (ficha) {
      ficha.style.transform = "";
      ficha.style.transition = "";
    }
  }
}

// SLIDE: la .tile destino parte desplazada (rect del origen menos rect del
// destino) y al siguiente frame transiciona a translate(0,0). Solo se anima
// transform (y opacity): nunca width/left/top ni box-shadow.
// Guard jsdom/sin layout: si algún rect mide 0 no hay distancia fiable →
// se omite el transform (nunca NaN).
function animarSlide(celdas, movimientos, origenesSlide) {
  const yaAnimadas = new Set();
  for (const mov of movimientos) {
    if (!mov.hasta) continue;
    const destino = clave(mov.hasta);
    if (yaAnimadas.has(destino)) continue; // un solo slide por ficha destino
    yaAnimadas.add(destino);

    const celdaOrigen = celdas[mov.desde[0] * TAMANO + mov.desde[1]];
    const celdaDestino = celdas[mov.hasta[0] * TAMANO + mov.hasta[1]];
    if (!celdaOrigen || !celdaDestino) continue;

    const rectOrigen = celdaOrigen.getBoundingClientRect();
    const rectDestino = celdaDestino.getBoundingClientRect();
    if (rectOrigen.width === 0 || rectDestino.width === 0) continue;

    const ficha = celdaDestino.firstElementChild;
    if (!ficha) continue;

    origenesSlide.set(destino, mov.desde);
    const dx = rectOrigen.left - rectDestino.left;
    const dy = rectOrigen.top - rectDestino.top;
    ficha.style.transform = "translate(" + dx + "px, " + dy + "px)";

    enSiguienteFrame(() => {
      ficha.style.transition = "transform " + DURACION_SLIDE_MS + "ms ease";
      ficha.style.transform = "translate(0px, 0px)";
      // Retira el estilo al terminar: el siguiente ciclo parte limpio.
      programar(() => {
        ficha.style.transition = "";
        ficha.style.transform = "";
      }, DURACION_SLIDE_MS + 60);
    });
  }
}

// FANTASMAS: cada fusión dibuja en #fx-layer las fuentes que NO son el origen
// del slide, con su rampa data-value y su rect, y las retira con setTimeout
// (sin transitionend/animationend: no disparan en jsdom).
function pintarFantasmas(celdas, fusiones, origenesSlide, previo) {
  for (const fusion of fusiones) {
    const origenSlide = origenesSlide.get(clave(fusion.en));
    for (const fuente of fusion.desde) {
      if (origenSlide && fuente[0] === origenSlide[0] && fuente[1] === origenSlide[1]) continue;
      crearFantasma(celdas, fuente, previo);
    }
  }
}

function crearFantasma(celdas, posicion, previo) {
  const valor = previo[posicion[0]][posicion[1]];
  if (!valor) return;
  const celda = celdas[posicion[0] * TAMANO + posicion[1]];
  if (!celda) return;
  const rect = celda.getBoundingClientRect();
  if (rect.width === 0) return; // sin layout: sin fantasma (nunca NaN)
  const rectCapa = capa.getBoundingClientRect();

  const nodo = document.createElement("div");
  nodo.className = "cell fx-fantasma len" + String(valor).length;
  nodo.dataset.value = valor;       // reutiliza la rampa de temperatura
  nodo.textContent = valor;
  nodo.style.left = rect.left - rectCapa.left + "px";
  nodo.style.top = rect.top - rectCapa.top + "px";
  nodo.style.width = rect.width + "px";
  nodo.style.height = rect.height + "px";
  capa.appendChild(nodo);
  programar(() => nodo.remove(), DURACION_FANTASMA_MS);
}

// POP: la celda destino de cada fusión late tras el slide; el animation-delay
// (= duración del slide) está en style.css. Sin prefers-reduced-motion.
function pintarPop(celdas, fusiones) {
  for (const fusion of fusiones) {
    const celda = celdas[fusion.en[0] * TAMANO + fusion.en[1]];
    if (!celda) continue;
    celda.classList.add("fusionando");
    programar(() => celda.classList.remove("fusionando"), DURACION_CLASE_POP_MS);
  }
}

// Punto de entrada: se llama desde game.js tras render() cuando hubo cambio.
export function animarMovimiento({ traza, previo }) {
  if (!capa || !traza || !previo) return;
  if (movimientoReducido()) return; // solo estado final
  const celdas = celdasTablero();
  if (celdas.length === 0) return;

  const origenesSlide = new Map();
  animarSlide(celdas, traza.movimientos || [], origenesSlide);
  pintarFantasmas(celdas, traza.fusiones || [], origenesSlide, previo);
  pintarPop(celdas, traza.fusiones || []);
}

// PUNTOS FLOTANTES +N: un nodo por fusión en #fx-layer, centrado sobre la
// celda "en", que sube y se desvanece en 0.7 s y game-fx.js retira con
// setTimeout (sin animationend). Nunca entran en #board (romperían
// textosCeldas() y la aritmética de la bomba) y el aria-hidden del
// contenedor evita duplicar anuncios con #score[aria-live].
// En prefers-reduced-motion solo se desvanece (sin translateY), decidido con
// matchMedia consultado EN CADA animación + la rama de style.css.
export function pintarFlotantes(fusiones) {
  if (!capa || !Array.isArray(fusiones) || fusiones.length === 0) return;
  const reducido = movimientoReducido();
  const celdas = celdasTablero();
  const rectCapa = capa.getBoundingClientRect();

  for (const fusion of fusiones) {
    const nodo = document.createElement("div");
    nodo.className = "fx-flotante" + (reducido ? " fx-reducido" : "");
    nodo.textContent = "+" + fusion.valor;

    const celda = celdas[fusion.en[0] * TAMANO + fusion.en[1]];
    if (celda) {
      const rect = celda.getBoundingClientRect();
      // Sin layout (jsdom) los rects valen 0: queda en (0,0) sin NaN; con
      // layout se centra sobre la celda fusionada.
      nodo.style.left = rect.left - rectCapa.left + rect.width / 2 + "px";
      nodo.style.top = rect.top - rectCapa.top + rect.height / 2 + "px";
    }

    capa.appendChild(nodo);
    programar(() => nodo.remove(), DURACION_FLOTANTE_MS);
  }
}

// ============================================================
//  FEEDBACK: SONIDO (Web Audio) Y HÁPTICA (Task 7)
//  Sin archivos de audio: tonos generados con OscillatorNode one-shot.
//  Todo el bloque queda en no-op silencioso si falta Web Audio (jsdom),
//  si falta navigator.vibrate (iOS/Firefox) o si el interruptor está OFF.
// ============================================================

// Gate maestro: ON por defecto. Solo game.js lo cambia (interruptor
// #fx-toggle) y NUNCA se escribe en localStorage al arrancar: la clave
// stats2048 solo gana "fxActivo" cuando el usuario pulsa (decisión 8).
let feedbackActivo = true;

// AudioContext perezoso: se crea/reanuda en el PRIMER gesto del usuario
// (política de autoplay de los navegadores). Null mientras no haya gesto.
let contextoAudio = null;

// game.js informa del estado del interruptor (lectura al arranque, escritura
// solo en el click). El valor por defecto del módulo ya es "activo".
export function establecerFeedbackActivo(activo) {
  feedbackActivo = activo !== false;
}

function fabricaContextoAudio() {
  if (typeof window === "undefined") return null;
  return window.AudioContext || window.webkitAudioContext || null;
}

// Registra UNA sola vez el primer gesto (pointerdown/keydown) que crea y
// reanuda el contexto. Se llama al cargar el módulo, pero solo si el
// navegador tiene Web Audio: en jsdom no se añade ni un listener.
// Los listeners llevan { once: true } y, además, se retiran entre sí para
// que no quede ninguno huérfano tras el primer gesto.
function prepararAudioEnPrimerGesto() {
  const Fabrica = fabricaContextoAudio();
  if (typeof Fabrica !== "function") return; // sin Web Audio: nada que preparar

  const primerGesto = () => {
    window.removeEventListener("pointerdown", primerGesto);
    window.removeEventListener("keydown", primerGesto);
    try {
      if (!contextoAudio) contextoAudio = new Fabrica();
      if (contextoAudio.state === "suspended" && typeof contextoAudio.resume === "function") {
        const promesa = contextoAudio.resume();
        if (promesa && typeof promesa.catch === "function") promesa.catch(() => {});
      }
    } catch { contextoAudio = null; } // sin audio disponible: silencio
  };

  window.addEventListener("pointerdown", primerGesto, { once: true });
  window.addEventListener("keydown", primerGesto, { once: true });
}

prepararAudioEnPrimerGesto();

// Helper de tono: OscillatorNode one-shot + GainNode con envolvente
// (setValueAtTime + linearRampToValueAtTime de SUBIDA y de BAJADA hasta
// 0.0001, nunca hasta 0, que provocaría un "click" al cortar en seco) y
// stop programado. SIN ScriptProcessorNode: cada tono es un oscilador
// desechable que se conecta, suena y se detiene solo.
// "retraso" desplaza el inicio en el reloj del propio AudioContext (una
// secuencia no necesita temporizadores de JavaScript).
function reproducirTono({ frecuencia, duracion = 0.12, volumen = 0.05, retraso = 0 }) {
  if (!feedbackActivo) return;   // interruptor OFF → silencio
  if (!contextoAudio) return;    // aún no hubo gesto (o sin Web Audio)
  if (typeof frecuencia !== "number" || !Number.isFinite(frecuencia) || frecuencia <= 0) return;

  try {
    const inicio = contextoAudio.currentTime + retraso;
    const oscilador = contextoAudio.createOscillator();
    const ganancia = contextoAudio.createGain();

    oscilador.type = "sine";
    oscilador.frequency.setValueAtTime(frecuencia, inicio);

    ganancia.gain.setValueAtTime(0.0001, inicio);
    ganancia.gain.linearRampToValueAtTime(volumen, inicio + duracion * 0.25);
    ganancia.gain.linearRampToValueAtTime(0.0001, inicio + duracion);

    oscilador.connect(ganancia);
    ganancia.connect(contextoAudio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracion + 0.02); // stop programado: nunca queda vivo
  } catch { /* sin audio disponible: silencio */ }
}

// Háptica con feature-detect: navigator.vibrate no existe en Safari/iOS ni
// en Firefox desktop (mejora progresiva, decisión 12). SOLO se usa en la
// fusión; no depende de Web Audio ni de prefers-reduced-motion (decisión 8).
function vibrar(pattern) {
  if (!feedbackActivo) return;
  if (typeof navigator === "undefined") return;
  if (typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(pattern); } catch { /* mejor esfuerzo */ }
}

// Aviso 1 — MOVIMIENTO: tono corto y discreto por turno con cambio.
export function sonarMovimiento() {
  reproducirTono({ frecuencia: 200, duracion: 0.07, volumen: 0.035 });
}

// Aviso 2 — FUSIÓN: la frecuencia crece con Math.log2(valor), así que cada
// doblez del valor sube la nota (4 → 2 pasos, 8 → 3, 2048 → 11). La
// vibración (pattern corto) se dispara SOLO aquí.
export function avisarFusion(valor) {
  const exponente = Math.log2(valor);
  if (!Number.isFinite(exponente)) return;
  reproducirTono({ frecuencia: 300 + 60 * exponente, duracion: 0.14, volumen: 0.05 });
  vibrar(20); // 20 ms: pattern corto, un solo pulso
}

// Aviso 3 — FIN DE PARTIDA: secuencia ASCENDENTE con la victoria y
// DESCENDENTE al quedarse sin movimientos (programada en el reloj del
// AudioContext, sin setTimeout).
export function sonarFinPartida(esVictoria) {
  const notas = esVictoria ? [392, 523, 659] : [392, 311, 233];
  notas.forEach((frecuencia, indice) => {
    reproducirTono({ frecuencia, duracion: 0.16, volumen: 0.05, retraso: indice * 0.1 });
  });
}
