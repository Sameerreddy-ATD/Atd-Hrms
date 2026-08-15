import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Table2 } from "lucide-react";
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
import { ROLE_LABELS, type Branch, type Department, type User } from "@/types/domain";
import { usersApi } from "@/services/api";
import { cn } from "@/lib/utils";
import {
  LOGIN_IMPORT_COLUMNS,
  LOGIN_SHEET_NAME,
  childUnitChoices,
  createBlankRows,
  isRowBlank,
  pastedRowsMatchHeaders,
  parseClipboardTsv,
  revalidateRows,
  rowToCreatePayload,
  type LoginImportFieldKey,
  type LoginImportRow,
} from "@/components/users/loginImportColumns";

const STARTER_ROWS = 25;

export function BulkLoginSheet({
  branches,
  departments,
  existingEmployees,
  onImported,
}: {
  branches: Branch[];
  departments: Department[];
  existingEmployees: User[];
  onImported: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LoginImportRow[]>(() => createBlankRows(STARTER_ROWS));
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [focusCell, setFocusCell] = useState<{ rowId: string; key: LoginImportFieldKey } | null>(
    null,
  );
  const tableRef = useRef<HTMLDivElement>(null);

  const mainUnits = useMemo(
    () => departments.filter((department) => !department.parentDepartmentId),
    [departments],
  );
  const childChoices = useMemo(() => childUnitChoices(departments), [departments]);
  const managerOptions = useMemo(() => {
    return existingEmployees
      .filter((employee) => employee.employeeId)
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((employee) => ({
        value: employee.employeeCode || employee.email || employee.employeeId || "",
        label: `${employee.name}${employee.employeeCode ? ` (${employee.employeeCode})` : ""}`,
      }))
      .filter((option) => option.value);
  }, [existingEmployees]);

  const filledRows = useMemo(() => rows.filter((row) => !isRowBlank(row)), [rows]);
  const invalidCount = useMemo(
    () => filledRows.filter((row) => row.errors.length > 0).length,
    [filledRows],
  );
  const readyCount = filledRows.length - invalidCount;

  useEffect(() => {
    if (!open) return;
    setRows((current) => revalidateRows(current, { branches, departments, existingEmployees }));
  }, [open, branches, departments, existingEmployees]);

  function updateCell(rowId: string, key: LoginImportFieldKey, value: string) {
    setRows((current) => {
      const next = current.map((row) => (row.id === rowId ? { ...row, [key]: value } : row));
      return revalidateRows(next, { branches, departments, existingEmployees });
    });
  }

  function addRows(count = 10) {
    setRows((current) => [...current, ...createBlankRows(count, current.length)]);
  }

  function resetSheet() {
    setRows(createBlankRows(STARTER_ROWS));
    setFocusCell(null);
    setProgress({ completed: 0, total: 0 });
  }

  function applyPaste(startRowIndex: number, startColIndex: number, matrix: string[][]) {
    setRows((current) => {
      const next = [...current];
      let working = matrix;
      if (working.length > 0 && pastedRowsMatchHeaders(working[0])) {
        working = working.slice(1);
      }
      const needed = startRowIndex + working.length - next.length;
      if (needed > 0) {
        next.push(...createBlankRows(needed, next.length));
      }
      working.forEach((cells, rowOffset) => {
        const rowIndex = startRowIndex + rowOffset;
        const row = { ...next[rowIndex] };
        cells.forEach((cell, colOffset) => {
          const column = LOGIN_IMPORT_COLUMNS[startColIndex + colOffset];
          if (!column) return;
          row[column.key] = cell;
        });
        next[rowIndex] = row;
      });
      return revalidateRows(next, { branches, departments, existingEmployees });
    });
  }

  function handlePaste(event: React.ClipboardEvent) {
    const text = event.clipboardData.getData("text/plain");
    if (!text || (!text.includes("\t") && !text.includes("\n"))) return;
    event.preventDefault();
    const matrix = parseClipboardTsv(text);
    if (!matrix.length) return;

    let startRowIndex = 0;
    let startColIndex = 0;
    if (focusCell) {
      startRowIndex = Math.max(
        0,
        rows.findIndex((row) => row.id === focusCell.rowId),
      );
      startColIndex = Math.max(
        0,
        LOGIN_IMPORT_COLUMNS.findIndex((column) => column.key === focusCell.key),
      );
    }
    applyPaste(startRowIndex, startColIndex, matrix);
    toast.success(`Pasted ${matrix.length} row${matrix.length === 1 ? "" : "s"} into the sheet`);
  }

  async function createLogins() {
    const validRows = rows.filter((row) => !isRowBlank(row) && row.errors.length === 0);
    if (!validRows.length || invalidCount) return;
    setImporting(true);
    setProgress({ completed: 0, total: validRows.length });
    const failures: Array<{ id: string; message: string }> = [];
    const resolvedManagerIds = new Map<string, string>();
    existingEmployees.forEach((employee) => {
      if (!employee.employeeId) return;
      [employee.employeeCode, employee.employeeId, employee.email]
        .filter(Boolean)
        .forEach((key) => {
          resolvedManagerIds.set(String(key).trim().toLowerCase(), employee.employeeId!);
        });
    });

    const pending = [...validRows];
    while (pending.length) {
      const ready = pending
        .filter((row) => {
          const payload = rowToCreatePayload(row, { branches, departments });
          return !payload.managerReference || resolvedManagerIds.has(payload.managerReference);
        })
        .slice(0, 4);
      if (!ready.length) {
        pending.forEach((row) =>
          failures.push({
            id: row.id,
            message:
              "Reporting manager could not be created or resolved. Check for a failed manager or circular reporting relationship.",
          }),
        );
        setProgress((current) => ({
          ...current,
          completed: current.completed + pending.length,
        }));
        pending.length = 0;
        break;
      }
      ready.forEach((row) => pending.splice(pending.indexOf(row), 1));
      await Promise.all(
        ready.map(async (row) => {
          try {
            const draft = rowToCreatePayload(row, { branches, departments });
            const managerId = draft.managerReference
              ? resolvedManagerIds.get(draft.managerReference)
              : undefined;
            const { managerReference: _managerReference, ...body } = rowToCreatePayload(row, {
              branches,
              departments,
              managerId: managerId ?? null,
            });
            const created = await usersApi.create(body as never);
            if (created.employeeId) {
              resolvedManagerIds.set(row.email.trim().toLowerCase(), created.employeeId);
              if (row.employeeCode.trim()) {
                resolvedManagerIds.set(row.employeeCode.trim().toLowerCase(), created.employeeId);
              }
            }
          } catch (error) {
            failures.push({ id: row.id, message: (error as Error).message });
          } finally {
            setProgress((current) => ({ ...current, completed: current.completed + 1 }));
          }
        }),
      );
    }

    setImporting(false);
    if (failures.length) {
      setRows((current) =>
        revalidateRows(
          current.map((row) => {
            const failure = failures.find((item) => item.id === row.id);
            return failure ? { ...row, errors: [failure.message] } : row;
          }),
          { branches, departments, existingEmployees },
        ),
      );
      await onImported();
      toast.error(
        `${validRows.length - failures.length} created; ${failures.length} row${failures.length === 1 ? "" : "s"} failed.`,
      );
    } else {
      toast.success(`${validRows.length} logins created successfully.`);
      await onImported();
      setOpen(false);
      resetSheet();
    }
  }

  function cellOptions(columnKey: LoginImportFieldKey, row: LoginImportRow): string[] {
    if (columnKey === "branchName") return branches.map((branch) => branch.name);
    if (columnKey === "mainUnitName") return mainUnits.map((unit) => unit.name);
    if (columnKey === "childUnitName") {
      const main = mainUnits.find(
        (unit) => unit.name.trim().toLowerCase() === row.mainUnitName.trim().toLowerCase(),
      );
      const filtered = main
        ? childChoices.filter((choice) => choice.parentId === main.id)
        : childChoices;
      return ["Use main unit", ...filtered.map((choice) => choice.label)];
    }
    if (columnKey === "managerReference") {
      return ["Automatic", ...managerOptions.map((option) => option.value)];
    }
    const column = LOGIN_IMPORT_COLUMNS.find((item) => item.key === columnKey);
    return column?.enumOptions ? [...column.enumOptions] : [];
  }

  function renderCell(row: LoginImportRow, key: LoginImportFieldKey) {
    const column = LOGIN_IMPORT_COLUMNS.find((item) => item.key === key)!;
    const value = row[key];
    const hasError = row.errors.length > 0 && !isRowBlank(row);
    const commonClass = cn(
      "h-9 w-full min-w-0 border-0 bg-transparent px-2 text-sm outline-none focus:bg-background focus:ring-1 focus:ring-ring",
      hasError && "bg-destructive/5",
    );

    if (
      column.type === "enum" ||
      column.type === "role" ||
      column.type === "company" ||
      column.type === "branch" ||
      column.type === "mainOrgUnit" ||
      column.type === "childOrgUnit" ||
      column.type === "manager"
    ) {
      const options = cellOptions(key, row);
      const known = options.includes(value);
      return (
        <select
          className={cn(commonClass, "cursor-pointer appearance-none")}
          value={known ? value : value || ""}
          disabled={importing}
          onFocus={() => setFocusCell({ rowId: row.id, key })}
          onChange={(event) => updateCell(row.id, key, event.target.value)}
        >
          {!column.required && <option value="">—</option>}
          {!known && value ? <option value={value}>{value}</option> : null}
          {options.map((option) => (
            <option key={option} value={option}>
              {key === "managerReference" && option !== "Automatic"
                ? managerOptions.find((item) => item.value === option)?.label || option
                : option}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        className={commonClass}
        type={
          column.type === "password"
            ? "password"
            : column.type === "email"
              ? "email"
              : column.type === "date"
                ? "date"
                : column.type === "time"
                  ? "time"
                  : "text"
        }
        value={value}
        disabled={importing}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setFocusCell({ rowId: row.id, key })}
        onChange={(event) => updateCell(row.id, key, event.target.value)}
        placeholder={column.required ? "Required" : ""}
      />
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Table2 className="mr-2 h-4 w-4" /> Bulk add
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (importing) return;
          setOpen(next);
          if (!next) resetSheet();
        }}
      >
        <DialogContent className="flex h-[min(92dvh,900px)] w-[calc(100%-0.75rem)] max-w-6xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 space-y-2 text-left">
            <DialogTitle>Bulk add logins</DialogTitle>
            <DialogDescription>
              Paste rows from Excel or Google Sheets into the grid, or type directly. Each filled
              row creates a login.
            </DialogDescription>
          </DialogHeader>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sheet
              </span>
              <p className="font-semibold text-foreground">{LOGIN_SHEET_NAME}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground sm:text-sm">
              <span className="font-medium text-foreground">{readyCount}</span> ready
              {invalidCount > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-destructive">{invalidCount} with errors</span>
                </>
              )}
              {filledRows.length === 0 && <span> · Paste or type to begin</span>}
            </div>
          </div>

          <p className="shrink-0 text-xs text-muted-foreground">
            Tip: copy cells in Excel (including header optional), click a cell here, then paste.
            Passwords stay in the browser until you create logins.
          </p>

          <div
            ref={tableRef}
            className="min-h-0 flex-1 overflow-auto rounded-md border border-border"
            onPaste={handlePaste}
          >
            <table className="w-max min-w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="sticky left-0 z-20 w-12 border-b border-r border-border bg-muted px-2 py-2 text-left text-xs font-semibold tabular-nums text-muted-foreground">
                    #
                  </th>
                  {LOGIN_IMPORT_COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className="border-b border-r border-border px-2 py-2 text-left text-xs font-semibold whitespace-nowrap text-foreground"
                      style={{ minWidth: column.width }}
                    >
                      {column.label}
                    </th>
                  ))}
                  <th className="border-b border-border px-2 py-2 text-left text-xs font-semibold whitespace-nowrap">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const blank = isRowBlank(row);
                  const invalid = !blank && row.errors.length > 0;
                  return (
                    <tr
                      key={row.id}
                      className={cn(
                        "border-b border-border/70",
                        invalid && "bg-destructive/5",
                        !blank && !invalid && "bg-emerald-500/5",
                      )}
                      title={invalid ? row.errors.join("; ") : undefined}
                    >
                      <td className="sticky left-0 z-[1] border-r border-border bg-inherit px-2 py-0 text-xs tabular-nums text-muted-foreground">
                        {index + 1}
                      </td>
                      {LOGIN_IMPORT_COLUMNS.map((column) => (
                        <td
                          key={column.key}
                          className="border-r border-border/60 p-0"
                          style={{ minWidth: column.width }}
                        >
                          {renderCell(row, column.key)}
                        </td>
                      ))}
                      <td className="max-w-[220px] px-2 py-1 text-xs">
                        {blank ? (
                          <span className="text-muted-foreground">Empty</span>
                        ) : invalid ? (
                          <span className="line-clamp-2 text-destructive">
                            {row.errors.join("; ")}
                          </span>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">
                            {ROLE_LABELS[rowToCreatePayload(row, { branches, departments }).role]}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() => addRows(10)}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Add 10 rows
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={importing}
              onClick={resetSheet}
            >
              Clear sheet
            </Button>
            {importing && (
              <span className="text-sm text-muted-foreground">
                Creating {progress.completed} of {progress.total}…
              </span>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={importing}
              onClick={() => {
                setOpen(false);
                resetSheet();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={importing || readyCount === 0 || invalidCount > 0}
              onClick={() => void createLogins()}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating…
                </>
              ) : (
                `Create ${readyCount} login${readyCount === 1 ? "" : "s"}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
