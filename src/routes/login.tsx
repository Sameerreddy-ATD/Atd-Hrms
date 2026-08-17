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
import { ArrowLeft, Briefcase, Loader2, Truck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export type LoginPortal = "employee" | "driver";

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
  validateSearch: (search: Record<string, unknown>): { as?: LoginPortal } => ({
    as: search.as === "employee" || search.as === "driver" ? search.as : undefined,
  }),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { login, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { as: portal } = Route.useSearch();
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

  useEffect(() => {
    setLoginId("");
    setPassword("");
    setErrors({});
    setLoginError("");
    setPasswordFocused(false);
  }, [portal]);

  function choosePortal(next: LoginPortal) {
    void navigate({ to: "/login", search: { as: next } });
  }

  function clearPortal() {
    void navigate({ to: "/login", search: {} });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!portal) return;
    const trimmed = loginId.trim();
    const errs: typeof errors = {};
    if (!trimmed) {
      errs.loginId =
        portal === "driver" ? t("auth.mobileRequired") : t("auth.emailRequired");
    } else if (portal === "employee") {
      if (!looksLikeEmail(trimmed) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        errs.loginId = t("auth.loginIdInvalidEmail");
      }
    } else if (!looksLikePhone(trimmed)) {
      errs.loginId = t("auth.mobileInvalid");
    }
    if (!password) errs.password = t("auth.passwordRequired");
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setLoginError("");
    try {
      const signedIn = await login(trimmed, password, portal);
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
      <div
        className={cn(
          "aw-enter mx-auto w-full",
          "max-w-md",
          "lg:grid lg:max-w-4xl lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-10 xl:gap-14",
        )}
      >
        <div className="mb-4 flex flex-col items-center lg:mb-0 lg:items-center lg:justify-center lg:pr-2">
          <LoginCrewMascot
            mode={crewMode}
            className="mx-auto w-full max-w-[7.5rem] sm:max-w-[8.5rem] lg:max-w-[11rem]"
          />
          <div className="mt-3 hidden text-center lg:mt-5 lg:block">
            <p className="text-xl font-semibold tracking-tight text-foreground">
              {t("app.name")}
            </p>
            <p className="mt-1 max-w-[16rem] text-sm text-muted-foreground">{t("login.tagline")}</p>
          </div>
        </div>

        <div className="w-full space-y-3 sm:space-y-4">
          <PwaInstallBanner alwaysOffer className="w-full lg:hidden" />

          <Card className="aw-enter-delayed border-border/70 bg-card/95 shadow-sm backdrop-blur-sm lg:shadow-md">
            <CardContent className="p-6 sm:p-8 lg:p-9">
              {!portal ? (
                <div className="space-y-5">
                  <div className="space-y-1.5 text-center lg:text-left">
                    <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                      {t("auth.choosePortal")}
                    </h2>
                    <p className="text-sm text-muted-foreground">{t("auth.choosePortalHelp")}</p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-auto justify-start gap-3 px-4 py-4 text-left",
                        "sm:flex-col sm:items-start sm:gap-3 sm:px-5 sm:py-5",
                        "transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)]",
                        "hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-sm",
                        "focus-visible:border-primary/50",
                      )}
                      onClick={() => choosePortal("employee")}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-11 sm:w-11">
                        <Briefcase className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-semibold text-foreground">
                          {t("auth.portalEmployee")}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground sm:mt-1">
                          {t("auth.portalEmployeeHelp")}
                        </span>
                      </span>
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        "h-auto justify-start gap-3 px-4 py-4 text-left",
                        "sm:flex-col sm:items-start sm:gap-3 sm:px-5 sm:py-5",
                        "transition-[border-color,background-color,box-shadow] duration-[var(--motion-fast)]",
                        "hover:border-primary/40 hover:bg-primary/[0.04] hover:shadow-sm",
                        "focus-visible:border-primary/50",
                      )}
                      onClick={() => choosePortal("driver")}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary sm:h-11 sm:w-11">
                        <Truck className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-base font-semibold text-foreground">
                          {t("auth.portalDriver")}
                        </span>
                        <span className="mt-0.5 block text-xs font-normal leading-snug text-muted-foreground sm:mt-1">
                          {t("auth.portalDriverHelp")}
                        </span>
                      </span>
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="mt-0.5 h-9 w-9 shrink-0"
                      onClick={clearPortal}
                      aria-label={t("common.back")}
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
                        {portal === "driver" ? t("auth.driverSignIn") : t("auth.employeeSignIn")}
                      </h2>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {portal === "driver"
                          ? t("auth.driverSignInHelp")
                          : t("auth.employeeSignInHelp")}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
                    <div className="space-y-1.5">
                      <Label htmlFor="login-id">
                        {portal === "driver" ? t("auth.mobile") : t("auth.workEmail")}
                      </Label>
                      <Input
                        id="login-id"
                        type={portal === "driver" ? "tel" : "email"}
                        autoComplete="username"
                        inputMode={portal === "driver" ? "tel" : "email"}
                        value={loginId}
                        onChange={(e) => setLoginId(e.target.value)}
                        onFocus={() => setPasswordFocused(false)}
                        placeholder={
                          portal === "driver"
                            ? t("auth.mobilePlaceholder")
                            : t("auth.emailPlaceholder")
                        }
                        className="h-11 transition-[box-shadow,border-color] duration-[var(--motion-fast)]"
                        aria-invalid={!!errors.loginId}
                      />
                      {errors.loginId && (
                        <p className="text-xs text-destructive">{errors.loginId}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="password">{t("auth.password")}</Label>
                        {portal === "employee" && (
                          <Link
                            to="/forgot-password"
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            {t("auth.needHelp")}
                          </Link>
                        )}
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
                      {errors.password && (
                        <p className="text-xs text-destructive">{errors.password}</p>
                      )}
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
                </>
              )}

              <p className="mt-6 text-center text-[11px] text-muted-foreground/70 lg:hidden">
                {t("login.tagline")}
              </p>
              <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] lg:mt-6">
                <Link
                  to="/privacy"
                  className="text-muted-foreground hover:text-primary hover:underline"
                >
                  {t("auth.privacy")}
                </Link>
                <Link
                  to="/terms"
                  className="text-muted-foreground hover:text-primary hover:underline"
                >
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
      </div>
    </ScrollPage>
  );
}
