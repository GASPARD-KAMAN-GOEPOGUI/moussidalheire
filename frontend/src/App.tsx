import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { PageLoader } from "@/components/shared/PageLoader";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { InstallPromptDialog } from "@/components/InstallPrompt";

const Login = lazy(() => import("@/pages/Login"));
const MotDePasseOublie = lazy(() => import("@/pages/MotDePasseOublie"));
const Home = lazy(() => import("@/pages/Home"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const People = lazy(() => import("@/pages/People"));
const PersonProfile = lazy(() => import("@/pages/PersonProfile"));
const PersonForm = lazy(() => import("@/pages/PersonForm"));
const Families = lazy(() => import("@/pages/Families"));
const GenealogyTreePage = lazy(() => import("@/pages/GenealogyTreePage"));
const News = lazy(() => import("@/pages/News"));
const NewsDetail = lazy(() => import("@/pages/NewsDetail"));
const NotFound = lazy(() => import("@/pages/NotFound"));

function App() {
  return (
    <BrowserRouter>
      {/* Hors des routes, et hors du Suspense : la proposition d'installation
          doit exister dès le lancement du site, avant authentification, et ne
          pas dépendre du chargement paresseux de la page affichée. */}
      <InstallPromptDialog />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="connexion" element={<Login />} />
          <Route path="mot-de-passe-oublie" element={<MotDePasseOublie />} />
          <Route
            element={
              <RequireAuth>
                <AppShell />
              </RequireAuth>
            }
          >
            <Route index element={<Home />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="habitants" element={<People />} />
            <Route path="habitants/:id" element={<PersonProfile />} />
            <Route path="habitants/:id/modifier" element={<PersonForm />} />
            <Route path="familles" element={<Families />} />
            <Route path="arbre" element={<GenealogyTreePage />} />
            <Route path="arbre/:personId" element={<GenealogyTreePage />} />
            <Route path="actualites" element={<News />} />
            <Route path="actualites/:id" element={<NewsDetail />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
