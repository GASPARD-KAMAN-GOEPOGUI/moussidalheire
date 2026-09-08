import { useState } from "react";
import { NavLink } from "react-router-dom";
import { GitFork, Home, LogOut, MoreHorizontal, Newspaper, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { NAV_ITEMS } from "@/config/nav";
import { useAuthStore } from "@/store/useAuthStore";
import { useLogoutFlow } from "@/hooks/useLogoutFlow";
import { LogoutConfirmDialog } from "@/components/shared/LogoutConfirmDialog";
import { cn } from "@/lib/utils";

const PRIMARY_ITEMS = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/habitants", label: "Habitants", icon: Users },
  { to: "/arbre", label: "Arbre", icon: GitFork },
  { to: "/actualites", label: "Actus", icon: Newspaper },
] as const;

const MORE_ITEMS = NAV_ITEMS.filter(
  (item) => !PRIMARY_ITEMS.some((p) => p.to === item.to),
);

export function BottomNav() {
  const [moreOpen, setMoreOpen] = useState(false);
  const user = useAuthStore((s) => s.user);
  const { demanderDeconnexion, executerDeconnexion, confirmOpen, setConfirmOpen } = useLogoutFlow();

  const itemClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium transition-colors",
      isActive ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <>
      <nav
        aria-label="Navigation principale"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch justify-between gap-1 px-2 py-1.5">
          {PRIMARY_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={"end" in item ? item.end : false} className={itemClass}>
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full transition-colors",
                      isActive && "bg-primary/10",
                    )}
                  >
                    <item.icon aria-hidden="true" className="size-5" />
                  </span>
                  <span aria-current={isActive ? "page" : undefined}>{item.label}</span>
                </>
              )}
            </NavLink>
          ))}

          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            aria-haspopup="dialog"
            aria-expanded={moreOpen}
          >
            <span className="flex size-9 items-center justify-center rounded-full">
              <MoreHorizontal aria-hidden="true" className="size-5" />
            </span>
            Plus
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl p-0 lg:hidden">
          <SheetHeader className="border-b border-border p-5 text-left">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-3 gap-2 p-4">
            {MORE_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                className={({ isActive }) =>
                  cn(
                    "flex flex-col items-center gap-2 rounded-xl border border-border p-4 text-xs font-medium transition-colors",
                    isActive ? "border-primary/40 bg-primary/5 text-primary" : "text-foreground hover:bg-muted",
                  )
                }
              >
                <item.icon aria-hidden="true" className="size-5" />
                {item.label}
              </NavLink>
            ))}
          </div>

          {user && (
            <div className="flex items-center gap-3 border-t border-border p-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {user.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              </div>
              <button
                onClick={() => {
                  setMoreOpen(false);
                  demanderDeconnexion();
                }}
                aria-label="Se déconnecter"
                className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Hors du Sheet, qui se referme au clic sur « Se déconnecter » et
          démonterait la modale avec lui. */}
      <LogoutConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void executerDeconnexion()}
      />
    </>
  );
}
