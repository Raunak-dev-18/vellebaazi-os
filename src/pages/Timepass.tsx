import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  Volume2,
  VolumeX,
  Music,
  MoreHorizontal,
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
  update,
  push,
  set,
  remove,
  runTransaction,
} from "firebase/database";
import { useNavigate } from "react-router-dom";
import { MentionText } from "@/components/MentionText";
import { MentionInput } from "@/components/MentionInput";
import { getSafeAvatarUrl } from "@/utils/media";

interface Post {
  id: string;
  userId: string;
  username: string;
  userAvatar: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  postType: "image" | "reel";
  caption: string;
  music?: string;
  likes: number;
  comments: number;
  views: number;
  commentsEnabled: boolean;
  taggedUsers?: string[];
  createdAt: number;
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

export default function Timepass() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [posts, setPosts] = useState<Post[]>([]);
  const [allPostsData, setAllPostsData] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayedCount, setDisplayedCount] = useState(5);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [likePending, setLikePending] = useState<Set<string>>(new Set());
  const [mutedVideos, setMutedVideos] = useState<Set<string>>(new Set());
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement | null }>({});
  const [isCommentModalOpen, setIsCommentModalOpen] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [commentsDisplayed, setCommentsDisplayed] = useState(10);
  const [hasMoreComments, setHasMoreComments] = useState(false);
  const [allCommentsData, setAllCommentsData] = useState<CommentView[]>([]);
  const [newComment, setNewComment] = useState("");
  const [likedComments, setLikedComments] = useState<Set<string>>(new Set());
  const [replyingTo, setReplyingTo] = useState<{
    commentId: string;
    username: string;
  } | null>(null);
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(
    new Set(),
  );
  const commentInputRef = useRef<HTMLInputElement>(null);

  const fetchPosts = useCallback(async () => {
    try {
      const db = getDatabase();
      const postsRef = ref(db, "posts");
      const snapshot = await get(postsRef);

      if (snapshot.exists()) {
        const allPosts = snapshot.val() as Record<string, Omit<Post, "id">>;
        const isMediaUrlValid = (post: Post) => {
          const mediaUrl = (post.mediaUrl || "").toString().trim();
          if (!mediaUrl) return false;
          if (mediaUrl.includes("supabase.co/storage")) return false;
          return true;
        };

        const postsArray = Object.entries(allPosts)
          .map(([id, post]) => ({
            id,
            ...post,
          }))
          .filter((post) => {
            if (!isMediaUrlValid(post)) return false;
            if (post.mediaType === "video" || post.postType === "reel")
              return true;
            const mediaUrl = (post.mediaUrl || "").toLowerCase();
            return /\.(mp4|mov|webm)$/.test(mediaUrl);
          })
          .sort((a, b) => b.createdAt - a.createdAt);

        setAllPostsData(postsArray);
        setHasMorePosts(postsArray.length > displayedCount);
        setPosts(postsArray.slice(0, displayedCount));
      }
    } catch (error) {
      console.error("Error fetching posts:", error);
    } finally {
      setLoading(false);
    }
  }, [displayedCount]);

  const checkLikedPosts = useCallback(async () => {
    if (!user) return;

    try {
      const db = getDatabase();
      const liked = new Set<string>();

      for (const post of posts) {
        const likeRef = ref(db, `likes/${post.id}/${user.uid}`);
        const snapshot = await get(likeRef);
        if (snapshot.exists()) {
          liked.add(post.id);
        }
      }

      setLikedPosts(liked);
    } catch (error) {
      console.error("Error checking likes:", error);
    }
  }, [posts, user]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  useEffect(() => {
    checkLikedPosts();
  }, [checkLikedPosts]);

  // Update displayed posts when count changes
  useEffect(() => {
    if (allPostsData.length === 0) return;
    setHasMorePosts(allPostsData.length > displayedCount);
    setPosts(allPostsData.slice(0, displayedCount));
  }, [displayedCount, allPostsData]);

  const loadMorePosts = () => {
    if (isLoadingMore || !hasMorePosts) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayedCount((prev) => prev + 5);
      setIsLoadingMore(false);
    }, 200);
  };

  const handleLike = async (postId: string) => {
    if (!user) return;
    if (likePending.has(postId)) return;

    try {
      setLikePending((prev) => new Set(prev).add(postId));
      const db = getDatabase();
      const likeRef = ref(db, `likes/${postId}/${user.uid}`);
      const postRef = ref(db, `posts/${postId}`);
      const likeSnapshot = await get(likeRef);
      const isLiked = likeSnapshot.exists();

      if (isLiked) {
        // Unlike
        await remove(likeRef);
        const result = await runTransaction(postRef, (postData) => {
          const data = (postData || {}) as { likes?: number };
          const nextLikes = Math.max(0, (data.likes || 0) - 1);
          return { ...data, likes: nextLikes };
        });
        const nextLikes =
          (result.snapshot?.val() as { likes?: number } | null)?.likes ??
          Math.max(0, (posts.find((p) => p.id === postId)?.likes || 0) - 1);
        setLikedPosts((prev) => {
          const newSet = new Set(prev);
          newSet.delete(postId);
          return newSet;
        });
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId ? { ...post, likes: nextLikes } : post,
          ),
        );
      } else {
        // Like
        await set(likeRef, {
          userId: user.uid,
          username: user.displayName || "user",
          createdAt: Date.now(),
        });
        const result = await runTransaction(postRef, (postData) => {
          const data = (postData || {}) as { likes?: number };
          const nextLikes = (data.likes || 0) + 1;
          return { ...data, likes: nextLikes };
        });
        const nextLikes =
          (result.snapshot?.val() as { likes?: number } | null)?.likes ??
          (posts.find((p) => p.id === postId)?.likes || 0) + 1;
        setLikedPosts((prev) => new Set(prev).add(postId));
        setPosts((prev) =>
          prev.map((post) =>
            post.id === postId ? { ...post, likes: nextLikes } : post,
          ),
        );
      }
    } catch (error) {
      console.error("Error toggling like:", error);
    } finally {
      setLikePending((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  const handleVideoClick = (postId: string) => {
    const video = videoRefs.current[postId];
    if (!video) return;

    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const handleVideoDoubleClick = (postId: string) => {
    handleLike(postId);

    // Show heart animation
    const video = videoRefs.current[postId];
    if (video) {
      const heart = document.createElement("div");
      heart.innerHTML = "❤️";
      heart.style.position = "absolute";
      heart.style.fontSize = "100px";
      heart.style.top = "50%";
      heart.style.left = "50%";
      heart.style.transform = "translate(-50%, -50%)";
      heart.style.pointerEvents = "none";
      heart.style.animation = "heartPop 0.8s ease-out";
      heart.style.zIndex = "50";

      video.parentElement?.appendChild(heart);
      setTimeout(() => heart.remove(), 800);
    }
  };

  const toggleMute = (postId: string) => {
    const video = videoRefs.current[postId];
    if (!video) return;

    video.muted = !video.muted;

    if (video.muted) {
      setMutedVideos((prev) => new Set(prev).add(postId));
    } else {
      setMutedVideos((prev) => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  };
  const formatCount = (count: number) => {
    if (count >= 1000) {
      return (count / 1000).toFixed(1) + "K";
    }
    return count.toString();
  };

  const openCommentModal = async (postId: string) => {
    setSelectedPostId(postId);
    setIsCommentModalOpen(true);
    setCommentsDisplayed(10);
    await fetchComments(postId);
  };

  const closeCommentModal = () => {
    setIsCommentModalOpen(false);
    setSelectedPostId(null);
    setComments([]);
    setAllCommentsData([]);
    setCommentsDisplayed(10);
    setHasMoreComments(false);
    setNewComment("");
    setReplyingTo(null);
    setExpandedReplies(new Set());
    setLikedComments(new Set());
  };

  const fetchComments = async (postId: string) => {
    try {
      const db = getDatabase();
      const commentsRef = ref(db, `comments/${postId}`);
      const snapshot = await get(commentsRef);

      if (snapshot.exists()) {
        const commentsData = snapshot.val() as Record<string, CommentData>;
        const commentsArray = Object.entries(commentsData)
          .map(([id, comment]) => ({
            id,
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

        setAllCommentsData(commentsArray);
        setHasMoreComments(commentsArray.length > commentsDisplayed);
        setComments(commentsArray.slice(0, commentsDisplayed));

        // Fetch liked comments
        if (user) {
          const liked = new Set<string>();
          for (const comment of commentsArray) {
            if (comment.likes && comment.likes[user.uid]) {
              liked.add(comment.id);
            }
            for (const reply of comment.repliesList) {
              if (reply.likes && reply.likes[user.uid]) {
                liked.add(reply.id);
              }
            }
          }
          setLikedComments(liked);
        }
      } else {
        setComments([]);
        setAllCommentsData([]);
        setHasMoreComments(false);
      }
    } catch (error) {
      console.error("Error fetching comments:", error);
    }
  };

  const loadMoreComments = () => {
    if (!hasMoreComments) return;
    const newCount = commentsDisplayed + 10;
    setCommentsDisplayed(newCount);
    setComments(allCommentsData.slice(0, newCount));
    setHasMoreComments(allCommentsData.length > newCount);
  };

  const handleLikeComment = async (
    commentId: string,
    isReply = false,
    parentCommentId?: string,
  ) => {
    if (!user || !selectedPostId) return;

    try {
      const db = getDatabase();
      const likePath =
        isReply && parentCommentId
          ? `comments/${selectedPostId}/${parentCommentId}/replies/${commentId}/likes/${user.uid}`
          : `comments/${selectedPostId}/${commentId}/likes/${user.uid}`;
      const likeRef = ref(db, likePath);

      const isLiked = likedComments.has(commentId);

      if (isLiked) {
        await set(likeRef, null);
        setLikedComments((prev) => {
          const newSet = new Set(prev);
          newSet.delete(commentId);
          return newSet;
        });
      } else {
        await set(likeRef, {
          userId: user.uid,
          username: user.displayName || user.email?.split("@")[0] || "user",
          createdAt: Date.now(),
        });
        setLikedComments((prev) => new Set(prev).add(commentId));
      }

      await fetchComments(selectedPostId);
    } catch (error) {
      console.error("Error liking comment:", error);
    }
  };

  const handleReplyToComment = (commentId: string, username: string) => {
    setReplyingTo({ commentId, username });
    setNewComment(`@${username} `);
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

  const handleAddComment = async () => {
    if (!user || !selectedPostId || !newComment.trim()) return;

    try {
      const db = getDatabase();
      const commentText = newComment.trim();

      if (replyingTo) {
        // This is a reply
        const repliesRef = ref(
          db,
          `comments/${selectedPostId}/${replyingTo.commentId}/replies`,
        );
        const newReplyRef = push(repliesRef);

        await set(newReplyRef, {
          userId: user.uid,
          username: user.displayName || user.email?.split("@")[0] || "user",
          userAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          text: commentText,
          createdAt: Date.now(),
          replyTo: replyingTo.username,
        });

        setExpandedReplies((prev) => new Set(prev).add(replyingTo.commentId));
        setReplyingTo(null);
      } else {
        // This is a new comment
        const commentsRef = ref(db, `comments/${selectedPostId}`);
        const newCommentRef = push(commentsRef);

        await set(newCommentRef, {
          userId: user.uid,
          username: user.displayName || user.email?.split("@")[0] || "user",
          userAvatar:
            user.photoURL ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
          text: commentText,
          createdAt: Date.now(),
        });

        // Update comment count
        const post = posts.find((p) => p.id === selectedPostId);
        if (post) {
          const postRef = ref(db, `posts/${selectedPostId}`);
          await update(postRef, { comments: post.comments + 1 });
        }
        await fetchPosts();
      }

      setNewComment("");
      await fetchComments(selectedPostId);
    } catch (error) {
      console.error("Error adding comment:", error);
    }
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);

    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return `${Math.floor(seconds / 604800)}w ago`;
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 border-2 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading posts...</p>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-lg font-semibold">No posts yet</p>
        <p className="text-muted-foreground">Be the first to create a reel!</p>
        <Button onClick={() => navigate("/create")}>Create Post</Button>
      </div>
    );
  }

  return (
    <>
      <div className="h-screen overflow-y-scroll snap-y snap-mandatory bg-background scrollbar-hide">
        <style>{`
          .scrollbar-hide::-webkit-scrollbar {
            display: none;
          }
          .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
          }
          @keyframes heartPop {
            0% {
              transform: translate(-50%, -50%) scale(0);
              opacity: 1;
            }
            50% {
              transform: translate(-50%, -50%) scale(1.2);
              opacity: 1;
            }
            100% {
              transform: translate(-50%, -50%) scale(1.5);
              opacity: 0;
            }
          }
        `}</style>

        {posts.map((post) => (
          <div
            key={post.id}
            className="h-screen snap-start flex items-center justify-center"
          >
            <div className="w-full h-full flex items-center justify-center gap-6 px-4 relative">
              {/* Media Card */}
              <div
                className={`${post.mediaType === "video" ? "w-[400px] h-[calc(100vh-8rem)]" : "w-[400px] h-[400px]"} bg-card rounded-2xl overflow-hidden shadow-xl border border-border relative flex-shrink-0`}
              >
                {post.mediaType === "video" ? (
                  <div
                    className="relative w-full h-full"
                    onClick={() => handleVideoClick(post.id)}
                    onDoubleClick={() => handleVideoDoubleClick(post.id)}
                  >
                    <video
                      ref={(el) => {
                        videoRefs.current[post.id] = el;
                      }}
                      src={post.mediaUrl}
                      className="w-full h-full object-cover cursor-pointer"
                      loop
                      autoPlay
                      muted
                      playsInline
                    />

                    {/* Mute/Unmute button - top right */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMute(post.id);
                      }}
                      className="absolute top-4 right-4 h-10 w-10 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors flex items-center justify-center z-10"
                    >
                      {mutedVideos.has(post.id) ||
                      !videoRefs.current[post.id]?.muted === false ? (
                        <VolumeX className="h-5 w-5" />
                      ) : (
                        <Volume2 className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                ) : (
                  <div
                    className="relative w-full h-full flex items-center justify-center bg-black"
                    onDoubleClick={() => handleVideoDoubleClick(post.id)}
                  >
                    <img
                      src={post.mediaUrl}
                      alt={post.caption}
                      className="w-full h-full object-contain cursor-pointer"
                    />
                  </div>
                )}

                {/* Bottom Info */}
                <div className="absolute bottom-4 left-4 right-4 text-white space-y-2">
                  <div
                    className="flex items-center gap-2 mb-2 cursor-pointer"
                    onClick={() => navigate(`/users/profile/${post.username}`)}
                  >
                    <Avatar className="h-8 w-8 border border-white">
                      <AvatarImage
                        src={getSafeAvatarUrl(post.userAvatar, post.username)}
                        alt={post.username}
                      />
                      <AvatarFallback>
                        {post.username[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-semibold text-sm drop-shadow-lg">
                      {post.username}
                    </span>
                    {post.userId !== user?.uid && (
                      <>
                        <span className="text-sm drop-shadow-lg">•</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-auto p-0 text-white font-semibold hover:bg-transparent hover:text-white text-sm"
                        >
                          Follow
                        </Button>
                      </>
                    )}
                  </div>

                  {/* Audio/Music info */}
                  {post.music && (
                    <div className="flex items-center gap-2 text-xs">
                      <Music className="h-3 w-3" />
                      <span className="drop-shadow-lg">{post.music}</span>
                    </div>
                  )}

                  {/* Tagged users */}
                  {post.taggedUsers && post.taggedUsers.length > 0 && (
                    <div className="flex items-center gap-1 text-xs mt-1">
                      <span className="drop-shadow-lg">with</span>
                      {post.taggedUsers.slice(0, 2).map((tag, i) => (
                        <span key={i} className="drop-shadow-lg">
                          @{tag}
                        </span>
                      ))}
                      {post.taggedUsers.length > 2 && (
                        <span className="drop-shadow-lg">
                          +{post.taggedUsers.length - 2} more
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons - Outside Media */}
              <div className="flex flex-col gap-8 items-center justify-end h-[calc(100vh-8rem)] flex-shrink-0 pb-4">
                <div className="flex flex-col items-center gap-1">
                  <button
                    className="p-0 hover:scale-110 transition-transform"
                    onClick={() => handleLike(post.id)}
                  >
                    <Heart
                      className={`h-7 w-7 stroke-[2.5] ${likedPosts.has(post.id) ? "fill-red-500 text-red-500" : ""}`}
                      strokeWidth={2.5}
                    />
                  </button>
                  <span className="text-xs font-semibold">
                    {formatCount(post.likes)}
                  </span>
                </div>

                {post.commentsEnabled && (
                  <div className="flex flex-col items-center gap-1">
                    <button
                      className="p-0 hover:scale-110 transition-transform"
                      onClick={() => openCommentModal(post.id)}
                    >
                      <MessageCircle
                        className="h-7 w-7 stroke-[2.5]"
                        strokeWidth={2.5}
                      />
                    </button>
                    <span className="text-xs font-semibold">
                      {formatCount(post.comments)}
                    </span>
                  </div>
                )}

                <button className="p-0 hover:scale-110 transition-transform">
                  <Send className="h-7 w-7 stroke-[2.5]" strokeWidth={2.5} />
                </button>

                <button className="p-0 hover:scale-110 transition-transform">
                  <Bookmark
                    className="h-7 w-7 stroke-[2.5]"
                    strokeWidth={2.5}
                  />
                </button>

                <button className="p-0 hover:scale-110 transition-transform">
                  <MoreHorizontal
                    className="h-7 w-7 stroke-[2.5]"
                    strokeWidth={2.5}
                  />
                </button>
              </div>

              {/* Comment Panel - Right Side */}
              {isCommentModalOpen && selectedPostId === post.id && (
                <div className="w-[400px] h-[calc(100vh-8rem)] bg-background rounded-2xl shadow-xl border border-border flex flex-col flex-shrink-0">
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-border">
                    <h2 className="text-lg font-semibold">Comments</h2>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={closeCommentModal}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  {/* Comments List */}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {comments.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <MessageCircle className="h-12 w-12 mx-auto mb-2 opacity-20" />
                        <p>No comments yet</p>
                        <p className="text-sm mt-1">Be the first to comment!</p>
                      </div>
                    ) : (
                      <>
                        {comments.map((comment) => (
                          <div key={comment.id} className="space-y-2">
                            {/* Main Comment */}
                            <div className="flex gap-3">
                              <Avatar
                                className="h-8 w-8 cursor-pointer flex-shrink-0"
                                onClick={() => {
                                  closeCommentModal();
                                  navigate(
                                    `/users/profile/${comment.username}`,
                                  );
                                }}
                              >
                                <AvatarImage
                                  src={getSafeAvatarUrl(
                                    comment.userAvatar,
                                    comment.username,
                                  )}
                                  alt={comment.username}
                                />
                                <AvatarFallback>
                                  {comment.username[0].toUpperCase()}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="font-semibold text-sm cursor-pointer hover:text-muted-foreground"
                                    onClick={() => {
                                      closeCommentModal();
                                      navigate(
                                        `/users/profile/${comment.username}`,
                                      );
                                    }}
                                  >
                                    {comment.username}
                                  </span>
                                </div>
                                <p className="text-sm mt-1">
                                  <MentionText text={comment.text} />
                                </p>
                                <div className="flex items-center gap-3 mt-2">
                                  <span className="text-xs text-muted-foreground">
                                    {formatTimeAgo(comment.createdAt)}
                                  </span>
                                  {comment.likesCount > 0 && (
                                    <span className="text-xs text-muted-foreground font-medium">
                                      {comment.likesCount}{" "}
                                      {comment.likesCount === 1
                                        ? "like"
                                        : "likes"}
                                    </span>
                                  )}
                                  <button
                                    onClick={() =>
                                      handleReplyToComment(
                                        comment.id,
                                        comment.username,
                                      )
                                    }
                                    className="text-xs text-muted-foreground font-medium hover:text-foreground"
                                  >
                                    Reply
                                  </button>
                                </div>
                              </div>
                              <button
                                onClick={() => handleLikeComment(comment.id)}
                                className="flex-shrink-0 p-1"
                              >
                                <Heart
                                  className={`h-4 w-4 ${likedComments.has(comment.id) ? "fill-red-500 text-red-500" : "text-muted-foreground hover:text-foreground"}`}
                                />
                              </button>
                            </div>

                            {/* Replies */}
                            {comment.repliesCount > 0 && (
                              <div className="ml-11">
                                {!expandedReplies.has(comment.id) ? (
                                  <button
                                    onClick={() => toggleReplies(comment.id)}
                                    className="text-xs text-muted-foreground font-medium hover:text-foreground flex items-center gap-2"
                                  >
                                    <span className="w-6 h-[1px] bg-muted-foreground/50" />
                                    View {comment.repliesCount}{" "}
                                    {comment.repliesCount === 1
                                      ? "reply"
                                      : "replies"}
                                  </button>
                                ) : (
                                  <div className="space-y-3">
                                    <button
                                      onClick={() => toggleReplies(comment.id)}
                                      className="text-xs text-muted-foreground font-medium hover:text-foreground flex items-center gap-2"
                                    >
                                      <span className="w-6 h-[1px] bg-muted-foreground/50" />
                                      Hide replies
                                    </button>
                                    {comment.repliesList.map((reply) => (
                                      <div
                                        key={reply.id}
                                        className="flex gap-2"
                                      >
                                        <Avatar
                                          className="h-6 w-6 cursor-pointer flex-shrink-0"
                                          onClick={() => {
                                            closeCommentModal();
                                            navigate(
                                              `/users/profile/${reply.username}`,
                                            );
                                          }}
                                        >
                                          <AvatarImage
                                            src={getSafeAvatarUrl(
                                              reply.userAvatar,
                                              reply.username,
                                            )}
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
                                                {reply.likesCount === 1
                                                  ? "like"
                                                  : "likes"}
                                              </span>
                                            )}
                                            <button
                                              onClick={() =>
                                                handleReplyToComment(
                                                  comment.id,
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
                                              comment.id,
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
                      </>
                    )}
                  </div>

                  {/* Add Comment */}
                  <div className="border-t border-border p-4">
                    {replyingTo && (
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-muted-foreground">
                          Replying to{" "}
                          <span className="font-medium">
                            @{replyingTo.username}
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            setReplyingTo(null);
                            setNewComment("");
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={getSafeAvatarUrl(
                            user?.photoURL,
                            user?.uid || "user",
                          )}
                          alt="You"
                        />
                        <AvatarFallback>
                          {user?.displayName?.[0] || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <MentionInput
                        ref={commentInputRef}
                        placeholder={
                          replyingTo
                            ? `Reply to @${replyingTo.username}...`
                            : "Add a comment..."
                        }
                        value={newComment}
                        onChange={(val) => setNewComment(val)}
                        onKeyPress={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleAddComment();
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        onClick={handleAddComment}
                        disabled={!newComment.trim()}
                        size="sm"
                      >
                        Post
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
