import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { getDatabase, ref, get, set, push, remove } from "firebase/database";
import { uploadToStorage } from "@/lib/storage";
import { useToast } from "@/hooks/use-toast";
import { StoryEditor } from "@/components/StoryEditor";
import { getSafeAvatarUrl } from "@/utils/media";
import { sendMentionNotifications } from "@/utils/mentionNotifications";

interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  audience?: "public" | "close_friends";
  mentions?: string[];
  createdAt: number;
  expiresAt: number;
}

interface StoryRecord {
  userId: string;
  username: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  audience?: "public" | "close_friends";
  mentions?: string[];
  createdAt: number;
  expiresAt: number;
}

export function Stories() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stories, setStories] = useState<{ [userId: string]: Story[] }>({});
  const [displayedStories, setDisplayedStories] = useState<{
    [userId: string]: Story[];
  }>({});
  const [displayedCount, setDisplayedCount] = useState(10);
  const [hasMoreStories, setHasMoreStories] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storyAudience, setStoryAudience] = useState<"public" | "close_friends">("public");
  const [closeFriendsCount, setCloseFriendsCount] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [currentStoryUser, setCurrentStoryUser] = useState<string | null>(null);
  const [currentStoryIndex, setCurrentStoryIndex] = useState(0);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const fetchStories = useCallback(async () => {
    if (!user) return;

    try {
      const db = getDatabase();
      const storiesRef = ref(db, "stories");
      const snapshot = await get(storiesRef);

      if (snapshot.exists()) {
        const allStories = snapshot.val() as Record<string, StoryRecord>;
        const now = Date.now();
        const restrictedOwners = new Set<string>();

        Object.values(allStories).forEach((story) => {
          if (
            story.expiresAt > now &&
            story.audience === "close_friends" &&
            story.userId !== user.uid
          ) {
            restrictedOwners.add(story.userId);
          }
        });

        const allowedCloseFriendsOwners = new Set<string>();
        await Promise.all(
          Array.from(restrictedOwners).map(async (ownerId) => {
            const canViewSnapshot = await get(
              ref(db, `closeFriends/${ownerId}/${user.uid}`),
            );
            if (canViewSnapshot.exists()) {
              allowedCloseFriendsOwners.add(ownerId);
            }
          }),
        );

        // Group stories by user and filter expired ones
        const groupedStories: { [userId: string]: Story[] } = {};

        Object.entries(allStories).forEach(([storyId, story]) => {
          if (story.expiresAt > now) {
            const isCloseFriendsOnly = story.audience === "close_friends";
            const canViewStory =
              !isCloseFriendsOnly ||
              story.userId === user.uid ||
              allowedCloseFriendsOwners.has(story.userId);

            if (!canViewStory) {
              return;
            }

            if (!groupedStories[story.userId]) {
              groupedStories[story.userId] = [];
            }
            groupedStories[story.userId].push({
              id: storyId,
              ...story,
            });
          }
        });

        // Sort stories by creation time
        Object.keys(groupedStories).forEach((userId) => {
          groupedStories[userId].sort((a, b) => a.createdAt - b.createdAt);
        });

        setStories(groupedStories);

        // Display first batch of stories
        const userIds = Object.keys(groupedStories);
        const displayedUserIds = userIds.slice(0, displayedCount);
        const displayed: { [userId: string]: Story[] } = {};
        displayedUserIds.forEach((userId) => {
          displayed[userId] = groupedStories[userId];
        });
        setDisplayedStories(displayed);
        setHasMoreStories(userIds.length > displayedCount);
      } else {
        setStories({});
        setDisplayedStories({});
        setHasMoreStories(false);
      }
    } catch (error) {
      console.error("Error fetching stories:", error);
    }
  }, [user, displayedCount]);

  const loadMoreStories = () => {
    const userIds = Object.keys(stories);
    const newCount = displayedCount + 10;
    const displayedUserIds = userIds.slice(0, newCount);
    const displayed: { [userId: string]: Story[] } = {};
    displayedUserIds.forEach((userId) => {
      displayed[userId] = stories[userId];
    });
    setDisplayedStories(displayed);
    setDisplayedCount(newCount);
    setHasMoreStories(userIds.length > newCount);
  };

  const cleanupExpiredStories = useCallback(async () => {
    try {
      const db = getDatabase();
      const storiesRef = ref(db, "stories");
      const snapshot = await get(storiesRef);

      if (snapshot.exists()) {
        const allStories = snapshot.val() as Record<string, StoryRecord>;
        const now = Date.now();

        Object.entries(allStories).forEach(async ([storyId, story]) => {
          if (story.expiresAt <= now) {
            await remove(ref(db, `stories/${storyId}`));
          }
        });

        fetchStories();
      }
    } catch (error) {
      console.error("Error cleaning up stories:", error);
    }
  }, [fetchStories]);

  const fetchCloseFriendsCount = useCallback(async () => {
    if (!user) {
      setCloseFriendsCount(0);
      return;
    }

    try {
      const db = getDatabase();
      const snapshot = await get(ref(db, `closeFriends/${user.uid}`));
      if (!snapshot.exists()) {
        setCloseFriendsCount(0);
        return;
      }
      const closeFriends = snapshot.val() as Record<string, unknown>;
      setCloseFriendsCount(Object.keys(closeFriends).length);
    } catch (error) {
      console.error("Error fetching close friends:", error);
      setCloseFriendsCount(0);
    }
  }, [user]);

  useEffect(() => {
    fetchStories();
    fetchCloseFriendsCount();
    // Cleanup expired stories every minute
    const interval = setInterval(cleanupExpiredStories, 60000);
    return () => clearInterval(interval);
  }, [fetchStories, fetchCloseFriendsCount, cleanupExpiredStories]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        description: "Please select an image or video",
        variant: "destructive",
      });
      return;
    }

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
    setIsUploadDialogOpen(false);
    setIsEditorOpen(true);
  };

  const handleEditorSave = async (
    editedBlob: Blob,
    metadata?: { mentions?: string[] },
  ) => {
    if (!user) return;

    setIsUploading(true);
    setIsEditorOpen(false);

    try {
      const db = getDatabase();
      const fileName = `stories/${user.uid}/${Date.now()}.jpg`;

      // Convert blob to file
      const editedFile = new File([editedBlob], "story.jpg", {
        type: "image/jpeg",
      });
      const mediaUrl = await uploadToStorage(editedFile, fileName);

      const storiesRef = ref(db, "stories");
      const newStoryRef = push(storiesRef);

      const now = Date.now();
      const expiresAt = now + 24 * 60 * 60 * 1000; // 24 hours from now

      await set(newStoryRef, {
        userId: user.uid,
        username: user.displayName || user.email?.split("@")[0] || "user",
        userAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        mediaUrl,
        mediaType: "image",
        audience: storyAudience,
        mentions: metadata?.mentions || [],
        createdAt: now,
        expiresAt,
      });

      if (metadata?.mentions?.length && newStoryRef.key) {
        await sendMentionNotifications({
          actorUserId: user.uid,
          actorUsername: user.displayName || user.email?.split("@")[0] || "user",
          actorAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          text: metadata.mentions.map((username) => `@${username}`).join(" "),
          sourceType: "story",
          sourceId: newStoryRef.key,
          storyId: newStoryRef.key,
          usernames: metadata.mentions,
        });
      }

      setSelectedFile(null);
      setPreviewUrl(null);
      setStoryAudience("public");
      fetchStories();

      toast({
        title: "Story Posted",
        description:
          storyAudience === "close_friends"
            ? "Close friends story shared for 24 hours"
            : "Your story will be visible for 24 hours",
      });
    } catch (error: unknown) {
      console.error("Error uploading story:", error);
      toast({
        title: "Error",
        description: "Failed to upload story",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditorCancel = () => {
    setIsEditorOpen(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setStoryAudience("public");
  };

  const handleUploadStory = async () => {
    if (!user || !selectedFile) return;
    if (storyAudience === "close_friends" && closeFriendsCount === 0) {
      toast({
        title: "No Close Friends Added",
        description: "Add close friends in Settings > Privacy before sharing.",
        variant: "destructive",
      });
      return;
    }

    // For videos, upload directly without editing
    if (selectedFile.type.startsWith("video/")) {
      setIsUploading(true);
      try {
        const db = getDatabase();
        const fileExtension = selectedFile.name.split(".").pop();
        const fileName = `stories/${user.uid}/${Date.now()}.${fileExtension}`;

        const mediaUrl = await uploadToStorage(selectedFile, fileName);

        const storiesRef = ref(db, "stories");
        const newStoryRef = push(storiesRef);

        const now = Date.now();
        const expiresAt = now + 24 * 60 * 60 * 1000;

        await set(newStoryRef, {
          userId: user.uid,
          username: user.displayName || user.email?.split("@")[0] || "user",
          userAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          mediaUrl,
          mediaType: "video",
          audience: storyAudience,
          mentions: [],
          createdAt: now,
          expiresAt,
        });

        setIsUploadDialogOpen(false);
        setSelectedFile(null);
        setPreviewUrl(null);
        setStoryAudience("public");
        fetchStories();

        toast({
          title: "Story Posted",
          description:
            storyAudience === "close_friends"
              ? "Close friends story shared for 24 hours"
              : "Your story will be visible for 24 hours",
        });
      } catch (error: unknown) {
        console.error("Error uploading story:", error);
        toast({
          title: "Error",
          description: "Failed to upload story",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    } else {
      // For images, open editor
      setIsUploadDialogOpen(false);
      setIsEditorOpen(true);
    }
  };

  const handleViewStory = (userId: string) => {
    setCurrentStoryUser(userId);
    setCurrentStoryIndex(0);
    setIsViewDialogOpen(true);
  };

  const handleNextStory = () => {
    if (!currentStoryUser) return;
    const userStories = stories[currentStoryUser];

    if (currentStoryIndex < userStories.length - 1) {
      setCurrentStoryIndex((prev) => prev + 1);
    } else {
      // Move to next user's stories
      const userIds = Object.keys(stories);
      const currentUserIndex = userIds.indexOf(currentStoryUser);
      if (currentUserIndex < userIds.length - 1) {
        const nextUserId = userIds[currentUserIndex + 1];
        setCurrentStoryUser(nextUserId);
        setCurrentStoryIndex(0);
      } else {
        setIsViewDialogOpen(false);
      }
    }
  };

  const handlePrevStory = () => {
    if (!currentStoryUser) return;

    if (currentStoryIndex > 0) {
      setCurrentStoryIndex((prev) => prev - 1);
    } else {
      // Move to previous user's stories
      const userIds = Object.keys(stories);
      const currentUserIndex = userIds.indexOf(currentStoryUser);
      if (currentUserIndex > 0) {
        const prevUserId = userIds[currentUserIndex - 1];
        setCurrentStoryUser(prevUserId);
        setCurrentStoryIndex(stories[prevUserId].length - 1);
      }
    }
  };

  const currentStory =
    currentStoryUser && stories[currentStoryUser]?.[currentStoryIndex];
  const hasOwnStory = user && stories[user.uid]?.length > 0;
  const ownLatestStory =
    hasOwnStory && user ? stories[user.uid][stories[user.uid].length - 1] : null;

  return (
    <>
      <div className="border-b border-border bg-card">
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-4 p-4">
            {/* Your Story */}
            {user && (
              <div
                className="flex flex-col items-center gap-1 cursor-pointer group"
                onClick={() =>
                  hasOwnStory
                    ? handleViewStory(user.uid)
                    : setIsUploadDialogOpen(true)
                }
              >
                <div
                  className={`${
                    hasOwnStory
                      ? ownLatestStory?.audience === "close_friends"
                        ? "p-[2px] bg-green-500 rounded-full"
                        : "p-[2px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500 rounded-full"
                      : "p-[2px] bg-muted rounded-full"
                  }`}
                >
                  <div className="p-[3px] bg-background rounded-full relative">
                    <Avatar className="h-16 w-16 transition-transform group-hover:scale-105">
                      <AvatarImage
                        src={getSafeAvatarUrl(user.photoURL, user.uid)}
                        alt="Your story"
                      />
                      <AvatarFallback>
                        {user.displayName?.[0] || "Y"}
                      </AvatarFallback>
                    </Avatar>
                    {!hasOwnStory && (
                      <div className="absolute bottom-0 right-0 bg-blue-500 rounded-full p-1">
                        <Plus className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                </div>
                <span className="text-xs max-w-[70px] truncate text-foreground">
                  Your story
                </span>
              </div>
            )}

            {/* Other Users' Stories */}
            {Object.entries(displayedStories)
              .filter(([userId]) => userId !== user?.uid)
              .map(([userId, userStories]) => {
                const latestStory = userStories[userStories.length - 1];
                return (
                  <div
                    key={userId}
                    className="flex flex-col items-center gap-1 cursor-pointer group"
                    onClick={() => handleViewStory(userId)}
                  >
                    <div
                      className={`p-[2px] rounded-full ${
                        latestStory.audience === "close_friends"
                          ? "bg-green-500"
                          : "bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-500"
                      }`}
                    >
                      <div className="p-[3px] bg-background rounded-full">
                        <Avatar className="h-16 w-16 transition-transform group-hover:scale-105">
                          <AvatarImage
                            src={getSafeAvatarUrl(
                              latestStory.userAvatar,
                              latestStory.username,
                            )}
                            alt={latestStory.username}
                          />
                          <AvatarFallback>
                            {latestStory.username[0].toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    </div>
                    <span className="text-xs max-w-[70px] truncate text-foreground">
                      {latestStory.username}
                    </span>
                  </div>
                );
              })}

            {/* Load More Stories Button */}
            {hasMoreStories && (
              <div
                className="flex flex-col items-center gap-1 cursor-pointer group"
                onClick={loadMoreStories}
              >
                <div className="p-[2px] bg-muted rounded-full">
                  <div className="p-[3px] bg-background rounded-full">
                    <div className="h-16 w-16 rounded-full bg-secondary flex items-center justify-center transition-transform group-hover:scale-105">
                      <span className="text-xs font-medium text-muted-foreground">
                        More
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">Load more</span>
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>

      {/* Upload Story Dialog */}
      <Dialog
        open={isUploadDialogOpen}
        onOpenChange={(open) => {
          setIsUploadDialogOpen(open);
          if (!open) {
            setSelectedFile(null);
            setPreviewUrl(null);
            setStoryAudience("public");
          }
        }}
      >
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create Story</DialogTitle>
            <DialogDescription>
              Select a photo or video to share as a 24-hour story.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium">Story Audience</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={storyAudience === "public" ? "default" : "outline"}
                  onClick={() => setStoryAudience("public")}
                >
                  Public
                </Button>
                <Button
                  type="button"
                  variant={
                    storyAudience === "close_friends" ? "default" : "outline"
                  }
                  onClick={() => setStoryAudience("close_friends")}
                >
                  Close Friends
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {storyAudience === "close_friends"
                  ? `Only your ${closeFriendsCount} close friend${closeFriendsCount === 1 ? "" : "s"} can view.`
                  : "Visible to everyone who can view your stories."}
              </p>
            </div>
            {!selectedFile ? (
              <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                <Input
                  id="story-upload"
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <label htmlFor="story-upload" className="cursor-pointer">
                  <div className="flex flex-col items-center gap-2">
                    <Plus className="h-12 w-12 text-muted-foreground" />
                    <p className="text-lg font-semibold">
                      Select photo or video
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Story will be visible for 24 hours
                    </p>
                    <Button type="button" variant="default" className="mt-2">
                      Choose File
                    </Button>
                  </div>
                </label>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative aspect-[9/16] max-h-[500px] bg-muted rounded-lg overflow-hidden">
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
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                    className="flex-1"
                  >
                    Change
                  </Button>
                  <Button
                    onClick={handleUploadStory}
                    disabled={isUploading}
                    className="flex-1"
                  >
                    {isUploading ? "Uploading..." : "Share Story"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* View Story Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-[500px] p-0 bg-black">
          {currentStory && (
            <div className="relative aspect-[9/16] max-h-[90vh]">
              {/* Story Progress Bars */}
              <div className="absolute top-2 left-2 right-2 flex gap-1 z-10">
                {currentStoryUser &&
                  stories[currentStoryUser].map((_, index) => (
                    <div
                      key={index}
                      className="flex-1 h-1 bg-white/30 rounded-full overflow-hidden"
                    >
                      <div
                        className={`h-full bg-white transition-all ${index === currentStoryIndex ? "w-full" : index < currentStoryIndex ? "w-full" : "w-0"}`}
                      />
                    </div>
                  ))}
              </div>

              {/* User Info */}
              <div className="absolute top-6 left-4 right-4 flex items-center gap-2 z-10">
                <Avatar className="h-10 w-10 border-2 border-white">
                  <AvatarImage
                    src={getSafeAvatarUrl(
                      currentStory.userAvatar,
                      currentStory.username,
                    )}
                  />
                  <AvatarFallback>{currentStory.username[0]}</AvatarFallback>
                </Avatar>
                <span className="text-white font-semibold">
                  {currentStory.username}
                </span>
                {currentStory.audience === "close_friends" && (
                  <span className="rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase text-white">
                    Close Friends
                  </span>
                )}
                <span className="text-white/70 text-sm ml-auto">
                  {Math.floor((Date.now() - currentStory.createdAt) / 3600000)}h
                  ago
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-white hover:bg-white/20"
                  onClick={() => setIsViewDialogOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Story Media */}
              {currentStory.mediaType === "video" ? (
                <video
                  src={currentStory.mediaUrl}
                  className="w-full h-full object-contain"
                  autoPlay
                />
              ) : (
                <img
                  src={currentStory.mediaUrl}
                  alt="Story"
                  className="w-full h-full object-contain"
                />
              )}

              {/* Navigation */}
              <button
                onClick={handlePrevStory}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                disabled={
                  currentStoryIndex === 0 &&
                  Object.keys(stories).indexOf(currentStoryUser!) === 0
                }
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={handleNextStory}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Story Editor */}
      {isEditorOpen && selectedFile && previewUrl && (
        <StoryEditor
          file={selectedFile}
          previewUrl={previewUrl}
          onSave={handleEditorSave}
          onCancel={handleEditorCancel}
        />
      )}
    </>
  );
}
