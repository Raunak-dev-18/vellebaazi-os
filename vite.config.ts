import { defineConfig, loadEnv } from "vite";
import type { PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import express from "express";
import type { Request, Response } from "express";
import multer from "multer";

const getErrorDetails = (error: unknown): string => {
  if (!(error instanceof Error)) return String(error);
  let msg = error.message;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause) {
    msg += ` | cause: ${cause instanceof Error ? cause.message : String(cause)}`;
  }
  return msg;
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const decodeHtmlEntities = (value: string) =>
  value
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (full, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower === "amp") return "&";
      if (lower === "lt") return "<";
      if (lower === "gt") return ">";
      if (lower === "quot") return '"';
      if (lower === "apos" || lower === "#39") return "'";
      if (lower.startsWith("#x")) {
        const code = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(code) ? String.fromCharCode(code) : full;
      }
      if (lower.startsWith("#")) {
        const code = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(code) ? String.fromCharCode(code) : full;
      }
      return full;
    })
    .trim();

const extractMetaTagContent = (html: string, key: string) => {
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  return "";
};

const extractTagInnerText = (html: string, tagName: string) => {
  const escaped = escapeRegex(tagName);
  const pattern = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, "i");
  const match = html.match(pattern);
  if (!match?.[1]) return "";
  return decodeHtmlEntities(match[1].replace(/\s+/g, " "));
};

const extractLinkHref = (html: string, relContains: string) => {
  const escaped = escapeRegex(relContains);
  const patterns = [
    new RegExp(
      `<link[^>]+rel=["'][^"']*${escaped}[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<link[^>]+href=["']([^"']+)["'][^>]*rel=["'][^"']*${escaped}[^"']*["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtmlEntities(match[1]);
  }

  return "";
};

const toAbsoluteUrl = (value: string, base: string) => {
  if (!value) return "";
  try {
    return new URL(value, base).toString();
  } catch {
    return "";
  }
};

const isDisallowedPreviewHost = (hostname: string) => {
  const host = hostname.toLowerCase();
  if (!host) return true;

  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }

  const ipv4Match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const nums = ipv4Match.slice(1).map((entry) => Number(entry));
    if (nums.some((entry) => Number.isNaN(entry) || entry < 0 || entry > 255)) return true;
    if (nums[0] === 10 || nums[0] === 127) return true;
    if (nums[0] === 192 && nums[1] === 168) return true;
    if (nums[0] === 172 && nums[1] >= 16 && nums[1] <= 31) return true;
    if (nums[0] === 169 && nums[1] === 254) return true;
  }

  if (host.includes(":") && (host.startsWith("fc") || host.startsWith("fd") || host === "::1")) {
    return true;
  }

  return false;
};

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

  console.log(
    `[storage-proxy] BASE_URL=${STORAGE_BASE_URL} TOKEN=${STORAGE_TOKEN ? "SET" : "MISSING"} BUCKET=${STORAGE_BUCKET_ID || "MISSING"}`,
  );

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

  app.get("/api/link-preview", async (req: Request, res: Response) => {
    const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      res.status(400).json({ error: "Missing url query parameter." });
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl.trim());
    } catch {
      res.status(400).json({ error: "Invalid URL." });
      return;
    }

    if (!targetUrl.protocol || !["http:", "https:"].includes(targetUrl.protocol)) {
      res.status(400).json({ error: "Only http/https URLs are supported." });
      return;
    }

    if (isDisallowedPreviewHost(targetUrl.hostname)) {
      res.status(400).json({ error: "Preview blocked for local/private URLs." });
      return;
    }

    try {
      const response = await fetch(targetUrl.toString(), {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "VelleBaaziLinkPreview/1.0",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (!response.ok) {
        res.status(502).json({ error: `Unable to fetch URL (${response.status}).` });
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("text/html")) {
        res.status(200).json({
          url: targetUrl.toString(),
          canonicalUrl: targetUrl.toString(),
          siteName: targetUrl.hostname.replace(/^www\./, ""),
          title: targetUrl.hostname.replace(/^www\./, ""),
          description: "",
          image: null,
          favicon: `${targetUrl.origin}/favicon.ico`,
        });
        return;
      }

      const html = (await response.text()).slice(0, 300000);

      const ogTitle = extractMetaTagContent(html, "og:title");
      const ogDescription = extractMetaTagContent(html, "og:description");
      const ogImage = extractMetaTagContent(html, "og:image");
      const ogSiteName = extractMetaTagContent(html, "og:site_name");
      const ogUrl = extractMetaTagContent(html, "og:url");
      const twitterTitle = extractMetaTagContent(html, "twitter:title");
      const twitterDescription = extractMetaTagContent(html, "twitter:description");
      const twitterImage = extractMetaTagContent(html, "twitter:image");
      const metaDescription = extractMetaTagContent(html, "description");
      const canonicalHref = extractLinkHref(html, "canonical");
      const pageTitle = extractTagInnerText(html, "title");
      const faviconHref = extractLinkHref(html, "icon");

      const resolvedCanonical =
        toAbsoluteUrl(ogUrl, targetUrl.toString()) ||
        toAbsoluteUrl(canonicalHref, targetUrl.toString()) ||
        targetUrl.toString();

      const resolvedImage =
        toAbsoluteUrl(ogImage, targetUrl.toString()) ||
        toAbsoluteUrl(twitterImage, targetUrl.toString()) ||
        null;

      const resolvedFavicon =
        toAbsoluteUrl(faviconHref, targetUrl.toString()) || `${targetUrl.origin}/favicon.ico`;

      const siteName = (ogSiteName || targetUrl.hostname).replace(/^www\./, "");
      const title =
        ogTitle || twitterTitle || pageTitle || siteName || targetUrl.hostname.replace(/^www\./, "");
      const description = ogDescription || twitterDescription || metaDescription || "";

      res.status(200).json({
        url: targetUrl.toString(),
        canonicalUrl: resolvedCanonical,
        siteName,
        title,
        description,
        image: resolvedImage,
        favicon: resolvedFavicon,
      });
    } catch (error) {
      const details = getErrorDetails(error);
      console.error("Link preview fetch failed:", details);
      res.status(502).json({ error: "Failed to fetch link preview." });
    }
  });

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
      console.log(
        `[storage-proxy] Upload request: file="${fileName}" size=${req.file.size} type=${req.file.mimetype}`,
      );

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
        console.log("[storage-proxy] Upload success:", JSON.stringify(data));
        res.status(200).json(data);
      } catch (error) {
        const details = getErrorDetails(error);
        console.error("Storage upload error:", details);
        console.error("Full error:", error);
        res.status(500).json({ error: details });
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
      allowedHosts: ["vellebaazi.raunakdev.me"],
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
