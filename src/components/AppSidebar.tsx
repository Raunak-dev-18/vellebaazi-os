import {
  ChevronLeft,
  ChevronRight,
  Compass,
  Film,
  Heart,
  Home,
  MessageCircle,
  PlusSquare,
  Settings,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { cn } from "@/lib/utils";
import { useNavBadges } from "@/hooks/useNavBadges";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

const navItems = [
  { title: "Home", url: "/", icon: Home },
  { title: "Explore", url: "/explore", icon: Compass },
  { title: "Timepass", url: "/timepass", icon: Film },
  { title: "Bakaiti", url: "/bakaiti", icon: MessageCircle },
  { title: "Notifications", url: "/notifications", icon: Heart },
  { title: "Create", url: "/create", icon: PlusSquare },
  { title: "Profile", url: "/profile", icon: User },
];

const footerItems = [{ title: "Settings", url: "/settings", icon: Settings }];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const { unreadBakaiti, unreadNotifications } = useNavBadges();
  const isCollapsed = state === "collapsed";

  const getBadgeCount = (title: string) => {
    if (title === "Bakaiti") return unreadBakaiti;
    if (title === "Notifications") return unreadNotifications;
    return 0;
  };

  return (
    <div className="h-screen p-4">
      <Sidebar
        className={`${
          isCollapsed ? "w-20" : "w-64"
        } rounded-2xl border border-sidebar-border bg-sidebar shadow-sm transition-all duration-300`}
        collapsible="icon"
      >
        <SidebarContent className="flex h-full flex-col bg-sidebar">
          <SidebarGroup className="pt-4">
            <div
              className={`${
                isCollapsed
                  ? "flex justify-center px-1"
                  : "flex items-center justify-between px-3"
              } pb-4`}
            >
              <h1
                className={`font-['Dancing_Script'] text-2xl text-sidebar-foreground transition-all ${
                  isCollapsed ? "w-0 overflow-hidden opacity-0" : "opacity-100"
                }`}
              >
                Velle Bazi
              </h1>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className="h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                aria-label="Toggle sidebar"
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
              </Button>
            </div>

            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {navItems.map((item) => {
                  const badgeCount = getBadgeCount(item.title);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild>
                        <NavLink
                          to={item.url}
                          end={item.url === "/"}
                          className={`flex items-center rounded-lg py-3 text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                            isCollapsed
                              ? "mx-auto w-12 justify-center px-0"
                              : "mx-2 gap-3 px-3"
                          }`}
                          activeClassName="bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                        >
                          <span className="relative inline-flex shrink-0">
                            <item.icon className="h-5 w-5 shrink-0" />
                            {badgeCount > 0 && (
                              <span
                                className={cn(
                                  "absolute -right-2 -top-2 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white",
                                  isCollapsed && "-right-1.5 -top-1.5",
                                )}
                              >
                                {badgeCount > 99 ? "99+" : badgeCount}
                              </span>
                            )}
                          </span>
                          <span
                            className={`whitespace-nowrap text-sm transition-all ${
                              isCollapsed
                                ? "w-0 overflow-hidden opacity-0"
                                : "opacity-100"
                            }`}
                          >
                            {item.title}
                          </span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup className="mt-auto pb-4">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {footerItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`flex items-center rounded-lg py-3 text-sidebar-foreground/90 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${
                          isCollapsed
                            ? "mx-auto w-12 justify-center px-0"
                            : "mx-2 gap-3 px-3"
                        }`}
                        activeClassName="bg-sidebar-accent font-semibold text-sidebar-accent-foreground"
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                        <span
                          className={`whitespace-nowrap text-sm transition-all ${
                            isCollapsed
                              ? "w-0 overflow-hidden opacity-0"
                              : "opacity-100"
                          }`}
                        >
                          {item.title}
                        </span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    </div>
  );
}
