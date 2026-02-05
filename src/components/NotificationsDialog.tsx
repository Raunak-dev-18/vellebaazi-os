import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { getDatabase, ref, get, set, push, remove } from "firebase/database";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  type: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  timestamp: string;
  read: boolean;
  status?: string;
}

interface NotificationRecord {
  type: string;
  fromUserId: string;
  fromUsername: string;
  fromAvatar: string;
  timestamp: string;
  read: boolean;
  status?: string;
}

interface NotificationsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NotificationsDialog({
  open,
  onOpenChange,
}: NotificationsDialogProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingUsers, setFollowingUsers] = useState<Set<string>>(new Set());
  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong";

  useEffect(() => {
    const fetchNotifications = async () => {
      if (!user || !open) return;

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

          setNotifications(notificationsArray);
        } else {
          setNotifications([]);
        }
      } catch (error) {
        console.error("Error fetching notifications:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchNotifications();
  }, [user, open]);

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
      const db = getDatabase();
      const currentUsername =
        user.displayName || user.email?.split("@")[0] || "user";

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
    }
  };

  const handleUserClick = (username: string) => {
    navigate(`/users/profile/${username}`);
    onOpenChange(false);
  };

  const handleAcceptFollowRequest = async (notification: Notification) => {
    if (!user) return;

    try {
      const db = getDatabase();
      const currentUsername =
        user.displayName || user.email?.split("@")[0] || "user";

      // Add to following/followers
      await set(ref(db, `following/${notification.fromUserId}/${user.uid}`), {
        username: currentUsername,
        timestamp: new Date().toISOString(),
      });

      await set(ref(db, `followers/${user.uid}/${notification.fromUserId}`), {
        username: notification.fromUsername,
        timestamp: new Date().toISOString(),
      });

      // Remove follow request
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

      toast({
        title: "Request Accepted",
        description: `${notification.fromUsername} is now following you`,
      });

      // Refresh notifications
      setFollowingUsers((prev) => new Set(prev).add(notification.fromUserId));
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

      // Remove follow request
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] h-[80vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="text-2xl font-bold">
            Notifications
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="all" className="w-full flex-1 flex flex-col">
          <TabsList className="w-full h-12 border-b border-border rounded-none bg-transparent px-6">
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

          <TabsContent value="all" className="mt-0 flex-1">
            <ScrollArea className="h-[calc(80vh-180px)]">
              {loading ? (
                <div className="px-6 py-12 text-center text-muted-foreground">
                  <p>Loading notifications...</p>
                </div>
              ) : notifications.length === 0 ? (
                <div className="px-6 py-12 text-center text-muted-foreground">
                  <p>No notifications yet</p>
                  <p className="text-sm mt-2">
                    When someone follows you, it will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  <div className="px-6 py-4">
                    <p className="font-semibold">Notifications</p>
                  </div>

                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className="flex items-center gap-3 px-6 py-4 hover:bg-secondary cursor-pointer transition-colors"
                      onClick={() => handleUserClick(notification.fromUsername)}
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
                          >
                            Follow Back
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
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="mentions" className="mt-0 flex-1">
            <div className="py-20 text-center text-muted-foreground">
              <p>No mentions yet</p>
              <p className="text-sm mt-2">
                When someone mentions you, it will appear here
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
