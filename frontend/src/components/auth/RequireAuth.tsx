import { useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuthStore } from "@/store/useAuthStore";

export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const verifySession = useAuthStore((s) => s.verifySession);
  const location = useLocation();

  // Only re-validate once per mount, and only when there's a token to check —
  // avoids re-checking on every render/navigation within the protected area.
  const [checked, setChecked] = useState(!isAuthenticated);
  const checking = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || checked || checking.current) return;
    checking.current = true;
    void verifySession().finally(() => setChecked(true));
  }, [isAuthenticated, checked, verifySession]);

  if (!isAuthenticated) {
    return <Navigate to="/connexion" state={{ from: location }} replace />;
  }

  if (!checked) return null;

  return children;
}
