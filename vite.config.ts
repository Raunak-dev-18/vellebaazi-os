import { defineConfig, loadEnv } from "vite";
import type { PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import express from "express";
import type { Request, Response } from "express";
import multer from "multer";

const createStorageProxy = (env: Record<string, string>) => {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  const STORAGE_BASE_URL =
    env.STORAGE_API_BASE_URL ||
    process.env.STORAGE_API_BASE_URL ||
    "https://storageapis.r8dev.qzz.io/v2";
  const STORAGE_TOKEN = env.STORAGE_API_TOKEN || process.env.STORAGE_API_TOKEN;
  const STORAGE_BUCKET_ID =
    env.STORAGE_BUCKET_ID || process.env.STORAGE_BUCKET_ID;

  const assertConfigured = (res: Response) => {
    if (!STORAGE_TOKEN || !STORAGE_BUCKET_ID) {
      console.error(
        "Storage proxy misconfigured: missing STORAGE_API_TOKEN or STORAGE_BUCKET_ID.",
      );
      res.status(500).json({
        error:
          "Storage is not configured. Please set STORAGE_API_TOKEN and STORAGE_BUCKET_ID.",
      });
      return false;
    }
    return true;
  };

  app.use(express.json({ limit: "1mb" }));

  app.post(
    "/api/storage/upload",
    upload.single("file"),
    async (req: Request, res: Response) => {
      if (!assertConfigured(res)) return;

      if (!req.file) {
        res.status(400).json({ error: "Missing file." });
        return;
      }

      const fileName = req.body?.fileName || req.file.originalname;
      const formData = new FormData();
      formData.append("folder_name", STORAGE_BUCKET_ID as string);
      const blob = new Blob([req.file.buffer], {
        type: req.file.mimetype || "application/octet-stream",
      });
      formData.append("file", blob, fileName);

      try {
        const response = await fetch(`${STORAGE_BASE_URL}/upload-content`, {
          method: "POST",
          headers: { Authorization: `Bearer ${STORAGE_TOKEN}` },
          body: formData,
        });

        if (!response.ok) {
          const message = await response.text().catch(() => "");
          console.error("Storage upload failed:", response.status, message);
          res.status(response.status).json({
            error: message || "Upload failed.",
          });
          return;
        }

        const data = await response.json();
        res.status(200).json(data);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Upload failed.";
        console.error("Storage upload error:", message);
        res.status(500).json({ error: message });
      }
    },
  );

  app.post("/api/storage/delete", async (req: Request, res: Response) => {
    if (!assertConfigured(res)) return;

    const fileLink = req.body?.file_link || req.body?.fileLink;
    if (!fileLink) {
      res.status(400).json({ error: "Missing file link." });
      return;
    }

    try {
      const response = await fetch(`${STORAGE_BASE_URL}/delete-content`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${STORAGE_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          folder_name: STORAGE_BUCKET_ID,
          file_link: fileLink,
        }),
      });

      if (!response.ok) {
        const message = await response.text().catch(() => "");
        console.error("Storage delete failed:", response.status, message);
        res.status(response.status).json({
          error: message || "Delete failed.",
        });
        return;
      }

      res.status(200).json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Delete failed.";
      console.error("Storage delete error:", message);
      res.status(500).json({ error: message });
    }
  });

  return app;
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  Object.assign(process.env, env);

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      {
        name: "storage-proxy",
        configureServer(server: ViteDevServer) {
          server.middlewares.use(createStorageProxy(env));
        },
        configurePreviewServer(server: PreviewServer) {
          server.middlewares.use(createStorageProxy(env));
        },
      },
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("firebase")) return "firebase";
            if (id.includes("react-markdown") || id.includes("remark-gfm"))
              return "markdown";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("@tanstack")) return "react-query";
            if (id.includes("react-router")) return "router";
            return "vendor";
          },
        },
      },
    },
  };
});
