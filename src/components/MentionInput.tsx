import { useState, useEffect, useRef, forwardRef } from "react";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getDatabase, ref as dbRef, get } from "firebase/database";
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

interface MentionInputProps {
  value: string;
  onChange: (value: string) => void;
  onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const MentionInput = forwardRef<HTMLInputElement, MentionInputProps>(
  (
    { value, onChange, onKeyPress, placeholder, className, disabled },
    inputRef,
  ) => {
    const { user } = useAuth();
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [suggestions, setSuggestions] = useState<User[]>([]);
    const [mentionQuery, setMentionQuery] = useState("");
    const [mentionStartIndex, setMentionStartIndex] = useState(-1);
    const [activeUsers, setActiveUsers] = useState<User[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const containerRef = useRef<HTMLDivElement>(null);

    // Fetch followers, following, and recent chat users
    useEffect(() => {
      const fetchActiveUsers = async () => {
        if (!user) return;

        try {
          const db = getDatabase();
          const usersMap = new Map<
            string,
            User & { interactionScore: number }
          >();

          // Get all users data first
          const usersRef = dbRef(db, "users");
          const usersSnapshot = await get(usersRef);
          const allUsersData = (
            usersSnapshot.exists()
              ? (usersSnapshot.val() as Record<string, UserRecord>)
              : {}
          ) as Record<string, UserRecord>;

          // Fetch followers (people who follow current user)
          const followersRef = dbRef(db, `followers/${user.uid}`);
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
          const followingRef = dbRef(db, `following/${user.uid}`);
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
          const chatsRef = dbRef(db, `userChats/${user.uid}`);
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
            .sort(
              (a, b) => (b.interactionScore || 0) - (a.interactionScore || 0),
            )
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
      const cursorPosition = (document.activeElement as HTMLInputElement)
        ?.selectionStart;
      if (cursorPosition === null || cursorPosition === undefined) return;

      // Find the @ symbol before cursor
      const textBeforeCursor = value.slice(0, cursorPosition);
      const lastAtIndex = textBeforeCursor.lastIndexOf("@");

      if (lastAtIndex !== -1) {
        const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
        // Check if there's a space after @ (meaning mention is complete)
        if (!textAfterAt.includes(" ")) {
          setMentionQuery(textAfterAt.toLowerCase());
          setMentionStartIndex(lastAtIndex);

          // Filter active users based on query - show all if just @ typed
          const filtered = activeUsers
            .filter((u) =>
              u.username.toLowerCase().includes(textAfterAt.toLowerCase()),
            )
            .slice(0, 10);

          setSuggestions(filtered);
          // Show suggestions immediately when @ is typed (even with empty query)
          setShowSuggestions(filtered.length > 0);
          setSelectedIndex(0);
          return;
        }
      }

      setShowSuggestions(false);
      setMentionQuery("");
      setMentionStartIndex(-1);
    }, [value, activeUsers]);

    const handleSelectUser = (user: User) => {
      if (mentionStartIndex === -1) return;

      const beforeMention = value.slice(0, mentionStartIndex);
      const afterMention = value.slice(
        mentionStartIndex + mentionQuery.length + 1,
      );
      const newValue = `${beforeMention}@${user.username} ${afterMention}`;

      onChange(newValue);
      setShowSuggestions(false);
      setMentionQuery("");
      setMentionStartIndex(-1);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
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
      <div ref={containerRef} className="relative flex-1">
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onKeyPress={onKeyPress}
          placeholder={placeholder}
          className={className}
          disabled={disabled}
        />

        {/* Mention Suggestions Dropdown */}
        {showSuggestions && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-background border border-border rounded-lg shadow-lg z-50 max-h-[280px] overflow-y-auto">
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
                    <AvatarFallback>
                      {u.username[0].toUpperCase()}
                    </AvatarFallback>
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
  },
);

MentionInput.displayName = "MentionInput";
