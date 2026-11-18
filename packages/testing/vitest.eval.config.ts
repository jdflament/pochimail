import { defineConfig } from "vitest/config";

// The eval gate is a separate entry point (`pnpm eval`), not part of the unit test run.
export default defineConfig({ test: { include: ["src/eval/eval-gate.ts"], testTimeout: 120_000 } });
