import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/common/PasswordInput";
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

function LoginPage() {
  const { login, loginAsRole, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("employee");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const showDemoLogin = import.meta.env.DEV && import.meta.env.VITE_ENABLE_DEMO_LOGIN === "true";

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
    try {
      const signedIn = await login(email, password);
      toast.success("Signed in");
      if (signedIn.mustChangePassword) {
        sessionStorage.setItem("atd.temp.pw", password);
      }
      navigate({ to: signedIn.mustChangePassword ? "/first-login" : "/dashboard" });
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
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        <div className="flex justify-center">
          <Logo className="h-12 w-auto" />
        </div>

        <Card className="border-border shadow-sm">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold text-foreground">Sign in</h2>
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@anytimediesel.local"
                  aria-invalid={!!errors.email}
                />
                {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={!!errors.password}
                />
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign in
              </Button>
            </form>

            {showDemoLogin && (
              <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/40 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Development mode
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Preview the app as any role. This selector is only available during development.
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
                  <Button type="button" variant="outline" onClick={handleDemo} disabled={loading}>
                    Continue as role
                  </Button>
                </div>
              </div>
            )}

            <p className="mt-6 text-center text-xs text-muted-foreground">
              If you forgot your password, contact HR.
            </p>
            <p className="mt-2 text-center text-[10px] text-muted-foreground/60">
              Version 1.0
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
