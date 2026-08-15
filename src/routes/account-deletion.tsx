import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/common/Logo";
import { Button } from "@/components/ui/button";

const HR_MAIL =
  "mailto:hrms@anytimediesel.com?subject=Anytime%20Workforce%20account%20deletion%20request";

export const Route = createFileRoute("/account-deletion")({
  head: () => ({
    meta: [{ title: "Account deletion · Anytime Workforce" }],
  }),
  component: AccountDeletionPage,
});

function AccountDeletionPage() {
  return (
    <div className="aw-auth-canvas min-h-[100dvh] px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <article className="mx-auto w-full max-w-2xl space-y-6 rounded-xl border border-border/70 bg-card/95 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-auto w-28" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Request account deletion</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Anytime Workforce · Anytime Diesel · Last updated 12 Aug 2026
            </p>
          </div>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-foreground/90">
          <p>
            Anytime Workforce accounts are created by your employer (HR or Developer Admin). There
            is no public self-registration. To delete your login and associated personal data held
            in the app, submit a deletion request using the steps below.
          </p>
          <h2 className="text-base font-semibold">How to request deletion</h2>
          <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
            <li>
              Prefer contacting your company HR team in writing (email or ticket) and ask them to{" "}
              <strong className="text-foreground">offboard</strong> your Anytime Workforce login.
            </li>
            <li>
              Or email{" "}
              <a className="font-medium text-primary hover:underline" href={HR_MAIL}>
                hrms@anytimediesel.com
              </a>{" "}
              from your work email with subject “Anytime Workforce account deletion request”, your
              full name, and employee code.
            </li>
            <li>
              If you can still sign in, open <strong className="text-foreground">Profile</strong>{" "}
              and use <strong className="text-foreground">Request account deletion</strong> for the
              same instructions inside the app.
            </li>
          </ol>
          <h2 className="text-base font-semibold">What is deleted or retained</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Login access is closed after offboarding (you can no longer sign in).</li>
            <li>
              Face templates and face evidence follow Face Security retention and are removed or
              aged out per company settings.
            </li>
            <li>
              Push notification tokens for your devices are removed when alerts are disabled or the
              account is closed.
            </li>
            <li>
              Attendance, leave, payroll-related, and audit history may be retained as required for
              employer legal and compliance obligations.
            </li>
          </ul>
          <h2 className="text-base font-semibold">Typical timeline</h2>
          <p className="text-muted-foreground">
            HR normally completes offboarding within 7 business days of a verified request. Complex
            cases may take longer when statutory retention must be reviewed.
          </p>
        </section>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button asChild className="w-full sm:w-auto">
            <a href={HR_MAIL}>Email deletion request</a>
          </Button>
          <Button asChild variant="outline" className="w-full sm:w-auto">
            <Link to="/privacy">Privacy policy</Link>
          </Button>
        </div>

        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
          {" · "}
          <Link to="/terms" className="font-medium text-primary hover:underline">
            Terms of use
          </Link>
        </p>
      </article>
    </div>
  );
}
