import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const viteCliPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../node_modules/vite/bin/vite.js",
);

const args = process.argv.slice(2);
const env = {
  ...process.env,
  NODE_ENV: "development",
};

const child = spawn(process.execPath, [viteCliPath, ...args], {
  stdio: "inherit",
  env,
});

child.on("error", (error) => {
  console.error("Failed to start Vite dev server:", error);
  process.exit(1);
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
