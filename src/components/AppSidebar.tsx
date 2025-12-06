import { Home, Search, Compass, Film, Send, Heart, PlusSquare, BarChart3, User, Menu, Grid3x3, ChevronLeft, ChevronRight } from "lucide-react";
import { NavLink } from "@/components/NavLink";
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
import { Button } from "@/components/ui/button";
import { NotificationsDialog } from "@/components/NotificationsDialog";
import { useState } from "react";

const items = [
  { title: "Home", url: "/", icon: Home },
  { title: "Search", url: "/search", icon: Search },
  { title: "Explore", url: "/explore", icon: Compass },
  { title: "Timepass", url: "/timepass", icon: Film },
  { title: "Bakaiti", url: "/bakaiti", icon: Send },
  { title: "Notifications", url: "/notifications", icon: Heart },
  { title: "Create", url: "/create", icon: PlusSquare },
  { title: "Dashboard", url: "/dashboard", icon: BarChart3 },
  { title: "Profile", url: "/profile", icon: User },
];

const bottomItems = [
  { title: "More", url: "/more", icon: Menu },
  { title: "Also from R8", url: "/meta", icon: Grid3x3 },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  return (
    <div className="p-4 h-screen flex items-center relative">
      <Sidebar 
        className={`${isCollapsed ? "w-20" : "w-64"} bg-sidebar border border-border rounded-2xl shadow-lg overflow-hidden transition-all duration-300 ease-out`} 
        collapsible="icon"
      >
        <SidebarContent className="bg-sidebar flex flex-col h-full">
          <SidebarGroup className="flex-shrink-0">
            <div className={`py-6 transition-all duration-300 ease-out ${isCollapsed ? "flex justify-center px-2" : "px-4 flex items-center justify-between"}`}>
              <div className={`flex items-center gap-2 transition-all duration-200 ${isCollapsed ? "opacity-0 w-0 overflow-hidden" : "opacity-100 delay-100"}`}>
                <h1 className="font-['Dancing_Script'] text-2xl whitespace-nowrap">
                  Velle Bazi
                </h1>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleSidebar}
                className={`h-8 w-8 hover:bg-accent transition-all duration-200 flex-shrink-0 ${
                  isCollapsed 
                    ? "rounded-full bg-gradient-to-r from-purple-600 via-pink-500 to-orange-400 hover:opacity-80" 
                    : ""
                }`}
              >
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 text-white" />
                ) : (
                  <ChevronLeft className="h-5 w-5" />
                )}
              </Button>
            </div>
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1">
                {items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      {item.title === "Notifications" ? (
                        <button
                          onClick={() => setIsNotificationsOpen(true)}
                          className={`flex items-center py-3 rounded-lg transition-all duration-200 hover:bg-accent ${
                            isCollapsed ? "justify-center px-0 mx-auto w-12" : "gap-4 mx-2 px-3"
                          }`}
                        >
                          <item.icon className="h-6 w-6 flex-shrink-0" strokeWidth={2} />
                          <span 
                            className={`text-base whitespace-nowrap transition-all duration-200 ${
                              isCollapsed 
                                ? "opacity-0 w-0 overflow-hidden" 
                                : "opacity-100 w-auto delay-75"
                            }`}
                          >
                            {item.title}
                          </span>
                        </button>
                      ) : (
                        <NavLink
                          to={item.url}
                          end
                          className={`flex items-center py-3 rounded-lg transition-all duration-200 hover:bg-accent ${
                            isCollapsed ? "justify-center px-0 mx-auto w-12" : "gap-4 mx-2 px-3"
                          }`}
                          activeClassName="font-bold bg-accent"
                        >
                          <item.icon className="h-6 w-6 flex-shrink-0" strokeWidth={2} />
                          <span 
                            className={`text-base whitespace-nowrap transition-all duration-200 ${
                              isCollapsed 
                                ? "opacity-0 w-0 overflow-hidden" 
                                : "opacity-100 w-auto delay-75"
                            }`}
                          >
                            {item.title}
                          </span>
                        </NavLink>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Bottom Items */}
          <SidebarGroup className="mt-auto flex-shrink-0">
            <SidebarGroupContent>
              <SidebarMenu className="space-y-1 pb-4">
                {bottomItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <NavLink
                        to={item.url}
                        end
                        className={`flex items-center py-3 rounded-lg transition-all duration-200 hover:bg-accent ${
                          isCollapsed ? "justify-center px-0 mx-auto w-12" : "gap-4 mx-2 px-3"
                        }`}
                        activeClassName="font-bold bg-accent"
                      >
                        <item.icon className="h-6 w-6 flex-shrink-0" strokeWidth={2} />
                        <span 
                          className={`text-base whitespace-nowrap transition-all duration-200 ${
                            isCollapsed 
                              ? "opacity-0 w-0 overflow-hidden" 
                              : "opacity-100 w-auto delay-75"
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
      
      <NotificationsDialog 
        open={isNotificationsOpen} 
        onOpenChange={setIsNotificationsOpen} 
      />
    </div>
  );
}
