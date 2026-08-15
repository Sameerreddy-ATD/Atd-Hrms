import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authApi } from "@/services/api";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!email.trim()) {
      toast.error("Enter your work email");
      return;
    }
    setLoading(true);
    try {
      const result = await authApi.forgotPassword(email.trim());
      setSubmitted(true);
      toast.success(result.message);
    } catch (err) {
      toast.error((err as Error).message || "Unable to submit the request");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="aw-auth-canvas flex min-h-screen items-center justify-center px-4 py-8">
      <Card className="aw-enter w-full max-w-md border-border/70 bg-card/95 shadow-sm backdrop-blur-sm">
        <CardContent className="p-6 sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <Logo variant="mark" className="h-14 w-14" />
            <p className="text-sm font-semibold tracking-tight text-foreground">
              Anytime Workforce
            </p>
          </div>
          <h1 className="text-lg font-semibold">Password assistance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submit your work email. Developer Admin will reset your password from User Logins and
            you will sign in with a temporary password.
          </p>

          {submitted ? (
            <div className="mt-6 space-y-4 rounded-md border bg-muted/30 p-4 text-sm">
              <div className="flex gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                <div>
                  <p className="font-medium">Request recorded</p>
                  <p className="mt-1 text-muted-foreground">
                    If an account exists for that email, Developer Admin has been notified. Contact
                    them if you need the reset urgently.
                  </p>
                </div>
              </div>
              <Button asChild variant="outline" className="w-full">
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Link>
              </Button>
            </div>
          ) : (
            <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">Work email</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="username"
                  inputMode="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@anytimediesel.com"
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Request password reset
              </Button>
              <Button asChild variant="ghost" className="w-full">
                <Link to="/login">
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to sign in
                </Link>
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
