import { defineConfig, loadEnv } from "vite";
import type { PreviewServer, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";

const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

interface LinkPreviewPayload {
  url: string;
  canonicalUrl: string;
  siteName: string;
  title: string;
  description: string;
  image: string | null;
  favicon: string;
}

interface LinkPreviewCacheEntry {
  expiresAt: number;
  payload: LinkPreviewPayload;
}

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

const getRequestIp = (req: Request) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
};

const createIpRateLimiter = ({
  maxRequests,
  windowMs,
}: {
  maxRequests: number;
  windowMs: number;
}) => {
  const hits = new Map<string, { windowStart: number; count: number }>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const ip = getRequestIp(req);
    const entry = hits.get(ip);

    if (!entry || now - entry.windowStart > windowMs) {
      hits.set(ip, { windowStart: now, count: 1 });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      res.status(429).json({ error: "Too many requests. Please retry in a minute." });
      return;
    }

    entry.count += 1;
    hits.set(ip, entry);
    next();
  };
};

const fetchWithTimeout = async (url: string, timeoutMs: number, init: RequestInit = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
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

  if (
    host.includes(":") &&
    (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80") || host === "::1")
  ) {
    return true;
  }

  return false;
};

const assertPreviewUrlAllowed = (candidate: URL) => {
  if (!["http:", "https:"].includes(candidate.protocol)) {
    throw new Error("Only http/https URLs are supported.");
  }
  if (candidate.username || candidate.password) {
    throw new Error("URLs with embedded credentials are blocked.");
  }
  if (isDisallowedPreviewHost(candidate.hostname)) {
    throw new Error("Preview blocked for local/private URLs.");
  }
};

const fetchPreviewResponse = async (
  startUrl: URL,
  timeoutMs: number,
  maxRedirects = 3,
): Promise<{ response: globalThis.Response; finalUrl: URL }> => {
  let current = new URL(startUrl.toString());

  for (let i = 0; i <= maxRedirects; i += 1) {
    assertPreviewUrlAllowed(current);

    const response = await fetchWithTimeout(current.toString(), timeoutMs, {
      method: "GET",
      redirect: "manual",
      headers: {
        "User-Agent": "VelleBaaziLinkPreview/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    if (!REDIRECT_STATUS_CODES.has(response.status)) {
      return { response, finalUrl: current };
    }

    const location = response.headers.get("location");
    if (!location) {
      return { response, finalUrl: current };
    }

    current = new URL(location, current);
  }

  throw new Error("Too many redirects while fetching link preview.");
};

const createStorageProxy = (env: Record<string, string>) => {
  const app = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  });
  const previewRateLimiter = createIpRateLimiter({ maxRequests: 45, windowMs: 60_000 });
  const previewCache = new Map<string, LinkPreviewCacheEntry>();

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
  app.use("/api/link-preview", previewRateLimiter);

  app.get("/api/link-preview", async (req: Request, res: Response) => {
    const rawUrl = Array.isArray(req.query.url) ? req.query.url[0] : req.query.url;
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      res.status(400).json({ error: "Missing url query parameter." });
      return;
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(rawUrl.trim());
      assertPreviewUrlAllowed(targetUrl);
    } catch (error) {
      res.status(400).json({ error: getErrorDetails(error) });
      return;
    }

    const cacheKey = targetUrl.toString();
    const cached = previewCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      res.set("Cache-Control", "public, max-age=600");
      res.status(200).json(cached.payload);
      return;
    }

    if (cached) {
      previewCache.delete(cacheKey);
    }

    try {
      const { response, finalUrl } = await fetchPreviewResponse(targetUrl, 6000, 3);

      if (!response.ok) {
        res.status(502).json({ error: `Unable to fetch URL (${response.status}).` });
        return;
      }

      const contentLength = Number(response.headers.get("content-length") || "0");
      if (Number.isFinite(contentLength) && contentLength > 1_500_000) {
        res.status(413).json({ error: "Preview page is too large." });
        return;
      }

      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/html")) {
        const payload: LinkPreviewPayload = {
          url: finalUrl.toString(),
          canonicalUrl: finalUrl.toString(),
          siteName: finalUrl.hostname.replace(/^www\./, ""),
          title: finalUrl.hostname.replace(/^www\./, ""),
          description: "",
          image: null,
          favicon: `${finalUrl.origin}/favicon.ico`,
        };
        previewCache.set(cacheKey, { payload, expiresAt: Date.now() + 10 * 60_000 });
        res.set("Cache-Control", "public, max-age=600");
        res.status(200).json(payload);
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
        toAbsoluteUrl(ogUrl, finalUrl.toString()) ||
        toAbsoluteUrl(canonicalHref, finalUrl.toString()) ||
        finalUrl.toString();

      const resolvedImage =
        toAbsoluteUrl(ogImage, finalUrl.toString()) ||
        toAbsoluteUrl(twitterImage, finalUrl.toString()) ||
        null;

      const resolvedFavicon =
        toAbsoluteUrl(faviconHref, finalUrl.toString()) || `${finalUrl.origin}/favicon.ico`;

      const siteName = (ogSiteName || finalUrl.hostname).replace(/^www\./, "");
      const title =
        ogTitle || twitterTitle || pageTitle || siteName || finalUrl.hostname.replace(/^www\./, "");
      const description = ogDescription || twitterDescription || metaDescription || "";

      const payload: LinkPreviewPayload = {
        url: finalUrl.toString(),
        canonicalUrl: resolvedCanonical,
        siteName,
        title,
        description,
        image: resolvedImage,
        favicon: resolvedFavicon,
      };

      previewCache.set(cacheKey, { payload, expiresAt: Date.now() + 10 * 60_000 });
      res.set("Cache-Control", "public, max-age=600");
      res.status(200).json(payload);
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
