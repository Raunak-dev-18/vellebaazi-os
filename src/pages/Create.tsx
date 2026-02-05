import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Upload,
  Image as ImageIcon,
  Video,
  Music,
  AtSign,
  Check,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getDatabase, ref, push, set, get } from "firebase/database";
import { uploadToStorage } from "@/lib/storage";
import { MentionTextarea } from "@/components/MentionTextarea";
import { extractMentions } from "../utils/mentions";

type PostType = "image" | "reel";

export default function Create() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step management
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Upload
  const [postType, setPostType] = useState<PostType | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Step 2: Details
  const [caption, setCaption] = useState("");
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [selectedMusic, setSelectedMusic] = useState("");

  // Step 3: Tag people
  const [taggedUsers, setTaggedUsers] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [searchResults, setSearchResults] = useState<
    { uid: string; username: string; avatar: string }[]
  >([]);

  // Step 4: Posting
  const [isPosting, setIsPosting] = useState(false);

  const handleFileSelect = (type: PostType) => {
    setPostType(type);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (postType === "image") {
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Invalid File",
          description: "Please select an image file",
          variant: "destructive",
        });
        return;
      }
    } else if (postType === "reel") {
      if (!file.type.startsWith("video/")) {
        toast({
          title: "Invalid File",
          description: "Please select a video file",
          variant: "destructive",
        });
        return;
      }

      // Validate video duration (30 seconds max)
      const video = document.createElement("video");
      video.preload = "metadata";

      await new Promise((resolve, reject) => {
        video.onloadedmetadata = () => {
          window.URL.revokeObjectURL(video.src);
          const duration = video.duration;

          if (duration > 30) {
            toast({
              title: "Video Too Long",
              description: "Please select a video shorter than 30 seconds",
              variant: "destructive",
            });
            reject(new Error("Video too long"));
          } else {
            resolve(duration);
          }
        };

        video.onerror = () => {
          toast({
            title: "Invalid Video",
            description: "Could not load video file",
            variant: "destructive",
          });
          reject(new Error("Invalid video"));
        };

        video.src = URL.createObjectURL(file);
      }).catch(() => {
        return;
      });
    }

    // Validate file size (50MB)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Please select a file smaller than 50MB",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setCurrentStep(2);
  };

  const handleSearchUsers = async (searchTerm: string) => {
    if (!searchTerm.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const db = getDatabase();
      const usersRef = ref(db, "users");
      const snapshot = await get(usersRef);

      if (snapshot.exists()) {
        const usersData = snapshot.val() as Record<
          string,
          { username?: string; photoURL?: string }
        >;
        const results = Object.entries(usersData)
          .filter(
            ([uid, data]) =>
              uid !== user?.uid &&
              (data.username || "")
                .toLowerCase()
                .includes(searchTerm.toLowerCase()),
          )
          .map(([uid, data]) => ({
            uid,
            username: data.username || "user",
            avatar:
              data.photoURL ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${uid}`,
          }))
          .slice(0, 5);

        setSearchResults(results);
      }
    } catch (error: unknown) {
      console.error("Error searching users:", error);
    }
  };

  const handleTagUser = (username: string) => {
    if (!taggedUsers.includes(username)) {
      setTaggedUsers([...taggedUsers, username]);
    }
    setTagInput("");
    setSearchResults([]);
  };

  const handleRemoveTag = (username: string) => {
    setTaggedUsers(taggedUsers.filter((u) => u !== username));
  };

  const handlePost = async () => {
    if (!user || !selectedFile) return;

    setIsPosting(true);
    try {
      toast({
        title: "Uploading...",
        description: "Please wait while we upload your media",
      });

      const db = getDatabase();

      // Upload media to Storage API with timeout
      const fileExtension = selectedFile.name.split(".").pop();
      const fileName = `${postType}s/${user.uid}/${Date.now()}.${fileExtension}`;

      let mediaUrl;
      try {
        mediaUrl = await Promise.race([
          uploadToStorage(selectedFile, fileName),
          new Promise(
            (_, reject) =>
              setTimeout(() => reject(new Error("Upload timeout")), 120000), // 2 minute timeout
          ),
        ]);
      } catch (uploadError: unknown) {
        if (
          uploadError instanceof Error &&
          uploadError.message === "Upload timeout"
        ) {
          throw new Error(
            "Upload is taking too long. Please try with a smaller file or check your internet connection.",
          );
        }
        throw uploadError instanceof Error
          ? uploadError
          : new Error("Upload failed");
      }

      // Create post in Realtime Database
      const postsRef = ref(db, "posts");
      const newPostRef = push(postsRef);

      await set(newPostRef, {
        userId: user.uid,
        username: user.displayName || user.email?.split("@")[0] || "user",
        userAvatar:
          user.photoURL ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`,
        mediaUrl: mediaUrl as string,
        mediaType: postType === "reel" ? "video" : "image",
        postType: postType, // 'image' or 'reel'
        caption: caption.trim(),
        commentsEnabled,
        music: selectedMusic || null,
        taggedUsers: taggedUsers.length > 0 ? taggedUsers : null,
        likes: 0,
        comments: 0,
        views: 0,
        createdAt: Date.now(),
      });

      toast({
        title: "Posted Successfully!",
        description: `Your ${postType === "reel" ? "reel" : "post"} has been published`,
      });

      // Navigate to appropriate page
      if (postType === "reel") {
        navigate("/timepass");
      } else {
        navigate("/profile");
      }
    } catch (error: unknown) {
      console.error("Error posting:", error);
      toast({
        title: "Error",
        description: "Failed to post. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsPosting(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Create New Post</h2>
        <p className="text-muted-foreground">Choose what you want to create</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Image Post */}
        <button
          onClick={() => handleFileSelect("image")}
          className="border-2 border-dashed border-border rounded-lg p-8 hover:border-primary hover:bg-secondary/50 transition-all"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-primary/10 rounded-full">
              <ImageIcon className="h-12 w-12 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Post</h3>
              <p className="text-sm text-muted-foreground">1:1 Image</p>
            </div>
          </div>
        </button>

        {/* Reel */}
        <button
          onClick={() => handleFileSelect("reel")}
          className="border-2 border-dashed border-border rounded-lg p-8 hover:border-primary hover:bg-secondary/50 transition-all"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="p-4 bg-primary/10 rounded-full">
              <Video className="h-12 w-12 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-lg">Reel</h3>
              <p className="text-sm text-muted-foreground">
                9:16 Video (max 30s, 50MB)
              </p>
            </div>
          </div>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={postType === "image" ? "image/*" : "video/*"}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setCurrentStep(1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold">Add Details</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Preview */}
        <div className="space-y-4">
          <Label>Preview</Label>
          <div
            className={`relative bg-muted rounded-lg overflow-hidden ${postType === "reel" ? "aspect-[9/16]" : "aspect-square"}`}
          >
            {selectedFile &&
              (postType === "reel" ? (
                <video
                  src={previewUrl || ""}
                  controls
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={previewUrl || ""}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ))}
          </div>
        </div>

        {/* Details Form */}
        <div className="space-y-4">
          {/* Caption */}
          <div className="space-y-2">
            <Label htmlFor="caption">Caption</Label>
            <MentionTextarea
              id="caption"
              placeholder="Write a caption... Use @ to mention people"
              value={caption}
              onChange={(val) => setCaption(val)}
              className="min-h-[120px] resize-none"
              maxLength={2200}
            />
            <p className="text-xs text-muted-foreground text-right">
              {caption.length}/2200
            </p>
          </div>

          {/* Comments Toggle */}
          <div className="flex items-center justify-between p-4 border border-border rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="comments">Allow Comments</Label>
              <p className="text-sm text-muted-foreground">
                Let people comment on your post
              </p>
            </div>
            <Switch
              id="comments"
              checked={commentsEnabled}
              onCheckedChange={setCommentsEnabled}
            />
          </div>

          {/* Music (for reels) */}
          {postType === "reel" && (
            <div className="space-y-2">
              <Label htmlFor="music">Add Music (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  id="music"
                  placeholder="Search for music..."
                  value={selectedMusic}
                  onChange={(e) => setSelectedMusic(e.target.value)}
                />
                <Button variant="outline" size="icon">
                  <Music className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          <Button onClick={() => setCurrentStep(3)} className="w-full">
            Next
          </Button>
        </div>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setCurrentStep(2)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold">Tag People</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Preview */}
        <div className="space-y-4">
          <Label>Preview</Label>
          <div
            className={`relative bg-muted rounded-lg overflow-hidden ${postType === "reel" ? "aspect-[9/16]" : "aspect-square"}`}
          >
            {selectedFile &&
              (postType === "reel" ? (
                <video
                  src={previewUrl || ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={previewUrl || ""}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ))}
          </div>
        </div>

        {/* Tag Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tag">Search and tag people</Label>
            <div className="relative">
              <AtSign className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="tag"
                placeholder="Search username..."
                value={tagInput}
                onChange={(e) => {
                  setTagInput(e.target.value);
                  handleSearchUsers(e.target.value);
                }}
                className="pl-10"
              />
            </div>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="border border-border rounded-lg divide-y">
                {searchResults.map((user) => (
                  <button
                    key={user.uid}
                    onClick={() => handleTagUser(user.username)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-secondary transition-colors"
                  >
                    <img
                      src={user.avatar}
                      alt={user.username}
                      className="h-10 w-10 rounded-full"
                    />
                    <span className="font-semibold">{user.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tagged Users */}
          {taggedUsers.length > 0 && (
            <div className="space-y-2">
              <Label>Tagged ({taggedUsers.length})</Label>
              <div className="flex flex-wrap gap-2">
                {taggedUsers.map((username) => (
                  <div
                    key={username}
                    className="flex items-center gap-2 bg-secondary px-3 py-1 rounded-full"
                  >
                    <span className="text-sm">@{username}</span>
                    <button
                      onClick={() => handleRemoveTag(username)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button onClick={() => setCurrentStep(4)} className="w-full">
            Next
          </Button>
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setCurrentStep(3)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold">Review & Post</h2>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Preview */}
        <div className="space-y-4">
          <Label>Final Preview</Label>
          <div
            className={`relative bg-muted rounded-lg overflow-hidden ${postType === "reel" ? "aspect-[9/16]" : "aspect-square"}`}
          >
            {selectedFile &&
              (postType === "reel" ? (
                <video
                  src={previewUrl || ""}
                  controls
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={previewUrl || ""}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ))}
          </div>
        </div>

        {/* Summary */}
        <div className="space-y-4">
          <div className="border border-border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold">Summary</h3>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type:</span>
                <span className="font-medium capitalize">{postType}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Caption:</span>
                <span className="font-medium">
                  {caption ? `${caption.substring(0, 20)}...` : "None"}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-muted-foreground">Comments:</span>
                <span className="font-medium">
                  {commentsEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>

              {selectedMusic && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Music:</span>
                  <span className="font-medium">{selectedMusic}</span>
                </div>
              )}

              {taggedUsers.length > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tagged:</span>
                  <span className="font-medium">
                    {taggedUsers.length} people
                  </span>
                </div>
              )}
            </div>
          </div>

          <Button
            onClick={handlePost}
            disabled={isPosting}
            className="w-full"
            size="lg"
          >
            {isPosting ? (
              <>
                <Upload className="mr-2 h-4 w-4 animate-spin" />
                Posting...
              </>
            ) : (
              <>
                <Check className="mr-2 h-4 w-4" />
                Post Now
              </>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            By posting, you agree to our Terms of Service and Community
            Guidelines
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Create</h1>
      </div>

      {/* Progress Steps */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-center gap-2 max-w-md mx-auto">
          {[1, 2, 3, 4].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`h-2 w-12 rounded-full transition-colors ${
                  step <= currentStep ? "bg-primary" : "bg-muted"
                }`}
              />
              {step < 4 && <div className="w-2" />}
            </div>
          ))}
        </div>
        <p className="text-center text-sm text-muted-foreground mt-2">
          Step {currentStep} of 4
        </p>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto p-6">
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
      </div>
    </div>
  );
}
