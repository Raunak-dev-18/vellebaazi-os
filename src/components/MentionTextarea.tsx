import { useState, useEffect, useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDatabase, ref, get } from "firebase/database";
import { useAuth } from "@/contexts/AuthContext";

interface User {
  uid: string;
  username: string;
  photoURL?: string;
  interactionScore?: number;
}

interface UserRecord {
  username?: string;
  photoURL?: string;
}

interface ChatMeta {
  otherUserId?: string;
  otherUsername?: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  maxLength?: number;
  id?: string;
}

export function MentionTextarea({
  value,
  onChange,
  placeholder,
  className,
  maxLength,
  id,
}: MentionTextareaProps) {
  const { user } = useAuth();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<User[]>([]);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch followers, following, and recent chat users
  useEffect(() => {
    const fetchActiveUsers = async () => {
      if (!user) return;

      try {
        const db = getDatabase();
        const usersMap = new Map<string, User & { interactionScore: number }>();

        // Get all users data first
        const usersRef = ref(db, "users");
        const usersSnapshot = await get(usersRef);
        const allUsersData = (
          usersSnapshot.exists()
            ? (usersSnapshot.val() as Record<string, UserRecord>)
            : {}
        ) as Record<string, UserRecord>;

        // Fetch followers (people who follow current user)
        const followersRef = ref(db, `followers/${user.uid}`);
        const followersSnapshot = await get(followersRef);
        if (followersSnapshot.exists()) {
          const followers = followersSnapshot.val();
          Object.keys(followers).forEach((uid) => {
            if (uid !== user.uid && allUsersData[uid]) {
              const userData = allUsersData[uid];
              usersMap.set(uid, {
                uid,
                username: userData.username || "user",
                photoURL:
                  userData.photoURL ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
                interactionScore:
                  (usersMap.get(uid)?.interactionScore || 0) + 2,
              });
            }
          });
        }

        // Fetch following (people current user follows)
        const followingRef = ref(db, `following/${user.uid}`);
        const followingSnapshot = await get(followingRef);
        if (followingSnapshot.exists()) {
          const following = followingSnapshot.val();
          Object.keys(following).forEach((uid) => {
            if (uid !== user.uid && allUsersData[uid]) {
              const userData = allUsersData[uid];
              usersMap.set(uid, {
                uid,
                username: userData.username || "user",
                photoURL:
                  userData.photoURL ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
                interactionScore:
                  (usersMap.get(uid)?.interactionScore || 0) + 2,
              });
            }
          });
        }

        // Fetch recent chats for higher interaction score
        const chatsRef = ref(db, `userChats/${user.uid}`);
        const chatsSnapshot = await get(chatsRef);
        if (chatsSnapshot.exists()) {
          const chats = chatsSnapshot.val() as Record<string, ChatMeta>;
          Object.values(chats).forEach((chat) => {
            const uid = chat.otherUserId;
            if (uid && uid !== user.uid && allUsersData[uid]) {
              const userData = allUsersData[uid];
              usersMap.set(uid, {
                uid,
                username: userData.username || chat.otherUsername || "user",
                photoURL:
                  userData.photoURL ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
                interactionScore:
                  (usersMap.get(uid)?.interactionScore || 0) + 3,
              });
            }
          });
        }

        // Sort by interaction score and take top 15
        const sortedUsers = Array.from(usersMap.values())
          .sort((a, b) => (b.interactionScore || 0) - (a.interactionScore || 0))
          .slice(0, 15);

        setActiveUsers(sortedUsers);
      } catch (error) {
        console.error("Error fetching active users:", error);
      }
    };

    fetchActiveUsers();
  }, [user]);

  // Detect @ mentions while typing
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursorPosition = textarea.selectionStart;
    if (cursorPosition === null || cursorPosition === undefined) return;

    // Find the @ symbol before cursor
    const textBeforeCursor = value.slice(0, cursorPosition);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Check if there's a space or newline after @ (meaning mention is complete)
      if (!textAfterAt.includes(" ") && !textAfterAt.includes("\n")) {
        setMentionQuery(textAfterAt.toLowerCase());
        setMentionStartIndex(lastAtIndex);

        // Filter active users based on query - show all if just @ typed
        const filtered = activeUsers
          .filter((u) =>
            u.username.toLowerCase().includes(textAfterAt.toLowerCase()),
          )
          .slice(0, 10);

        setSuggestions(filtered);
        // Show suggestions immediately when @ is typed
        setShowSuggestions(filtered.length > 0);
        setSelectedIndex(0);
        return;
      }
    }

    setShowSuggestions(false);
    setMentionQuery("");
    setMentionStartIndex(-1);
  }, [value, activeUsers]);

  const handleSelectUser = (selectedUser: User) => {
    if (mentionStartIndex === -1) return;

    const beforeMention = value.slice(0, mentionStartIndex);
    const afterMention = value.slice(
      mentionStartIndex + mentionQuery.length + 1,
    );
    const newValue = `${beforeMention}@${selectedUser.username} ${afterMention}`;

    onChange(newValue);
    setShowSuggestions(false);
    setMentionQuery("");
    setMentionStartIndex(-1);

    // Focus back on textarea
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (!showSuggestions) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < suggestions.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter" && suggestions[selectedIndex]) {
      e.preventDefault();
      handleSelectUser(suggestions[selectedIndex]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <Textarea
        ref={textareaRef}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        maxLength={maxLength}
      />

      {/* Mention Suggestions Dropdown */}
      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-[280px] overflow-y-auto">
          {suggestions.length === 0 ? (
            <div className="p-3 text-center text-sm text-muted-foreground">
              No users found
            </div>
          ) : (
            suggestions.map((u, index) => (
              <div
                key={u.uid}
                className={`flex items-center gap-2 p-2 cursor-pointer transition-colors ${
                  index === selectedIndex
                    ? "bg-secondary"
                    : "hover:bg-secondary/50"
                }`}
                onClick={() => handleSelectUser(u)}
              >
                <Avatar className="h-8 w-8">
                  <AvatarImage src={u.photoURL} alt={u.username} />
                  <AvatarFallback>{u.username[0].toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">{u.username}</span>
                  {u.interactionScore && u.interactionScore >= 5 && (
                    <div className="text-xs text-muted-foreground">
                      Frequent contact
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
