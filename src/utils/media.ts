export const isSupabaseStorageUrl = (url?: string | null) => {
  if (!url) return false;
  return url.includes("supabase.co/storage");
};

export const getSafeAvatarUrl = (
  url: string | null | undefined,
  seed: string,
) => {
  if (!url || isSupabaseStorageUrl(url)) {
    return `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  }
  return url;
};
