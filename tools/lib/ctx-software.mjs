// ============================================================
//  2048 — scripts/lib/ctx-software.mjs
//  Implementación de la API 2D REDUCIDA de game-share.js sobre un
//  framebuffer RGBA, para poder dibujar la escena en Node SIN
//  dependencias (canvas, node-canvas, resvg… están prohibidos).
//
//  API soportada (exactamente la del contrato de game-share.js):
//    fillStyle · globalAlpha · font · textAlign · textBaseline
//    fillRect · beginPath · closePath · roundRect · fill
//    createLinearGradient · addColorStop · fillText · measureText
//
//  Técnicas:
//    · roundRect: distancia firmada a la esquina redondeada con
//      antialias por supersampling 2× (4 muestras) + box-downsample.
//    · fillText: fuente de mapa de bits 5×7 incrustada (dígitos,
//      mayúsculas, É y Ú). La cobertura se acumula en un búfer por
//      llamada y se funde UNA sola vez (evita doble mezcla en las
//      costuras entre píxeles glifo).
//    · aPNG(): filtro 0 por scanline + deflateSync + chunks
//      IHDR/IDAT/IEND con CRC32 propio en tabla (sin zlib.crc32,
//      para no acoplar el script a una versión de Node).
//  Salida DETERMINISTA: mismos bytes en cada ejecución (sin chunks
//  de fecha), así `npm run iconos` es reproducible.
// ============================================================

import { deflateSync } from "node:zlib";

// ------------------------------------------------------------
//  Fuente de mapa de bits 5×7 (7 filas de 5 píxeles por glifo)
// ------------------------------------------------------------
const GLIFOS = {
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "É": ["00010", "00100", "11111", "10000", "11110", "10000", "11111"],
  "Ú": ["00010", "00100", "10001", "10001", "10001", "10001", "01110"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

// Métrica del glifo: caja de 5×7 con 1 columna de hueco → avance de 6.
const AVANZE = 6;
const ALTO_GLIFO = 7;

// ------------------------------------------------------------
//  Color
// ------------------------------------------------------------
function parsearColor(color) {
  if (Array.isArray(color)) return color;
  const texto = String(color).trim();
  if (texto.startsWith("#")) {
    let hex = texto.slice(1);
    if (hex.length === 3) hex = hex.split("").map((d) => d + d).join("");
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 255;
      return [r, g, b, a];
    }
  }
  const rgb = texto.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const p = rgb[1].split(",").map((n) => parseFloat(n));
    return [
      Math.round(p[0] || 0),
      Math.round(p[1] || 0),
      Math.round(p[2] || 0),
      p.length > 3 && Number.isFinite(p[3]) ? Math.round(p[3] * 255) : 255,
    ];
  }
  return [0, 0, 0, 255];
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t);

function crearGradienteLineal(x0, y0, x1, y1) {
  return {
    _tipo: "gradiente-lineal",
    x0,
    y0,
    x1,
    y1,
    _paradas: [],
    addColorStop(posicion, color) {
      this._paradas.push({ t: posicion, color: parsearColor(color) });
      this._paradas.sort((a, b) => a.t - b.t);
    },
  };
}

// Muestreo igual que el canvas: proyección del punto sobre la línea
// del gradiente, normalizada y recortada a [0, 1].
function muestrearGradiente(g, px, py) {
  const paradas = g._paradas;
  if (paradas.length === 0) return [0, 0, 0, 255];
  const dx = g.x1 - g.x0;
  const dy = g.y1 - g.y0;
  const longitud2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((px - g.x0) * dx + (py - g.y0) * dy) / longitud2));
  if (t <= paradas[0].t) return paradas[0].color;
  for (let i = 1; i < paradas.length; i++) {
    if (t <= paradas[i].t) {
      const a = paradas[i - 1];
      const b = paradas[i];
      const r = b.t - a.t <= 0 ? 0 : (t - a.t) / (b.t - a.t);
      return [
        lerp(a.color[0], b.color[0], r),
        lerp(a.color[1], b.color[1], r),
        lerp(a.color[2], b.color[2], r),
        lerp(a.color[3], b.color[3], r),
      ];
    }
  }
  return paradas[paradas.length - 1].color;
}

// Memo del último color plano: rellenarRect/pintarFormas consultan el
// color píxel a píxel y parsear el mismo "#rrggbb" 300 000 veces es
// puro trabajo perdido (el degradado, en cambio, sí varía por píxel).
const MEMO_PLANO = { valor: null, color: [0, 0, 0, 255] };

function colorActual(ctx, px, py) {
  const relleno = ctx.fillStyle;
  if (typeof relleno === "string") {
    if (MEMO_PLANO.valor !== relleno) {
      MEMO_PLANO.valor = relleno;
      MEMO_PLANO.color = parsearColor(relleno);
    }
    return MEMO_PLANO.color;
  }
  if (relleno && Array.isArray(relleno._paradas)) return muestrearGradiente(relleno, px, py);
  return [0, 0, 0, 255];
}

// source-over: mezcla color×alpha sobre el píxel ya pintado.
function mezclar(fb, indice, color, alpha) {
  const a = (color[3] / 255) * alpha;
  if (a <= 0) return;
  if (a >= 1) {
    fb[indice] = color[0];
    fb[indice + 1] = color[1];
    fb[indice + 2] = color[2];
    fb[indice + 3] = 255;
    return;
  }
  const noA = 1 - a;
  fb[indice] = Math.round(color[0] * a + fb[indice] * noA);
  fb[indice + 1] = Math.round(color[1] * a + fb[indice + 1] * noA);
  fb[indice + 2] = Math.round(color[2] * a + fb[indice + 2] * noA);
  fb[indice + 3] = Math.round(255 * a + fb[indice + 3] * noA);
}

// ------------------------------------------------------------
//  Formas
// ------------------------------------------------------------

// ¿El punto (px, py) cae dentro del rectángulo con esquinas
// redondeadas? (distancia firmada a la esquina más cercana)
function dentroRedondeado(px, py, x, y, w, h, r) {
  if (px < x || px > x + w || py < y || py > y + h) return false;
  if (r <= 0) return true;
  const cx = Math.max(x + r, Math.min(px, x + w - r));
  const cy = Math.max(y + r, Math.min(py, y + h - r));
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= r * r;
}

function rellenarForma(ctx, forma) {
  const { fb, ancho, alto } = ctx;
  const w = Math.max(0, forma.w);
  const h = Math.max(0, forma.h);
  const r = Math.max(0, Math.min(forma.r, w / 2, h / 2));
  const x0 = Math.max(0, Math.floor(forma.x));
  const x1 = Math.min(ancho, Math.ceil(forma.x + w));
  const y0 = Math.max(0, Math.floor(forma.y));
  const y1 = Math.min(alto, Math.ceil(forma.y + h));
  if (x1 <= x0 || y1 <= y0) return;

  const { x, y } = forma;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      // Supersampling 2× (4 muestras) + box-downsample = cobertura.
      let cobertura = 0;
      cobertura += dentroRedondeado(px + 0.25, py + 0.25, x, y, w, h, r) ? 1 : 0;
      cobertura += dentroRedondeado(px + 0.75, py + 0.25, x, y, w, h, r) ? 1 : 0;
      cobertura += dentroRedondeado(px + 0.25, py + 0.75, x, y, w, h, r) ? 1 : 0;
      cobertura += dentroRedondeado(px + 0.75, py + 0.75, x, y, w, h, r) ? 1 : 0;
      if (cobertura === 0) continue;
      const indice = (py * ancho + px) * 4;
      mezclar(fb, indice, colorActual(ctx, px + 0.5, py + 0.5), ctx.globalAlpha * (cobertura / 4));
    }
  }
}

function rellenarRect(ctx, x, y, w, h) {
  const { fb, ancho, alto } = ctx;
  const x0 = Math.max(0, Math.floor(x));
  const x1 = Math.min(ancho, Math.ceil(x + w));
  const y0 = Math.max(0, Math.floor(y));
  const y1 = Math.min(alto, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return;
  // Relleno plano: se resuelve una sola vez; con degradado, por píxel.
  const colorPlano = typeof ctx.fillStyle === "string" ? colorActual(ctx, x0 + 0.5, y0 + 0.5) : null;
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const color = colorPlano || colorActual(ctx, px + 0.5, py + 0.5);
      mezclar(fb, (py * ancho + px) * 4, color, ctx.globalAlpha);
    }
  }
}

// ------------------------------------------------------------
//  Texto
// ------------------------------------------------------------
function tamanoFuente(ctx) {
  const coincidencia = /(\d+(?:\.\d+)?)\s*px/.exec(String(ctx.font));
  return coincidencia ? parseFloat(coincidencia[1]) : 10;
}

function glifoDe(caracter) {
  return GLIFOS[caracter] || GLIFOS[caracter.toUpperCase()] || null;
}

function medirTexto(ctx, texto) {
  const escala = tamanoFuente(ctx) / ALTO_GLIFO;
  const n = String(texto).length;
  return n === 0 ? 0 : (n * AVANZE - 1) * escala;
}

// Acumula el solape (área) de un rectángulo sobre el búfer de
// cobertura; los píxeles glifo son disjuntos, así que la suma no
// pasa de 1 y el fundido posterior es único (sin costuras dobles).
function acumularCobertura(cobertura, origenX, origenY, anchoBuf, x0, y0, x1, y1) {
  const px0 = Math.floor(x0);
  const px1 = Math.ceil(x1);
  const py0 = Math.floor(y0);
  const py1 = Math.ceil(y1);
  for (let py = Math.max(0, py0 - origenY); py < Math.min(cobertura.length / anchoBuf, py1 - origenY); py++) {
    const pyAbs = py + origenY;
    const oy = Math.min(y1, pyAbs + 1) - Math.max(y0, pyAbs);
    if (oy <= 0) continue;
    const fila = py * anchoBuf;
    for (let px = Math.max(0, px0 - origenX); px < Math.min(anchoBuf, px1 - origenX); px++) {
      const pxAbs = px + origenX;
      const ox = Math.min(x1, pxAbs + 1) - Math.max(x0, pxAbs);
      if (ox <= 0) continue;
      cobertura[fila + px] += ox * oy;
    }
  }
}

function pintarTexto(ctx, texto, x, y) {
  const cadena = String(texto);
  if (cadena.length === 0) return;
  const { fb, ancho, alto } = ctx;
  const escala = tamanoFuente(ctx) / ALTO_GLIFO;
  const anchoTexto = medirTexto(ctx, cadena);
  const altoTexto = ALTO_GLIFO * escala;

  let origenX = x;
  if (ctx.textAlign === "center") origenX = x - anchoTexto / 2;
  else if (ctx.textAlign === "right" || ctx.textAlign === "end") origenX = x - anchoTexto;

  let origenY = y;
  const linea = ctx.textBaseline;
  if (linea === "middle" || linea === "center") origenY = y - altoTexto / 2;
  else if (linea === "bottom" || linea === "alphabetic" || linea === "ideographic") origenY = y - altoTexto;

  const bx0 = Math.floor(origenX);
  const bx1 = Math.ceil(origenX + anchoTexto);
  const by0 = Math.floor(origenY);
  const by1 = Math.ceil(origenY + altoTexto);
  const px0 = Math.max(0, bx0);
  const px1 = Math.min(ancho, bx1);
  const py0 = Math.max(0, by0);
  const py1 = Math.min(alto, by1);
  if (px1 <= px0 || py1 <= py0) return;

  const anchoBuf = px1 - px0;
  const altoBuf = py1 - py0;
  const cobertura = new Float32Array(anchoBuf * altoBuf);

  for (let i = 0; i < cadena.length; i++) {
    const glifo = glifoDe(cadena[i]);
    const inicioX = origenX + i * AVANZE * escala;
    if (!glifo) continue;
    for (let fila = 0; fila < ALTO_GLIFO; fila++) {
      const lineaGlifo = glifo[fila];
      for (let col = 0; col < lineaGlifo.length; col++) {
        if (lineaGlifo[col] !== "1") continue;
        const gx0 = inicioX + col * escala;
        const gy0 = origenY + fila * escala;
        acumularCobertura(cobertura, px0, py0, anchoBuf, gx0, gy0, gx0 + escala, gy0 + escala);
      }
    }
  }

  for (let py = 0; py < altoBuf; py++) {
    for (let px = 0; px < anchoBuf; px++) {
      const cob = Math.min(1, cobertura[py * anchoBuf + px]);
      if (cob <= 0) continue;
      const absX = px0 + px;
      const absY = py0 + py;
      mezclar(fb, (absY * ancho + absX) * 4, colorActual(ctx, absX + 0.5, absY + 0.5), ctx.globalAlpha * cob);
    }
  }
}

// ------------------------------------------------------------
//  Contexto
// ------------------------------------------------------------
export function crearCtxSoftware(ancho, alto) {
  const ctx = {
    ancho,
    alto,
    fb: new Uint8Array(ancho * alto * 4),
    fillStyle: "#000000",
    globalAlpha: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    _ruta: [],

    beginPath() {
      this._ruta = [];
    },
    closePath() {
      /* la ruta son rectángulos cerrados: no-op */
    },
    roundRect(x, y, w, h, r = 0) {
      this._ruta.push({ x, y, w, h, r });
      return this;
    },
    fill() {
      for (const forma of this._ruta) rellenarForma(this, forma);
      this._ruta = [];
    },
    fillRect(x, y, w, h) {
      rellenarRect(this, x, y, w, h);
    },
    createLinearGradient(x0, y0, x1, y1) {
      return crearGradienteLineal(x0, y0, x1, y1);
    },
    fillText(texto, x, y) {
      pintarTexto(this, texto, x, y);
    },
    measureText(texto) {
      return { width: medirTexto(this, texto) };
    },
  };
  return ctx;
}

// ------------------------------------------------------------
//  Codificador PNG (filtro 0 + deflate + CRC32 propio)
// ------------------------------------------------------------
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TABLA_CRC32 = (() => {
  const tabla = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabla[n] = c >>> 0;
  }
  return tabla;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    c = TABLA_CRC32[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const encabezado = Buffer.alloc(4);
  encabezado.writeUInt32BE(datos.length, 0);
  const tipoBuf = Buffer.from(tipo, "ascii");
  const cuerpo = Buffer.concat([tipoBuf, datos]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(cuerpo), 0);
  return Buffer.concat([encabezado, cuerpo, crcBuf]);
}

// fb: Uint8Array RGBA (4 bytes/píxel, sin canal alfa premultiplicado).
export function aPNG(fb, ancho, alto) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8;  // profundidad de bits
  ihdr[9] = 6;  // color truecolor + alfa
  ihdr[10] = 0; // compresión estándar
  ihdr[11] = 0; // filtro estándar
  ihdr[12] = 0; // sin interlazar

  const porFila = ancho * 4;
  const crudo = Buffer.alloc((porFila + 1) * alto);
  for (let y = 0; y < alto; y++) {
    crudo[y * (porFila + 1)] = 0; // filtro 0 (None)
    Buffer.from(fb.buffer, fb.byteOffset + y * porFila, porFila).copy(
      crudo,
      y * (porFila + 1) + 1
    );
  }

  return Buffer.concat([
    FIRMA_PNG,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(crudo, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
