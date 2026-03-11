import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || "10000";
const viteCliPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../node_modules/vite/bin/vite.js",
);

const child = spawn(
  process.execPath,
  [viteCliPath, "preview", "--host", host, "--port", port],
  {
    stdio: "inherit",
    env: process.env,
  },
);

child.on("error", (error) => {
  console.error("Failed to start Vite preview server:", error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
