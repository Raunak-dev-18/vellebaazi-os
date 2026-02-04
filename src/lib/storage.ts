const STORAGE_BASE_URL =
  import.meta.env.VITE_STORAGE_API_BASE_URL ||
  "https://storageapis.skyflare.sh/v2";
const STORAGE_TOKEN = import.meta.env.VITE_STORAGE_API_TOKEN;
const STORAGE_BUCKET_ID =
  import.meta.env.VITE_STORAGE_BUCKET_ID || import.meta.env.VITE_BUCKET_ID;

const assertConfigured = () => {
  if (!STORAGE_TOKEN || !STORAGE_BUCKET_ID) {
    throw new Error(
      "Storage is not configured. Please set VITE_STORAGE_API_TOKEN and VITE_STORAGE_BUCKET_ID.",
    );
  }
};

const uploadFile = async (file: File, fileName: string) => {
  assertConfigured();

  const formData = new FormData();
  formData.append("folder_name", STORAGE_BUCKET_ID as string);
  const renamedFile = new File([file], fileName, { type: file.type });
  formData.append("file", renamedFile);

  const response = await fetch(`${STORAGE_BASE_URL}/upload-content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STORAGE_TOKEN}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(
      `Upload failed (${response.status}). ${message || "Please try again."}`,
    );
  }

  const data = await response.json();
  return data.file_link as string;
};

const deleteFile = async (fileLink: string) => {
  assertConfigured();

  if (!fileLink) return;

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
    throw new Error(
      `Delete failed (${response.status}). ${message || "Please try again."}`,
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
