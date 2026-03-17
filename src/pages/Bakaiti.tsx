import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  CornerUpLeft,
  Crown,
  Copy,
  Flag,
  Forward,
  Loader2,
  MoreVertical,
  Paperclip,
  Plus,
  Search,
  Send,
  Smile,
  SmilePlus,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { get, getDatabase, onValue, push, ref, remove, set, update } from "firebase/database";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { uploadToChatStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { extractMentions } from "@/utils/mentions";
import { sendMentionNotifications } from "@/utils/mentionNotifications";
import {
  decryptTextWithKey,
  encryptTextWithKey,
  ensureConversationKey,
  ensureUserE2EEIdentity,
} from "@/utils/e2ee";
import { getBlockMapsForUser, getBlockStatus } from "@/utils/blocking";
import { parseChatMessage, parseGroupName } from "@/utils/validation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MentionInput } from "@/components/MentionInput";
import { MentionText } from "@/components/MentionText";
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
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GifPicker, type GifPick } from "@/components/chat/GifPicker";

type Role = "admin" | "member";
type ConvType = "dm" | "group";

interface Conversation {
  key: string;
  type: ConvType;
  id: string;
  title: string;
  avatar: string;
  subtitle: string;
  otherUserId?: string;
  role?: Role;
  lastMessage: string;
  lastMessageTime: string;
}

interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  clientNonce?: string;
  conversationKey?: string;
  localStatus?: "sending" | "sent" | "failed";
  localError?: string;
  localOnly?: boolean;
  encryptedText?: string;
  encryptedIv?: string;
  encryption?: string;
  sharedPost?: {
    postId: string;
    mediaUrl: string;
    mediaType: "image" | "video";
    caption: string;
    authorId: string;
    authorUsername: string;
    authorAvatar: string;
  };
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
  replyTo?: {
    messageId: string;
    senderId: string;
    senderName: string;
    text?: string;
    fileName?: string;
    fileType?: string;
    sharedPost?: {
      caption: string;
      mediaType: "image" | "video";
    };
  };
  forwardedFrom?: {
    senderId: string;
    senderName: string;
    timestamp: string;
    conversationId: string;
    conversationType: ConvType;
  };
  reactions?: Record<
    string,
    {
      emoji: string;
      username?: string;
      reactedAt?: string;
    }
  >;
}

interface LinkPreviewData {
  url: string;
  canonicalUrl?: string;
  siteName?: string;
  title?: string;
  description?: string;
  image?: string | null;
  favicon?: string | null;
}

interface UserOption {
  uid: string;
  username: string;
  avatar: string;
}

interface GroupMemberEntry {
  uid: string;
  username: string;
  avatar: string;
  role: Role;
  joinedAt?: string;
}

type FollowState = "self" | "none" | "following" | "requested";

const QUICK_REACTIONS = [
  "\u{1F44D}",
  "\u2764\uFE0F",
  "\u{1F602}",
  "\u{1F62E}",
  "\u{1F622}",
  "\u{1F621}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F64F}",
  "\u{1F389}",
  "\u{1F60D}",
  "\u{1F914}",
  "\u{1F973}",
  "\u{1F923}",
  "\u{1F60E}",
  "\u{1F91D}",
  "\u{1F4AF}",
  "\u2728",
  "\u{1F440}",
  "\u{1F64C}",
  "\u{1F90D}",
  "\u{1FAF6}",
  "\u{1F634}",
  "\u{1F480}",
  "\u{1F92F}",
  "\u{1F917}",
  "\u{1F929}",
  "\u{1F976}",
  "\u{1F624}",
];
const EMOJI_FONT_STACK =
  '"Apple Color Emoji","Segoe UI Emoji","Segoe UI Symbol","Noto Color Emoji",sans-serif';

const timeAgo = (value: string) => {
  if (!value) return "";
  const d = new Date(value);
  const now = Date.now();
  const diff = Math.floor((now - d.getTime()) / 60000);
  if (diff < 1) return "Now";
  if (diff < 60) return `${diff}m`;
  if (diff < 1440) return `${Math.floor(diff / 60)}h`;
  return `${Math.floor(diff / 1440)}d`;
};

const extractFirstSymbol = (value: string) => {
  const input = value.trim();
  if (!input) return "";

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
    const iterator = segmenter.segment(input)[Symbol.iterator]();
    const first = iterator.next();
    if (!first.done && typeof first.value?.segment === "string") {
      return first.value.segment;
    }
  }

  return Array.from(input)[0] || "";
};

const LINK_URL_PATTERN = /(https?:\/\/[^\s<>"'`]+)/i;
const TRAILING_URL_PUNCTUATION = /[),.!?:;'\"]+$/;

const extractFirstUrl = (value: string) => {
  const match = value.match(LINK_URL_PATTERN);
  if (!match?.[1]) return null;

  const cleaned = match[1].replace(TRAILING_URL_PUNCTUATION, "");
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const getHostLabelFromUrl = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
};

const sanitizeHttpUrl = (value?: string | null) => {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
};

const getMessagePreviewText = (message: ChatMessage) => {
  if (message.text) return message.text;
  if (message.sharedPost) {
    return message.sharedPost.caption
      ? `Post: ${message.sharedPost.caption}`
      : "Shared post";
  }
  if (message.fileType?.startsWith("image/")) {
    return message.fileName ? `Photo: ${message.fileName}` : "Photo";
  }
  if (message.fileName) {
    return `Attachment: ${message.fileName}`;
  }
  return "Message";
};

const groupReactions = (
  reactions: ChatMessage["reactions"],
  currentUserId?: string,
) => {
  if (!reactions) return [] as Array<{ emoji: string; count: number; mine: boolean }>;
  const grouped = new Map<string, { count: number; mine: boolean }>();
  Object.entries(reactions).forEach(([uid, entry]) => {
    const emoji = entry?.emoji;
    if (!emoji) return;
    const existing = grouped.get(emoji) || { count: 0, mine: false };
    existing.count += 1;
    if (uid === currentUserId) existing.mine = true;
    grouped.set(emoji, existing);
  });

  return Array.from(grouped.entries()).map(([emoji, value]) => ({
    emoji,
    count: value.count,
    mine: value.mine,
  }));
};

export default function Bakaiti() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const location = useLocation();
  const db = getDatabase();
  const username = user?.displayName || user?.email?.split("@")[0] || "user";
  const selfAvatar =
    user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationKey, setConversationKey] = useState<Uint8Array | null>(null);
  const [e2eeEnabled, setE2eeEnabled] = useState(false);
  const [e2eeRuntimeDisabled, setE2eeRuntimeDisabled] = useState(false);
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);
  const [activeSends, setActiveSends] = useState(0);
  const [composerState, setComposerState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [showGifPicker, setShowGifPicker] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [reactionTargetId, setReactionTargetId] = useState<string | null>(null);
  const [reactionInput, setReactionInput] = useState("");
  const [forwardTarget, setForwardTarget] = useState<ChatMessage | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardingConversationKey, setForwardingConversationKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [blockedByMe, setBlockedByMe] = useState<Set<string>>(new Set());
  const [blockedMe, setBlockedMe] = useState<Set<string>>(new Set());
  const [groupInfoOpen, setGroupInfoOpen] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMemberEntry[]>([]);
  const [groupInfoLoading, setGroupInfoLoading] = useState(false);
  const [groupMemberSearch, setGroupMemberSearch] = useState("");
  const [selectedNewMembers, setSelectedNewMembers] = useState<Set<string>>(new Set());
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);
  const [addingMembers, setAddingMembers] = useState(false);
  const [followStates, setFollowStates] = useState<Record<string, FollowState>>({});
  const [privacyMap, setPrivacyMap] = useState<Record<string, "public" | "private">>({});
  const [linkPreviewsByUrl, setLinkPreviewsByUrl] = useState<Record<string, LinkPreviewData | null>>({});

  const [fullImage, setFullImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const linkPreviewFetchInFlight = useRef<Set<string>>(new Set());

  const selectedConversation =
    conversations.find((c) => c.key === selectedKey) || null;
  const e2eeActive = e2eeEnabled && !e2eeRuntimeDisabled;
  const giphyApiKey = (import.meta.env.VITE_GIPHY_API_KEY as string | undefined) || undefined;

  const isGroupConversation =
    selectedConversation?.type === "group" ? selectedConversation : null;

  const isCurrentUserGroupAdmin =
    Boolean(
      isGroupConversation &&
        (groupMembers.find((m) => m.uid === user?.uid)?.role === "admin" ||
          isGroupConversation.role === "admin"),
    );

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(groupSearch.toLowerCase().trim()),
  );

  const selectedOptimisticMessages = useMemo(() => {
    if (!selectedConversation) return [] as ChatMessage[];
    const serverNonces = new Set(
      messages
        .map((entry) => entry.clientNonce)
        .filter((nonce): nonce is string => Boolean(nonce)),
    );

    return optimisticMessages
      .filter((entry) => entry.localOnly)
      .filter((entry) => entry.conversationKey === selectedConversation.key)
      .filter(
        (entry) =>
          entry.localStatus === "failed" ||
          !entry.clientNonce ||
          !serverNonces.has(entry.clientNonce),
      );
  }, [messages, optimisticMessages, selectedConversation]);

  const displayedMessages = useMemo(
    () =>
      [...messages, ...selectedOptimisticMessages].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      ),
    [messages, selectedOptimisticMessages],
  );

  const messagePreviewUrls = useMemo(
    () =>
      Array.from(
        new Set(
          displayedMessages
            .map((entry) => extractFirstUrl(entry.text || ""))
            .filter((url): url is string => Boolean(url)),
        ),
      ),
    [displayedMessages],
  );

  const availableGroupCandidates = useMemo(() => {
    const term = groupMemberSearch.toLowerCase().trim();
    const existing = new Set(groupMembers.map((m) => m.uid));
    return users.filter((entry) => {
      if (existing.has(entry.uid)) return false;
      if (!term) return true;
      return entry.username.toLowerCase().includes(term);
    });
  }, [groupMemberSearch, groupMembers, users]);

  const filteredConversations = useMemo(() => {
    const q = search.toLowerCase().trim();
    return conversations
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.lastMessage.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          new Date(b.lastMessageTime || 0).getTime() -
          new Date(a.lastMessageTime || 0).getTime(),
      );
  }, [conversations, search]);

  const reactionTargetMessage = useMemo(
    () => displayedMessages.find((entry) => entry.id === reactionTargetId) || null,
    [displayedMessages, reactionTargetId],
  );

  const filteredForwardConversations = useMemo(() => {
    if (!forwardTarget) return [];
    const q = forwardSearch.toLowerCase().trim();
    return conversations.filter((conversation) => {
      if (selectedConversation && conversation.key === selectedConversation.key) return false;
      if (!q) return true;
      return (
        conversation.title.toLowerCase().includes(q) ||
        conversation.lastMessage.toLowerCase().includes(q)
      );
    });
  }, [conversations, forwardSearch, forwardTarget, selectedConversation]);

  useEffect(() => {
    if (!selectedConversation || selectedConversation.type !== "dm") return;
    if (!selectedConversation.otherUserId) return;
    if (
      blockedByMe.has(selectedConversation.otherUserId) ||
      blockedMe.has(selectedConversation.otherUserId)
    ) {
      setSelectedKey(null);
    }
  }, [blockedByMe, blockedMe, selectedConversation]);

  useEffect(() => {
    setShowGifPicker(false);
    setReplyTarget(null);
    setReactionTargetId(null);
    setForwardTarget(null);
    setForwardSearch("");
    setE2eeRuntimeDisabled(false);
    setTimeout(() => messageInputRef.current?.focus(), 0);
  }, [selectedKey]);

  useEffect(() => {
    if (!messages.length) return;
    const serverNonces = new Set(
      messages
        .map((entry) => entry.clientNonce)
        .filter((nonce): nonce is string => Boolean(nonce)),
    );
    if (!serverNonces.size) return;
    setOptimisticMessages((prev) =>
      prev.filter(
        (entry) =>
          entry.localStatus === "failed" ||
          !entry.clientNonce ||
          !serverNonces.has(entry.clientNonce),
      ),
    );
  }, [messages]);

  useEffect(() => {
    if (composerState !== "done" && composerState !== "error") return;
    const timer = setTimeout(() => {
      setComposerState(activeSends > 0 ? "sending" : "idle");
    }, 1400);
    return () => clearTimeout(timer);
  }, [activeSends, composerState]);

  useEffect(() => {
    messagePreviewUrls.forEach((url) => {
      if (Object.prototype.hasOwnProperty.call(linkPreviewsByUrl, url)) return;
      if (linkPreviewFetchInFlight.current.has(url)) return;

      linkPreviewFetchInFlight.current.add(url);
      fetch(`/api/link-preview?url=${encodeURIComponent(url)}`)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Preview request failed (${response.status})`);
          }
          const payload = (await response.json()) as Partial<LinkPreviewData>;
          const normalized: LinkPreviewData = {
            url: typeof payload.url === "string" && payload.url ? payload.url : url,
            canonicalUrl:
              typeof payload.canonicalUrl === "string" && payload.canonicalUrl
                ? payload.canonicalUrl
                : url,
            siteName: typeof payload.siteName === "string" ? payload.siteName : "",
            title: typeof payload.title === "string" ? payload.title : "",
            description:
              typeof payload.description === "string" ? payload.description : "",
            image: typeof payload.image === "string" ? payload.image : null,
            favicon: typeof payload.favicon === "string" ? payload.favicon : null,
          };
          setLinkPreviewsByUrl((prev) => ({ ...prev, [url]: normalized }));
        })
        .catch((error) => {
          console.error("Failed to fetch link preview:", error);
          setLinkPreviewsByUrl((prev) => ({ ...prev, [url]: null }));
        })
        .finally(() => {
          linkPreviewFetchInFlight.current.delete(url);
        });
    });
  }, [linkPreviewsByUrl, messagePreviewUrls]);

  const resolveConversationParticipants = useCallback(
    async (conversation: Conversation) => {
      if (!user) return [] as string[];
      if (conversation.type === "dm") {
        return [user.uid, conversation.otherUserId || ""].filter(Boolean);
      }

      try {
        const membersSnapshot = await get(ref(db, `groupMembers/${conversation.id}`));
        if (!membersSnapshot.exists()) {
          return [user.uid];
        }
        const members = membersSnapshot.val() as Record<string, unknown>;
        return Object.keys(members);
      } catch (error) {
        console.error("Unable to resolve group participants for E2EE:", error);
        return [user.uid];
      }
    },
    [db, user],
  );

  useEffect(() => {
    if (!user) return;
    ensureUserE2EEIdentity(user.uid)
      .then((ok) => setE2eeEnabled(Boolean(ok)))
      .catch(() => setE2eeEnabled(false));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    getBlockMapsForUser(user.uid)
      .then((maps) => {
        setBlockedByMe(maps.blockedByMe);
        setBlockedMe(maps.blockedMe);
      })
      .catch(() => {
        setBlockedByMe(new Set());
        setBlockedMe(new Set());
      });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    get(ref(db, "users")).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, Record<string, unknown>>;
      const list = Object.entries(data)
        .filter(([uid]) => uid !== user.uid && !blockedByMe.has(uid) && !blockedMe.has(uid))
        .map(([uid, v]) => {
          const localName =
            (v.username as string) || ((v.email as string) || "user@local").split("@")[0];
          return {
            uid,
            username: localName,
            avatar:
              (v.photoURL as string) ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${localName}`,
          };
        });
      setUsers(list);
    });
  }, [blockedByMe, blockedMe, db, user]);

  useEffect(() => {
    if (!user) return;
    const dmRef = ref(db, `userChats/${user.uid}`);
    const groupRef = ref(db, `userGroups/${user.uid}`);
    let latestDms: Conversation[] = [];
    let latestGroups: Conversation[] = [];

    const merge = () => {
      setConversations([...latestDms, ...latestGroups]);
      setLoading(false);
    };

    const unsubDm = onValue(dmRef, (snap) => {
      if (!snap.exists()) {
        latestDms = [];
        merge();
        return;
      }
      const data = snap.val() as Record<string, Record<string, unknown>>;
      latestDms = Object.entries(data)
        .filter(([, v]) => typeof v.otherUserId === "string")
        .map(([chatId, v]) => ({
          key: `dm:${chatId}`,
          type: "dm" as const,
          id: chatId,
          title: (v.otherUsername as string) || "Unknown",
          avatar:
            (v.otherUserAvatar as string) ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${chatId}`,
          subtitle: "Direct message",
          otherUserId: v.otherUserId as string,
          lastMessage: (v.lastMessage as string) || "",
          lastMessageTime: (v.lastMessageTime as string) || "",
        }))
        .filter(
          (c) =>
            c.otherUserId !== user.uid &&
            !blockedByMe.has(c.otherUserId || "") &&
            !blockedMe.has(c.otherUserId || ""),
        );
      merge();
    });

    const unsubGroup = onValue(groupRef, async (snap) => {
      if (!snap.exists()) {
        latestGroups = [];
        merge();
        return;
      }
      const data = snap.val() as Record<string, Record<string, unknown>>;
      const groups = await Promise.all(
        Object.entries(data).map(async ([groupId, membership]) => {
          try {
            const [g, selfMembership] = await Promise.all([
              get(ref(db, `groups/${groupId}`)),
              get(ref(db, `groupMembers/${groupId}/${user.uid}`)),
            ]);
            if (!g.exists() || !selfMembership.exists()) {
              // Auto-clean stale local membership entries so dead groups stop failing sends.
              await remove(ref(db, `userGroups/${user.uid}/${groupId}`)).catch(() => undefined);
              return null;
            }
            const groupData = g.val() as Record<string, unknown>;
            const selfMembershipData = selfMembership.val() as Record<string, unknown>;
            return {
              key: `group:${groupId}`,
              type: "group" as const,
              id: groupId,
              title: (groupData.name as string) || "Group",
              avatar: "",
              subtitle: "Group chat",
              role: ((selfMembershipData.role as Role) ||
                (membership.role as Role) ||
                "member") as Role,
              lastMessage: (membership.lastMessage as string) || "",
              lastMessageTime:
                (membership.updatedAt as string) ||
                (groupData.updatedAt as string) ||
                (groupData.createdAt as string) ||
                "",
            };
          } catch {
            // Auto-clean stale local membership entries so dead groups stop failing sends.
            await remove(ref(db, `userGroups/${user.uid}/${groupId}`)).catch(() => undefined);
            return null;
          }
        }),
      );
      latestGroups = groups.filter((g): g is Conversation => g !== null);
      merge();
    });

    return () => {
      unsubDm();
      unsubGroup();
    };
  }, [blockedByMe, blockedMe, db, user]);

  useEffect(() => {
    if (!selectedConversation) {
      setMessages([]);
      return;
    }
    const path =
      selectedConversation.type === "group"
        ? `groupMessages/${selectedConversation.id}`
        : `messages/${selectedConversation.id}`;
    const unsub = onValue(ref(db, path), (snap) => {
      if (!snap.exists()) {
        setMessages([]);
        return;
      }
      const data = snap.val() as Record<string, Record<string, unknown>>;
      const rawList = Object.entries(data)
        .map(([id, v]) => ({
          id,
          senderId: (v.senderId as string) || "system",
          senderName: (v.senderName as string) || "System",
          text: (v.text as string) || "",
          timestamp: (v.timestamp as string) || "",
          clientNonce: v.clientNonce as string | undefined,
          encryptedText: v.encryptedText as string | undefined,
          encryptedIv: v.encryptedIv as string | undefined,
          encryption: v.encryption as string | undefined,
          sharedPost: v.sharedPost as ChatMessage["sharedPost"],
          fileUrl: v.fileUrl as string | undefined,
          fileName: v.fileName as string | undefined,
          fileType: v.fileType as string | undefined,
          replyTo: v.replyTo as ChatMessage["replyTo"],
          forwardedFrom: v.forwardedFrom as ChatMessage["forwardedFrom"],
          reactions: v.reactions as ChatMessage["reactions"],
        }))
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );

      const decode = async () => {
        const decoded = await Promise.all(
          rawList.map(async (message) => {
            if (message.senderId === "system") {
              return message;
            }

            if (message.text) {
              return message;
            }

            if (
              message.encryptedText &&
              message.encryptedIv &&
              conversationKey &&
              message.encryption === "e2ee_v1"
            ) {
              try {
                const decryptedText = await decryptTextWithKey(
                  {
                    ciphertext: message.encryptedText,
                    iv: message.encryptedIv,
                  },
                  conversationKey,
                );
                return { ...message, text: decryptedText };
              } catch {
                return { ...message, text: "[Unable to decrypt message]" };
              }
            }

            if (message.encryptedText) {
              return { ...message, text: "[Encrypted message]" };
            }

            return message;
          }),
        );

        setMessages(decoded.filter((entry) => entry.text || entry.fileUrl || entry.sharedPost));
      };

      decode().catch((error) => {
        console.error("Failed to decode messages:", error);
      });
    });
    return () => unsub();
  }, [conversationKey, db, selectedConversation]);

  useEffect(() => {
    if (!user || !selectedConversation) {
      setConversationKey(null);
      return;
    }

    let active = true;
    const setupKey = async () => {
      try {
        if (
          selectedConversation.type === "dm" &&
          selectedConversation.otherUserId &&
          (blockedByMe.has(selectedConversation.otherUserId) ||
            blockedMe.has(selectedConversation.otherUserId))
        ) {
          setConversationKey(null);
          return;
        }

        const participants =
          (await resolveConversationParticipants(selectedConversation)) || [user.uid];
        const key = await ensureConversationKey({
          scope: selectedConversation.type,
          conversationId: selectedConversation.id,
          participantIds: participants,
          currentUserId: user.uid,
        });
        if (active) {
          setConversationKey(key);
          if (key) {
            setE2eeRuntimeDisabled(false);
          }
        }
      } catch (error) {
        console.error("E2EE setup failed:", error);
        if (active) {
          setConversationKey(null);
          const message = error instanceof Error ? error.message : String(error);
          if (message.toLowerCase().includes("permission denied")) {
            setE2eeRuntimeDisabled(true);
          }
        }
      }
    };

    setupKey();
    return () => {
      active = false;
    };
  }, [blockedByMe, blockedMe, resolveConversationParticipants, selectedConversation, user]);

  useEffect(() => {
    const scrollTarget = endRef.current;
    if (!scrollTarget) return;

    const frame = window.requestAnimationFrame(() => {
      scrollTarget.scrollIntoView({
        behavior: isMobile ? "auto" : "smooth",
        block: "end",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [displayedMessages, isMobile]);

  useEffect(() => {
    const state = (location.state || {}) as {
      openChatWith?: { userId: string; username: string; avatar?: string };
      openConversation?: { type?: ConvType; id?: string };
    };

    const openConversation = state.openConversation;
    if (
      openConversation?.id &&
      (openConversation.type === "dm" || openConversation.type === "group")
    ) {
      setSelectedKey(`${openConversation.type}:${openConversation.id}`);
      return;
    }

    const open = state.openChatWith;
    if (!open || !user) return;
    const chatId = [user.uid, open.userId].sort().join("_");
    const now = new Date().toISOString();
    const avatar =
      open.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${open.username}`;

    getBlockStatus(user.uid, open.userId)
      .then((status) => {
        if (status.blockedEither) {
          toast({
            title: "Action blocked",
            description: status.blockedByMe
              ? "Unblock this user first to chat."
              : "You cannot chat with this user.",
            variant: "destructive",
          });
          return Promise.resolve(null);
        }

        return get(ref(db, `userChats/${user.uid}/${chatId}`));
      })
      .then(async (snapshot) => {
        if (!snapshot) return;
        if (!snapshot.exists()) {
          await set(ref(db, `userChats/${user.uid}/${chatId}`), {
            otherUserId: open.userId,
            otherUsername: open.username,
            otherUserAvatar: avatar,
            lastMessage: "",
            lastMessageTime: now,
          });
          await set(ref(db, `userChats/${open.userId}/${chatId}`), {
            otherUserId: user.uid,
            otherUsername: username,
            otherUserAvatar: selfAvatar,
            lastMessage: "",
            lastMessageTime: now,
          });
        }
        await ensureConversationKey({
          scope: "dm",
          conversationId: chatId,
          participantIds: [user.uid, open.userId],
          currentUserId: user.uid,
        });
        setSelectedKey(`dm:${chatId}`);
      })
      .catch(() => {
        setSelectedKey(`dm:${chatId}`);
      });
  }, [db, location.state, selfAvatar, toast, user, username]);

  const loadGroupDetails = useCallback(async () => {
    if (!user || !isGroupConversation) return;

    setGroupInfoLoading(true);
    try {
      const groupId = isGroupConversation.id;
      const [membersSnapshot, usersSnapshot, followingSnapshot] = await Promise.all([
        get(ref(db, `groupMembers/${groupId}`)),
        get(ref(db, "users")),
        get(ref(db, `following/${user.uid}`)),
      ]);

      if (!membersSnapshot.exists()) {
        setGroupMembers([]);
        setFollowStates({});
        setPrivacyMap({});
        return;
      }

      const membersRaw = membersSnapshot.val() as Record<string, Record<string, unknown>>;
      const usersRaw = usersSnapshot.exists()
        ? (usersSnapshot.val() as Record<string, Record<string, unknown>>)
        : {};
      const followingSet = new Set<string>(
        followingSnapshot.exists()
          ? Object.keys(followingSnapshot.val() as Record<string, unknown>)
          : [],
      );

      const members: GroupMemberEntry[] = Object.entries(membersRaw).map(([uid, info]) => {
        const userData = usersRaw[uid] || {};
        const uname =
          (info.username as string) ||
          (userData.username as string) ||
          ((userData.email as string) || "user@local").split("@")[0];
        return {
          uid,
          username: uname,
          avatar:
            (info.avatar as string) ||
            (userData.photoURL as string) ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${uname}`,
          role: ((info.role as Role) || "member") as Role,
          joinedAt: info.joinedAt as string | undefined,
        };
      });

      members.sort((a, b) => {
        if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
        return a.username.localeCompare(b.username);
      });

      const nextPrivacyMap: Record<string, "public" | "private"> = {};
      members.forEach((entry) => {
        const privacy = usersRaw[entry.uid]?.accountPrivacy as string | undefined;
        nextPrivacyMap[entry.uid] = privacy === "private" ? "private" : "public";
      });

      const nextFollowStates: Record<string, FollowState> = {};
      await Promise.all(
        members.map(async (entry) => {
          if (entry.uid === user.uid) {
            nextFollowStates[entry.uid] = "self";
            return;
          }
          if (followingSet.has(entry.uid)) {
            nextFollowStates[entry.uid] = "following";
            return;
          }
          if (nextPrivacyMap[entry.uid] === "private") {
            const requestSnapshot = await get(
              ref(db, `followRequests/${entry.uid}/${user.uid}`),
            );
            if (
              requestSnapshot.exists() &&
              (requestSnapshot.val()?.status as string | undefined) === "pending"
            ) {
              nextFollowStates[entry.uid] = "requested";
              return;
            }
          }
          nextFollowStates[entry.uid] = "none";
        }),
      );

      setGroupMembers(members);
      setFollowStates(nextFollowStates);
      setPrivacyMap(nextPrivacyMap);
    } catch (error) {
      console.error("Failed to load group details:", error);
      toast({
        title: "Error",
        description: "Unable to load group members.",
        variant: "destructive",
      });
    } finally {
      setGroupInfoLoading(false);
    }
  }, [db, isGroupConversation, toast, user]);

  useEffect(() => {
    if (!groupInfoOpen) return;
    loadGroupDetails().catch((error) => {
      console.error("Group details fetch failed:", error);
    });
  }, [groupInfoOpen, loadGroupDetails]);

  const postSystemGroupMessage = useCallback(
    async (groupId: string, text: string) => {
      const now = new Date().toISOString();
      await set(push(ref(db, `groupMessages/${groupId}`)), {
        senderId: "system",
        senderName: "System",
        text,
        timestamp: now,
      });
      await update(ref(db, `groups/${groupId}`), { updatedAt: now });
    },
    [db],
  );

  const handleFollowGroupMember = async (entry: GroupMemberEntry) => {
    if (!user || entry.uid === user.uid) return;
    const state = followStates[entry.uid] || "none";
    if (state === "following" || state === "requested") return;

    setMemberActionLoading(`follow:${entry.uid}`);
    try {
      const now = new Date().toISOString();
      const targetPrivacy = privacyMap[entry.uid] || "public";

      if (targetPrivacy === "private") {
        const requestRef = ref(db, `followRequests/${entry.uid}/${user.uid}`);
        const requestSnapshot = await get(requestRef);
        if (!requestSnapshot.exists()) {
          await set(requestRef, {
            fromUserId: user.uid,
            fromUsername: username,
            fromAvatar: selfAvatar,
            timestamp: now,
            status: "pending",
          });
          await set(push(ref(db, `notifications/${entry.uid}`)), {
            type: "follow_request",
            fromUserId: user.uid,
            fromUsername: username,
            fromAvatar: selfAvatar,
            timestamp: now,
            read: false,
            message: `${username} requested to follow you`,
          });
        }
        setFollowStates((prev) => ({ ...prev, [entry.uid]: "requested" }));
        return;
      }

      await Promise.all([
        set(ref(db, `following/${user.uid}/${entry.uid}`), {
          username: entry.username,
          timestamp: now,
        }),
        set(ref(db, `followers/${entry.uid}/${user.uid}`), {
          username,
          timestamp: now,
        }),
        set(push(ref(db, `notifications/${entry.uid}`)), {
          type: "follow",
          fromUserId: user.uid,
          fromUsername: username,
          fromAvatar: selfAvatar,
          timestamp: now,
          read: false,
          message: `${username} started following you`,
        }),
      ]);
      setFollowStates((prev) => ({ ...prev, [entry.uid]: "following" }));
    } catch (error) {
      console.error("Follow action failed:", error);
      toast({
        title: "Error",
        description: "Unable to follow this member right now.",
        variant: "destructive",
      });
    } finally {
      setMemberActionLoading(null);
    }
  };

  const updateGroupMemberRole = async (targetUid: string, role: Role) => {
    if (!user || !isGroupConversation || !isCurrentUserGroupAdmin) return;
    if (targetUid === user.uid) return;
    const target = groupMembers.find((member) => member.uid === targetUid);
    if (!target) return;

    setMemberActionLoading(`role:${targetUid}`);
    try {
      await Promise.all([
        set(ref(db, `groupMembers/${isGroupConversation.id}/${targetUid}/role`), role),
        set(ref(db, `userGroups/${targetUid}/${isGroupConversation.id}/role`), role),
      ]);
      await postSystemGroupMessage(
        isGroupConversation.id,
        `${target.username} is now ${role}.`,
      );
      setGroupMembers((prev) =>
        prev
          .map((member) =>
            member.uid === targetUid ? { ...member, role } : member,
          )
          .sort((a, b) => {
            if (a.role !== b.role) return a.role === "admin" ? -1 : 1;
            return a.username.localeCompare(b.username);
          }),
      );
      toast({
        title: "Role updated",
        description: `${target.username} is now ${role}.`,
      });
    } catch (error) {
      console.error("Role update failed:", error);
      toast({
        title: "Error",
        description: "Failed to update member role.",
        variant: "destructive",
      });
    } finally {
      setMemberActionLoading(null);
    }
  };

  const removeGroupMember = async (targetUid: string) => {
    if (!user || !isGroupConversation || !isCurrentUserGroupAdmin) return;
    if (targetUid === user.uid) return;
    const target = groupMembers.find((member) => member.uid === targetUid);
    if (!target) return;

    setMemberActionLoading(`remove:${targetUid}`);
    try {
      await Promise.all([
        remove(ref(db, `groupMembers/${isGroupConversation.id}/${targetUid}`)),
        remove(ref(db, `userGroups/${targetUid}/${isGroupConversation.id}`)),
      ]);
      await postSystemGroupMessage(
        isGroupConversation.id,
        `${target.username} was removed by ${username}.`,
      );
      setGroupMembers((prev) => prev.filter((member) => member.uid !== targetUid));
      setSelectedNewMembers((prev) => {
        const next = new Set(prev);
        next.delete(targetUid);
        return next;
      });
      toast({
        title: "Member removed",
        description: `${target.username} was removed from the group.`,
      });
    } catch (error) {
      console.error("Remove member failed:", error);
      toast({
        title: "Error",
        description: "Failed to remove member.",
        variant: "destructive",
      });
    } finally {
      setMemberActionLoading(null);
    }
  };

  const addSelectedMembersToGroup = async () => {
    if (!user || !isGroupConversation || !isCurrentUserGroupAdmin) return;
    if (selectedNewMembers.size === 0) return;

    setAddingMembers(true);
    try {
      const now = new Date().toISOString();
      const selectedEntries = availableGroupCandidates.filter((entry) =>
        selectedNewMembers.has(entry.uid),
      );

      await Promise.all(
        selectedEntries.flatMap((entry) => [
          set(ref(db, `groupMembers/${isGroupConversation.id}/${entry.uid}`), {
            username: entry.username,
            avatar: entry.avatar,
            role: "member",
            joinedAt: now,
          }),
          set(ref(db, `userGroups/${entry.uid}/${isGroupConversation.id}`), {
            name: isGroupConversation.title,
            role: "member",
            joinedAt: now,
            updatedAt: now,
            lastMessage: "",
          }),
        ]),
      );

      await postSystemGroupMessage(
        isGroupConversation.id,
        `${username} added ${selectedEntries.map((entry) => entry.username).join(", ")}.`,
      );

      try {
        await ensureConversationKey({
          scope: "group",
          conversationId: isGroupConversation.id,
          participantIds: [user.uid, ...groupMembers.map((member) => member.uid), ...selectedEntries.map((entry) => entry.uid)],
          currentUserId: user.uid,
        });
      } catch (error) {
        console.error("Group key refresh after adding members failed:", error);
      }

      setSelectedNewMembers(new Set());
      setGroupMemberSearch("");
      await loadGroupDetails();
      toast({
        title: "Members added",
        description: "Selected members were added to the group.",
      });
    } catch (error) {
      console.error("Add members failed:", error);
      toast({
        title: "Error",
        description: "Failed to add selected members.",
        variant: "destructive",
      });
    } finally {
      setAddingMembers(false);
    }
  };

  const ensureDmChatMappings = useCallback(
    async (conversation: Conversation) => {
      if (!user || conversation.type !== "dm" || !conversation.otherUserId) return;
      const chatId = conversation.id;
      const now = new Date().toISOString();
      const selfChatRef = ref(db, `userChats/${user.uid}/${chatId}`);
      const peerChatRef = ref(db, `userChats/${conversation.otherUserId}/${chatId}`);

      const selfChat = await get(selfChatRef).catch(() => null);
      if (!selfChat?.exists()) {
        await set(selfChatRef, {
          otherUserId: conversation.otherUserId,
          otherUsername: conversation.title,
          otherUserAvatar: conversation.avatar,
          lastMessage: "",
          lastMessageTime: now,
        });
      }

      const peerChat = await get(peerChatRef).catch(() => null);
      if (!peerChat?.exists()) {
        await set(peerChatRef, {
          otherUserId: user.uid,
          otherUsername: username,
          otherUserAvatar: selfAvatar,
          lastMessage: "",
          lastMessageTime: now,
        }).catch(() => undefined);
      }
    },
    [db, selfAvatar, user, username],
  );

  const updateConversationPreview = useCallback(
    async (conversation: Conversation, preview: string, now: string) => {
      if (!user) return;

      if (conversation.type === "dm" && conversation.otherUserId) {
        const selfPayload = {
          otherUserId: conversation.otherUserId,
          otherUsername: conversation.title,
          otherUserAvatar: conversation.avatar,
          lastMessage: preview,
          lastMessageTime: now,
        };
        const peerPayload = {
          otherUserId: user.uid,
          otherUsername: username,
          otherUserAvatar: selfAvatar,
          lastMessage: preview,
          lastMessageTime: now,
        };

        await set(ref(db, `userChats/${user.uid}/${conversation.id}`), selfPayload);
        await set(
          ref(db, `userChats/${conversation.otherUserId}/${conversation.id}`),
          peerPayload,
        ).catch((error) => {
          console.error("Peer chat metadata update failed:", error);
        });
        return;
      }

      if (conversation.type === "group") {
        await update(ref(db, `groups/${conversation.id}`), { updatedAt: now });
        const members = await get(ref(db, `groupMembers/${conversation.id}`));
        if (!members.exists()) return;

        const memberMap = members.val() as Record<string, Record<string, unknown>>;
        await Promise.all(
          Object.entries(memberMap).map(([uid, info]) =>
            update(ref(db, `userGroups/${uid}/${conversation.id}`), {
              name: conversation.title,
              role: (info.role as Role) || "member",
              updatedAt: now,
              lastMessage: preview,
            }),
          ),
        );
      }
    },
    [db, selfAvatar, user, username],
  );

  const handleReactToMessage = async (message: ChatMessage, rawEmoji: string) => {
    if (!user || !selectedConversation) return;
    const emoji = extractFirstSymbol(rawEmoji);
    if (!emoji) {
      toast({
        title: "Invalid reaction",
        description: "Please choose a valid emoji.",
        variant: "destructive",
      });
      return;
    }

    const basePath =
      selectedConversation.type === "group"
        ? `groupMessages/${selectedConversation.id}/${message.id}`
        : `messages/${selectedConversation.id}/${message.id}`;

    const myReaction = message.reactions?.[user.uid]?.emoji;
    try {
      if (myReaction === emoji) {
        await remove(ref(db, `${basePath}/reactions/${user.uid}`));
      } else {
        await set(ref(db, `${basePath}/reactions/${user.uid}`), {
          emoji,
          username,
          reactedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error("Failed to react to message:", error);
      toast({
        title: "Error",
        description: "Failed to update reaction.",
        variant: "destructive",
      });
    }
  };

  const getCopyTextForMessage = (message: ChatMessage) => {
    if (message.text?.trim()) return message.text.trim();
    if (message.sharedPost) {
      return message.sharedPost.caption
        ? "Shared post: " + message.sharedPost.caption
        : "Shared post";
    }
    if (message.fileName) return "Attachment: " + message.fileName;
    if (message.fileUrl) return message.fileUrl;
    return "Message";
  };

  const handleCopyMessage = async (message: ChatMessage) => {
    const copyText = getCopyTextForMessage(message);
    if (!copyText) return;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(copyText);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = copyText;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      toast({
        title: "Copied",
        description: "Message copied to clipboard.",
      });
    } catch (error) {
      console.error("Failed to copy message:", error);
      toast({
        title: "Error",
        description: "Unable to copy message.",
        variant: "destructive",
      });
    }
  };

  const handleReportMessage = (message: ChatMessage) => {
    toast({
      title: "Reported",
      description: "Report submitted for message from " + message.senderName + ".",
    });
  };

  const handleForwardMessage = async (targetConversation: Conversation) => {
    if (!user || !forwardTarget) return;
    if (forwardingConversationKey) return;

    setForwardingConversationKey(targetConversation.key);
    try {
      if (targetConversation.type === "dm" && targetConversation.otherUserId) {
        const status = await getBlockStatus(user.uid, targetConversation.otherUserId);
        if (status.blockedEither) {
          toast({
            title: "Action blocked",
            description: status.blockedByMe
              ? "Unblock this user first."
              : "You cannot forward to this chat.",
            variant: "destructive",
          });
          return;
        }
        await ensureDmChatMappings(targetConversation);
      }

      const now = new Date().toISOString();
      const forwardText = forwardTarget.text || "";
      const payload: Record<string, unknown> = {
        senderId: user.uid,
        senderName: username,
        text: forwardText,
        timestamp: now,
        forwardedFrom: {
          senderId: forwardTarget.senderId,
          senderName: forwardTarget.senderName,
          timestamp: forwardTarget.timestamp,
          conversationId: selectedConversation?.id || "",
          conversationType: selectedConversation?.type || "dm",
        },
        ...(forwardTarget.fileUrl ? { fileUrl: forwardTarget.fileUrl } : {}),
        ...(forwardTarget.fileName ? { fileName: forwardTarget.fileName } : {}),
        ...(forwardTarget.fileType ? { fileType: forwardTarget.fileType } : {}),
        ...(forwardTarget.sharedPost ? { sharedPost: forwardTarget.sharedPost } : {}),
      };

      if (forwardTarget.replyTo) {
        payload.replyTo = forwardTarget.replyTo;
      }

      const path =
        targetConversation.type === "group"
          ? `groupMessages/${targetConversation.id}`
          : `messages/${targetConversation.id}`;

      await set(push(ref(db, path)), payload);

      const preview =
        forwardTarget.text.trim() ||
        (forwardTarget.sharedPost
          ? "Forwarded post"
          : forwardTarget.fileType?.startsWith("image/")
            ? "Forwarded photo"
            : forwardTarget.fileName
              ? `Forwarded: ${forwardTarget.fileName}`
              : "Forwarded message");
      await updateConversationPreview(targetConversation, preview, now);

      toast({
        title: "Forwarded",
        description: `Message forwarded to ${targetConversation.title}.`,
      });
      setForwardTarget(null);
      setForwardSearch("");
    } catch (error) {
      console.error("Failed to forward message:", error);
      toast({
        title: "Error",
        description: "Failed to forward message.",
        variant: "destructive",
      });
    } finally {
      setForwardingConversationKey(null);
    }
  };

  const sendMessage = async (options?: { forcedGif?: GifPick; preserveText?: boolean }) => {
    if (!user || !selectedConversation) return;

    const rawComposerText = messageText;
    const text = options?.forcedGif ? "" : rawComposerText.trim();
    const textValidation = parseChatMessage(text);
    if (!textValidation.success) {
      toast({
        title: "Invalid message",
        description: textValidation.error.issues[0]?.message || "Invalid message",
        variant: "destructive",
      });
      return;
    }

    const validatedText = textValidation.data;
    const draftConversation = selectedConversation;
    const draftFile = options?.forcedGif ? null : selectedFile;
    const draftGif = options?.forcedGif ?? null;
    const draftReply = replyTarget;
    const draftConversationKey = conversationKey;
    const draftE2eeActive = e2eeActive;

    if (!validatedText && !draftFile && !draftGif) return;

    if (
      draftConversation.type === "dm" &&
      draftConversation.otherUserId &&
      (blockedByMe.has(draftConversation.otherUserId) ||
        blockedMe.has(draftConversation.otherUserId))
    ) {
      toast({
        title: "Action blocked",
        description: "You cannot send messages in this conversation.",
        variant: "destructive",
      });
      return;
    }

    const now = new Date().toISOString();
    const clientNonce = `${user.uid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const optimisticId = `local:${clientNonce}`;

    const optimisticMessage: ChatMessage = {
      id: optimisticId,
      senderId: user.uid,
      senderName: username,
      text:
        validatedText ||
        (draftGif
          ? draftGif.title
            ? `GIF: ${draftGif.title}`
            : "GIF"
          : draftFile
            ? "Sending attachment..."
            : ""),
      timestamp: now,
      clientNonce,
      conversationKey: draftConversation.key,
      localOnly: true,
      localStatus: "sending",
      ...(draftGif
        ? {
            fileUrl: draftGif.url,
            fileName: draftGif.title || "GIF",
            fileType: "image/gif",
          }
        : {}),
      ...(draftFile
        ? {
            fileName: draftFile.name,
            fileType: draftFile.type || "application/octet-stream",
          }
        : {}),
      ...(draftReply
        ? {
            replyTo: {
              messageId: draftReply.id,
              senderId: draftReply.senderId,
              senderName: draftReply.senderName,
              text: draftReply.text || "",
              ...(draftReply.fileName ? { fileName: draftReply.fileName } : {}),
              ...(draftReply.fileType ? { fileType: draftReply.fileType } : {}),
              ...(draftReply.sharedPost
                ? {
                    sharedPost: {
                      caption: draftReply.sharedPost.caption || "",
                      mediaType: draftReply.sharedPost.mediaType,
                    },
                  }
                : {}),
            },
          }
        : {}),
    };

    setOptimisticMessages((prev) => [...prev, optimisticMessage]);
    setActiveSends((prev) => prev + 1);
    setComposerState("sending");
    setConversations((prev) =>
      prev.map((entry) =>
        entry.key === draftConversation.key
          ? {
              ...entry,
              lastMessage:
                validatedText ||
                (draftGif
                  ? "GIF"
                  : draftFile
                    ? "Attachment: " + draftFile.name
                    : entry.lastMessage),
              lastMessageTime: now,
            }
          : entry,
      ),
    );

    if (!options?.preserveText) {
      setMessageText("");
    }
    if (draftFile) {
      setSelectedFile(null);
    }
    setReplyTarget(null);
    setShowGifPicker(false);
    setTimeout(() => messageInputRef.current?.focus(), 0);

    void (async () => {
      try {
        if (draftConversation.type === "group") {
          try {
            const selfMember = await get(
              ref(db, `groupMembers/${draftConversation.id}/${user.uid}`),
            );
            if (!selfMember.exists()) {
              await remove(ref(db, `userGroups/${user.uid}/${draftConversation.id}`)).catch(
                () => undefined,
              );
              if (selectedKey === draftConversation.key) {
                setSelectedKey(null);
              }
              throw new Error("You are no longer a member of this group.");
            }
          } catch (error) {
            if (error instanceof Error && error.message.includes("no longer a member")) {
              throw error;
            }
            await remove(ref(db, `userGroups/${user.uid}/${draftConversation.id}`)).catch(
              () => undefined,
            );
            if (selectedKey === draftConversation.key) {
              setSelectedKey(null);
            }
            throw new Error("Group membership is invalid.");
          }
        }

        if (draftConversation.type === "dm" && draftConversation.otherUserId) {
          await ensureDmChatMappings(draftConversation);
        }

        let fileUrl = "";
        let fileName = "";
        let fileType = "";

        if (draftFile) {
          const ext = draftFile.name.split(".").pop() || "file";
          fileUrl = await uploadToChatStorage(
            draftFile,
            `${draftConversation.id}/${Date.now()}_${user.uid}.${ext}`,
          );
          fileName = draftFile.name;
          fileType = draftFile.type;
        } else if (draftGif) {
          fileUrl = draftGif.url;
          fileName = draftGif.title || "GIF";
          fileType = "image/gif";
        }

        let finalText = validatedText;
        let encryptedText: string | undefined;
        let encryptedIv: string | undefined;
        let encryption: string | undefined;

        let activeKey = draftConversationKey;
        if (!activeKey && finalText && draftE2eeActive) {
          try {
            const participants = await resolveConversationParticipants(draftConversation);
            activeKey = await ensureConversationKey({
              scope: draftConversation.type,
              conversationId: draftConversation.id,
              participantIds: participants,
              currentUserId: user.uid,
            });
            setConversationKey(activeKey);
            if (activeKey) {
              setE2eeRuntimeDisabled(false);
            }
          } catch (error) {
            console.error("E2EE setup failed during send; falling back to standard message.", error);
            const setupMessage = error instanceof Error ? error.message : String(error);
            if (setupMessage.toLowerCase().includes("permission denied")) {
              setE2eeRuntimeDisabled(true);
            }
          }
        }

        if (activeKey && finalText && draftE2eeActive) {
          const encryptedPayload = await encryptTextWithKey(finalText, activeKey);
          encryptedText = encryptedPayload.ciphertext;
          encryptedIv = encryptedPayload.iv;
          encryption = "e2ee_v1";
          finalText = "";
        }

        const messagePayload: Record<string, unknown> = {
          senderId: user.uid,
          senderName: username,
          text: finalText || (draftFile ? "Sent an attachment" : ""),
          timestamp: now,
          clientNonce,
          ...(encryptedText ? { encryptedText } : {}),
          ...(encryptedIv ? { encryptedIv } : {}),
          ...(encryption ? { encryption } : {}),
          ...(fileUrl ? { fileUrl } : {}),
          ...(fileName ? { fileName } : {}),
          ...(fileType ? { fileType } : {}),
          ...(draftReply
            ? {
                replyTo: {
                  messageId: draftReply.id,
                  senderId: draftReply.senderId,
                  senderName: draftReply.senderName,
                  text: draftReply.text || "",
                  ...(draftReply.fileName ? { fileName: draftReply.fileName } : {}),
                  ...(draftReply.fileType ? { fileType: draftReply.fileType } : {}),
                  ...(draftReply.sharedPost
                    ? {
                        sharedPost: {
                          caption: draftReply.sharedPost.caption || "",
                          mediaType: draftReply.sharedPost.mediaType,
                        },
                      }
                    : {}),
                },
              }
            : {}),
        };

        const path =
          draftConversation.type === "group"
            ? `groupMessages/${draftConversation.id}`
            : `messages/${draftConversation.id}`;

        await set(push(ref(db, path)), messagePayload);

        const preview =
          validatedText ||
          (draftGif
            ? "GIF"
            : draftFile
              ? `Attachment: ${draftFile.name}`
              : "");

        try {
          await updateConversationPreview(draftConversation, preview, now);
        } catch (previewError) {
          console.error("Conversation metadata update failed after message send:", previewError);
        }

        if (draftConversation.type === "group") {
          try {
            const members = await get(ref(db, `groupMembers/${draftConversation.id}`));
            if (members.exists()) {
              const memberMap = members.val() as Record<string, Record<string, unknown>>;
              const usernamesInMessage = extractMentions(validatedText);
              if (usernamesInMessage.length > 0) {
                await sendMentionNotifications({
                  actorUserId: user.uid,
                  actorUsername: username,
                  actorAvatar: selfAvatar,
                  text: validatedText,
                  sourceType: "group_message",
                  sourceId: draftConversation.id,
                  groupId: draftConversation.id,
                  chatId: draftConversation.id,
                  usernames: usernamesInMessage,
                  knownUsers: Object.entries(memberMap).map(([uid, info]) => ({
                    uid,
                    username: (info.username as string) || "",
                  })),
                });
              }
            }
          } catch (mentionError) {
            console.error("Group mention notifications failed:", mentionError);
          }
        }

        setOptimisticMessages((prev) =>
          prev.map((entry) =>
            entry.id === optimisticId ? { ...entry, localStatus: "sent" } : entry,
          ),
        );
        setComposerState("done");

        setTimeout(() => {
          setOptimisticMessages((prev) =>
            prev.filter((entry) => entry.id !== optimisticId),
          );
        }, 700);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Permission denied";
        setOptimisticMessages((prev) =>
          prev.map((entry) =>
            entry.id === optimisticId
              ? { ...entry, localStatus: "failed", localError: message }
              : entry,
          ),
        );
        setComposerState("error");
        toast({
          title: "Error",
          description: `Failed to send message (${message})`,
          variant: "destructive",
        });
      } finally {
        setActiveSends((prev) => Math.max(0, prev - 1));
      }
    })();
  };
  const createGroup = async () => {
    if (!user) return;
    const parsedName = parseGroupName(groupName);
    if (!parsedName.success || selectedMembers.size === 0) {
      toast({
        title: "Invalid group",
        description:
          parsedName.success
            ? "Select at least one member."
            : parsedName.error.issues[0]?.message || "Use valid name and select members",
        variant: "destructive",
      });
      return;
    }
    const name = parsedName.data;

    setCreatingGroup(true);
    try {
      const now = new Date().toISOString();
      const groupRef = push(ref(db, "groups"));
      const groupId = groupRef.key;
      if (!groupId) throw new Error("group id missing");
      const groupDescriptionValue = groupDescription.trim();

      // Write group metadata as child paths so creation remains compatible even
      // if parent-level group write rules are not yet published.
      await set(ref(db, `groups/${groupId}/createdBy`), user.uid);
      await set(ref(db, `groups/${groupId}/createdAt`), now);
      await set(ref(db, `groups/${groupId}/updatedAt`), now);
      await set(ref(db, `groups/${groupId}/name`), name);
      await set(
        ref(db, `groups/${groupId}/description`),
        groupDescriptionValue || null,
      );

      const userMap = new Map(users.map((u) => [u.uid, u]));
      const members = [user.uid, ...Array.from(selectedMembers)];

      // Create creator membership first so admin-based rules are guaranteed
      // before writing other members in environments with stricter latency.
      await set(ref(db, `groupMembers/${groupId}/${user.uid}`), {
        username,
        avatar: selfAvatar,
        role: "admin",
        joinedAt: now,
      });
      await set(ref(db, `userGroups/${user.uid}/${groupId}`), {
        name,
        role: "admin",
        joinedAt: now,
        updatedAt: now,
        lastMessage: "",
      });

      await Promise.all(
        Array.from(selectedMembers).map(async (uid) => {
          const profile = userMap.get(uid) || { username: "user", avatar: "" };
          await set(ref(db, `groupMembers/${groupId}/${uid}`), {
            username: profile.username,
            avatar: profile.avatar,
            role: "member",
            joinedAt: now,
          });
          await set(ref(db, `userGroups/${uid}/${groupId}`), {
            name,
            role: "member",
            joinedAt: now,
            updatedAt: now,
            lastMessage: "",
          });
        }),
      );

      await set(push(ref(db, `groupMessages/${groupId}`)), {
        senderId: "system",
        senderName: "System",
        text: `${username} created the group.`,
        timestamp: now,
      });

      try {
        await ensureConversationKey({
          scope: "group",
          conversationId: groupId,
          participantIds: members,
          currentUserId: user.uid,
        });
      } catch (keyError) {
        // Do not fail group creation if key setup is delayed by rules/latency.
        console.error("Group created but E2EE key setup failed:", keyError);
      }

      setCreateOpen(false);
      setGroupName("");
      setGroupDescription("");
      setGroupSearch("");
      setSelectedMembers(new Set());
      setSelectedKey(`group:${groupId}`);
    } catch (error) {
      console.error(error);
      const message = error instanceof Error ? error.message : "Permission denied";
      toast({
        title: "Error",
        description: `Failed to create group (${message})`,
        variant: "destructive",
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  const listVisible = !isMobile || !selectedConversation;
  const chatVisible = !isMobile || !!selectedConversation;

  return (
    <div className="flex h-[calc(100dvh-56px)] w-full min-h-0 min-w-0 overflow-hidden touch-pan-y overscroll-none bg-background md:h-screen">
      <div className={cn("min-h-0 min-w-0 border-r border-border md:w-[22rem] lg:w-96", listVisible ? "flex w-full flex-col" : "hidden")}>
        <div className="border-b border-border p-4">
          <h1 className="mb-4 text-xl font-semibold">{username}</h1>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="border-0 bg-secondary pl-10" />
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={() => setCreateOpen(true)}>
            <Users className="h-4 w-4" /> Create Group
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1 overscroll-contain">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">Loading conversations...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">No chats or groups found.</div>
          ) : (
            filteredConversations.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelectedKey(c.key)}
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-secondary", selectedKey === c.key && "bg-secondary")}
              >
                {c.type === "dm" ? (
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={c.avatar} alt={c.title} />
                    <AvatarFallback>{c.title.slice(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">
                    <Users className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 flex items-center gap-2">
                    <p className="truncate text-sm font-semibold">{c.title}</p>
                    {c.type === "group" && <Badge variant="secondary">Group</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{c.lastMessage || c.subtitle}</p>
                </div>
                <span className="text-xs text-muted-foreground">{timeAgo(c.lastMessageTime)}</span>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      <div className={cn("min-h-0 min-w-0 flex-1 flex-col", chatVisible ? "flex w-full" : "hidden")}>
        {selectedConversation ? (
          <>
            <div className="flex min-w-0 items-center justify-between border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 overflow-hidden md:gap-3">
                {isMobile && (
                  <Button variant="ghost" size="icon" onClick={() => setSelectedKey(null)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <p className="max-w-[42vw] truncate text-sm font-semibold md:max-w-none">{selectedConversation.title}</p>
                {selectedConversation.type === "group" && selectedConversation.role && (
                  <Badge variant="outline">{selectedConversation.role}</Badge>
                )}
                <Badge className="shrink-0" variant={e2eeActive ? "secondary" : "outline"}>
                  {e2eeActive ? "E2EE" : "Standard"}
                </Badge>
              </div>
              {selectedConversation.type === "group" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => {
                    setGroupInfoOpen(true);
                    loadGroupDetails().catch((error) => {
                      console.error("Failed to open group info:", error);
                    });
                  }}
                >
                  <Users className="h-4 w-4" />
                  <span className="hidden md:inline">Members</span>

                </Button>
              )}
            </div>

            <ScrollArea className="min-h-0 flex-1 overscroll-contain p-3 md:p-4">
              <div className="space-y-3">
                {displayedMessages.map((m) => {
                  if (m.senderId === "system") {
                    return (
                      <p key={m.id} className="text-center text-xs text-muted-foreground">
                        {m.text}
                      </p>
                    );
                  }

                  const isMine = m.senderId === user?.uid;
                  const grouped = groupReactions(m.reactions, user?.uid);
                  const replySnippet =
                    m.replyTo?.text?.trim() ||
                    (m.replyTo?.sharedPost
                      ? m.replyTo.sharedPost.caption
                        ? `Post: ${m.replyTo.sharedPost.caption}`
                        : "Shared post"
                      : m.replyTo?.fileType?.startsWith("image/")
                        ? m.replyTo.fileName
                          ? `Photo: ${m.replyTo.fileName}`
                          : "Photo"
                        : m.replyTo?.fileName
                          ? `Attachment: ${m.replyTo.fileName}`
                          : "Message");
                  const messageUrl = extractFirstUrl(m.text || "");
                  const linkPreview = messageUrl ? linkPreviewsByUrl[messageUrl] : undefined;
                  const safeAttachmentUrl = sanitizeHttpUrl(m.fileUrl);
                  const safeSharedMediaUrl = sanitizeHttpUrl(m.sharedPost?.mediaUrl || null);
                  const safePreviewHref = sanitizeHttpUrl(
                    linkPreview?.canonicalUrl || linkPreview?.url || messageUrl || null,
                  );
                  const safePreviewImage = sanitizeHttpUrl(linkPreview?.image || null);
                  const safePreviewFavicon = sanitizeHttpUrl(linkPreview?.favicon || null);
                  const previewHost =
                    (linkPreview?.siteName || (messageUrl ? getHostLabelFromUrl(messageUrl) : ""))
                      .toString()
                      .trim();

                  return (
                    <div
                      key={m.id}
                      className={cn("flex transition-all duration-150 motion-reduce:transition-none", isMine ? "justify-end" : "justify-start")}
                    >
                      <div className="group max-w-[80%]">
                        <div
                          className={cn(
                            "rounded-2xl px-3 py-2 shadow-sm transition-all duration-150 motion-reduce:transition-none",
                            isMine ? "bg-primary text-primary-foreground" : "bg-secondary",
                          )}
                        >
                          <div className="mb-1 flex items-start justify-between gap-2">
                            {m.forwardedFrom ? (
                              <p className="text-[10px] opacity-75">
                                Forwarded from {m.forwardedFrom.senderName}
                              </p>
                            ) : (
                              <span />
                            )}
                            {m.localOnly && (
                              <div className="flex h-6 w-6 shrink-0 items-center justify-center">
                                {m.localStatus === "sending" ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin opacity-70" />
                                ) : (
                                  <span className="h-3.5 w-3.5" />
                                )}
                              </div>
                            )}
                          </div>

                          {m.replyTo && (
                            <div
                              className={cn(
                                "mb-2 rounded-lg border px-2 py-1 text-xs",
                                isMine
                                  ? "border-primary-foreground/30 bg-primary-foreground/10"
                                  : "border-border bg-background/60",
                              )}
                            >
                              <p className="font-semibold">{m.replyTo.senderName}</p>
                              <p className="truncate opacity-80">{replySnippet}</p>
                            </div>
                          )}

                          {safeAttachmentUrl && m.fileType?.startsWith("image/") && (
                            <img
                              src={safeAttachmentUrl}
                              alt={m.fileName || "Image"}
                              loading="lazy"
                              decoding="async"
                              className="mb-2 max-h-64 rounded-lg object-cover"
                              onClick={() => setFullImage(safeAttachmentUrl)}
                            />
                          )}
                          {safeAttachmentUrl && m.fileType && !m.fileType.startsWith("image/") && (
                            <a
                              href={safeAttachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mb-1 block text-xs underline"
                            >
                              {m.fileName || "Attachment"}
                            </a>
                          )}
                          {m.sharedPost && (
                            <div className="mb-2 overflow-hidden rounded-xl border border-border/60 bg-background/80">
                              <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5">
                                <Avatar className="h-5 w-5">
                                  <AvatarImage
                                    src={m.sharedPost.authorAvatar}
                                    alt={m.sharedPost.authorUsername}
                                  />
                                  <AvatarFallback>
                                    {m.sharedPost.authorUsername.slice(0, 1).toUpperCase()}
                                  </AvatarFallback>
                                </Avatar>
                                <p className="truncate text-[11px] font-semibold text-foreground">
                                  {m.sharedPost.authorUsername}
                                </p>
                              </div>
                              <div className="flex gap-2 p-2">
                                {safeSharedMediaUrl ? (
                                  m.sharedPost.mediaType === "video" ? (
                                    <video
                                      src={safeSharedMediaUrl}
                                      className="h-14 w-14 rounded-md object-cover"
                                      muted
                                      playsInline
                                    />
                                  ) : (
                                    <img
                                      src={safeSharedMediaUrl}
                                      alt="Shared post"
                                      loading="lazy"
                                      decoding="async"
                                      className="h-14 w-14 rounded-md object-cover"
                                      onClick={() => setFullImage(safeSharedMediaUrl)}
                                    />
                                  )
                                ) : (
                                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-border/60 text-[10px] text-muted-foreground">
                                    Media unavailable
                                  </div>
                                )}
                                <div className="min-w-0">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                    Shared Post
                                  </p>
                                  <p className="truncate text-xs text-foreground">
                                    {m.sharedPost.caption || "View post"}
                                  </p>
                                </div>
                              </div>
                            </div>
                          )}
                          {m.text && (
                            <p className="whitespace-pre-wrap text-sm">
                              <MentionText text={m.text} />
                            </p>
                          )}
                          {messageUrl && linkPreview && safePreviewHref && (
                            <a
                              href={safePreviewHref}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 block overflow-hidden rounded-xl border border-border/60 bg-background/85"
                            >
                              {safePreviewImage && (
                                <img
                                  src={safePreviewImage}
                                  alt={linkPreview.title || previewHost || "Link preview"}
                                  loading="lazy"
                                  decoding="async"
                                  className="h-36 w-full object-cover"
                                />
                              )}
                              <div className="p-2">
                                <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {safePreviewFavicon && (
                                    <img
                                      src={safePreviewFavicon}
                                      alt="Site icon"
                                      loading="lazy"
                                      decoding="async"
                                      className="h-3.5 w-3.5 rounded-sm"
                                    />
                                  )}
                                  <span className="truncate">{previewHost || "Link"}</span>
                                </div>
                                <p className="truncate text-xs font-semibold text-foreground">
                                  {linkPreview.title || previewHost || messageUrl}
                                </p>
                                {linkPreview.description ? (
                                  <p className="mt-0.5 break-words text-[11px] text-muted-foreground">
                                    {linkPreview.description}
                                  </p>
                                ) : null}
                              </div>
                            </a>
                          )}
                          {messageUrl && linkPreview === undefined && (
                            <div className="mt-2 rounded-lg border border-border/60 bg-background/75 px-2 py-1 text-[11px] text-muted-foreground">
                              Loading link preview...
                            </div>
                          )}
                          <p className="mt-1 flex items-center gap-1 text-[10px] opacity-70">
                            {m.localStatus === "sending" ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Sending...
                              </>
                            ) : m.localStatus === "failed" ? (
                              <span className="text-destructive">Failed</span>
                            ) : m.localStatus === "sent" ? (
                              "Done"
                            ) : (
                              timeAgo(m.timestamp)
                            )}
                          </p>
                        </div>

                        {!m.localOnly && (
                          <div
                            className={cn(
                              "mt-1 flex items-center gap-1 px-1 transition-all duration-150 md:max-h-0 md:overflow-hidden md:opacity-0 md:pointer-events-none md:group-hover:max-h-8 md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:max-h-8 md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto",
                              isMine ? "justify-end" : "justify-start",
                            )}
                          >
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-full opacity-80 transition-opacity hover:opacity-100"
                              onClick={() => {
                                setReactionTargetId(m.id);
                                setReactionInput("");
                              }}
                            >
                              <Smile className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 rounded-full opacity-80 transition-opacity hover:opacity-100"
                              onClick={() => {
                                setReplyTarget(m);
                              }}
                            >
                              <CornerUpLeft className="h-4 w-4" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 rounded-full opacity-80 transition-opacity hover:opacity-100"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align={isMine ? "end" : "start"} className="w-44">
                                <DropdownMenuItem
                                  onClick={() => {
                                    setForwardTarget(m);
                                    setForwardSearch("");
                                  }}
                                >
                                  <Forward className="mr-2 h-4 w-4" />
                                  Forward
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopyMessage(m)}>
                                  <Copy className="mr-2 h-4 w-4" />
                                  Copy
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => handleReportMessage(m)}
                                >
                                  <Flag className="mr-2 h-4 w-4" />
                                  Report
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        )}

                        {grouped.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1 px-1">
                            {grouped.map((reaction) => (
                              <button
                                key={`${m.id}-${reaction.emoji}`}
                                type="button"
                                onClick={() => handleReactToMessage(m, reaction.emoji)}
                                className={cn(
                                  "rounded-full border px-2 py-0.5 text-xs",
                                  reaction.mine
                                    ? "border-primary bg-primary/10"
                                    : "border-border bg-background/80",
                                )}
                                style={{ fontFamily: EMOJI_FONT_STACK }}
                              >
                                {reaction.emoji} {reaction.count}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-border bg-background/95 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur supports-[backdrop-filter]:bg-background/80 md:p-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx,.txt"
                className="hidden"
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setSelectedFile(e.target.files?.[0] || null);

                }}
              />
              {replyTarget && (
                <div className="mb-2 flex items-start justify-between gap-2 rounded-md border border-border bg-secondary/60 px-2 py-1.5 text-xs">
                  <div className="min-w-0">
                    <p className="font-semibold">Replying to {replyTarget.senderName}</p>
                    <p className="truncate text-muted-foreground">
                      {getMessagePreviewText(replyTarget)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    onClick={() => setReplyTarget(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              {selectedFile && (
                <div className="mb-2 flex items-center justify-between rounded-md bg-secondary px-2 py-1 text-xs">
                  <span className="truncate">{selectedFile.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>Remove</Button>
                </div>
              )}
              {(composerState === "done" || composerState === "error") && (
                <div className="mb-2 flex items-center justify-between rounded-md border border-border/70 bg-secondary/40 px-2 py-1 text-[11px]">
                  {composerState === "done" ? (
                    <span className="text-emerald-500">Done</span>
                  ) : (
                    <span className="text-destructive">Some messages failed</span>
                  )}
                </div>
              )}
              <div className="relative flex w-full min-w-0 items-center gap-2">
                {showGifPicker && (
                  <GifPicker
                    apiKey={giphyApiKey}
                    onSelect={(gif) => {
                      setShowGifPicker(false);
                      void sendMessage({ forcedGif: gif, preserveText: true });
                    }}
                    onClose={() => setShowGifPicker(false)}
                  />
                )}
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Button
                  variant={showGifPicker ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() => setShowGifPicker((prev) => !prev)}
                >
                  <Smile className="h-5 w-5" />
                </Button>
                <MentionInput
                  ref={messageInputRef}
                  placeholder="Message... Use @ to mention"
                  value={messageText}
                  onChange={setMessageText}
                  onKeyPress={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  className="min-w-0 flex-1 border-0 bg-secondary"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={sendMessage}
                  disabled={!messageText.trim() && !selectedFile}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-muted-foreground">Select a chat or group</div>
        )}
      </div>

      {fullImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setFullImage(null)}>
          <Button variant="ghost" size="icon" className="absolute right-4 top-4 text-white" onClick={() => setFullImage(null)}>
            <X className="h-6 w-6" />
          </Button>
          <img src={fullImage} alt="Preview" className="max-h-full max-w-full object-contain" />
        </div>
      )}

      <Dialog
        open={Boolean(reactionTargetMessage)}
        onOpenChange={(open) => {
          if (!open) {
            setReactionTargetId(null);
            setReactionInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>React to message</DialogTitle>
            <DialogDescription>
              Choose a quick emoji or type any emoji to react.
            </DialogDescription>
          </DialogHeader>

          {reactionTargetMessage && (
            <div className="rounded-md border border-border bg-secondary/60 px-3 py-2 text-xs">
              <p className="font-semibold">{reactionTargetMessage.senderName}</p>
              <p className="truncate text-muted-foreground">
                {getMessagePreviewText(reactionTargetMessage)}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {QUICK_REACTIONS.map((emoji) => (
              <Button
                key={emoji}
                type="button"
                variant="outline"
                className="h-9 w-9 p-0 text-lg"
                style={{ fontFamily: EMOJI_FONT_STACK }}
                onClick={() => {
                  if (!reactionTargetMessage) return;
                  handleReactToMessage(reactionTargetMessage, emoji).finally(() => {
                    setReactionTargetId(null);
                    setReactionInput("");
                  });
                }}
              >
                {emoji}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={reactionInput}
              onChange={(e) => setReactionInput(e.target.value)}
              placeholder="Type or paste any emoji"
              style={{ fontFamily: EMOJI_FONT_STACK }}
            />
            <Button
              type="button"
              onClick={() => {
                if (!reactionTargetMessage) return;
                handleReactToMessage(reactionTargetMessage, reactionInput).finally(() => {
                  setReactionTargetId(null);
                  setReactionInput("");
                });
              }}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(forwardTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setForwardTarget(null);
            setForwardSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forward message</DialogTitle>
            <DialogDescription>
              Pick a chat or group to forward this message.
            </DialogDescription>
          </DialogHeader>
          {forwardTarget && (
            <div className="rounded-md border border-border bg-secondary/60 px-3 py-2 text-xs">
              <p className="font-semibold">From {forwardTarget.senderName}</p>
              <p className="truncate text-muted-foreground">
                {getMessagePreviewText(forwardTarget)}
              </p>
            </div>
          )}
          <Input
            value={forwardSearch}
            onChange={(e) => setForwardSearch(e.target.value)}
            placeholder="Search chat or group..."
          />
          <ScrollArea className="h-72 rounded-md border border-border p-2">
            <div className="space-y-1">
              {filteredForwardConversations.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  No chats or groups available.
                </p>
              ) : (
                filteredForwardConversations.map((conversation) => (
                  <button
                    key={conversation.key}
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left hover:bg-secondary"
                    onClick={() => {
                      handleForwardMessage(conversation).catch((error) => {
                        console.error("Forward action failed:", error);
                      });
                    }}
                    disabled={forwardingConversationKey === conversation.key}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {conversation.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {conversation.type === "group" ? "Group chat" : "Direct message"}
                      </p>
                    </div>
                    {forwardingConversationKey === conversation.key ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Forward className="h-4 w-4 text-muted-foreground" />
                    )}
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <Dialog
        open={groupInfoOpen}
        onOpenChange={(open) => {
          setGroupInfoOpen(open);
          if (!open) {
            setSelectedNewMembers(new Set());
            setGroupMemberSearch("");
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              {isGroupConversation?.title || "Group"} members
            </DialogTitle>
            <DialogDescription>
              {groupMembers.length} member{groupMembers.length === 1 ? "" : "s"} in this group.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {isCurrentUserGroupAdmin && (
              <div className="rounded-lg border border-border p-3">
                <p className="mb-2 text-sm font-medium">Add members</p>
                <Input
                  value={groupMemberSearch}
                  onChange={(e) => setGroupMemberSearch(e.target.value)}
                  placeholder="Search users to add..."
                />
                <ScrollArea className="mt-2 h-36 rounded-md border border-border p-2">
                  <div className="space-y-1">
                    {availableGroupCandidates.length === 0 ? (
                      <p className="p-2 text-xs text-muted-foreground">
                        No users available to add.
                      </p>
                    ) : (
                      availableGroupCandidates.map((entry) => {
                        const selected = selectedNewMembers.has(entry.uid);
                        return (
                          <button
                            key={entry.uid}
                            className={cn(
                              "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left",
                              selected ? "bg-primary/10" : "hover:bg-secondary",
                            )}
                            onClick={() => {
                              setSelectedNewMembers((prev) => {
                                const next = new Set(prev);
                                if (next.has(entry.uid)) next.delete(entry.uid);
                                else next.add(entry.uid);
                                return next;
                              });
                            }}
                          >
                            <div className="flex items-center gap-2">
                              <Avatar className="h-7 w-7">
                                <AvatarImage src={entry.avatar} alt={entry.username} />
                                <AvatarFallback>
                                  {entry.username.slice(0, 1).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <span className="text-sm">{entry.username}</span>
                            </div>
                            {selected && <Badge>Selected</Badge>}
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
                <Button
                  className="mt-2 w-full gap-2"
                  onClick={addSelectedMembersToGroup}
                  disabled={addingMembers || selectedNewMembers.size === 0}
                >
                  {addingMembers ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <UserPlus className="h-4 w-4" />
                  )}
                  {addingMembers
                    ? "Adding..."
                    : `Add selected (${selectedNewMembers.size})`}
                </Button>
              </div>
            )}

            <ScrollArea className="h-72 rounded-lg border border-border p-2">
              <div className="space-y-1">
                {groupInfoLoading ? (
                  <div className="flex items-center justify-center p-6 text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading members...
                  </div>
                ) : groupMembers.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">
                    No members found.
                  </p>
                ) : (
                  groupMembers
                    .filter((member) =>
                      member.username
                        .toLowerCase()
                        .includes(groupMemberSearch.toLowerCase().trim()),
                    )
                    .map((member) => {
                      const followState = followStates[member.uid] || "none";
                      const isSelf = member.uid === user?.uid;
                      return (
                        <div
                          key={member.uid}
                          className="flex items-center justify-between rounded-md px-2 py-2 hover:bg-secondary"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={member.avatar} alt={member.username} />
                              <AvatarFallback>
                                {member.username.slice(0, 1).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">
                                {member.username}
                              </p>
                              <div className="flex items-center gap-1">
                                {member.role === "admin" ? (
                                  <Badge variant="secondary" className="gap-1">
                                    <Crown className="h-3 w-3" /> Admin
                                  </Badge>
                                ) : (
                                  <Badge variant="outline">Member</Badge>
                                )}
                                {isSelf && <Badge variant="outline">You</Badge>}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1">
                            {!isSelf && (
                              <Button
                                size="sm"
                                variant={followState === "following" ? "secondary" : "outline"}
                                disabled={
                                  memberActionLoading === `follow:${member.uid}` ||
                                  followState === "following" ||
                                  followState === "requested"
                                }
                                onClick={() => handleFollowGroupMember(member)}
                              >
                                {memberActionLoading === `follow:${member.uid}` ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : followState === "following" ? (
                                  "Following"
                                ) : followState === "requested" ? (
                                  "Requested"
                                ) : (
                                  "Follow"
                                )}
                              </Button>
                            )}

                            {isCurrentUserGroupAdmin && !isSelf && (
                              <>
                                {member.role === "member" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={memberActionLoading === `role:${member.uid}`}
                                    onClick={() => updateGroupMemberRole(member.uid, "admin")}
                                  >
                                    {memberActionLoading === `role:${member.uid}` ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      "Make Admin"
                                    )}
                                  </Button>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={memberActionLoading === `role:${member.uid}`}
                                    onClick={() => updateGroupMemberRole(member.uid, "member")}
                                  >
                                    {memberActionLoading === `role:${member.uid}` ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      "Make Member"
                                    )}
                                  </Button>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={memberActionLoading === `remove:${member.uid}`}
                                  onClick={() => removeGroupMember(member.uid)}
                                >
                                  {memberActionLoading === `remove:${member.uid}` ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <UserMinus className="h-4 w-4 text-destructive" />
                                  )}
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setGroupInfoOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
            <DialogDescription>Group and direct chats are now together in this inbox.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name" />
            <Input value={groupDescription} onChange={(e) => setGroupDescription(e.target.value)} placeholder="Description (optional)" />
            <Input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Search members..." />
            <ScrollArea className="h-56 rounded-md border p-2">
              <div className="space-y-1">
                {filteredUsers.map((u) => {
                  const checked = selectedMembers.has(u.uid);
                  return (
                    <button key={u.uid} className={cn("flex w-full items-center justify-between rounded px-2 py-1.5 text-left", checked ? "bg-primary/10" : "hover:bg-secondary")} onClick={() => {
                      setSelectedMembers((prev) => {
                        const next = new Set(prev);
                        if (next.has(u.uid)) next.delete(u.uid);
                        else next.add(u.uid);
                        return next;
                      });
                    }}>
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarImage src={u.avatar} alt={u.username} />
                          <AvatarFallback>{u.username.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{u.username}</span>
                      </div>
                      {checked && <Badge>Selected</Badge>}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={creatingGroup}>Cancel</Button>
            <Button onClick={createGroup} disabled={creatingGroup} className="gap-2">
              <Plus className="h-4 w-4" /> {creatingGroup ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
