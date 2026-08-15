import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Package } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { EmptyState } from "@/components/common/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { assetsApi } from "@/services/api";
import type { MyAssignedAsset } from "@/types/domain";
import { formatDisplayDate } from "@/lib/india-date";

export const Route = createFileRoute("/_app/my-assets")({
  component: MyAssetsPage,
});

function MyAssetsPage() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<MyAssignedAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    assetsApi
      .mine()
      .then(setRows)
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState label={t("pages.loading.myAssets")} />;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("pages.myAssets.title")}
        description={t("pages.myAssets.subtitle")}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!rows.length && !error ? (
        <EmptyState
          icon={Package}
          title={t("pages.myAssets.empty")}
          description={t("pages.myAssets.emptyHelp")}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((asset) => (
            <Card key={asset.id} className="overflow-hidden">
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium leading-snug">{asset.name}</p>
                    <p className="text-xs text-muted-foreground">{asset.assetCode}</p>
                  </div>
                  <Badge variant="outline">
                    {asset.assetType === "ONLINE"
                      ? t("pages.myAssets.online")
                      : t("pages.myAssets.physical")}
                  </Badge>
                </div>
                <dl className="grid gap-1.5 text-xs text-muted-foreground">
                  {asset.serialNumber && (
                    <div className="flex justify-between gap-2">
                      <dt>{t("pages.myAssets.serialLicense")}</dt>
                      <dd className="text-foreground">{asset.serialNumber}</dd>
                    </div>
                  )}
                  {asset.branchName && (
                    <div className="flex justify-between gap-2">
                      <dt>{t("common.branch")}</dt>
                      <dd className="text-foreground">{asset.branchName}</dd>
                    </div>
                  )}
                  {asset.location && (
                    <div className="flex justify-between gap-2">
                      <dt>{t("pages.myAssets.location")}</dt>
                      <dd className="text-foreground">{asset.location}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt>{t("pages.myAssets.assigned")}</dt>
                    <dd className="text-foreground">{formatDisplayDate(asset.assignedAt)}</dd>
                  </div>
                  {asset.renewalDate && (
                    <div className="flex justify-between gap-2">
                      <dt>{t("pages.myAssets.renewal")}</dt>
                      <dd className="text-foreground">{formatDisplayDate(asset.renewalDate)}</dd>
                    </div>
                  )}
                </dl>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
