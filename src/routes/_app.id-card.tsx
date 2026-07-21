import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/common/Logo";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, type Branch } from "@/mock/types";
import { branchesApi } from "@/services/api";
import { ShieldCheck } from "lucide-react";

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
      />
      <div className="mx-auto w-full max-w-lg print:max-w-md">
        <Card className="overflow-hidden border-red-200 shadow-md dark:border-red-900/50 print:shadow-none">
          <div className="flex items-center justify-between border-b border-red-100 bg-red-50 px-5 py-3 dark:border-red-900/40 dark:bg-red-950/30">
            <Logo className="h-8 w-auto" />
            <div className="text-right">
              <span className="block text-xs font-semibold uppercase text-red-700 dark:text-red-400">
                Employee ID
              </span>
              <span className="text-[10px] text-muted-foreground">Employee Management System</span>
            </div>
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-20 w-20 border-2 border-red-100 dark:border-red-900/40">
                <AvatarFallback className="bg-red-600 text-xl text-white dark:bg-red-700">
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
            <div className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 border-y border-dashed py-4 text-sm min-[400px]:grid-cols-2 sm:grid-cols-3">
              <Row label="Department" value={user.department ?? "-"} />
              <Row label="Role" value={ROLE_LABELS[user.role]} />
              <Row label="Organization level" value={formatLabel(user.organizationLevel)} />
              <Row label="Branch" value={branch} />
              <Row label="Employment" value={formatLabel(user.employmentType)} />
              <Row label="Gender" value={formatLabel(user.gender)} />
              <Row label="Joining date" value={user.joiningDate ?? "-"} />
              <Row label="Phone" value={user.phone ?? "-"} />
              <div className="min-[400px]:col-span-2 sm:col-span-3">
                <Row label="Email" value={user.email} />
              </div>
            </div>

            <div className="mt-5 flex flex-col items-center justify-center">
              <div
                className="rounded-md border bg-white p-2"
                aria-label="Employee verification QR code"
              >
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(verificationUrl)}`}
                  alt="Verification QR Code"
                  className="h-28 w-28"
                  draggable={false}
                />
              </div>
              <span className="mt-2 flex items-center gap-1 text-[10px] font-semibold uppercase text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" /> Scan from
                another device to verify this ID
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
