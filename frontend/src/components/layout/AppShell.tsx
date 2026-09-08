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
      <div className="min-h-screen bg-background">
        <Sidebar />
        <div className="flex min-h-screen flex-col lg:pl-64">
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
