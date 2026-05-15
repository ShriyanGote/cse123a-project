const expoConfig = require("eslint-config-expo/flat");
const { defineConfig, globalIgnores } = require("eslint/config");
const globals = require("globals");

module.exports = defineConfig([
  globalIgnores(["coverage/**", "ios/**", "node_modules/**"]),
  expoConfig,
  {
    files: ["**/*.test.js"],
    languageOptions: {
      globals: globals.jest,
    },
  },
]);
