import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AssetCatalogItem,
  AssetReturnRecord,
  CompanyAsset,
  EmployeeAssetInvestment,
  User,
} from "@/types/domain";
import { assetsApi, branchesApi, employeesApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import {
  Building2,
  CalendarClock,
  Globe2,
  IndianRupee,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  UserPlus,
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
  assignmentScope: "EMPLOYEE" as CompanyAsset["assignmentScope"],
  costFrequency: "ONE_TIME" as CompanyAsset["costFrequency"],
  renewalDate: "",
  branchId: "",
  status: "AVAILABLE" as CompanyAsset["status"],
};

const PAGE_SIZE = 100;
type AssetsTab = "inventory" | "assigned" | "investment" | "returns";
type ScopeFilter = "all" | "EMPLOYEE" | "COMPANY";

function AssetsPage() {
  const { user } = useAuth();
  const canManage = user?.role === "hr" || user?.role === "developer_admin";
  const isCeo = user?.role === "ceo";
  const [tab, setTab] = useState<AssetsTab>(isCeo ? "investment" : "inventory");
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [investments, setInvestments] = useState<EmployeeAssetInvestment[]>([]);
  const [assetNames, setAssetNames] = useState<AssetCatalogItem[]>([]);
  const [returnHistory, setReturnHistory] = useState<AssetReturnRecord[]>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [assetTypeFilter, setAssetTypeFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<CompanyAsset | null>(null);
  const [assetForm, setAssetForm] = useState(EMPTY_ASSET_FORM);
  const [newNameDialogOpen, setNewNameDialogOpen] = useState(false);
  const [newAssetName, setNewAssetName] = useState("");

  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [assignment, setAssignment] = useState({ assetId: "", employeeId: "" });
  const [employeeQuery, setEmployeeQuery] = useState("");
  const [returnTarget, setReturnTarget] = useState<CompanyAsset | null>(null);
  const [returnForm, setReturnForm] = useState({
    condition: "GOOD" as AssetReturnRecord["condition"],
    accessoriesReturned: false,
    chargerReturned: false,
    dataBackedUp: false,
    dataWiped: false,
    physicalDamage: false,
    damageNotes: "",
    remarks: "",
  });
  const [returning, setReturning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assetRows, investmentRows] = await Promise.all([
        assetsApi.list({ limit: PAGE_SIZE, offset: 0 }),
        assetsApi.investmentSummary(),
      ]);
      setAssets(assetRows);
      setHasMore(assetRows.length === PAGE_SIZE);
      setInvestments(investmentRows);
      if (canManage) {
        const [employeeRows, branchRows, assetNameRows, returnRows] = await Promise.all([
          employeesApi.list(),
          branchesApi.list(),
          assetsApi.catalog(),
          assetsApi.returnHistory(),
        ]);
        setEmployees(employeeRows.filter((employee) => employee.active && employee.employeeId));
        setBranches(branchRows);
        setAssetNames(assetNameRows);
        setReturnHistory(returnRows);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const next = await assetsApi.list({ limit: PAGE_SIZE, offset: assets.length });
      setAssets((current) => [...current, ...next]);
      setHasMore(next.length === PAGE_SIZE);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    void load();
  }, [load]);

  const availableAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.assignmentScope === "EMPLOYEE" &&
          asset.status === "AVAILABLE" &&
          !asset.assignedEmployeeId,
      ),
    [assets],
  );

  const assignedAssets = useMemo(
    () =>
      assets.filter(
        (asset) =>
          asset.assignmentScope === "EMPLOYEE" &&
          (asset.status === "ASSIGNED" || !!asset.assignedEmployeeId),
      ),
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
      if (scopeFilter !== "all" && asset.assignmentScope !== scopeFilter) return false;
      const text =
        `${asset.assetCode} ${asset.name} ${asset.serialNumber ?? ""} ${asset.assignedEmployeeName ?? ""}`.toLowerCase();
      return !search || text.includes(search);
    });
  }, [assets, assetTypeFilter, query, scopeFilter, statusFilter]);

  const filteredAssigned = useMemo(() => {
    const search = query.trim().toLowerCase();
    return assignedAssets.filter((asset) => {
      if (assetTypeFilter !== "all" && asset.assetType !== assetTypeFilter) return false;
      const text =
        `${asset.assetCode} ${asset.name} ${asset.serialNumber ?? ""} ${asset.assignedEmployeeName ?? ""}`.toLowerCase();
      return !search || text.includes(search);
    });
  }, [assignedAssets, assetTypeFilter, query]);

  const filteredEmployees = useMemo(() => {
    const search = employeeQuery.trim().toLowerCase();
    if (!search) return employees;
    return employees.filter((employee) =>
      [employee.name, employee.employeeCode, employee.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    );
  }, [employeeQuery, employees]);

  const totals = useMemo(
    () => ({
      assigned: assignedAssets.length,
      available: availableAssets.length,
      physical: assets.filter((asset) => asset.assetType === "PHYSICAL").length,
      online: assets.filter((asset) => asset.assetType === "ONLINE").length,
      companyUse: assets.filter((asset) => asset.assignmentScope === "COMPANY").length,
      monthlyRecurring: assets.reduce((sum, asset) => sum + asset.monthlyEquivalent, 0),
      annualRecurring: assets.reduce((sum, asset) => sum + asset.annualRecurring, 0),
    }),
    [assets, assignedAssets.length, availableAssets.length],
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
      assignmentScope: asset.assignmentScope,
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
        assignmentScope: assetForm.assignmentScope,
        costFrequency: assetForm.costFrequency,
        renewalDate: assetForm.costFrequency === "ONE_TIME" ? null : assetForm.renewalDate || null,
        branchId: assetForm.assetType === "ONLINE" ? null : assetForm.branchId || null,
        status: assetForm.status,
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

  function openAssignAsset(prefillAssetId?: string) {
    setAssignment({ assetId: prefillAssetId ?? "", employeeId: "" });
    setEmployeeQuery("");
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
      setTab("assigned");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function openReturnAsset(asset: CompanyAsset) {
    setReturnTarget(asset);
    setReturnForm({
      condition: "GOOD",
      accessoriesReturned: false,
      chargerReturned: false,
      dataBackedUp: false,
      dataWiped: false,
      physicalDamage: false,
      damageNotes: "",
      remarks: "",
    });
  }

  async function returnAsset() {
    if (!returnTarget) return;
    const isPhysical = returnTarget.assetType === "PHYSICAL";
    if (isPhysical && returnForm.physicalDamage && !returnForm.damageNotes.trim()) {
      toast.error("Describe the physical damage before completing the return.");
      return;
    }
    setReturning(true);
    try {
      await assetsApi.returnAsset(returnTarget.id, {
        condition: returnForm.condition,
        accessoriesReturned: isPhysical ? returnForm.accessoriesReturned : false,
        chargerReturned: isPhysical ? returnForm.chargerReturned : false,
        dataBackedUp: returnForm.dataBackedUp,
        dataWiped: returnForm.dataWiped,
        physicalDamage: isPhysical ? returnForm.physicalDamage : false,
        damageNotes: isPhysical && returnForm.damageNotes ? returnForm.damageNotes : null,
        remarks: returnForm.remarks || null,
      });
      setReturnTarget(null);
      await load();
      toast.success("Return checklist saved and asset released");
      setTab("inventory");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setReturning(false);
    }
  }

  const editingIsAssigned = Boolean(editingAsset?.assignedEmployeeId);

  return (
    <div className="mx-auto max-w-[1440px] space-y-5 px-4 pb-16 sm:px-6">
      <PageHeader
        title="Asset Management"
        description={
          canManage
            ? "Register company assets, assign them to people, and record returns. Shared furniture stays company-use."
            : "Read-only view of company assets and investment per employee."
        }
        actions={
          canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={openAddAsset}>
                <Plus className="mr-2 h-4 w-4" /> Add Asset
              </Button>
              <Button
                size="sm"
                onClick={() => openAssignAsset()}
                disabled={availableAssets.length === 0}
              >
                <UserPlus className="mr-2 h-4 w-4" /> Assign Asset
              </Button>
            </div>
          ) : undefined
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Available to assign" value={totals.available} icon={Package} />
        <MetricCard label="Currently assigned" value={totals.assigned} icon={UserPlus} />
        <MetricCard label="Physical / online" value={`${totals.physical} / ${totals.online}`} icon={Globe2} />
        <MetricCard label="Company-use" value={totals.companyUse} icon={Building2} />
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

      {loading && <LoadingState label="Loading assets" />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && !error && (
        <Tabs value={tab} onValueChange={(value) => setTab(value as AssetsTab)}>
          <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
            <TabsTrigger value="inventory" className="min-h-10">
              Inventory
            </TabsTrigger>
            <TabsTrigger value="assigned" className="min-h-10">
              Assigned ({assignedAssets.length})
            </TabsTrigger>
            <TabsTrigger value="investment" className="min-h-10">
              Investment
            </TabsTrigger>
            {canManage && (
              <TabsTrigger value="returns" className="min-h-10">
                Returns
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="inventory" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              All company assets. Add new items here, then assign employee-scoped assets from an
              available row.
            </p>
            <FilterBar
              query={query}
              onQueryChange={setQuery}
              statusFilter={statusFilter}
              onStatusChange={setStatusFilter}
              assetTypeFilter={assetTypeFilter}
              onAssetTypeChange={setAssetTypeFilter}
              scopeFilter={scopeFilter}
              onScopeChange={setScopeFilter}
              showStatus
              showScope
            />
            <AssetList
              assets={visibleAssets}
              canManage={canManage}
              mode="inventory"
              onEdit={openEditAsset}
              onAssign={(asset) => openAssignAsset(asset.id)}
              onReturn={openReturnAsset}
              emptyTitle="No assets match these filters"
              emptyHint={
                canManage
                  ? "Use Add Asset to register a laptop, phone, furniture, or online subscription."
                  : "Ask HR to register company assets."
              }
            />
            {hasMore &&
              !query &&
              statusFilter === "all" &&
              assetTypeFilter === "all" &&
              scopeFilter === "all" && (
                <div className="text-center">
                  <Button variant="outline" onClick={() => void loadMore()} disabled={loadingMore}>
                    {loadingMore ? "Loading assets..." : "Load more assets"}
                  </Button>
                </div>
              )}
          </TabsContent>

          <TabsContent value="assigned" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Assets currently with an employee. Use Return to complete the checklist and free the
              item for reassignment.
            </p>
            <FilterBar
              query={query}
              onQueryChange={setQuery}
              assetTypeFilter={assetTypeFilter}
              onAssetTypeChange={setAssetTypeFilter}
              showStatus={false}
              showScope={false}
            />
            <AssetList
              assets={filteredAssigned}
              canManage={canManage}
              mode="assigned"
              onEdit={openEditAsset}
              onAssign={(asset) => openAssignAsset(asset.id)}
              onReturn={openReturnAsset}
              emptyTitle="No assets are assigned right now"
              emptyHint={
                canManage
                  ? availableAssets.length
                    ? "Open Inventory or Assign Asset to give someone a device or license."
                    : "Add an available employee-scoped asset first, then assign it."
                  : "Assigned assets will appear here once HR issues them."
              }
            />
          </TabsContent>

          <TabsContent value="investment" className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              How much Anytime Diesel currently invests in each employee through assigned physical
              devices and online seats. Shared company-use assets are excluded.
            </p>
            <InvestmentSection investments={investments} />
          </TabsContent>

          {canManage && (
            <TabsContent value="returns" className="mt-4 space-y-4">
              <p className="text-sm text-muted-foreground">
                Completed return checklists. Not-working physical returns are marked under repair.
              </p>
              <ReturnHistorySection rows={returnHistory} />
            </TabsContent>
          )}
        </Tabs>
      )}

      <Dialog open={assetDialogOpen} onOpenChange={setAssetDialogOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingAsset ? "Edit Asset" : "Add Asset"}</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveAsset}>
            <FormField
              label="Who uses it"
              hint="Employee = issued to one person. Company use = shared furniture/fixtures."
            >
              <Select
                value={assetForm.assignmentScope}
                onValueChange={(value) =>
                  setAssetForm({
                    ...assetForm,
                    assignmentScope: value as CompanyAsset["assignmentScope"],
                    status: value === "COMPANY" ? "AVAILABLE" : assetForm.status,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EMPLOYEE">Employee (can assign)</SelectItem>
                  <SelectItem value="COMPANY">Company use (not assignable)</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            <FormField
              label="Asset type"
              hint="Physical = laptop/phone/furniture. Online = software seat or subscription."
            >
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
            <FormField
              label="Status"
              hint={
                editingIsAssigned
                  ? "This asset is assigned. Return it before changing status."
                  : undefined
              }
            >
              <Select
                value={assetForm.status}
                onValueChange={(value) =>
                  setAssetForm({ ...assetForm, status: value as CompanyAsset["status"] })
                }
                disabled={editingIsAssigned}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AVAILABLE">Available</SelectItem>
                  {editingIsAssigned && <SelectItem value="ASSIGNED">Assigned</SelectItem>}
                  <SelectItem value="UNDER_REPAIR">Under repair</SelectItem>
                  <SelectItem value="RETIRED">Retired</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
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
              Saved names appear in the Asset name dropdown next time.
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
          <form className="grid gap-4" onSubmit={assignAsset}>
            <div className="space-y-1.5">
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
                      {assetLabel(asset)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Employee</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={employeeQuery}
                  onChange={(event) => setEmployeeQuery(event.target.value)}
                  placeholder="Search by name or employee code"
                />
              </div>
              <Select
                value={assignment.employeeId}
                onValueChange={(employeeId) => setAssignment({ ...assignment, employeeId })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {filteredEmployees.map((employee) => (
                    <SelectItem key={employee.employeeId!} value={employee.employeeId!}>
                      {employee.name} ({employee.employeeCode ?? employee.employeeId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Assign Asset</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(returnTarget)} onOpenChange={(open) => !open && setReturnTarget(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {returnTarget?.assetType === "ONLINE" ? "Online seat return" : "Asset return checklist"}
            </DialogTitle>
          </DialogHeader>
          {returnTarget && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <p className="font-semibold">{assetLabel(returnTarget)}</p>
                <p className="text-muted-foreground">
                  Returning from {returnTarget.assignedEmployeeName}
                </p>
              </div>
              <FormField label="Condition on return">
                <Select
                  value={returnForm.condition}
                  onValueChange={(condition: AssetReturnRecord["condition"]) =>
                    setReturnForm((v) => ({ ...v, condition }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GOOD">Good</SelectItem>
                    <SelectItem value="FAIR">Fair / normal wear</SelectItem>
                    <SelectItem value="DAMAGED">Damaged</SelectItem>
                    <SelectItem value="NOT_WORKING">Not working</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              {returnTarget.assetType === "PHYSICAL" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <ChecklistItem
                    label="Accessories returned"
                    checked={returnForm.accessoriesReturned}
                    onChange={(checked) =>
                      setReturnForm((v) => ({ ...v, accessoriesReturned: checked }))
                    }
                  />
                  <ChecklistItem
                    label="Charger returned"
                    checked={returnForm.chargerReturned}
                    onChange={(checked) =>
                      setReturnForm((v) => ({ ...v, chargerReturned: checked }))
                    }
                  />
                  <ChecklistItem
                    label="Company data backed up"
                    checked={returnForm.dataBackedUp}
                    onChange={(checked) => setReturnForm((v) => ({ ...v, dataBackedUp: checked }))}
                  />
                  <ChecklistItem
                    label="Company data wiped"
                    checked={returnForm.dataWiped}
                    onChange={(checked) => setReturnForm((v) => ({ ...v, dataWiped: checked }))}
                  />
                  <ChecklistItem
                    label="Physical damage found"
                    checked={returnForm.physicalDamage}
                    onChange={(checked) =>
                      setReturnForm((v) => ({ ...v, physicalDamage: checked }))
                    }
                  />
                </div>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <ChecklistItem
                    label="Access / seat revoked"
                    checked={returnForm.dataWiped}
                    onChange={(checked) => setReturnForm((v) => ({ ...v, dataWiped: checked }))}
                  />
                  <ChecklistItem
                    label="Company data / files recovered"
                    checked={returnForm.dataBackedUp}
                    onChange={(checked) => setReturnForm((v) => ({ ...v, dataBackedUp: checked }))}
                  />
                </div>
              )}
              {returnTarget.assetType === "PHYSICAL" && returnForm.physicalDamage && (
                <FormField label="Damage details">
                  <Textarea
                    rows={3}
                    maxLength={2000}
                    value={returnForm.damageNotes}
                    onChange={(event) =>
                      setReturnForm((v) => ({ ...v, damageNotes: event.target.value }))
                    }
                    required
                  />
                </FormField>
              )}
              <FormField label="Return remarks">
                <Textarea
                  rows={3}
                  maxLength={2000}
                  value={returnForm.remarks}
                  onChange={(event) =>
                    setReturnForm((v) => ({ ...v, remarks: event.target.value }))
                  }
                />
              </FormField>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReturnTarget(null)}>
              Cancel
            </Button>
            <Button onClick={() => void returnAsset()} disabled={returning}>
              {returning ? "Saving..." : "Complete return"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FilterBar({
  query,
  onQueryChange,
  statusFilter,
  onStatusChange,
  assetTypeFilter,
  onAssetTypeChange,
  scopeFilter,
  onScopeChange,
  showStatus,
  showScope,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter?: string;
  onStatusChange?: (value: string) => void;
  assetTypeFilter: string;
  onAssetTypeChange: (value: string) => void;
  scopeFilter?: ScopeFilter;
  onScopeChange?: (value: ScopeFilter) => void;
  showStatus: boolean;
  showScope: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
      <div className="relative min-w-52 flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search name, ID, serial, or employee..."
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </div>
      {showStatus && statusFilter !== undefined && onStatusChange && (
        <Select value={statusFilter} onValueChange={onStatusChange}>
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
      )}
      <Select value={assetTypeFilter} onValueChange={onAssetTypeChange}>
        <SelectTrigger className="sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All types</SelectItem>
          <SelectItem value="PHYSICAL">Physical</SelectItem>
          <SelectItem value="ONLINE">Online</SelectItem>
        </SelectContent>
      </Select>
      {showScope && scopeFilter !== undefined && onScopeChange && (
        <Select value={scopeFilter} onValueChange={(value) => onScopeChange(value as ScopeFilter)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All scopes</SelectItem>
            <SelectItem value="EMPLOYEE">Employee-assigned</SelectItem>
            <SelectItem value="COMPANY">Company-use</SelectItem>
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

function AssetList({
  assets,
  canManage,
  mode,
  onEdit,
  onAssign,
  onReturn,
  emptyTitle,
  emptyHint,
}: {
  assets: CompanyAsset[];
  canManage: boolean;
  mode: "inventory" | "assigned";
  onEdit: (asset: CompanyAsset) => void;
  onAssign: (asset: CompanyAsset) => void;
  onReturn: (asset: CompanyAsset) => void;
  emptyTitle: string;
  emptyHint: string;
}) {
  const canAssign = (asset: CompanyAsset) =>
    canManage &&
    mode === "inventory" &&
    asset.assignmentScope === "EMPLOYEE" &&
    asset.status === "AVAILABLE" &&
    !asset.assignedEmployeeId;

  const canReturn = (asset: CompanyAsset) =>
    canManage &&
    asset.assignmentScope === "EMPLOYEE" &&
    (asset.status === "ASSIGNED" || !!asset.assignedEmployeeId);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="space-y-2 p-3 md:hidden">
        {assets.map((asset) => (
          <div key={asset.id} className="rounded-lg border bg-background p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{asset.name}</p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {asset.assetType === "PHYSICAL" ? asset.assetCode : asset.serialNumber || asset.assetCode}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <AssetTypeBadge type={asset.assetType} />
                {asset.assignmentScope === "COMPANY" && (
                  <Badge variant="outline">Company use</Badge>
                )}
                <AssetStatus status={asset.status} />
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
                  {asset.assignmentScope === "COMPANY"
                    ? "Shared company asset"
                    : (asset.assignedEmployeeName ?? "Not assigned")}
                </p>
              </div>
            </div>
            {canManage && (
              <div className="mt-3 flex flex-wrap gap-2">
                {canAssign(asset) && (
                  <Button className="flex-1" size="sm" onClick={() => onAssign(asset)}>
                    <UserPlus className="h-4 w-4" /> Assign
                  </Button>
                )}
                {canReturn(asset) && (
                  <Button
                    className="flex-1"
                    size="sm"
                    variant="outline"
                    onClick={() => onReturn(asset)}
                  >
                    <RotateCcw className="h-4 w-4" /> Return
                  </Button>
                )}
                <Button
                  className="flex-1"
                  size="sm"
                  variant="outline"
                  onClick={() => onEdit(asset)}
                >
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow>
              <TableHead>Asset</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Cost</TableHead>
              <TableHead>Branch</TableHead>
              <TableHead>Assigned employee</TableHead>
              <TableHead>Status</TableHead>
              {canManage && <TableHead className="text-right">Actions</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => (
              <TableRow key={asset.id}>
                <TableCell>
                  <div className="font-medium">{asset.name}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {asset.assetType === "PHYSICAL"
                      ? asset.assetCode
                      : asset.serialNumber || asset.assetCode}
                    {asset.assetType === "PHYSICAL" && asset.serialNumber
                      ? ` · ${asset.serialNumber}`
                      : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    <AssetTypeBadge type={asset.assetType} />
                    {asset.assignmentScope === "COMPANY" && (
                      <Badge variant="outline">Company use</Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div>{formatCurrency(asset.purchaseValue)}</div>
                  <div className="text-xs text-muted-foreground">
                    {costLabel(asset.costFrequency)}
                  </div>
                </TableCell>
                <TableCell>
                  {asset.assetType === "ONLINE" ? "Not applicable" : (asset.branchName ?? "-")}
                </TableCell>
                <TableCell>
                  {asset.assignmentScope === "COMPANY" ? (
                    <span className="text-muted-foreground">Company use</span>
                  ) : asset.assignedEmployeeName ? (
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
                  <AssetStatus status={asset.status} />
                </TableCell>
                {canManage && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {canAssign(asset) && (
                        <Button size="sm" onClick={() => onAssign(asset)}>
                          <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Assign
                        </Button>
                      )}
                      {canReturn(asset) && (
                        <Button size="sm" variant="outline" onClick={() => onReturn(asset)}>
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Return
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="outline"
                        title="Edit asset"
                        onClick={() => onEdit(asset)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {assets.length === 0 && (
        <div className="p-8 text-center">
          <p className="text-sm font-medium">{emptyTitle}</p>
          <p className="mt-1 text-xs text-muted-foreground">{emptyHint}</p>
        </div>
      )}
    </div>
  );
}

function InvestmentSection({ investments }: { investments: EmployeeAssetInvestment[] }) {
  if (investments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Assign assets to employees to see company investment per person.
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
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
              <Badge variant="outline">{item.physicalAssets + item.onlineAssets} assets</Badge>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <InvestmentValue label="One-time invested" value={item.oneTimeInvestment} />
              <InvestmentValue label="Monthly recurring" value={item.monthlyRecurring} />
              <InvestmentValue label="Annual recurring" value={item.annualRecurring} />
              <InvestmentValue
                label="First-year investment"
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
              <TableHead className="text-right">One-time invested</TableHead>
              <TableHead className="text-right">Monthly recurring</TableHead>
              <TableHead className="text-right">Annual recurring</TableHead>
              <TableHead className="text-right">First-year investment</TableHead>
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
                    {item.physicalAssets} physical · {item.onlineAssets} online
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
    </div>
  );
}

function ReturnHistorySection({ rows }: { rows: AssetReturnRecord[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        No asset returns recorded yet.
      </div>
    );
  }
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card">
      {rows.slice(0, 50).map((row) => (
        <div
          key={row.id}
          className="grid gap-2 p-4 text-sm sm:grid-cols-[1fr_auto] sm:items-center"
        >
          <div>
            <p className="font-medium">
              {row.assetName}{" "}
              <span className="font-mono text-xs text-muted-foreground">{row.assetCode}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Returned by {row.employeeName} · {new Date(row.returnedAt).toLocaleString("en-IN")}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline">{row.condition.replaceAll("_", " ")}</Badge>
            {row.dataWiped && <Badge variant="outline">Data wiped / access revoked</Badge>}
            {row.physicalDamage && <Badge variant="destructive">Damage recorded</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ChecklistItem({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border p-3 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <span>{label}</span>
    </label>
  );
}

function AssetStatus({ status }: { status: CompanyAsset["status"] }) {
  const classes =
    status === "AVAILABLE"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400"
      : status === "ASSIGNED"
        ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-400"
        : status === "UNDER_REPAIR"
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400"
          : "border-border bg-muted text-muted-foreground";
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

function assetLabel(asset: CompanyAsset) {
  const idPart =
    asset.assetType === "ONLINE"
      ? asset.serialNumber || asset.assetCode
      : asset.assetCode;
  return `${asset.name} · ${idPart}`;
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
    <Card className="shadow-none">
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
