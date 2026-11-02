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

// Fuentes: el navegador usa Space Grotesk; offline (o en Node) cae a
// system-ui / la fuente bitmap de ctx-software.mjs. El LAYOUT es idéntico.
const FUENTE = '"Space Grotesk", system-ui, sans-serif';

// --- PALETAS DEL CHROME (tabla U1 de 01-analysis; estilos de :root) ---
export const PALETAS = {
  dark: {
    bg: "#14171c",
    board: "#1e242c",
    cell: "#262d37",
    ink: "#e9edf2",
    inkDim: "#8a94a3",
    accent: "#f5b301",
  },
  light: {
    bg: "#f4f6f9",
    board: "#e6eaf0",
    cell: "#d7dde5",
    ink: "#1e242c",
    inkDim: "#5b6472",
    accent: "#f5b301",
  },
};

// --- RAMPA POR VALOR — idéntica en AMBOS temas y literal de
// style.css (.cell[data-value="…"], líneas 217-237). El test
// anti-deriva la compara fichero a fichero: si cambias un color en
// CSS, cámbialo aquí (y viceversa). ---
export const RAMPA = {
  2:    { fondo: "#2f3b52", texto: "#cdd6e6" },
  4:    { fondo: "#2f4f6e", texto: "#dbe6f2" },
  8:    { fondo: "#2b7f8f", texto: "#f4f7fb" },
  16:   { fondo: "#2aa07a", texto: "#f4f7fb" },
  32:   { fondo: "#5cbf4c", texto: "#10240c" },
  64:   { fondo: "#c6c63b", texto: "#23230a" },
  128:  { fondo: "#e8b23a", texto: "#241900" },
  256:  { fondo: "#ef8a37", texto: "#1f0f00" },
  512:  { fondo: "#e95d3c", texto: "#f4f7fb" },
  1024: { fondo: "#db3f68", texto: "#f4f7fb" },
  2048: { degradado: ["#ffd23f", "#ff9a3d"], texto: "#241400" },
  4096: { degradado: ["#fff1a8", "#ff7a3d"], texto: "#241400" },
  8192: { degradado: ["#fff1a8", "#ff7a3d"], texto: "#241400" },
};

// Valores por encima de 8192: en CSS heredan .cell (fondo var(--cell) y
// color #f4f7fb). Este fallback reproduce ese mismo comportamiento.
const RAMPA_FALLBACK = { fondo: null, texto: "#f4f7fb" };

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
  radio: 22,        // radio de esquina del tablero
  radioCelda: 14,   // radio de esquina de cada hueco / ficha
  filaMax: 900,     // ancho máximo de la fila de marcadores
  fuentes: {
    marca: 132,     // "2048" de la cabecera
    etiqueta: 32,   // "PUNTOS" / "RÉCORD"
    valor: 72,      // cifras del marcador
  },
};

// Gradiente del h1 (style.css:97): linear-gradient(120deg, …).
const MARCA_DEGRADADO = [
  [0, "#f5b301"],
  [0.6, "#ff7a3d"],
  [1, "#ff4d6d"],
];

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
function ajustar(ctx, texto, maxAncho, tamInicial, tamMin) {
  let tam = tamInicial;
  ctx.font = `700 ${tam}px ${FUENTE}`;
  while (tam > tamMin && ctx.measureText(texto).width > maxAncho) {
    tam = Math.max(tamMin, tam - Math.max(1, Math.round(tam * 0.06)));
    ctx.font = `700 ${tam}px ${FUENTE}`;
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
    radioCelda: Math.max(5, Math.round(MEDIDAS_CAPTURA.radioCelda * escala)),
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
  ctx.font = `700 ${dim.etiquetaTam}px ${FUENTE}`;
  ctx.fillText(etiqueta, cx, y + h * 0.3);

  ctx.fillStyle = paleta.ink;
  const texto = String(valor);
  ajustar(ctx, texto, w - dim.sep, dim.valorTam, Math.max(10, Math.round(dim.valorTam * 0.5)));
  ctx.fillText(texto, cx, y + h * 0.7);
}

// Cabecera: marca "2048" con el gradiente del h1 + fila de marcadores.
// alineado: "centro" (captura cuadrada) | "izquierda" (panel apaisado).
// Devuelve la altura ocupada.
function dibujarCabecera(ctx, x, y, anchoC, snapshot, paleta, dim, alineado) {
  const alto = alturaCabecera(dim);
  const centrado = alineado === "centro";

  // --- Marca "2048" con el gradiente del h1 ---
  let marcaTam = dim.marcaTam;
  ctx.font = `700 ${marcaTam}px ${FUENTE}`;
  let marcaAncho = ctx.measureText("2048").width;
  while (marcaTam > 12 && marcaAncho > anchoC) {
    marcaTam = Math.max(12, marcaTam - Math.max(1, Math.round(marcaTam * 0.06)));
    ctx.font = `700 ${marcaTam}px ${FUENTE}`;
    marcaAncho = ctx.measureText("2048").width;
  }

  const marcaX = centrado ? x + anchoC / 2 : x;
  // El gradiente recorre exactamente el ancho del texto, sea cual sea
  // la alineación (izquierda en el panel apaisado, centrada si no).
  const marcaIzq = centrado ? marcaX - marcaAncho / 2 : marcaX;
  const gradiente = ctx.createLinearGradient(marcaIzq, y, marcaIzq + marcaAncho, y + marcaTam);
  for (const [posicion, color] of MARCA_DEGRADADO) gradiente.addColorStop(posicion, color);

  ctx.globalAlpha = 1;
  ctx.fillStyle = gradiente;
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
  const radio = Math.max(6, Math.round(MEDIDAS_CAPTURA.radio * escala));
  const radioC = Math.max(4, Math.round(MEDIDAS_CAPTURA.radioCelda * escala));
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

      ctx.fillStyle = entrada.texto;
      const texto = String(valor);
      ajustar(ctx, texto, celda * 0.82, Math.round(celda * 0.44), Math.round(celda * 0.18));
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
