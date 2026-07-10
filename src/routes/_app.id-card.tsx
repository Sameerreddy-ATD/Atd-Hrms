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
import { Download } from "lucide-react";

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
        description="Digital ID card."
      />
      <div className="max-w-md mx-auto w-full">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-muted/50 px-5 py-3">
            <Logo className="h-7 w-auto" />
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Employee ID
            </span>
          </div>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold">{user.name}</p>
                <p className="text-sm text-muted-foreground">
                  {user.designation ?? ROLE_LABELS[user.role]}
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {user.employeeCode ?? user.employeeId ?? "-"}
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <Row label="Department" value={user.department ?? "-"} />
              <Row label="Role" value={ROLE_LABELS[user.role]} />
              <Row label="Branch" value={branch} />
              <Row label="Phone" value={user.phone ?? "-"} />
              <Row label="Email" value={user.email} />
            </div>

            <div className="mt-6 flex flex-col items-center justify-center border-t border-dashed border-border pt-5">
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
              <span className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Scan or click to Verify ID
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
