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
    files: ["tests/**/*.js", "scripts/**/*.mjs", "*.config.js", "eslint.config.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
];
