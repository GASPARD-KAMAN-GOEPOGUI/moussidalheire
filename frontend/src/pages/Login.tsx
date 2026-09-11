import { useEffect, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CheckCircle2, Eye, EyeOff, LogIn, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Typewriter } from "@/components/auth/Typewriter";
import { NewMemberDialog } from "@/components/auth/NewMemberDialog";
import { useAuthStore } from "@/store/useAuthStore";
import { ApiError } from "@/lib/api-client";
import { PLATFORM_NAME, VILLAGE_NAME } from "@/data/mock/pools";
import villageImg from "@/assets/imageVillage.jpeg";
import logo from "@/assets/logo.jpeg";

type Stage = "image" | "form" | "split" | "typewriter" | "description";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const login = useAuthStore((s) => s.login);
  const prefersReducedMotion = useReducedMotion();

  const [stage, setStage] = useState<Stage>(prefersReducedMotion ? "description" : "image");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  // Posé par la page de réinitialisation du mot de passe au moment de rediriger ici.
  const messageSucces = (location.state as { messageSucces?: string } | null)?.messageSucces;
  const [submitting, setSubmitting] = useState(false);
  const [showNewMember, setShowNewMember] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) return;
    const timers = [
      setTimeout(() => setStage("form"), 900),
      setTimeout(() => setStage("split"), 1850),
      setTimeout(() => setStage("typewriter"), 3050),
    ];
    return () => timers.forEach(clearTimeout);
  }, [prefersReducedMotion]);

  const split = stage === "split" || stage === "typewriter" || stage === "description";
  const showForm = stage !== "image";
  const showText = stage === "typewriter" || stage === "description";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Veuillez renseigner un identifiant et un mot de passe.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const from = (location.state as { from?: Location })?.from?.pathname ?? "/";
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError(err.message);
      } else {
        setError("Impossible de se connecter pour le moment. Réessayez.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] w-full flex-col items-center justify-center overflow-hidden bg-neutral-950 lg:flex-row">
      {/* Image / branding panel */}
      <motion.div
        layout
        transition={{ duration: 1, ease: EASE }}
        className={
          split
            ? "relative h-[42vh] w-full overflow-hidden lg:h-[100dvh] lg:w-1/2"
            : "relative mx-auto h-[52vh] w-[92%] max-w-xl overflow-hidden rounded-3xl mt-8 lg:mt-0 lg:h-[70vh]"
        }
      >
        <motion.img
          src={villageImg}
          alt=""
          aria-hidden="true"
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 1.18 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.3, ease: EASE }}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/10 via-transparent to-black/40" />

        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-3 p-6 sm:p-10 lg:p-12">
          <div className="flex items-center gap-2 text-white/70">
            <img src={logo} alt="" aria-hidden="true" className="size-8 rounded-full object-cover ring-1 ring-white/30" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em]">Village de {VILLAGE_NAME}</span>
          </div>

          <AnimatePresence>
            {showText && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <h1 className="font-display text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl">
                  <Typewriter text={PLATFORM_NAME} startDelay={150} onDone={() => setStage("description")} />
                </h1>
                <AnimatePresence>
                  {stage === "description" && (
                    <motion.p
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 1.4, ease: EASE }}
                      className="mt-4 max-w-md text-balance text-sm text-white/80 sm:text-base"
                    >
                      La mémoire vivante du village : recensement des habitants, arbre généalogique,
                      familles et actualités réunis en un seul endroit, pour ne jamais perdre le fil
                      de nos origines.
                    </motion.p>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Login form panel */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            layout
            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.82, y: 56 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.9, ease: EASE }}
            className={
              split
                ? "relative z-10 flex w-full items-center justify-center px-6 py-10 lg:h-[100dvh] lg:w-1/2 lg:px-12"
                : "relative z-10 -mt-16 w-[92%] max-w-md px-0 sm:-mt-20"
            }
          >
            <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-card/95 p-6 shadow-2xl backdrop-blur sm:p-8">
              <div className="mb-6 space-y-1 text-center lg:text-left">
                <p className="flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary lg:justify-start">
                  <Sparkles className="size-3.5" />
                  Espace membres
                </p>
                <h2 className="font-display text-xl font-bold text-foreground">Connexion</h2>
                <p className="text-sm text-muted-foreground">
                  Accédez au recensement, à l'arbre généalogique et aux actualités du village.
                </p>
              </div>

              {messageSucces && (
                <p
                  role="status"
                  className="mb-4 flex gap-2 rounded-lg border border-emerald-600/30 bg-emerald-600/10 p-3 text-sm text-emerald-800 dark:text-emerald-400"
                >
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{messageSucces}</span>
                </p>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Identifiant, e-mail, matricule ou téléphone</Label>
                  <Input
                    id="login-email"
                    type="text"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setError("");
                    }}
                    placeholder="vous@moussidalheire.gn, MSD-000001…"
                  />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor="login-password">Mot de passe</Label>
                    {/* L'identifiant déjà saisi suit sur la page de réinitialisation. */}
                    <Link
                      to="/mot-de-passe-oublie"
                      state={{ identifiant: email.trim() }}
                      className="text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                    >
                      Mot de passe oublié ?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setError("");
                      }}
                      placeholder="••••••••"
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  <LogIn />
                  {submitting ? "Connexion…" : "Se connecter"}
                </Button>

                <button
                  type="button"
                  onClick={() => setShowNewMember(true)}
                  className="w-full text-center text-xs text-muted-foreground underline-offset-2 hover:text-primary hover:underline"
                >
                  Nouveau membre
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NewMemberDialog open={showNewMember} onOpenChange={setShowNewMember} />
    </div>
  );
}
