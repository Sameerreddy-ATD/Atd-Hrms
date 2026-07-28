import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { assetsApi } from "@/services/api";
import type { MyAssignedAsset } from "@/types/domain";

export const Route = createFileRoute("/_app/my-assets")({
  component: MyAssetsPage,
});

function MyAssetsPage() {
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

  if (loading) return <LoadingState label="Loading your assets" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="My Assets"
        description="Equipment and online seats assigned to you. Costs are hidden."
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!rows.length && !error ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Package className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No assets to show</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Assigned equipment and online seats will show up here when available.
            </p>
          </CardContent>
        </Card>
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
                    {asset.assetType === "ONLINE" ? "Online" : "Physical"}
                  </Badge>
                </div>
                <dl className="grid gap-1.5 text-xs text-muted-foreground">
                  {asset.serialNumber && (
                    <div className="flex justify-between gap-2">
                      <dt>Serial / license</dt>
                      <dd className="text-foreground">{asset.serialNumber}</dd>
                    </div>
                  )}
                  {asset.branchName && (
                    <div className="flex justify-between gap-2">
                      <dt>Branch</dt>
                      <dd className="text-foreground">{asset.branchName}</dd>
                    </div>
                  )}
                  {asset.location && (
                    <div className="flex justify-between gap-2">
                      <dt>Location</dt>
                      <dd className="text-foreground">{asset.location}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <dt>Assigned</dt>
                    <dd className="text-foreground">
                      {new Date(asset.assignedAt).toLocaleDateString("en-IN")}
                    </dd>
                  </div>
                  {asset.renewalDate && (
                    <div className="flex justify-between gap-2">
                      <dt>Renewal</dt>
                      <dd className="text-foreground">{asset.renewalDate}</dd>
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
