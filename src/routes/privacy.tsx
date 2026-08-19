import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/common/Logo";
import { ScrollPage } from "@/components/layout/ScrollPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy · AnyTime Diesel Workforce" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { t } = useTranslation();

  return (
    <ScrollPage>
      <article className="mx-auto w-full max-w-2xl space-y-6 rounded-xl border border-border/70 bg-card/95 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-auto w-28" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("pages.legal.privacyTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("pages.legal.lastUpdated")}</p>
          </div>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-foreground/90">
          <p>
            AnyTime Diesel Workforce is an internal workforce and operations platform operated by Anytime
            Diesel for employees, managers, HR, and company leadership. This policy explains what
            the application collects and why.
          </p>
          <h2 className="text-base font-semibold">{t("pages.legal.privacyDataWeProcess")}</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Account identity: name, work email, role, and login session cookies.</li>
            <li>
              Employment profile: organization unit, branch, contact details, and statutory fields
              required for HR operations (encrypted at rest where configured).
            </li>
            <li>
              Attendance: check-in/out times, GPS coordinates used for branch geofencing, and
              optional face templates/evidence when face verification is enabled by Developer Admin.
            </li>
            <li>
              Operational records: leave, Work Planner tasks, assets, expenses, HR documents,
              announcements, and audit history.
            </li>
            <li>Device push tokens (web push or store app FCM/APNs) when you enable alerts.</li>
          </ul>
          <h2 className="text-base font-semibold">{t("pages.legal.privacyHowWeUse")}</h2>
          <p className="text-muted-foreground">
            Data is used only to run workforce operations: authentication, attendance verification,
            leave and task workflows, asset tracking, notifications, reporting, and security audit.
            Face templates are used for attendance matching when enabled and are not exposed through
            the Employee Integration API.
          </p>
          <h2 className="text-base font-semibold">{t("pages.legal.privacySharing")}</h2>
          <p className="text-muted-foreground">
            Data stays within Anytime Diesel systems and authorized processors (hosting, backups).
            We do not sell personal data. Role-based access controls which colleagues can see your
            records.
          </p>
          <h2 className="text-base font-semibold">{t("pages.legal.privacyRetention")}</h2>
          <p className="text-muted-foreground">
            Employment history may be retained for company compliance after offboarding. Face
            evidence follows the Face Security retention settings. To end access and request
            deletion of your login and associated personal app data, follow{" "}
            <Link to="/account-deletion" className="font-medium text-primary hover:underline">
              {t("pages.legal.accountDeletion")}
            </Link>
            . HR or Developer Admin completes offboarding after a verified request. Contact HR for
            other privacy questions about your employee record.
          </p>
          <h2 className="text-base font-semibold">{t("pages.legal.privacyMobilePermissions")}</h2>
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
          <h2 className="text-base font-semibold">{t("pages.legal.privacyContact")}</h2>
          <p className="text-muted-foreground">
            Questions about this policy: your HR team or the Developer Admin for AnyTime Diesel Workforce.
            Production site:{" "}
            <a
              className="font-medium text-primary hover:underline"
              href="https://hrms.anytime-diesel.com"
            >
              hrms.anytime-diesel.com
            </a>
            .
          </p>
        </section>

        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("pages.legal.backToSignIn")}
          </Link>
          {" · "}
          <Link to="/terms" className="font-medium text-primary hover:underline">
            {t("pages.legal.terms")}
          </Link>
          {" · "}
          <Link to="/account-deletion" className="font-medium text-primary hover:underline">
            {t("pages.legal.accountDeletion")}
          </Link>
        </p>
      </article>
    </ScrollPage>
  );
}
