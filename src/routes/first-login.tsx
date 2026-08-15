import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/common/PasswordInput";
import { LoginCrewMascot, type LoginCrewMode } from "@/components/auth/LoginCrewMascot";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/first-login")({
  component: FirstLoginPage,
});

function FirstLoginPage() {
  const navigate = useNavigate();
  const { changePassword } = useAuth();
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  const rules = [
    { label: "At least 8 characters", ok: next.length >= 8 },
    { label: "Contains a number", ok: /\d/.test(next) },
    { label: "Contains uppercase letter", ok: /[A-Z]/.test(next) },
    { label: "Matches confirmation", ok: next.length > 0 && next === confirm },
  ];

  const crewMode: LoginCrewMode = useMemo(() => {
    // Eyes close only while a password field is focused; open again on outside tap/click.
    if (!passwordFocused) return "idle";
    if (passwordVisible) return "peeking";
    return "hiding";
  }, [passwordFocused, passwordVisible]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rules.some((r) => !r.ok)) {
      toast.error("Please meet all password requirements");
      return;
    }
    setLoading(true);
    try {
      await changePassword("", next);
      toast.success("Password updated. You are signed in.");
      navigate({ to: "/dashboard", replace: true });
    } catch (err) {
      toast.error((err as Error).message || "Unable to update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="aw-auth-canvas flex min-h-[100dvh] items-center justify-center px-4 py-8 pb-[max(2rem,var(--atd-sab))] pt-[max(2rem,var(--atd-sat))]">
      <div className="aw-enter w-full max-w-md space-y-4">
        <LoginCrewMascot
          mode={crewMode}
          className="mx-auto w-full max-w-[7.5rem] sm:max-w-[8.5rem]"
        />
        <Card className="aw-enter-delayed border-border/70 bg-card/95 shadow-sm backdrop-blur-sm">
          <CardContent className="p-6 sm:p-8">
            <h2 className="text-lg font-semibold">Set a new password</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              For security, you must change the temporary password issued to you before continuing.
            </p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div
                className="space-y-4"
                onFocusCapture={() => setPasswordFocused(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setPasswordFocused(false);
                  }
                }}
              >
                <div className="space-y-1.5">
                  <Label htmlFor="new">New password</Label>
                  <PasswordInput
                    id="new"
                    autoComplete="new-password"
                    value={next}
                    onChange={(e) => setNext(e.target.value)}
                    onVisibilityChange={setPasswordVisible}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <PasswordInput
                    id="confirm"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    onVisibilityChange={setPasswordVisible}
                  />
                </div>
              </div>
              <ul className="space-y-1 text-xs">
                {rules.map((r) => (
                  <li
                    key={r.label}
                    className={
                      r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                    }
                  >
                    {r.ok ? "✓" : "○"} {r.label}
                  </li>
                ))}
              </ul>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Update password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
