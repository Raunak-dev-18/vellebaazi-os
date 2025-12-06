import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Eye, EyeOff, Chrome } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { UsernameDialog } from "@/components/UsernameDialog";

export default function Login() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showUsernameDialog, setShowUsernameDialog] = useState(false);
  const [pendingGoogleAuth, setPendingGoogleAuth] = useState(false);
  
  const { signIn, signUp, signInWithGoogle, saveUsername } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const validatePassword = (pwd: string): boolean => {
    const alphabets = pwd.match(/[a-zA-Z]/g);
    const numbers = pwd.match(/[0-9]/g);
    
    if (!alphabets || alphabets.length < 6) {
      toast({
        title: "Invalid Password",
        description: "Password must contain at least 6 alphabets",
        variant: "destructive",
      });
      return false;
    }
    
    if (!numbers || numbers.length < 2) {
      toast({
        title: "Invalid Password",
        description: "Password must contain at least 2 numbers",
        variant: "destructive",
      });
      return false;
    }
    
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isLogin) {
      if (!username.trim()) {
        toast({
          title: "Username Required",
          description: "Please enter a username",
          variant: "destructive",
        });
        return;
      }
      
      if (!validatePassword(password)) {
        return;
      }
    }
    
    setLoading(true);

    try {
      if (isLogin) {
        await signIn(email, password);
        toast({
          title: "Success",
          description: "Signed in successfully!",
        });
        navigate("/");
      } else {
        await signUp(email, password, username);
        toast({
          title: "Success",
          description: "Account created successfully!",
        });
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const result = await signInWithGoogle();
      
      // Check if user needs to set username (new user)
      if (result.isNewUser) {
        setPendingGoogleAuth(true);
        setShowUsernameDialog(true);
        setLoading(false);
      } else {
        toast({
          title: "Success",
          description: "Signed in with Google successfully!",
        });
        navigate("/");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const handleUsernameSubmit = async (usernameValue: string) => {
    setLoading(true);
    try {
      await saveUsername(usernameValue);
      setShowUsernameDialog(false);
      toast({
        title: "Success",
        description: "Account created successfully!",
      });
      navigate("/");
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save username",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex">
      {/* Left Side - Logo and Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-background">
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center justify-center w-full p-12">
          <div className="max-w-md text-center space-y-8">
            <div className="w-32 h-32 mx-auto flex items-center justify-center">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <div className="w-full">
              <img src="/image.png" alt="Welcome" className="w-full h-auto object-contain" />
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md space-y-8">
          {/* Logo for mobile */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 mb-4">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="text-2xl font-bold">Vellebaazi</h2>
          </div>

          {/* Header */}
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-bold tracking-tight">
              {isLogin ? "Sign in to your account" : "Create your account"}
            </h2>
            <p className="text-muted-foreground">
              {isLogin 
                ? "Enter your credentials to access your account" 
                : "Join millions of people sharing their stories"}
            </p>
          </div>

          {/* Social Login Buttons */}
          <div className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full h-11" 
              size="lg"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <Chrome className="mr-2 h-5 w-5" />
              Continue with Google
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with email
              </span>
            </div>
          </div>

          {/* Form */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  placeholder="Enter username"
                  className="h-11"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]+"
                  title="Username can only contain letters, numbers, and underscores"
                />
                <p className="text-xs text-muted-foreground">
                  Minimum 3 characters. Only letters, numbers, and underscores.
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {isLogin && (
                  <a href="#" className="text-sm text-primary hover:underline">
                    Forgot password?
                  </a>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  className="h-11 pr-10"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
              {!isLogin && (
                <p className="text-xs text-muted-foreground">
                  Must contain at least 6 alphabets and 2 numbers
                </p>
              )}
            </div>

            <Button 
              type="submit" 
              className="w-full h-11 bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:opacity-90 transition-opacity"
              size="lg"
              disabled={loading}
            >
              {loading ? "Loading..." : (isLogin ? "Sign In" : "Create Account")}
            </Button>
          </form>

          {/* Toggle Login/Signup */}
          <div className="text-center text-sm">
            <span className="text-muted-foreground">
              {isLogin ? "Don't have an account? " : "Already have an account? "}
            </span>
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-primary font-semibold hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>

          {/* Terms */}
          <p className="text-xs text-center text-muted-foreground">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline hover:text-foreground">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>

      {/* Username Dialog for Google Sign-in */}
      <UsernameDialog 
        open={showUsernameDialog}
        onSubmit={handleUsernameSubmit}
        loading={loading}
      />
    </div>
  );
}
