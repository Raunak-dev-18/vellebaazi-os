import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { getDatabase, ref, get, set, push, remove, update } from "firebase/database";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { getBlockStatus } from "@/utils/blocking";

interface Notification {
  id: string;
  type: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  timestamp: string;
  read: boolean;
  status?: string;
  message?: string;
  sourceType?: "post" | "comment" | "story" | "group_message";
  sourceId?: string;
  groupId?: string;
  postId?: string;
  storyId?: string;
}

interface NotificationRecord {
  type: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  timestamp: string;
  read: boolean;
  status?: string;
  message?: string;
  sourceType?: "post" | "comment" | "story" | "group_message";
  sourceId?: string;
  groupId?: string;
  postId?: string;
  storyId?: string;
}

export default function Notifications() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong";
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [allNotificationsData, setAllNotificationsData] = useState<
    Notification[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const [displayedCount, setDisplayedCount] = useState(10);
  const [hasMoreNotifications, setHasMoreNotifications] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [followBackLoading, setFollowBackLoading] = useState<Set<string>>(
    new Set(),
  );
  const mentionNotifications = notifications.filter(
    (notification) => notification.type === "mention",
  );

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user) return;

      try {
        const db = getDatabase();

        // Fetch following list
        const followingRef = ref(db, `following/${user.uid}`);
        const followingSnapshot = await get(followingRef);
        const followingSet = new Set<string>();

        if (followingSnapshot.exists()) {
          const followingData = followingSnapshot.val();
          Object.keys(followingData).forEach((uid) => followingSet.add(uid));
        }
        setFollowingUsers(followingSet);

        // Fetch notifications
        const notificationsRef = ref(db, `notifications/${user.uid}`);
        const snapshot = await get(notificationsRef);

        if (snapshot.exists()) {
          const notificationsData = snapshot.val() as Record<
            string,
            NotificationRecord
          >;
          const notificationsArray: Notification[] = Object.entries(
            notificationsData,
          )
            .map(([id, data]) => ({
              id,
              ...data,
            }))
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            );

          const normalized = notificationsArray.map((entry) => ({
            ...entry,
            read: entry.read === true,
          }));

          setAllNotificationsData(normalized);
          setHasMoreNotifications(normalized.length > displayedCount);
          setNotifications(normalized.slice(0, displayedCount));

          const unreadUpdates: Record<string, boolean> = {};
          normalized.forEach((entry) => {
            if (entry.read !== true) {
              unreadUpdates[`${entry.id}/read`] = true;
            }
          });

          if (Object.keys(unreadUpdates).length > 0) {
            await update(ref(db, `notifications/${user.uid}`), unreadUpdates).catch(
              () => undefined,
            );
          }
        } else {
          setNotifications([]);
          setAllNotificationsData([]);
          setHasMoreNotifications(false);
        }
      } catch (error: unknown) {
        console.error("Error fetching notifications:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [user, displayedCount]);

  // Update displayed notifications when count changes
  useEffect(() => {
    if (allNotificationsData.length === 0) return;
    setHasMoreNotifications(allNotificationsData.length > displayedCount);
    setNotifications(allNotificationsData.slice(0, displayedCount));
  }, [displayedCount, allNotificationsData]);

  const loadMoreNotifications = () => {
    if (isLoadingMore || !hasMoreNotifications) return;
    setIsLoadingMore(true);
    setTimeout(() => {
      setDisplayedCount((prev) => prev + 10);
      setIsLoadingMore(false);
    }, 200);
  };

  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  };

  const handleFollowBack = async (notification: Notification) => {
    if (!user) return;
    if (followBackLoading.has(notification.fromUserId)) return;

    // Prevent self-follow
    if (user.uid === notification.fromUserId) {
      toast({
        title: "Error",
        description: "You cannot follow yourself",
        variant: "destructive",
      });
      return;
    }

    try {
      setFollowBackLoading((prev) =>
        new Set(prev).add(notification.fromUserId),
      );
      const db = getDatabase();
      const currentUsername =
        user.displayName || user.email?.split("@")[0] || "user";
      const blockStatus = await getBlockStatus(user.uid, notification.fromUserId);
      if (blockStatus.blockedEither) {
        toast({
          title: "Action blocked",
          description: blockStatus.blockedByMe
            ? "Unblock this user first."
            : "You cannot follow this user.",
          variant: "destructive",
        });
        return;
      }

      // Check if already following
      const followingRef = ref(
        db,
        `following/${user.uid}/${notification.fromUserId}`,
      );
      const followingSnapshot = await get(followingRef);

      if (followingSnapshot.exists()) {
        toast({
          title: "Already Following",
          description: `You are already following ${notification.fromUsername}`,
        });
        setFollowingUsers((prev) => new Set(prev).add(notification.fromUserId));
        return;
      }

      // Add to following list
      await set(ref(db, `following/${user.uid}/${notification.fromUserId}`), {
        username: notification.fromUsername,
        timestamp: new Date().toISOString(),
      });

      // Add to followers list
      await set(ref(db, `followers/${notification.fromUserId}/${user.uid}`), {
        username: currentUsername,
        timestamp: new Date().toISOString(),
      });

      // Create notification for the other user
      const notificationRef = push(
        ref(db, `notifications/${notification.fromUserId}`),
      );
      await set(notificationRef, {
        type: "follow",
        fromUserId: user.uid,
        fromUsername: currentUsername,
        fromAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}`,
        timestamp: new Date().toISOString(),
        read: false,
      });

      // Update local state
      setFollowingUsers((prev) => new Set(prev).add(notification.fromUserId));

      toast({
        title: "Success",
        description: `You are now following ${notification.fromUsername}`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error) || "Failed to follow user",
        variant: "destructive",
      });
    } finally {
      setFollowBackLoading((prev) => {
        const next = new Set(prev);
        next.delete(notification.fromUserId);
        return next;
      });
    }
  };

  const handleAcceptFollowRequest = async (notification: Notification) => {
    if (!user) return;

    try {
      const db = getDatabase();
      const currentUsername =
        user.displayName || user.email?.split("@")[0] || "user";
      const blockStatus = await getBlockStatus(user.uid, notification.fromUserId);
      if (blockStatus.blockedEither) {
        toast({
          title: "Action blocked",
          description: blockStatus.blockedByMe
            ? "Unblock this user first."
            : "You cannot approve this request.",
          variant: "destructive",
        });
        return;
      }

      // Add to following/followers
      await set(ref(db, `following/${notification.fromUserId}/${user.uid}`), {
        username: currentUsername,
        timestamp: new Date().toISOString(),
      });

      await set(ref(db, `followers/${user.uid}/${notification.fromUserId}`), {
        username: notification.fromUsername,
        timestamp: new Date().toISOString(),
      });

      // Remove follow request (new deterministic key, fallback to legacy list)
      const followRequestRef = ref(
        db,
        `followRequests/${user.uid}/${notification.fromUserId}`,
      );
      const followRequestSnapshot = await get(followRequestRef);
      if (followRequestSnapshot.exists()) {
        await remove(followRequestRef);
      } else {
        const followRequestsRef = ref(db, `followRequests/${user.uid}`);
        const snapshot = await get(followRequestsRef);
        if (snapshot.exists()) {
          const requests = snapshot.val() as Record<
            string,
            { fromUserId?: string }
          >;
          for (const [requestId, request] of Object.entries(requests)) {
            if (request?.fromUserId === notification.fromUserId) {
              await remove(ref(db, `followRequests/${user.uid}/${requestId}`));
            }
          }
        }
      }

      // Send acceptance notification
      const notificationRef = push(
        ref(db, `notifications/${notification.fromUserId}`),
      );
      await set(notificationRef, {
        type: "follow_request_accepted",
        fromUserId: user.uid,
        fromUsername: currentUsername,
        fromAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}`,
        timestamp: new Date().toISOString(),
        read: false,
      });

      // Remove the notification
      await remove(ref(db, `notifications/${user.uid}/${notification.id}`));

      // Refresh notifications
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));
      setFollowingUsers((prev) => new Set(prev).add(notification.fromUserId));

      toast({
        title: "Request Accepted",
        description: `${notification.fromUsername} is now following you`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error) || "Failed to accept request",
        variant: "destructive",
      });
    }
  };

  const handleBlockFollowRequest = async (notification: Notification) => {
    if (!user) return;

    try {
      const db = getDatabase();
      const currentUsername =
        user.displayName || user.email?.split("@")[0] || "user";

      // Remove follow request (new deterministic key, fallback to legacy list)
      const followRequestRef = ref(
        db,
        `followRequests/${user.uid}/${notification.fromUserId}`,
      );
      const followRequestSnapshot = await get(followRequestRef);
      if (followRequestSnapshot.exists()) {
        await remove(followRequestRef);
      } else {
        const followRequestsRef = ref(db, `followRequests/${user.uid}`);
        const snapshot = await get(followRequestsRef);
        if (snapshot.exists()) {
          const requests = snapshot.val() as Record<
            string,
            { fromUserId?: string }
          >;
          for (const [requestId, request] of Object.entries(requests)) {
            if (request?.fromUserId === notification.fromUserId) {
              await remove(ref(db, `followRequests/${user.uid}/${requestId}`));
            }
          }
        }
      }

      // Send blocked notification
      const notificationRef = push(
        ref(db, `notifications/${notification.fromUserId}`),
      );
      await set(notificationRef, {
        type: "follow_request_blocked",
        fromUserId: user.uid,
        fromUsername: currentUsername,
        fromAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUsername}`,
        timestamp: new Date().toISOString(),
        read: false,
      });

      // Remove the notification
      await remove(ref(db, `notifications/${user.uid}/${notification.id}`));

      // Refresh notifications
      setNotifications((prev) => prev.filter((n) => n.id !== notification.id));

      toast({
        title: "Request Blocked",
        description: `You blocked ${notification.fromUsername}'s follow request`,
      });
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error) || "Failed to block request",
        variant: "destructive",
      });
    }
  };

  const handleUserClick = (username: string) => {
    navigate(`/users/profile/${username}`);
  };

  const handleMentionClick = (notification: Notification) => {
    if (notification.type !== "mention") {
      handleUserClick(notification.fromUsername);
      return;
    }

    if (notification.sourceType === "group_message") {
      navigate("/bakaiti");
      return;
    }

    if (notification.sourceType === "story") {
      navigate("/");
      return;
    }

    handleUserClick(notification.fromUsername);
  };

  const getMentionSourceLabel = (notification: Notification) => {
    switch (notification.sourceType) {
      case "group_message":
        return "group chat";
      case "story":
        return "story";
      case "comment":
        return "comment";
      default:
        return "post";
    }
  };

  return (
    <div className="min-h-screen max-w-2xl mx-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-4">
        <h1 className="text-2xl font-bold">Notifications</h1>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="all" className="w-full">
        <TabsList className="w-full h-12 border-b border-border rounded-none bg-transparent px-4">
          <TabsTrigger
            value="all"
            className="data-[state=active]:border-b-2 data-[state=active]:border-b-foreground rounded-none"
          >
            All
          </TabsTrigger>
          <TabsTrigger
            value="mentions"
            className="data-[state=active]:border-b-2 data-[state=active]:border-b-foreground rounded-none"
          >
            Mentions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-0">
          <ScrollArea className="h-[calc(100vh-180px)]">
            {loading ? (
              <div className="divide-y divide-border">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-4">
                    <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-24 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground py-12">
                <p>No notifications yet</p>
                <p className="text-sm mt-2">
                  When someone follows you, it will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                <div className="p-4">
                  <p className="font-semibold">Notifications</p>
                </div>

                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className="flex items-center gap-3 p-4 hover:bg-secondary cursor-pointer transition-colors"
                    onClick={() => handleMentionClick(notification)}
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={notification.fromAvatar}
                        alt={notification.fromUsername}
                      />
                      <AvatarFallback>
                        {notification.fromUsername[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <span className="font-semibold">
                          {notification.fromUsername}
                        </span>{" "}
                        <span className="text-muted-foreground">
                          {notification.type === "follow" &&
                            "started following you."}
                          {notification.type === "follow_request" &&
                            "wants to follow you."}
                          {notification.type === "follow_request_accepted" &&
                            "accepted your follow request."}
                          {notification.type === "follow_request_blocked" &&
                            "blocked you."}
                          {notification.type === "privacy_update" &&
                            (notification.message || "updated privacy settings.")}
                          {notification.type === "mention" &&
                            `mentioned you in a ${getMentionSourceLabel(notification)}.`}
                          {notification.type === "story_reaction" &&
                            (notification.message || "reacted to your story.")}
                          {notification.type === "story_comment" &&
                            (notification.message || "commented on your story.")}
                          {notification.type === "story_reply" &&
                            (notification.message || "replied to your story.")}
                        </span>{" "}
                        <span className="text-muted-foreground text-xs">
                          {getTimeAgo(notification.timestamp)}
                        </span>
                      </p>
                    </div>

                    {notification.type === "follow_request" && (
                      <div
                        className="flex gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAcceptFollowRequest(notification);
                          }}
                        >
                          Accept
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleBlockFollowRequest(notification);
                          }}
                        >
                          Block
                        </Button>
                      </div>
                    )}

                    {notification.type === "follow" &&
                      !followingUsers.has(notification.fromUserId) && (
                        <Button
                          variant="default"
                          size="sm"
                          className="bg-blue-500 hover:bg-blue-600 text-white"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFollowBack(notification);
                          }}
                          disabled={followBackLoading.has(
                            notification.fromUserId,
                          )}
                        >
                          {followBackLoading.has(notification.fromUserId)
                            ? "Following..."
                            : "Follow Back"}
                        </Button>
                      )}

                    {notification.type === "follow" &&
                      followingUsers.has(notification.fromUserId) && (
                        <Button variant="secondary" size="sm" disabled>
                          Following
                        </Button>
                      )}
                  </div>
                ))}
                {hasMoreNotifications && (
                  <div className="flex justify-center py-4">
                    <button
                      onClick={loadMoreNotifications}
                      disabled={isLoadingMore}
                      className="px-6 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm font-medium transition-colors"
                    >
                      {isLoadingMore ? "Loading..." : "Load More"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </TabsContent>

        <TabsContent value="mentions" className="mt-0">
          <ScrollArea className="h-[calc(100vh-180px)]">
            {loading ? (
              <div className="divide-y divide-border">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 p-4">
                    <div className="h-12 w-12 rounded-full bg-muted animate-pulse" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-48 bg-muted animate-pulse rounded" />
                      <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : mentionNotifications.length === 0 ? (
              <div className="py-20 text-center text-muted-foreground">
                <p>No mentions yet</p>
                <p className="text-sm mt-2">
                  When someone mentions you, it will appear here
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {mentionNotifications.map((notification) => (
                  <button
                    key={notification.id}
                    onClick={() => handleMentionClick(notification)}
                    className="w-full text-left flex items-center gap-3 p-4 hover:bg-secondary transition-colors"
                  >
                    <Avatar className="h-12 w-12">
                      <AvatarImage
                        src={notification.fromAvatar}
                        alt={notification.fromUsername}
                      />
                      <AvatarFallback>
                        {notification.fromUsername[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm">
                        <span className="font-semibold">
                          {notification.fromUsername}
                        </span>{" "}
                        mentioned you in a {getMentionSourceLabel(notification)}.
                      </p>
                      {notification.message && (
                        <p className="mt-1 truncate text-xs text-muted-foreground">
                          "{notification.message}"
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {getTimeAgo(notification.timestamp)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

