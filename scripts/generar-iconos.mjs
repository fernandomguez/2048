#!/usr/bin/env node
// ============================================================
//  2048 — scripts/generar-iconos.mjs
//  Script de desarrollo (npm run iconos): genera los dos PNG del
//  repo SIN dependencias ni build — Node puro (node:fs, node:path,
//  node:zlib con CRC32 propio en scripts/lib/ctx-software.mjs).
//
//  Salidas (se COMMITEAN; no forma parte de `npm test` ni de CI):
//   1. icons/apple-touch-icon-180.png  → 180×180  (iOS no acepta SVG)
//   2. icons/og-image-1200x630.png     → 1200×630 (ningún scraper
//      acepta SVG en og:image) — se dibuja con dibujarCaptura() de
//      game-share.js, el MISMO código de dibujo que usa el navegador
//      (decisión D1). Deriva aceptada y documentada: el texto se
//      rasteriza con la fuente bitmap de Node y con Space Grotesk en
//      el navegador; layout, rampa y composición son idénticos.
//
//  Reproducible: misma entrada ⇒ mismos bytes (sin chunks de fecha).
// ============================================================

import { mkdirSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dibujarCaptura, MEDIDAS_CAPTURA } from "../game-share.js";
import { crearCtxSoftware, aPNG } from "./lib/ctx-software.mjs";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

// Snapshot de ejemplo FIJO para el og:image (tablero de muestra con
// todos los tramos de la rampa, incluida la ficha 2048 con degradado).
const EJEMPLO = {
  board: [
    [2, 4, 8, 16],
    [32, 64, 128, 256],
    [512, 1024, 2048, 4],
    [8, 16, 32, 64],
  ],
  score: 18460,
  best: 24892,
  tema: "dark",
};

// --- 1) apple-touch-icon 180×180 (fondo + ficha + "2048") ---
function dibujarAppleTouch() {
  const lado = 180;
  const ctx = crearCtxSoftware(lado, lado);
  const margen = 20;
  const ficha = lado - margen * 2;

  ctx.globalAlpha = 1;
  ctx.fillStyle = "#14171c";
  ctx.fillRect(0, 0, lado, lado);

  const gradiente = ctx.createLinearGradient(margen, margen, margen + ficha, margen + ficha);
  gradiente.addColorStop(0, "#ffd23f");
  gradiente.addColorStop(1, "#ff9a3d");
  ctx.fillStyle = gradiente;
  ctx.beginPath();
  ctx.roundRect(margen, margen, ficha, ficha, 26);
  ctx.fill();

  ctx.fillStyle = "#241400";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 38px sans-serif";
  ctx.fillText("2048", lado / 2, lado / 2 + 1);
  return { ctx, lado };
}

// --- 2) og:image 1200×630 con el compositor del navegador ---
function dibujarOG() {
  const { ancho, alto } = MEDIDAS_CAPTURA.OG;
  const ctx = crearCtxSoftware(ancho, alto);
  dibujarCaptura(ctx, EJEMPLO, MEDIDAS_CAPTURA.OG);
  return { ctx, ancho, alto };
}

// --- Escritura + resumen por stdout ---
function escribir(ruta, buffer) {
  const destino = join(RAIZ, ruta);
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(destino, buffer);
  return statSync(destino).size;
}

const apple = dibujarAppleTouch();
const bytesApple = escribir(
  "icons/apple-touch-icon-180.png",
  aPNG(apple.ctx.fb, apple.lado, apple.lado)
);

const og = dibujarOG();
const bytesOG = escribir("icons/og-image-1200x630.png", aPNG(og.ctx.fb, og.ancho, og.alto));

console.log("Iconos generados (script dev-only, sin dependencias):");
console.log(`  icons/apple-touch-icon-180.png  180×180   ${bytesApple} bytes`);
console.log(`  icons/og-image-1200x630.png     1200×630  ${bytesOG} bytes`);
console.log("Nota: los SVG (icons/2048.svg y icons/2048-maskable.svg) van a mano.");
