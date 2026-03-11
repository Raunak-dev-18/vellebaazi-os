import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface GifPick {
  url: string;
  title: string;
}

interface GiphyGif {
  id: string;
  title: string;
  images: {
    fixed_height: {
      url: string;
      width: string;
      height: string;
    };
    original: {
      url: string;
    };
  };
}

interface GifPickerProps {
  apiKey?: string;
  onSelect: (gif: GifPick) => void;
  onClose: () => void;
}

type MediaPickerType = "gifs" | "stickers";

export function GifPicker({ apiKey, onSelect, onClose }: GifPickerProps) {
  const [gifs, setGifs] = useState<GiphyGif[]>([]);
  const [gifSearchQuery, setGifSearchQuery] = useState("");
  const [pickerType, setPickerType] = useState<MediaPickerType>("gifs");
  const [isLoadingGifs, setIsLoadingGifs] = useState(false);
  const [gifOffset, setGifOffset] = useState(0);
  const [hasMoreGifs, setHasMoreGifs] = useState(false);
  const [isLoadingMoreGifs, setIsLoadingMoreGifs] = useState(false);

  const apiReady = useMemo(() => Boolean(apiKey), [apiKey]);

  const fetchTrendingGifs = useCallback(
    async (loadMore = false) => {
      if (!apiKey) return;

      if (!loadMore) {
        setIsLoadingGifs(true);
      }

      try {
        const currentOffset = loadMore ? gifOffset : 0;
        const response = await fetch(
          `https://api.giphy.com/v1/${pickerType}/trending?api_key=${apiKey}&limit=20&offset=${currentOffset}&rating=g`,
        );
        const data = await response.json();
        const newGifs = data.data || [];

        if (loadMore && newGifs.length > 0) {
          setGifs((prev) => [...prev, ...newGifs]);
        } else if (!loadMore) {
          setGifs(newGifs);
        }
        setGifOffset(currentOffset + 20);
        setHasMoreGifs(newGifs.length === 20);
      } catch (error) {
        console.error("Error fetching trending GIFs:", error);
      } finally {
        setIsLoadingGifs(false);
      }
    },
    [apiKey, gifOffset, pickerType],
  );

  const searchGifs = useCallback(
    async (query: string, loadMore = false) => {
      if (!apiKey || !query.trim()) {
        fetchTrendingGifs(false);
        return;
      }

      if (!loadMore) {
        setIsLoadingGifs(true);
      }

      try {
        const currentOffset = loadMore ? gifOffset : 0;
        const response = await fetch(
          `https://api.giphy.com/v1/${pickerType}/search?api_key=${apiKey}&q=${encodeURIComponent(query)}&limit=20&offset=${currentOffset}&rating=g`,
        );
        const data = await response.json();
        const newGifs = data.data || [];

        if (loadMore && newGifs.length > 0) {
          setGifs((prev) => [...prev, ...newGifs]);
        } else if (!loadMore) {
          setGifs(newGifs);
        }
        setGifOffset(currentOffset + 20);
        setHasMoreGifs(newGifs.length === 20);
      } catch (error) {
        console.error("Error searching GIFs:", error);
      } finally {
        setIsLoadingGifs(false);
      }
    },
    [apiKey, fetchTrendingGifs, gifOffset, pickerType],
  );

  const loadMoreGifs = async () => {
    if (isLoadingGifs || isLoadingMoreGifs || !hasMoreGifs) return;

    setIsLoadingMoreGifs(true);
    try {
      if (gifSearchQuery.trim()) {
        await searchGifs(gifSearchQuery, true);
      } else {
        await fetchTrendingGifs(true);
      }
    } finally {
      setIsLoadingMoreGifs(false);
    }
  };

  useEffect(() => {
    if (!apiReady) return;
    fetchTrendingGifs(false);
  }, [apiReady, fetchTrendingGifs, pickerType]);

  useEffect(() => {
    if (!apiReady) return;
    const timer = setTimeout(() => {
      if (gifSearchQuery.trim()) {
        searchGifs(gifSearchQuery, false);
      } else {
        fetchTrendingGifs(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [apiReady, gifSearchQuery, fetchTrendingGifs, searchGifs]);

  return (
    <div className="absolute bottom-full left-4 mb-2 w-[320px] bg-background border border-border rounded-lg shadow-lg z-30 max-h-[300px] flex flex-col">
      <div className="p-2 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-sm">
            {pickerType === "gifs" ? "GIFs" : "Stickers"}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={
              pickerType === "gifs" ? "Search GIFs..." : "Search stickers..."
            }
            value={gifSearchQuery}
            onChange={(e) => setGifSearchQuery(e.target.value)}
            className="pl-8 h-8 text-sm bg-secondary border-0"
          />
        </div>
        <div className="mt-2 flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant={pickerType === "gifs" ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => {
              setPickerType("gifs");
              setGifOffset(0);
            }}
          >
            GIF
          </Button>
          <Button
            type="button"
            size="sm"
            variant={pickerType === "stickers" ? "default" : "outline"}
            className="h-7 px-2 text-xs"
            onClick={() => {
              setPickerType("stickers");
              setGifOffset(0);
            }}
          >
            Sticker
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {!apiReady ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <p>GIFs/Stickers are disabled until a Giphy key is configured.</p>
            </div>
        ) : isLoadingGifs ? (
          <div className="flex items-center justify-center py-6">
            <div className="h-6 w-6 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
          </div>
        ) : gifs.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <p>No results found</p>
            </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-1">
              {gifs.map((gif, index) => (
                <img
                  key={`${gif.id}-${index}`}
                  src={gif.images.fixed_height.url}
                  alt={gif.title}
                  className="w-full h-[80px] object-cover rounded cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() =>
                    onSelect({
                      url: gif.images.original.url,
                      title: gif.title || "GIF",
                    })
                  }
                  loading="lazy"
                />
              ))}
            </div>
            {hasMoreGifs && (
              <button
                onClick={loadMoreGifs}
                disabled={isLoadingMoreGifs}
                className="w-full py-2 text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center justify-center gap-2"
              >
                {isLoadingMoreGifs ? (
                  <>
                    <div className="h-3 w-3 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                    Loading...
                  </>
                ) : (
                  pickerType === "gifs" ? "Load More GIFs" : "Load More Stickers"
                )}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="p-1 border-t border-border text-center">
        <span className="text-[10px] text-muted-foreground">
          Powered by R8 GIF
        </span>
      </div>
    </div>
  );
}
