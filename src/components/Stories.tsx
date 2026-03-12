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
import { Plus, X, ChevronLeft, ChevronRight, Heart, MessageCircle, Send, SmilePlus } from "lucide-react";
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getDatabase, ref, get, set, push, remove, onValue } from "firebase/database";
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
import { getBlockStatus } from "@/utils/blocking";

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

interface StoryReaction {
  userId: string;
  emoji: string;
  username?: string;
  userAvatar?: string;
  createdAt?: number | string;
}

interface StoryComment {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  text: string;
  createdAt: number;
}

const QUICK_STORY_REACTIONS = ["\u2764\uFE0F", "\uD83D\uDD25", "\uD83D\uDE02", "\uD83D\uDE2E", "\uD83D\uDC4F", "\uD83D\uDE0D"];

const parseStoryTimestamp = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return asDate;
  }
  return 0;
};

const normalizeStoryRecord = (
  value: unknown,
  fallbackUserId?: string,
): StoryRecord | null => {
  if (!value || typeof value !== "object") return null;

  const raw = value as Record<string, unknown>;
  const userId =
    typeof raw.userId === "string" && raw.userId.trim()
      ? raw.userId
      : fallbackUserId;
  if (!userId) return null;

  const expiresAt = parseStoryTimestamp(raw.expiresAt);
  if (!expiresAt) return null;
  const createdAt = parseStoryTimestamp(raw.createdAt) || Date.now();

  const mediaType = raw.mediaType === "video" ? "video" : "image";
  const audience =
    raw.audience === "close_friends" || raw.audience === "public"
      ? raw.audience
      : "public";

  return {
    userId,
    username:
      typeof raw.username === "string" && raw.username.trim()
        ? raw.username
        : "user",
    userAvatar: typeof raw.userAvatar === "string" ? raw.userAvatar : "",
    mediaUrl: typeof raw.mediaUrl === "string" ? raw.mediaUrl : "",
    mediaType,
    encryptedMediaUrl:
      typeof raw.encryptedMediaUrl === "string" ? raw.encryptedMediaUrl : undefined,
    encryptedMediaIv:
      typeof raw.encryptedMediaIv === "string" ? raw.encryptedMediaIv : undefined,
    encryptedMediaKeys:
      raw.encryptedMediaKeys && typeof raw.encryptedMediaKeys === "object"
        ? (raw.encryptedMediaKeys as StoryRecord["encryptedMediaKeys"])
        : undefined,
    isEncrypted: Boolean(raw.isEncrypted),
    audience,
    mentions: Array.isArray(raw.mentions)
      ? (raw.mentions.filter((entry): entry is string => typeof entry === "string") as string[])
      : undefined,
    createdAt,
    expiresAt,
  };
};

const formatStoryAge = (createdAt: number) => {
  const diffMs = Date.now() - createdAt;
  const minutes = Math.max(1, Math.floor(diffMs / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

const getChatId = (left: string, right: string) => [left, right].sort().join("_");

const normalizeStoryReaction = (
  uid: string,
  value: unknown,
): StoryReaction | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.emoji !== "string" || !raw.emoji.trim()) return null;

  return {
    userId: typeof raw.userId === "string" ? raw.userId : uid,
    emoji: raw.emoji,
    username: typeof raw.username === "string" ? raw.username : undefined,
    userAvatar: typeof raw.userAvatar === "string" ? raw.userAvatar : undefined,
    createdAt:
      typeof raw.createdAt === "number" || typeof raw.createdAt === "string"
        ? raw.createdAt
        : undefined,
  };
};

const normalizeStoryComment = (
  id: string,
  value: unknown,
): StoryComment | null => {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.userId !== "string") return null;
  if (typeof raw.text !== "string" || !raw.text.trim()) return null;

  return {
    id,
    userId: raw.userId,
    username:
      typeof raw.username === "string" && raw.username.trim()
        ? raw.username
        : "user",
    userAvatar: typeof raw.userAvatar === "string" ? raw.userAvatar : "",
    text: raw.text.trim(),
    createdAt: parseStoryTimestamp(raw.createdAt) || Date.now(),
  };
};

interface StoriesProps {
  viewerOnly?: boolean;
  initialStoryUserId?: string;
  initialStoryId?: string;
}

export function Stories({
  viewerOnly = false,
  initialStoryUserId,
  initialStoryId,
}: StoriesProps = {}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
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
  const [storyReactionMap, setStoryReactionMap] = useState<Record<string, StoryReaction>>({});
  const [storyComments, setStoryComments] = useState<StoryComment[]>([]);
  const [storyCommentInput, setStoryCommentInput] = useState("");
  const [storyReplyInput, setStoryReplyInput] = useState("");
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [storyActionBusy, setStoryActionBusy] = useState<
    null | "reaction" | "comment" | "reply"
  >(null);

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
        const rawStories = snapshot.val() as Record<string, unknown>;
        const allStories: Record<string, StoryRecord> = {};

        Object.entries(rawStories).forEach(([storyId, value]) => {
          const directRecord = normalizeStoryRecord(value);
          if (directRecord) {
            allStories[storyId] = directRecord;
            return;
          }

          if (value && typeof value === "object") {
            Object.entries(value as Record<string, unknown>).forEach(
              ([nestedStoryId, nestedValue]) => {
                const nestedRecord = normalizeStoryRecord(nestedValue, storyId);
                if (!nestedRecord) return;
                allStories[`${storyId}:${nestedStoryId}`] = nestedRecord;
              },
            );
          }
        });

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
            try {
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
            } catch {
              // Skip only this story if its encrypted payload is stale/corrupt.
              continue;
            }
          }

          if (!resolvedMediaUrl) continue;

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
  useEffect(() => {
    if (!viewerOnly || !initialStoryUserId || !initialStoryId) return;

    const userStories = stories[initialStoryUserId];
    if (!userStories?.length) return;

    const targetIndex = userStories.findIndex((story) => story.id === initialStoryId);
    if (targetIndex === -1) {
      navigate(`/story/${initialStoryUserId}/${userStories[0].id}`, {
        replace: true,
      });
      return;
    }

    setCurrentStoryUser(initialStoryUserId);
    setCurrentStoryIndex(targetIndex);
    setIsViewDialogOpen(true);
  }, [
    initialStoryId,
    initialStoryUserId,
    navigate,
    stories,
    viewerOnly,
  ]);

  useEffect(() => {
    if (!viewerOnly || !initialStoryUserId || !initialStoryId) return;
    if (Object.keys(stories).length === 0) return;
    if (!stories[initialStoryUserId]?.length) {
      navigate("/", { replace: true });
    }
  }, [
    initialStoryId,
    initialStoryUserId,
    navigate,
    stories,
    viewerOnly,
  ]);

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
    const firstStory = stories[userId]?.[0];
    if (!firstStory) return;
    navigate(`/story/${userId}/${firstStory.id}`);
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
        if (viewerOnly) {
          navigate("/");
        } else {
          setIsViewDialogOpen(false);
        }
      }
    }
  }, [currentStoryIndex, currentStoryUser, navigate, stories, viewerOnly]);

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
  }, [currentStoryIndex, currentStoryUser, navigate, stories, viewerOnly]);

  const currentStory =
    currentStoryUser && stories[currentStoryUser]?.[currentStoryIndex];
  const hasOwnStory = user && stories[user.uid]?.length > 0;
  const ownLatestStory =
    hasOwnStory && user ? stories[user.uid][stories[user.uid].length - 1] : null;
  const currentStoryId = currentStory?.id || "";
  const storyUserIds = Object.keys(stories);
  const currentUserStories = currentStoryUser
    ? stories[currentStoryUser] || []
    : [];
  const currentStoryUserOrder = currentStoryUser
    ? storyUserIds.indexOf(currentStoryUser)
    : -1;
  const isAtFirstStory = currentStoryIndex === 0 && currentStoryUserOrder <= 0;
  const isAtLastStory =
    currentStoryIndex === currentUserStories.length - 1 &&
    currentStoryUserOrder === storyUserIds.length - 1;
  const isStoryViewerOpen = viewerOnly || isViewDialogOpen;

  useEffect(() => {
    if (!viewerOnly || !currentStory) return;
    if (
      currentStory.userId === initialStoryUserId &&
      currentStory.id === initialStoryId
    ) {
      return;
    }

    navigate(`/story/${currentStory.userId}/${currentStory.id}`, {
      replace: true,
    });
  }, [
    currentStory,
    initialStoryId,
    initialStoryUserId,
    navigate,
    viewerOnly,
  ]);

  useEffect(() => {
    if (!isStoryViewerOpen || !currentStory) {
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
  }, [currentStory, handleNextStory, isStoryViewerOpen]);

  useEffect(() => {
    if (!isStoryViewerOpen || !currentStoryId) {
      setStoryReactionMap({});
      setStoryComments([]);
      setStoryCommentInput("");
      setStoryReplyInput("");
      return;
    }

    const db = getDatabase();
    const reactionsRef = ref(db, `storyReactions/${currentStoryId}`);
    const commentsRef = ref(db, `storyComments/${currentStoryId}`);

    const unsubReactions = onValue(reactionsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setStoryReactionMap({});
        return;
      }

      const rows = snapshot.val() as Record<string, unknown>;
      const next: Record<string, StoryReaction> = {};
      Object.entries(rows).forEach(([uid, value]) => {
        const parsed = normalizeStoryReaction(uid, value);
        if (parsed) {
          next[uid] = parsed;
        }
      });
      setStoryReactionMap(next);
    });

    const unsubComments = onValue(commentsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setStoryComments([]);
        return;
      }

      const rows = snapshot.val() as Record<string, unknown>;
      const parsed = Object.entries(rows)
        .map(([id, value]) => normalizeStoryComment(id, value))
        .filter((entry): entry is StoryComment => Boolean(entry))
        .sort((a, b) => a.createdAt - b.createdAt);
      setStoryComments(parsed);
    });

    return () => {
      unsubReactions();
      unsubComments();
    };
  }, [currentStoryId, isStoryViewerOpen]);

  const reactionSummary = useMemo(() => {
    const grouped = new Map<string, { count: number; mine: boolean }>();
    Object.entries(storyReactionMap).forEach(([uid, reaction]) => {
      if (!reaction.emoji) return;
      const existing = grouped.get(reaction.emoji) || { count: 0, mine: false };
      existing.count += 1;
      if (uid === user?.uid) {
        existing.mine = true;
      }
      grouped.set(reaction.emoji, existing);
    });

    return Array.from(grouped.entries()).map(([emoji, value]) => ({
      emoji,
      count: value.count,
      mine: value.mine,
    }));
  }, [storyReactionMap, user?.uid]);

  const handleReactToStory = async (emoji: string) => {
    if (!user || !currentStory) return;
    if (!emoji.trim()) return;

    try {
      setStoryActionBusy("reaction");
      if (currentStory.userId !== user.uid) {
        const blockStatus = await getBlockStatus(user.uid, currentStory.userId);
        if (blockStatus.blockedEither) {
          toast({
            title: "Action blocked",
            description: blockStatus.blockedByMe
              ? "Unblock this user first."
              : "You cannot react to this story.",
            variant: "destructive",
          });
          return;
        }
      }

      const db = getDatabase();
      const myCurrentReaction = storyReactionMap[user.uid]?.emoji;
      const reactionRef = ref(db, `storyReactions/${currentStory.id}/${user.uid}`);

      if (myCurrentReaction === emoji) {
        await remove(reactionRef);
      } else {
        await set(reactionRef, {
          userId: user.uid,
          emoji,
          username: user.displayName || user.email?.split("@")[0] || "user",
          userAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          createdAt: Date.now(),
        });

        if (currentStory.userId !== user.uid) {
          await set(push(ref(db, `notifications/${currentStory.userId}`)), {
            type: "story_reaction",
            fromUserId: user.uid,
            fromUsername: user.displayName || user.email?.split("@")[0] || "user",
            fromAvatar:
              user.photoURL ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
            message: `reacted ${emoji} to your story.`,
            sourceType: "story",
            sourceId: currentStory.id,
            storyId: currentStory.id,
            timestamp: new Date().toISOString(),
            read: false,
          });
        }
      }
    } catch (error) {
      console.error("Error reacting to story:", error);
      toast({
        title: "Error",
        description: "Failed to react to story",
        variant: "destructive",
      });
    } finally {
      setStoryActionBusy(null);
    }
  };

  const handleAddStoryComment = async () => {
    if (!user || !currentStory) return;
    const text = storyCommentInput.trim();
    if (!text) return;
    if (text.length > 400) {
      toast({
        title: "Comment too long",
        description: "Keep comments under 400 characters.",
        variant: "destructive",
      });
      return;
    }

    try {
      setStoryActionBusy("comment");
      if (currentStory.userId !== user.uid) {
        const blockStatus = await getBlockStatus(user.uid, currentStory.userId);
        if (blockStatus.blockedEither) {
          toast({
            title: "Action blocked",
            description: blockStatus.blockedByMe
              ? "Unblock this user first."
              : "You cannot comment on this story.",
            variant: "destructive",
          });
          return;
        }
      }

      const db = getDatabase();
      const commentsRef = ref(db, `storyComments/${currentStory.id}`);
      await set(push(commentsRef), {
        userId: user.uid,
        username: user.displayName || user.email?.split("@")[0] || "user",
        userAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        text,
        createdAt: Date.now(),
      });

      if (currentStory.userId !== user.uid) {
        await set(push(ref(db, `notifications/${currentStory.userId}`)), {
          type: "story_comment",
          fromUserId: user.uid,
          fromUsername: user.displayName || user.email?.split("@")[0] || "user",
          fromAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          message: `commented on your story: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
          sourceType: "story",
          sourceId: currentStory.id,
          storyId: currentStory.id,
          timestamp: new Date().toISOString(),
          read: false,
        });
      }

      setStoryCommentInput("");
    } catch (error) {
      console.error("Error commenting on story:", error);
      toast({
        title: "Error",
        description: "Failed to add comment",
        variant: "destructive",
      });
    } finally {
      setStoryActionBusy(null);
    }
  };

  const handleSendStoryReply = async () => {
    if (!user || !currentStory || currentStory.userId === user.uid) return;

    const text = storyReplyInput.trim();
    if (!text) return;
    if (text.length > 1000) {
      toast({
        title: "Reply too long",
        description: "Keep replies under 1000 characters.",
        variant: "destructive",
      });
      return;
    }

    try {
      setStoryActionBusy("reply");
      const blockStatus = await getBlockStatus(user.uid, currentStory.userId);
      if (blockStatus.blockedEither) {
        toast({
          title: "Action blocked",
          description: blockStatus.blockedByMe
            ? "Unblock this user first."
            : "You cannot reply to this story.",
          variant: "destructive",
        });
        return;
      }

      const db = getDatabase();
      const chatId = getChatId(user.uid, currentStory.userId);
      const now = new Date().toISOString();

      await set(ref(db, `userChats/${user.uid}/${chatId}`), {
        otherUserId: currentStory.userId,
        otherUsername: currentStory.username,
        otherUserAvatar: currentStory.userAvatar,
        lastMessage: `Story reply: ${text}`,
        lastMessageTime: now,
      });

      await set(ref(db, `userChats/${currentStory.userId}/${chatId}`), {
        otherUserId: user.uid,
        otherUsername: user.displayName || user.email?.split("@")[0] || "user",
        otherUserAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        lastMessage: "Replied to your story",
        lastMessageTime: now,
      });

      await set(push(ref(db, `messages/${chatId}`)), {
        senderId: user.uid,
        senderName: user.displayName || user.email?.split("@")[0] || "user",
        text,
        timestamp: now,
        storyReply: {
          storyId: currentStory.id,
          mediaUrl: currentStory.mediaUrl,
          mediaType: currentStory.mediaType,
        },
      });

      await set(push(ref(db, `notifications/${currentStory.userId}`)), {
        type: "story_reply",
        fromUserId: user.uid,
        fromUsername: user.displayName || user.email?.split("@")[0] || "user",
        fromAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        message: "replied to your story.",
        sourceType: "story",
        sourceId: currentStory.id,
        storyId: currentStory.id,
        chatId,
        timestamp: now,
        read: false,
      });

      setStoryReplyInput("");
      toast({
        title: "Sent",
        description: `Reply sent to ${currentStory.username}`,
      });
    } catch (error) {
      console.error("Error sending story reply:", error);
      toast({
        title: "Error",
        description: "Failed to send DM reply",
        variant: "destructive",
      });
    } finally {
      setStoryActionBusy(null);
    }
  };

  const totalStoryReactions = Object.keys(storyReactionMap).length;
  const myReaction = user ? storyReactionMap[user.uid]?.emoji || "" : "";

  return (
    <>
      {!viewerOnly && (
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
        </>
      )}

      {/* View Story Dialog */}
      <Dialog
        open={viewerOnly ? true : isViewDialogOpen}
        onOpenChange={(open) => {
          if (viewerOnly) {
            if (!open) {
              navigate("/");
            }
            return;
          }

          setIsViewDialogOpen(open);
          if (!open) {
            setIsCommentsOpen(false);
            setStoryCommentInput("");
            setStoryReplyInput("");
          }
        }}
      >
        <DialogContent
          className={
            viewerOnly
              ? "relative flex h-screen w-screen items-center justify-center border-0 bg-black/80 p-2 shadow-none sm:max-w-none sm:p-4"
              : "border-0 bg-transparent p-0 shadow-none sm:max-w-[420px]"
          }
        >
          {currentStory && (
            <>
              {viewerOnly && (
                <div className="pointer-events-none absolute inset-0">
                  {currentStory.mediaType === "video" ? (
                    <video
                      key={`${currentStory.id}-bg`}
                      src={currentStory.mediaUrl}
                      autoPlay
                      muted
                      loop
                      playsInline
                      className="h-full w-full scale-110 object-cover opacity-35 blur-3xl"
                    />
                  ) : (
                    <img
                      src={currentStory.mediaUrl}
                      alt="Story background"
                      className="h-full w-full scale-110 object-cover opacity-35 blur-3xl"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/55" />
                </div>
            )}

              <div className="relative mx-auto aspect-[9/16] max-h-[90vh] overflow-hidden rounded-3xl border border-white/10 bg-black">
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/75 via-black/30 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-36 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

              <div className="absolute left-3 right-3 top-3 z-30 flex gap-1">
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

              <div className="absolute left-4 right-4 top-7 z-30 flex items-center gap-3">
                <Avatar className="h-9 w-9 border border-white/80">
                  <AvatarImage
                    src={getSafeAvatarUrl(
                      currentStory.userAvatar,
                      currentStory.username,
                    )}
                  />
                  <AvatarFallback>{currentStory.username[0]}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="max-w-[140px] truncate text-sm font-semibold text-white">
                    {currentStory.username}
                  </p>
                  <p className="text-[11px] text-white/75">
                    {formatStoryAge(currentStory.createdAt)}
                  </p>
                </div>
                {currentStory.audience === "close_friends" && (
                  <span className="rounded-full bg-green-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                    Close Friends
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-8 w-8 text-white hover:bg-white/15"
                  onClick={() => (viewerOnly ? navigate("/") : setIsViewDialogOpen(false))}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

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

              <button
                onClick={handlePrevStory}
                className="absolute inset-y-0 left-0 z-20 w-1/2"
                disabled={isAtFirstStory}
                aria-label="Previous story"
              >
                <span className="sr-only">Previous story</span>
              </button>
              <button
                onClick={handleNextStory}
                className="absolute inset-y-0 right-0 z-20 w-1/2"
                disabled={isAtLastStory}
                aria-label="Next story"
              >
                <span className="sr-only">Next story</span>
              </button>

              <button
                type="button"
                onClick={handlePrevStory}
                className="absolute left-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white transition hover:bg-black/65 disabled:opacity-35"
                disabled={isAtFirstStory}
                aria-label="Previous story button"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handleNextStory}
                className="absolute right-3 top-1/2 z-30 -translate-y-1/2 rounded-full bg-black/45 p-2 text-white transition hover:bg-black/65 disabled:opacity-35"
                disabled={isAtLastStory}
                aria-label="Next story button"
              >
                <ChevronRight className="h-5 w-5" />
              </button>

              <div className="absolute inset-x-3 bottom-3 z-30" onClick={(e) => e.stopPropagation()}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleReactToStory("\u2764\uFE0F")}
                    className={`inline-flex h-9 items-center gap-1 rounded-full border px-3 text-xs font-semibold transition ${
                      myReaction === "\u2764\uFE0F"
                        ? "border-rose-400 bg-rose-500/25 text-rose-100"
                        : "border-white/25 bg-black/40 text-white"
                    }`}
                    disabled={storyActionBusy === "reaction"}
                  >
                    <Heart className="h-4 w-4" />
                    {totalStoryReactions}
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsCommentsOpen(true)}
                    className="inline-flex h-9 items-center gap-1 rounded-full border border-white/25 bg-black/40 px-3 text-xs font-semibold text-white transition hover:bg-black/60"
                  >
                    <MessageCircle className="h-4 w-4" />
                    {storyComments.length}
                  </button>

                  <div className="inline-flex items-center gap-1 rounded-full border border-white/25 bg-black/40 p-1">
                    {QUICK_STORY_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleReactToStory(emoji)}
                        className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm transition ${
                          myReaction === emoji ? "bg-white/25" : "hover:bg-white/15"
                        }`}
                        disabled={storyActionBusy === "reaction"}
                        aria-label={`React with ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setIsCommentsOpen(true)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-full text-sm text-white/85 transition hover:bg-white/15"
                      aria-label="Open story comments"
                    >
                      <SmilePlus className="h-4 w-4" />
                    </button>
                  </div>

                  {reactionSummary.slice(0, 3).map((entry) => (
                    <button
                      key={entry.emoji}
                      type="button"
                      onClick={() => handleReactToStory(entry.emoji)}
                      className={`inline-flex h-8 items-center gap-1 rounded-full border px-2 text-xs ${
                        entry.mine
                          ? "border-blue-300/70 bg-blue-500/20 text-white"
                          : "border-white/20 bg-black/30 text-white/90"
                      }`}
                    >
                      <span>{entry.emoji}</span>
                      <span>{entry.count}</span>
                    </button>
                  ))}
                </div>

                {currentStory.userId !== user?.uid ? (
                  <div className="flex items-center gap-2 rounded-2xl border border-white/20 bg-black/50 px-2 py-2 backdrop-blur-sm">
                    <Input
                      value={storyReplyInput}
                      onChange={(e) => setStoryReplyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSendStoryReply();
                        }
                      }}
                      placeholder={`Reply to ${currentStory.username}...`}
                      className="h-9 border-0 bg-transparent text-white placeholder:text-white/60 focus-visible:ring-0 focus-visible:ring-offset-0"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-white hover:bg-white/15"
                      onClick={handleSendStoryReply}
                      disabled={storyActionBusy === "reply" || !storyReplyInput.trim()}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border border-white/15 bg-black/45 px-3 py-2 text-xs text-white/90 backdrop-blur-sm">
                    Your story - {storyComments.length} comments - {totalStoryReactions} reactions
                  </div>
                )}
              </div>
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCommentsOpen} onOpenChange={setIsCommentsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Story comments</DialogTitle>
            <DialogDescription>
              Reactions and comments on this story.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
            {totalStoryReactions} reactions - {storyComments.length} comments
          </div>

          <ScrollArea className="h-72 rounded-md border border-border p-2">
            {storyComments.length === 0 ? (
              <p className="p-3 text-sm text-muted-foreground">No comments yet.</p>
            ) : (
              <div className="space-y-3">
                {storyComments.map((comment) => (
                  <div key={comment.id} className="flex gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage
                        src={getSafeAvatarUrl(comment.userAvatar, comment.username)}
                        alt={comment.username}
                      />
                      <AvatarFallback>
                        {comment.username.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold">{comment.username}</span>{" "}
                        {comment.text}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatStoryAge(comment.createdAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex items-center gap-2">
            <Input
              value={storyCommentInput}
              onChange={(e) => setStoryCommentInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleAddStoryComment();
                }
              }}
              placeholder="Write a comment..."
            />
            <Button
              onClick={handleAddStoryComment}
              disabled={storyActionBusy === "comment" || !storyCommentInput.trim()}
            >
              Post
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Story Editor */}
      {!viewerOnly && isEditorOpen && selectedFile && previewUrl && (
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



















































