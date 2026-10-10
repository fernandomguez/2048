// ============================================================
//  Task 10 — PWA: manifest, head, iconos, service worker y tooling.
//  Entorno NODE (sin DOM): los tests leen los ficheros tal cual están
//  en disco con readFileSync. Nada de esto lo simula la CI más allá de
//  lint+tests (R10), así que aquí se fija por escrito lo que la
//  verificación manual de Chrome (Task 12) revalidará en navegador.
//  Este archivo solo AÑADE una suite: no modifica ninguna existente.
// ============================================================
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const CARPETA_TESTS = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(CARPETA_TESTS, "..");

function leer(ruta) {
  return readFileSync(resolve(RAIZ, ruta), "utf8");
}

function leerBuffer(ruta) {
  return readFileSync(resolve(RAIZ, ruta));
}

// Firma PNG: 89 50 4E 47 0D 0A 1A 0A.
const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Dimensiones del chunk IHDR (bytes 16-19 ancho, 20-23 alto; big-endian).
function dimensionesIHDR(buffer) {
  return { ancho: buffer.readUInt32BE(16), alto: buffer.readUInt32BE(20) };
}

// ============================================================
//  1) manifest.json instalable (R1)
// ============================================================

describe("manifest.json", () => {
  const manifest = JSON.parse(leer("manifest.json"));

  it("cumple los requisitos de instalación con rutas relativas", () => {
    expect(manifest.name).toBe("2048");
    expect(manifest.short_name).toBe("2048");
    expect(manifest.start_url).toBe("./");
    expect(manifest.scope).toBe("./");
    expect(manifest.display).toBe("standalone");
    expect(manifest.background_color).toBe("#14171c");
    expect(manifest.theme_color).toBe("#14171c");
    expect(manifest.prefer_related_applications).not.toBe(true);

    // Nada de rutas absolutas: rompería el despliegue en subcarpeta (A3).
    const rutas = [manifest.start_url, manifest.scope, ...manifest.icons.map((i) => i.src)];
    for (const ruta of rutas) {
      expect(ruta.startsWith("/"), `${ruta} es absoluta`).toBe(false);
      expect(ruta.startsWith("http"), `${ruta} es remota`).toBe(false);
    }
  });

  it("declara exactamente dos iconos: purpose any y maskable separados (R2)", () => {
    expect(manifest.icons).toHaveLength(2);
    const propositos = manifest.icons.map((i) => i.purpose);
    expect(propositos).toContain("any");
    expect(propositos).toContain("maskable");
    // Sin combinarlos en una sola entrada ("any maskable" desaconsejado).
    expect(new Set(propositos).size).toBe(2);
    for (const icono of manifest.icons) {
      expect(icono.sizes).toBe("any");
      expect(icono.type).toBe("image/svg+xml");
    }
  });
});

// ============================================================
//  2) head de index.html (A5 / D1)
// ============================================================

describe("index.html: manifest, iconos y metadatos en el head", () => {
  const html = leer("index.html");

  it("enlaza manifest, favicon SVG y apple-touch-icon", () => {
    expect(html).toContain('<link rel="manifest" href="manifest.json">');
    expect(html).toContain('<link rel="icon" href="icons/2048.svg" type="image/svg+xml">');
    expect(html).toContain('<link rel="apple-touch-icon" href="icons/apple-touch-icon-180.png">');
    expect(html).toContain('name="apple-mobile-web-app-capable"');
  });

  it("declara theme-color y los og con ruta relativa (D1)", () => {
    expect(html).toContain('<meta name="theme-color" content="#14171c">');
    expect(html).toContain('property="og:url"');
    expect(html).toContain('<meta property="og:image" content="icons/og-image-1200x630.png">');
    expect(html).toContain('<meta property="og:image:width" content="1200">');
    expect(html).toContain('<meta property="og:image:height" content="630">');
    expect(html).toContain('<meta property="og:image:type" content="image/png">');
    expect(html).toContain('property="og:image:alt"');
    // Mientras no haya hosting elegido, og:url/og:image siguen RELATIVOS:
    // la URL absoluta queda pendiente (nota en DOCUMENTACION.md §8.1).
  });
});

// ============================================================
//  3) Los 4 iconos en disco: firma PNG e IHDR exactas
// ============================================================

describe("icons/", () => {
  it("existen los 4 ficheros (2 SVG + 2 PNG)", () => {
    const esperados = [
      "icons/2048.svg",
      "icons/2048-maskable.svg",
      "icons/apple-touch-icon-180.png",
      "icons/og-image-1200x630.png",
    ];
    for (const ruta of esperados) {
      expect(existsSync(resolve(RAIZ, ruta)), `falta ${ruta}`).toBe(true);
    }
  });

  it("los PNG tienen la firma PNG y las dimensiones IHDR 180×180 y 1200×630", () => {
    const apple = leerBuffer("icons/apple-touch-icon-180.png");
    expect(Buffer.compare(apple.subarray(0, 8), FIRMA_PNG)).toBe(0);
    expect(dimensionesIHDR(apple)).toEqual({ ancho: 180, alto: 180 });

    const og = leerBuffer("icons/og-image-1200x630.png");
    expect(Buffer.compare(og.subarray(0, 8), FIRMA_PNG)).toBe(0);
    expect(dimensionesIHDR(og)).toEqual({ ancho: 1200, alto: 630 });
  });
});

// ============================================================
//  4) sw.js: fuente + lista PRECACHE + existencia en disco
// ============================================================

describe("sw.js", () => {
  const fuente = leer("sw.js");

  it("versión 2048-v1, waitUntil, addAll y clients.claim; SIN skipWaiting ni reload", () => {
    expect(fuente).toContain('const CACHE = "2048-v1"');
    expect(fuente).toContain("event.waitUntil");
    expect(fuente).toContain("caches.addAll");
    expect(fuente).toContain("clients.claim()");
    // Riesgos 9 / G7: nada de salto de versión ni recargas automátáticas
    // (recargar dentro de la ventana de 260 ms perdería la pantalla de fin).
    expect(fuente).not.toContain("skipWaiting");
    expect(fuente).not.toContain("location.reload");
    expect(fuente).not.toContain("controllerchange");
  });

  it("el PRECACHE es relativo, completo y CADA ruta existe en disco (riesgo 8)", () => {
    const bloque = fuente.match(/const PRECACHE = \[([\s\S]*?)\];/);
    expect(bloque, "no se encontró la lista PRECACHE").not.toBeNull();
    const rutas = [...bloque[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

    expect(rutas).toHaveLength(12);
    for (const ruta of rutas) {
      // cache.addAll es atómico: una ruta mal escrita (404) aborta la
      // instalación entera, por eso el test recorre la lista completa.
      expect(ruta.startsWith("./"), `${ruta} no es relativa`).toBe(true);
      expect(existsSync(resolve(RAIZ, ruta)), `falta en disco: ${ruta}`).toBe(true);
    }

    const obligatorias = [
      "./", "./index.html", "./style.css",
      "./game.js", "./game-core.js", "./game-fx.js", "./game-share.js",
      "./manifest.json",
      "./icons/2048.svg", "./icons/2048-maskable.svg",
      "./icons/apple-touch-icon-180.png", "./icons/og-image-1200x630.png",
    ];
    for (const ruta of obligatorias) expect(rutas).toContain(ruta);
  });

  it("la navegación/HTML/JS/CSS es network-first: fetch() antes del fallback (riesgo 3)", () => {
    const inicio = fuente.indexOf("if (esDocumental) {");
    expect(inicio).toBeGreaterThan(-1);
    const fin = fuente.indexOf("return;", inicio);
    expect(fin).toBeGreaterThan(inicio);
    const bloque = fuente.slice(inicio, fin);

    const iFetch = bloque.indexOf("fetch(");
    const iCaches = bloque.indexOf("caches.match(");
    expect(iFetch).toBeGreaterThan(-1);
    expect(iCaches).toBeGreaterThan(-1);
    expect(iFetch).toBeLessThan(iCaches); // la red manda; la caché es el respaldo
  });
});

// ============================================================
//  5) Override de ESLint para sw.js (riesgo 1)
// ============================================================

describe("eslint.config.js", () => {
  it('declara el bloque override files: ["sw.js"] con globals.serviceworker', () => {
    const config = leer("eslint.config.js");
    expect(config).toContain('files: ["sw.js"]');
    expect(config).toContain("globals.serviceworker");
    // A prueba de sustitución: browser se redeclara junto a serviceworker.
    expect(config).toContain("{ ...globals.browser, ...globals.serviceworker }");
  });
});

// ============================================================
//  6) Registro del SW en game.js (D8 / Task 7)
// ============================================================

describe("game.js: registro del service worker", () => {
  const fuente = leer("game.js");

  it('registra "./sw.js" con feature-detect y guard de file://', () => {
    expect(fuente).toContain('"serviceWorker" in navigator');
    expect(fuente).toContain('location.protocol !== "file:"');
    expect(fuente).toContain('register("./sw.js")');
  });
});

// ============================================================
//  7) Reglas CSS nuevas (riesgo 10 / U4)
// ============================================================

describe("style.css: guards de UI", () => {
  const css = leer("style.css");

  it("[hidden] gana a .icon-btn, .tap-44 mide 44px y .toast[hidden] existe", () => {
    expect(css).toContain(".icon-btn[hidden]");
    expect(css).toMatch(/\.tap-44\s*\{[^}]*min-height:\s*44px/);
    expect(css).toContain(".toast[hidden]");
  });
});

// ============================================================
//  8) package.json (cero dependencias nuevas) + ci.yml
// ============================================================

describe("tooling: dependencias y CI", () => {
  it("devDependencies sigue siendo EXACTAMENTE las 5 actuales", () => {
    // Nota: si alguna vez se añade una dependencia legítima, actualiza
    // esta lista a propósito (criterio "cero dependencias nuevas" del plan).
    const pkg = JSON.parse(leer("package.json"));
    expect(Object.keys(pkg.devDependencies).sort()).toEqual([
      "@eslint/js",
      "eslint",
      "globals",
      "jsdom",
      "vitest",
    ]);
    expect(pkg.scripts.iconos).toBe("node scripts/generar-iconos.mjs");
    // npm test no ejecuta el generador de iconos (queda fuera de la CI).
    expect(pkg.scripts.test).toBe("vitest run");
  });

  it("ci.yml sigue siendo solo lint + test y no invoca generar-iconos", () => {
    const ci = leer(".github/workflows/ci.yml");
    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm test");
    expect(ci).not.toContain("generar-iconos");
    expect(ci).not.toContain("npm run iconos");
  });
});
