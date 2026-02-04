import { PostCard } from "@/components/PostCard";
import { Stories } from "@/components/Stories";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef, useCallback } from "react";
import { getDatabase, ref, get, set, push, remove } from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import { getSafeAvatarUrl } from "@/utils/media";

interface SuggestedUser {
  uid: string;
  username: string;
  email: string;
  avatar?: string;
  isFollowing?: boolean;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<any[]>([]);
  const [allPostsData, setAllPostsData] = useState<any[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [displayedCount, setDisplayedCount] = useState(5);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user) return;

      try {
        const db = getDatabase();

        // Fetch following list
        const followingRef = ref(db, `following/${user.uid}`);
        const followingSnapshot = await get(followingRef);
        const followingSet = new Set<string>();

        if (followingSnapshot.exists()) {
          const followingData = followingSnapshot.val();
          Object.keys(followingData).forEach((uid) => followingSet.add(uid));
        }
        setFollowingUsers(followingSet);

        // Fetch users
        const usersRef = ref(db, "users");
        const snapshot = await get(usersRef);

        if (snapshot.exists()) {
          const usersData = snapshot.val();

          const usersArray: SuggestedUser[] = Object.entries(usersData)
            .filter(([uid]) => uid !== user.uid && !followingSet.has(uid)) // Exclude current user and already following
            .map(([uid, data]: [string, any]) => ({
              uid,
              username: data.username || data.email?.split("@")[0] || "user",
              email: data.email,
              avatar:
                data.photoURL ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.username || uid}`,
              isFollowing: false,
            }))
            .slice(0, 5); // Show only 5 users

          setSuggestedUsers(usersArray);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();
  }, [user]);

  useEffect(() => {
    const fetchPosts = async () => {
      if (!user) return;

      try {
        const db = getDatabase();

        // Get following list
        const followingRef = ref(db, `following/${user.uid}`);
        const followingSnapshot = await get(followingRef);
        const followingIds: string[] = [user.uid]; // Include own posts

        if (followingSnapshot.exists()) {
          const followingData = followingSnapshot.val();
          followingIds.push(...Object.keys(followingData));
        }

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
            .sort((a: any, b: any) => b.createdAt - a.createdAt)
            .slice(0, 50); // Limit to 50 posts
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

        // Filter posts based on privacy and remove videos from feed
        const postsData = allPostsArray.filter((post: any) => {
          const postUserId = post.userId;
          const userData = usersData[postUserId];
          const isPrivate = userData?.accountPrivacy === "private";

          const canSeePost =
            postUserId === user.uid ||
            followingIds.includes(postUserId) ||
            !isPrivate;
          return canSeePost && !isVideoPost(post) && isMediaUrlValid(post);
        });
        setAllPostsData(postsData);
        setHasMorePosts(postsData.length > displayedCount);
        setPosts(postsData.slice(0, displayedCount));
      } catch (error) {
        console.error("Error fetching posts:", error);
        toast({
          title: "Error Loading Posts",
          description:
            "Could not load posts. Please check if Firestore is enabled.",
          variant: "destructive",
        });
      } finally {
        setLoadingPosts(false);
      }
    };

    fetchPosts();
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
      setDisplayedCount((prev) => prev + 5);
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

  const handleFollow = async (targetUser: SuggestedUser) => {
    if (!user) return;

    // Prevent self-follow
    if (user.uid === targetUser.uid) {
      toast({
        title: "Error",
        description: "You cannot follow yourself",
        variant: "destructive",
      });
      return;
    }

    try {
      const db = getDatabase();
      const currentUsername =
        user.displayName || user.email?.split("@")[0] || "user";

      // Check if already following
      const followingRef = ref(db, `following/${user.uid}/${targetUser.uid}`);
      const followingSnapshot = await get(followingRef);

      if (followingSnapshot.exists()) {
        toast({
          title: "Already Following",
          description: `You are already following ${targetUser.username}`,
        });
        return;
      }

      // Check if account is private
      const targetUserRef = ref(db, `users/${targetUser.uid}`);
      const targetUserSnapshot = await get(targetUserRef);
      const isPrivateAccount =
        targetUserSnapshot.exists() &&
        targetUserSnapshot.val().accountPrivacy === "private";

      if (isPrivateAccount) {
        // Send follow request for private account
        const followRequestRef = push(
          ref(db, `followRequests/${targetUser.uid}`),
        );
        await set(followRequestRef, {
          fromUserId: user.uid,
          fromUsername: currentUsername,
          fromAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}`,
          timestamp: new Date().toISOString(),
          status: "pending",
        });

        // Create notification
        const notificationRef = push(
          ref(db, `notifications/${targetUser.uid}`),
        );
        await set(notificationRef, {
          type: "follow_request",
          fromUserId: user.uid,
          fromUsername: currentUsername,
          fromAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}`,
          timestamp: new Date().toISOString(),
          read: false,
        });

        // Update local state
        setSuggestedUsers((prev) =>
          prev.filter((u) => u.uid !== targetUser.uid),
        );

        toast({
          title: "Follow Request Sent",
          description: `Your follow request has been sent to ${targetUser.username}`,
        });
      } else {
        // Public account - follow immediately
        // Add to following list
        await set(ref(db, `following/${user.uid}/${targetUser.uid}`), {
          username: targetUser.username,
          timestamp: new Date().toISOString(),
        });

        // Add to followers list
        await set(ref(db, `followers/${targetUser.uid}/${user.uid}`), {
          username: currentUsername,
          timestamp: new Date().toISOString(),
        });

        // Create notification
        const notificationRef = push(
          ref(db, `notifications/${targetUser.uid}`),
        );
        await set(notificationRef, {
          type: "follow",
          fromUserId: user.uid,
          fromUsername: currentUsername,
          fromAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}`,
          timestamp: new Date().toISOString(),
          read: false,
        });

        // Update local state
        setFollowingUsers((prev) => new Set(prev).add(targetUser.uid));
        setSuggestedUsers((prev) =>
          prev.filter((u) => u.uid !== targetUser.uid),
        );

        toast({
          title: "Success",
          description: `You are now following ${targetUser.username}`,
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to follow user",
        variant: "destructive",
      });
    }
  };

  const handleUserClick = (username: string) => {
    navigate(`/users/profile/${username}`);
  };

  const getTimeAgo = (timestamp: any) => {
    if (!timestamp) return "Just now";

    // Handle Firestore Timestamp
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const currentUsername =
    user?.displayName || user?.email?.split("@")[0] || "user";

  return (
    <div className="flex justify-center gap-8 max-w-[1200px] mx-auto">
      {/* Main Feed */}
      <div className="max-w-[630px] flex-1">
        <Stories />
        <div className="py-6 px-4">
          {loadingPosts ? (
            <div className="space-y-6">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="border border-border rounded-lg bg-card"
                >
                  <div className="flex items-center gap-3 p-4">
                    <div className="h-10 w-10 rounded-full bg-muted animate-pulse" />
                    <div className="h-4 w-24 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="aspect-square bg-muted animate-pulse" />
                  <div className="p-4 space-y-2">
                    <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                    <div className="h-4 w-full bg-muted animate-pulse rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg font-semibold mb-2">No Posts Yet</p>
              <p className="text-sm">Follow users to see their posts here</p>
            </div>
          ) : (
            <>
              {posts.map((post) => (
                <PostCard
                  key={post.id}
                  id={post.id}
                  userId={post.userId}
                  username={post.username}
                  avatar={post.userAvatar}
                  image={post.mediaUrl}
                  likes={post.likes || 0}
                  caption={post.caption}
                  timeAgo={
                    post.createdAt ? getTimeAgo(post.createdAt) : "Just now"
                  }
                />
              ))}
              {/* Infinite scroll trigger */}
              <div ref={loadMoreRef} className="h-4" />
              {isLoadingMore && (
                <div className="flex justify-center py-6">
                  <div className="h-6 w-6 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Right Sidebar - Suggested Users */}
      <div className="hidden xl:block w-80 shrink-0 pt-8">
        <div className="sticky top-8">
          {/* Current User */}
          <div className="flex items-center gap-3 mb-6">
            <Avatar
              className="h-14 w-14 cursor-pointer"
              onClick={() => navigate("/profile")}
            >
              <AvatarImage
                src={getSafeAvatarUrl(user?.photoURL, currentUsername)}
                alt={currentUsername}
              />
              <AvatarFallback>
                {currentUsername[0].toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p
                className="text-sm font-semibold cursor-pointer hover:text-muted-foreground transition-colors truncate"
                onClick={() => navigate("/profile")}
              >
                {currentUsername}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {user?.displayName || user?.email}
              </p>
            </div>
            <Button
              variant="ghost"
              className="text-xs font-semibold text-blue-500 hover:text-blue-600 h-auto p-0"
              onClick={() => navigate("/profile")}
            >
              Switch
            </Button>
          </div>

          {/* Suggested Users Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Suggested for you
              </h2>
              <Button
                variant="ghost"
                className="text-xs font-semibold h-auto p-0 hover:text-muted-foreground"
              >
                See All
              </Button>
            </div>

            <div className="space-y-4">
              {loading ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  Loading users...
                </div>
              ) : suggestedUsers.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No users to suggest yet
                </div>
              ) : (
                suggestedUsers.map((suggestedUser) => (
                  <div
                    key={suggestedUser.uid}
                    className="flex items-center gap-3"
                  >
                    <Avatar
                      className="h-11 w-11 cursor-pointer"
                      onClick={() => handleUserClick(suggestedUser.username)}
                    >
                      <AvatarImage
                        src={getSafeAvatarUrl(
                          suggestedUser.avatar,
                          suggestedUser.username,
                        )}
                        alt={suggestedUser.username}
                      />
                      <AvatarFallback>
                        {suggestedUser.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold cursor-pointer hover:text-muted-foreground transition-colors truncate"
                        onClick={() => handleUserClick(suggestedUser.username)}
                      >
                        {suggestedUser.username}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        Naya Vella Hai
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      className="text-xs font-semibold text-blue-500 hover:text-blue-600 h-auto p-0"
                      onClick={() => handleFollow(suggestedUser)}
                    >
                      Follow
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer Links */}
          <div className="text-xs text-muted-foreground space-y-2 mt-8">
            <div className="flex flex-wrap gap-2">
              <a href="#" className="hover:underline">
                About
              </a>
              <span>·</span>
              <a href="#" className="hover:underline">
                Help
              </a>
              <span>·</span>
              <a href="#" className="hover:underline">
                Press
              </a>
              <span>·</span>
              <a href="#" className="hover:underline">
                API
              </a>
              <span>·</span>
              <a href="#" className="hover:underline">
                Jobs
              </a>
              <span>·</span>
              <a href="/privacy" className="hover:underline">
                Privacy
              </a>
              <span>·</span>
              <a href="/terms" className="hover:underline">
                Terms
              </a>
            </div>
            <p className="text-xs">© 2025 Vellebaazi</p>
          </div>
        </div>
      </div>
    </div>
  );
}
