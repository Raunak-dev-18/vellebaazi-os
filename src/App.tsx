import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { MobileTopBar } from "@/components/MobileTopBar";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { cn } from "@/lib/utils";

// Lazy load pages for better performance
const Home = lazy(() => import("./pages/Home"));
const Timepass = lazy(() => import("./pages/Timepass"));
const Bakaiti = lazy(() => import("./pages/Bakaiti"));
const Profile = lazy(() => import("./pages/Profile"));
const Explore = lazy(() => import("./pages/Explore"));
const Notifications = lazy(() => import("./pages/Notifications"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Login = lazy(() => import("./pages/Login"));
const TermsOfService = lazy(() => import("./pages/TermsOfService"));
const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy"));
const UserProfile = lazy(() => import("./pages/UserProfile"));
const Settings = lazy(() => import("./pages/Settings"));
const Create = lazy(() => import("./pages/Create"));
const StoryViewer = lazy(() => import("./pages/StoryViewer"));

// Page loading component
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="h-8 w-8 border-4 border-muted-foreground/20 border-t-muted-foreground rounded-full animate-spin" />
    </div>
  );
}

const queryClient = new QueryClient();

// Disable right-click on images and videos globally
const useDisableRightClick = () => {
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'IMG' || target.tagName === 'VIDEO') {
        e.preventDefault();
        return false;
      }
    };

    document.addEventListener('contextmenu', handleContextMenu);
    return () => document.removeEventListener('contextmenu', handleContextMenu);
  }, []);
};

function SplashScreen() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <img 
        src="/logo.png" 
        alt="Velle Baazi" 
        className="w-24 h-24 mb-4 animate-pulse"
      />
      <h1 className="text-2xl font-bold italic text-foreground">Velle Baazi</h1>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <SplashScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function AppContent() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const hideMobileBottomNav = location.pathname.startsWith("/bakaiti");

  if (loading) {
    return <SplashScreen />;
  }

  return (
    <Suspense fallback={<SplashScreen />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route
          path="/story/:user_id/:story_id"
          element={
            <ProtectedRoute>
              <StoryViewer />
            </ProtectedRoute>
          }
        />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <SidebarProvider>
                <div className="flex min-h-screen w-full overflow-x-hidden bg-background">
                  <div className="fixed inset-y-0 left-0 z-40 hidden md:block">
                    <AppSidebar />
                  </div>
                  <main className="relative flex min-h-screen flex-1 flex-col overflow-x-hidden md:ml-[74px]">
                    <MobileTopBar />
                    <Suspense fallback={<PageLoader />}>
                      <div className={cn("flex-1 md:pb-0", hideMobileBottomNav ? "pb-0" : "pb-20")}>
                        <Routes>
                          <Route path="/" element={<Home />} />
                          <Route path="/timepass" element={<Timepass />} />
                          <Route path="/bakaiti" element={<Bakaiti />} />
                          <Route path="/create" element={<Create />} />
                          <Route path="/profile" element={<Profile />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="/explore" element={<Explore />} />
                          <Route
                            path="/notifications"
                            element={<Notifications />}
                          />
                          <Route
                            path="/users/profile/:username"
                            element={<UserProfile />}
                          />
                          <Route path="*" element={<NotFound />} />
                        </Routes>
                      </div>
                    </Suspense>
                    {!hideMobileBottomNav && <MobileBottomNav />}
                  </main>
                </div>
              </SidebarProvider>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

const App = () => {
  useDisableRightClick();
  
  return (
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <PwaInstallPrompt />
          <BrowserRouter>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
};

export default App;

