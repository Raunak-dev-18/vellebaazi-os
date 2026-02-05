import { useState, useEffect } from "react";
import { ArrowLeft, User, Lock, Users, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { getDatabase, ref, update, get, remove } from "firebase/database";
import { updateProfile } from "firebase/auth";
import { uploadToStorage } from "@/lib/storage";

interface UserRecord {
  username?: string;
  photoURL?: string;
  accountPrivacy?: string;
  gender?: string;
}

interface PostRecord {
  userId: string;
  mediaUrl?: string;
}

interface StoryRecord {
  userId: string;
  mediaUrl?: string;
}

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [username, setUsername] = useState("");
  const [gender, setGender] = useState("prefer-not-to-say");
  const [accountPrivacy, setAccountPrivacy] = useState("public");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profilePicture, setProfilePicture] = useState("");
  const [selectedProfilePic, setSelectedProfilePic] = useState<File | null>(
    null,
  );
  const [previewProfilePic, setPreviewProfilePic] = useState<string | null>(
    null,
  );
  const [isUploadingPic, setIsUploadingPic] = useState(false);
  const [isCleaningLegacy, setIsCleaningLegacy] = useState(false);

  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : "Something went wrong";

  useEffect(() => {
    const fetchUserSettings = async () => {
      if (!user) return;

      try {
        const db = getDatabase();
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
          const userData = snapshot.val();
          setUsername(userData.username || user.displayName || "");
          setGender(userData.gender || "prefer-not-to-say");
          setAccountPrivacy(userData.accountPrivacy || "public");
          setProfilePicture(userData.photoURL || user.photoURL || "");
        } else {
          setProfilePicture(user.photoURL || "");
        }
      } catch (error) {
        console.error("Error fetching settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserSettings();
  }, [user]);

  const handleProfilePicSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - only images
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid File Type",
        description: "Please select an image (JPG, PNG, GIF)",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setSelectedProfilePic(file);
    setPreviewProfilePic(URL.createObjectURL(file));
  };

  const handleUploadProfilePicture = async () => {
    if (!user || !selectedProfilePic) return;

    setIsUploadingPic(true);
    try {
      const db = getDatabase();

      // Generate unique filename
      const fileExtension = selectedProfilePic.name.split(".").pop();
      const fileName = `${user.uid}/profile.${fileExtension}`;

      // Upload file to Storage API
      const photoURL = await uploadToStorage(selectedProfilePic, fileName);

      // Update Firebase Auth profile
      await updateProfile(user, {
        photoURL: photoURL,
      });

      // Update database
      const userRef = ref(db, `users/${user.uid}`);
      await update(userRef, {
        photoURL: photoURL,
      });

      // Update all user's posts with new avatar
      const postsRef = ref(db, "posts");
      const postsSnapshot = await get(postsRef);

      if (postsSnapshot.exists()) {
        const allPosts = postsSnapshot.val() as Record<string, PostRecord>;
        const updatePromises = Object.entries(allPosts)
          .filter(([, post]) => post.userId === user.uid)
          .map(([postId]) =>
            update(ref(db, `posts/${postId}`), { userAvatar: photoURL }),
          );

        await Promise.all(updatePromises);
      }

      setProfilePicture(photoURL);
      setSelectedProfilePic(null);
      setPreviewProfilePic(null);

      toast({
        title: "Profile Picture Updated",
        description: "Your profile picture has been updated successfully",
      });
    } catch (error: unknown) {
      console.error("Error uploading profile picture:", error);
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsUploadingPic(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) return;

    if (!username.trim()) {
      toast({
        title: "Error",
        description: "Username cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const db = getDatabase();

      // Check if username is already taken by another user
      const usersRef = ref(db, "users");
      const usersSnapshot = await get(usersRef);

      if (usersSnapshot.exists()) {
        const usersData = usersSnapshot.val() as Record<string, UserRecord>;
        const usernameTaken = Object.entries(usersData).some(
          ([uid, data]) =>
            uid !== user.uid && data.username === username.trim(),
        );

        if (usernameTaken) {
          toast({
            title: "Username Taken",
            description:
              "This username is already in use. Please choose another.",
            variant: "destructive",
          });
          setIsSaving(false);
          return;
        }
      }

      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName: username.trim(),
      });

      // Update database
      const userRef = ref(db, `users/${user.uid}`);
      await update(userRef, {
        username: username.trim(),
        gender: gender,
        accountPrivacy: accountPrivacy,
      });

      toast({
        title: "Settings Saved",
        description: "Your settings have been updated successfully",
      });

      // Navigate back to profile
      navigate("/profile");
    } catch (error: unknown) {
      toast({
        title: "Error",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const isLegacyMediaUrl = (url?: string | null) => {
    if (!url) return false;
    return url.includes("supabase.co/storage");
  };

  const handleCleanupLegacyMedia = async () => {
    if (!user) return;

    setIsCleaningLegacy(true);
    try {
      const db = getDatabase();
      let removedPosts = 0;
      let removedStories = 0;
      let clearedAvatar = false;

      // Clear legacy avatar if needed
      if (isLegacyMediaUrl(profilePicture)) {
        await updateProfile(user, { photoURL: "" });
        await update(ref(db, `users/${user.uid}`), { photoURL: "" });
        setProfilePicture("");
        clearedAvatar = true;
      }

      // Clean legacy posts for current user
      const postsRef = ref(db, "posts");
      const postsSnapshot = await get(postsRef);
      if (postsSnapshot.exists()) {
        const allPosts = postsSnapshot.val() as Record<string, PostRecord>;
        const legacyPosts = Object.entries(allPosts).filter(
          ([, post]) =>
            post.userId === user.uid && isLegacyMediaUrl(post.mediaUrl),
        );

        await Promise.all(
          legacyPosts.map(async ([postId]) => {
            await remove(ref(db, `posts/${postId}`));
            await remove(ref(db, `likes/${postId}`));
            await remove(ref(db, `comments/${postId}`));
            removedPosts += 1;
          }),
        );
      }

      // Clean legacy stories for current user
      const storiesRef = ref(db, "stories");
      const storiesSnapshot = await get(storiesRef);
      if (storiesSnapshot.exists()) {
        const allStories = storiesSnapshot.val() as Record<string, StoryRecord>;
        const legacyStories = Object.entries(allStories).filter(
          ([, story]) =>
            story.userId === user.uid && isLegacyMediaUrl(story.mediaUrl),
        );

        await Promise.all(
          legacyStories.map(async ([storyId]) => {
            await remove(ref(db, `stories/${storyId}`));
            removedStories += 1;
          }),
        );
      }

      toast({
        title: "Cleanup Complete",
        description: `Removed ${removedPosts} post(s) and ${removedStories} stor${removedStories === 1 ? "y" : "ies"}${clearedAvatar ? ", and reset your avatar" : ""}.`,
      });
    } catch (error: unknown) {
      console.error("Error cleaning legacy media:", error);
      toast({
        title: "Cleanup Failed",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setIsCleaningLegacy(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/profile")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Account Settings */}
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <User className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Account Settings</h2>
          </div>

          {/* Profile Picture */}
          <div className="space-y-4">
            <Label>Profile Picture</Label>
            <div className="flex items-center gap-6">
              <Avatar className="h-24 w-24 border-2 border-border">
                <AvatarImage
                  src={
                    previewProfilePic ||
                    profilePicture ||
                    `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`
                  }
                  alt="Profile"
                />
                <AvatarFallback>
                  {username.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 space-y-3">
                <Input
                  id="profile-pic-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePicSelect}
                  className="hidden"
                />
                <div className="flex gap-2">
                  <label htmlFor="profile-pic-upload">
                    <Button type="button" variant="outline" size="sm" asChild>
                      <span>
                        <Camera className="h-4 w-4 mr-2" />
                        Choose Photo
                      </span>
                    </Button>
                  </label>
                  {selectedProfilePic && (
                    <>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={handleUploadProfilePicture}
                        disabled={isUploadingPic}
                      >
                        {isUploadingPic ? "Uploading..." : "Upload"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedProfilePic(null);
                          setPreviewProfilePic(null);
                        }}
                        disabled={isUploadingPic}
                      >
                        Cancel
                      </Button>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  JPG, PNG or GIF (max 5MB)
                </p>
              </div>
            </div>
          </div>

          {/* Username */}
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="max-w-md"
            />
            <p className="text-xs text-muted-foreground">
              Your username is visible to everyone
            </p>
          </div>

          {/* Gender */}
          <div className="space-y-3">
            <Label>Gender</Label>
            <RadioGroup value={gender} onValueChange={setGender}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="male" id="male" />
                <Label htmlFor="male" className="font-normal cursor-pointer">
                  Male
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="female" />
                <Label htmlFor="female" className="font-normal cursor-pointer">
                  Female
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other" className="font-normal cursor-pointer">
                  Other
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem
                  value="prefer-not-to-say"
                  id="prefer-not-to-say"
                />
                <Label
                  htmlFor="prefer-not-to-say"
                  className="font-normal cursor-pointer"
                >
                  Prefer not to say
                </Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Privacy Settings */}
        <div className="space-y-6 pt-6 border-t border-border">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Privacy Settings</h2>
          </div>

          {/* Account Privacy */}
          <div className="space-y-3">
            <Label>Account Privacy</Label>
            <RadioGroup
              value={accountPrivacy}
              onValueChange={setAccountPrivacy}
            >
              <div className="flex items-start space-x-2 p-4 border border-border rounded-lg hover:bg-secondary transition-colors">
                <RadioGroupItem value="public" id="public" className="mt-1" />
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => setAccountPrivacy("public")}
                >
                  <Label
                    htmlFor="public"
                    className="font-semibold cursor-pointer"
                  >
                    Public Account
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Anyone can follow you and see your posts
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2 p-4 border border-border rounded-lg hover:bg-secondary transition-colors">
                <RadioGroupItem value="private" id="private" className="mt-1" />
                <div
                  className="flex-1 cursor-pointer"
                  onClick={() => setAccountPrivacy("private")}
                >
                  <Label
                    htmlFor="private"
                    className="font-semibold cursor-pointer"
                  >
                    Private Account
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Only approved followers can see your posts. New followers
                    need your approval.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-6 space-y-4">
          <div className="border border-border rounded-lg p-4 bg-card">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold">Legacy Media Cleanup</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Remove old Supabase media links from your posts, stories, and
                  avatar.
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handleCleanupLegacyMedia}
                disabled={isCleaningLegacy}
              >
                {isCleaningLegacy ? "Cleaning..." : "Clean Legacy Media"}
              </Button>
            </div>
          </div>

          <Button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="w-full max-w-md"
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>
    </div>
  );
}
