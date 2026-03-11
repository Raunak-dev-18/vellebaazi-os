import { get, getDatabase, ref, set } from "firebase/database";

const USER_PRIVATE_KEY_PREFIX = "vb_e2ee_private_";
const USER_PUBLIC_KEY_PREFIX = "vb_e2ee_public_";

interface WrappedKeyRecord {
  wrappedKey: string;
  wrappedAt: string;
  wrappedBy: string;
  alg: "RSA-OAEP";
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  alg: "AES-GCM";
  v: 1;
}

export interface RecipientEncryptedPayload extends EncryptedPayload {
  wrappedKeys: Record<string, WrappedKeyRecord>;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const hasCrypto = () =>
  typeof window !== "undefined" &&
  Boolean(window.crypto?.subtle) &&
  typeof localStorage !== "undefined";

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

const fromBase64 = (value: string) => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const generateAesKeyBytes = () => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytes;
};

const importAesKey = async (keyBytes: Uint8Array, usage: KeyUsage[]) =>
  crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, usage);

const importPrivateRsaKey = async (jwkJson: string) =>
  crypto.subtle.importKey(
    "jwk",
    JSON.parse(jwkJson) as JsonWebKey,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["decrypt"],
  );

const importPublicRsaKey = async (jwk: JsonWebKey) =>
  crypto.subtle.importKey(
    "jwk",
    jwk,
    {
      name: "RSA-OAEP",
      hash: "SHA-256",
    },
    true,
    ["encrypt"],
  );

const getLocalPrivateKeyString = (userId: string) =>
  localStorage.getItem(`${USER_PRIVATE_KEY_PREFIX}${userId}`);

const getLocalPublicKeyString = (userId: string) =>
  localStorage.getItem(`${USER_PUBLIC_KEY_PREFIX}${userId}`);

export const ensureUserE2EEIdentity = async (userId: string) => {
  if (!hasCrypto()) return false;

  const db = getDatabase();
  const localPrivate = getLocalPrivateKeyString(userId);
  const localPublic = getLocalPublicKeyString(userId);

  if (localPrivate && localPublic) {
    const existing = await get(ref(db, `userE2EEKeys/${userId}`));
    if (!existing.exists()) {
      await set(ref(db, `userE2EEKeys/${userId}`), {
        publicKeyJwk: JSON.parse(localPublic),
        updatedAt: new Date().toISOString(),
      });
    }
    return true;
  }

  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"],
  );

  const [privateJwk, publicJwk] = await Promise.all([
    crypto.subtle.exportKey("jwk", keyPair.privateKey),
    crypto.subtle.exportKey("jwk", keyPair.publicKey),
  ]);

  localStorage.setItem(
    `${USER_PRIVATE_KEY_PREFIX}${userId}`,
    JSON.stringify(privateJwk),
  );
  localStorage.setItem(
    `${USER_PUBLIC_KEY_PREFIX}${userId}`,
    JSON.stringify(publicJwk),
  );

  await set(ref(db, `userE2EEKeys/${userId}`), {
    publicKeyJwk: publicJwk,
    updatedAt: new Date().toISOString(),
  });
  return true;
};

const getUserPublicJwk = async (userId: string) => {
  const db = getDatabase();
  const snapshot = await get(ref(db, `userE2EEKeys/${userId}/publicKeyJwk`));
  if (!snapshot.exists()) return null;
  return snapshot.val() as JsonWebKey;
};

const encryptAesKeyForUser = async (
  keyBytes: Uint8Array,
  userId: string,
): Promise<string | null> => {
  if (!hasCrypto()) return null;
  const publicJwk = await getUserPublicJwk(userId);
  if (!publicJwk) return null;
  const publicKey = await importPublicRsaKey(publicJwk);
  const encrypted = await crypto.subtle.encrypt(
    { name: "RSA-OAEP" },
    publicKey,
    keyBytes,
  );
  return toBase64(new Uint8Array(encrypted));
};

const decryptAesKeyForCurrentUser = async (
  wrappedKeyBase64: string,
  userId: string,
) => {
  if (!hasCrypto()) return null;
  const privateJwk = getLocalPrivateKeyString(userId);
  if (!privateJwk) return null;
  const privateKey = await importPrivateRsaKey(privateJwk);
  const wrappedBytes = fromBase64(wrappedKeyBase64);
  const decrypted = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    wrappedBytes,
  );
  return new Uint8Array(decrypted);
};

export const encryptTextWithKey = async (
  plaintext: string,
  keyBytes: Uint8Array,
): Promise<EncryptedPayload> => {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const aesKey = await importAesKey(keyBytes, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    textEncoder.encode(plaintext),
  );
  return {
    ciphertext: toBase64(new Uint8Array(encrypted)),
    iv: toBase64(iv),
    alg: "AES-GCM",
    v: 1,
  };
};

export const decryptTextWithKey = async (
  payload: Pick<EncryptedPayload, "ciphertext" | "iv">,
  keyBytes: Uint8Array,
) => {
  const aesKey = await importAesKey(keyBytes, ["decrypt"]);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(payload.iv) },
    aesKey,
    fromBase64(payload.ciphertext),
  );
  return textDecoder.decode(decrypted);
};

const getConversationKeyPath = (
  scope: "dm" | "group",
  conversationId: string,
  userId: string,
) => `e2ee/conversations/${scope}/${conversationId}/keys/${userId}`;

export const ensureConversationKey = async (params: {
  scope: "dm" | "group";
  conversationId: string;
  participantIds: string[];
  currentUserId: string;
}) => {
  const { scope, conversationId, participantIds, currentUserId } = params;
  if (!hasCrypto()) return null;
  await ensureUserE2EEIdentity(currentUserId);

  const db = getDatabase();
  const myPath = getConversationKeyPath(scope, conversationId, currentUserId);
  const myKeySnapshot = await get(ref(db, myPath));
  const keysRootPath = `e2ee/conversations/${scope}/${conversationId}/keys`;
  const keysRootSnapshot = await get(ref(db, keysRootPath));

  if (myKeySnapshot.exists()) {
    const data = myKeySnapshot.val() as WrappedKeyRecord;
    const unwrapped = await decryptAesKeyForCurrentUser(
      data.wrappedKey,
      currentUserId,
    );
    if (unwrapped) return unwrapped;
  }

  if (keysRootSnapshot.exists()) {
    // Existing conversation key material is already present, but current user has no wrapped key.
    // Avoid rotating and breaking old encrypted history for existing participants.
    return null;
  }

  const uniqueParticipants = Array.from(new Set(participantIds));
  const participantPublicKeys = await Promise.all(
    uniqueParticipants.map(async (uid) => ({
      uid,
      publicJwk: await getUserPublicJwk(uid),
    })),
  );

  if (participantPublicKeys.some((entry) => !entry.publicJwk)) {
    return null;
  }

  const keyBytes = generateAesKeyBytes();
  const now = new Date().toISOString();

  await Promise.all(
    participantPublicKeys.map(async ({ uid }) => {
      const wrappedKey = await encryptAesKeyForUser(keyBytes, uid);
      if (!wrappedKey) return;
      await set(ref(db, getConversationKeyPath(scope, conversationId, uid)), {
        wrappedKey,
        wrappedAt: now,
        wrappedBy: currentUserId,
        alg: "RSA-OAEP",
      } satisfies WrappedKeyRecord);
    }),
  );

  const finalSnapshot = await get(ref(db, myPath));
  if (!finalSnapshot.exists()) return null;
  const finalData = finalSnapshot.val() as WrappedKeyRecord;
  return decryptAesKeyForCurrentUser(finalData.wrappedKey, currentUserId);
};

export const encryptForRecipients = async (params: {
  ownerUserId: string;
  recipientUserIds: string[];
  plaintext: string;
}) => {
  const { ownerUserId, recipientUserIds, plaintext } = params;
  if (!hasCrypto()) return null;
  await ensureUserE2EEIdentity(ownerUserId);

  const keyBytes = generateAesKeyBytes();
  const encrypted = await encryptTextWithKey(plaintext, keyBytes);
  const now = new Date().toISOString();
  const wrappedKeys: Record<string, WrappedKeyRecord> = {};

  const uniqueRecipients = Array.from(new Set(recipientUserIds));
  const recipientPublicKeys = await Promise.all(
    uniqueRecipients.map(async (uid) => ({
      uid,
      publicJwk: await getUserPublicJwk(uid),
    })),
  );

  if (recipientPublicKeys.some((entry) => !entry.publicJwk)) {
    return null;
  }

  await Promise.all(
    recipientPublicKeys.map(async ({ uid }) => {
      const wrappedKey = await encryptAesKeyForUser(keyBytes, uid);
      if (!wrappedKey) return;
      wrappedKeys[uid] = {
        wrappedKey,
        wrappedAt: now,
        wrappedBy: ownerUserId,
        alg: "RSA-OAEP",
      };
    }),
  );

  return {
    ...encrypted,
    wrappedKeys,
  } as RecipientEncryptedPayload;
};

export const decryptFromRecipientPayload = async (params: {
  userId: string;
  payload: {
    ciphertext: string;
    iv: string;
    wrappedKeys?: Record<string, WrappedKeyRecord>;
  };
}) => {
  const { userId, payload } = params;
  if (!hasCrypto()) return null;
  await ensureUserE2EEIdentity(userId);

  const wrapped = payload.wrappedKeys?.[userId]?.wrappedKey;
  if (!wrapped) return null;

  const keyBytes = await decryptAesKeyForCurrentUser(wrapped, userId);
  if (!keyBytes) return null;

  return decryptTextWithKey(
    { ciphertext: payload.ciphertext, iv: payload.iv },
    keyBytes,
  );
};
