import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowLeftRight } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import {
  DesktopTable,
  MobileList,
  MobileListHeader,
  MobileListItem,
  ResponsiveListShell,
} from "@/components/common/ResponsiveList";
import { Button } from "@/components/ui/button";
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
import { DateField } from "@/components/ui/date-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import {
  CHANGE_KIND_LABELS,
  CHANGE_KINDS,
  fileToPayload,
  isPeopleLeaderRole,
  isPeopleOpsRole,
  labelize,
  timeToMinutes,
} from "@/lib/lifecycle";
import { formatBranchLocationLabel } from "@/lib/branch-label";
import { branchesApi, employeesApi, lifecycleApi } from "@/services/api";
import type { Branch, Department, User } from "@/types/domain";

export const Route = createFileRoute("/_app/people-changes")({ component: PeopleChangesPage });

function PeopleChangesPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const isHr = isPeopleOpsRole(user?.role);
  const canOpen = isPeopleLeaderRole(user?.role);
  const canApprove = isHr || user?.role === "manager";
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [hrLetter, setHrLetter] = useState<File | undefined>();
  const [form, setForm] = useState({
    employeeId: user?.employeeId ?? "",
    kind: "PROMOTION" as (typeof CHANGE_KINDS)[number],
    effectiveDate: "",
    reason: "",
    designation: "",
    managerId: "",
    departmentId: "",
    employmentType: "FULL_TIME",
    ctcAnnual: "",
    amount: "",
    name: "",
    counterpartEmployeeId: "",
    homeBranchId: "",
    presentAddress: "",
    presentCity: "",
    presentState: "",
    presentPincode: "",
    shiftType: "DAY",
    shiftStart: "09:00",
    shiftEnd: "18:00",
    organizationLevel: "MEMBER",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [changeRows, people, departmentRows, branchRows] = await Promise.all([
        lifecycleApi.changes(),
        employeesApi.list().catch(() => []),
        branchesApi.departments().catch(() => [] as Department[]),
        branchesApi.list().catch(() => [] as Branch[]),
      ]);
      setRows(changeRows);
      setEmployees(people);
      setDepartments(departmentRows);
      setBranches(branchRows);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("pages.peopleChanges.toastCouldNotLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (canOpen) void load();
  }, [canOpen, load]);

  if (!canOpen) {
    return (
      <EmptyState
        icon={ArrowLeftRight}
        title={t("pages.peopleChanges.accessTitle")}
        description={t("pages.peopleChanges.accessHelp")}
      />
    );
  }

  function payload() {
    const data: Record<string, unknown> = {};
    if (form.kind === "PROMOTION" || form.kind === "DESIGNATION_CHANGE") {
      data.designation = form.designation;
      data.managerId = form.managerId || undefined;
      data.organizationLevel = form.organizationLevel || undefined;
      data.ctcAnnual = form.ctcAnnual ? Number(form.ctcAnnual) : undefined;
    } else if (form.kind === "DEPARTMENT_CHANGE") data.departmentId = form.departmentId;
    else if (form.kind === "EMPLOYMENT_TYPE_CHANGE") data.employmentType = form.employmentType;
    else if (form.kind === "SALARY_CHANGE") data.ctcAnnual = Number(form.ctcAnnual || 0);
    else if (form.kind === "BRANCH_CHANGE") data.homeBranchId = form.homeBranchId;
    else if (form.kind === "MANAGER_CHANGE") data.managerId = form.managerId;
    else if (form.kind === "HIERARCHY_CHANGE") {
      data.managerId = form.managerId || undefined;
      data.organizationLevel = form.organizationLevel;
    } else if (form.kind === "ADDRESS_CHANGE") {
      data.presentAddress = form.presentAddress;
      data.presentCity = form.presentCity || undefined;
      data.presentState = form.presentState || undefined;
      data.presentPincode = form.presentPincode || undefined;
    } else if (form.kind === "SHIFT_SWAP") {
      data.counterpartEmployeeId = form.counterpartEmployeeId;
      data.workDate = form.effectiveDate;
    } else if (form.kind === "RECURRING_ALLOWANCE") {
      data.name = form.name;
      data.amountMonthly = Number(form.amount || 0);
    } else if (form.kind === "ONE_TIME_PAYMENT") {
      data.name = form.name;
      data.amount = Number(form.amount || 0);
    } else if (form.kind === "SHIFT_CHANGE") {
      data.shiftType = form.shiftType;
      data.shiftStartMinutes = timeToMinutes(form.shiftStart);
      data.shiftEndMinutes = timeToMinutes(form.shiftEnd);
    }
    return data;
  }

  function validateForm() {
    if (!form.employeeId || !form.effectiveDate) return "Employee and effective date are required";
    if (["PROMOTION", "DESIGNATION_CHANGE"].includes(form.kind) && !form.designation.trim()) {
      return "New designation is required";
    }
    if (form.kind === "SALARY_CHANGE" && !(Number(form.ctcAnnual) > 0))
      return "Annual CTC is required";
    if (form.kind === "DEPARTMENT_CHANGE" && !form.departmentId) return "Department is required";
    if (form.kind === "BRANCH_CHANGE" && !form.homeBranchId) return "Branch is required";
    if (form.kind === "MANAGER_CHANGE" && !form.managerId) return "New manager is required";
    if (form.kind === "HIERARCHY_CHANGE" && !form.organizationLevel)
      return "Organization level is required";
    if (form.kind === "SHIFT_SWAP" && !form.counterpartEmployeeId)
      return "Swap counterpart is required";
    if (form.kind === "ADDRESS_CHANGE" && !form.presentAddress.trim()) return "Address is required";
    if (["RECURRING_ALLOWANCE", "ONE_TIME_PAYMENT"].includes(form.kind)) {
      if (!form.name.trim()) return "Name is required";
      if (!(Number(form.amount) > 0)) return "Amount is required";
    }
    return "";
  }

  function canReject(status: string) {
    if (isHr) return ["PENDING_MANAGER", "PENDING_HR", "APPROVED"].includes(status);
    return status === "PENDING_MANAGER";
  }

  function canAct(status: string) {
    if (isHr) return ["PENDING_HR", "PENDING_MANAGER", "APPROVED"].includes(status);
    return status === "PENDING_MANAGER";
  }

  async function decide(id: string, decision: "APPROVE" | "REJECT" | "APPLY") {
    try {
      await lifecycleApi.decideChange(id, {
        decision,
        hrLetter: decision === "APPLY" && hrLetter ? await fileToPayload(hrLetter) : undefined,
      });
      toast.success(
        decision === "REJECT"
          ? t("pages.peopleChanges.toastRejected")
          : decision === "APPLY"
            ? t("pages.peopleChanges.toastApplied")
            : t("pages.peopleChanges.toastSentToHr"),
      );
      setHrLetter(undefined);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("pages.peopleChanges.toastCouldNotUpdate"));
    }
  }

  if (loading) return <LoadingState label={t("pages.loading.peopleChanges")} />;

  return (
    <div>
      <PageHeader
        eyebrow={t("pages.peopleChanges.eyebrow")}
        title={t("pages.peopleChanges.title")}
        description={t("pages.peopleChanges.subtitle")}
        actions={
          <Button className="h-11" onClick={() => setOpen(true)}>
            {t("pages.peopleChanges.requestChange")}
          </Button>
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          icon={ArrowLeftRight}
          title={t("pages.peopleChanges.empty")}
          description={t("pages.peopleChanges.emptyHelp")}
        />
      ) : (
        <ResponsiveListShell>
          {isHr ? (
            <div className="border-b bg-muted/30 px-3 py-3 sm:px-4">
              <Label className="text-xs font-medium text-muted-foreground">
                HR letter for apply (optional)
              </Label>
              <Input
                className="mt-1 h-11 max-w-md bg-background"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setHrLetter(e.target.files?.[0])}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Attached when you tap Apply on a pending request.
              </p>
            </div>
          ) : null}
          <MobileList>
            {rows.map((row) => (
              <MobileListItem key={String(row.id)}>
                <MobileListHeader
                  title={String(row.employeeName)}
                  meta={
                    CHANGE_KIND_LABELS[row.kind as keyof typeof CHANGE_KIND_LABELS] ??
                    String(row.kind)
                  }
                  trailing={<StatusBadge status={labelize(String(row.status))} />}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  Effective {String(row.effectiveDate)}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {JSON.stringify(row.payload ?? {})}
                </p>
                {canApprove &&
                String(row.status) !== "APPLIED" &&
                String(row.status) !== "REJECTED" ? (
                  <div className="mt-3 flex flex-col gap-2">
                    {canAct(String(row.status)) ? (
                      <Button
                        className="h-11 w-full"
                        onClick={() => void decide(String(row.id), isHr ? "APPLY" : "APPROVE")}
                      >
                        {isHr ? t("pages.peopleChanges.approveApply") : t("pages.peopleChanges.managerApprove")}
                      </Button>
                    ) : null}
                    {canReject(String(row.status)) ? (
                      <Button
                        variant="outline"
                        className="h-11 w-full"
                        onClick={() => void decide(String(row.id), "REJECT")}
                      >
                        {t("pages.peopleChanges.reject")}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </MobileListItem>
            ))}
          </MobileList>
          <DesktopTable>
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Effective</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={String(row.id)} className="border-t">
                    <td className="px-4 py-3">
                      <p className="font-medium">{String(row.employeeName)}</p>
                      <p className="text-xs text-muted-foreground">{String(row.employeeCode)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {CHANGE_KIND_LABELS[row.kind as keyof typeof CHANGE_KIND_LABELS] ??
                        String(row.kind)}
                    </td>
                    <td className="px-4 py-3">{String(row.effectiveDate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={labelize(String(row.status))} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canApprove &&
                      String(row.status) !== "APPLIED" &&
                      String(row.status) !== "REJECTED" ? (
                        <div className="flex justify-end gap-2">
                          {canAct(String(row.status)) ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                void decide(String(row.id), isHr ? "APPLY" : "APPROVE")
                              }
                            >
                              {isHr ? t("pages.peopleChanges.apply") : t("pages.peopleChanges.approve")}
                            </Button>
                          ) : null}
                          {canReject(String(row.status)) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void decide(String(row.id), "REJECT")}
                            >
                              {t("pages.peopleChanges.reject")}
                            </Button>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DesktopTable>
        </ResponsiveListShell>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("pages.peopleChanges.employmentChangeTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {isHr || user?.role === "manager" ? (
              <EmployeePicker
                employees={employees}
                value={form.employeeId}
                onChange={(employeeId) => setForm({ ...form, employeeId })}
              />
            ) : null}
            <div>
              <Label>Type</Label>
              <Select
                value={form.kind}
                onValueChange={(kind) =>
                  setForm({ ...form, kind: kind as (typeof CHANGE_KINDS)[number] })
                }
              >
                <SelectTrigger className="mt-1 h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANGE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {CHANGE_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Effective date</Label>
              <DateField
                className="mt-1"
                value={form.effectiveDate}
                onChange={(effectiveDate) => setForm({ ...form, effectiveDate })}
              />
            </div>
            {["PROMOTION", "DESIGNATION_CHANGE"].includes(form.kind) ? (
              <Input
                className="h-11"
                placeholder="New designation"
                value={form.designation}
                onChange={(e) => setForm({ ...form, designation: e.target.value })}
              />
            ) : null}
            {["SALARY_CHANGE", "PROMOTION"].includes(form.kind) ? (
              <Input
                className="h-11"
                placeholder="Annual CTC"
                value={form.ctcAnnual}
                onChange={(e) => setForm({ ...form, ctcAnnual: e.target.value })}
              />
            ) : null}
            {form.kind === "DEPARTMENT_CHANGE" ? (
              <div>
                <Label>Department</Label>
                <Select
                  value={form.departmentId}
                  onValueChange={(departmentId) => setForm({ ...form, departmentId })}
                >
                  <SelectTrigger className="mt-1 h-11">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {departments.map((department) => (
                      <SelectItem key={department.id} value={department.id}>
                        {department.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {form.kind === "BRANCH_CHANGE" ? (
              <div>
                <Label>Branch</Label>
                <Select
                  value={form.homeBranchId}
                  onValueChange={(homeBranchId) => setForm({ ...form, homeBranchId })}
                >
                  <SelectTrigger className="mt-1 h-11">
                    <SelectValue placeholder="Select branch" />
                  </SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {formatBranchLocationLabel(branch)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            {["MANAGER_CHANGE", "PROMOTION"].includes(form.kind) ? (
              <EmployeePicker
                employees={employees}
                value={form.managerId}
                onChange={(managerId) => setForm({ ...form, managerId })}
                label="New manager"
              />
            ) : null}
            {form.kind === "HIERARCHY_CHANGE" ? (
              <>
                <EmployeePicker
                  employees={employees}
                  value={form.managerId}
                  onChange={(managerId) => setForm({ ...form, managerId })}
                  label="New manager (optional)"
                />
                <div>
                  <Label>Organization level</Label>
                  <Select
                    value={form.organizationLevel}
                    onValueChange={(organizationLevel) => setForm({ ...form, organizationLevel })}
                  >
                    <SelectTrigger className="mt-1 h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HEAD">Head</SelectItem>
                      <SelectItem value="SENIOR">Senior</SelectItem>
                      <SelectItem value="JUNIOR">Junior</SelectItem>
                      <SelectItem value="MEMBER">Member</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : null}
            {form.kind === "SHIFT_CHANGE" ? (
              <>
                <Select
                  value={form.shiftType}
                  onValueChange={(shiftType) => setForm({ ...form, shiftType })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">Day shift</SelectItem>
                    <SelectItem value="NIGHT">Night shift</SelectItem>
                  </SelectContent>
                </Select>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Starts</Label>
                    <Input
                      className="mt-1 h-11"
                      type="time"
                      value={form.shiftStart}
                      onChange={(e) => setForm({ ...form, shiftStart: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Ends</Label>
                    <Input
                      className="mt-1 h-11"
                      type="time"
                      value={form.shiftEnd}
                      onChange={(e) => setForm({ ...form, shiftEnd: e.target.value })}
                    />
                  </div>
                </div>
              </>
            ) : null}
            {form.kind === "EMPLOYMENT_TYPE_CHANGE" ? (
              <Select
                value={form.employmentType}
                onValueChange={(employmentType) => setForm({ ...form, employmentType })}
              >
                <SelectTrigger className="h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FULL_TIME">Full time</SelectItem>
                  <SelectItem value="PART_TIME">Part time</SelectItem>
                  <SelectItem value="INTERN">Intern</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {form.kind === "SHIFT_SWAP" ? (
              <EmployeePicker
                employees={employees}
                value={form.counterpartEmployeeId}
                onChange={(counterpartEmployeeId) => setForm({ ...form, counterpartEmployeeId })}
                label="Swap with"
              />
            ) : null}
            {["RECURRING_ALLOWANCE", "ONE_TIME_PAYMENT"].includes(form.kind) ? (
              <>
                <Input
                  className="h-11"
                  placeholder="Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Input
                  className="h-11"
                  placeholder="Amount"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </>
            ) : null}
            {form.kind === "ADDRESS_CHANGE" ? (
              <>
                <Textarea
                  placeholder="New present address"
                  value={form.presentAddress}
                  onChange={(e) => setForm({ ...form, presentAddress: e.target.value })}
                />
                <Input
                  className="h-11"
                  placeholder="City"
                  value={form.presentCity}
                  onChange={(e) => setForm({ ...form, presentCity: e.target.value })}
                />
                <Input
                  className="h-11"
                  placeholder="State"
                  value={form.presentState}
                  onChange={(e) => setForm({ ...form, presentState: e.target.value })}
                />
                <Input
                  className="h-11"
                  placeholder="PIN"
                  value={form.presentPincode}
                  onChange={(e) => setForm({ ...form, presentPincode: e.target.value })}
                />
              </>
            ) : null}
            <Textarea
              placeholder="Reason / HR note"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
          </div>
          <DialogFooter>
            <Button
              className="h-11 w-full sm:w-auto"
              disabled={!form.employeeId || !form.effectiveDate}
              onClick={async () => {
                const problem = validateForm();
                if (problem) {
                  toast.error(problem);
                  return;
                }
                try {
                  await lifecycleApi.createChange({
                    employeeId: form.employeeId,
                    kind: form.kind,
                    effectiveDate: form.effectiveDate,
                    payload: payload(),
                    reason: form.reason || undefined,
                  });
                  toast.success(t("pages.peopleChanges.toastSubmitted"));
                  setOpen(false);
                  await load();
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : t("pages.peopleChanges.toastCouldNotSubmit"));
                }
              }}
            >
              {t("pages.peopleChanges.submitRequest")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
