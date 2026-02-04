import { Search, Video } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef, useCallback } from "react";
import { getDatabase, ref, get } from "firebase/database";

export default function Explore() {
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [allPostsData, setAllPostsData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayedCount, setDisplayedCount] = useState(12);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    const fetchPublicPosts = async () => {
      if (!user) return;

      try {
        const db = getDatabase();

        // Get all users to check privacy settings
        const usersRef = ref(db, "users");
        const usersSnapshot = await get(usersRef);
        const usersData = usersSnapshot.exists() ? usersSnapshot.val() : {};

        // Fetch all posts from Realtime Database
        const postsRef = ref(db, "posts");
        const postsSnapshot = await get(postsRef);

        let allPostsArray: any[] = [];

        if (postsSnapshot.exists()) {
          const allPosts = postsSnapshot.val();
          allPostsArray = Object.entries(allPosts)
            .map(([id, post]: [string, any]) => ({
              id,
              ...post,
            }))
            .sort((a: any, b: any) => b.createdAt - a.createdAt);
        }

        const isVideoPost = (post: any) => {
          if (post.mediaType === "video" || post.postType === "reel")
            return true;
          const mediaUrl = (post.mediaUrl || "").toLowerCase();
          return /\.(mp4|mov|webm)$/.test(mediaUrl);
        };

        const isMediaUrlValid = (post: any) => {
          const mediaUrl = (post.mediaUrl || "").toString().trim();
          if (!mediaUrl) return false;
          if (mediaUrl.includes("supabase.co/storage")) return false;
          return true;
        };

        // Filter only public posts and remove videos from grid
        const publicPosts = allPostsArray.filter((post: any) => {
          const postUserId = post.userId;
          const userData = usersData[postUserId];
          const isPrivate = userData?.accountPrivacy === "private";

          // Show only public posts
          return !isPrivate && !isVideoPost(post) && isMediaUrlValid(post);
        });

        setAllPostsData(publicPosts);
        setHasMorePosts(publicPosts.length > displayedCount);
        setPosts(publicPosts.slice(0, displayedCount));
      } catch (error) {
        console.error("Error fetching public posts:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchPublicPosts();
  }, [user]);

  // Update displayed posts when count changes
  useEffect(() => {
    if (allPostsData.length === 0) return;
    setHasMorePosts(allPostsData.length > displayedCount);
    setPosts(allPostsData.slice(0, displayedCount));
  }, [displayedCount, allPostsData]);

  const loadMorePosts = useCallback(() => {
    if (isLoadingMore || !hasMorePosts) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayedCount((prev) => prev + 12);
      setIsLoadingMore(false);
    }, 200);
  }, [isLoadingMore, hasMorePosts]);

  // Infinite scroll observer
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (isLoadingMore) return;
      if (observerRef.current) observerRef.current.disconnect();

      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasMorePosts) {
          loadMorePosts();
        }
      });

      if (node) observerRef.current.observe(node);
    },
    [isLoadingMore, hasMorePosts, loadMorePosts],
  );

  return (
    <div className="min-h-screen">
      {/* Search Bar */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-4">
        <div className="max-w-6xl mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search"
              className="pl-10 bg-secondary border-0 rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <div className="border-b border-border">
          <TabsList className="w-full max-w-6xl mx-auto h-12 bg-transparent rounded-none px-4">
            <TabsTrigger
              value="all"
              className="data-[state=active]:border-b-2 data-[state=active]:border-b-foreground rounded-none"
            >
              All
            </TabsTrigger>
            <TabsTrigger
              value="reels"
              className="data-[state=active]:border-b-2 data-[state=active]:border-b-foreground rounded-none"
            >
              Timepass
            </TabsTrigger>
            <TabsTrigger
              value="igtv"
              className="data-[state=active]:border-b-2 data-[state=active]:border-b-foreground rounded-none"
            >
              Videos
            </TabsTrigger>
            <TabsTrigger
              value="shop"
              className="data-[state=active]:border-b-2 data-[state=active]:border-b-foreground rounded-none"
            >
              Shop
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="mt-0 max-w-6xl mx-auto">
          {loading ? (
            <div className="grid grid-cols-3 gap-1 p-1">
              {[...Array(12)].map((_, i) => (
                <div key={i} className="aspect-square bg-muted animate-pulse" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              <p className="text-lg font-semibold mb-2">No Public Posts Yet</p>
              <p className="text-sm">Check back later for new content</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1 p-1">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="aspect-square bg-muted hover:opacity-80 cursor-pointer transition-opacity relative group"
                  >
                    {post.mediaType === "video" ? (
                      <video
                        src={post.mediaUrl}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={post.mediaUrl}
                        alt={post.caption || "Post"}
                        className="w-full h-full object-cover"
                      />
                    )}
                    {post.mediaType === "video" && (
                      <div className="absolute top-2 right-2">
                        <Video className="h-5 w-5 text-white drop-shadow-lg" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-6 text-white font-semibold">
                      <span>❤️ {post.likes || 0}</span>
                      <span>💬 {post.comments || 0}</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Infinite scroll trigger */}
              <div ref={loadMoreRef} className="h-4" />
              {isLoadingMore && (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="reels" className="mt-0">
          <div className="py-20 text-center text-muted-foreground max-w-6xl mx-auto">
            <p>Reels content coming soon</p>
          </div>
        </TabsContent>

        <TabsContent value="igtv" className="mt-0">
          <div className="py-20 text-center text-muted-foreground max-w-6xl mx-auto">
            <p>Videos content coming soon</p>
          </div>
        </TabsContent>

        <TabsContent value="shop" className="mt-0">
          <div className="py-20 text-center text-muted-foreground max-w-6xl mx-auto">
            <p>Shop content coming soon</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
