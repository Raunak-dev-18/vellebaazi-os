import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Crown,
  ImagePlus,
  Plus,
  Send,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import {
  get,
  getDatabase,
  onValue,
  push,
  ref,
  remove,
  set,
  update,
} from "firebase/database";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { uploadToChatStorage } from "@/lib/storage";

type GroupRole = "admin" | "member";

interface UserOption {
  uid: string;
  username: string;
  avatar: string;
}

interface GroupSummary {
  id: string;
  name: string;
  description: string;
  role: GroupRole;
  updatedAt: string;
  membersCount: number;
}

interface GroupMember {
  uid: string;
  username: string;
  avatar: string;
  role: GroupRole;
}

interface GroupMessage {
  id: string;
  senderId: string;
  senderName: string;
  text: string;
  timestamp: string;
  fileUrl?: string;
  fileName?: string;
  fileType?: string;
}

const formatTimestamp = (value?: string) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function Groups() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const db = getDatabase();

  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const [groupSearch, setGroupSearch] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [messageText, setMessageText] = useState("");
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sendingMessage, setSendingMessage] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createMemberSearch, setCreateMemberSearch] = useState("");
  const [createMembers, setCreateMembers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentUsername =
    user?.displayName || user?.email?.split("@")[0] || "user";
  const currentAvatar =
    user?.photoURL ||
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}`;

  const selectedGroup = useMemo(
    () => groups.find((item) => item.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );
  const currentMember = members.find((member) => member.uid === user?.uid);
  const isAdmin = currentMember?.role === "admin";
  const adminCount = members.filter((member) => member.role === "admin").length;

  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  useEffect(() => {
    if (!user) return;

    get(ref(db, "users"))
      .then((snapshot) => {
        if (!snapshot.exists()) {
          setAllUsers([]);
          return;
        }
        const data = snapshot.val() as Record<string, Record<string, unknown>>;
        const parsed = Object.entries(data)
          .filter(([uid]) => uid !== user.uid)
          .map(([uid, record]) => {
            const username =
              (record.username as string) ||
              ((record.email as string) || "user@local").split("@")[0];
            const avatar =
              (record.photoURL as string) ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`;
            return { uid, username, avatar };
          })
          .sort((a, b) => a.username.localeCompare(b.username));
        setAllUsers(parsed);
      })
      .catch(() => {
        toast({
          title: "Error",
          description: "Failed to load users for groups.",
          variant: "destructive",
        });
      });
  }, [db, toast, user]);

  useEffect(() => {
    if (!user) return;

    const unsubscribe = onValue(ref(db, `userGroups/${user.uid}`), async (snap) => {
      if (!snap.exists()) {
        setGroups([]);
        setSelectedGroupId(null);
        return;
      }

      const memberships = snap.val() as Record<string, Record<string, unknown>>;
      const parsed = await Promise.all(
        Object.entries(memberships).map(async ([groupId, membership]) => {
          const groupSnap = await get(ref(db, `groups/${groupId}`));
          if (!groupSnap.exists()) return null;
          const group = groupSnap.val() as Record<string, unknown>;
          const membersSnap = await get(ref(db, `groupMembers/${groupId}`));
          const membersCount = membersSnap.exists()
            ? Object.keys(membersSnap.val() as Record<string, unknown>).length
            : 0;
          return {
            id: groupId,
            name: (group.name as string) || "Untitled Group",
            description: (group.description as string) || "",
            role: ((membership.role as GroupRole) || "member") as GroupRole,
            updatedAt:
              (membership.updatedAt as string) ||
              (group.updatedAt as string) ||
              (group.createdAt as string) ||
              "",
            membersCount,
          } as GroupSummary;
        }),
      );

      const valid = parsed
        .filter((item): item is GroupSummary => Boolean(item))
        .sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );

      setGroups(valid);
      setSelectedGroupId((prev) => {
        if (!valid.length) return null;
        if (prev && valid.some((item) => item.id === prev)) return prev;
        return valid[0].id;
      });
    });

    return () => unsubscribe();
  }, [db, user]);

  useEffect(() => {
    setMessageText("");
    setSelectedImage(null);
    setImagePreview((previousPreview) => {
      if (previousPreview) {
        URL.revokeObjectURL(previousPreview);
      }
      return null;
    });

    if (!selectedGroupId) {
      setMembers([]);
      setMessages([]);
      return;
    }

    const memberUnsub = onValue(ref(db, `groupMembers/${selectedGroupId}`), (snap) => {
      if (!snap.exists()) {
        setMembers([]);
        return;
      }
      const data = snap.val() as Record<string, Record<string, unknown>>;
      const parsed = Object.entries(data)
        .map(([uid, item]) => ({
          uid,
          username: (item.username as string) || "user",
          avatar:
            (item.avatar as string) ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${(item.username as string) || "user"}`,
          role: ((item.role as GroupRole) || "member") as GroupRole,
        }))
        .sort((a, b) => {
          if (a.role === b.role) return a.username.localeCompare(b.username);
          return a.role === "admin" ? -1 : 1;
        });
      setMembers(parsed);
    });

    const messageUnsub = onValue(ref(db, `groupMessages/${selectedGroupId}`), (snap) => {
      if (!snap.exists()) {
        setMessages([]);
        return;
      }
      const data = snap.val() as Record<string, Record<string, unknown>>;
      const parsed = Object.entries(data)
        .map(([id, item]) => ({
          id,
          senderId: (item.senderId as string) || "system",
          senderName: (item.senderName as string) || "System",
          text: (item.text as string) || "",
          timestamp: (item.timestamp as string) || "",
          fileUrl: item.fileUrl as string | undefined,
          fileName: item.fileName as string | undefined,
          fileType: item.fileType as string | undefined,
        }))
        .filter((item) => item.text || item.fileUrl)
        .sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
        )
        .slice(-250);
      setMessages(parsed);
    });

    return () => {
      memberUnsub();
      messageUnsub();
    };
  }, [db, selectedGroupId]);

  const filteredGroups = groups.filter((group) =>
    group.name.toLowerCase().includes(groupSearch.toLowerCase().trim()),
  );
  const filteredCreateUsers = allUsers.filter((person) =>
    person.username.toLowerCase().includes(createMemberSearch.toLowerCase().trim()),
  );
  const filteredUsersToAdd = allUsers.filter((person) => {
    if (members.some((member) => member.uid === person.uid)) return false;
    return person.username.toLowerCase().includes(memberSearch.toLowerCase().trim());
  });
  const mentionMatch = messageText.match(/(?:^|\\s)@([a-zA-Z0-9_]*)$/);
  const mentionSuggestions =
    mentionMatch && selectedGroup
      ? members
          .filter((member) =>
            member.username
              .toLowerCase()
              .includes(mentionMatch[1].toLowerCase()),
          )
          .slice(0, 6)
      : [];

  const toggleCreateMember = (uid: string) => {
    setCreateMembers((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const resetCreate = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateMemberSearch("");
    setCreateMembers(new Set());
  };

  const openEditDialog = () => {
    if (!selectedGroup) return;
    setEditName(selectedGroup.name);
    setEditDescription(selectedGroup.description);
    setEditOpen(true);
  };

  const updateGroupInfo = async () => {
    if (!selectedGroupId || !selectedGroup || !isAdmin) return;
    const name = editName.trim();
    if (name.length < 3) {
      toast({
        title: "Invalid name",
        description: "Group name must be at least 3 characters.",
        variant: "destructive",
      });
      return;
    }

    const now = new Date().toISOString();
    await update(ref(db, `groups/${selectedGroupId}`), {
      name,
      description: editDescription.trim(),
      updatedAt: now,
    });

    await Promise.all(
      members.map((member) =>
        update(ref(db, `userGroups/${member.uid}/${selectedGroupId}`), {
          name,
          updatedAt: now,
        }),
      ),
    );

    await set(push(ref(db, `groupMessages/${selectedGroupId}`)), {
      senderId: "system",
      senderName: "System",
      text: `${currentUsername} updated group info.`,
      timestamp: now,
    });

    setEditOpen(false);
    toast({ title: "Group updated", description: "Group info saved." });
  };

  const removeSelectedImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleImageSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid file",
        description: "Only image files are supported in group chat.",
        variant: "destructive",
      });
      return;
    }

    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    const preview = URL.createObjectURL(file);
    setSelectedImage(file);
    setImagePreview(preview);
    event.target.value = "";
  };

  const insertMention = (username: string) => {
    if (!mentionMatch) return;
    const replaced = messageText.replace(
      /(?:^|\\s)@[a-zA-Z0-9_]*$/,
      (match) => `${match[0] === " " ? " " : ""}@${username} `,
    );
    setMessageText(replaced);
  };

  const createGroup = async () => {
    if (!user) return;
    const name = createName.trim();
    if (name.length < 3 || createMembers.size === 0) {
      toast({
        title: "Invalid group",
        description: "Provide name (min 3 chars) and at least one member.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const groupRef = push(ref(db, "groups"));
      const groupId = groupRef.key;
      if (!groupId) throw new Error("Group id missing");

      await set(groupRef, {
        name,
        description: createDescription.trim(),
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
      });

      const usersMap = new Map(allUsers.map((item) => [item.uid, item]));
      const ids = [user.uid, ...Array.from(createMembers)];
      await Promise.all(
        ids.map(async (uid) => {
          const person =
            uid === user.uid
              ? { username: currentUsername, avatar: currentAvatar }
              : usersMap.get(uid);
          const role: GroupRole = uid === user.uid ? "admin" : "member";
          await set(ref(db, `groupMembers/${groupId}/${uid}`), {
            username: person?.username || "user",
            avatar: person?.avatar || "",
            role,
            joinedAt: now,
          });
          await set(ref(db, `userGroups/${uid}/${groupId}`), {
            name,
            role,
            joinedAt: now,
            updatedAt: now,
          });
        }),
      );

      await set(push(ref(db, `groupMessages/${groupId}`)), {
        senderId: "system",
        senderName: "System",
        text: `${currentUsername} created the group.`,
        timestamp: now,
      });

      setCreateOpen(false);
      setSelectedGroupId(groupId);
      resetCreate();
      toast({ title: "Group created", description: `${name} is ready.` });
    } catch {
      toast({
        title: "Failed to create",
        description: "Could not create group.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!user || !selectedGroupId || !selectedGroup) return;
    const text = messageText.trim();
    if (!text && !selectedImage) return;
    if (sendingMessage) return;

    setSendingMessage(true);
    setMessageText("");

    const now = new Date().toISOString();
    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;
      let fileType: string | undefined;

      if (selectedImage) {
        const uploadedUrl = await uploadToChatStorage(selectedImage, user.uid);
        fileUrl = uploadedUrl;
        fileName = selectedImage.name;
        fileType = selectedImage.type;
      }

      await set(push(ref(db, `groupMessages/${selectedGroupId}`)), {
        senderId: user.uid,
        senderName: currentUsername,
        text,
        timestamp: now,
        fileUrl,
        fileName,
        fileType,
      });
      await update(ref(db, `groups/${selectedGroupId}`), { updatedAt: now });
      await Promise.all(
        members.map((member) =>
          update(ref(db, `userGroups/${member.uid}/${selectedGroupId}`), {
            name: selectedGroup.name,
            role: member.role,
            updatedAt: now,
            lastMessage: text
              ? text.slice(0, 80)
              : selectedImage
                ? "Image"
                : "",
          }),
        ),
      );
      removeSelectedImage();
    } catch {
      toast({
        title: "Failed to send",
        description: "Message could not be sent.",
        variant: "destructive",
      });
      setMessageText(text);
    } finally {
      setSendingMessage(false);
    }
  };

  const updateRole = async (memberId: string, nextRole: GroupRole) => {
    if (!selectedGroupId || !isAdmin) return;
    const target = members.find((item) => item.uid === memberId);
    if (!target || target.role === nextRole) return;
    if (target.role === "admin" && nextRole === "member" && adminCount === 1) {
      toast({
        title: "Action blocked",
        description: "At least one admin must remain.",
        variant: "destructive",
      });
      return;
    }

    const now = new Date().toISOString();
    await update(ref(db, `groupMembers/${selectedGroupId}/${memberId}`), {
      role: nextRole,
    });
    await update(ref(db, `userGroups/${memberId}/${selectedGroupId}`), {
      role: nextRole,
      updatedAt: now,
    });
  };

  const addMember = async (memberId: string) => {
    if (!selectedGroupId || !selectedGroup || !isAdmin) return;
    const person = allUsers.find((item) => item.uid === memberId);
    if (!person) return;

    const now = new Date().toISOString();
    await set(ref(db, `groupMembers/${selectedGroupId}/${memberId}`), {
      username: person.username,
      avatar: person.avatar,
      role: "member",
      joinedAt: now,
    });
    await set(ref(db, `userGroups/${memberId}/${selectedGroupId}`), {
      name: selectedGroup.name,
      role: "member",
      joinedAt: now,
      updatedAt: now,
    });
  };

  const removeMember = async (memberId: string) => {
    if (!selectedGroupId || !isAdmin) return;
    const target = members.find((item) => item.uid === memberId);
    if (!target) return;
    if (target.role === "admin" && adminCount === 1) {
      toast({
        title: "Action blocked",
        description: "At least one admin must remain.",
        variant: "destructive",
      });
      return;
    }
    await remove(ref(db, `groupMembers/${selectedGroupId}/${memberId}`));
    await remove(ref(db, `userGroups/${memberId}/${selectedGroupId}`));
  };

  const leaveGroup = async () => {
    if (!user || !selectedGroupId || !currentMember) return;

    const myRole = currentMember.role;
    const others = members.filter((member) => member.uid !== user.uid);
    const adminOthers = others.filter((member) => member.role === "admin");

    if (members.length <= 1) {
      await Promise.all([
        remove(ref(db, `groups/${selectedGroupId}`)),
        remove(ref(db, `groupMembers/${selectedGroupId}`)),
        remove(ref(db, `groupMessages/${selectedGroupId}`)),
        remove(ref(db, `userGroups/${user.uid}/${selectedGroupId}`)),
      ]);
    } else {
      if (myRole === "admin" && adminOthers.length === 0 && others.length > 0) {
        await update(ref(db, `groupMembers/${selectedGroupId}/${others[0].uid}`), {
          role: "admin",
        });
        await update(ref(db, `userGroups/${others[0].uid}/${selectedGroupId}`), {
          role: "admin",
        });
      }
      await Promise.all([
        remove(ref(db, `groupMembers/${selectedGroupId}/${user.uid}`)),
        remove(ref(db, `userGroups/${user.uid}/${selectedGroupId}`)),
      ]);
    }

    setSelectedGroupId(null);
    setMembers([]);
    setMessages([]);
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-7xl overflow-hidden md:h-[calc(100vh-2rem)] md:p-4">
      <aside
        className={`${isMobile && selectedGroup ? "hidden" : "flex"} w-full flex-col border-r border-border bg-card md:w-80 md:rounded-l-2xl`}
      >
        <div className="border-b border-border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h1 className="text-xl font-semibold">Groups</h1>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-4 w-4" />
              Create
            </Button>
          </div>
          <Input
            value={groupSearch}
            onChange={(event) => setGroupSearch(event.target.value)}
            placeholder="Search groups..."
          />
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {filteredGroups.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No groups yet. Create one to get started.
              </div>
            ) : (
              filteredGroups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroupId(group.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                    selectedGroupId === group.id
                      ? "border-primary/30 bg-primary/5"
                      : "border-transparent hover:bg-secondary"
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="truncate font-semibold">{group.name}</p>
                    <Badge variant={group.role === "admin" ? "default" : "secondary"}>
                      {group.role}
                    </Badge>
                  </div>
                  <p className="line-clamp-1 text-xs text-muted-foreground">
                    {group.description || `${group.membersCount} members`}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatTimestamp(group.updatedAt)}
                  </p>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      <section
        className={`${isMobile && !selectedGroup ? "hidden" : "flex"} min-w-0 flex-1 flex-col bg-background md:rounded-r-2xl md:border md:border-l-0 md:border-border`}
      >
        {!selectedGroup ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center">
            <div className="mb-4 rounded-full border border-border p-4">
              <Users className="h-10 w-10 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold">Select a group</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create groups, manage roles, and chat together.
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                {isMobile && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedGroupId(null)}
                    className="h-8 w-8"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{selectedGroup.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {selectedGroup.description || `${members.length} members`}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Button variant="outline" size="sm" onClick={openEditDialog}>
                    Edit
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={leaveGroup}>
                  Leave
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
              <div className="flex min-h-0 flex-1 flex-col border-b border-border lg:border-b-0 lg:border-r">
                <ScrollArea className="flex-1 px-4 py-4">
                  <div className="space-y-3">
                    {messages.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                        Start the conversation.
                      </div>
                    ) : (
                      messages.map((message) => {
                        if (message.senderId === "system") {
                          return (
                            <p key={message.id} className="text-center text-xs text-muted-foreground">
                              {message.text}
                            </p>
                          );
                        }
                        const mine = message.senderId === user?.uid;
                        const sender = members.find((item) => item.uid === message.senderId);
                        return (
                          <div
                            key={message.id}
                            className={`flex gap-2 ${mine ? "justify-end" : "justify-start"}`}
                          >
                            {!mine && (
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={sender?.avatar} alt={message.senderName} />
                                <AvatarFallback>
                                  {message.senderName.slice(0, 1).toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div
                              className={`max-w-[80%] rounded-2xl px-3 py-2 ${
                                mine ? "bg-primary text-primary-foreground" : "bg-secondary"
                              }`}
                            >
                              {!mine && (
                                <p className="mb-1 text-[11px] font-semibold opacity-80">
                                  {message.senderName}
                                </p>
                              )}
                              {message.fileUrl &&
                                message.fileType?.startsWith("image/") && (
                                  <img
                                    src={message.fileUrl}
                                    alt={message.fileName || "Shared image"}
                                    className="mb-2 max-h-64 w-full rounded-lg object-cover"
                                  />
                                )}
                              {message.text && (
                                <p className="whitespace-pre-wrap text-sm">{message.text}</p>
                              )}
                              <p className="mt-1 text-[10px] opacity-70">
                                {formatTimestamp(message.timestamp)}
                              </p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>

                <div className="border-t border-border p-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                  />
                  {imagePreview && (
                    <div className="mb-3 flex items-center justify-between rounded-lg border border-border bg-secondary/50 p-2">
                      <div className="flex items-center gap-2">
                        <img
                          src={imagePreview}
                          alt="Selected"
                          className="h-12 w-12 rounded-md object-cover"
                        />
                        <p className="text-xs text-muted-foreground">
                          Ready to send image
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" onClick={removeSelectedImage}>
                        Remove
                      </Button>
                    </div>
                  )}
                  {mentionSuggestions.length > 0 && (
                    <div className="mb-2 rounded-lg border border-border bg-background p-1 shadow-sm">
                      {mentionSuggestions.map((member) => (
                        <button
                          key={member.uid}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-secondary"
                          onClick={() => insertMention(member.username)}
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={member.avatar} alt={member.username} />
                            <AvatarFallback>
                              {member.username.slice(0, 1).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <span>@{member.username}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => fileInputRef.current?.click()}
                      aria-label="Attach image"
                    >
                      <ImagePlus className="h-4 w-4" />
                    </Button>
                    <Input
                      placeholder="Send message to group..."
                      value={messageText}
                      onChange={(event) => setMessageText(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          sendMessage();
                        }
                      }}
                    />
                    <Button
                      size="icon"
                      onClick={sendMessage}
                      disabled={(!messageText.trim() && !selectedImage) || sendingMessage}
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="w-full space-y-3 overflow-y-auto p-3 lg:w-80">
                <div className="rounded-xl border border-border p-3">
                  <h3 className="mb-3 text-sm font-semibold">Members</h3>
                  <div className="space-y-2">
                    {members.map((member) => (
                      <div
                        key={member.uid}
                        className="flex items-center justify-between gap-2 rounded-lg bg-secondary/60 p-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={member.avatar} alt={member.username} />
                            <AvatarFallback>{member.username.slice(0, 1).toUpperCase()}</AvatarFallback>
                          </Avatar>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">{member.username}</p>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              {member.role === "admin" ? (
                                <Crown className="h-3 w-3" />
                              ) : (
                                <Shield className="h-3 w-3" />
                              )}
                              <span>{member.role}</span>
                            </div>
                          </div>
                        </div>
                        {isAdmin && member.uid !== user?.uid && (
                          <div className="flex items-center gap-1">
                            {member.role === "member" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => updateRole(member.uid, "admin")}
                              >
                                Promote
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={() => updateRole(member.uid, "member")}
                              >
                                Demote
                              </Button>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => removeMember(member.uid)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {isAdmin && (
                  <div className="rounded-xl border border-border p-3">
                    <h3 className="mb-3 text-sm font-semibold">Add Members</h3>
                    <Input
                      placeholder="Search people..."
                      value={memberSearch}
                      onChange={(event) => setMemberSearch(event.target.value)}
                    />
                    <div className="mt-3 space-y-2">
                      {filteredUsersToAdd.slice(0, 6).map((person) => (
                        <div
                          key={person.uid}
                          className="flex items-center justify-between rounded-lg bg-secondary/60 p-2"
                        >
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={person.avatar} alt={person.username} />
                              <AvatarFallback>{person.username.slice(0, 1).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <p className="text-sm">{person.username}</p>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => addMember(person.uid)}
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Add
                          </Button>
                        </div>
                      ))}
                      {filteredUsersToAdd.length === 0 && (
                        <p className="text-xs text-muted-foreground">No users available to add.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </section>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Group</DialogTitle>
            <DialogDescription>
              Admin can update group name and description.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Group name"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
            />
            <Input
              placeholder="Group description"
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={updateGroupInfo}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreate();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Create Group</DialogTitle>
            <DialogDescription>
              Pick a name and members. Admin and member roles are managed in the group panel.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              placeholder="Group name"
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
            />
            <Input
              placeholder="Group description (optional)"
              value={createDescription}
              onChange={(event) => setCreateDescription(event.target.value)}
            />
            <Input
              placeholder="Search members..."
              value={createMemberSearch}
              onChange={(event) => setCreateMemberSearch(event.target.value)}
            />

            <ScrollArea className="h-64 rounded-lg border border-border p-2">
              <div className="space-y-1">
                {filteredCreateUsers.map((person) => {
                  const selected = createMembers.has(person.uid);
                  return (
                    <button
                      key={person.uid}
                      onClick={() => toggleCreateMember(person.uid)}
                      className={`flex w-full items-center justify-between rounded-lg px-2 py-2 text-left transition-colors ${
                        selected ? "bg-primary/10" : "hover:bg-secondary"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={person.avatar} alt={person.username} />
                          <AvatarFallback>{person.username.slice(0, 1).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <span className="text-sm">{person.username}</span>
                      </div>
                      {selected && <Badge>Selected</Badge>}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={createGroup} disabled={saving} className="gap-1.5">
              <Users className="h-4 w-4" />
              {saving ? "Creating..." : "Create Group"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
