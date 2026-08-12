import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/common/Logo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy · Anytime Workforce" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <div className="aw-auth-canvas min-h-[100dvh] px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
      <article className="mx-auto w-full max-w-2xl space-y-6 rounded-xl border border-border/70 bg-card/95 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-auto w-28" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Privacy Policy</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Anytime Workforce · Anytime Diesel · Last updated 12 Aug 2026
            </p>
          </div>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-foreground/90">
          <p>
            Anytime Workforce is an internal workforce and operations platform operated by Anytime
            Diesel for employees, managers, HR, and company leadership. This policy explains what
            the application collects and why.
          </p>
          <h2 className="text-base font-semibold">Data we process</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Account identity: name, work email, role, and login session cookies.</li>
            <li>
              Employment profile: organization unit, branch, contact details, and statutory fields
              required for HR operations (encrypted at rest where configured).
            </li>
            <li>
              Attendance: check-in/out times, GPS coordinates used for branch geofencing, and optional
              face templates/evidence when face verification is enabled by Developer Admin.
            </li>
            <li>
              Operational records: leave, Work Planner tasks, assets, expenses, HR documents,
              announcements, and audit history.
            </li>
            <li>
              Device push tokens (web push or store app FCM/APNs) when you enable alerts.
            </li>
          </ul>
          <h2 className="text-base font-semibold">How we use data</h2>
          <p className="text-muted-foreground">
            Data is used only to run workforce operations: authentication, attendance verification,
            leave and task workflows, asset tracking, notifications, reporting, and security audit.
            Face templates are used for attendance matching when enabled and are not exposed through
            the Employee Integration API.
          </p>
          <h2 className="text-base font-semibold">Sharing</h2>
          <p className="text-muted-foreground">
            Data stays within Anytime Diesel systems and authorized processors (hosting, backups). We
            do not sell personal data. Role-based access controls which colleagues can see your
            records.
          </p>
          <h2 className="text-base font-semibold">Retention and account deletion</h2>
          <p className="text-muted-foreground">
            Employment history may be retained for company compliance after offboarding. Face evidence
            follows the Face Security retention settings. To end access and request deletion of your
            login and associated personal app data, follow{" "}
            <Link to="/account-deletion" className="font-medium text-primary hover:underline">
              Account deletion
            </Link>
            . HR or Developer Admin completes offboarding after a verified request. Contact HR for
            other privacy questions about your employee record.
          </p>
          <h2 className="text-base font-semibold">Permissions used on mobile</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              <strong className="text-foreground">Precise location (while using the app)</strong> —
              attendance check-in and check-out against your branch. We do not use background
              location.
            </li>
            <li>
              <strong className="text-foreground">Camera</strong> — face registration and check-in
              only when Developer Admin enables face verification.
            </li>
            <li>
              <strong className="text-foreground">Notifications</strong> — optional leave, task, and
              company alerts (Web Push or store FCM/APNs).
            </li>
          </ul>
          <h2 className="text-base font-semibold">Contact</h2>
          <p className="text-muted-foreground">
            Questions about this policy: your HR team or the Developer Admin for Anytime Workforce.
            Production site:{" "}
            <a className="font-medium text-primary hover:underline" href="https://hrms.anytime-diesel.com">
              hrms.anytime-diesel.com
            </a>
            .
          </p>
        </section>

        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            Back to sign in
          </Link>
          {" · "}
          <Link to="/terms" className="font-medium text-primary hover:underline">
            Terms of use
          </Link>
          {" · "}
          <Link to="/account-deletion" className="font-medium text-primary hover:underline">
            Account deletion
          </Link>
        </p>
      </article>
    </div>
  );
}
