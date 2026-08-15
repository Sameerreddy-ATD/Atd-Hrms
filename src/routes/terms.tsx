import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Logo } from "@/components/common/Logo";
import { ScrollPage } from "@/components/layout/ScrollPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms of Use · Anytime Workforce" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  const { t } = useTranslation();

  return (
    <ScrollPage>
      <article className="mx-auto w-full max-w-2xl space-y-6 rounded-xl border border-border/70 bg-card/95 p-6 shadow-sm sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-auto w-28" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("pages.legal.termsTitle")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t("pages.legal.lastUpdated")}</p>
          </div>
        </div>

        <section className="space-y-3 text-sm leading-relaxed text-foreground/90">
          <p>
            Anytime Workforce is provided for authorized Anytime Diesel employees and contractors.
            Access requires a company-issued login. There is no public self-registration.
          </p>
          <h2 className="text-base font-semibold">{t("pages.legal.termsAcceptableUse")}</h2>
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Use the app only for legitimate work duties assigned to your role.</li>
            <li>
              Do not share passwords, attempt to access another person's account, or bypass face,
              location, or security controls.
            </li>
            <li>
              Submit accurate attendance, leave, expense, and task information. False punches or
              spoofed location/face data may result in disciplinary action.
            </li>
          </ul>
          <h2 className="text-base font-semibold">{t("pages.legal.termsDevicePermissions")}</h2>
          <p className="text-muted-foreground">
            Camera and precise location are requested for face registration/check-in and branch
            geofencing when required by company policy. Notifications are optional and can be
            disabled in the app or device settings.
          </p>
          <h2 className="text-base font-semibold">{t("pages.legal.termsEndingAccess")}</h2>
          <p className="text-muted-foreground">
            When employment ends, HR or Developer Admin offboards the account, which closes login
            access while retaining operational history as required by the company. You may also
            request deletion via{" "}
            <Link to="/account-deletion" className="font-medium text-primary hover:underline">
              {t("pages.legal.accountDeletion")}
            </Link>
            .
          </p>
          <h2 className="text-base font-semibold">{t("pages.legal.termsAvailability")}</h2>
          <p className="text-muted-foreground">
            The service may be updated, paused for maintenance, or changed as company operations
            require. Store apps load the live company deployment and therefore follow the same
            availability as the web product.
          </p>
        </section>

        <p className="text-center text-sm">
          <Link to="/login" className="font-medium text-primary hover:underline">
            {t("pages.legal.backToSignIn")}
          </Link>
          {" · "}
          <Link to="/privacy" className="font-medium text-primary hover:underline">
            {t("pages.legal.privacy")}
          </Link>
        </p>
      </article>
    </ScrollPage>
  );
}
