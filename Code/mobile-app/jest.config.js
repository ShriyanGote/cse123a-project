/** @type {import("jest").Config} */
module.exports = {
  preset: "jest-expo",
  testMatch: ["**/*.test.js"],
  collectCoverageFrom: [
    "App.js",
    "src/**/*.{js,jsx}",
    "!**/*.test.js",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "text-summary", "lcov"],
};
