import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OfflineBanner } from "@/components/shared/OfflineBanner";

export function AppShell() {
  return (
    <TooltipProvider delayDuration={150}>
      <a
        href="#contenu-principal"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Aller au contenu principal
      </a>
      {/* Le défilement se fait dans le conteneur interne ci-dessous, pas dans
          le document. C'est le seul moyen de masquer l'indicateur de
          défilement sur mobile : Chromium dessine celui du défilement RACINE
          comme une surcouche du compositeur, hors de portée de toute CSS,
          alors qu'un conteneur interne obéit à `.no-scrollbar` (vérifié sur
          Samsung Internet).

          Contrepartie assumée : la barre d'adresse du navigateur ne se
          rétracte plus au défilement, ce comportement natif étant réservé au
          défilement racine. */}
      <div className="h-[100dvh] overflow-hidden bg-background">
        <Sidebar />
        <div className="flex h-full flex-col overflow-y-auto no-scrollbar lg:pl-64">
          <Header />
          <OfflineBanner />
          <main
            id="contenu-principal"
            tabIndex={-1}
            className="flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8 lg:pt-8"
          >
            <Outlet />
          </main>
        </div>
        <BottomNav />
      </div>
    </TooltipProvider>
  );
}
