import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/common/PasswordInput";
import { LoginCrewMascot, type LoginCrewMode } from "@/components/auth/LoginCrewMascot";
import { PwaInstallBanner } from "@/components/layout/PwaInstallBanner";
import { ScrollPage } from "@/components/layout/ScrollPage";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

function looksLikeEmail(value: string) {
  return value.includes("@");
}

function looksLikePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15;
}

export const Route = createFileRoute("/login")({
  head: () => ({
    links: [{ rel: "preload", href: "/login-crew-mascot.png", as: "image", type: "image/png" }],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ loginId?: string; password?: string }>({});
  const [loginError, setLoginError] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const crewMode: LoginCrewMode = useMemo(() => {
    if (!passwordFocused) return "idle";
    if (passwordVisible) return "peeking";
    return "hiding";
  }, [passwordFocused, passwordVisible]);

  useEffect(() => {
    if (authLoading) return;
    if (user?.mustChangePassword) navigate({ to: "/first-login", replace: true });
    else if (user) navigate({ to: "/dashboard", replace: true });
  }, [user, authLoading, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = loginId.trim();
    const errs: typeof errors = {};
    if (!trimmed) errs.loginId = t("auth.loginIdRequired");
    else if (!looksLikeEmail(trimmed) && !looksLikePhone(trimmed)) {
      errs.loginId = t("auth.loginIdInvalid");
    } else if (looksLikeEmail(trimmed) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      errs.loginId = t("auth.loginIdInvalidEmail");
    }
    if (!password) errs.password = t("auth.passwordRequired");
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setLoginError("");
    try {
      const signedIn = await login(trimmed, password);
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
    <ScrollPage center contentClassName="w-full">
      <div className="aw-enter mx-auto flex w-full max-w-md flex-col justify-center space-y-4">
        <LoginCrewMascot
          mode={crewMode}
          className="mx-auto w-full max-w-[7.5rem] sm:max-w-[8.5rem]"
        />

        <PwaInstallBanner alwaysOffer className="w-full" />

        <Card className="aw-enter-delayed border-border/70 bg-card/95 shadow-sm backdrop-blur-sm">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">{t("auth.signIn")}</h2>

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="login-id">{t("auth.loginId")}</Label>
                <Input
                  id="login-id"
                  type="text"
                  autoComplete="username"
                  inputMode="email"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  onFocus={() => setPasswordFocused(false)}
                  placeholder={t("auth.loginIdPlaceholder")}
                  className="h-11 transition-[box-shadow,border-color] duration-[var(--motion-fast)]"
                  aria-invalid={!!errors.loginId}
                />
                {errors.loginId && <p className="text-xs text-destructive">{errors.loginId}</p>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    {t("auth.needHelp")}
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
                  className="h-11"
                  aria-invalid={!!errors.password}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              {loginError && (
                <Alert variant="destructive">
                  <AlertDescription>{loginError}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="h-11 w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t("auth.signIn")}
              </Button>
            </form>

            <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
              {t("login.tagline")}
            </p>
            <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px]">
              <Link
                to="/privacy"
                className="text-muted-foreground hover:text-primary hover:underline"
              >
                {t("auth.privacy")}
              </Link>
              <Link to="/terms" className="text-muted-foreground hover:text-primary hover:underline">
                {t("auth.terms")}
              </Link>
              <Link
                to="/account-deletion"
                className="text-muted-foreground hover:text-primary hover:underline"
              >
                {t("auth.accountDeletion")}
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </ScrollPage>
  );
}
