import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import {
  DesktopTable,
  MobileList,
  MobileListFields,
  MobileListHeader,
  MobileListItem,
  ResponsiveListShell,
} from "@/components/common/ResponsiveList";
import { Button } from "@/components/ui/button";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Branch } from "@/types/domain";
import { useAuth } from "@/lib/auth";
import { workLocationsApi, type WorkLocationMeta } from "@/services/api";
import { Crosshair, Pencil, Plus, RotateCcw, Search } from "lucide-react";

export const Route = createFileRoute("/_app/branches")({
  component: WorkLocationsPage,
});

type FormState = {
  name: string;
  code: string;
  locationType: string;
  addressLine1: string;
  addressLine2: string;
  locality: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: string;
  longitude: string;
  attendanceRadiusMeters: string;
  timezone: string;
  description: string;
};

const emptyForm = (): FormState => ({
  name: "",
  code: "",
  locationType: "OFFICE",
  addressLine1: "",
  addressLine2: "",
  locality: "",
  city: "",
  state: "TELANGANA",
  postalCode: "",
  country: "India",
  latitude: "",
  longitude: "",
  attendanceRadiusMeters: "250",
  timezone: "Asia/Kolkata",
  description: "",
});

function suggestLocationCode(name: string) {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function stateLabel(meta: WorkLocationMeta | null, code?: string) {
  if (!code) return "";
  return meta?.indiaStates.find((s) => s.code === code)?.label ?? code;
}

function typeLabel(meta: WorkLocationMeta | null, type?: string) {
  if (!type) return "";
  return meta?.locationTypes.find((t) => t.value === type)?.label ?? type;
}

function WorkLocationsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const canWrite = user?.role === "developer_admin";
  const geofenceAckRef = useRef(false);

  const [locations, setLocations] = useState<Branch[]>([]);
  const [meta, setMeta] = useState<WorkLocationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [codeTouched, setCodeTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Branch | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [deactivateTarget, setDeactivateTarget] = useState<Branch | null>(null);
  const [geofenceWarning, setGeofenceWarning] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const initialFormRef = useRef<string>("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [rows, catalog] = await Promise.all([
        workLocationsApi.list(),
        workLocationsApi.meta(),
      ]);
      setLocations(rows);
      setMeta(catalog);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!detailId) {
      setDetail(null);
      return;
    }
    setDetailLoading(true);
    workLocationsApi
      .get(detailId)
      .then(setDetail)
      .catch((err) => toast.error((err as Error).message))
      .finally(() => setDetailLoading(false));
  }, [detailId]);

  useEffect(() => {
    if (!formDirty || !showForm) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [formDirty, showForm]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations.filter((row) => {
      if (statusFilter === "ACTIVE" && row.status !== "ACTIVE") return false;
      if (statusFilter === "INACTIVE" && row.status !== "INACTIVE") return false;
      if (typeFilter !== "ALL" && row.locationType !== typeFilter) return false;
      if (!q) return true;
      return [row.name, row.code, row.city, row.locationCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [locations, search, statusFilter, typeFilter]);

  function markForm(next: FormState | ((current: FormState) => FormState)) {
    setForm((current) => {
      const resolved = typeof next === "function" ? next(current) : next;
      setFormDirty(JSON.stringify(resolved) !== initialFormRef.current);
      return resolved;
    });
  }

  function resetForm() {
    setEditing(null);
    setForm(emptyForm());
    setCodeTouched(false);
    setShowForm(false);
    setGeofenceWarning(false);
    setFormDirty(false);
    initialFormRef.current = "";
    geofenceAckRef.current = false;
  }

  function requestCloseForm() {
    if (formDirty) {
      setDiscardOpen(true);
      return;
    }
    resetForm();
  }

  function openCreate() {
    setEditing(null);
    const blank = emptyForm();
    setForm(blank);
    initialFormRef.current = JSON.stringify(blank);
    setFormDirty(false);
    setCodeTouched(false);
    geofenceAckRef.current = false;
    setShowForm(true);
  }

  function openEdit(row: Branch) {
    setEditing(row);
    const next: FormState = {
      name: row.name,
      code: row.code,
      locationType: row.locationType || (row.isHub ? "PARKING_HUB" : "OFFICE"),
      addressLine1: row.addressLine1 || row.address || "",
      addressLine2: row.addressLine2 || "",
      locality: row.locality || "",
      city: row.city || "",
      state: row.state || "TELANGANA",
      postalCode: row.postalCode || "",
      country: row.country || "India",
      latitude: row.latitude != null ? String(row.latitude) : "",
      longitude: row.longitude != null ? String(row.longitude) : "",
      attendanceRadiusMeters: String(row.attendanceRadiusMeters ?? 250),
      timezone: row.timezone || "Asia/Kolkata",
      description: row.description || "",
    };
    setForm(next);
    initialFormRef.current = JSON.stringify(next);
    setFormDirty(false);
    setCodeTouched(true);
    geofenceAckRef.current = false;
    setShowForm(true);
  }

  function onNameChange(name: string) {
    markForm((current) => ({
      ...current,
      name,
      code: codeTouched || editing ? current.code : suggestLocationCode(name),
    }));
  }

  async function useCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error(t("pages.branches.toastGeoUnsupported"));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((current) => {
          const resolved = {
            ...current,
            latitude: String(pos.coords.latitude),
            longitude: String(pos.coords.longitude),
          };
          setFormDirty(JSON.stringify(resolved) !== initialFormRef.current);
          return resolved;
        });
        setLocating(false);
        toast.success(t("pages.branches.toastGeoFilled"));
      },
      (err) => {
        setLocating(false);
        toast.error(err.message || t("pages.branches.toastGeoFailed"));
      },
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  }

  async function persistLocation() {
    const radius = Number(form.attendanceRadiusMeters);
    const payload = {
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      locationType: form.locationType,
      addressLine1: form.addressLine1.trim(),
      addressLine2: form.addressLine2.trim() || null,
      locality: form.locality.trim() || null,
      city: form.city.trim(),
      state: form.state,
      postalCode: form.postalCode.trim(),
      country: form.country.trim() || "India",
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      attendanceRadiusMeters: radius,
      timezone: form.timezone || "Asia/Kolkata",
      description: form.description.trim() || null,
    };
    setSaving(true);
    try {
      const saved = editing
        ? await workLocationsApi.update(editing.id, payload)
        : await workLocationsApi.create(payload);
      setLocations((prev) =>
        editing
          ? prev.map((row) => (row.id === saved.id ? { ...row, ...saved } : row))
          : [saved, ...prev],
      );
      toast.success(
        editing ? t("pages.branches.toastUpdated") : t("pages.branches.toastCreated"),
      );
      if (detailId === saved.id) {
        setDetail((current) => (current ? { ...current, ...saved } : saved));
      }
      resetForm();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveLocation(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.code.trim() || !form.addressLine1.trim()) {
      toast.error(t("pages.branches.toastFieldsRequired"));
      return;
    }
    if (!form.city.trim() || !form.state || !form.postalCode.trim()) {
      toast.error(t("pages.branches.toastAddressRequired"));
      return;
    }
    if (!form.latitude || !form.longitude) {
      toast.error(t("pages.branches.toastLatLongBoth"));
      return;
    }
    const radius = Number(form.attendanceRadiusMeters);
    if (!Number.isInteger(radius) || radius < 25 || radius > 5000) {
      toast.error(t("pages.branches.toastRadiusInvalid"));
      return;
    }
    const geofenceChanged =
      !!editing &&
      ((editing.latitude != null && Number(form.latitude) !== Number(editing.latitude)) ||
        (editing.longitude != null && Number(form.longitude) !== Number(editing.longitude)) ||
        radius !== (editing.attendanceRadiusMeters ?? 250));
    if (geofenceChanged && !geofenceAckRef.current) {
      setGeofenceWarning(true);
      return;
    }
    await persistLocation();
  }

  async function deactivateLocation(row: Branch) {
    try {
      const saved = await workLocationsApi.deactivate(row.id);
      setLocations((prev) =>
        prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)),
      );
      setDetail((current) =>
        current && current.id === saved.id ? { ...current, ...saved } : current,
      );
      toast.success(t("pages.branches.toastDeactivated"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function reactivateLocation(row: Branch) {
    try {
      const saved = await workLocationsApi.reactivate(row.id);
      setLocations((prev) =>
        prev.map((item) => (item.id === saved.id ? { ...item, ...saved } : item)),
      );
      setDetail((current) =>
        current && current.id === saved.id ? { ...current, ...saved } : current,
      );
      toast.success(t("pages.branches.toastReactivated"));
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("pages.branches.title")}
        description={t("pages.branches.subtitle")}
        actions={
          canWrite ? (
            <Button size="sm" onClick={openCreate} className="min-h-11 w-full sm:w-auto">
              <Plus className="mr-2 h-4 w-4" /> {t("pages.branches.addLocation")}
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("pages.branches.searchPlaceholder")}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("pages.branches.filterStatusAll")}</SelectItem>
            <SelectItem value="ACTIVE">{t("pages.branches.filterActive")}</SelectItem>
            <SelectItem value="INACTIVE">{t("pages.branches.filterInactive")}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t("pages.branches.filterTypeAll")}</SelectItem>
            {(meta?.locationTypes ?? []).map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && <LoadingState label={t("pages.loading.branches")} />}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && (
        <ResponsiveListShell>
          <MobileList>
            {filtered.map((row) => (
              <MobileListItem key={row.id}>
                <MobileListHeader
                  title={row.name}
                  meta={typeLabel(meta, row.locationType)}
                  trailing={
                    <StatusBadge status={row.status === "ACTIVE" ? "Active" : "Inactive"} />
                  }
                />
                <MobileListFields>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      {[row.city, stateLabel(meta, row.state)].filter(Boolean).join(", ") || "—"}
                    </p>
                    <p className="mt-1 text-sm">
                      {row.attendanceRadiusMeters ?? 250} m attendance radius
                    </p>
                  </div>
                </MobileListFields>
                <div className="mt-3">
                  <Button size="sm" variant="outline" onClick={() => setDetailId(row.id)}>
                    {t("pages.branches.view")}
                  </Button>
                </div>
              </MobileListItem>
            ))}
          </MobileList>

          <DesktopTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pages.branches.colName")}</TableHead>
                  <TableHead>{t("pages.branches.colCode")}</TableHead>
                  <TableHead>{t("pages.branches.colType")}</TableHead>
                  <TableHead>{t("pages.branches.colCity")}</TableHead>
                  <TableHead>{t("pages.branches.colRadius")}</TableHead>
                  <TableHead>{t("pages.branches.colStatus")}</TableHead>
                  <TableHead>{t("pages.branches.colEmployees")}</TableHead>
                  <TableHead className="text-right">{t("pages.branches.colActions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell>{typeLabel(meta, row.locationType)}</TableCell>
                    <TableCell>
                      {row.city || "—"}
                      {row.state ? `, ${stateLabel(meta, row.state)}` : ""}
                    </TableCell>
                    <TableCell>{row.attendanceRadiusMeters ?? 250} m</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status === "ACTIVE" ? "Active" : "Inactive"} />
                    </TableCell>
                    <TableCell>{row.employeeCount ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setDetailId(row.id)}>
                          {t("pages.branches.view")}
                        </Button>
                        {canWrite && (
                          <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>
                            {t("common.edit")}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </DesktopTable>
        </ResponsiveListShell>
      )}

      {!loading && filtered.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("pages.branches.empty")}</p>
      )}

      <Dialog
        open={showForm}
        onOpenChange={(open) => {
          if (!open) requestCloseForm();
        }}
      >
        <DialogContent
          className="max-h-[90dvh] max-w-2xl overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]"
          onPointerDownOutside={(e) => {
            if (formDirty) {
              e.preventDefault();
              setDiscardOpen(true);
            }
          }}
          onEscapeKeyDown={(e) => {
            if (formDirty) {
              e.preventDefault();
              setDiscardOpen(true);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {editing ? t("pages.branches.editLocation") : t("pages.branches.addLocation")}
            </DialogTitle>
            <DialogDescription>{t("pages.branches.formHelp")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void saveLocation(e)} className="space-y-5">
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("pages.branches.sectionBasic")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wl-name">{t("pages.branches.fieldName")} *</Label>
                  <Input
                    id="wl-name"
                    value={form.name}
                    onChange={(e) => onNameChange(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-code">{t("pages.branches.fieldCode")} *</Label>
                  <Input
                    id="wl-code"
                    value={form.code}
                    onChange={(e) => {
                      setCodeTouched(true);
                      markForm((current) => ({
                        ...current,
                        code: e.target.value.toUpperCase(),
                      }));
                    }}
                    className="font-mono uppercase"
                  />
                  <p className="text-xs text-muted-foreground">{t("pages.branches.codeHelp")}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-type">{t("pages.branches.fieldType")} *</Label>
                  <Select
                    value={form.locationType}
                    onValueChange={(value) => markForm((current) => ({ ...current, locationType: value }))}
                  >
                    <SelectTrigger id="wl-type">
                      <SelectValue placeholder={t("pages.branches.selectType")} />
                    </SelectTrigger>
                    <SelectContent>
                      {(meta?.locationTypes ?? []).map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wl-description">{t("pages.branches.fieldDescription")}</Label>
                  <Textarea
                    id="wl-description"
                    value={form.description}
                    onChange={(e) =>
                      markForm((current) => ({ ...current, description: e.target.value }))
                    }
                    rows={2}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("pages.branches.sectionAddress")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wl-address1">{t("pages.branches.fieldAddress1")} *</Label>
                  <Input
                    id="wl-address1"
                    value={form.addressLine1}
                    onChange={(e) =>
                      markForm((current) => ({ ...current, addressLine1: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wl-address2">{t("pages.branches.fieldAddress2")}</Label>
                  <Input
                    id="wl-address2"
                    value={form.addressLine2}
                    onChange={(e) =>
                      markForm((current) => ({ ...current, addressLine2: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-locality">{t("pages.branches.fieldLocality")}</Label>
                  <Input
                    id="wl-locality"
                    value={form.locality}
                    onChange={(e) =>
                      markForm((current) => ({ ...current, locality: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-city">{t("pages.branches.fieldCity")} *</Label>
                  <Input
                    id="wl-city"
                    value={form.city}
                    onChange={(e) => markForm((current) => ({ ...current, city: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-state">{t("pages.branches.fieldState")} *</Label>
                  <Select
                    value={form.state}
                    onValueChange={(value) => markForm((current) => ({ ...current, state: value }))}
                  >
                    <SelectTrigger id="wl-state">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      {(meta?.indiaStates ?? []).map((item) => (
                        <SelectItem key={item.code} value={item.code}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-postal">{t("pages.branches.fieldPostal")} *</Label>
                  <Input
                    id="wl-postal"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={form.postalCode}
                    onChange={(e) =>
                      markForm((current) => ({
                        ...current,
                        postalCode: e.target.value.replace(/\D/g, "").slice(0, 6),
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="wl-country">{t("pages.branches.fieldCountry")} *</Label>
                  <Select
                    value={form.country || "India"}
                    onValueChange={(value) => markForm((current) => ({ ...current, country: value }))}
                  >
                    <SelectTrigger id="wl-country">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="India">India</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-sm font-semibold">{t("pages.branches.sectionGeofence")}</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="wl-lat">{t("pages.branches.fieldLatitude")} *</Label>
                  <Input
                    id="wl-lat"
                    type="number"
                    step="any"
                    value={form.latitude}
                    onChange={(e) =>
                      markForm((current) => ({ ...current, latitude: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-lng">{t("pages.branches.fieldLongitude")} *</Label>
                  <Input
                    id="wl-lng"
                    type="number"
                    step="any"
                    value={form.longitude}
                    onChange={(e) =>
                      markForm((current) => ({ ...current, longitude: e.target.value }))
                    }
                  />
                </div>
                {canWrite && (
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={locating}
                      onClick={() => void useCurrentLocation()}
                    >
                      <Crosshair className="mr-2 h-4 w-4" />
                      {locating
                        ? t("pages.branches.locating")
                        : t("pages.branches.useCurrentLocation")}
                    </Button>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("pages.branches.useCurrentLocationHelp")}
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="wl-radius">{t("pages.branches.fieldRadius")} *</Label>
                  <Input
                    id="wl-radius"
                    type="number"
                    min={25}
                    max={5000}
                    value={form.attendanceRadiusMeters}
                    onChange={(e) =>
                      markForm((current) => ({
                        ...current,
                        attendanceRadiusMeters: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-timezone">{t("pages.branches.fieldTimezone")}</Label>
                  <Input id="wl-timezone" value={form.timezone} readOnly className="bg-muted/40" />
                  <p className="text-xs text-muted-foreground">
                    {t("pages.branches.timezoneHelp")}
                  </p>
                </div>
              </div>
            </section>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={requestCloseForm}>
                {t("common.cancel")}
              </Button>
              <Button type="submit" disabled={saving}>
                {saving
                  ? t("common.loading")
                  : editing
                    ? t("pages.branches.updateLocation")
                    : t("pages.branches.createLocation")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.branches.discardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("pages.branches.discardBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("pages.branches.keepEditing")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardOpen(false);
                resetForm();
              }}
            >
              {t("pages.branches.discardChanges")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={geofenceWarning} onOpenChange={setGeofenceWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("pages.branches.geofenceWarningTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("pages.branches.geofenceWarningBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                geofenceAckRef.current = true;
                setGeofenceWarning(false);
                void persistLocation();
              }}
            >
              {t("pages.branches.continueSave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={!!detailId} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          <SheetHeader className="shrink-0 border-b border-border px-4 py-4 pr-12">
            <SheetTitle>{detail?.name ?? t("pages.branches.detailTitle")}</SheetTitle>
            <SheetDescription>
              {detail
                ? `${typeLabel(meta, detail.locationType)} · ${
                    detail.status === "ACTIVE"
                      ? t("pages.branches.filterActive")
                      : t("pages.branches.filterInactive")
                  }`
                : ""}
            </SheetDescription>
          </SheetHeader>
          {detailLoading && (
            <div className="px-4 py-4">
              <LoadingState label={t("pages.loading.branches")} />
            </div>
          )}
          {detail && !detailLoading && (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 pb-6">
              <section className="space-y-3">
                <h4 className="text-sm font-semibold">{t("pages.branches.sectionOverview")}</h4>
                <div className="grid gap-3 text-sm">
                  <DetailRow label={t("pages.branches.fieldCode")} value={detail.code} mono />
                  <DetailRow
                    label={t("pages.branches.sectionAddress")}
                    value={[
                      detail.addressLine1 || detail.address,
                      detail.addressLine2,
                      detail.locality,
                      [detail.city, stateLabel(meta, detail.state)].filter(Boolean).join(", "),
                      detail.postalCode,
                      detail.country,
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  />
                  <DetailRow
                    label={t("pages.branches.sectionGeofence")}
                    value={
                      detail.latitude != null && detail.longitude != null
                        ? `${detail.latitude}, ${detail.longitude}`
                        : "—"
                    }
                  />
                  <DetailRow
                    label={t("pages.branches.colRadius")}
                    value={`${detail.attendanceRadiusMeters ?? 250} m`}
                  />
                  <DetailRow
                    label={t("pages.branches.fieldTimezone")}
                    value={detail.timezone || "Asia/Kolkata"}
                  />
                </div>
              </section>

              <section>
                <h4 className="mb-2 text-sm font-semibold">
                  {t("pages.branches.sectionPeople")} ({detail.employeeCount ?? 0})
                </h4>
                {(detail.basedEmployees?.length ?? 0) === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("pages.branches.noBasedEmployees")}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {detail.basedEmployees!.map((emp) => (
                      <li
                        key={emp.employeeId}
                        className="rounded-md border border-border px-3 py-2 text-sm"
                      >
                        <p className="font-medium">{emp.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {emp.employeeCode}
                          {emp.designation ? ` · ${emp.designation}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h4 className="mb-2 text-sm font-semibold">{t("pages.branches.sectionHistory")}</h4>
                <p className="text-sm text-muted-foreground">
                  {t("pages.branches.historyHelp")}
                </p>
              </section>
              </div>

              {canWrite && (
                <div className="flex shrink-0 flex-wrap gap-2 border-t border-border bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                  <Button
                    size="sm"
                    variant="outline"
                    data-testid="wl-detail-edit"
                    onClick={() => openEdit(detail)}
                  >
                    <Pencil className="mr-2 h-4 w-4" /> {t("common.edit")}
                  </Button>
                  {detail.status === "ACTIVE" ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      data-testid="wl-detail-deactivate"
                      onClick={() => setDeactivateTarget(detail)}
                    >
                      {t("pages.branches.deactivate")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      data-testid="wl-detail-reactivate"
                      onClick={() => void reactivateLocation(detail)}
                    >
                      <RotateCcw className="mr-2 h-4 w-4" /> {t("pages.branches.reactivate")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog
        open={!!deactivateTarget}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("pages.branches.deactivateTitle", { name: deactivateTarget?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>{t("pages.branches.deactivateBody")}</p>
                {(deactivateTarget?.employeeCount ?? 0) > 0 ? (
                  <p className="font-medium text-foreground">
                    {t("pages.branches.deactivateEmployeeCount", {
                      count: deactivateTarget?.employeeCount ?? 0,
                    })}
                  </p>
                ) : null}
                <p>{t("pages.branches.deactivateNoMove")}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="wl-deactivate-confirm"
              onClick={() => {
                if (!deactivateTarget) return;
                void deactivateLocation(deactivateTarget);
                setDeactivateTarget(null);
              }}
            >
              {t("pages.branches.deactivate")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-md border border-border/70 bg-muted/20 px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-0.5 whitespace-pre-line ${mono ? "font-mono text-xs" : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}
