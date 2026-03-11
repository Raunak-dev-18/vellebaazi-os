import express from "express";
import multer from "multer";

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

const STORAGE_BASE_URL =
  process.env.STORAGE_API_BASE_URL || "https://storageapis.r8dev.qzz.io/v2";
const STORAGE_TOKEN = process.env.STORAGE_API_TOKEN;
const STORAGE_BUCKET_ID = process.env.STORAGE_BUCKET_ID;

const assertConfigured = (res) => {
  if (!STORAGE_TOKEN || !STORAGE_BUCKET_ID) {
    res.status(500).json({
      error:
        "Storage is not configured. Please set STORAGE_API_TOKEN and STORAGE_BUCKET_ID.",
    });
    return false;
  }
  return true;
};

app.use(express.json({ limit: "1mb" }));

app.post("/api/storage/upload", upload.single("file"), async (req, res) => {
  if (!assertConfigured(res)) return;

  if (!req.file) {
    res.status(400).json({ error: "Missing file." });
    return;
  }

  const fileName = req.body?.fileName || req.file.originalname;
  const formData = new FormData();
  formData.append("folder_name", STORAGE_BUCKET_ID);

  const blob = new Blob([req.file.buffer], {
    type: req.file.mimetype || "application/octet-stream",
  });
  formData.append("file", blob, fileName);

  try {
    const response = await fetch(`${STORAGE_BASE_URL}/upload-content`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STORAGE_TOKEN}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const message = await response.text().catch(() => "");
      res
        .status(response.status)
        .json({ error: message || "Upload failed." });
      return;
    }

    const data = await response.json();
    res.status(200).json(data);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Upload failed.",
    });
  }
});

app.post("/api/storage/delete", async (req, res) => {
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
      res
        .status(response.status)
        .json({ error: message || "Delete failed." });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Delete failed.",
    });
  }
});

const port = Number(process.env.PORT) || 8787;
app.listen(port, () => {
  console.log(`Storage proxy listening on http://localhost:${port}`);
});
