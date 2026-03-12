import { Stories } from "@/components/Stories";
import { useParams } from "react-router-dom";

export default function StoryViewer() {
  const { user_id, story_id } = useParams();

  if (!user_id || !story_id) {
    return null;
  }

  return (
    <Stories
      viewerOnly
      initialStoryUserId={user_id}
      initialStoryId={story_id}
    />
  );
}
