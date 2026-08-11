import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/common/Logo";
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
  companyPhone?: string;
  status: string;
}

function VerifyIdCardPage() {
  const { employeeId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<VerificationData | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    attendanceApi
      .verifyIdCard(employeeId)
      .then((res) => {
        setData(res);
      })
      .catch((err) => {
        setError((err as Error).message || "Verification failed. Invalid ID.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [employeeId]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="mt-4 text-sm text-muted-foreground">Verifying employee credentials...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
        <Card className="w-full max-w-md border-destructive/40 bg-card text-card-foreground shadow-2xl">
          <CardContent className="flex flex-col items-center p-8 text-center">
            <XCircle className="h-16 w-16 text-destructive" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight">Verification Failed</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              The Employee ID card scanned could not be verified. It may be inactive or invalid.
            </p>
            {error && (
              <div className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-xs font-mono text-destructive">
                Error: {error}
              </div>
            )}
            <div className="mt-6 border-t border-border pt-4 w-full text-[10px] text-muted-foreground uppercase tracking-widest">
              {PARENT_COMPANY_NAME} Secure Verification
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const initials = data.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 text-foreground">
      <Card className="w-full max-w-md border-border bg-card text-card-foreground shadow-2xl overflow-hidden relative">
        {/* Decorative background pulse */}
        <div className="absolute top-0 right-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />

        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-6 py-4">
          <Logo className="h-6 w-auto" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
            Verified Active
          </span>
        </div>

        <CardContent className="p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="relative">
              <Avatar className="h-20 w-20 border-2 border-primary/30">
                <AvatarFallback className="bg-primary text-primary-foreground text-2xl font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 bg-primary text-primary-foreground rounded-full p-1 border-2 border-background">
                <ShieldCheck className="h-4 w-4" />
              </div>
            </div>

            <h1 className="mt-4 text-2xl font-bold tracking-tight text-foreground">{data.name}</h1>
            <p className="text-sm font-medium text-primary">{data.designation || "Employee"}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">ID: {data.employeeCode}</p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-4 border-t border-border pt-6 text-sm min-[420px]:grid-cols-2">
            <Row label="Department" value={data.department} />
            <Row label="Company" value={COMPANY_LABELS[data.companyEntity]} />
            <div className="min-[420px]:col-span-2">
              <Row label="Group" value={PARENT_COMPANY_NAME} />
            </div>
            {data.companyPhone && <Row label="Company phone" value={data.companyPhone} />}
            <Row label="Status" value={data.status === "ACTIVE" ? "Active" : data.status} />
          </div>

          <div className="mt-8 border-t border-slate-800 pt-5 flex items-center justify-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest">
            <ShieldCheck className="h-3 w-3 text-emerald-500" />
            {PARENT_COMPANY_NAME} Employee Verification
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">{label}</p>
      <p className="mt-0.5 break-words text-slate-200 font-medium">{value}</p>
    </div>
  );
}
