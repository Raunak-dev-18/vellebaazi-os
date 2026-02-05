import { useNavigate } from "react-router-dom";

interface MentionTextProps {
  text: string;
  className?: string;
}

// Regex to match @username mentions (alphanumeric, underscores, dots)
const MENTION_REGEX = /@([a-zA-Z0-9._]+)/g;

export function MentionText({ text, className = "" }: MentionTextProps) {
  const navigate = useNavigate();

  const handleMentionClick = (username: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/users/profile/${username}`);
  };

  // Parse text and replace mentions with clickable spans
  const renderTextWithMentions = () => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    // Reset regex lastIndex
    MENTION_REGEX.lastIndex = 0;

    while ((match = MENTION_REGEX.exec(text)) !== null) {
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(text.slice(lastIndex, match.index));
      }

      // Add the clickable mention
      const username = match[1];
      parts.push(
        <span
          key={`${match.index}-${username}`}
          className="text-blue-500 hover:text-blue-600 cursor-pointer font-medium"
          onClick={(e) => handleMentionClick(username, e)}
        >
          @{username}
        </span>,
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last mention
    if (lastIndex < text.length) {
      parts.push(text.slice(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  return <span className={className}>{renderTextWithMentions()}</span>;
}
