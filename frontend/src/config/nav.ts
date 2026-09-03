import {
  GitFork,
  LayoutDashboard,
  Newspaper,
  Home,
  Users,
  UsersRound,
} from "lucide-react";

export const NAV_ITEMS = [
  { to: "/", label: "Accueil", icon: Home, end: true },
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/habitants", label: "Habitants", icon: Users },
  { to: "/familles", label: "Ma famille", icon: UsersRound },
  { to: "/arbre", label: "Arbre généalogique", icon: GitFork },
  { to: "/actualites", label: "Actualités", icon: Newspaper },
] as const;
