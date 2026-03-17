import { PostCard } from "@/components/PostCard";
import { Stories } from "@/components/Stories";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState, useRef, useCallback } from "react";
import { getDatabase, ref, get, set, push } from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import { getSafeAvatarUrl } from "@/utils/media";
import { getBlockMapsForUser, getBlockStatus } from "@/utils/blocking";

interface SuggestedUser {
  uid: string;
  username: string;
  email: string;
  avatar?: string;
  isFollowing?: boolean;
}
interface UserRecord {
  username?: string;
  email?: string;
  photoURL?: string;
  accountPrivacy?: string;
}

interface PostItem {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType?: string;
  postType?: string;
  caption: string;
  likes?: number;
  comments?: number;
  createdAt?: number;
}

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong";
  const [suggestedUsers, setSuggestedUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [posts, setPosts] = useState<PostItem[]>([]);
  const [allPostsData, setAllPostsData] = useState<PostItem[]>([]);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [displayedCount, setDisplayedCount] = useState(5);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [followLoading, setFollowLoading] = useState<Set<string>>(new Set());
  const [searchParams, setSearchParams] = useSearchParams();
  const targetPostId = searchParams.get("post");
  const targetCommentId = searchParams.get("comment");
  const postRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const handledDeepLinkRef = useRef<string | null>(null);

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

        const blockMaps = await getBlockMapsForUser(user.uid);

        // Fetch users
        const usersRef = ref(db, "users");
        const snapshot = await get(usersRef);

        if (snapshot.exists()) {
          const usersData = snapshot.val() as Record<string, UserRecord>;

          const usersArray: SuggestedUser[] = Object.entries(usersData)
            .filter(([uid]) => {
              if (uid === user.uid) return false;
              if (followingSet.has(uid)) return false;
              if (blockMaps.blockedEither.has(uid)) return false;
              return true;
            })
            .map(([uid, data]) => ({
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

        const blockMaps = await getBlockMapsForUser(user.uid);

        // Get all users to check privacy settings
        const usersRef = ref(db, "users");
        const usersSnapshot = await get(usersRef);
        const usersData = (
          usersSnapshot.exists()
            ? (usersSnapshot.val() as Record<string, UserRecord>)
            : {}
        ) as Record<string, UserRecord>;

        // Fetch all posts from Realtime Database
        const postsRef = ref(db, "posts");
        const postsSnapshot = await get(postsRef);

        let allPostsArray: PostItem[] = [];

        if (postsSnapshot.exists()) {
          const allPosts = postsSnapshot.val() as Record<
            string,
            Omit<PostItem, "id">
          >;
          allPostsArray = Object.entries(allPosts)
            .map(([id, post]) => ({
              id,
              ...post,
            }))
            .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
            .slice(0, 50); // Limit to 50 posts
        }

        const isVideoPost = (post: PostItem) => {
          if (post.mediaType === "video" || post.postType === "reel")
            return true;
          const mediaUrl = (post.mediaUrl || "").toLowerCase();
          return /\.(mp4|mov|webm)$/.test(mediaUrl);
        };

        const isMediaUrlValid = (post: PostItem) => {
          const mediaUrl = (post.mediaUrl || "").toString().trim();
          if (!mediaUrl) return false;
          if (mediaUrl.includes("supabase.co/storage")) return false;
          return true;
        };

        // Filter posts based on privacy and remove videos from feed
        const postsData = allPostsArray.filter((post) => {
          const postUserId = post.userId;
          const userData = usersData[postUserId];
          const isPrivate = userData?.accountPrivacy === "private";
          if (blockMaps.blockedEither.has(postUserId)) return false;

          const canSeePost =
            postUserId === user.uid ||
            followingIds.includes(postUserId) ||
            !isPrivate;
          return canSeePost && !isVideoPost(post) && isMediaUrlValid(post);
        });
        setAllPostsData(postsData);
        setHasMorePosts(postsData.length > displayedCount);
        setPosts(postsData.slice(0, displayedCount));
      } catch (error: unknown) {
        console.error("Error fetching posts:", error);
        const isOffline = typeof navigator !== "undefined" && !navigator.onLine;
        toast({
          title: "Error Loading Posts",
          description: isOffline
            ? "You're offline. Reconnect to the internet and refresh."
            : "Could not load posts from Realtime Database. Please check your network/database rules.",
          variant: "destructive",
        });
      } finally {
        setLoadingPosts(false);
      }
    };

    fetchPosts();
  }, [user, displayedCount, toast]);

  // Update displayed posts when count changes
  useEffect(() => {
    if (allPostsData.length === 0) return;
    setHasMorePosts(allPostsData.length > displayedCount);
    setPosts(allPostsData.slice(0, displayedCount));
  }, [displayedCount, allPostsData]);

  const clearNotificationDeepLink = useCallback(() => {
    if (!targetPostId && !targetCommentId) return;
    const next = new URLSearchParams(searchParams);
    next.delete("post");
    next.delete("comment");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, targetCommentId, targetPostId]);

  useEffect(() => {
    if (!targetPostId) {
      handledDeepLinkRef.current = null;
      return;
    }
    if (allPostsData.length === 0) return;

    const targetIndex = allPostsData.findIndex((entry) => entry.id === targetPostId);
    if (targetIndex < 0) return;

    if (targetIndex + 1 > displayedCount) {
      setDisplayedCount(targetIndex + 1);
      return;
    }

    if (!posts.some((entry) => entry.id === targetPostId)) return;

    const deepLinkKey = `${targetPostId}:${targetCommentId || ""}`;
    if (handledDeepLinkRef.current === deepLinkKey) return;
    handledDeepLinkRef.current = deepLinkKey;

    const scrollTimer = window.setTimeout(() => {
      postRefs.current[targetPostId]?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 80);

    let clearTimer: number | null = null;
    if (!targetCommentId) {
      clearTimer = window.setTimeout(() => {
        clearNotificationDeepLink();
      }, 220);
    }

    return () => {
      window.clearTimeout(scrollTimer);
      if (clearTimer !== null) {
        window.clearTimeout(clearTimer);
      }
    };
  }, [
    allPostsData,
    clearNotificationDeepLink,
    displayedCount,
    posts,
    targetCommentId,
    targetPostId,
  ]);

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
    if (followLoading.has(targetUser.uid)) return;

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
      setFollowLoading((prev) => new Set(prev).add(targetUser.uid));
      const db = getDatabase();
      const currentUsername =
        user.displayName || user.email?.split("@")[0] || "user";
      const blockStatus = await getBlockStatus(user.uid, targetUser.uid);
      if (blockStatus.blockedEither) {
        toast({
          title: "Action blocked",
          description: blockStatus.blockedByMe
            ? "Unblock this user first to follow."
            : "You cannot follow this user.",
          variant: "destructive",
        });
        return;
      }

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
        // Prevent duplicate follow requests from the same account
        const followRequestRef = ref(
          db,
          `followRequests/${targetUser.uid}/${user.uid}`,
        );
        const followRequestSnapshot = await get(followRequestRef);
        if (followRequestSnapshot.exists()) {
          toast({
            title: "Request Pending",
            description: "Your follow request is already pending.",
          });
          return;
        }

        // Send follow request for private account (idempotent key)
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
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error) || "Failed to follow user",
        variant: "destructive",
      });
    } finally {
      setFollowLoading((prev) => {
        const next = new Set(prev);
        next.delete(targetUser.uid);
        return next;
      });
    }
  };

  const handleUserClick = (username: string) => {
    navigate(`/users/profile/${username}`);
  };

  const getTimeAgo = (timestamp: unknown) => {
    if (!timestamp) return "Just now";

    // Handle Firebase timestamp-like values
    const date =
      typeof timestamp === "object" &&
      timestamp !== null &&
      "toDate" in timestamp &&
      typeof (timestamp as { toDate?: () => Date }).toDate === "function"
        ? (timestamp as { toDate: () => Date }).toDate()
        : new Date(timestamp as string | number);
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
    <div className="mx-auto flex w-full max-w-[1215px] justify-center gap-7 px-0 text-foreground md:px-4 lg:px-6">
      {/* Main Feed */}
      <div className="w-full max-w-[630px] flex-1">
        <Stories />
        <div className="px-1 py-4 sm:px-2 md:py-5">
          {loadingPosts ? (
            <div className="space-y-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card">
                  <div className="flex items-center gap-3 p-4">
                    <div className="h-10 w-10 animate-pulse rounded-full bg-muted" />
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                  </div>
                  <div className="aspect-square bg-muted animate-pulse" />
                  <div className="space-y-2 p-4">
                    <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-full animate-pulse rounded bg-muted" />
                  </div>
                </div>
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-2 text-lg font-semibold text-foreground">No Posts Yet</p>
              <p className="text-sm text-muted-foreground">
                Follow users to see their posts here
              </p>
            </div>
          ) : (
            <>
              {posts.map((post) => {
                const isTargetPost = targetPostId === post.id;
                return (
                  <div
                    key={post.id}
                    ref={(el) => {
                      postRefs.current[post.id] = el;
                    }}
                  >
                    <PostCard
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
                      autoOpenComments={isTargetPost && Boolean(targetCommentId)}
                      highlightCommentId={isTargetPost ? targetCommentId || undefined : undefined}
                      onAutoOpenHandled={
                        isTargetPost && targetCommentId
                          ? clearNotificationDeepLink
                          : undefined
                      }
                    />
                  </div>
                );
              })}
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
      <div className="hidden w-[318px] shrink-0 pt-8 lg:block">
        <div className="sticky top-8">
          {/* Current User */}
          <div className="mb-6 flex items-center gap-3.5">
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
            <div className="min-w-0 flex-1">
              <p
                className="truncate text-sm font-semibold transition-colors hover:text-muted-foreground"
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
              className="h-auto p-0 text-xs font-semibold text-[#0095f6] hover:text-[#1877f2] dark:text-[#4ea8ff] dark:hover:text-[#75bcff]"
              onClick={() => navigate("/profile")}
            >
              Switch
            </Button>
          </div>

          {/* Suggested Users Section */}
          <div className="mb-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                Suggested for you
              </h2>
              <Button
                variant="ghost"
                className="h-auto p-0 text-xs font-semibold text-foreground hover:text-muted-foreground"
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
                    <div className="min-w-0 flex-1">
                      <p
                        className="truncate text-sm font-semibold transition-colors hover:text-muted-foreground"
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
                      className="h-auto p-0 text-xs font-semibold text-[#0095f6] hover:text-[#1877f2] dark:text-[#4ea8ff] dark:hover:text-[#75bcff]"
                      onClick={() => handleFollow(suggestedUser)}
                      disabled={followLoading.has(suggestedUser.uid)}
                    >
                      {followLoading.has(suggestedUser.uid)
                        ? "Following..."
                        : "Follow"}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Footer Links */}
          <div className="mt-8 space-y-2 text-xs text-muted-foreground">
            <div className="flex flex-wrap gap-2">
              <a href="#" className="hover:text-foreground hover:underline">
                About
              </a>
              <span>&middot;</span>
              <a href="#" className="hover:text-foreground hover:underline">
                Help
              </a>
              <span>&middot;</span>
              <a href="#" className="hover:text-foreground hover:underline">
                Press
              </a>
              <span>&middot;</span>
              <a href="#" className="hover:text-foreground hover:underline">
                API
              </a>
              <span>&middot;</span>
              <a href="#" className="hover:text-foreground hover:underline">
                Jobs
              </a>
              <span>&middot;</span>
              <a href="/privacy" className="hover:text-foreground hover:underline">
                Privacy
              </a>
              <span>&middot;</span>
              <a href="/terms" className="hover:text-foreground hover:underline">
                Terms
              </a>
            </div>
            <p className="text-xs">&copy; 2025 Vellebaazi</p>
          </div>
        </div>
      </div>
    </div>
  );
}

