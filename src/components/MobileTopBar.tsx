import { Camera, Heart, MessageCircle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";
import { useNavBadges } from "@/hooks/useNavBadges";

export function MobileTopBar() {
  const { unreadBakaiti, unreadNotifications } = useNavBadges();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
      <Button asChild variant="ghost" size="icon" className="h-9 w-9">
        <NavLink to="/create" aria-label="Create post">
          <Camera className="h-5 w-5" />
        </NavLink>
      </Button>
      <h1 className="font-['Dancing_Script'] text-2xl leading-none">Velle Bazi</h1>
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" className="relative h-9 w-9">
          <NavLink to="/notifications" aria-label="Notifications" className="relative">
            <Heart className="h-5 w-5" />
            {unreadNotifications > 0 && (
              <span className="absolute -right-2 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
                {unreadNotifications > 99 ? "99+" : unreadNotifications}
              </span>
            )}
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="icon" className="relative h-9 w-9">
          <NavLink to="/bakaiti" aria-label="Messages" className="relative">
            <MessageCircle className="h-5 w-5" />
            {unreadBakaiti > 0 && (
              <span className="absolute -right-2 -top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold leading-none text-white">
                {unreadBakaiti > 99 ? "99+" : unreadBakaiti}
              </span>
            )}
          </NavLink>
        </Button>
      </div>
    </header>
  );
}
