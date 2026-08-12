import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/common/PasswordInput";
import { Logo } from "@/components/common/Logo";
import { LoginCrewMascot, type LoginCrewMode } from "@/components/auth/LoginCrewMascot";
import { PwaInstallBanner } from "@/components/layout/PwaInstallBanner";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/login")({
  head: () => ({
    links: [
      { rel: "preload", href: "/login-crew-mascot.png", as: "image", type: "image/png" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [loginError, setLoginError] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const crewMode: LoginCrewMode = useMemo(() => {
    if (!passwordFocused) return "idle";
    if (passwordVisible) return "peeking";
    return "hiding";
  }, [passwordFocused, passwordVisible]);

  useEffect(() => {
    if (user?.mustChangePassword) navigate({ to: "/first-login", replace: true });
    else if (user) navigate({ to: "/dashboard", replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!email) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = "Enter a valid email";
    if (!password) errs.password = "Password is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setLoginError("");
    try {
      const signedIn = await login(email, password);
      toast.success(`Welcome${signedIn.name ? `, ${signedIn.name.split(" ")[0]}` : ""}`);
      navigate({ to: signedIn.mustChangePassword ? "/first-login" : "/dashboard" });
    } catch (err) {
      const message = (err as Error).message || "Login failed";
      setLoginError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="aw-auth-canvas flex min-h-[100dvh] items-center justify-center px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="aw-enter mx-auto flex w-full max-w-md flex-col justify-center space-y-5">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-auto w-36 sm:w-40" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">
              Anytime Workforce
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Workforce and operations platform
            </p>
          </div>
        </div>

        <LoginCrewMascot mode={crewMode} className="mx-auto w-full max-w-[11rem] sm:max-w-[12.5rem]" />

        <PwaInstallBanner alwaysOffer className="w-full" />

        <Card className="aw-enter-delayed border-border/70 bg-card/95 shadow-sm backdrop-blur-sm">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Use the work email and password issued by your administrator.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setPasswordFocused(false)}
                  placeholder="name@anytimediesel.com"
                  className="h-11 transition-[box-shadow,border-color] duration-[var(--motion-fast)]"
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Need help?
                  </Link>
                </div>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                  onVisibilityChange={setPasswordVisible}
                  className="h-11 transition-[box-shadow,border-color] duration-[var(--motion-fast)]"
                  aria-invalid={!!errors.password}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>
              {loginError && (
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>

            <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
              Anytime Diesel · Anytime Workforce
            </p>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px]">
              <Link to="/privacy" className="text-muted-foreground hover:text-primary hover:underline">
                Privacy
              </Link>
              <Link to="/terms" className="text-muted-foreground hover:text-primary hover:underline">
                Terms
              </Link>
              <Link
                to="/account-deletion"
                className="text-muted-foreground hover:text-primary hover:underline"
              >
                Account deletion
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
