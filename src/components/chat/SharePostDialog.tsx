import { useEffect, useMemo, useState } from "react";
import { Search, Send, Users } from "lucide-react";
import { get, getDatabase, push, ref, set, update } from "firebase/database";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getBlockStatus } from "@/utils/blocking";
import {
  encryptTextWithKey,
  ensureConversationKey,
  ensureUserE2EEIdentity,
} from "@/utils/e2ee";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

type TargetType = "dm" | "group";

interface ShareTarget {
  key: string;
  type: TargetType;
  id: string;
  title: string;
  avatar?: string;
  otherUserId?: string;
}

interface SharePostPayload {
  postId: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption: string;
  authorId: string;
  authorUsername: string;
  authorAvatar: string;
}

interface SharePostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: SharePostPayload;
}

export function SharePostDialog({
  open,
  onOpenChange,
  post,
}: SharePostDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const db = getDatabase();
  const [targets, setTargets] = useState<ShareTarget[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingKey, setSendingKey] = useState<string | null>(null);

  const senderName = user?.displayName || user?.email?.split("@")[0] || "user";
  const senderAvatar =
    user?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${senderName}`;

  useEffect(() => {
    if (!open || !user) return;

    let mounted = true;
    const fetchTargets = async () => {
      setLoading(true);
      try {
        await ensureUserE2EEIdentity(user.uid);
        const [dmSnapshot, userGroupsSnapshot] = await Promise.all([
          get(ref(db, `userChats/${user.uid}`)),
          get(ref(db, `userGroups/${user.uid}`)),
        ]);

        const dmTargets: ShareTarget[] = dmSnapshot.exists()
          ? Object.entries(
              dmSnapshot.val() as Record<string, Record<string, unknown>>,
            )
              .filter(([, value]) => typeof value.otherUserId === "string")
              .map(([chatId, value]) => ({
                key: `dm:${chatId}`,
                type: "dm" as const,
                id: chatId,
                title: (value.otherUsername as string) || "User",
                avatar: (value.otherUserAvatar as string) || "",
                otherUserId: value.otherUserId as string,
              }))
          : [];

        const groupTargets: ShareTarget[] = [];
        if (userGroupsSnapshot.exists()) {
          const memberships = userGroupsSnapshot.val() as Record<
            string,
            Record<string, unknown>
          >;
          const groups = await Promise.all(
            Object.keys(memberships).map(async (groupId) => {
              const groupSnapshot = await get(ref(db, `groups/${groupId}`));
              if (!groupSnapshot.exists()) return null;
              const groupData = groupSnapshot.val() as Record<string, unknown>;
              return {
                key: `group:${groupId}`,
                type: "group" as const,
                id: groupId,
                title: (groupData.name as string) || "Group",
              } satisfies ShareTarget;
            }),
          );
          groupTargets.push(
            ...groups.filter((item): item is ShareTarget => item !== null),
          );
        }

        if (mounted) {
          setTargets([...dmTargets, ...groupTargets]);
        }
      } catch (error) {
        console.error("Failed to fetch share targets:", error);
        if (mounted) {
          setTargets([]);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchTargets();
    return () => {
      mounted = false;
    };
  }, [db, open, user]);

  const filteredTargets = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return targets;
    return targets.filter((target) => target.title.toLowerCase().includes(query));
  }, [search, targets]);

  const shareToTarget = async (target: ShareTarget) => {
    if (!user) return;
    if (sendingKey) return;
    setSendingKey(target.key);

    try {
      if (target.type === "dm" && target.otherUserId) {
        const status = await getBlockStatus(user.uid, target.otherUserId);
        if (status.blockedEither) {
          toast({
            title: "Action blocked",
            description: status.blockedByMe
              ? "Unblock this user first."
              : "You cannot share to this chat.",
            variant: "destructive",
          });
          return;
        }
      }

      const now = new Date().toISOString();
      const shareText = "Shared a post";
      let text = shareText;
      let encryptedText: string | undefined;
      let encryptedIv: string | undefined;
      let encryption: string | undefined;

      if (target.type === "dm" && target.otherUserId) {
        const key = await ensureConversationKey({
          scope: "dm",
          conversationId: target.id,
          participantIds: [user.uid, target.otherUserId],
          currentUserId: user.uid,
        });
        if (key) {
          const encrypted = await encryptTextWithKey(shareText, key);
          encryptedText = encrypted.ciphertext;
          encryptedIv = encrypted.iv;
          encryption = "e2ee_v1";
          text = "";
        }
      } else if (target.type === "group") {
        const membersSnapshot = await get(ref(db, `groupMembers/${target.id}`));
        const participants = membersSnapshot.exists()
          ? Object.keys(
              membersSnapshot.val() as Record<string, Record<string, unknown>>,
            )
          : [user.uid];
        const key = await ensureConversationKey({
          scope: "group",
          conversationId: target.id,
          participantIds: participants,
          currentUserId: user.uid,
        });
        if (key) {
          const encrypted = await encryptTextWithKey(shareText, key);
          encryptedText = encrypted.ciphertext;
          encryptedIv = encrypted.iv;
          encryption = "e2ee_v1";
          text = "";
        }
      }

      const sharedPost = {
        postId: post.postId,
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
        caption: post.caption || "",
        authorId: post.authorId,
        authorUsername: post.authorUsername,
        authorAvatar: post.authorAvatar,
      };

      const messagePayload = {
        senderId: user.uid,
        senderName,
        text,
        encryptedText,
        encryptedIv,
        encryption,
        timestamp: now,
        sharedPost,
      };

      if (target.type === "dm" && target.otherUserId) {
        await set(push(ref(db, `messages/${target.id}`)), messagePayload);
        await Promise.all([
          set(ref(db, `userChats/${user.uid}/${target.id}/lastMessage`), shareText),
          set(ref(db, `userChats/${user.uid}/${target.id}/lastMessageTime`), now),
          set(
            ref(db, `userChats/${target.otherUserId}/${target.id}/lastMessage`),
            shareText,
          ),
          set(
            ref(db, `userChats/${target.otherUserId}/${target.id}/lastMessageTime`),
            now,
          ),
        ]);
      } else {
        await set(push(ref(db, `groupMessages/${target.id}`)), messagePayload);
        await update(ref(db, `groups/${target.id}`), { updatedAt: now });
        const membersSnapshot = await get(ref(db, `groupMembers/${target.id}`));
        if (membersSnapshot.exists()) {
          const members = membersSnapshot.val() as Record<
            string,
            Record<string, unknown>
          >;
          await Promise.all(
            Object.entries(members).map(([uid, info]) =>
              update(ref(db, `userGroups/${uid}/${target.id}`), {
                name: target.title,
                role: (info.role as string) || "member",
                updatedAt: now,
                lastMessage: shareText,
              }),
            ),
          );
        }
      }

      toast({
        title: "Shared",
        description: `Post shared to ${target.title}`,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to share post:", error);
      toast({
        title: "Error",
        description: "Unable to share post right now.",
        variant: "destructive",
      });
    } finally {
      setSendingKey(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share</DialogTitle>
          <DialogDescription>Send this post to chats or groups.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search chats"
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-72 rounded-md border">
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Loading...</div>
            ) : filteredTargets.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">
                No chats or groups found.
              </div>
            ) : (
              filteredTargets.map((target) => (
                <div
                  key={target.key}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {target.type === "dm" ? (
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={target.avatar} alt={target.title} />
                        <AvatarFallback>
                          {target.title.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary">
                        <Users className="h-4 w-4" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{target.title}</p>
                      {target.type === "group" && (
                        <Badge variant="outline" className="mt-1 text-[10px]">
                          Group
                        </Badge>
                      )}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="gap-1"
                    onClick={() => shareToTarget(target)}
                    disabled={sendingKey !== null}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {sendingKey === target.key ? "Sending..." : "Send"}
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="flex items-center gap-3 rounded-md border p-2">
          <img
            src={post.mediaUrl}
            alt="Post preview"
            className="h-12 w-12 rounded object-cover"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{post.authorUsername}</p>
            <p className="truncate text-xs text-muted-foreground">
              {post.caption || "Shared post"}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
