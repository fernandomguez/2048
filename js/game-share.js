// ============================================================
//  2048 — game-share.js (capa de representación: datos → canvas)
//  Compositor de la escena compartible: dibuja el tablero 4×4, el
//  marcador y la marca "2048" en un <canvas> a partir de un
//  SNAPSHOT de datos ({ board, score, best, tema }), nunca del DOM.
//
//  Reglas del módulo (contrato D9):
//  - SIN DOM en top-level: se importa también desde Node
//    (scripts/generar-iconos.mjs) para generar el og:image (D1).
//  - SIN estado del juego, SIN localStorage, SIN eventos.
//
//  CONTRATO DE API 2D REDUCIDA — este módulo solo usa, y
//  scripts/lib/ctx-software.mjs solo implementa, exactamente:
//    · fillStyle (string "#rrggbb" u objeto degradado)
//    · fillRect(x, y, w, h)
//    · beginPath() / closePath() / fill()
//    · roundRect(x, y, w, h, r)   — con fallback a fillRect si el
//      entorno no lo tiene (typeof ctx.roundRect !== "function")
//    · createLinearGradient(x0, y0, x1, y1) + addColorStop(t, color)
//    · font / textAlign / textBaseline / fillText(texto, x, y)
//    · measureText(texto).width
//    · globalAlpha
//  PROHIBIDO: drawImage, getImageData, arc, eventos y cualquier
//  lectura de document/window. Incumplir esto rompe el script de
//  iconos (Node) y con él el og:image.
// ============================================================

// Fuentes: el navegador usa la doble del tema pixel (style.css): Press
// Start 2P para LOGO y NÚMEROS de ficha, Silkscreen para etiquetas y
// marcador. Offline (o en Node) ambas caen a system-ui / la fuente bitmap
// de ctx-software.mjs. El LAYOUT es idéntico. Sin weight: son fontfaces
// monoweight y el "700" sintético emborronaría los bordes.
const FUENTE_NUMEROS = '"Press Start 2P", system-ui, sans-serif';
const FUENTE_TEXTO = '"Silkscreen", system-ui, sans-serif';

// --- PALETAS DEL CHROME (tabla U1 de 01-analysis; estilos de :root) ---
export const PALETAS = {
  dark: {
    bg: "#131722",
    board: "#1b2130",
    cell: "#252c3e",
    ink: "#f2f5fb",
    inkDim: "#8a93a8",
    accent: "#f2b03c",
  },
  light: {
    bg: "#f1f2f6",
    board: "#dde1ea",
    cell: "#cbd1de",
    ink: "#1f2740",
    inkDim: "#6a7387",
    accent: "#f2b03c",
  },
};

// --- RAMPA POR VALOR — idéntica en AMBOS temas y literal de
// style.css (.cell[data-value="…"]). El test anti-deriva la compara
// fichero a fichero: si cambias un color en CSS, cámbialo aquí
// (y viceversa). Colores planos: SIN degradados en todo el tema pixel. ---
export const RAMPA = {
  2:    { fondo: "#3d4b6e", texto: "#eaf0f9" },
  4:    { fondo: "#2c6ca8", texto: "#eaf0f9" },
  8:    { fondo: "#1e9e63", texto: "#103324" },
  16:   { fondo: "#3bb44a", texto: "#0f2e17" },
  32:   { fondo: "#8fbe2e", texto: "#18260a" },
  64:   { fondo: "#c2c22e", texto: "#252503" },
  128:  { fondo: "#e9b92e", texto: "#251a03" },
  256:  { fondo: "#ee8a31", texto: "#261102" },
  512:  { fondo: "#e85d3a", texto: "#2a0f05" },
  1024: { fondo: "#e9538b", texto: "#2a0a16" },
  2048: { fondo: "#f0b429", texto: "#241a02" },
  4096: { fondo: "#7a3e8f", texto: "#f2f5fb" },
  8192: { fondo: "#7a3e8f", texto: "#f2f5fb" },
};

// Valores por encima de 8192: en CSS heredan .cell (fondo var(--cell) y
// color var(--ink)). Este fallback reproduce ese mismo comportamiento.
const RAMPA_FALLBACK = { fondo: null, texto: null };

// --- MEDIDAS DE LAYOUT ---
// Los dos lienzos son "inputs"; el resto son px lógicos del lienzo
// CAPTURA (1080). dibujarCaptura() los convierte a proporciones con un
// único factor de escala = min(ancho, alto) / 1080, de modo que la
// misma composición sirve para el og-image apaisado y para la captura
// cuadrada del móvil. El escalado DPR lo hace la capa UI (game.js).
export const MEDIDAS_CAPTURA = {
  // Lienzo del og:image (mínimo que exigen los scrapers: 1200×630)
  OG: { ancho: 1200, alto: 630 },
  // Lienzo lógico cuadrado de la captura móvil
  CAPTURA: { ancho: 1080, alto: 1080 },
  margen: 54,       // margen exterior de la escena
  separacion: 30,   // hueco entre bloques de la cabecera
  padding: 18,      // borde interior del tablero
  hueco: 14,        // separación entre celdas
  radio: 0,         // radio de esquina del tablero (tema pixel: cuadrado)
  radioCelda: 0,    // radio de esquina de cada hueco / ficha (idem)
  filaMax: 900,     // ancho máximo de la fila de marcadores
  fuentes: {
    marca: 132,     // "2048" de la cabecera
    etiqueta: 32,   // "PUNTOS" / "RÉCORD"
    valor: 72,      // cifras del marcador
  },
};

// Color del h1 (style.css): var(--accent), sólido. El logo dejó de ser
// gradiente con el tema pixel (ahora es color plano + sombra dura).
// Consta aquí para que el canvas use EXACTAMENTE el mismo tono del CSS.
const MARCA_COLOR = "#f2b03c";

// ------------------------------------------------------------
//  Dibujo
// ------------------------------------------------------------

// Esquina redondeada con el fallback exigido por el contrato.
function rellenarRedondeado(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.fill();
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

// Reduce la fuente hasta que el texto quepa en maxAncho (deja
// ctx.font ajustado y devuelve el tamaño usado).
function ajustar(ctx, texto, maxAncho, tamInicial, tamMin, fuente = FUENTE_TEXTO) {
  let tam = tamInicial;
  ctx.font = `${tam}px ${fuente}`;
  while (tam > tamMin && ctx.measureText(texto).width > maxAncho) {
    tam = Math.max(tamMin, tam - Math.max(1, Math.round(tam * 0.06)));
    ctx.font = `${tam}px ${fuente}`;
  }
  return tam;
}

function dimensiones(escala) {
  const f = MEDIDAS_CAPTURA.fuentes;
  return {
    marcaTam: Math.round(f.marca * escala),
    etiquetaTam: Math.max(9, Math.round(f.etiqueta * escala)),
    valorTam: Math.max(12, Math.round(f.valor * escala)),
    sep: Math.round(MEDIDAS_CAPTURA.separacion * escala),
    radioCelda: Math.round(MEDIDAS_CAPTURA.radioCelda * escala),
    filaMax: Math.round(MEDIDAS_CAPTURA.filaMax * escala),
  };
}

// Altura total que ocupa la cabecera (marca + fila de marcadores).
function alturaCabecera(dim) {
  const caja = dim.etiquetaTam + dim.valorTam + dim.sep;
  return dim.marcaTam + dim.sep + caja;
}

// Una caja de marcador: fondo del tablero + etiqueta (tinta apagada)
// y valor (tinta principal), como .score-box del CSS.
function dibujarCaja(ctx, x, y, w, h, etiqueta, valor, paleta, dim) {
  ctx.globalAlpha = 1;
  ctx.fillStyle = paleta.board;
  rellenarRedondeado(ctx, x, y, w, h, dim.radioCelda);

  const cx = x + w / 2;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = paleta.inkDim;
  ctx.font = `${dim.etiquetaTam}px ${FUENTE_TEXTO}`;
  ctx.fillText(etiqueta, cx, y + h * 0.3);

  ctx.fillStyle = paleta.ink;
  const texto = String(valor);
  ajustar(ctx, texto, w - dim.sep, dim.valorTam, Math.max(10, Math.round(dim.valorTam * 0.5)), FUENTE_TEXTO);
  ctx.fillText(texto, cx, y + h * 0.7);
}

// Cabecera: marca "2048" con el color del h1 + fila de marcadores.
// alineado: "centro" (captura cuadrada) | "izquierda" (panel apaisado).
// Devuelve la altura ocupada.
function dibujarCabecera(ctx, x, y, anchoC, snapshot, paleta, dim, alineado) {
  const alto = alturaCabecera(dim);
  const centrado = alineado === "centro";

  // --- Marca "2048" con el color del h1 ---
  let marcaTam = dim.marcaTam;
  ctx.font = `${marcaTam}px ${FUENTE_NUMEROS}`;
  let marcaAncho = ctx.measureText("2048").width;
  while (marcaTam > 12 && marcaAncho > anchoC) {
    marcaTam = Math.max(12, marcaTam - Math.max(1, Math.round(marcaTam * 0.06)));
    ctx.font = `${marcaTam}px ${FUENTE_NUMEROS}`;
    marcaAncho = ctx.measureText("2048").width;
  }

  const marcaX = centrado ? x + anchoC / 2 : x;

  ctx.globalAlpha = 1;
  ctx.fillStyle = MARCA_COLOR;
  ctx.textAlign = centrado ? "center" : "left";
  ctx.textBaseline = "middle";
  ctx.fillText("2048", marcaX, y + marcaTam / 2);

  // --- Fila de marcadores (dos .score-box) ---
  const filaY = y + marcaTam + dim.sep;
  const cajaAlto = dim.etiquetaTam + dim.valorTam + dim.sep;
  const gap = dim.sep;
  const filaAncho = Math.min(anchoC, dim.filaMax);
  const filaX = x + (anchoC - filaAncho) / 2;
  const cajaAncho = (filaAncho - gap) / 2;

  dibujarCaja(ctx, filaX, filaY, cajaAncho, cajaAlto, "PUNTOS", snapshot.score, paleta, dim);
  dibujarCaja(ctx, filaX + cajaAncho + gap, filaY, cajaAncho, cajaAlto, "RÉCORD", snapshot.best, paleta, dim);

  return alto;
}

// Tablero 4×4: fondo redondeado, huecos y fichas con la rampa.
function dibujarTablero(ctx, x, y, lado, board, paleta, escala) {
  const padding = Math.max(4, Math.round(MEDIDAS_CAPTURA.padding * escala));
  const hueco = Math.max(3, Math.round(MEDIDAS_CAPTURA.hueco * escala));
  const radio = Math.round(MEDIDAS_CAPTURA.radio * escala);   // 0 en el tema pixel
  const radioC = Math.round(MEDIDAS_CAPTURA.radioCelda * escala);
  const celda = Math.floor((lado - padding * 2 - hueco * 3) / 4);

  ctx.globalAlpha = 1;
  ctx.fillStyle = paleta.board;
  rellenarRedondeado(ctx, x, y, lado, lado, radio);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let fila = 0; fila < 4; fila++) {
    for (let col = 0; col < 4; col++) {
      const celdaX = x + padding + col * (celda + hueco);
      const celdaY = y + padding + fila * (celda + hueco);
      const valor = board[fila][col];

      if (!valor) {
        ctx.fillStyle = paleta.cell;
        rellenarRedondeado(ctx, celdaX, celdaY, celda, celda, radioC);
        continue;
      }

      const entrada = RAMPA[valor] || RAMPA_FALLBACK;
      if (entrada.degradado) {
        const g = ctx.createLinearGradient(celdaX, celdaY, celdaX + celda, celdaY + celda);
        g.addColorStop(0, entrada.degradado[0]);
        g.addColorStop(1, entrada.degradado[1]);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = entrada.fondo || paleta.cell;
      }
      rellenarRedondeado(ctx, celdaX, celdaY, celda, celda, radioC);

      ctx.fillStyle = entrada.texto || paleta.ink;
      const texto = String(valor);
      ajustar(ctx, texto, celda * 0.82, Math.round(celda * 0.44), Math.round(celda * 0.18), FUENTE_NUMEROS);
      ctx.fillText(texto, celdaX + celda / 2, celdaY + celda / 2);
    }
  }
}

// ------------------------------------------------------------
//  API pública
// ------------------------------------------------------------

// Dibuja la escena completa contra la API 2D reducida.
// `snapshot` = { board (4×4), score, best, tema: "dark"|"light" }.
// `medidas`  = { ancho, alto } (usa MEDIDAS_CAPTURA.OG o .CAPTURA).
export function dibujarCaptura(ctx, snapshot, medidas) {
  const ancho = Math.round(medidas.ancho);
  const alto = Math.round(medidas.alto);
  const escala = Math.min(ancho, alto) / MEDIDAS_CAPTURA.CAPTURA.ancho;
  const paleta = PALETAS[snapshot.tema === "light" ? "light" : "dark"];
  const dim = dimensiones(escala);

  // 1) Fondo del tema: SIEMPRE el primer relleno de la escena (D3).
  ctx.globalAlpha = 1;
  ctx.fillStyle = paleta.bg;
  ctx.fillRect(0, 0, ancho, alto);

  const margen = Math.round(MEDIDAS_CAPTURA.margen * escala);
  const apaisado = ancho >= Math.round(alto * 1.25);

  if (apaisado) {
    // og:image: tablero a la izquierda, cabecera en el panel derecho.
    const lado = alto - margen * 2;
    const panelX = margen * 2 + lado;
    const panelAncho = ancho - panelX - margen;
    const cabecera = alturaCabecera(dim);
    const cabeceraY = margen + Math.max(0, (lado - cabecera) / 2);
    dibujarTablero(ctx, margen, margen, lado, snapshot.board, paleta, escala);
    dibujarCabecera(ctx, panelX, cabeceraY, panelAncho, snapshot, paleta, dim, "izquierda");
    return;
  }

  // Captura cuadrada: cabecera arriba, tablero debajo y centrado.
  dibujarCabecera(ctx, margen, margen, ancho - margen * 2, snapshot, paleta, dim, "centro");
  const cabecera = alturaCabecera(dim);
  const huecoVertical = Math.round(margen * 0.6);
  const lado = Math.min(
    ancho - margen * 2,
    alto - margen * 2 - cabecera - huecoVertical
  );
  const tableroX = Math.round((ancho - lado) / 2);
  const tableroY = margen + cabecera + huecoVertical;
  dibujarTablero(ctx, tableroX, tableroY, lado, snapshot.board, paleta, escala);
}
