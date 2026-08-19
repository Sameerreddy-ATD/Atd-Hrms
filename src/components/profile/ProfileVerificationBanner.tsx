import { ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function ProfileVerificationBanner({
  onVerify,
  className,
}: {
  onVerify: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();

  if (!user?.employeeId || user.profileVerified) return null;

  return (
    <div
      className={cn(
        "mb-5 w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-amber-300/60 bg-gradient-to-br from-amber-50/90 via-card to-card shadow-sm dark:border-amber-700/50 dark:from-amber-950/30",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-5">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white sm:h-14 sm:w-14">
            <ShieldCheck className="h-6 w-6 sm:h-7 sm:w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {t("pages.profileVerification.bannerTitle")}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("pages.profileVerification.bannerSubtitle")}
            </p>
          </div>
        </div>
        <Button type="button" className="w-full shrink-0 sm:w-auto" onClick={onVerify}>
          {t("pages.profileVerification.bannerAction")}
        </Button>
      </div>
    </div>
  );
}
