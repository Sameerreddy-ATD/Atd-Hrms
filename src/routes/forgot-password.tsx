import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/common/Logo";
import { authApi } from "@/services/api";
import { ArrowLeft, Loader2 } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Enter a valid email");
      return;
    }
    setLoading(true);
    await authApi.forgotPassword(email);
    setLoading(false);
    setSent(true);
    toast.success("If the account exists, a reset link has been sent.");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <Logo className="mb-6 h-9 w-auto" />
          <h1 className="text-lg font-semibold">Reset your password</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter your work email. HR will receive a request notification if the account is locked.
          </p>
          {sent ? (
            <div className="mt-6 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
              A password reset link has been sent to <b>{email}</b> if that account exists. Please
              check your inbox.
            </div>
          ) : (
            <form onSubmit={submit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@anytimediesel.local"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          )}
          <Link
            to="/login"
            className="mt-6 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-3 w-3" /> Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
