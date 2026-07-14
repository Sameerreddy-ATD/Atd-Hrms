import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, type Branch } from "@/mock/types";
import { branchesApi } from "@/services/api";
import { Download, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_app/id-card")({
  component: IdCardPage,
});

function IdCardPage() {
  const { user } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    branchesApi
      .list()
      .then(setBranches)
      .catch(() => setBranches([]));
  }, []);
  if (!user) return null;
  const initials = user.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");
  const branch = branches.find((b) => b.id === user.homeBranchId)?.name ?? "-";
  const verificationUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/verify-id/${user.employeeId || user.id}`
      : "";

  return (
    <div>
      <PageHeader
        title="Employee ID Card"
        description="Your official digital company identification."
        actions={
          <Button size="sm" variant="outline" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" /> Print card
          </Button>
        }
      />
      <div className="mx-auto w-full max-w-lg print:max-w-md">
        <Card className="overflow-hidden border-red-200 shadow-md print:shadow-none">
          <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-5 py-3">
            <Logo className="h-8 w-auto" />
            <div className="text-right">
              <span className="block text-xs font-semibold uppercase text-red-700">
                Employee ID
              </span>
              <span className="text-[10px] text-muted-foreground">Anytime Diesel HRMS</span>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-red-100">
                <AvatarFallback className="bg-red-600 text-xl text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold">{user.name}</p>
                <p className="text-sm text-muted-foreground">
                  {user.designation ?? ROLE_LABELS[user.role]}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {user.employeeCode ?? user.employeeId ?? "-"}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-dashed py-4 text-sm sm:grid-cols-3">
              <Row label="Department" value={user.department ?? "-"} />
              <Row label="Role" value={ROLE_LABELS[user.role]} />
              <Row label="Organization level" value={formatLabel(user.organizationLevel)} />
              <Row label="Branch" value={branch} />
              <Row label="Employment" value={formatLabel(user.employmentType)} />
              <Row label="Gender" value={formatLabel(user.gender)} />
              <Row label="Joining date" value={user.joiningDate ?? "-"} />
              <Row label="Phone" value={user.phone ?? "-"} />
              <div className="col-span-2 sm:col-span-3">
                <Row label="Email" value={user.email} />
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center justify-center">
              <a
                href={`/verify-id/${user.employeeId || user.id}`}
                target="_blank"
                rel="noreferrer"
                className="block hover:opacity-90 transition-opacity"
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verificationUrl)}`}
                  alt="Verification QR Code"
                  className="h-28 w-28 border border-border p-1 bg-white"
                />
              </a>
              <span className="mt-2 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-600" /> Scan to verify active
                employment
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="truncate">{value}</p>
    </div>
  );
}

function formatLabel(value?: string) {
  return value
    ? value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "-";
}
