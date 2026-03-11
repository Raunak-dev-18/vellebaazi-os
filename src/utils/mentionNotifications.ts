import { get, getDatabase, push, ref, set } from "firebase/database";
import { extractMentions } from "@/utils/mentions";

type MentionSourceType = "post" | "comment" | "story" | "group_message";

interface MentionableUser {
  uid: string;
  username: string;
}

interface SendMentionNotificationsParams {
  actorUserId: string;
  actorUsername: string;
  actorAvatar: string;
  text: string;
  sourceType: MentionSourceType;
  sourceId: string;
  groupId?: string;
  postId?: string;
  storyId?: string;
  chatId?: string;
  usernames?: string[];
  knownUsers?: MentionableUser[];
}

export const sendMentionNotifications = async (
  params: SendMentionNotificationsParams,
) => {
  const {
    actorUserId,
    actorUsername,
    actorAvatar,
    text,
    sourceType,
    sourceId,
    groupId,
    postId,
    storyId,
    chatId,
    usernames,
    knownUsers,
  } = params;

  const mentionedUsernames = usernames ?? extractMentions(text);
  if (mentionedUsernames.length === 0) {
    return;
  }

  const db = getDatabase();
  const usernameToUid = new Map<string, string>();

  if (knownUsers && knownUsers.length > 0) {
    knownUsers.forEach((entry) => {
      usernameToUid.set(entry.username.toLowerCase(), entry.uid);
    });
  } else {
    const usersSnapshot = await get(ref(db, "users"));
    if (!usersSnapshot.exists()) {
      return;
    }

    const users = usersSnapshot.val() as Record<
      string,
      { username?: string } | undefined
    >;
    Object.entries(users).forEach(([uid, value]) => {
      if (!value?.username) return;
      usernameToUid.set(value.username.toLowerCase(), uid);
    });
  }

  const targetUserIds = new Set<string>();
  mentionedUsernames.forEach((username) => {
    const uid = usernameToUid.get(username.toLowerCase());
    if (uid && uid !== actorUserId) {
      targetUserIds.add(uid);
    }
  });

  if (targetUserIds.size === 0) {
    return;
  }

  const timestamp = new Date().toISOString();
  const mentionText = text.trim().slice(0, 180);

  await Promise.all(
    Array.from(targetUserIds).map(async (targetUserId) => {
      const notificationRef = push(ref(db, `notifications/${targetUserId}`));
      await set(notificationRef, {
        type: "mention",
        fromUserId: actorUserId,
        fromUsername: actorUsername,
        fromAvatar: actorAvatar,
        message: mentionText,
        sourceType,
        sourceId,
        groupId: groupId || null,
        postId: postId || null,
        storyId: storyId || null,
        chatId: chatId || null,
        timestamp,
        read: false,
      });
    }),
  );
};

