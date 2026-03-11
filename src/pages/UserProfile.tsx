import { useParams, useNavigate } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Grid3x3,
  Bookmark,
  UserSquare2,
  Settings,
  ArrowLeft,
  Video,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getDatabase, ref, get, set, push, remove } from "firebase/database";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { blockUser, getBlockStatus, unblockUser } from "@/utils/blocking";

interface UserRecord {
  username?: string;
  photoURL?: string;
  bio?: string;
  accountPrivacy?: string;
}

interface UserProfileData {
  uid: string;
  username: string;
  fullName: string;
  avatar: string;
  bio: string;
  posts: number;
  followers: number;
  following: number;
  isFollowing: boolean;
  accountPrivacy?: string;
}

interface PostRecord {
  id: string;
  userId: string;
  createdAt: number;
  mediaType?: string;
  mediaUrl?: string;
  caption?: string;
}

export default function UserProfile() {
  const { username } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [userData, setUserData] = useState<UserProfileData>({
    uid: "",
    username: username || "user",
    fullName:
      username?.replace(/[._]/g, " ").replace(/\d+/g, "").trim() || "User",
    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
    bio: "",
    posts: 0,
    followers: 0,
    following: 0,
    isFollowing: false,
  });
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFollowersDialogOpen, setIsFollowersDialogOpen] = useState(false);
  const [isFollowingDialogOpen, setIsFollowingDialogOpen] = useState(false);
  const [followersList, setFollowersList] = useState<
    { uid: string; username: string; avatar: string }[]
  >([]);
  const [followingList, setFollowingList] = useState<
    { uid: string; username: string; avatar: string }[]
  >([]);
  const [followActionLoading, setFollowActionLoading] = useState(false);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [allPostsData, setAllPostsData] = useState<PostRecord[]>([]);
  const [displayedCount, setDisplayedCount] = useState(12);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isPrivateAccount, setIsPrivateAccount] = useState(false);
  const [canViewPosts, setCanViewPosts] = useState(true);
  const [isBlockedByMe, setIsBlockedByMe] = useState(false);
  const [hasBlockedMe, setHasBlockedMe] = useState(false);
  const [blockActionLoading, setBlockActionLoading] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      if (!username || !user) return;

      try {
        const db = getDatabase();
        const usersRef = ref(db, "users");
        const snapshot = await get(usersRef);

        if (snapshot.exists()) {
          const usersData = snapshot.val() as Record<string, UserRecord>;
          // Find user by username
          const userEntry = Object.entries(usersData).find(
            ([, data]) => data.username === username,
          );

          if (userEntry) {
            const [uid, data] = userEntry;
            const blockStatus = await getBlockStatus(user.uid, uid);
            setIsBlockedByMe(blockStatus.blockedByMe);
            setHasBlockedMe(blockStatus.blockedMe);

            // Check if current user is following this profile
            const followingRef = ref(db, `following/${user.uid}/${uid}`);
            const followingSnapshot = await get(followingRef);
            const following = followingSnapshot.exists();

            // Get followers count
            const followersRef = ref(db, `followers/${uid}`);
            const followersSnapshot = await get(followersRef);
            const followersCount = followersSnapshot.exists()
              ? Object.keys(followersSnapshot.val()).length
              : 0;

            // Get following count
            const followingCountRef = ref(db, `following/${uid}`);
            const followingCountSnapshot = await get(followingCountRef);
            const followingCount = followingCountSnapshot.exists()
              ? Object.keys(followingCountSnapshot.val()).length
              : 0;

            // Check account privacy
            const accountPrivacy = data.accountPrivacy || "public";
            const isPrivate = accountPrivacy === "private";
            setIsPrivateAccount(isPrivate);

            // Determine if current user can view posts
            const isOwnProfile = user.uid === uid;
            const canView =
              !blockStatus.blockedEither &&
              (isOwnProfile || !isPrivate || following);
            setCanViewPosts(canView);

            // Fetch posts from Realtime Database only if user can view them
            let postsData: PostRecord[] = [];
            if (canView) {
              const postsRef = ref(db, "posts");
              const postsSnapshot = await get(postsRef);

              if (postsSnapshot.exists()) {
                const allPosts = postsSnapshot.val() as Record<
                  string,
                  Omit<PostRecord, "id">
                >;
                postsData = Object.entries(allPosts)
                  .filter(([, post]) => post.userId === uid)
                  .map(([id, post]) => ({
                    id,
                    ...post,
                  }))
                  .sort((a, b) => b.createdAt - a.createdAt);
              }
              setAllPostsData(postsData);
              setHasMorePosts(postsData.length > displayedCount);
              setPosts(postsData.slice(0, displayedCount));
            }

            setUserData({
              uid,
              username: data.username || username,
              fullName:
                data.username
                  ?.replace(/[._]/g, " ")
                  .replace(/\d+/g, "")
                  .trim() || "User",
              avatar:
                data.photoURL ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
              bio: data.bio || "",
              posts: postsData.length,
              followers: followersCount,
              following: followingCount,
              isFollowing: following,
            });
            setIsFollowing(following);
          }
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, [username, user, displayedCount]);

  // Update displayed posts when count changes
  useEffect(() => {
    if (allPostsData.length === 0) return;
    setHasMorePosts(allPostsData.length > displayedCount);
    setPosts(allPostsData.slice(0, displayedCount));
  }, [displayedCount, allPostsData]);

  const loadMorePosts = () => {
    if (isLoadingMore || !hasMorePosts) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayedCount((prev) => prev + 12);
      setIsLoadingMore(false);
    }, 200);
  };

  const handleFollowToggle = async () => {
    if (!user || !userData.uid) return;
    if (followActionLoading) return;

    // Prevent self-follow
    if (user.uid === userData.uid) {
      toast({
        title: "Error",
        description: "You cannot follow yourself",
        variant: "destructive",
      });
      return;
    }

    try {
      setFollowActionLoading(true);
      const db = getDatabase();
      const currentUsername =
        user.displayName || user.email?.split("@")[0] || "user";
      const blockStatus = await getBlockStatus(user.uid, userData.uid);
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

      if (isFollowing) {
        // Unfollow
        await remove(ref(db, `following/${user.uid}/${userData.uid}`));
        await remove(ref(db, `followers/${userData.uid}/${user.uid}`));

        setIsFollowing(false);
        setUserData((prev) => ({
          ...prev,
          followers: Math.max(0, prev.followers - 1),
        }));

        // If account is private, hide posts
        if (isPrivateAccount) {
          setCanViewPosts(false);
          setPosts([]);
          setUserData((prev) => ({ ...prev, posts: 0 }));
        }

        toast({
          title: "Unfollowed",
          description: `You unfollowed ${userData.username}`,
        });
      } else {
        // Check if already following (prevent duplicates)
        const followingRef = ref(db, `following/${user.uid}/${userData.uid}`);
        const followingSnapshot = await get(followingRef);

        if (followingSnapshot.exists()) {
          toast({
            title: "Already Following",
            description: `You are already following ${userData.username}`,
          });
          setIsFollowing(true);
          return;
        }

        // Check if account is private
        const targetUserRef = ref(db, `users/${userData.uid}`);
        const targetUserSnapshot = await get(targetUserRef);
        const isPrivateAccount =
          targetUserSnapshot.exists() &&
          targetUserSnapshot.val().accountPrivacy === "private";

        if (isPrivateAccount) {
          // Send follow request for private account
          const followRequestRef = ref(
            db,
            `followRequests/${userData.uid}/${user.uid}`,
          );
          const followRequestSnapshot = await get(followRequestRef);
          if (followRequestSnapshot.exists()) {
            toast({
              title: "Request Pending",
              description: "Your follow request is already pending.",
            });
            return;
          }
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
            ref(db, `notifications/${userData.uid}`),
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

          toast({
            title: "Follow Request Sent",
            description: `Your follow request has been sent to ${userData.username}`,
          });
        } else {
          // Public account - follow immediately
          await set(ref(db, `following/${user.uid}/${userData.uid}`), {
            username: userData.username,
            timestamp: new Date().toISOString(),
          });

          await set(ref(db, `followers/${userData.uid}/${user.uid}`), {
            username: currentUsername,
            timestamp: new Date().toISOString(),
          });

          // Create notification
          const notificationRef = push(
            ref(db, `notifications/${userData.uid}`),
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

          setIsFollowing(true);
          setUserData((prev) => ({ ...prev, followers: prev.followers + 1 }));

          // If account was private, now user can view posts
          if (isPrivateAccount) {
            setCanViewPosts(true);
            // Fetch posts
            const postsRef = ref(db, "posts");
            const postsSnapshot = await get(postsRef);
            let postsData: PostRecord[] = [];

            if (postsSnapshot.exists()) {
              const allPosts = postsSnapshot.val() as Record<
                string,
                Omit<PostRecord, "id">
              >;
              postsData = Object.entries(allPosts)
                .filter(([, post]) => post.userId === userData.uid)
                .map(([id, post]) => ({
                  id,
                  ...post,
                }))
                .sort((a, b) => b.createdAt - a.createdAt);
            }

            setPosts(postsData);
            setUserData((prev) => ({ ...prev, posts: postsData.length }));
          }

          toast({
            title: "Success",
            description: `You are now following ${userData.username}`,
          });
        }
      }
    } catch (error: unknown) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to update follow status",
        variant: "destructive",
      });
    } finally {
      setFollowActionLoading(false);
    }
  };

  const handleBlockToggle = async () => {
    if (!user || !userData.uid || user.uid === userData.uid) return;
    if (blockActionLoading) return;

    setBlockActionLoading(true);
    try {
      const db = getDatabase();
      if (isBlockedByMe) {
        await unblockUser(user.uid, userData.uid);
        setIsBlockedByMe(false);
        setCanViewPosts(!isPrivateAccount || isFollowing);
        toast({
          title: "User Unblocked",
          description: `You unblocked ${userData.username}.`,
        });
      } else {
        await blockUser(user.uid, {
          uid: userData.uid,
          username: userData.username,
          avatar: userData.avatar,
        });

        // Remove follow relations in both directions.
        await Promise.all([
          remove(ref(db, `following/${user.uid}/${userData.uid}`)),
          remove(ref(db, `followers/${userData.uid}/${user.uid}`)),
          remove(ref(db, `following/${userData.uid}/${user.uid}`)),
          remove(ref(db, `followers/${user.uid}/${userData.uid}`)),
          remove(ref(db, `followRequests/${user.uid}/${userData.uid}`)),
          remove(ref(db, `followRequests/${userData.uid}/${user.uid}`)),
        ]);

        setIsBlockedByMe(true);
        setIsFollowing(false);
        setCanViewPosts(false);
        setPosts([]);

        toast({
          title: "User Blocked",
          description: `${userData.username} cannot follow or message you now.`,
        });
      }
    } catch (error: unknown) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to update block status",
        variant: "destructive",
      });
    } finally {
      setBlockActionLoading(false);
    }
  };

  const fetchFollowersList = async () => {
    if (!userData.uid) return;

    try {
      const db = getDatabase();
      const followersRef = ref(db, `followers/${userData.uid}`);
      const snapshot = await get(followersRef);

      if (snapshot.exists()) {
        const followersData = snapshot.val();
        const usersRef = ref(db, "users");
        const usersSnapshot = await get(usersRef);

        if (usersSnapshot.exists()) {
          const usersData = usersSnapshot.val();
          const followersList = Object.keys(followersData).map((uid) => {
            const userData = usersData[uid];
            return {
              uid,
              username: userData?.username || "user",
              avatar:
                userData?.photoURL ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
            };
          });
          setFollowersList(followersList);
        }
      } else {
        setFollowersList([]);
      }
      setIsFollowersDialogOpen(true);
    } catch (error) {
      console.error("Error fetching followers:", error);
    }
  };

  const fetchFollowingList = async () => {
    if (!userData.uid) return;

    try {
      const db = getDatabase();
      const followingRef = ref(db, `following/${userData.uid}`);
      const snapshot = await get(followingRef);

      if (snapshot.exists()) {
        const followingData = snapshot.val();
        const usersRef = ref(db, "users");
        const usersSnapshot = await get(usersRef);

        if (usersSnapshot.exists()) {
          const usersData = usersSnapshot.val();
          const followingList = Object.keys(followingData).map((uid) => {
            const userData = usersData[uid];
            return {
              uid,
              username: userData?.username || "user",
              avatar:
                userData?.photoURL ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
            };
          });
          setFollowingList(followingList);
        }
      } else {
        setFollowingList([]);
      }
      setIsFollowingDialogOpen(true);
    } catch (error) {
      console.error("Error fetching following:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden pb-20">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border p-3 sm:gap-4 sm:p-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="min-w-0 truncate text-lg font-semibold sm:text-xl">
          {userData.username}
        </h1>
      </div>

      {/* Profile Info */}
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex items-start gap-4 sm:gap-8">
          <Avatar className="h-20 w-20 shrink-0 sm:h-32 sm:w-32">
            <AvatarImage src={userData.avatar} alt={userData.username} />
            <AvatarFallback className="text-2xl sm:text-4xl">
              {userData.username[0].toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:gap-4">
              <h2 className="truncate text-lg font-light sm:text-xl">
                {userData.username}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
              {user?.uid === userData.uid ? (
                <Button variant="secondary" disabled className="px-4 sm:px-8">
                  This is you
                </Button>
              ) : (
                <>
                  <Button
                    className={
                      isFollowing
                        ? "bg-secondary hover:bg-secondary/80 text-foreground px-4 sm:px-8"
                        : "bg-blue-500 hover:bg-blue-600 text-white px-4 sm:px-8"
                    }
                    onClick={handleFollowToggle}
                    disabled={followActionLoading || isBlockedByMe || hasBlockedMe}
                  >
                    {hasBlockedMe
                      ? "Unavailable"
                      : followActionLoading
                        ? "Please wait..."
                        : isFollowing
                          ? "Following"
                          : "Follow"}
                  </Button>
                  <Button
                    variant={isBlockedByMe ? "secondary" : "outline"}
                    onClick={handleBlockToggle}
                    disabled={blockActionLoading || hasBlockedMe}
                  >
                    {blockActionLoading
                      ? "Please wait..."
                      : isBlockedByMe
                        ? "Unblock"
                        : "Block"}
                  </Button>
                </>
              )}
              <Button
                variant="outline"
                disabled={isBlockedByMe || hasBlockedMe}
                onClick={() =>
                  navigate("/bakaiti", {
                    state: {
                      openChatWith: {
                        userId: userData.uid,
                        username: userData.username,
                        avatar: userData.avatar,
                      },
                    },
                  })
                }
              >
                Message
              </Button>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </div>
            </div>

            <div className="mb-4 grid grid-cols-3 gap-2 text-center sm:flex sm:gap-8 sm:text-left">
              <div className="text-center sm:text-left">
                <span className="font-semibold">{userData.posts}</span>{" "}
                <span className="text-sm sm:text-base">posts</span>
              </div>
              <div
                className="cursor-pointer text-center transition-colors hover:text-muted-foreground sm:text-left"
                onClick={fetchFollowersList}
              >
                <span className="font-semibold">{userData.followers}</span>{" "}
                <span className="text-sm sm:text-base">followers</span>
              </div>
              <div
                className="cursor-pointer text-center transition-colors hover:text-muted-foreground sm:text-left"
                onClick={fetchFollowingList}
              >
                <span className="font-semibold">{userData.following}</span>{" "}
                <span className="text-sm sm:text-base">following</span>
              </div>
            </div>

            <div>
              <p className="break-words font-semibold">{userData.fullName}</p>
              <p className="break-words text-sm">{userData.bio}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="w-full justify-center border-t border-border bg-transparent rounded-none h-12">
          <TabsTrigger
            value="posts"
            className="flex items-center gap-2 data-[state=active]:border-t-2 data-[state=active]:border-foreground rounded-none"
          >
            <Grid3x3 className="h-4 w-4" />
            <span className="hidden sm:inline">POSTS</span>
          </TabsTrigger>
          <TabsTrigger
            value="saved"
            className="flex items-center gap-2 data-[state=active]:border-t-2 data-[state=active]:border-foreground rounded-none"
          >
            <Bookmark className="h-4 w-4" />
            <span className="hidden sm:inline">SAVED</span>
          </TabsTrigger>
          <TabsTrigger
            value="tagged"
            className="flex items-center gap-2 data-[state=active]:border-t-2 data-[state=active]:border-foreground rounded-none"
          >
            <UserSquare2 className="h-4 w-4" />
            <span className="hidden sm:inline">TAGGED</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-0">
          {hasBlockedMe ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-full border-2 border-foreground flex items-center justify-center mb-4">
                <Grid3x3 className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-light mb-2">Profile Unavailable</h3>
              <p className="text-muted-foreground text-sm text-center px-4">
                This user has restricted interactions with your account.
              </p>
            </div>
          ) : isBlockedByMe ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-full border-2 border-foreground flex items-center justify-center mb-4">
                <Grid3x3 className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-light mb-2">User Blocked</h3>
              <p className="text-muted-foreground text-sm text-center px-4">
                Unblock {userData.username} to view their posts.
              </p>
            </div>
          ) : !canViewPosts ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-full border-2 border-foreground flex items-center justify-center mb-4">
                <Grid3x3 className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-light mb-2">
                This Account is Private
              </h3>
              <p className="text-muted-foreground text-sm text-center px-4">
                Follow {userData.username} to see their photos and videos.
              </p>
            </div>
          ) : posts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-16 h-16 rounded-full border-2 border-foreground flex items-center justify-center mb-4">
                <Grid3x3 className="h-8 w-8" />
              </div>
              <h3 className="text-2xl font-light mb-2">No Posts Yet</h3>
              <p className="text-muted-foreground text-sm">
                When {userData.username} posts, you'll see their photos and
                videos here.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-1">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="relative aspect-square bg-muted cursor-pointer hover:opacity-80 transition-opacity"
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
                  </div>
                ))}
              </div>
              {hasMorePosts && (
                <div className="flex justify-center py-6">
                  <button
                    onClick={loadMorePosts}
                    disabled={isLoadingMore}
                    className="px-6 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm font-medium transition-colors"
                  >
                    {isLoadingMore ? "Loading..." : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="saved" className="mt-0">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full border-2 border-foreground flex items-center justify-center mb-4">
              <Bookmark className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-light mb-2">No Saved Posts</h3>
          </div>
        </TabsContent>

        <TabsContent value="tagged" className="mt-0">
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full border-2 border-foreground flex items-center justify-center mb-4">
              <UserSquare2 className="h-8 w-8" />
            </div>
            <h3 className="text-2xl font-light mb-2">No Tagged Posts</h3>
          </div>
        </TabsContent>
      </Tabs>

      {/* Followers Dialog */}
      <Dialog
        open={isFollowersDialogOpen}
        onOpenChange={setIsFollowersDialogOpen}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Followers</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {followersList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No followers yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {followersList.map((follower) => (
                  <div
                    key={follower.uid}
                    className="flex items-center gap-3 p-2 hover:bg-secondary rounded-lg cursor-pointer transition-colors"
                    onClick={() => {
                      navigate(`/users/profile/${follower.username}`);
                      setIsFollowersDialogOpen(false);
                    }}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={follower.avatar}
                        alt={follower.username}
                      />
                      <AvatarFallback>
                        {follower.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">
                        {follower.username}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Following Dialog */}
      <Dialog
        open={isFollowingDialogOpen}
        onOpenChange={setIsFollowingDialogOpen}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Following</DialogTitle>
          </DialogHeader>
          <div className="max-h-[400px] overflow-y-auto">
            {followingList.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Not following anyone yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {followingList.map((following) => (
                  <div
                    key={following.uid}
                    className="flex items-center gap-3 p-2 hover:bg-secondary rounded-lg cursor-pointer transition-colors"
                    onClick={() => {
                      navigate(`/users/profile/${following.username}`);
                      setIsFollowingDialogOpen(false);
                    }}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={following.avatar}
                        alt={following.username}
                      />
                      <AvatarFallback>
                        {following.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold text-sm">
                        {following.username}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
