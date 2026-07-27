import { useMemo, useRef, useState } from "react";
import type { CellValue, Worksheet } from "exceljs";
import { Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AssetCatalogItem, CompanyAsset, User } from "@/types/domain";
import { assetsApi } from "@/services/api";

interface ImportRow {
  rowNumber: number;
  assetCode?: string;
  name: string;
  assetType: CompanyAsset["assetType"];
  assignmentScope: CompanyAsset["assignmentScope"];
  costFrequency: CompanyAsset["costFrequency"];
  purchaseValue: number;
  purchaseDate?: string;
  renewalDate?: string;
  serialNumber?: string;
  branchId?: string;
  branchName: string;
  status: CompanyAsset["status"];
  assignedEmployeeId?: string;
  employeeCode: string;
  location?: string;
  notes?: string;
  vehicleRegistration?: string;
  insuranceExpiry?: string;
  fitnessExpiry?: string;
  catalogId?: string;
  errors: string[];
}

const HEADERS = [
  "Asset Code*",
  "Asset Name*",
  "Asset Type*",
  "Assignment Scope*",
  "Cost Frequency*",
  "Purchase Value (INR)*",
  "Purchase / Start Date",
  "Renewal Date",
  "Serial / License ID",
  "Branch Name",
  "Status",
  "Assigned Employee Code",
  "Location",
  "Notes",
  "Vehicle Registration",
  "Insurance Expiry",
  "Fitness Expiry",
] as const;

const ASSET_TYPES = ["PHYSICAL", "ONLINE"] as const;
const SCOPES = ["EMPLOYEE", "COMPANY"] as const;
const FREQUENCIES = ["ONE_TIME", "MONTHLY", "YEARLY"] as const;
const STATUSES = ["AVAILABLE", "ASSIGNED", "UNDER_REPAIR", "RETIRED"] as const;

function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result !== undefined) return String(value.result).trim();
    if ("richText" in value)
      return value.richText
        .map((part) => part.text)
        .join("")
        .trim();
  }
  return String(value).trim();
}

function normalizeDate(value: CellValue) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = cellText(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

function normalizeEnum<T extends string>(value: string, allowed: readonly T[]): T | undefined {
  const match = allowed.find((item) => item === value.toUpperCase().replace(/\s+/g, "_"));
  return match;
}

function styleHeader(sheet: Worksheet) {
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD92D20" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.columns.forEach((column) => {
    column.width = 24;
  });
}

export function BulkAssetImport({
  branches,
  catalog,
  employees,
  existingAssets,
  onImported,
}: {
  branches: Array<{ id: string; name: string }>;
  catalog: AssetCatalogItem[];
  employees: User[];
  existingAssets: CompanyAsset[];
  onImported: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  const invalidCount = useMemo(() => rows.filter((row) => row.errors.length > 0).length, [rows]);

  async function downloadTemplate() {
    const { Workbook } = await import("exceljs");
    const workbook = new Workbook();
    workbook.creator = "Anytime Diesel Employee Management System";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Assets");
    sheet.addRow([...HEADERS]);
    styleHeader(sheet);
    sheet.addRow([
      "ATD-LAP-001",
      "Laptop",
      "PHYSICAL",
      "EMPLOYEE",
      "ONE_TIME",
      45000,
      new Date().toISOString().slice(0, 10),
      "",
      "SN-SAMPLE-001",
      branches[0]?.name || "Head Office",
      "AVAILABLE",
      "",
      "IT Store",
      "Sample row — replace or delete before import",
      "",
      "",
      "",
    ]);
    sheet.addRow([
      "",
      "Microsoft 365",
      "ONLINE",
      "COMPANY",
      "YEARLY",
      12000,
      new Date().toISOString().slice(0, 10),
      "",
      "tenant-sample@anytimediesel.com",
      "",
      "AVAILABLE",
      "",
      "",
      "Online license sample — Asset Code can be blank for ONLINE",
      "",
      "",
      "",
    ]);

    const instructions = workbook.addWorksheet("Instructions");
    instructions.addRow(["Field", "Rules"]);
    styleHeader(instructions);
    [
      ["Asset Code*", "Required for PHYSICAL. Unique. Leave blank for ONLINE (auto-generated)."],
      ["Asset Name*", "Required. Prefer an existing catalog name when possible."],
      ["Asset Type*", "PHYSICAL or ONLINE"],
      ["Assignment Scope*", "EMPLOYEE (can be assigned to people) or COMPANY (shared use)"],
      ["Cost Frequency*", "ONE_TIME, MONTHLY, or YEARLY"],
      ["Purchase Value (INR)*", "Number >= 0"],
      ["Purchase / Start Date", "YYYY-MM-DD"],
      ["Renewal Date", "YYYY-MM-DD — mainly for MONTHLY/YEARLY online subscriptions"],
      ["Branch Name", "Match a branch from the Branches sheet (PHYSICAL assets)"],
      ["Status", "AVAILABLE, ASSIGNED, UNDER_REPAIR, or RETIRED (default AVAILABLE)"],
      ["Assigned Employee Code", "Required only when Status is ASSIGNED; must match Employees sheet"],
      ["Vehicle fields", "Optional for bowsers/vehicles: registration, insurance expiry, fitness expiry"],
      ["Import limit", "Up to 500 rows per file. Delete sample rows before importing."],
    ].forEach((row) => instructions.addRow(row));
    instructions.getColumn(1).width = 28;
    instructions.getColumn(2).width = 90;

    const enums = workbook.addWorksheet("Allowed Values");
    enums.addRow(["Asset Type", "Assignment Scope", "Cost Frequency", "Status"]);
    styleHeader(enums);
    const max = Math.max(ASSET_TYPES.length, SCOPES.length, FREQUENCIES.length, STATUSES.length);
    for (let index = 0; index < max; index += 1) {
      enums.addRow([
        ASSET_TYPES[index] || "",
        SCOPES[index] || "",
        FREQUENCIES[index] || "",
        STATUSES[index] || "",
      ]);
    }

    const branchSheet = workbook.addWorksheet("Branches");
    branchSheet.addRow(["Branch Name", "Branch ID"]);
    styleHeader(branchSheet);
    branches.forEach((branch) => branchSheet.addRow([branch.name, branch.id]));

    const employeeSheet = workbook.addWorksheet("Employees");
    employeeSheet.addRow(["Employee Code", "Name", "Employee ID"]);
    styleHeader(employeeSheet);
    employees
      .filter((person) => person.active && person.employeeId)
      .forEach((person) =>
        employeeSheet.addRow([person.employeeCode || "", person.name, person.employeeId]),
      );

    const catalogSheet = workbook.addWorksheet("Catalog Names");
    catalogSheet.addRow(["Catalog Name", "Category", "Default Value"]);
    styleHeader(catalogSheet);
    catalog.forEach((item) =>
      catalogSheet.addRow([item.name, item.category, item.defaultValue ?? ""]),
    );

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `ATD-Asset-Import-${new Date().toISOString().slice(0, 10)}.xlsx`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Asset import template downloaded");
  }

  async function readFile(file: File) {
    setReading(true);
    setFileName(file.name);
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      await workbook.xlsx.load(await file.arrayBuffer());
      const sheet = workbook.getWorksheet("Assets") ?? workbook.worksheets[0];
      if (!sheet) throw new Error("No Assets sheet found in the workbook");

      const headerRow = sheet.getRow(1);
      const headerMap = new Map<string, number>();
      headerRow.eachCell((cell, col) => {
        const key = cellText(cell.value);
        if (key) headerMap.set(key, col);
      });
      for (const header of HEADERS) {
        if (!headerMap.has(header) && !headerMap.has(header.replace("*", ""))) {
          // tolerate missing optional asterisk variants
          const plain = header.replace("*", "");
          if (![...headerMap.keys()].some((key) => key.replace("*", "") === plain)) {
            throw new Error(`Missing column: ${header}`);
          }
        }
      }

      function col(header: (typeof HEADERS)[number]) {
        return (
          headerMap.get(header) ||
          headerMap.get(header.replace("*", "")) ||
          [...headerMap.entries()].find(([key]) => key.replace("*", "") === header.replace("*", ""))?.[1]
        );
      }

      const branchByName = new Map(
        branches.map((branch) => [branch.name.trim().toLowerCase(), branch.id]),
      );
      const employeeByCode = new Map(
        employees
          .filter((person) => person.employeeId)
          .flatMap((person) => {
            const id = person.employeeId!;
            const entries: Array<[string, string]> = [[id.toLowerCase(), id]];
            if (person.employeeCode) entries.push([person.employeeCode.toLowerCase(), id]);
            return entries;
          }),
      );
      const catalogByName = new Map(
        catalog.map((item) => [item.name.trim().toLowerCase(), item]),
      );
      const existingCodes = new Set(
        existingAssets.map((asset) => asset.assetCode.trim().toLowerCase()),
      );

      const parsed: ImportRow[] = [];
      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const get = (header: (typeof HEADERS)[number]) => {
          const index = col(header);
          return index ? row.getCell(index).value : undefined;
        };
        const name = cellText(get("Asset Name*"));
        if (!name) return;

        const assetTypeRaw = cellText(get("Asset Type*")).toUpperCase();
        const scopeRaw = cellText(get("Assignment Scope*")).toUpperCase();
        const frequencyRaw = cellText(get("Cost Frequency*")).toUpperCase();
        const statusRaw = cellText(get("Status")).toUpperCase() || "AVAILABLE";
        const assetCode = cellText(get("Asset Code*")) || undefined;
        const branchName = cellText(get("Branch Name"));
        const employeeCode = cellText(get("Assigned Employee Code"));
        const purchaseValueText = cellText(get("Purchase Value (INR)*"));
        const purchaseValue = Number(purchaseValueText.replace(/,/g, ""));
        const catalogItem = catalogByName.get(name.toLowerCase());

        const errors: string[] = [];
        const assetType = normalizeEnum(assetTypeRaw, ASSET_TYPES);
        const assignmentScope = normalizeEnum(scopeRaw, SCOPES);
        const costFrequency = normalizeEnum(frequencyRaw, FREQUENCIES);
        const status = normalizeEnum(statusRaw, STATUSES);

        if (!assetType) errors.push("Asset Type must be PHYSICAL or ONLINE");
        if (!assignmentScope) errors.push("Assignment Scope must be EMPLOYEE or COMPANY");
        if (!costFrequency) errors.push("Cost Frequency must be ONE_TIME, MONTHLY, or YEARLY");
        if (!status) errors.push("Status is invalid");
        if (!Number.isFinite(purchaseValue) || purchaseValue < 0) {
          errors.push("Purchase Value must be a number >= 0");
        }
        if (assetType === "PHYSICAL" && !assetCode) errors.push("Asset Code is required for PHYSICAL");
        if (assetCode && assetCode.length < 2) errors.push("Asset Code is too short");
        if (assetCode && existingCodes.has(assetCode.toLowerCase())) {
          errors.push("Asset Code already exists");
        }
        if (
          /^SAMPLE-/i.test(assetCode ?? "") ||
          /sample row/i.test(cellText(get("Notes")))
        ) {
          errors.push("Replace or delete this example row before importing");
        }
        if (assignmentScope === "COMPANY" && employeeCode) {
          errors.push("Company-use assets cannot be assigned to an employee");
        }
        if (status === "ASSIGNED" && !employeeCode) {
          errors.push("Assigned Employee Code is required when Status is ASSIGNED");
        }
        if (status === "ASSIGNED" && assignmentScope !== "EMPLOYEE") {
          errors.push("Only EMPLOYEE-scoped assets can be ASSIGNED");
        }

        let branchId: string | undefined;
        if (branchName) {
          branchId = branchByName.get(branchName.toLowerCase());
          if (!branchId) errors.push(`Branch not found: ${branchName}`);
        } else if (assetType === "PHYSICAL") {
          // optional but helpful
        }

        let assignedEmployeeId: string | undefined;
        if (employeeCode) {
          assignedEmployeeId = employeeByCode.get(employeeCode.toLowerCase());
          if (!assignedEmployeeId) errors.push(`Employee not found: ${employeeCode}`);
        }

        if (catalogItem && assetType && catalogItem.category !== assetType && catalogItem.category !== "Company Asset") {
          errors.push(`Catalog name "${name}" is category ${catalogItem.category}, not ${assetType}`);
        }

        parsed.push({
          rowNumber,
          assetCode,
          name,
          assetType: assetType || "PHYSICAL",
          assignmentScope: assignmentScope || "EMPLOYEE",
          costFrequency: costFrequency || "ONE_TIME",
          purchaseValue: Number.isFinite(purchaseValue) ? purchaseValue : 0,
          purchaseDate: normalizeDate(get("Purchase / Start Date")),
          renewalDate: normalizeDate(get("Renewal Date")),
          serialNumber: cellText(get("Serial / License ID")) || undefined,
          branchId,
          branchName,
          status: status || "AVAILABLE",
          assignedEmployeeId,
          employeeCode,
          location: cellText(get("Location")) || undefined,
          notes: cellText(get("Notes")) || undefined,
          vehicleRegistration: cellText(get("Vehicle Registration")) || undefined,
          insuranceExpiry: normalizeDate(get("Insurance Expiry")),
          fitnessExpiry: normalizeDate(get("Fitness Expiry")),
          catalogId: catalogItem?.id,
          errors,
        });
      });

      if (parsed.length === 0) throw new Error("No asset rows found in the workbook");
      if (parsed.length > 500) throw new Error("Import is limited to 500 assets per file");

      const codeCounts = new Map<string, number>();
      parsed.forEach((row) => {
        if (!row.assetCode) return;
        const key = row.assetCode.toLowerCase();
        codeCounts.set(key, (codeCounts.get(key) ?? 0) + 1);
      });
      parsed.forEach((row) => {
        if (row.assetCode && (codeCounts.get(row.assetCode.toLowerCase()) ?? 0) > 1) {
          row.errors.push("Duplicate Asset Code in workbook");
        }
      });

      setRows(parsed);
      toast.success(`Validated ${parsed.length} asset row${parsed.length === 1 ? "" : "s"}`);
    } catch (error) {
      setRows([]);
      toast.error((error as Error).message);
    } finally {
      setReading(false);
    }
  }

  async function importRows() {
    const validRows = rows.filter((row) => row.errors.length === 0);
    if (!validRows.length || invalidCount) return;
    setImporting(true);
    setProgress({ completed: 0, total: validRows.length });
    const failures: Array<{ row: number; message: string }> = [];

    for (let index = 0; index < validRows.length; index += 1) {
      const row = validRows[index];
      try {
        await assetsApi.create({
          assetCode: row.assetType === "ONLINE" ? row.assetCode : row.assetCode!,
          catalogId: row.catalogId || null,
          name: row.name,
          category: row.assetType,
          serialNumber: row.serialNumber || null,
          purchaseValue: row.purchaseValue,
          purchaseDate: row.purchaseDate || null,
          assetType: row.assetType,
          assignmentScope: row.assignmentScope,
          costFrequency: row.costFrequency,
          renewalDate: row.renewalDate || null,
          status: row.status,
          assignedEmployeeId: row.assignedEmployeeId || null,
          branchId: row.assetType === "ONLINE" ? null : row.branchId || null,
          location: row.location || null,
          notes: row.notes || null,
          vehicleRegistration: row.vehicleRegistration || null,
          insuranceExpiry: row.insuranceExpiry || null,
          fitnessExpiry: row.fitnessExpiry || null,
        });
      } catch (error) {
        failures.push({ row: row.rowNumber, message: (error as Error).message });
      }
      setProgress({ completed: index + 1, total: validRows.length });
    }

    setImporting(false);
    if (failures.length) {
      setRows((current) =>
        current
          .filter((row) => failures.some((item) => item.row === row.rowNumber))
          .map((row) => {
            const failure = failures.find((item) => item.row === row.rowNumber);
            return failure ? { ...row, errors: [failure.message] } : row;
          }),
      );
      await onImported();
      toast.error(
        `${validRows.length - failures.length} imported; ${failures.length} row${failures.length === 1 ? "" : "s"} failed.`,
      );
    } else {
      toast.success(`${validRows.length} assets imported successfully.`);
      await onImported();
      setOpen(false);
      setRows([]);
      setFileName("");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FileSpreadsheet className="mr-2 h-4 w-4" /> Bulk import
      </Button>
      <Dialog open={open} onOpenChange={(next) => !importing && setOpen(next)}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk import assets</DialogTitle>
            <DialogDescription>
              Download the Excel template, fill one row per asset, then upload it for validation
              before anything is saved.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start p-4"
              onClick={() => void downloadTemplate()}
            >
              <Download className="mr-3 h-5 w-5" />
              <span className="text-left">
                <span className="block font-medium">Download Excel template</span>
                <span className="block text-xs text-muted-foreground">
                  Includes sample rows, branches, employees, and catalog names
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto justify-start p-4"
              disabled={reading}
              onClick={() => inputRef.current?.click()}
            >
              {reading ? (
                <Loader2 className="mr-3 h-5 w-5 animate-spin" />
              ) : (
                <Upload className="mr-3 h-5 w-5" />
              )}
              <span className="min-w-0 text-left">
                <span className="block font-medium">Upload completed template</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {fileName || ".xlsx files up to 500 assets"}
                </span>
              </span>
            </Button>
            <input
              ref={inputRef}
              className="hidden"
              type="file"
              accept=".xlsx"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
                event.target.value = "";
              }}
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <p>
                {rows.length - invalidCount} ready · {invalidCount} with errors
              </p>
              {importing && (
                <p className="text-muted-foreground">
                  Importing {progress.completed}/{progress.total}…
                </p>
              )}
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {rows.slice(0, 40).map((row) => (
                  <div
                    key={row.rowNumber}
                    className={`rounded-md px-2 py-1 ${
                      row.errors.length ? "bg-destructive/10 text-destructive" : "bg-muted/40"
                    }`}
                  >
                    Row {row.rowNumber}: {row.assetCode || "(online)"} · {row.name}
                    {row.errors.length > 0 && ` — ${row.errors.join("; ")}`}
                  </div>
                ))}
                {rows.length > 40 && (
                  <p className="text-xs text-muted-foreground">
                    Showing first 40 of {rows.length} rows.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" disabled={importing} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={importing || rows.length === 0 || invalidCount > 0}
              onClick={() => void importRows()}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importing…
                </>
              ) : (
                `Import ${rows.length - invalidCount || 0} assets`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
