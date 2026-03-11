import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Paperclip, Plus, Search, Send, Users, X } from "lucide-react";
import { get, getDatabase, onValue, push, ref, set, update } from "firebase/database";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { uploadToChatStorage } from "@/lib/storage";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
}

interface UserOption {
  uid: string;
  username: string;
  avatar: string;
}

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
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const [users, setUsers] = useState<UserOption[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [fullImage, setFullImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const selectedConversation =
    conversations.find((c) => c.key === selectedKey) || null;

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(groupSearch.toLowerCase().trim()),
  );

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

  useEffect(() => {
    if (!user) return;
    get(ref(db, "users")).then((snap) => {
      if (!snap.exists()) return;
      const data = snap.val() as Record<string, Record<string, unknown>>;
      const list = Object.entries(data)
        .filter(([uid]) => uid !== user.uid)
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
  }, [db, user]);

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
        .filter((c) => c.otherUserId !== user.uid);
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
          const g = await get(ref(db, `groups/${groupId}`));
          if (!g.exists()) return null;
          const groupData = g.val() as Record<string, unknown>;
          return {
            key: `group:${groupId}`,
            type: "group" as const,
            id: groupId,
            title: (groupData.name as string) || "Group",
            avatar: "",
            subtitle: "Group chat",
            role: ((membership.role as Role) || "member") as Role,
            lastMessage: (membership.lastMessage as string) || "",
            lastMessageTime:
              (membership.updatedAt as string) ||
              (groupData.updatedAt as string) ||
              (groupData.createdAt as string) ||
              "",
          };
        }),
      );
      latestGroups = groups.filter((g): g is Conversation => g !== null);
      merge();
    });

    return () => {
      unsubDm();
      unsubGroup();
    };
  }, [db, user]);

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
      const list = Object.entries(data)
        .map(([id, v]) => ({
          id,
          senderId: (v.senderId as string) || "system",
          senderName: (v.senderName as string) || "System",
          text: (v.text as string) || "",
          timestamp: (v.timestamp as string) || "",
          fileUrl: v.fileUrl as string | undefined,
          fileName: v.fileName as string | undefined,
          fileType: v.fileType as string | undefined,
        }))
        .filter((m) => m.text || m.fileUrl)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        );
      setMessages(list);
    });
    return () => unsub();
  }, [db, selectedConversation]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const open = location.state?.openChatWith;
    if (!open || !user) return;
    const chatId = [user.uid, open.userId].sort().join("_");
    const now = new Date().toISOString();
    const avatar =
      open.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${open.username}`;

    get(ref(db, `userChats/${user.uid}/${chatId}`))
      .then(async (snapshot) => {
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
        setSelectedKey(`dm:${chatId}`);
      })
      .catch(() => {
        setSelectedKey(`dm:${chatId}`);
      });
  }, [db, location.state, selfAvatar, user, username]);

  const sendMessage = async () => {
    if (!user || !selectedConversation) return;
    const text = messageText.trim();
    if (!text && !selectedFile) return;
    if (sending) return;
    setSending(true);
    try {
      const now = new Date().toISOString();
      let fileUrl = "";
      if (selectedFile) {
        const ext = selectedFile.name.split(".").pop() || "file";
        fileUrl = await uploadToChatStorage(
          selectedFile,
          `${selectedConversation.id}/${Date.now()}_${user.uid}.${ext}`,
        );
      }

      const msg = {
        senderId: user.uid,
        senderName: username,
        text: text || (selectedFile ? "Sent an attachment" : ""),
        timestamp: now,
        fileUrl: fileUrl || undefined,
        fileName: selectedFile?.name,
        fileType: selectedFile?.type,
      };

      const path =
        selectedConversation.type === "group"
          ? `groupMessages/${selectedConversation.id}`
          : `messages/${selectedConversation.id}`;
      await set(push(ref(db, path)), msg);

      const preview = text || (selectedFile ? `Attachment: ${selectedFile.name}` : "");
      if (selectedConversation.type === "dm" && selectedConversation.otherUserId) {
        await Promise.all([
          set(ref(db, `userChats/${user.uid}/${selectedConversation.id}/lastMessage`), preview),
          set(ref(db, `userChats/${user.uid}/${selectedConversation.id}/lastMessageTime`), now),
          set(
            ref(
              db,
              `userChats/${selectedConversation.otherUserId}/${selectedConversation.id}/lastMessage`,
            ),
            preview,
          ),
          set(
            ref(
              db,
              `userChats/${selectedConversation.otherUserId}/${selectedConversation.id}/lastMessageTime`,
            ),
            now,
          ),
        ]);
      } else if (selectedConversation.type === "group") {
        await update(ref(db, `groups/${selectedConversation.id}`), { updatedAt: now });
        const members = await get(ref(db, `groupMembers/${selectedConversation.id}`));
        if (members.exists()) {
          const m = members.val() as Record<string, Record<string, unknown>>;
          await Promise.all(
            Object.entries(m).map(([uid, info]) =>
              update(ref(db, `userGroups/${uid}/${selectedConversation.id}`), {
                name: selectedConversation.title,
                role: (info.role as Role) || "member",
                updatedAt: now,
                lastMessage: preview,
              }),
            ),
          );
        }
      }

      setMessageText("");
      setSelectedFile(null);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const createGroup = async () => {
    if (!user) return;
    const name = groupName.trim();
    if (name.length < 3 || selectedMembers.size === 0) {
      toast({
        title: "Invalid group",
        description: "Use valid name and select members",
        variant: "destructive",
      });
      return;
    }

    setCreatingGroup(true);
    try {
      const now = new Date().toISOString();
      const groupRef = push(ref(db, "groups"));
      const groupId = groupRef.key;
      if (!groupId) throw new Error("group id missing");

      await set(groupRef, {
        name,
        description: groupDescription.trim(),
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      });

      const userMap = new Map(users.map((u) => [u.uid, u]));
      const members = [user.uid, ...Array.from(selectedMembers)];
      await Promise.all(
        members.map(async (uid) => {
          const profile =
            uid === user.uid
              ? { username, avatar: selfAvatar }
              : userMap.get(uid) || { username: "user", avatar: "" };
          const role: Role = uid === user.uid ? "admin" : "member";

          await set(ref(db, `groupMembers/${groupId}/${uid}`), {
            username: profile.username,
            avatar: profile.avatar,
            role,
            joinedAt: now,
          });
          await set(ref(db, `userGroups/${uid}/${groupId}`), {
            name,
            role,
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

      setCreateOpen(false);
      setGroupName("");
      setGroupDescription("");
      setGroupSearch("");
      setSelectedMembers(new Set());
      setSelectedKey(`group:${groupId}`);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error",
        description: "Failed to create group",
        variant: "destructive",
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  const listVisible = !isMobile || !selectedConversation;
  const chatVisible = !isMobile || !!selectedConversation;

  return (
    <div className="flex h-[calc(100vh-56px)] bg-background md:h-screen">
      <div className={cn("border-r border-border md:w-96", listVisible ? "flex w-full flex-col" : "hidden")}>
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
        <ScrollArea className="flex-1">
          {loading ? (
            <div className="p-6 text-center text-muted-foreground">Loading conversations...</div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground">No chats or groups found.</div>
          ) : (
            filteredConversations.map((c) => (
              <button
                key={c.key}
                onClick={() => setSelectedKey(c.key)}
                className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary", selectedKey === c.key && "bg-secondary")}
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

      <div className={cn("min-w-0 flex-1 flex-col", chatVisible ? "flex" : "hidden")}>
        {selectedConversation ? (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {isMobile && (
                  <Button variant="ghost" size="icon" onClick={() => setSelectedKey(null)}>
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <p className="truncate text-sm font-semibold">{selectedConversation.title}</p>
                {selectedConversation.type === "group" && selectedConversation.role && (
                  <Badge variant="outline">{selectedConversation.role}</Badge>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-3">
                {messages.map((m) =>
                  m.senderId === "system" ? (
                    <p key={m.id} className="text-center text-xs text-muted-foreground">{m.text}</p>
                  ) : (
                    <div key={m.id} className={cn("flex", m.senderId === user?.uid ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[80%] rounded-2xl px-3 py-2", m.senderId === user?.uid ? "bg-primary text-primary-foreground" : "bg-secondary")}>
                        {m.fileUrl && m.fileType?.startsWith("image/") && (
                          <img src={m.fileUrl} alt={m.fileName || "Image"} className="mb-2 max-h-64 rounded-lg object-cover" onClick={() => setFullImage(m.fileUrl || null)} />
                        )}
                        {m.fileUrl && m.fileType && !m.fileType.startsWith("image/") && (
                          <a href={m.fileUrl} target="_blank" rel="noreferrer" className="mb-1 block text-xs underline">{m.fileName || "Attachment"}</a>
                        )}
                        {m.text && <p className="whitespace-pre-wrap text-sm">{m.text}</p>}
                        <p className="mt-1 text-[10px] opacity-70">{timeAgo(m.timestamp)}</p>
                      </div>
                    </div>
                  ),
                )}
                <div ref={endRef} />
              </div>
            </ScrollArea>

            <div className="border-t border-border p-3">
              <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.txt" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => setSelectedFile(e.target.files?.[0] || null)} />
              {selectedFile && (
                <div className="mb-2 flex items-center justify-between rounded-md bg-secondary px-2 py-1 text-xs">
                  <span className="truncate">{selectedFile.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFile(null)}>Remove</Button>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()} disabled={sending}>
                  <Paperclip className="h-5 w-5" />
                </Button>
                <Input
                  placeholder="Message..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  className="border-0 bg-secondary"
                />
                <Button variant="ghost" size="icon" onClick={sendMessage} disabled={sending || (!messageText.trim() && !selectedFile)}>
                  {sending ? <div className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Send className="h-5 w-5" />}
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
