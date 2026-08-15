import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/common/Logo";
import { ScrollPage } from "@/components/layout/ScrollPage";
import { attendanceApi } from "@/services/api";
import { ShieldCheck, XCircle, Loader2 } from "lucide-react";
import { COMPANY_LABELS, PARENT_COMPANY_NAME, type CompanyEntity } from "@/types/domain";

export const Route = createFileRoute("/verify-id/$employeeId")({
  component: VerifyIdCardPage,
});

interface VerificationData {
  verified: boolean;
  name: string;
  employeeCode: string;
  designation?: string;
  department: string;
  companyEntity: CompanyEntity;
  status: string;
}

function VerifyIdCardPage() {
  const { t } = useTranslation();
  // Path param historically named employeeId; it now carries a signed verification token.
  const { employeeId: token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<VerificationData | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    attendanceApi
      .verifyIdCard(decodeURIComponent(token))
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError((err as Error).message || "Verification failed. Invalid ID.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  if (loading) {
    return (
      <ScrollPage center className="bg-background" contentClassName="w-full text-foreground">
        <div className="flex flex-col items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">{t("pages.verify.verifying")}</p>
        </div>
      </ScrollPage>
    );
  }

  if (error || !data) {
    return (
      <ScrollPage center className="bg-background" contentClassName="w-full text-foreground">
        <Card className="w-full max-w-md border-destructive/40 bg-card text-card-foreground shadow-2xl">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <XCircle className="h-16 w-16 text-destructive" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight">{t("pages.verify.failed")}</h1>
            <p className="mt-3 text-sm text-muted-foreground">{t("pages.verify.failedHelp")}</p>
            {error && (
              <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
                {t("pages.verify.errorLabel")}: {error}
              </div>
            )}
            <div className="mt-6 w-full border-t border-border pt-4 text-[10px] uppercase tracking-widest text-muted-foreground">
              {PARENT_COMPANY_NAME} {t("pages.verify.secureVerification")}
            </div>
          </CardContent>
        </Card>
      </ScrollPage>
    );
  }

  const initials = data.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");

  return (
    <ScrollPage center className="bg-background" contentClassName="w-full text-foreground">
      <Card className="relative w-full max-w-md overflow-hidden border-border bg-card text-card-foreground shadow-2xl">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <Logo className="h-6 w-auto" />
          <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
            {t("pages.verify.verifiedActive")}
          </span>
        </div>

        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar className="h-20 w-20 border-2 border-primary/30">
                <AvatarFallback className="bg-primary text-2xl font-semibold text-primary-foreground">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 rounded-full border-2 border-background bg-primary p-1 text-primary-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>

            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{data.name}</h1>
            <p className="text-sm font-medium text-primary">
              {data.designation || t("pages.verify.employee")}
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {t("pages.verify.idPrefix", { code: data.employeeCode })}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 border-t border-border pt-6 text-sm min-[420px]:grid-cols-2">
            <Row label={t("pages.verify.department")} value={data.department} />
            <Row label={t("pages.verify.company")} value={COMPANY_LABELS[data.companyEntity]} />
            <div className="min-[420px]:col-span-2">
              <Row label={t("pages.verify.group")} value={PARENT_COMPANY_NAME} />
            </div>
            <Row
              label={t("pages.verify.status")}
              value={data.status === "ACTIVE" ? t("common.active") : data.status}
            />
          </div>

          <div className="mt-8 flex items-center justify-center gap-2 border-t border-slate-800 pt-5 text-[10px] uppercase tracking-widest text-slate-500">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            {PARENT_COMPANY_NAME} {t("pages.verify.employeeVerification")}
          </div>
        </CardContent>
      </Card>
    </ScrollPage>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-0.5 break-words font-medium text-slate-200">{value}</p>
    </div>
  );
}
