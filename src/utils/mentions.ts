// Utility helpers for @mentions.

const MENTION_REGEX = /@([a-zA-Z0-9._]+)/g;

export const extractMentions = (text: string): string[] => {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  MENTION_REGEX.lastIndex = 0;
  while ((match = MENTION_REGEX.exec(text)) !== null) {
    if (!mentions.includes(match[1])) {
      mentions.push(match[1]);
    }
  }

  return mentions;
};
