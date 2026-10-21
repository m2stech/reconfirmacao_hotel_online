import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      // `server-only` lança erro fora do bundler do Next.js (que o resolve
      // como no-op em Server Components); em teste isso não se aplica.
      "server-only": path.resolve(__dirname, "src/lib/test/server-only-noop.ts"),
    },
  },
});
