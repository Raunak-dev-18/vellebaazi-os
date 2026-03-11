import { useEffect, useMemo, useState } from "react";
import { getDatabase, onValue, ref } from "firebase/database";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ConversationMeta {
  updatedAt: number;
  hasMessage: boolean;
}

const parseTimestamp = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return asNumber;
    const asDate = Date.parse(value);
    if (!Number.isNaN(asDate)) return asDate;
  }
  return 0;
};

const loadSeenMap = (uid: string) => {
  if (typeof window === "undefined") return {} as Record<string, number>;
  try {
    const raw = window.localStorage.getItem(`bakaiti_seen:${uid}`);
    if (!raw) return {} as Record<string, number>;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const safe: Record<string, number> = {};
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        safe[key] = value;
      }
    });
    return safe;
  } catch {
    return {} as Record<string, number>;
  }
};

const saveSeenMap = (uid: string, map: Record<string, number>) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`bakaiti_seen:${uid}`, JSON.stringify(map));
};

export function useNavBadges() {
  const { user } = useAuth();
  const location = useLocation();
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [dmMeta, setDmMeta] = useState<Record<string, ConversationMeta>>({});
  const [groupMeta, setGroupMeta] = useState<Record<string, ConversationMeta>>(
    {},
  );
  const [unreadBakaiti, setUnreadBakaiti] = useState(0);

  const mergedConversationMeta = useMemo(
    () => ({ ...dmMeta, ...groupMeta }),
    [dmMeta, groupMeta],
  );

  useEffect(() => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }

    const db = getDatabase();
    const notificationsRef = ref(db, `notifications/${user.uid}`);
    const unsub = onValue(notificationsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setUnreadNotifications(0);
        return;
      }

      const rows = snapshot.val() as Record<string, { read?: boolean }>;
      const unread = Object.values(rows).filter((row) => row?.read !== true).length;
      setUnreadNotifications(unread);
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDmMeta({});
      setGroupMeta({});
      return;
    }

    const db = getDatabase();
    const dmRef = ref(db, `userChats/${user.uid}`);
    const groupsRef = ref(db, `userGroups/${user.uid}`);

    const unsubDms = onValue(dmRef, (snapshot) => {
      if (!snapshot.exists()) {
        setDmMeta({});
        return;
      }

      const rows = snapshot.val() as Record<string, Record<string, unknown>>;
      const next: Record<string, ConversationMeta> = {};
      Object.entries(rows).forEach(([chatId, value]) => {
        next[`dm:${chatId}`] = {
          updatedAt: parseTimestamp(value.lastMessageTime),
          hasMessage: Boolean((value.lastMessage as string | undefined)?.trim()),
        };
      });
      setDmMeta(next);
    });

    const unsubGroups = onValue(groupsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setGroupMeta({});
        return;
      }

      const rows = snapshot.val() as Record<string, Record<string, unknown>>;
      const next: Record<string, ConversationMeta> = {};
      Object.entries(rows).forEach(([groupId, value]) => {
        next[`group:${groupId}`] = {
          updatedAt: parseTimestamp(value.updatedAt),
          hasMessage: Boolean((value.lastMessage as string | undefined)?.trim()),
        };
      });
      setGroupMeta(next);
    });

    return () => {
      unsubDms();
      unsubGroups();
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUnreadBakaiti(0);
      return;
    }

    const isInBakaiti = location.pathname.startsWith("/bakaiti");
    const seenMap = loadSeenMap(user.uid);

    if (isInBakaiti) {
      const nextSeen = { ...seenMap };
      Object.entries(mergedConversationMeta).forEach(([key, meta]) => {
        if (meta.updatedAt > 0) {
          nextSeen[key] = Math.max(nextSeen[key] || 0, meta.updatedAt);
        }
      });
      saveSeenMap(user.uid, nextSeen);
      setUnreadBakaiti(0);
      return;
    }

    const unreadCount = Object.entries(mergedConversationMeta).filter(
      ([key, meta]) => {
        if (!meta.hasMessage || !meta.updatedAt) return false;
        return meta.updatedAt > (seenMap[key] || 0);
      },
    ).length;

    setUnreadBakaiti(unreadCount);
  }, [location.pathname, mergedConversationMeta, user]);

  return {
    unreadNotifications,
    unreadBakaiti,
  };
}
