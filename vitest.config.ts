import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["packages/panel-ui/**/*.test.tsx"],
        },
      },
    ],
  },
});
