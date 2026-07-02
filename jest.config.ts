import type { Config } from "jest";

const config: Config = {
  preset:              "ts-jest",
  testEnvironment:     "node",
  roots:               ["<rootDir>/src"],
  testMatch:           ["**/__tests__/**/*.test.ts"],
  moduleFileExtensions:["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "<rootDir>/tsconfig.json" }],
  },
  // Variables d'environnement injectées pour tous les tests
  setupFiles: ["<rootDir>/src/__tests__/setup.ts"],
  coverageDirectory:  "coverage",
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/__tests__/**",
    "!src/index.ts",   // point d'entrée, testé via supertest
    "!src/seed.ts",
  ],
  coverageThresholds: {
    global: { lines: 60, functions: 60 },
  },
};

export default config;