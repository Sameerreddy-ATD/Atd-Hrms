import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, PencilLine } from "lucide-react";
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
import { employeesApi, usersApi } from "@/services/api";
import { cn } from "@/lib/utils";
import {
  LOGIN_EDIT_COLUMNS,
  LOGIN_EDIT_SHEET_NAME,
  childUnitChoices,
  employeeToEditRow,
  isEditRowDirty,
  isRowBlank,
  parseClipboardTsv,
  pastedEditRowsMatchHeaders,
  resolveLoginRole,
  revalidateEditRows,
  rowToUpdatePayloads,
  type LoginEditRow,
  type LoginImportFieldKey,
} from "@/components/users/loginImportColumns";

export function BulkEditLoginSheet({
  branches,
  departments,
  existingUsers,
  onSaved,
}: {
  branches: Branch[];
  departments: Department[];
  existingUsers: User[];
  onSaved: () => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<LoginEditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [focusCell, setFocusCell] = useState<{ rowId: string; key: LoginImportFieldKey } | null>(
    null,
  );
  const tableRef = useRef<HTMLDivElement>(null);
  const [directory, setDirectory] = useState<User[]>([]);

  const mainUnits = useMemo(
    () => departments.filter((department) => !department.parentDepartmentId),
    [departments],
  );
  const childChoices = useMemo(() => childUnitChoices(departments), [departments]);
  const managerOptions = useMemo(() => {
    return directory
      .filter((employee) => employee.employeeId && employee.role !== "developer_admin")
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((employee) => ({
        value: employee.employeeCode || employee.email || employee.employeeId || "",
        label: `${employee.name}${employee.employeeCode ? ` (${employee.employeeCode})` : ""}`,
      }))
      .filter((option) => option.value);
  }, [directory]);

  const uniquenessPool = useMemo(() => {
    const byKey = new Map<string, User>();
    [...directory, ...existingUsers].forEach((user) => {
      const key = user.userId || user.id || user.employeeId;
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, user);
    });
    return [...byKey.values()];
  }, [directory, existingUsers]);

  const dirtyRows = useMemo(() => rows.filter((row) => isEditRowDirty(row)), [rows]);
  const invalidCount = useMemo(
    () => dirtyRows.filter((row) => row.errors.length > 0).length,
    [dirtyRows],
  );
  const readyCount = dirtyRows.length - invalidCount;

  async function loadSheet() {
    setLoading(true);
    try {
      const employees = await employeesApi.list({ limit: 1000 });
      setDirectory(employees);
      const fromEmployees = employees
        .map((employee) =>
          employeeToEditRow(employee, { branches, departments, directory: employees }),
        )
        .filter((row): row is LoginEditRow => Boolean(row));
      const coveredUserIds = new Set(fromEmployees.map((row) => row.userId));
      const fromUsersOnly = existingUsers
        .filter(
          (user) =>
            user.role !== "developer_admin" &&
            user.id &&
            !coveredUserIds.has(user.id) &&
            !user.employeeId,
        )
        .map((user) =>
          employeeToEditRow(
            { ...user, userId: user.id, employeeId: user.employeeId },
            { branches, departments, directory: employees },
          ),
        )
        .filter((row): row is LoginEditRow => Boolean(row));
      const next = [...fromEmployees, ...fromUsersOnly];
      const pool = [...employees, ...existingUsers];
      setRows(
        revalidateEditRows(next, {
          branches,
          departments,
          existingEmployees: pool,
        }),
      );
    } catch (error) {
      toast.error((error as Error).message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    void loadSheet();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when sheet opens
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setRows((current) =>
      revalidateEditRows(current, {
        branches,
        departments,
        existingEmployees: uniquenessPool,
      }),
    );
  }, [open, branches, departments, uniquenessPool]);

  function updateCell(rowId: string, key: LoginImportFieldKey, value: string) {
    setRows((current) => {
      const next = current.map((row) => (row.id === rowId ? { ...row, [key]: value } : row));
      return revalidateEditRows(next, {
        branches,
        departments,
        existingEmployees: uniquenessPool,
      });
    });
  }

  function applyPaste(startRowIndex: number, startColIndex: number, matrix: string[][]) {
    setRows((current) => {
      const next = [...current];
      let working = matrix;
      if (working.length > 0 && pastedEditRowsMatchHeaders(working[0])) {
        working = working.slice(1);
      }
      working.forEach((cells, rowOffset) => {
        const rowIndex = startRowIndex + rowOffset;
        if (!next[rowIndex]) return;
        const row = { ...next[rowIndex] };
        cells.forEach((cell, colOffset) => {
          const column = LOGIN_EDIT_COLUMNS[startColIndex + colOffset];
          if (!column) return;
          row[column.key] = cell;
        });
        next[rowIndex] = row;
      });
      return revalidateEditRows(next, {
        branches,
        departments,
        existingEmployees: uniquenessPool,
      });
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
        LOGIN_EDIT_COLUMNS.findIndex((column) => column.key === focusCell.key),
      );
    }
    applyPaste(startRowIndex, startColIndex, matrix);
    toast.success(`Pasted ${matrix.length} row${matrix.length === 1 ? "" : "s"} into the sheet`);
  }

  async function saveEdits() {
    const validRows = dirtyRows.filter((row) => row.errors.length === 0);
    if (!validRows.length || invalidCount) return;

    setSaving(true);
    setProgress({ completed: 0, total: validRows.length });
    const failures: Array<{ id: string; message: string }> = [];
    const resolvedManagerIds = new Map<string, string>();
    uniquenessPool.forEach((employee) => {
      if (!employee.employeeId) return;
      [employee.employeeCode, employee.employeeId, employee.email]
        .filter(Boolean)
        .forEach((key) => {
          resolvedManagerIds.set(String(key).trim().toLowerCase(), employee.employeeId!);
        });
    });

    const queue = [...validRows];
    while (queue.length) {
      const batch = queue.splice(0, 4);
      await Promise.all(
        batch.map(async (row) => {
          try {
            const managerText = row.managerReference.trim().toLowerCase();
            const managerId =
              !managerText || managerText === "automatic"
                ? null
                : (resolvedManagerIds.get(managerText) ?? null);
            if (managerText && managerText !== "automatic" && !managerId) {
              throw new Error(`Reporting manager not found: ${row.managerReference}`);
            }
            const payloads = rowToUpdatePayloads(row, {
              branches,
              departments,
              managerId,
            });

            if (payloads.employeeId) {
              await employeesApi.update(payloads.employeeId, payloads.employeePatch as never);
            }

            const role = resolveLoginRole(row.role);
            const baselineRole = resolveLoginRole(row.baseline.role);
            if (role && role !== baselineRole) {
              await usersApi.update(payloads.userId, { role });
            } else if (!payloads.employeeId) {
              await usersApi.update(payloads.userId, {
                name: row.name.trim(),
                email: row.email.trim().toLowerCase(),
                phone: row.phone.trim() || null,
                ...(role ? { role } : {}),
              });
            }

            if (payloads.password) {
              await usersApi.resetPassword(payloads.userId, payloads.password);
            }
          } catch (error) {
            failures.push({ id: row.id, message: (error as Error).message });
          } finally {
            setProgress((current) => ({ ...current, completed: current.completed + 1 }));
          }
        }),
      );
    }

    setSaving(false);
    if (failures.length) {
      setRows((current) =>
        revalidateEditRows(
          current.map((row) => {
            const failure = failures.find((item) => item.id === row.id);
            return failure ? { ...row, errors: [failure.message] } : row;
          }),
          {
            branches,
            departments,
            existingEmployees: uniquenessPool,
          },
        ),
      );
      await onSaved();
      toast.error(
        `${validRows.length - failures.length} updated; ${failures.length} row${failures.length === 1 ? "" : "s"} failed.`,
      );
    } else {
      toast.success(`${validRows.length} login${validRows.length === 1 ? "" : "s"} updated.`);
      await onSaved();
      setOpen(false);
      setRows([]);
    }
  }

  function cellOptions(columnKey: LoginImportFieldKey, row: LoginEditRow): string[] {
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
    const column = LOGIN_EDIT_COLUMNS.find((item) => item.key === columnKey);
    return column?.enumOptions ? [...column.enumOptions] : [];
  }

  function renderCell(row: LoginEditRow, key: LoginImportFieldKey) {
    const column = LOGIN_EDIT_COLUMNS.find((item) => item.key === key)!;
    const value = row[key];
    const hasError = row.errors.length > 0;
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
          disabled={saving || loading}
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
        disabled={saving || loading}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setFocusCell({ rowId: row.id, key })}
        onChange={(event) => updateCell(row.id, key, event.target.value)}
        placeholder={
          column.key === "password"
            ? "Leave blank to keep"
            : ["bankAccountNumber", "panNumber", "aadhaarNumber", "uanNumber", "bankIfscCode"].includes(
                  column.key,
                ) && !row.baseline[column.key]
              ? "Leave blank to keep"
              : column.required
                ? "Required"
                : ""
        }
      />
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <PencilLine className="mr-2 h-4 w-4" /> Bulk edit
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (saving) return;
          setOpen(next);
          if (!next) {
            setRows([]);
            setFocusCell(null);
            setProgress({ completed: 0, total: 0 });
          }
        }}
      >
        <DialogContent className="flex h-[min(92dvh,900px)] w-[calc(100%-0.75rem)] max-w-6xl flex-col gap-3 overflow-hidden p-4 sm:p-6">
          <DialogHeader className="shrink-0 space-y-2 text-left">
            <DialogTitle>Bulk edit logins</DialogTitle>
            <DialogDescription>
              Existing accounts are loaded into the grid. Edit cells or paste from Excel, then save
              only the rows you changed. Leave password and sensitive IDs blank to keep current
              values.
            </DialogDescription>
          </DialogHeader>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
            <div>
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sheet
              </span>
              <p className="font-semibold text-foreground">{LOGIN_EDIT_SHEET_NAME}</p>
            </div>
            <div className="text-right text-xs text-muted-foreground sm:text-sm">
              {loading ? (
                <span>Loading accounts…</span>
              ) : (
                <>
                  <span className="font-medium text-foreground">{rows.length}</span> accounts
                  {" · "}
                  <span className="font-medium text-foreground">{readyCount}</span> ready to save
                  {invalidCount > 0 && (
                    <>
                      {" · "}
                      <span className="font-medium text-destructive">
                        {invalidCount} with errors
                      </span>
                    </>
                  )}
                </>
              )}
            </div>
          </div>

          <p className="shrink-0 text-xs text-muted-foreground">
            Tip: Developer Admin accounts are excluded. Paste over the focused cell the same way as
            Bulk add.
          </p>

          <div
            ref={tableRef}
            className="min-h-0 flex-1 overflow-auto rounded-md border border-border"
            onPaste={handlePaste}
          >
            {loading ? (
              <div className="flex h-full min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading logins…
              </div>
            ) : (
              <table className="w-max min-w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    <th className="sticky left-0 z-20 w-12 border-b border-r border-border bg-muted px-2 py-2 text-left text-xs font-semibold tabular-nums text-muted-foreground">
                      #
                    </th>
                    {LOGIN_EDIT_COLUMNS.map((column) => (
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
                    const dirty = isEditRowDirty(row);
                    const invalid = dirty && row.errors.length > 0;
                    return (
                      <tr
                        key={row.id}
                        className={cn(
                          "border-b border-border/70",
                          invalid && "bg-destructive/5",
                          dirty && !invalid && "bg-amber-500/5",
                        )}
                        title={invalid ? row.errors.join("; ") : undefined}
                      >
                        <td className="sticky left-0 z-[1] border-r border-border bg-inherit px-2 py-0 text-xs tabular-nums text-muted-foreground">
                          {index + 1}
                        </td>
                        {LOGIN_EDIT_COLUMNS.map((column) => (
                          <td
                            key={column.key}
                            className="border-r border-border/60 p-0"
                            style={{ minWidth: column.width }}
                          >
                            {renderCell(row, column.key)}
                          </td>
                        ))}
                        <td className="max-w-[220px] px-2 py-1 text-xs">
                          {invalid ? (
                            <span className="line-clamp-2 text-destructive">
                              {row.errors.join("; ")}
                            </span>
                          ) : dirty ? (
                            <span className="text-amber-700 dark:text-amber-400">Changed</span>
                          ) : isRowBlank(row) ? (
                            <span className="text-muted-foreground">Empty</span>
                          ) : (
                            <span className="text-muted-foreground">
                              {ROLE_LABELS[resolveLoginRole(row.role) ?? "employee"]}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={saving || loading}
              onClick={() => void loadSheet()}
            >
              Reload accounts
            </Button>
            {saving && (
              <span className="text-sm text-muted-foreground">
                Saving {progress.completed} of {progress.total}…
              </span>
            )}
          </div>

          <DialogFooter className="shrink-0 gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || loading || readyCount === 0 || invalidCount > 0}
              onClick={() => void saveEdits()}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                `Save ${readyCount} change${readyCount === 1 ? "" : "s"}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
