const DEFAULT_STORAGE_PROXY_BASE_URL = "/api/storage";
const STORAGE_PROXY_BASE_URL = (
  import.meta.env.VITE_STORAGE_PROXY_BASE_URL || DEFAULT_STORAGE_PROXY_BASE_URL
).replace(/\/+$/, "");

type StorageUploadResponse = {
  file_link?: string;
  fileLink?: string;
  message?: string;
  error?: string;
  data?: {
    file_link?: string;
    fileLink?: string;
  };
};

const getStorageServiceHint = (status: number) => {
  if (
    status === 404 &&
    STORAGE_PROXY_BASE_URL.startsWith("/") &&
    STORAGE_PROXY_BASE_URL === DEFAULT_STORAGE_PROXY_BASE_URL
  ) {
    return "Storage proxy route not found. Start the app with `npm run dev` or set `VITE_STORAGE_PROXY_BASE_URL` to your backend.";
  }

  if (status === 500) {
    return "Check storage server env vars: `STORAGE_API_TOKEN` and `STORAGE_BUCKET_ID`.";
  }

  return "";
};

const parseResponseMessage = async (response: Response) => {
  const text = await response.text().catch(() => "");
  if (!text) return "";

  try {
    const parsed = JSON.parse(text) as { error?: string; message?: string };
    return parsed.error || parsed.message || text;
  } catch {
    return text;
  }
};

const getFileLinkFromUploadResponse = (data: StorageUploadResponse) =>
  data.file_link ||
  data.fileLink ||
  data.data?.file_link ||
  data.data?.fileLink ||
  "";

const uploadFile = async (file: File, fileName: string) => {
  if (!file) {
    throw new Error("No file provided.");
  }

  const formData = new FormData();
  const renamedFile = new File([file], fileName || file.name, {
    type: file.type,
  });
  formData.append("file", renamedFile);
  if (fileName) {
    formData.append("fileName", fileName);
  }

  let response: Response;
  try {
    response = await fetch(`${STORAGE_PROXY_BASE_URL}/upload`, {
      method: "POST",
      body: formData,
    });
  } catch {
    throw new Error(
      "Could not connect to storage service. Check your internet and storage proxy configuration.",
    );
  }

  if (!response.ok) {
    const message = await parseResponseMessage(response);
    const hint = getStorageServiceHint(response.status);
    throw new Error(
      `Upload failed (${response.status}). ${message || "Please try again."}${hint ? ` ${hint}` : ""}`,
    );
  }

  const data = (await response.json()) as StorageUploadResponse;
  const fileLink = getFileLinkFromUploadResponse(data);
  if (!fileLink) {
    throw new Error(
      "Upload failed because no file URL was returned by storage service.",
    );
  }

  return fileLink;
};

const deleteFile = async (fileLink: string) => {
  if (!fileLink) return;

  let response: Response;
  try {
    response = await fetch(`${STORAGE_PROXY_BASE_URL}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        file_link: fileLink,
      }),
    });
  } catch {
    throw new Error(
      "Could not connect to storage service. Check your internet and storage proxy configuration.",
    );
  }

  if (!response.ok) {
    const message = await parseResponseMessage(response);
    const hint = getStorageServiceHint(response.status);
    throw new Error(
      `Delete failed (${response.status}). ${message || "Please try again."}${hint ? ` ${hint}` : ""}`,
    );
  }
};

// Public URL helpers (link is returned by the API)
export const getPublicUrl = (fileLink: string) => fileLink;
export const getChatPublicUrl = (fileLink: string) => fileLink;

// Upload helpers (kept same names to minimize code changes)
export const uploadToStorage = async (file: File, fileName: string) =>
  uploadFile(file, fileName);
export const uploadToChatStorage = async (file: File, fileName: string) =>
  uploadFile(file, fileName);

// Delete helpers (expects the full file link)
export const deleteFromStorage = async (fileLink: string) =>
  deleteFile(fileLink);
export const deleteFromChatStorage = async (fileLink: string) =>
  deleteFile(fileLink);
