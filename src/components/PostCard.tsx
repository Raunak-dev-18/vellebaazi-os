import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  getDatabase,
  ref,
  get,
  set,
  push,
  remove,
  update,
  runTransaction,
} from "firebase/database";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { MentionText } from "@/components/MentionText";
import { MentionInput } from "@/components/MentionInput";
import { getSafeAvatarUrl } from "@/utils/media";
import { sendMentionNotifications } from "@/utils/mentionNotifications";

interface PostCardProps {
  id: string;
  username: string;
  avatar: string;
  image: string;
  likes: number;
  caption: string;
  timeAgo: string;
  userId: string;
}

interface LikeEntry {
  userId: string;
  username: string;
  createdAt: number;
}

interface ReplyData {
  userId: string;
  username: string;
  userAvatar?: string;
  text: string;
  createdAt: number;
  replyTo?: string;
  likes?: Record<string, LikeEntry>;
}

interface CommentData {
  userId: string;
  username: string;
  userAvatar?: string;
  text: string;
  createdAt: number;
  likes?: Record<string, LikeEntry>;
  replies?: Record<string, ReplyData>;
}

interface ReplyView extends ReplyData {
  id: string;
  likesCount: number;
}

interface CommentView extends CommentData {
  id: string;
  likesCount: number;
  repliesCount: number;
  repliesList: ReplyView[];
}

interface LikedUser {
  uid: string;
  username: string;
  avatar: string;
  createdAt: number;
}

export function PostCard({
  id,
  username,
  avatar,
  image,
  likes: initialLikes,
  caption,
  timeAgo,
  userId,
}: PostCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [isLiked, setIsLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(initialLikes || 0);
  const [comment, setComment] = useState("");
  const [comments, setComments] = useState<CommentView[]>([]);
  const [showComments, setShowComments] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [likedUsers, setLikedUsers] = useState<LikedUser[]>([]);
  const [allLikedUsers, setAllLikedUsers] = useState<LikedUser[]>([]);
  const [loadingLikes, setLoadingLikes] = useState(false);
  const [isLikePending, setIsLikePending] = useState(false);
  const [likesDisplayed, setLikesDisplayed] = useState(10);
  const [hasMoreLikes, setHasMoreLikes] = useState(false);
  const [allCommentsData, setAllCommentsData] = useState<CommentView[]>([]);
  const [commentsDisplayed, setCommentsDisplayed] = useState(5);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{
    commentId: string;
    username: string;
  } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set(),
  );
  const [mediaError, setMediaError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const isVideoUrl = (url: string) => {
    const lower = url.toLowerCase();
    return lower.includes("video") || /\.(mp4|mov|webm)$/.test(lower);
  };

  const isBlockedMediaUrl = !image || image.includes("supabase.co/storage");

  const fetchLikedComments = useCallback(async () => {
    if (!user) return;
    try {
      const db = getDatabase();
      const commentsRef = ref(db, `comments/${id}`);
      const snapshot = await get(commentsRef);

      if (snapshot.exists()) {
        const liked = new Set<string>();
        const commentsData = snapshot.val() as Record<string, CommentData>;

        for (const [commentId, comment] of Object.entries(commentsData)) {
          if (comment.likes && comment.likes[user.uid]) {
            liked.add(commentId);
          }
          // Check replies too
          if (comment.replies) {
            for (const [replyId, reply] of Object.entries(comment.replies)) {
              if (reply.likes && reply.likes[user.uid]) {
                liked.add(replyId);
              }
            }
          }
        }
        setLikedComments(liked);
      }
    } catch (error) {
      console.error("Error fetching liked comments:", error);
    }
  }, [id, user]);

  const checkIfLiked = useCallback(async () => {
    if (!user) return;

    try {
      const db = getDatabase();
      const likesRef = ref(db, `likes/${id}/${user.uid}`);
      const snapshot = await get(likesRef);
      setIsLiked(snapshot.exists());
    } catch (error) {
      console.error("Error checking like:", error);
    }
  }, [id, user]);

  const fetchComments = useCallback(async () => {
    try {
      const db = getDatabase();
      const commentsRef = ref(db, `comments/${id}`);
      const snapshot = await get(commentsRef);

      if (snapshot.exists()) {
        const commentsData = Object.entries(
          snapshot.val() as Record<string, CommentData>,
        )
          .map(([commentId, comment]) => ({
            id: commentId,
            ...comment,
            likesCount: comment.likes ? Object.keys(comment.likes).length : 0,
            repliesCount: comment.replies
              ? Object.keys(comment.replies).length
              : 0,
            repliesList: comment.replies
              ? Object.entries(comment.replies)
                  .map(([replyId, reply]) => ({
                    id: replyId,
                    ...reply,
                    likesCount: reply.likes
                      ? Object.keys(reply.likes).length
                      : 0,
                  }))
                  .sort((a, b) => a.createdAt - b.createdAt)
              : [],
          }))
          .sort((a, b) => b.createdAt - a.createdAt);
        setAllCommentsData(commentsData);
        setHasMoreComments(commentsData.length > commentsDisplayed);
        setComments(commentsData.slice(0, commentsDisplayed));
      } else {
        setComments([]);
        setAllCommentsData([]);
        setHasMoreComments(false);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  }, [commentsDisplayed, id]);

  useEffect(() => {
    checkIfLiked();
    fetchComments();
    fetchLikedComments();
  }, [checkIfLiked, fetchComments, fetchLikedComments]);

  const loadMoreComments = () => {
    if (!hasMoreComments) return;
    const newCount = commentsDisplayed + 5;
    setCommentsDisplayed(newCount);
    setComments(allCommentsData.slice(0, newCount));
    setHasMoreComments(allCommentsData.length > newCount);
  };

  const handleLikeComment = async (
    commentId: string,
    isReply = false,
    parentCommentId?: string,
  ) => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to like comments",
        variant: "destructive",
      });
      return;
    }

    try {
      const db = getDatabase();
      const likePath =
        isReply && parentCommentId
          ? `comments/${id}/${parentCommentId}/replies/${commentId}/likes/${user.uid}`
          : `comments/${id}/${commentId}/likes/${user.uid}`;
      const likeRef = ref(db, likePath);

      const isLiked = likedComments.has(commentId);

      if (isLiked) {
        // Unlike
        await remove(likeRef);
        setLikedComments((prev) => {
          const newSet = new Set(prev);
          newSet.delete(commentId);
          return newSet;
        });
      } else {
        // Like
        await set(likeRef, {
          userId: user.uid,
          username: user.displayName || user.email?.split("@")[0] || "user",
          createdAt: Date.now(),
        });
        setLikedComments((prev) => new Set(prev).add(commentId));
      }

      // Refresh comments to update like counts
      fetchComments();
    } catch (error) {
      console.error("Error liking comment:", error);
      toast({
        title: "Error",
        description: "Failed to like comment",
        variant: "destructive",
      });
    }
  };

  const handleReplyToComment = (commentId: string, username: string) => {
    setReplyingTo({ commentId, username });
    setComment(`@${username} `);
    commentInputRef.current?.focus();
  };

  const toggleReplies = (commentId: string) => {
    setExpandedReplies((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return "now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
    return `${Math.floor(seconds / 604800)}w`;
  };

  const fetchLikedUsers = async () => {
    setLoadingLikes(true);
    try {
      const db = getDatabase();
      const likesRef = ref(db, `likes/${id}`);
      const snapshot = await get(likesRef);

      if (snapshot.exists()) {
        const likesData = snapshot.val() as Record<string, LikeEntry>;
        const usersArray = await Promise.all(
          Object.entries(likesData).map(async ([uid, likeData]) => {
            // Fetch user details
            const userRef = ref(db, `users/${uid}`);
            const userSnapshot = await get(userRef);
            const userData = userSnapshot.val() as {
              username?: string;
              photoURL?: string;
            } | null;

            return {
              uid,
              username: likeData.username || userData?.username || "user",
              avatar:
                userData?.photoURL ||
                `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
              createdAt: likeData.createdAt,
            };
          }),
        );

        // Sort by most recent first
        usersArray.sort((a, b) => b.createdAt - a.createdAt);
        setAllLikedUsers(usersArray);
        setHasMoreLikes(usersArray.length > likesDisplayed);
        setLikedUsers(usersArray.slice(0, likesDisplayed));
      } else {
        setLikedUsers([]);
        setAllLikedUsers([]);
        setHasMoreLikes(false);
      }
    } catch (error) {
      console.error("Error fetching liked users:", error);
      toast({
        title: "Error",
        description: "Failed to load likes",
        variant: "destructive",
      });
    } finally {
      setLoadingLikes(false);
    }
  };

  const loadMoreLikes = () => {
    if (!hasMoreLikes) return;
    const newCount = likesDisplayed + 10;
    setLikesDisplayed(newCount);
    setLikedUsers(allLikedUsers.slice(0, newCount));
    setHasMoreLikes(allLikedUsers.length > newCount);
  };

  const handleShowLikes = () => {
    if (likesCount > 0) {
      setShowLikesModal(true);
      fetchLikedUsers();
    }
  };

  const handleLike = async () => {
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please login to like posts",
        variant: "destructive",
      });
      return;
    }
    if (isLikePending) return;

    try {
      setIsLikePending(true);
      const db = getDatabase();
      const postRef = ref(db, `posts/${id}`);
      const likeRef = ref(db, `likes/${id}/${user.uid}`);

      const likeSnapshot = await get(likeRef);
      const alreadyLiked = likeSnapshot.exists();

      if (alreadyLiked) {
        // Unlike
        await remove(likeRef);
        const result = await runTransaction(postRef, (postData) => {
          const data = (postData || {}) as { likes?: number };
          const nextLikes = Math.max(0, (data.likes || 0) - 1);
          return { ...data, likes: nextLikes };
        });

        setIsLiked(false);
        const nextLikes =
          (result.snapshot?.val() as { likes?: number } | null)?.likes ??
          Math.max(0, likesCount - 1);
        setLikesCount(nextLikes);
      } else {
        // Like
        await set(likeRef, {
          userId: user.uid,
          username: user.displayName || user.email?.split("@")[0] || "user",
          createdAt: Date.now(),
        });

        const result = await runTransaction(postRef, (postData) => {
          const data = (postData || {}) as { likes?: number };
          const nextLikes = (data.likes || 0) + 1;
          return { ...data, likes: nextLikes };
        });

        setIsLiked(true);
        const nextLikes =
          (result.snapshot?.val() as { likes?: number } | null)?.likes ??
          likesCount + 1;
        setLikesCount(nextLikes);
      }
    } catch (error: unknown) {
      console.error("Error toggling like:", error);
      toast({
        title: "Error",
        description: "Failed to update like",
        variant: "destructive",
      });
    } finally {
      setIsLikePending(false);
    }
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !comment.trim()) return;

    setIsSubmitting(true);
    try {
      const db = getDatabase();
      const commentText = comment.trim();
      const actorUsername = user.displayName || user.email?.split("@")[0] || "user";
      const actorAvatar =
        user.photoURL ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`;

      if (replyingTo) {
        // This is a reply to a comment
        const repliesRef = ref(
          db,
          `comments/${id}/${replyingTo.commentId}/replies`,
        );
        const newReplyRef = push(repliesRef);

        const newReply = {
          userId: user.uid,
          username: actorUsername,
          userAvatar: actorAvatar,
          text: commentText,
          createdAt: Date.now(),
          replyTo: replyingTo.username,
        };

        await set(newReplyRef, newReply);

        if (newReplyRef.key) {
          await sendMentionNotifications({
            actorUserId: user.uid,
            actorUsername,
            actorAvatar,
            text: commentText,
            sourceType: "comment",
            sourceId: newReplyRef.key,
            postId: id,
          });
        }

        // Expand replies for this comment
        setExpandedReplies((prev) => new Set(prev).add(replyingTo.commentId));
        setReplyingTo(null);
      } else {
        // This is a new comment
        const commentsRef = ref(db, `comments/${id}`);
        const newCommentRef = push(commentsRef);

        const newComment = {
          userId: user.uid,
          username: actorUsername,
          userAvatar: actorAvatar,
          text: commentText,
          createdAt: Date.now(),
        };

        await set(newCommentRef, newComment);

        if (newCommentRef.key) {
          await sendMentionNotifications({
            actorUserId: user.uid,
            actorUsername,
            actorAvatar,
            text: commentText,
            sourceType: "comment",
            sourceId: newCommentRef.key,
            postId: id,
          });
        }

        const postRef = ref(db, `posts/${id}`);
        const postSnapshot = await get(postRef);
        const currentComments = postSnapshot.val()?.comments || 0;

        await update(postRef, {
          comments: currentComments + 1,
        });
      }

      setComment("");
      fetchComments();
    } catch (error: unknown) {
      console.error("Error posting comment:", error);
      toast({
        title: "Error",
        description: "Failed to post comment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border border-border rounded-lg bg-card mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <Avatar className="h-10 w-10">
          <AvatarImage
            src={getSafeAvatarUrl(avatar, username)}
            alt={username}
          />
          <AvatarFallback>{username[0].toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1">
          <p className="font-semibold text-sm">{username}</p>
        </div>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <span className="text-xl">•••</span>
        </Button>
      </div>

      {/* Image/Video */}
      <div className="w-full bg-muted relative flex items-center justify-center overflow-hidden max-h-[75vh]">
        {image && !mediaError && !isBlockedMediaUrl ? (
          isVideoUrl(image) ? (
            <div
              className="relative w-full h-full flex items-center justify-center"
              onClick={() => {
                if (videoRef.current) {
                  if (videoRef.current.paused) {
                    videoRef.current.play();
                  } else {
                    videoRef.current.pause();
                  }
                }
              }}
              onDoubleClick={() => handleLike()}
            >
              <video
                ref={videoRef}
                src={image}
                loop
                muted={isMuted}
                playsInline
                className="w-full h-auto max-h-[75vh] object-contain cursor-pointer"
                onError={() => setMediaError(true)}
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsMuted(!isMuted);
                }}
                className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors flex items-center justify-center"
              >
                {isMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : (
            <div
              className="relative w-full h-full flex items-center justify-center"
              onDoubleClick={() => handleLike()}
            >
              <img
                src={image}
                alt="Post"
                className="w-full h-auto max-h-[75vh] object-contain cursor-pointer"
                onError={() => setMediaError(true)}
              />
            </div>
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <p>Media unavailable</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4">
        <div className="flex items-center gap-4 mb-3">
          <Button
            variant="ghost"
            size="icon"
            className={`h-8 w-8 ${isLiked ? "text-red-500" : "hover:text-red-500"}`}
            onClick={handleLike}
          >
            <Heart className={`h-6 w-6 ${isLiked ? "fill-current" : ""}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => setShowComments(!showComments)}
          >
            <MessageCircle className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Send className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto">
            <Bookmark className="h-6 w-6" />
          </Button>
        </div>

        {/* Likes */}
        <p
          className={`font-semibold text-sm mb-2 ${likesCount > 0 ? "cursor-pointer hover:text-muted-foreground" : ""}`}
          onClick={handleShowLikes}
        >
          {likesCount.toLocaleString()} {likesCount === 1 ? "like" : "likes"}
        </p>

        {/* Caption */}
        <p className="text-sm">
          <span className="font-semibold mr-2">{username}</span>
          <MentionText text={caption} />
        </p>

        {/* View Comments */}
        {comments.length > 0 && !showComments && (
          <button
            className="text-sm text-muted-foreground mt-2 hover:text-foreground"
            onClick={() => setShowComments(true)}
          >
            View all {comments.length} comments
          </button>
        )}

        {/* Comments Section */}
        {showComments && (
          <div className="mt-3 space-y-3 max-h-80 overflow-y-auto">
            {comments.map((commentItem) => (
              <div key={commentItem.id} className="space-y-2">
                {/* Main Comment */}
                <div className="flex gap-2">
                  <Avatar className="h-8 w-8 flex-shrink-0">
                    <AvatarImage
                      src={commentItem.userAvatar}
                      alt={commentItem.username}
                    />
                    <AvatarFallback>
                      {commentItem.username[0].toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold mr-2">
                        {commentItem.username}
                      </span>
                      <MentionText text={commentItem.text} />
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {formatTimeAgo(commentItem.createdAt)}
                      </span>
                      {commentItem.likesCount > 0 && (
                        <span className="text-xs text-muted-foreground font-medium">
                          {commentItem.likesCount}{" "}
                          {commentItem.likesCount === 1 ? "like" : "likes"}
                        </span>
                      )}
                      <button
                        onClick={() =>
                          handleReplyToComment(
                            commentItem.id,
                            commentItem.username,
                          )
                        }
                        className="text-xs text-muted-foreground font-medium hover:text-foreground"
                      >
                        Reply
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => handleLikeComment(commentItem.id)}
                    className="flex-shrink-0 p-1"
                  >
                    <Heart
                      className={`h-3 w-3 ${likedComments.has(commentItem.id) ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-foreground"}`}
                    />
                  </button>
                </div>

                {/* Replies */}
                {commentItem.repliesCount > 0 && (
                  <div className="ml-10">
                    {!expandedReplies.has(commentItem.id) ? (
                      <button
                        onClick={() => toggleReplies(commentItem.id)}
                        className="text-xs text-muted-foreground font-medium hover:text-foreground flex items-center gap-1"
                      >
                        <span className="w-6 h-[1px] bg-muted-foreground/50" />
                        View {commentItem.repliesCount}{" "}
                        {commentItem.repliesCount === 1 ? "reply" : "replies"}
                      </button>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={() => toggleReplies(commentItem.id)}
                          className="text-xs text-muted-foreground font-medium hover:text-foreground flex items-center gap-1"
                        >
                          <span className="w-6 h-[1px] bg-muted-foreground/50" />
                          Hide replies
                        </button>
                        {commentItem.repliesList.map((reply) => (
                          <div key={reply.id} className="flex gap-2">
                            <Avatar className="h-6 w-6 flex-shrink-0">
                              <AvatarImage
                                src={reply.userAvatar}
                                alt={reply.username}
                              />
                              <AvatarFallback>
                                {reply.username[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm">
                                <span className="font-semibold mr-2">
                                  {reply.username}
                                </span>
                                <MentionText text={reply.text} />
                              </p>
                              <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-muted-foreground">
                                  {formatTimeAgo(reply.createdAt)}
                                </span>
                                {reply.likesCount > 0 && (
                                  <span className="text-xs text-muted-foreground font-medium">
                                    {reply.likesCount}{" "}
                                    {reply.likesCount === 1 ? "like" : "likes"}
                                  </span>
                                )}
                                <button
                                  onClick={() =>
                                    handleReplyToComment(
                                      commentItem.id,
                                      reply.username,
                                    )
                                  }
                                  className="text-xs text-muted-foreground font-medium hover:text-foreground"
                                >
                                  Reply
                                </button>
                              </div>
                            </div>
                            <button
                              onClick={() =>
                                handleLikeComment(
                                  reply.id,
                                  true,
                                  commentItem.id,
                                )
                              }
                              className="flex-shrink-0 p-1"
                            >
                              <Heart
                                className={`h-3 w-3 ${likedComments.has(reply.id) ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-foreground"}`}
                              />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {hasMoreComments && (
              <button
                onClick={loadMoreComments}
                className="text-sm text-blue-500 hover:text-blue-600 font-medium"
              >
                Load more comments
              </button>
            )}
          </div>
        )}

        {/* Time */}
        <p className="text-xs text-muted-foreground mt-2">{timeAgo}</p>

        {/* Add Comment */}
        <div className="mt-3 pt-3 border-t border-border">
          {replyingTo && (
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-xs text-muted-foreground">
                Replying to{" "}
                <span className="font-medium">@{replyingTo.username}</span>
              </span>
              <button
                onClick={() => {
                  setReplyingTo(null);
                  setComment("");
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <form onSubmit={handleComment} className="flex items-center gap-2">
            <MentionInput
              ref={commentInputRef}
              placeholder={
                replyingTo
                  ? `Reply to @${replyingTo.username}...`
                  : "Add a comment..."
              }
              value={comment}
              onChange={(val) => setComment(val)}
              className="flex-1 border-0 focus-visible:ring-0 px-0"
              disabled={isSubmitting}
            />
            <Button
              type="submit"
              variant="ghost"
              size="sm"
              disabled={!comment.trim() || isSubmitting}
              className="text-blue-500 hover:text-blue-600 font-semibold"
            >
              {isSubmitting ? "Posting..." : "Post"}
            </Button>
          </form>
        </div>
      </div>

      {/* Likes Modal */}
      {showLikesModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowLikesModal(false)}
        >
          <div
            className="bg-background rounded-2xl w-full max-w-sm max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <h2 className="text-lg font-semibold">Likes</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowLikesModal(false)}
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto p-4">
              {loadingLikes ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-8 w-8 border-4 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
                </div>
              ) : likedUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Heart className="h-12 w-12 mx-auto mb-2 opacity-20" />
                  <p>No likes yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {likedUsers.map((likedUser) => (
                    <div
                      key={likedUser.uid}
                      className="flex items-center gap-3 cursor-pointer hover:bg-secondary p-2 rounded-lg transition-colors"
                      onClick={() => {
                        setShowLikesModal(false);
                        navigate(`/users/profile/${likedUser.username}`);
                      }}
                    >
                      <Avatar className="h-12 w-12">
                        <AvatarImage
                          src={likedUser.avatar}
                          alt={likedUser.username}
                        />
                        <AvatarFallback>
                          {likedUser.username[0].toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-semibold text-sm">
                          {likedUser.username}
                        </p>
                      </div>
                    </div>
                  ))}
                  {hasMoreLikes && (
                    <button
                      onClick={loadMoreLikes}
                      className="w-full py-2 text-sm text-blue-500 hover:text-blue-600 font-medium"
                    >
                      Load more
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
