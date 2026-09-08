import { NavLink, useNavigate } from "react-router-dom";
import { LogOut, User } from "lucide-react";
import { NAV_ITEMS } from "@/config/nav";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/useAuthStore";
import logo from "@/assets/logo.jpeg";
import { PLATFORM_NAME, VILLAGE_NAME } from "@/data/mock/pools";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogoutFlow } from "@/hooks/useLogoutFlow";
import { LogoutConfirmDialog } from "@/components/shared/LogoutConfirmDialog";

export function Sidebar() {
  const user = useAuthStore((s) => s.user);
  const utilisateur = useAuthStore((s) => s.utilisateur);
  const navigate = useNavigate();
  const { demanderDeconnexion, executerDeconnexion, confirmOpen, setConfirmOpen } = useLogoutFlow();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex">
      <div className="flex items-center gap-3 px-5 py-6">
        <img src={logo} alt="" aria-hidden="true" className="size-10 shrink-0 rounded-full object-cover ring-2 ring-sidebar-primary/40" />
        <div className="min-w-0">
          <p className="truncate font-display text-lg font-bold leading-tight">{PLATFORM_NAME}</p>
          <p className="truncate text-xs text-sidebar-foreground/60">Village de {VILLAGE_NAME}</p>
        </div>
      </div>

      <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto no-scrollbar px-3 pt-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={"end" in item ? item.end : false}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon aria-hidden="true" className="size-4.5 shrink-0" />
                <span aria-current={isActive ? "page" : undefined}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        {user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-sidebar-accent"
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sidebar-primary/20 text-xs font-semibold text-sidebar-primary">
                  {user.name.slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-sidebar-foreground/50">{user.email}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              {utilisateur?.personneUuid && (
                <DropdownMenuItem onClick={() => navigate(`/habitants/${utilisateur.personneUuid}`)}>
                  <User className="mr-2 size-4" />
                  Mon profil
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={demanderDeconnexion}>
                <LogOut className="mr-2 size-4" />
                Se déconnecter
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Hors du DropdownMenu : celui-ci se ferme au clic sur l'item, ce qui
          démonterait la modale avant qu'elle ne s'affiche. */}
      <LogoutConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => void executerDeconnexion()}
      />
    </aside>
  );
}
