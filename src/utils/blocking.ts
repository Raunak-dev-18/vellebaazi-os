import { get, getDatabase, ref, remove, set } from "firebase/database";

export interface BlockStatus {
  blockedByMe: boolean;
  blockedMe: boolean;
  blockedEither: boolean;
}

export interface BlockedUser {
  uid: string;
  username: string;
  avatar: string;
  blockedAt: string;
}

export const getBlockStatus = async (
  currentUserId: string,
  targetUserId: string,
): Promise<BlockStatus> => {
  const db = getDatabase();
  const [blockedByMeSnap, blockedMeSnap] = await Promise.all([
    get(ref(db, `blocks/${currentUserId}/${targetUserId}`)),
    get(ref(db, `blocks/${targetUserId}/${currentUserId}`)),
  ]);

  const blockedByMe = blockedByMeSnap.exists();
  const blockedMe = blockedMeSnap.exists();
  return {
    blockedByMe,
    blockedMe,
    blockedEither: blockedByMe || blockedMe,
  };
};

export const getBlockMapsForUser = async (userId: string) => {
  const db = getDatabase();
  const [myBlocksSnap, allBlocksSnap] = await Promise.all([
    get(ref(db, `blocks/${userId}`)),
    get(ref(db, "blocks")),
  ]);

  const blockedByMe = new Set<string>();
  const blockedMe = new Set<string>();

  if (myBlocksSnap.exists()) {
    const data = myBlocksSnap.val() as Record<string, unknown>;
    Object.keys(data).forEach((uid) => blockedByMe.add(uid));
  }

  if (allBlocksSnap.exists()) {
    const allBlocks = allBlocksSnap.val() as Record<string, Record<string, unknown>>;
    Object.entries(allBlocks).forEach(([blockerUid, blockedMap]) => {
      if (blockedMap?.[userId]) {
        blockedMe.add(blockerUid);
      }
    });
  }

  const blockedEither = new Set<string>([...blockedByMe, ...blockedMe]);
  return { blockedByMe, blockedMe, blockedEither };
};

export const blockUser = async (
  currentUserId: string,
  targetUser: { uid: string; username: string; avatar?: string },
) => {
  const db = getDatabase();
  await set(ref(db, `blocks/${currentUserId}/${targetUser.uid}`), {
    uid: targetUser.uid,
    username: targetUser.username,
    avatar:
      targetUser.avatar ||
      `https://api.dicebear.com/7.x/avataaars/svg?seed=${targetUser.uid}`,
    blockedAt: new Date().toISOString(),
  });
};

export const unblockUser = async (
  currentUserId: string,
  targetUserId: string,
) => {
  const db = getDatabase();
  await remove(ref(db, `blocks/${currentUserId}/${targetUserId}`));
};

export const getBlockedUsers = async (currentUserId: string) => {
  const db = getDatabase();
  const snapshot = await get(ref(db, `blocks/${currentUserId}`));
  if (!snapshot.exists()) return [] as BlockedUser[];
  const data = snapshot.val() as Record<
    string,
    { username?: string; avatar?: string; blockedAt?: string }
  >;

  return Object.entries(data).map(([uid, value]) => ({
    uid,
    username: value.username || "user",
    avatar:
      value.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
    blockedAt: value.blockedAt || new Date().toISOString(),
  }));
};

