import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, type Role } from "@/mock/types";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

// ⚠️ DEMO MODE BLOCK
// The "Continue as role" selector below is a mock-mode convenience only.
// Remove this entire section (and `loginAsRole` from AuthContext) before
// wiring the real backend. Employees cannot self-register — logins are
// created by Developer Admin, Main Admin or HR.
function LoginPage() {
  const { login, loginAsRole, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  useEffect(() => {
    if (user) navigate({ to: "/app/dashboard", replace: true });
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!email) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errs.email = "Enter a valid email";
    if (!password) errs.password = "Password is required";
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      await login(email, password);
      toast.success("Signed in");
      navigate({ to: "/app/dashboard" });
    } catch (err) {
      toast.error((err as Error).message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemo() {
    setLoading(true);
    try {
      await loginAsRole(role);
      toast.success(`Signed in as ${ROLE_LABELS[role]}`);
      navigate({ to: "/app/dashboard" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-8 px-4 py-8 lg:grid-cols-2 lg:gap-12">
        {/* Brand panel */}
        <div className="hidden flex-col justify-between rounded-2xl border border-border bg-card p-10 lg:flex">
          <Logo className="h-10 w-auto" />
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              AnytimeDiesel HRMS
            </h1>
            <p className="mt-3 max-w-md text-sm text-muted-foreground">
              Manage attendance, leave, biometric devices, branches and field
              staff across the organization in one place.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
              <li>• Thumb scanner &amp; branch-wise attendance</li>
              <li>• Field GPS check-in for sales, drivers and field staff</li>
              <li>• Role-based dashboards for HR, Managers and CEO</li>
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Internal use only. Unauthorized access is prohibited.
          </p>
        </div>

        {/* Login form */}
        <Card className="border-border shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <div className="mb-6 flex flex-col items-start gap-2 lg:hidden">
              <Logo className="h-9 w-auto" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">Sign in</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Enter the credentials issued by your HR or admin.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate>
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@anytimediesel.local"
                  aria-invalid={!!errors.email}
                />
                {errors.email && (
                  <p className="text-xs text-destructive">{errors.email}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                />
                {errors.password && (
                  <p className="text-xs text-destructive">{errors.password}</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>

            {/* ⚠️ DEMO ONLY — remove before backend integration */}
            <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Demo mode
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Preview the app as any role. This selector will be removed once
                the real authentication backend is connected.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([r, l]) => (
                      <SelectItem key={r} value={r}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDemo}
                  disabled={loading}
                >
                  Continue as role
                </Button>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Accounts are provisioned by HR or Admin. Public sign-up is
              disabled.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}