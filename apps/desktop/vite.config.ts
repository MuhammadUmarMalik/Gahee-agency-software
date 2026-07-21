import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";

export default defineConfig({
  plugins: [react(), electron({
    main: {
      entry: "electron/main.ts",
      async onstart({ startup }) {
        const electronEnvironment = { ...process.env };
        delete electronEnvironment.ELECTRON_RUN_AS_NODE;
        await startup(["."], { env: electronEnvironment });
      },
      vite: {
        resolve: { alias: { "@oil-agency/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts") } },
        build: {
          rollupOptions: {
            external: [
              "better-sqlite3",
            ],
            output: {
              entryFileNames: "main.js",
            },
          },
        },
      },
    },
    preload: { input: "electron/preload.ts" },
  })],
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "@oil-agency/shared": path.resolve(__dirname, "../../packages/shared/src/index.ts") } },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
});
