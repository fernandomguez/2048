import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  {
    // Código del navegador (juego): globals de browser.
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser },
    },
  },
  {
    // Tests, scripts de desarrollo y configs: browser (jsdom) + node.
    files: ["tests/**/*.js", "tools/**/*.mjs", "*.config.js", "eslint.config.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Service worker (sw.js): globals del entorno SW (self, clients,
    // caches, skipWaiting, registration). Se declara COMPLETO a propósito:
    // si un bloque posterior sustituye `globals` en vez de fusionarlo, no
    // se pierde `browser`. Sin este bloque, sw.js pone lint (y la CI) roja.
    files: ["sw.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
];
