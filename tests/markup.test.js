// @vitest-environment jsdom
// Integración con el index.html REAL (no el fixture de tests/setup.js):
// valida que game.js arranca contra el markup de producción y que todos los
// ids que consulta existen. Si alguien renombra un id, esto falla aquí y no
// en el navegador.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function leer(ruta) {
  return readFileSync(fileURLToPath(new URL(ruta, import.meta.url)), "utf8");
}

const html = leer("../index.html");
const cuerpo = html
  .match(/<body>([\s\S]*)<\/body>/)[1]
  .replace(/<script[^>]*>[\s\S]*?<\/script>/, "");

// El DOM real debe estar montado ANTES de importar game.js.
document.body.innerHTML = cuerpo;

const juego = await import("../game.js");

function textosCeldas() {
  return [...document.getElementById("board").children]
    .filter(c => c.textContent !== "")
    .map(c => c.textContent);
}

describe("index.html real + game.js", () => {
  it("arranca: bienvenida visible, tablero con 2 fichas y contadores inicializados", () => {
    expect(typeof juego.mover).toBe("function");
    expect(typeof juego.deshacer).toBe("function");
    expect(document.getElementById("welcome").hidden).toBe(false);
    expect(document.getElementById("overlay").hidden).toBe(true);
    expect(textosCeldas()).toEqual(["2", "2"]);
    expect(document.getElementById("score").textContent).toBe("0");
    expect(document.getElementById("undo-count").textContent).toBe("3");
    expect(document.getElementById("bomb-count").textContent).toBe("1");
  });

  it("con la bienvenida visible, el teclado no mueve (bug P1 contra markup real)", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true, bubbles: true }));
    expect(textosCeldas()).toEqual(["2", "2"]);
    expect(document.getElementById("score").textContent).toBe("0");
  });

  it("cerrar la bienvenida y jugar funciona contra el markup real", async () => {
    document.getElementById("welcome-close").click();
    await new Promise(resolve => setTimeout(resolve, 260));
    expect(document.getElementById("welcome").hidden).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", cancelable: true, bubbles: true }));

    expect(textosCeldas()).toEqual(["4", "2"]);
    expect(document.getElementById("score").textContent).toBe("4");
  });

  it("todos los ids que consulta game.js existen en index.html", () => {
    const fuente = leer("../game.js");
    const idsUsados = [...fuente.matchAll(/getElementById\("([^"]+)"\)/g)].map(m => m[1]);
    const idsExistentes = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);

    expect(idsUsados.length).toBeGreaterThan(10);
    for (const id of idsUsados) {
      expect(idsExistentes, `falta id="${id}" en index.html`).toContain(id);
    }
  });

  it("metadatos y accesibilidad presentes en el markup real", () => {
    expect(html).toContain('<script type="module" src="game.js">');
    expect(html).toContain('name="description"');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');

    expect(document.querySelectorAll('[role="dialog"]').length).toBe(2);
    expect(document.querySelectorAll('[aria-modal="true"]').length).toBe(2);
    expect(document.getElementById("score").getAttribute("aria-live")).toBe("polite");
    expect(document.getElementById("board").getAttribute("tabindex")).toBe("-1");
  });
});
