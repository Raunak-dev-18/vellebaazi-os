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
import { getDatabase, ref, update, get } from "firebase/database";
import { updateProfile } from "firebase/auth";
import { uploadToS3 } from "@/lib/supabase";

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
  const [selectedProfilePic, setSelectedProfilePic] = useState<File | null>(null);
  const [previewProfilePic, setPreviewProfilePic] = useState<string | null>(null);
  const [isUploadingPic, setIsUploadingPic] = useState(false);

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
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
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
      const fileExtension = selectedProfilePic.name.split('.').pop();
      const fileName = `${user.uid}/profile.${fileExtension}`;

      // Upload file to Supabase S3 Storage
      const photoURL = await uploadToS3(selectedProfilePic, fileName);

      // Update Firebase Auth profile
      await updateProfile(user, {
        photoURL: photoURL
      });
      
      // Update database
      const userRef = ref(db, `users/${user.uid}`);
      await update(userRef, {
        photoURL: photoURL
      });

      // Update all user's posts with new avatar
      const postsRef = ref(db, 'posts');
      const postsSnapshot = await get(postsRef);
      
      if (postsSnapshot.exists()) {
        const allPosts = postsSnapshot.val();
        const updatePromises = Object.entries(allPosts)
          .filter(([_, post]: [string, any]) => post.userId === user.uid)
          .map(([postId, _]: [string, any]) => 
            update(ref(db, `posts/${postId}`), { userAvatar: photoURL })
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
    } catch (error: any) {
      console.error("Error uploading profile picture:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to upload profile picture",
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
      const usersRef = ref(db, 'users');
      const usersSnapshot = await get(usersRef);
      
      if (usersSnapshot.exists()) {
        const usersData = usersSnapshot.val();
        const usernameTaken = Object.entries(usersData).some(
          ([uid, data]: [string, any]) => 
            uid !== user.uid && data.username === username.trim()
        );
        
        if (usernameTaken) {
          toast({
            title: "Username Taken",
            description: "This username is already in use. Please choose another.",
            variant: "destructive",
          });
          setIsSaving(false);
          return;
        }
      }
      
      // Update Firebase Auth profile
      await updateProfile(user, {
        displayName: username.trim()
      });
      
      // Update database
      const userRef = ref(db, `users/${user.uid}`);
      await update(userRef, {
        username: username.trim(),
        gender: gender,
        accountPrivacy: accountPrivacy
      });
      
      toast({
        title: "Settings Saved",
        description: "Your settings have been updated successfully",
      });
      
      // Navigate back to profile
      navigate('/profile');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
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
          onClick={() => navigate('/profile')}
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
                  src={previewProfilePic || profilePicture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.uid}`} 
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
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      asChild
                    >
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
                <Label htmlFor="male" className="font-normal cursor-pointer">Male</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="female" id="female" />
                <Label htmlFor="female" className="font-normal cursor-pointer">Female</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="other" id="other" />
                <Label htmlFor="other" className="font-normal cursor-pointer">Other</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="prefer-not-to-say" id="prefer-not-to-say" />
                <Label htmlFor="prefer-not-to-say" className="font-normal cursor-pointer">
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
            <RadioGroup value={accountPrivacy} onValueChange={setAccountPrivacy}>
              <div className="flex items-start space-x-2 p-4 border border-border rounded-lg hover:bg-secondary transition-colors">
                <RadioGroupItem value="public" id="public" className="mt-1" />
                <div className="flex-1 cursor-pointer" onClick={() => setAccountPrivacy("public")}>
                  <Label htmlFor="public" className="font-semibold cursor-pointer">
                    Public Account
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Anyone can follow you and see your posts
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-2 p-4 border border-border rounded-lg hover:bg-secondary transition-colors">
                <RadioGroupItem value="private" id="private" className="mt-1" />
                <div className="flex-1 cursor-pointer" onClick={() => setAccountPrivacy("private")}>
                  <Label htmlFor="private" className="font-semibold cursor-pointer">
                    Private Account
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Only approved followers can see your posts. New followers need your approval.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        {/* Save Button */}
        <div className="pt-6">
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
