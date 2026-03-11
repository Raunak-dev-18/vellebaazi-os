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
import {
  decryptFromRecipientPayload,
  encryptForRecipients,
  ensureUserE2EEIdentity,
} from "@/utils/e2ee";

interface Story {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  encryptedMediaUrl?: string;
  encryptedMediaIv?: string;
  encryptedMediaKeys?: Record<
    string,
    { wrappedKey: string; wrappedAt: string; wrappedBy: string; alg: "RSA-OAEP" }
  >;
  isEncrypted?: boolean;
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
  encryptedMediaUrl?: string;
  encryptedMediaIv?: string;
  encryptedMediaKeys?: Record<
    string,
    { wrappedKey: string; wrappedAt: string; wrappedBy: string; alg: "RSA-OAEP" }
  >;
  isEncrypted?: boolean;
  audience?: "public" | "close_friends";
  mentions?: string[];
  createdAt: number;
  expiresAt: number;
}

const formatStoryAge = (createdAt: number) => {
  const diffMs = Date.now() - createdAt;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

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
  const [storyProgress, setStoryProgress] = useState(0);

  useEffect(() => {
    if (!user) return;
    ensureUserE2EEIdentity(user.uid).catch(() => {
      // Keep stories functional even if crypto key setup fails.
    });
  }, [user]);

  const resolveCloseFriendsRecipients = useCallback(async () => {
    if (!user) return [user?.uid].filter(Boolean) as string[];
    const db = getDatabase();
    const snapshot = await get(ref(db, `closeFriends/${user.uid}`));
    const recipients = new Set<string>([user.uid]);
    if (snapshot.exists()) {
      const closeFriends = snapshot.val() as Record<string, unknown>;
      Object.keys(closeFriends).forEach((uid) => recipients.add(uid));
    }
    return Array.from(recipients);
  }, [user]);

  const fetchStories = useCallback(async () => {
    if (!user) return;

    try {
      const db = getDatabase();
      const storiesRef = ref(db, "stories");
      const snapshot = await get(storiesRef);
      const followingSnapshot = await get(ref(db, `following/${user.uid}`));
      const followingOwners = new Set<string>([user.uid]);

      if (followingSnapshot.exists()) {
        const following = followingSnapshot.val() as Record<string, unknown>;
        Object.keys(following).forEach((uid) => followingOwners.add(uid));
      }

      if (snapshot.exists()) {
        const allStories = snapshot.val() as Record<string, StoryRecord>;
        const now = Date.now();
        const ownersToCheck = new Set<string>();

        Object.values(allStories).forEach((story) => {
          if (
            story.expiresAt > now &&
            story.userId !== user.uid &&
            (story.audience === "close_friends" ||
              !followingOwners.has(story.userId))
          ) {
            ownersToCheck.add(story.userId);
          }
        });

        const closeFriendsOwners = new Set<string>();
        await Promise.all(
          Array.from(ownersToCheck).map(async (ownerId) => {
            try {
              const canViewSnapshot = await get(
                ref(db, `closeFriends/${ownerId}/${user.uid}`),
              );
              if (canViewSnapshot.exists()) {
                closeFriendsOwners.add(ownerId);
              }
            } catch {
              // Ignore inaccessible/missing owner close-friends entries so one
              // failing lookup does not hide all stories.
            }
          }),
        );

        // Group stories by user and filter expired/unauthorized ones.
        const groupedStories: { [userId: string]: Story[] } = {};

        for (const [storyId, story] of Object.entries(allStories)) {
          if (story.expiresAt <= now) continue;

          const isOwnStory = story.userId === user.uid;
          const isFollowedOwner = followingOwners.has(story.userId);
          const isCloseFriendOwner = closeFriendsOwners.has(story.userId);
          const isCloseFriendsOnly = story.audience === "close_friends";

          const canViewStory =
            isOwnStory ||
            (isCloseFriendsOnly && isCloseFriendOwner) ||
            (!isCloseFriendsOnly && (isFollowedOwner || isCloseFriendOwner));

          if (!canViewStory) {
            continue;
          }

          let resolvedMediaUrl = story.mediaUrl;
          if (
            story.isEncrypted &&
            story.encryptedMediaUrl &&
            story.encryptedMediaIv &&
            story.encryptedMediaKeys
          ) {
            const decrypted = await decryptFromRecipientPayload({
              userId: user.uid,
              payload: {
                ciphertext: story.encryptedMediaUrl,
                iv: story.encryptedMediaIv,
                wrappedKeys: story.encryptedMediaKeys,
              },
            });
            if (!decrypted) {
              continue;
            }
            resolvedMediaUrl = decrypted;
          }

          if (!groupedStories[story.userId]) {
            groupedStories[story.userId] = [];
          }

          groupedStories[story.userId].push({
            id: storyId,
            ...story,
            mediaUrl: resolvedMediaUrl,
          });
        }

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
      let encryptedPayload:
        | Awaited<ReturnType<typeof encryptForRecipients>>
        | null = null;

      if (storyAudience === "close_friends") {
        const recipients = await resolveCloseFriendsRecipients();
        encryptedPayload = await encryptForRecipients({
          ownerUserId: user.uid,
          recipientUserIds: recipients,
          plaintext: mediaUrl,
        });
        if (!encryptedPayload) {
          throw new Error("Failed to encrypt close friends story");
        }
      }

      await set(newStoryRef, {
        userId: user.uid,
        username: user.displayName || user.email?.split("@")[0] || "user",
        userAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        mediaUrl: storyAudience === "close_friends" ? "" : mediaUrl,
        mediaType: "image",
        audience: storyAudience,
        encryptedMediaUrl: encryptedPayload?.ciphertext || null,
        encryptedMediaIv: encryptedPayload?.iv || null,
        encryptedMediaKeys: encryptedPayload?.wrappedKeys || null,
        isEncrypted: Boolean(encryptedPayload),
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
        let encryptedPayload:
          | Awaited<ReturnType<typeof encryptForRecipients>>
          | null = null;

        if (storyAudience === "close_friends") {
          const recipients = await resolveCloseFriendsRecipients();
          encryptedPayload = await encryptForRecipients({
            ownerUserId: user.uid,
            recipientUserIds: recipients,
            plaintext: mediaUrl,
          });
          if (!encryptedPayload) {
            throw new Error("Failed to encrypt close friends story");
          }
        }

        await set(newStoryRef, {
          userId: user.uid,
          username: user.displayName || user.email?.split("@")[0] || "user",
          userAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          mediaUrl: storyAudience === "close_friends" ? "" : mediaUrl,
          mediaType: "video",
          audience: storyAudience,
          encryptedMediaUrl: encryptedPayload?.ciphertext || null,
          encryptedMediaIv: encryptedPayload?.iv || null,
          encryptedMediaKeys: encryptedPayload?.wrappedKeys || null,
          isEncrypted: Boolean(encryptedPayload),
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

  const handleNextStory = useCallback(() => {
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
  }, [currentStoryIndex, currentStoryUser, stories]);

  const handlePrevStory = useCallback(() => {
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
  }, [currentStoryIndex, currentStoryUser, stories]);

  const currentStory =
    currentStoryUser && stories[currentStoryUser]?.[currentStoryIndex];
  const hasOwnStory = user && stories[user.uid]?.length > 0;
  const ownLatestStory =
    hasOwnStory && user ? stories[user.uid][stories[user.uid].length - 1] : null;

  useEffect(() => {
    if (!isViewDialogOpen || !currentStory) {
      setStoryProgress(0);
      return;
    }

    const durationMs = currentStory.mediaType === "video" ? 10000 : 6000;
    const tickMs = 100;
    let elapsed = 0;
    setStoryProgress(0);

    const timer = window.setInterval(() => {
      elapsed += tickMs;
      const nextProgress = Math.min(100, (elapsed / durationMs) * 100);
      setStoryProgress(nextProgress);
      if (elapsed >= durationMs) {
        window.clearInterval(timer);
        handleNextStory();
      }
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [currentStory, handleNextStory, isViewDialogOpen]);

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
        <DialogContent className="border-0 bg-transparent p-0 shadow-none sm:max-w-[420px]">
          {currentStory && (
            <div className="relative mx-auto aspect-[9/16] max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 bg-black">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-black/70 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-28 bg-gradient-to-t from-black/70 to-transparent" />

              {/* Story Progress Bars */}
              <div className="absolute left-3 right-3 top-3 z-20 flex gap-1">
                {currentStoryUser &&
                  stories[currentStoryUser].map((_, index) => (
                    <div
                      key={index}
                      className="h-1 flex-1 overflow-hidden rounded-full bg-white/25"
                    >
                      <div
                        className="h-full bg-white transition-[width] duration-100 ease-linear"
                        style={{
                          width:
                            index < currentStoryIndex
                              ? "100%"
                              : index === currentStoryIndex
                                ? `${storyProgress}%`
                                : "0%",
                        }}
                      />
                    </div>
                  ))}
              </div>

              {/* User Info */}
              <div className="absolute left-4 right-4 top-7 z-20 flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-white/80">
                  <AvatarImage
                    src={getSafeAvatarUrl(
                      currentStory.userAvatar,
                      currentStory.username,
                    )}
                  />
                  <AvatarFallback>{currentStory.username[0]}</AvatarFallback>
                </Avatar>
                <span className="max-w-[120px] truncate text-sm font-semibold text-white">
                  {currentStory.username}
                </span>
                {currentStory.audience === "close_friends" && (
                  <span className="rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Close Friends
                  </span>
                )}
                <span className="ml-auto text-xs text-white/80">
                  {formatStoryAge(currentStory.createdAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-white hover:bg-white/15"
                  onClick={() => setIsViewDialogOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Story Media */}
              {currentStory.mediaType === "video" ? (
                <video
                  src={currentStory.mediaUrl}
                  className="h-full w-full object-cover"
                  autoPlay
                  muted
                  playsInline
                />
              ) : (
                <img
                  src={currentStory.mediaUrl}
                  alt="Story"
                  className="h-full w-full object-cover"
                />
              )}

              {/* Navigation */}
              <button
                onClick={handlePrevStory}
                className="absolute inset-y-0 left-0 z-20 w-1/2"
                disabled={
                  currentStoryIndex === 0 &&
                  Object.keys(stories).indexOf(currentStoryUser!) === 0
                }
                aria-label="Previous story"
              >
                <span className="sr-only">Previous story</span>
              </button>
              <button
                onClick={handleNextStory}
                className="absolute inset-y-0 right-0 z-20 w-1/2"
                aria-label="Next story"
              >
                <span className="sr-only">Next story</span>
              </button>

              <div className="pointer-events-none absolute inset-y-0 left-2 z-20 flex items-center">
                <ChevronLeft className="h-5 w-5 text-white/65" />
              </div>
              <div className="pointer-events-none absolute inset-y-0 right-2 z-20 flex items-center">
                <ChevronRight className="h-5 w-5 text-white/65" />
              </div>
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
