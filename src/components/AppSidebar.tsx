import { Film, Heart, Home, Menu, MessageCircle, Plus, Search, Settings, User } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useNavBadges } from "@/hooks/useNavBadges";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { title: "Home", url: "/", icon: Home, end: true },
  { title: "Search", url: "/explore", icon: Search },
  { title: "Timepass", url: "/timepass", icon: Film },
  { title: "Bakaiti", url: "/bakaiti", icon: MessageCircle },
  { title: "Notifications", url: "/notifications", icon: Heart },
  { title: "Create", url: "/create", icon: Plus },
] as const;

const iconButtonBase =
  "group relative flex h-11 w-11 items-center justify-center rounded-2xl text-sidebar-foreground/90 transition-all duration-150 hover:scale-[1.04] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground";

export function AppSidebar() {
  const { unreadBakaiti, unreadNotifications } = useNavBadges();
  const { user } = useAuth();

  const getBadgeCount = (title: string) => {
    if (title === "Bakaiti") return unreadBakaiti;
    if (title === "Notifications") return unreadNotifications;
    return 0;
  };

  return (
    <aside className="flex h-screen w-[78px] flex-col justify-between border-r border-sidebar-border/70 bg-sidebar px-3 py-4">
      <div className="space-y-6">
        <div className="flex items-center justify-center">
          <NavLink
            to="/"
            end
            title="Velle Bazi"
            className="flex h-11 w-11 items-center justify-center rounded-2xl text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            activeClassName="bg-sidebar-accent"
          >
            <img src="/logo.png" alt="Velle Bazi" className="h-6 w-6 rounded-md object-cover" />
          </NavLink>
        </div>

        <nav className="flex flex-col items-center gap-2">
          {navItems.map((item) => {
            const badgeCount = getBadgeCount(item.title);
            return (
              <NavLink
                key={item.title}
                to={item.url}
                end={item.end}
                title={item.title}
                className={iconButtonBase}
                activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
              >
                <item.icon className="h-6 w-6" />
                {badgeCount > 0 && (
                  <span
                    className={cn(
                      "absolute -right-1 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white",
                    )}
                  >
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="space-y-2">
        <NavLink
          to="/settings"
          title="Settings"
          className={iconButtonBase}
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
        >
          <Settings className="h-6 w-6" />
        </NavLink>

        <button
          type="button"
          title="More"
          className={cn(iconButtonBase, "cursor-default")}
          aria-label="More"
        >
          <Menu className="h-6 w-6" />
        </button>

        <NavLink
          to="/profile"
          title="Profile"
          className={iconButtonBase}
          activeClassName="bg-sidebar-accent text-sidebar-accent-foreground"
        >
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="h-7 w-7 rounded-full object-cover ring-1 ring-sidebar-border"
            />
          ) : (
            <User className="h-6 w-6" />
          )}
        </NavLink>
      </div>
    </aside>
  );
}

