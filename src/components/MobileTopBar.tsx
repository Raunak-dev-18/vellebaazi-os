import { Camera, Heart, MessageCircle } from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { Button } from "@/components/ui/button";

export function MobileTopBar() {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur md:hidden">
      <Button asChild variant="ghost" size="icon" className="h-9 w-9">
        <NavLink to="/create" aria-label="Create post">
          <Camera className="h-5 w-5" />
        </NavLink>
      </Button>
      <h1 className="font-['Dancing_Script'] text-2xl leading-none">Velle Bazi</h1>
      <div className="flex items-center gap-1">
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <NavLink to="/notifications" aria-label="Notifications">
            <Heart className="h-5 w-5" />
          </NavLink>
        </Button>
        <Button asChild variant="ghost" size="icon" className="h-9 w-9">
          <NavLink to="/bakaiti" aria-label="Messages">
            <MessageCircle className="h-5 w-5" />
          </NavLink>
        </Button>
      </div>
    </header>
  );
}
