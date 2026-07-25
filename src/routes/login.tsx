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
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/types/domain";
import { Briefcase, Loader2, ShieldCheck, Users } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

const WORKSPACE_GUIDE: { role: Role; blurb: string }[] = [
  { role: "employee", blurb: "Attendance, leave, tasks, and company updates" },
  { role: "manager", blurb: "Team attendance, leave approvals, and planner" },
  { role: "hr", blurb: "People, leave tracking, holidays, and announcements" },
  { role: "ceo", blurb: "Company workforce and attendance overview" },
  { role: "main_admin", blurb: "Operations, branches, and system health" },
  { role: "developer_admin", blurb: "Accounts, face security, and settings" },
];

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
    if (!passwordFocused && password.length === 0) return "idle";
    if (passwordVisible) return "peeking";
    return "hiding";
  }, [password, passwordFocused, passwordVisible]);

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
    <div className="flex min-h-[100dvh] items-center justify-center bg-gradient-to-b from-muted/50 via-background to-background px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-stretch">
        <section className="hidden rounded-2xl border border-border/80 bg-card p-6 shadow-sm lg:flex lg:flex-col lg:justify-between lg:p-8">
          <div>
            <Logo className="h-auto w-40" />
            <h1 className="mt-8 text-2xl font-semibold tracking-tight text-foreground">
              Anytime Diesel Employees
            </h1>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              One secure sign-in for every role. After login, your dashboard and menu show only the
              tools assigned to your account.
            </p>
            <div className="mt-6 grid gap-2.5">
              {WORKSPACE_GUIDE.map((item) => (
                <div
                  key={item.role}
                  className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 px-3.5 py-3"
                >
                  <span className="mt-0.5 rounded-lg bg-primary/10 p-1.5 text-primary">
                    {item.role === "developer_admin" || item.role === "main_admin" ? (
                      <ShieldCheck className="h-4 w-4" />
                    ) : item.role === "hr" || item.role === "ceo" ? (
                      <Briefcase className="h-4 w-4" />
                    ) : (
                      <Users className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{ROLE_LABELS[item.role]}</p>
                    <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{item.blurb}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-8 text-xs text-muted-foreground">
            Accounts are created by Developer Admin. Public signup is disabled.
          </p>
        </section>

        <div className="mx-auto flex w-full max-w-md flex-col justify-center space-y-5 lg:mx-0 lg:max-w-none">
          <div className="flex justify-center overflow-hidden lg:hidden">
            <Logo className="h-auto w-36 sm:w-40" />
          </div>

          <LoginCrewMascot mode={crewMode} className="mx-auto w-full max-w-xs" />

          <Card className="border-border/80 shadow-sm">
            <CardContent className="p-6 sm:p-8">
              <h2 className="text-lg font-semibold tracking-tight text-foreground">Sign in</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Use the work email and password issued by your administrator. Your role opens
                automatically after sign-in.
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
                    aria-invalid={!!errors.password}
                  />
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                </div>
                {loginError && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{loginError}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in to workspace
                </Button>
              </form>

              <div className="mt-6 rounded-xl border border-dashed border-border/80 bg-muted/25 p-3.5 text-xs leading-5 text-muted-foreground lg:hidden">
                After sign-in you land on a role-specific dashboard with quick links for attendance,
                leave, people, or system tools.
              </div>

              <p className="mt-6 text-center text-[11px] text-muted-foreground/70">Version 1.0</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
