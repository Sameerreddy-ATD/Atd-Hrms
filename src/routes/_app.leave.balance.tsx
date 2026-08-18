import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatCard } from "@/components/common/StatCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { leaveApi } from "@/services/api";
import type { LeaveBalance } from "@/types/domain";
import { formatDisplayDate } from "@/lib/india-date";
import { CalendarCheck, PlaneTakeoff } from "lucide-react";

export const Route = createFileRoute("/_app/leave/balance")({
  component: LeaveBalancePage,
});

type CompOffCredit = Awaited<ReturnType<typeof leaveApi.myCompOffCredits>>[number];

function LeaveBalancePage() {
  const { t } = useTranslation();
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [credits, setCredits] = useState<CompOffCredit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([leaveApi.myBalance(), leaveApi.myCompOffCredits().catch(() => [])])
      .then(([balanceRows, creditRows]) => {
        setBalances(balanceRows);
        setCredits(creditRows);
      })
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const available = balances.reduce((sum, row) => sum + row.balance, 0);
  const used = balances.reduce((sum, row) => sum + row.used, 0);
  const openCredits = credits.filter((row) => row.status === "AVAILABLE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("pages.leaveBalance.title")}
        description={t("pages.leaveBalance.subtitle")}
        actions={
          <Button asChild size="sm">
            <Link to="/leave/apply">
              <PlaneTakeoff className="mr-1.5 h-4 w-4" />
              {t("pages.attendanceMine.applyLeave")}
            </Link>
          </Button>
        }
      />
      {loading && <LoadingState label={t("pages.loading.leaveBalance")} />}
      {!loading && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard
              label={t("pages.leaveBalance.availableCredits")}
              value={available}
              icon={CalendarCheck}
            />
            <StatCard
              label={t("pages.leaveBalance.usedCycle")}
              value={used}
              icon={CalendarCheck}
            />
            <StatCard
              label={t("pages.leaveBalance.openCompOff")}
              value={openCredits}
              icon={CalendarCheck}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("pages.leaveBalance.balancesByType")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pages.corrections.type")}</TableHead>
                    <TableHead>{t("pages.leaveBalance.entitled")}</TableHead>
                    <TableHead>{t("pages.leavePolicy.used")}</TableHead>
                    <TableHead>{t("pages.leavePolicy.available")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {balances.map((row) => (
                    <TableRow key={row.code ?? row.type}>
                      <TableCell className="font-medium">
                        <div>{row.type}</div>
                        {row.code === "CASUAL" && (
                          <p className="text-xs font-normal text-muted-foreground">
                            {t("pages.leaveApply.carryForwardHint")}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">{row.entitled}</TableCell>
                      <TableCell className="tabular-nums">{row.used}</TableCell>
                      <TableCell className="tabular-nums font-semibold">{row.balance}</TableCell>
                    </TableRow>
                  ))}
                  {!balances.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-sm text-muted-foreground">
                        {t("pages.leaveBalance.emptyBalances")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">{t("pages.leaveBalance.compOffLedger")}</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("pages.leaveBalance.earnedOn")}</TableHead>
                    <TableHead>{t("common.status")}</TableHead>
                    <TableHead>{t("pages.leaveBalance.notes")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {credits.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="tabular-nums">
                        {formatDisplayDate(row.earnedDate)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.status}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.revokeReason ||
                          (row.expiredAt
                            ? t("pages.leaveBalance.expiredOn", {
                                date: formatDisplayDate(row.expiredAt),
                              })
                            : "") ||
                          (row.consumedByLeaveRequestId
                            ? t("pages.leaveBalance.compOffHint")
                            : "—")}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!credits.length && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-sm text-muted-foreground">
                        {t("pages.leaveBalance.emptyCredits")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
