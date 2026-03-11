import {
  Settings,
  Grid,
  Bookmark,
  ChevronDown,
  LogOut,
  Plus,
  Image as ImageIcon,
  Video,
  Trash2,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { getDatabase, ref, update, get, remove } from "firebase/database";
import { Input } from "@/components/ui/input";
import { uploadToStorage, deleteFromStorage } from "@/lib/storage";
import { push, set } from "firebase/database";
import { MentionTextarea } from "@/components/MentionTextarea";

interface UserListItem {
  uid: string;
  username: string;
  avatar: string;
}

interface PostRecord {
  id: string;
  userId: string;
  createdAt: number;
  mediaType?: string;
  mediaUrl?: string;
  caption?: string;
  userAvatar?: string;
  username?: string;
  likes?: number;
  comments?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isPostRecord = (value: unknown): value is Omit<PostRecord, "id"> =>
  isRecord(value) && typeof value.userId === "string";

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Something went wrong";

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isFollowersDialogOpen, setIsFollowersDialogOpen] = useState(false);
  const [isFollowingDialogOpen, setIsFollowingDialogOpen] = useState(false);
  const [isCreatePostDialogOpen, setIsCreatePostDialogOpen] = useState(false);
  const [bio, setBio] = useState("");
  const [editBio, setEditBio] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [followersCount, setFollowersCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersList, setFollowersList] = useState<UserListItem[]>([]);
  const [followingList, setFollowingList] = useState<UserListItem[]>([]);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [postsCount, setPostsCount] = useState(0);
  const [isUploadingPost, setIsUploadingPost] = useState(false);
  const [postCaption, setPostCaption] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDeleteMode, setIsDeleteMode] = useState(false);
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [isDeletingPosts, setIsDeletingPosts] = useState(false);
  const [allPostsData, setAllPostsData] = useState<PostRecord[]>([]);
  const [displayedCount, setDisplayedCount] = useState(12);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const username = user?.displayName || user?.email?.split("@")[0] || "user";
  const userInitials = username.substring(0, 2).toUpperCase();

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      if (!user) return;

      try {
        const db = getDatabase();

        // Fetch bio
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          const userData = snapshot.val();
          setBio(userData.bio || "");
        }

        // Fetch followers count
        const followersRef = ref(db, `followers/${user.uid}`);
        const followersSnapshot = await get(followersRef);
        const followersCount = followersSnapshot.exists()
          ? Object.keys(followersSnapshot.val()).length
          : 0;
        setFollowersCount(followersCount);

        // Fetch following count
        const followingRef = ref(db, `following/${user.uid}`);
        const followingSnapshot = await get(followingRef);
        const followingCount = followingSnapshot.exists()
          ? Object.keys(followingSnapshot.val()).length
          : 0;
        setFollowingCount(followingCount);

        // Fetch posts from Realtime Database
        const postsRef = ref(db, "posts");
        const postsSnapshot = await get(postsRef);

        if (postsSnapshot.exists()) {
          const allPosts = postsSnapshot.val() as Record<string, unknown>;
          const userPosts = Object.entries(allPosts)
            .filter(
              ([, post]) => isPostRecord(post) && post.userId === user.uid,
            )
            .map(([id, post]) => ({
              id,
              ...(post as Omit<PostRecord, "id">),
            }))
            .sort((a, b) => b.createdAt - a.createdAt);

          setAllPostsData(userPosts);
          setHasMorePosts(userPosts.length > displayedCount);
          setPosts(userPosts.slice(0, displayedCount));
          setPostsCount(userPosts.length);
        } else {
          setPosts([]);
          setAllPostsData([]);
          setHasMorePosts(false);
          setPostsCount(0);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
      }
    };

    fetchUserData();
  }, [user, displayedCount]);

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

  const fetchFollowersList = async () => {
    if (!user) return;

    try {
      const db = getDatabase();
      const followersRef = ref(db, `followers/${user.uid}`);
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
    if (!user) return;

    try {
      const db = getDatabase();
      const followingRef = ref(db, `following/${user.uid}`);
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

  const handleLogout = async () => {
    try {
      await signOut();
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out",
      });
      navigate("/login");
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  const handleEditProfile = () => {
    setEditBio(bio);
    setIsEditDialogOpen(true);
  };

  const handleSaveBio = async () => {
    if (!user) return;

    setIsSaving(true);
    try {
      const db = getDatabase();
      const userRef = ref(db, `users/${user.uid}`);

      await update(userRef, {
        bio: editBio,
      });

      setBio(editBio);
      setIsEditDialogOpen(false);

      toast({
        title: "Profile Updated",
        description: "Your bio has been updated successfully",
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - images and videos
    const validTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description:
          "Please select an image (JPG, PNG, GIF) or video (MP4, MOV, WEBM)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 50MB for Storage API storage)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 50MB",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleCreatePost = async () => {
    if (!user || !selectedFile) return;

    setIsUploadingPost(true);
    try {
      const db = getDatabase();

      // Generate unique filename
      const fileExtension = selectedFile.name.split(".").pop();
      const fileName = `${user.uid}/${Date.now()}.${fileExtension}`;

      // Upload file to Storage API
      const mediaUrl = await uploadToStorage(selectedFile, fileName);

      // Determine media type
      const mediaType = selectedFile.type.startsWith("video/")
        ? "video"
        : "image";

      // Create post in Realtime Database
      const postsRef = ref(db, "posts");
      const newPostRef = push(postsRef);

      await set(newPostRef, {
        userId: user.uid,
        username: user.displayName || user.email?.split("@")[0] || "user",
        userAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        mediaUrl: mediaUrl,
        mediaType: mediaType,
        caption: postCaption.trim(),
        likes: 0,
        comments: 0,
        createdAt: Date.now(),
      });

      // Refresh posts
      const postsSnapshot = await get(postsRef);
      if (postsSnapshot.exists()) {
        const allPosts = postsSnapshot.val() as Record<string, unknown>;
        const userPosts = Object.entries(allPosts)
          .filter(([, post]) => isPostRecord(post) && post.userId === user.uid)
          .map(([id, post]) => ({
            id,
            ...(post as Omit<PostRecord, "id">),
          }))
          .sort((a, b) => b.createdAt - a.createdAt);

        setPosts(userPosts);
        setPostsCount(userPosts.length);
      }

      // Reset form
      setIsCreatePostDialogOpen(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setPostCaption("");

      toast({
        title: "Post Created",
        description: "Your post has been published successfully",
      });
    } catch (error: unknown) {
      console.error("Error creating post:", error);
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsUploadingPost(false);
    }
  };

  const togglePostSelection = (postId: string) => {
    setSelectedPosts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(postId)) {
        newSet.delete(postId);
      } else {
        newSet.add(postId);
      }
      return newSet;
    });
  };

  const handleDeleteSelectedPosts = async () => {
    if (!user || selectedPosts.size === 0) return;

    setIsDeletingPosts(true);
    try {
      const db = getDatabase();

      // Delete each selected post
      for (const postId of selectedPosts) {
        // Get post data to extract media URL
        const postRef = ref(db, `posts/${postId}`);
        const postSnapshot = await get(postRef);

        if (postSnapshot.exists()) {
          const postData = postSnapshot.val();

          // Delete file from storage (if present)
          if (postData.mediaUrl) {
            try {
              await deleteFromStorage(postData.mediaUrl);
              console.log(`Deleted file from storage: ${postData.mediaUrl}`);
            } catch (storageError) {
              console.error("Error deleting from storage:", storageError);
              // Continue with database deletion even if storage deletion fails
            }
          }

          // Delete from database
          await remove(postRef);
        }
      }

      // Refresh posts
      const postsRef = ref(db, "posts");
      const postsSnapshot = await get(postsRef);

      if (postsSnapshot.exists()) {
        const allPosts = postsSnapshot.val() as Record<string, unknown>;
        const userPosts = Object.entries(allPosts)
          .filter(([, post]) => isPostRecord(post) && post.userId === user.uid)
          .map(([id, post]) => ({
            id,
            ...(post as Omit<PostRecord, "id">),
          }))
          .sort((a, b) => b.createdAt - a.createdAt);

        setPosts(userPosts);
        setPostsCount(userPosts.length);
      } else {
        setPosts([]);
        setPostsCount(0);
      }

      // Reset selection
      setSelectedPosts(new Set());
      setIsDeleteMode(false);

      toast({
        title: "Posts Deleted",
        description: `Successfully deleted ${selectedPosts.size} post${selectedPosts.size > 1 ? "s" : ""} and their media files`,
      });
    } catch (error: unknown) {
      console.error("Error deleting posts:", error);
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsDeletingPosts(false);
    }
  };

  const handleCleanupSelfFollows = async () => {
    if (!user) return;

    try {
      const db = getDatabase();
      let cleanedItems = 0;

      // Remove self from following list
      const followingRef = ref(db, `following/${user.uid}/${user.uid}`);
      const followingSnapshot = await get(followingRef);

      if (followingSnapshot.exists()) {
        await remove(followingRef);
        console.log("Removed self from following list");
        cleanedItems++;
      }

      // Remove self from followers list
      const followersRef = ref(db, `followers/${user.uid}/${user.uid}`);
      const followersSnapshot = await get(followersRef);

      if (followersSnapshot.exists()) {
        await remove(followersRef);
        console.log("Removed self from followers list");
        cleanedItems++;
      }

      // Remove self-chats
      const chatsRef = ref(db, `userChats/${user.uid}`);
      const chatsSnapshot = await get(chatsRef);

      if (chatsSnapshot.exists()) {
        const chatsData = chatsSnapshot.val();
        for (const chatId in chatsData) {
          const chatData = chatsData[chatId];
          if (chatData.otherUserId === user.uid) {
            await remove(ref(db, `userChats/${user.uid}/${chatId}`));
            console.log("Removed self-chat:", chatId);
            cleanedItems++;
          }
        }
      }

      // Refresh counts
      const followersRefresh = ref(db, `followers/${user.uid}`);
      const followersRefreshSnapshot = await get(followersRefresh);
      const newFollowersCount = followersRefreshSnapshot.exists()
        ? Object.keys(followersRefreshSnapshot.val()).length
        : 0;
      setFollowersCount(newFollowersCount);

      const followingRefresh = ref(db, `following/${user.uid}`);
      const followingRefreshSnapshot = await get(followingRefresh);
      const newFollowingCount = followingRefreshSnapshot.exists()
        ? Object.keys(followingRefreshSnapshot.val()).length
        : 0;
      setFollowingCount(newFollowingCount);

      toast({
        title: "Cleanup Complete",
        description: `Removed ${cleanedItems} invalid entries from your profile`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl overflow-x-hidden">
      {/* Header */}
      <div className="border-b border-border p-4 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <h1 className="max-w-[65vw] truncate text-lg font-semibold sm:max-w-none sm:text-xl">
                  {username}
                </h1>
                <ChevronDown className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuItem
                onClick={handleLogout}
                className="text-destructive cursor-pointer"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Log Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => navigate("/settings")}
                className="cursor-pointer"
              >
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleCleanupSelfFollows}
                className="cursor-pointer"
              >
                Clean Up Profile Data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Profile Info */}
        <div className="mb-6 flex items-start gap-4 sm:gap-8">
          <Avatar className="h-20 w-20 shrink-0 border-2 border-border sm:h-24 sm:w-24">
            <AvatarImage
              src={
                user?.photoURL ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
              }
              alt="Profile"
            />
            <AvatarFallback>{userInitials}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="mb-4 grid grid-cols-3 gap-2 sm:flex sm:gap-8">
              <div className="text-center">
                <p className="text-base font-semibold sm:text-lg">{postsCount}</p>
                <p className="text-xs text-muted-foreground sm:text-sm">posts</p>
              </div>
              <div
                className="text-center cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={fetchFollowersList}
              >
                <p className="text-base font-semibold sm:text-lg">
                  {followersCount}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  followers
                </p>
              </div>
              <div
                className="text-center cursor-pointer hover:text-muted-foreground transition-colors"
                onClick={fetchFollowingList}
              >
                <p className="text-base font-semibold sm:text-lg">
                  {followingCount}
                </p>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  following
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                variant="secondary"
                className="w-full sm:flex-1"
                onClick={handleEditProfile}
              >
                Edit Profile
              </Button>
              <Button
                variant="default"
                className="w-full bg-blue-500 text-white hover:bg-blue-600 sm:flex-1"
                onClick={() => setIsCreatePostDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Post
              </Button>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div>
          <p className="font-semibold break-words">{username}</p>
          {bio && (
            <p className="mt-1 whitespace-pre-wrap break-words text-sm">{bio}</p>
          )}
        </div>
      </div>

      {/* Create Post Dialog */}
      <Dialog
        open={isCreatePostDialogOpen}
        onOpenChange={setIsCreatePostDialogOpen}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Post</DialogTitle>
            <DialogDescription>
              Share a photo or video with your followers
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {!selectedFile ? (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Input
                  id="file-upload"
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex gap-4">
                      <ImageIcon className="h-12 w-12 text-muted-foreground" />
                      <Video className="h-12 w-12 text-muted-foreground" />
                    </div>
                    <p className="text-lg font-semibold">
                      Select photo or video
                    </p>
                    <p className="text-sm text-muted-foreground">
                      JPG, PNG, GIF, MP4, MOV, WEBM (max 50MB)
                    </p>
                    <Button type="button" variant="default" className="mt-2">
                      Choose File
                    </Button>
                  </div>
                </label>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-square bg-muted rounded-lg overflow-hidden">
                  {selectedFile.type.startsWith("video/") ? (
                    <video
                      src={previewUrl || ""}
                      controls
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <img
                      src={previewUrl || ""}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewUrl(null);
                  }}
                  className="w-full"
                >
                  Change File
                </Button>
                <div className="grid gap-2">
                  <Label htmlFor="caption">Caption</Label>
                  <MentionTextarea
                    id="caption"
                    placeholder="Write a caption... Use @ to mention people"
                    value={postCaption}
                    onChange={(val) => setPostCaption(val)}
                    className="min-h-[100px] resize-none"
                    maxLength={2200}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {postCaption.length}/2200
                  </p>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsCreatePostDialogOpen(false);
                setSelectedFile(null);
                setPreviewUrl(null);
                setPostCaption("");
              }}
              disabled={isUploadingPost}
            >
              Cancel
            </Button>
            {selectedFile && (
              <Button onClick={handleCreatePost} disabled={isUploadingPost}>
                {isUploadingPost ? "Uploading..." : "Post"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
            <DialogDescription>
              Update your bio to let others know more about you
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                placeholder="Write a bio..."
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                className="min-h-[120px] resize-none"
                maxLength={150}
              />
              <p className="text-xs text-muted-foreground text-right">
                {editBio.length}/150
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsEditDialogOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveBio} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* Tabs */}
      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="w-full grid grid-cols-2 h-12 border-b border-border rounded-none bg-transparent">
          <TabsTrigger
            value="posts"
            className="gap-2 data-[state=active]:border-t-2 data-[state=active]:border-t-foreground rounded-none"
          >
            <Grid className="h-4 w-4" />
            <span className="hidden sm:inline">Posts</span>
          </TabsTrigger>
          <TabsTrigger
            value="saved"
            className="gap-2 data-[state=active]:border-t-2 data-[state=active]:border-t-foreground rounded-none"
          >
            <Bookmark className="h-4 w-4" />
            <span className="hidden sm:inline">Saved</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="mt-0">
          {posts.length === 0 ? (
            <div className="py-20 text-center text-muted-foreground">
              <Grid className="h-16 w-16 mx-auto mb-4 opacity-20" />
              <p className="text-lg font-semibold mb-2">No Posts Yet</p>
              <p className="text-sm">Start sharing your moments</p>
              <Button
                variant="default"
                className="mt-4 bg-blue-500 hover:bg-blue-600 text-white"
                onClick={() => setIsCreatePostDialogOpen(true)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Post
              </Button>
            </div>
          ) : (
            <>
              {/* Delete Mode Controls */}
              <div className="p-4 border-b border-border flex items-center justify-between">
                {!isDeleteMode ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDeleteMode(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Select Posts
                  </Button>
                ) : (
                  <div className="flex w-full flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsDeleteMode(false);
                        setSelectedPosts(new Set());
                      }}
                    >
                      Cancel
                    </Button>
                    <div className="flex-1 text-sm text-muted-foreground">
                      {selectedPosts.size} selected
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={handleDeleteSelectedPosts}
                      disabled={selectedPosts.size === 0 || isDeletingPosts}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {isDeletingPosts
                        ? "Deleting..."
                        : `Delete (${selectedPosts.size})`}
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-1 p-1">
                {posts.map((post) => (
                  <div
                    key={post.id}
                    className="relative aspect-square bg-muted cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => isDeleteMode && togglePostSelection(post.id)}
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
                    {post.mediaType === "video" && !isDeleteMode && (
                      <div className="absolute top-2 right-2">
                        <Video className="h-5 w-5 text-white drop-shadow-lg" />
                      </div>
                    )}
                    {isDeleteMode && (
                      <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                        <div
                          className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                            selectedPosts.has(post.id)
                              ? "bg-blue-500 border-blue-500"
                              : "bg-white/20 border-white"
                          }`}
                        >
                          {selectedPosts.has(post.id) && (
                            <Check className="h-5 w-5 text-white" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {hasMorePosts && !isDeleteMode && (
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
          <div className="py-20 text-center text-muted-foreground">
            <Bookmark className="h-16 w-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-semibold mb-2">No Saved Posts</p>
            <p className="text-sm">Save posts to see them here</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
