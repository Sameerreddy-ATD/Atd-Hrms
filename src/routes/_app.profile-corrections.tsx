import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { profileApi, type ProfileCorrectionRow } from "@/services/api";
import { cn } from "@/lib/utils";
import { Check, X, AlertCircle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_app/profile-corrections")({
  component: ProfileCorrectionsPage,
});

const STATUS_TABS = ["PENDING", "APPROVED", "REJECTED", "ALL"] as const;
/** Roles allowed to open the queue; managers get read-only visibility for their people. */
const VIEW_ROLES = ["hr", "developer_admin", "manager", "main_admin"];
/** Must mirror the server gate on POST /profile-corrections/:id/review. */
const REVIEW_ROLES = ["hr", "developer_admin", "main_admin"];

function ProfileCorrectionsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<ProfileCorrectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("PENDING");
  const [reviewing, setReviewing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await profileApi.listCorrections(activeTab === "ALL" ? undefined : activeTab);
      setRows(data);
    } catch {
      toast.error("Failed to load corrections");
    } finally {
      setLoading(false);
    }
  }, [activeTab]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; code: string; items: ProfileCorrectionRow[] }>();
    for (const r of rows) {
      const key = r.employeeId;
      if (!map.has(key)) map.set(key, { name: r.employeeName, code: r.employeeCode, items: [] });
      map.get(key)!.items.push(r);
    }
    return Array.from(map.values());
  }, [rows]);

  async function handleReview(id: string, action: "APPROVE" | "REJECT") {
    const msg =
      action === "APPROVE"
        ? t("pages.profileCorrections.confirmApprove")
        : t("pages.profileCorrections.confirmDecline");
    if (!window.confirm(msg)) return;
    setReviewing(id);
    try {
      await profileApi.reviewCorrection(id, action);
      toast.success(
        action === "APPROVE"
          ? t("pages.profileCorrections.toastApproved")
          : t("pages.profileCorrections.toastRejected"),
      );
      load();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReviewing(null);
    }
  }

  const canReview = !!user && REVIEW_ROLES.includes(user.role);

  if (!user || !VIEW_ROLES.includes(user.role)) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="h-10 w-10 text-muted-foreground" />
        <p className="mt-3 text-muted-foreground">You don't have access to this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title={t("pages.profileCorrections.title")}
        description={
          canReview
            ? t("pages.profileCorrections.subtitle")
            : t("pages.profileCorrections.reviewOnlyHr")
        }
      />

      {/* Status tabs */}
      <div className="flex flex-wrap gap-1.5">
        {STATUS_TABS.map((tab) => (
          <Button
            key={tab}
            size="sm"
            variant={activeTab === tab ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={() => setActiveTab(tab)}
          >
            {t(`pages.profileCorrections.${tab.toLowerCase() as "pending" | "approved" | "rejected" | "all"}`)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("pages.profileCorrections.noCorrections")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <Card key={group.items[0].employeeId} className="overflow-hidden">
              <div className="border-b bg-muted/30 px-4 py-2.5">
                <p className="text-sm font-semibold">{group.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t("pages.profileCorrections.employee")}: {group.code}
                </p>
              </div>
              <CardContent className="p-0">
                <div className="divide-y">
                  {group.items.map((row) => (
                    <div
                      key={row.id}
                      className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{row.field}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {row.section}
                          </Badge>
                          <Badge
                            variant={
                              row.status === "APPROVED"
                                ? "default"
                                : row.status === "REJECTED"
                                  ? "destructive"
                                  : "secondary"
                            }
                            className="text-[10px]"
                          >
                            {row.status}
                          </Badge>
                        </div>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded bg-red-50 px-2 py-0.5 text-red-700 dark:bg-red-950/40 dark:text-red-300">
                            {t("pages.profileCorrections.before")}:{" "}
                            {row.currentValue || t("pages.profileVerification.notProvided")}
                          </span>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <span className="rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {t("pages.profileCorrections.after")}: {row.suggestedValue}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {new Date(row.createdAt).toLocaleString()}
                        </p>
                      </div>
                      {row.status === "PENDING" && canReview && (
                        <div className="flex shrink-0 gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 gap-1 bg-emerald-600 text-xs hover:bg-emerald-700"
                            disabled={reviewing === row.id}
                            onClick={() => handleReview(row.id, "APPROVE")}
                          >
                            <Check className="h-3 w-3" />
                            {t("pages.profileCorrections.approve")}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 gap-1 text-xs"
                            disabled={reviewing === row.id}
                            onClick={() => handleReview(row.id, "REJECT")}
                          >
                            <X className="h-3 w-3" />
                            {t("pages.profileCorrections.decline")}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
