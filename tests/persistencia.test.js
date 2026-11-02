// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import * as juego from "../app/game.js";

function stats() {
  const crudo = localStorage.getItem("stats2048");
  return crudo ? JSON.parse(crudo) : null;
}

beforeEach(() => {
  document.getElementById("welcome").hidden = true;
  juego.nuevaPartida();
  // OJO: no se limpia localStorage aquí. El módulo ya cargó "best" al importar
  // (0, porque el almacén de este archivo de test arranca vacío) y los tests de
  // este archivo comparten esa memoria. Van en orden deliberado.
});

describe("persistencia del récord", () => {
  it("al superar el récord se guarda en localStorage y se refleja en el marcador", () => {
    expect(stats()).toBeNull(); // arranca sin nada guardado

    juego.mover("left"); // fusiona 2+2 → 4 puntos > récord 0

    expect(stats().record).toBe(4);
    expect(document.getElementById("best").textContent).toBe("4");
    expect(document.getElementById("score").textContent).toBe("4");
  });

  it("una nueva partida no borra el récord guardado", () => {
    document.getElementById("new-game").click();

    expect(stats().record).toBe(4);
    expect(document.getElementById("best").textContent).toBe("4");
    expect(document.getElementById("score").textContent).toBe("0");
  });

  it("una puntuación igual o menor no sobrescribe el récord", () => {
    juego.mover("left"); // 4 puntos, igual al récord actual

    expect(stats().record).toBe(4);
    expect(document.getElementById("best").textContent).toBe("4");
  });
});

describe("persistencia del tema", () => {
  it("alternar el tema cambia data-theme, el icono y guarda la elección", () => {
    // Arranca en tema claro (matchMedia del setup devuelve matches: false).
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.getElementById("theme-icon").textContent).toBe("🌙");

    document.getElementById("theme-toggle").click();

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.getElementById("theme-icon").textContent).toBe("☀️");
    expect(stats().tema).toBe("dark");
    expect(stats().record).toBe(4); // no pisa el récord al guardar el tema
  });
});
