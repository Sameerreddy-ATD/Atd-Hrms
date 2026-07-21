import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/common/Logo";
import { ArrowLeft, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-md border-border shadow-sm">
        <CardContent className="p-6 sm:p-8">
          <Logo className="mb-6 h-9 w-auto" />
          <h1 className="text-lg font-semibold">Password assistance</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Password recovery is managed internally to protect employee accounts.
          </p>
          <div className="mt-6 flex gap-3 rounded-md border bg-muted/30 p-4 text-sm">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p>
              Contact the Developer Admin to reset your password or reactivate a blocked account.
              Never share your current password with anyone.
            </p>
          </div>
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
