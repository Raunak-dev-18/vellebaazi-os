import { Compass, Film, Home, PlusSquare, User } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const items = [
  { to: "/", label: "Home", icon: Home },
  { to: "/explore", label: "Explore", icon: Compass },
  { to: "/create", label: "Create", icon: PlusSquare },
  { to: "/timepass", label: "Reels", icon: Film },
  { to: "/profile", label: "Profile", icon: User },
];

export function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 backdrop-blur md:hidden">
      <ul className="mx-auto flex w-full max-w-md items-center justify-around">
        {items.map((item) => (
          <li key={item.label} className="flex-1">
            <NavLink
              to={item.to}
              end={item.to === "/"}
              className="flex items-center justify-center rounded-lg px-1 py-2 text-muted-foreground transition-colors"
              activeClassName="text-foreground"
              aria-label={item.label}
            >
              <item.icon className="h-5 w-5" />
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
