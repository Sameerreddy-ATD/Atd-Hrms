import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AssetCatalogItem, CompanyAsset, EmployeeAssetInvestment, User } from "@/mock/types";
import { assetsApi, branchesApi, employeesApi } from "@/services/api";
import {
  IndianRupee,
  CalendarClock,
  Globe2,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UserPlus,
  UserRound,
} from "lucide-react";

export const Route = createFileRoute("/_app/assets")({ component: AssetsPage });

const EMPTY_ASSET_FORM = {
  assetCode: "",
  catalogId: "",
  name: "",
  serialNumber: "",
  purchaseValue: "",
  purchaseDate: "",
  assetType: "PHYSICAL" as CompanyAsset["assetType"],
  costFrequency: "ONE_TIME" as CompanyAsset["costFrequency"],
  renewalDate: "",
  branchId: "",
  status: "AVAILABLE" as CompanyAsset["status"],
};

function AssetsPage() {
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [investments, setInvestments] = useState<EmployeeAssetInvestment[]>([]);
  const [assetNames, setAssetNames] = useState<AssetCatalogItem[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<CompanyAsset | null>(null);
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET_FORM);
  const [newNameDialogOpen, setNewNameDialogOpen] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignment, setAssignment] = useState({
    assetId: "",
    employeeId: "",
  });

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [assetRows, employeeRows, branchRows, assetNameRows, investmentRows] =
        await Promise.all([
          assetsApi.list(),
          employeesApi.list(),
          branchesApi.list(),
          assetsApi.catalog(),
          assetsApi.investmentSummary(),
        ]);
      setAssets(assetRows);
      setEmployees(employeeRows.filter((employee) => employee.active && employee.employeeId));
      setBranches(branchRows);
      setAssetNames(assetNameRows);
      setInvestments(investmentRows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const availableAssets = useMemo(
    () => assets.filter((asset) => asset.status === "AVAILABLE" && !asset.assignedEmployeeId),
    [assets],
  );

  const assetNamesForType = useMemo(
    () =>
      assetNames.filter(
        (item) =>
          item.category === assetForm.assetType ||
          (assetForm.assetType === "PHYSICAL" && item.category === "Company Asset"),
      ),
    [assetForm.assetType, assetNames],
  );

  const visibleAssets = useMemo(() => {
    const search = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (statusFilter !== "all" && asset.status !== statusFilter) return false;
      if (assetTypeFilter !== "all" && asset.assetType !== assetTypeFilter) return false;
      const text =
        `${asset.assetCode} ${asset.name} ${asset.serialNumber ?? ""} ${asset.assignedEmployeeName ?? ""}`.toLowerCase();
      return !search || text.includes(search);
    });
  }, [assets, query, statusFilter, assetTypeFilter]);

  const totals = useMemo(
    () => ({
      count: assets.length,
      assigned: assets.filter((asset) => asset.status === "ASSIGNED").length,
      available: availableAssets.length,
      value: assets.reduce((sum, asset) => sum + asset.purchaseValue, 0),
      physical: assets.filter((asset) => asset.assetType === "PHYSICAL").length,
      online: assets.filter((asset) => asset.assetType === "ONLINE").length,
      monthlyRecurring: assets.reduce((sum, asset) => sum + asset.monthlyEquivalent, 0),
      annualRecurring: assets.reduce((sum, asset) => sum + asset.annualRecurring, 0),
    }),
    [assets, availableAssets.length],
  );

  function openAddAsset() {
    setEditingAsset(null);
    setAssetForm(EMPTY_ASSET_FORM);
    setAssetDialogOpen(true);
  }

  function openEditAsset(asset: CompanyAsset) {
    setEditingAsset(asset);
    setAssetForm({
      assetCode: asset.assetCode,
      catalogId: asset.catalogId ?? "",
      name: asset.name,
      serialNumber: asset.serialNumber ?? "",
      purchaseValue: String(asset.purchaseValue),
      purchaseDate: asset.purchaseDate ?? "",
      assetType: asset.assetType,
      costFrequency: asset.costFrequency,
      renewalDate: asset.renewalDate ?? "",
      branchId: asset.branchId ?? "",
      status: asset.status,
    });
    setAssetDialogOpen(true);
  }

  async function saveAsset(event: React.FormEvent) {
    event.preventDefault();
    if (
      (assetForm.assetType === "PHYSICAL" && !assetForm.assetCode) ||
      !assetForm.name ||
      !assetForm.purchaseValue
    ) {
      toast.error(
        assetForm.assetType === "PHYSICAL"
          ? "Asset ID, asset name, and value are required."
          : "Asset name and value are required.",
      );
      return;
    }
    try {
      const payload = {
        assetCode: assetForm.assetType === "ONLINE" ? undefined : assetForm.assetCode.trim(),
        catalogId: assetForm.catalogId || null,
        name: assetForm.name.trim(),
        category: assetForm.assetType,
        serialNumber: assetForm.serialNumber.trim() || null,
        purchaseValue: Number(assetForm.purchaseValue),
        purchaseDate: assetForm.purchaseDate || null,
        assetType: assetForm.assetType,
        costFrequency: assetForm.costFrequency,
        renewalDate: assetForm.costFrequency === "ONE_TIME" ? null : assetForm.renewalDate || null,
        branchId: assetForm.assetType === "ONLINE" ? null : assetForm.branchId || null,
        status: assetForm.assetType === "ONLINE" ? undefined : assetForm.status,
      };
      const saved = editingAsset
        ? await assetsApi.update(editingAsset.id, payload)
        : await assetsApi.create(payload);
      setAssets((current) =>
        editingAsset
          ? current.map((asset) => (asset.id === saved.id ? saved : asset))
          : [saved, ...current],
      );
      setAssetDialogOpen(false);
      setInvestments(await assetsApi.investmentSummary());
      toast.success(editingAsset ? "Asset updated" : "Company asset added");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function saveNewAssetName(event: React.FormEvent) {
    event.preventDefault();
    const name = newAssetName.trim();
    if (name.length < 2) {
      toast.error("Enter an asset name.");
      return;
    }
    try {
      const saved = await assetsApi.createCatalogItem({
        name,
        category: assetForm.assetType,
      });
      setAssetNames((current) => [...current, saved].sort((a, b) => a.name.localeCompare(b.name)));
      setAssetForm((current) => ({ ...current, catalogId: saved.id, name: saved.name }));
      setNewAssetName("");
      setNewNameDialogOpen(false);
      toast.success("Asset name saved for future use");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function openAssignAsset() {
    setAssignment({ assetId: "", employeeId: "" });
    setAssignDialogOpen(true);
  }

  async function assignAsset(event: React.FormEvent) {
    event.preventDefault();
    if (!assignment.assetId || !assignment.employeeId) {
      toast.error("Select an available asset and an employee.");
      return;
    }
    try {
      const saved = await assetsApi.update(assignment.assetId, {
        assignedEmployeeId: assignment.employeeId,
        status: "ASSIGNED",
      });
      setAssets((current) => current.map((asset) => (asset.id === saved.id ? saved : asset)));
      setAssignDialogOpen(false);
      setInvestments(await assetsApi.investmentSummary());
      toast.success(`Asset assigned to ${saved.assignedEmployeeName}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function returnAsset(asset: CompanyAsset) {
    try {
      const saved = await assetsApi.update(asset.id, {
        assignedEmployeeId: null,
        status: "AVAILABLE",
        location: null,
      });
      setAssets((current) => current.map((row) => (row.id === saved.id ? saved : row)));
      setInvestments(await assetsApi.investmentSummary());
      toast.success("Asset returned and marked available");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div>
      <PageHeader
        title="Asset Management"
        description="Track physical and online assets, recurring costs, and investment by employee. Visible only to HR."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={openAddAsset}>
              <Plus className="mr-2 h-4 w-4" /> Add Asset
            </Button>
            <Button size="sm" onClick={openAssignAsset} disabled={availableAssets.length === 0}>
              <UserPlus className="mr-2 h-4 w-4" /> Assign Asset
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Physical assets" value={totals.physical} icon={Package} />
        <MetricCard label="Online assets" value={totals.online} icon={Globe2} />
        <MetricCard
          label="Monthly recurring"
          value={formatCurrency(totals.monthlyRecurring)}
          icon={CalendarClock}
        />
        <MetricCard
          label="Annual recurring"
          value={formatCurrency(totals.annualRecurring)}
          icon={IndianRupee}
        />
      </div>

      <section className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Investment by employee</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            One-time purchases and normalized recurring costs for currently assigned assets.
          </p>
        </div>
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">Calculating employee investment...</p>
        ) : investments.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">
            Assign assets to employees to see investment totals.
          </p>
        ) : (
          <>
            <div className="space-y-2 p-3 md:hidden">
              {investments.map((item) => (
                <div key={item.employeeId} className="rounded-md border bg-background p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{item.employeeName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.employeeCode}
                        {item.department ? ` - ${item.department}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">
                      {item.physicalAssets + item.onlineAssets} assets
                    </Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <InvestmentValue label="One-time" value={item.oneTimeInvestment} />
                    <InvestmentValue label="Monthly" value={item.monthlyRecurring} />
                    <InvestmentValue label="Annual recurring" value={item.annualRecurring} />
                    <InvestmentValue
                      label="First-year total"
                      value={item.firstYearInvestment}
                      emphasized
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden overflow-x-auto md:block">
              <Table className="min-w-[880px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Asset mix</TableHead>
                    <TableHead className="text-right">One-time</TableHead>
                    <TableHead className="text-right">Monthly</TableHead>
                    <TableHead className="text-right">Annual recurring</TableHead>
                    <TableHead className="text-right">First-year total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {investments.map((item) => (
                    <TableRow key={item.employeeId}>
                      <TableCell>
                        <div className="font-medium">{item.employeeName}</div>
                        <div className="text-xs text-muted-foreground">
                          {item.employeeCode}
                          {item.department ? ` - ${item.department}` : ""}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {item.physicalAssets} physical - {item.onlineAssets} online
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.oneTimeInvestment)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.monthlyRecurring)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(item.annualRecurring)}
                      </TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatCurrency(item.firstYearInvestment)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search asset ID, name, serial number, or employee..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="AVAILABLE">Available</SelectItem>
            <SelectItem value="ASSIGNED">Assigned</SelectItem>
            <SelectItem value="UNDER_REPAIR">Under repair</SelectItem>
            <SelectItem value="RETIRED">Retired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={assetTypeFilter} onValueChange={setAssetTypeFilter}>
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All asset types</SelectItem>
            <SelectItem value="PHYSICAL">Physical</SelectItem>
            <SelectItem value="ONLINE">Online</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading && <p className="mt-5 text-sm text-muted-foreground">Loading assets...</p>}
      {error && <p className="mt-5 text-sm text-destructive">{error}</p>}
      {!loading && !error && (
        <div className="mt-5 overflow-hidden rounded-lg border border-border bg-card">
          <div className="space-y-2 p-3 md:hidden">
            {visibleAssets.map((asset) => (
              <div key={asset.id} className="rounded-lg border bg-background p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{asset.name}</p>
                    {asset.assetType === "PHYSICAL" && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {asset.assetCode}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <AssetTypeBadge type={asset.assetType} />
                    {asset.assetType === "PHYSICAL" && <AssetStatus status={asset.status} />}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">{costLabel(asset.costFrequency)}</p>
                    <p className="mt-0.5 font-medium">{formatCurrency(asset.purchaseValue)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Branch</p>
                    <p className="mt-0.5 break-words">
                      {asset.assetType === "ONLINE" ? "Not applicable" : (asset.branchName ?? "-")}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Assigned to</p>
                    <p className="mt-0.5 break-words">
                      {asset.assignedEmployeeName ?? "Not assigned"}
                    </p>
                  </div>
                  {asset.costFrequency !== "ONE_TIME" && (
                    <div className="col-span-2">
                      <p className="text-muted-foreground">Recurring cost</p>
                      <p className="mt-0.5">
                        {formatCurrency(asset.monthlyEquivalent)}/month -{" "}
                        {formatCurrency(asset.annualRecurring)}/year
                      </p>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex gap-2">
                  {asset.status === "ASSIGNED" && (
                    <Button
                      className="flex-1"
                      size="sm"
                      variant="outline"
                      onClick={() => void returnAsset(asset)}
                    >
                      <RotateCcw className="h-4 w-4" /> Return
                    </Button>
                  )}
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="outline"
                    onClick={() => openEditAsset(asset)}
                  >
                    <Pencil className="h-4 w-4" /> Edit
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <Table className="min-w-[1180px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Asset ID</TableHead>
                  <TableHead>Asset name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Serial number</TableHead>
                  <TableHead>Cost</TableHead>
                  <TableHead>Purchase date</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Assigned employee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleAssets.map((asset) => (
                  <TableRow key={asset.id}>
                    <TableCell className="font-mono text-xs font-semibold">
                      {asset.assetType === "PHYSICAL" ? asset.assetCode : "-"}
                    </TableCell>
                    <TableCell className="font-medium">{asset.name}</TableCell>
                    <TableCell>
                      <AssetTypeBadge type={asset.assetType} />
                    </TableCell>
                    <TableCell>{asset.serialNumber ?? "-"}</TableCell>
                    <TableCell>
                      <div>{formatCurrency(asset.purchaseValue)}</div>
                      <div className="text-xs text-muted-foreground">
                        {costLabel(asset.costFrequency)}
                      </div>
                    </TableCell>
                    <TableCell>{asset.purchaseDate ?? "-"}</TableCell>
                    <TableCell>
                      {asset.assetType === "ONLINE" ? "Not applicable" : (asset.branchName ?? "-")}
                    </TableCell>
                    <TableCell>
                      {asset.assignedEmployeeName ? (
                        <div>
                          <div className="font-medium">{asset.assignedEmployeeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {asset.assignedEmployeeCode}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not assigned</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {asset.assetType === "PHYSICAL" ? (
                        <AssetStatus status={asset.status} />
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {asset.status === "ASSIGNED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void returnAsset(asset)}
                          >
                            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Return
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="outline"
                          title="Edit asset"
                          onClick={() => openEditAsset(asset)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {visibleAssets.length === 0 && (
            <div className="p-8 text-center">
              <p className="text-sm font-medium">No company assets found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Use Add Asset to register the company&apos;s existing assets.
              </p>
            </div>
          )}
        </div>
      )}

      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingAsset ? "Edit Asset" : "Add Asset"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveAsset}>
            <FormField label="Asset type">
              <Select
                value={assetForm.assetType}
                onValueChange={(value) =>
                  setAssetForm({
                    ...assetForm,
                    assetType: value as CompanyAsset["assetType"],
                    catalogId: "",
                    name: "",
                    branchId: value === "ONLINE" ? "" : assetForm.branchId,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PHYSICAL">Physical asset</SelectItem>
                  <SelectItem value="ONLINE">Online asset</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Cost type">
              <Select
                value={assetForm.costFrequency}
                onValueChange={(value) =>
                  setAssetForm({
                    ...assetForm,
                    costFrequency: value as CompanyAsset["costFrequency"],
                    renewalDate: value === "ONE_TIME" ? "" : assetForm.renewalDate,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ONE_TIME">One-time investment</SelectItem>
                  <SelectItem value="MONTHLY">Monthly subscription</SelectItem>
                  <SelectItem value="YEARLY">Annual subscription</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {assetForm.assetType === "PHYSICAL" && (
              <FormField label="Asset ID">
                <Input
                  value={assetForm.assetCode}
                  onChange={(event) =>
                    setAssetForm({ ...assetForm, assetCode: event.target.value })
                  }
                  placeholder="ATD-AST-001"
                />
              </FormField>
            )}
            <FormField label="Asset name">
              <Select
                value={assetForm.catalogId || (assetForm.name ? "existing-name" : "")}
                onValueChange={(value) => {
                  if (value === "add-new") {
                    setNewAssetName("");
                    setNewNameDialogOpen(true);
                    return;
                  }
                  if (value === "existing-name") return;
                  const selected = assetNames.find((item) => item.id === value);
                  if (selected) {
                    setAssetForm({ ...assetForm, catalogId: selected.id, name: selected.name });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select asset name" />
                </SelectTrigger>
                <SelectContent>
                  {assetForm.name && !assetForm.catalogId && (
                    <SelectItem value="existing-name">{assetForm.name}</SelectItem>
                  )}
                  {assetNamesForType.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="add-new">
                    <span className="flex items-center gap-2 font-medium text-primary">
                      <Plus className="h-4 w-4" /> Add new asset name
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label={assetForm.assetType === "ONLINE" ? "License / account ID" : "Serial number"}
            >
              <Input
                value={assetForm.serialNumber}
                onChange={(event) =>
                  setAssetForm({ ...assetForm, serialNumber: event.target.value })
                }
              />
            </FormField>
            <FormField label={`${costLabel(assetForm.costFrequency)} (INR)`}>
              <Input
                type="number"
                min="0"
                value={assetForm.purchaseValue}
                onChange={(event) =>
                  setAssetForm({ ...assetForm, purchaseValue: event.target.value })
                }
              />
            </FormField>
            <FormField
              label={
                assetForm.costFrequency === "ONE_TIME" ? "Purchase date" : "Subscription start date"
              }
            >
              <Input
                type="date"
                value={assetForm.purchaseDate}
                onChange={(event) =>
                  setAssetForm({ ...assetForm, purchaseDate: event.target.value })
                }
              />
            </FormField>
            {assetForm.costFrequency !== "ONE_TIME" && (
              <FormField label="Next renewal date">
                <Input
                  type="date"
                  value={assetForm.renewalDate}
                  onChange={(event) =>
                    setAssetForm({ ...assetForm, renewalDate: event.target.value })
                  }
                />
              </FormField>
            )}
            {assetForm.assetType === "PHYSICAL" && (
              <FormField label="Branch">
                <Select
                  value={assetForm.branchId}
                  onValueChange={(branchId) => setAssetForm({ ...assetForm, branchId })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            )}
            {assetForm.assetType === "PHYSICAL" && (
              <FormField label="Status">
                <Select
                  value={assetForm.status}
                  onValueChange={(value) =>
                    setAssetForm({ ...assetForm, status: value as CompanyAsset["status"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AVAILABLE">Available</SelectItem>
                    {editingAsset?.status === "ASSIGNED" && (
                      <SelectItem value="ASSIGNED">Assigned</SelectItem>
                    )}
                    <SelectItem value="UNDER_REPAIR">Under repair</SelectItem>
                    <SelectItem value="RETIRED">Retired</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
            )}
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setAssetDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingAsset ? "Save Changes" : "Add Asset"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={newNameDialogOpen} onOpenChange={setNewNameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              Add New {assetForm.assetType === "ONLINE" ? "Online" : "Physical"} Asset Name
            </DialogTitle>
          </DialogHeader>
          <form className="space-y-4" onSubmit={saveNewAssetName}>
            <FormField label="Asset name">
              <Input
                autoFocus
                value={newAssetName}
                onChange={(event) => setNewAssetName(event.target.value)}
                placeholder="For example: Dell Laptop"
              />
            </FormField>
            <p className="text-xs text-muted-foreground">
              This name will be saved and available in the Asset Name dropdown next time.
            </p>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setNewNameDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save Asset Name</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Assign Asset to Employee</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={assignAsset}>
            <div className="sm:col-span-2">
              <Label>Available asset</Label>
              <Select
                value={assignment.assetId}
                onValueChange={(assetId) => setAssignment({ ...assignment, assetId })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {availableAssets.map((asset) => (
                    <SelectItem key={asset.id} value={asset.id}>
                      {asset.assetCode} - {asset.name}
                      {asset.serialNumber ? ` (${asset.serialNumber})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Employee</Label>
              <Select
                value={assignment.employeeId}
                onValueChange={(employeeId) => setAssignment({ ...assignment, employeeId })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((employee) => (
                    <SelectItem key={employee.employeeId!} value={employee.employeeId!}>
                      {employee.name} ({employee.employeeCode ?? employee.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="sm:col-span-2">
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Assign Asset</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function AssetStatus({ status }: { status: CompanyAsset["status"] }) {
  const classes =
    status === "AVAILABLE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "ASSIGNED"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : status === "UNDER_REPAIR"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-100 text-slate-600";
  return (
    <Badge variant="outline" className={classes}>
      {status.replaceAll("_", " ")}
    </Badge>
  );
}

function AssetTypeBadge({ type }: { type: CompanyAsset["assetType"] }) {
  return (
    <Badge
      variant="outline"
      className={
        type === "ONLINE"
          ? "border-cyan-200 bg-cyan-50 text-cyan-700"
          : "border-violet-200 bg-violet-50 text-violet-700"
      }
    >
      {type === "ONLINE" ? "Online" : "Physical"}
    </Badge>
  );
}

function InvestmentValue({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: number;
  emphasized?: boolean;
}) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className={emphasized ? "mt-0.5 font-semibold text-primary" : "mt-0.5 font-medium"}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function costLabel(frequency: CompanyAsset["costFrequency"]) {
  if (frequency === "MONTHLY") return "Monthly cost";
  if (frequency === "YEARLY") return "Annual cost";
  return "One-time value";
}

function MetricCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Package;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-bold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </CardContent>
    </Card>
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
