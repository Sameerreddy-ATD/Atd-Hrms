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

function PortalChoice({
  icon: Icon,
  title,
  help,
  onClick,
}: {
  icon: typeof Briefcase;
  title: string;
  help: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-xl border border-border/80 bg-background/60",
        "px-4 py-3.5 text-left outline-none",
        "transition-[border-color,background-color,box-shadow,transform] duration-[var(--motion-fast)]",
        "hover:border-primary/35 hover:bg-primary/[0.035] hover:shadow-sm",
        "focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/40",
        "active:scale-[0.99]",
      )}
    >
      <span
        className={cn(
          "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
          "bg-primary/10 text-primary",
          "transition-colors duration-[var(--motion-fast)] group-hover:bg-primary/15",
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.95rem] font-semibold tracking-tight text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block text-[0.8rem] font-normal leading-snug text-muted-foreground">
          {help}
        </span>
      </span>
    </button>
  );
}

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
      {/*
        One centered column on every breakpoint. Stretching into a laptop
        two-column grid made the same phone composition look clumsy.
      */}
      <div className="aw-enter mx-auto flex w-full max-w-[24.5rem] flex-col items-stretch">
        <LoginCrewMascot
          mode={crewMode}
          className="login-crew--auth mx-auto mb-3 w-full max-w-[6.75rem] md:mb-4 md:max-w-[7.25rem]"
        />

        <PwaInstallBanner alwaysOffer className="mb-3 w-full md:hidden" />

        <Card className="aw-enter-delayed border-border/70 bg-card/95 shadow-sm backdrop-blur-sm">
          <CardContent className="p-5 sm:p-6">
            {!portal ? (
              <div className="space-y-4">
                <div className="space-y-1 text-center">
                  <h2 className="text-[1.05rem] font-semibold tracking-tight text-foreground">
                    {t("auth.choosePortal")}
                  </h2>
                  <p className="text-[0.8125rem] leading-snug text-muted-foreground">
                    {t("auth.choosePortalHelp")}
                  </p>
                </div>

                <div className="grid gap-2.5">
                  <PortalChoice
                    icon={Briefcase}
                    title={t("auth.portalEmployee")}
                    help={t("auth.portalEmployeeHelp")}
                    onClick={() => choosePortal("employee")}
                  />
                  <PortalChoice
                    icon={Truck}
                    title={t("auth.portalDriver")}
                    help={t("auth.portalDriverHelp")}
                    onClick={() => choosePortal("driver")}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2.5">
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
                  <div className="min-w-0 flex-1 pt-0.5">
                    <h2 className="text-[1.05rem] font-semibold tracking-tight text-foreground">
                      {portal === "driver" ? t("auth.driverSignIn") : t("auth.employeeSignIn")}
                    </h2>
                    <p className="mt-0.5 text-[0.8125rem] leading-snug text-muted-foreground">
                      {portal === "driver"
                        ? t("auth.driverSignInHelp")
                        : t("auth.employeeSignInHelp")}
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="mt-5 space-y-3.5" noValidate>
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

            <p className="mt-5 text-center text-[11px] text-muted-foreground/75">
              {t("login.tagline")}
            </p>
            <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px]">
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
