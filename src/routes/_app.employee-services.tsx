import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BadgeIndianRupee,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  FileBadge,
  Plus,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { InfoButton } from "@/components/common/InfoButton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import type { CertificateRequest, ExpenseClaim, User } from "@/types/domain";
import { employeeServicesApi, employeesApi } from "@/services/api";

export const Route = createFileRoute("/_app/employee-services")({
  component: EmployeeServicesPage,
});

const expenseInitial = {
  claimType: "EXPENSE",
  title: "",
  amount: "",
  expenseDate: "",
  description: "",
  receiptUrl: "",
  receiptAccessConfirmed: false,
  employeeId: "",
};
const advanceInitial = {
  amount: "",
  remark: "",
  employeeId: "",
};
const certificateInitial = {
  certificateType: "EMPLOYMENT",
  purpose: "",
  deliveryMode: "DIGITAL" as "DIGITAL" | "PRINTED",
  requiredBy: "",
  employeeId: "",
};

function EmployeeServicesPage() {
  const { user } = useAuth();
  const isHr = user?.role === "hr" || user?.role === "developer_admin";
  const canViewAll = isHr || user?.role === "ceo";
  const canSubmit = Boolean(user?.employeeId) || isHr;
  const [employees, setEmployees] = useState<User[]>([]);
  const [expenses, setExpenses] = useState<ExpenseClaim[]>([]);
  const [certificates, setCertificates] = useState<CertificateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [certificateOpen, setCertificateOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState(expenseInitial);
  const [advanceForm, setAdvanceForm] = useState(advanceInitial);
  const [expenseStatus, setExpenseStatus] = useState("ALL");
  const [certificateForm, setCertificateForm] = useState(certificateInitial);
  const [review, setReview] = useState<{
    kind: "expense" | "certificate";
    id: string;
    status: string;
    currentStatus: string;
    notes: string;
    documentUrl: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [expenseRows, certificateRows] = await Promise.all([
        employeeServicesApi.expenseClaims(),
        employeeServicesApi.certificateRequests(),
      ]);
      setExpenses(expenseRows);
      setCertificates(certificateRows);
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
    if (!isHr) return;
    employeesApi
      .list({ status: "ACTIVE", limit: 1000 })
      .then((rows) => setEmployees(rows.filter((row) => row.employeeId)))
      .catch(() => setEmployees([]));
  }, [isHr]);

  async function submitExpense(event: React.FormEvent) {
    event.preventDefault();
    const intent = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
      ?.value;
    setSaving(true);
    try {
      await employeeServicesApi.submitExpense({
        claimType: (expenseForm.claimType as "EXPENSE" | "FIELD") || "EXPENSE",
        employeeId: expenseForm.employeeId || undefined,
        title: expenseForm.title,
        amount: Number(expenseForm.amount),
        expenseDate: expenseForm.expenseDate,
        description: expenseForm.description,
        receiptUrl: expenseForm.receiptUrl || null,
        receiptAccessConfirmed: expenseForm.receiptAccessConfirmed,
      });
      setExpenseForm(expenseInitial);
      if (intent !== "add-more") setExpenseOpen(false);
      await load();
      toast.success("Expense submitted successfully");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function submitAdvance(event: React.FormEvent) {
    event.preventDefault();
    const intent = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)
      ?.value;
    setSaving(true);
    try {
      await employeeServicesApi.submitExpense({
        claimType: "ADVANCE",
        employeeId: advanceForm.employeeId || undefined,
        amount: Number(advanceForm.amount),
        remark: advanceForm.remark,
      });
      setAdvanceForm(advanceInitial);
      if (intent !== "add-more") setAdvanceOpen(false);
      await load();
      toast.success("Advance expense request submitted");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function submitCertificate(event: React.FormEvent) {
    event.preventDefault();
    const purpose = certificateForm.purpose.trim();
    if (purpose.length < 5) {
      toast.error("Purpose must be at least 5 characters");
      return;
    }
    if (isHr && !certificateForm.employeeId && !user?.employeeId) {
      toast.error("Select the employee who needs this document");
      return;
    }
    setSaving(true);
    try {
      await employeeServicesApi.submitCertificate({
        certificateType: certificateForm.certificateType,
        purpose,
        deliveryMode: certificateForm.deliveryMode,
        requiredBy: certificateForm.requiredBy.trim() || null,
        employeeId: isHr ? certificateForm.employeeId || undefined : undefined,
      });
      setCertificateOpen(false);
      setCertificateForm(certificateInitial);
      await load();
      toast.success("HR document request sent successfully");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function saveReview() {
    if (!review) return;
    if (
      review.kind === "certificate" &&
      review.status === "READY" &&
      review.documentUrl.trim() &&
      !/^https?:\/\//i.test(review.documentUrl.trim())
    ) {
      toast.error("Document link must start with http:// or https://");
      return;
    }
    setSaving(true);
    try {
      if (review.kind === "expense")
        await employeeServicesApi.reviewExpense(
          review.id,
          review.status as "UNPAID" | "REJECTED" | "PAID",
          review.notes,
        );
      else
        await employeeServicesApi.reviewCertificate(
          review.id,
          review.status as "IN_PROGRESS" | "READY" | "REJECTED" | "COLLECTED",
          review.notes.trim() || null,
          review.documentUrl.trim() || null,
        );
      setReview(null);
      await load();
      toast.success("Request status updated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const filteredExpenses = expenses.filter(
    (row) => expenseStatus === "ALL" || row.status === expenseStatus,
  );

  return (
    <div>
      <PageHeader
        title="Expenses & HR Documents"
        description={
          canViewAll
            ? "View employee requests across the organization."
            : "Submit expenses and request official documents from HR."
        }
      />
      {canViewAll && !isHr && (
        <p className="mb-4 rounded-md border border-border/80 bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
          You can review every request here. HR marks expenses unpaid/paid and updates document
          status.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <LoadingState label="Loading employee services" />
      ) : (
        <Tabs defaultValue="expenses" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:w-[420px]">
            <TabsTrigger value="expenses" className="min-h-11">
              <BadgeIndianRupee className="mr-2 h-4 w-4" />
              Expenses
            </TabsTrigger>
            <TabsTrigger value="certificates" className="min-h-11">
              <FileBadge className="mr-2 h-4 w-4" />
              HR Documents
            </TabsTrigger>
          </TabsList>
          <TabsContent value="expenses" className="space-y-3">
            <SectionHeading
              title={canViewAll ? "Employee expenses" : "My expenses"}
              action={
                canSubmit ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm">
                        <Plus className="mr-2 h-4 w-4" />
                        Apply
                        <ChevronDown className="ml-2 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuItem onSelect={() => setAdvanceOpen(true)}>
                        <WalletCards className="mr-2 h-4 w-4" />
                        Add advance expense
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => setExpenseOpen(true)}>
                        <BadgeIndianRupee className="mr-2 h-4 w-4" />
                        Add expense
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : undefined
              }
            />
            <Tabs value={expenseStatus} onValueChange={setExpenseStatus}>
              <TabsList className="h-auto flex-wrap justify-start">
                {["ALL", "PENDING", "UNPAID", "PAID", "REJECTED"].map((status) => (
                  <TabsTrigger key={status} value={status}>
                    {label(status)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            {filteredExpenses.length === 0 ? (
              <EmptyPanel
                title={
                  expenseStatus === "ALL"
                    ? "No expenses"
                    : `No ${label(expenseStatus).toLowerCase()} expenses`
                }
                description={
                  canViewAll
                    ? "Employee claims will appear here."
                    : "You have not submitted an expense claim."
                }
              />
            ) : (
              filteredExpenses.map((row) => (
                <RequestCard
                  key={row.id}
                  title={`${formatCurrency(row.amount)} · ${row.claimType === "ADVANCE" ? "Advance expense" : (row.title ?? "Expense")}`}
                  employee={canViewAll ? `${row.employeeName} · ${row.employeeCode}` : undefined}
                  date={row.expenseDate ?? new Date(row.createdAt).toLocaleDateString("en-IN")}
                  status={row.status}
                  description={row.description ?? row.remark ?? ""}
                  link={
                    row.receiptUrl
                      ? employeeServicesApi.receiptUrl(row.receiptUrl)
                      : undefined
                  }
                  notes={row.reviewNotes}
                  action={isHr ? <ExpenseActions row={row} onReview={setReview} /> : undefined}
                />
              ))
            )}
          </TabsContent>
          <TabsContent value="certificates" className="space-y-3">
            <SectionHeading
              title={canViewAll ? "HR document requests" : "My HR document requests"}
              action={
                canSubmit ? (
                  <Button size="sm" onClick={() => setCertificateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Request document
                  </Button>
                ) : undefined
              }
            />
            {certificates.length === 0 ? (
              <EmptyPanel
                title="No HR document requests"
                description={
                  canViewAll
                    ? "Employee requests will appear here."
                    : "You have not requested an HR document."
                }
              />
            ) : (
              certificates.map((row) => (
                <RequestCard
                  key={row.id}
                  title={label(row.certificateType)}
                  employee={canViewAll ? `${row.employeeName} · ${row.employeeCode}` : undefined}
                  date={
                    row.requiredBy
                      ? `Required by ${row.requiredBy}`
                      : `Requested ${new Date(row.createdAt).toLocaleDateString("en-IN")}`
                  }
                  status={row.status}
                  description={row.purpose}
                  link={row.documentUrl}
                  notes={row.hrNotes}
                  action={isHr ? <CertificateActions row={row} onReview={setReview} /> : undefined}
                />
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submitAdvance}>
            <DialogHeader>
              <DialogTitle>Add advance expense</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {isHr && (
                <EmployeeSelect
                  employees={employees}
                  value={advanceForm.employeeId}
                  onChange={(employeeId) => setAdvanceForm((v) => ({ ...v, employeeId }))}
                />
              )}
              <Field label="Amount (INR)">
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={advanceForm.amount}
                  onChange={(e) => setAdvanceForm((v) => ({ ...v, amount: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Remark">
                <Textarea
                  rows={4}
                  maxLength={2000}
                  value={advanceForm.remark}
                  onChange={(e) => setAdvanceForm((v) => ({ ...v, remark: e.target.value }))}
                  required
                />
              </Field>
            </div>
            <DialogFooter>
              <Button type="submit" name="intent" value="exit" disabled={saving}>
                {saving ? "Submitting..." : "Submit and exit"}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="add-more"
                variant="outline"
                disabled={saving}
              >
                Submit and add more
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submitExpense}>
            <DialogHeader>
              <DialogTitle>Add expense</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              {isHr && (
                <div className="sm:col-span-2">
                  <EmployeeSelect
                    employees={employees}
                    value={expenseForm.employeeId}
                    onChange={(employeeId) => setExpenseForm((v) => ({ ...v, employeeId }))}
                  />
                </div>
              )}
              <Field label="Claim type">
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={expenseForm.claimType}
                  onChange={(e) =>
                    setExpenseForm((v) => ({ ...v, claimType: e.target.value }))
                  }
                >
                  <option value="EXPENSE">Expense</option>
                  <option value="FIELD">Field</option>
                </select>
              </Field>
              <Field label="Title">
                <Input
                  maxLength={160}
                  value={expenseForm.title}
                  onChange={(e) => setExpenseForm((v) => ({ ...v, title: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Amount (INR)">
                <Input
                  type="number"
                  min="1"
                  step="0.01"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm((v) => ({ ...v, amount: e.target.value }))}
                  required
                />
              </Field>
              <Field label="Expense date">
                <Input
                  type="date"
                  max={new Date().toISOString().slice(0, 10)}
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm((v) => ({ ...v, expenseDate: e.target.value }))}
                  required
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Description">
                  <Textarea
                    rows={4}
                    maxLength={3000}
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm((v) => ({ ...v, description: e.target.value }))}
                    required
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <div className="flex items-center gap-1">
                  <Label>Receipt attachment</Label>
                  <InfoButton title="Receipt upload">
                    <p>
                      Prefer a private file upload. Google Drive links still work if General access
                      is <strong>Anyone with the link</strong>.
                    </p>
                  </InfoButton>
                </div>
                <Input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  className="mb-2"
                  onChange={(event) => {
                    const next = event.target.files?.[0] ?? null;
                    void (async () => {
                      if (!next) return;
                      try {
                        const { fileToBase64 } = await import("@/lib/file-upload");
                        const upload = await fileToBase64(next);
                        const stored = await employeeServicesApi.uploadReceipt(upload);
                        setExpenseForm((value) => ({
                          ...value,
                          receiptUrl: stored.url,
                          receiptAccessConfirmed: true,
                        }));
                        toast.success("Receipt uploaded");
                      } catch (error) {
                        toast.error((error as Error).message);
                      }
                    })();
                  }}
                />
                <Input
                  type="url"
                  placeholder="Or paste https://drive.google.com/..."
                  value={
                    expenseForm.receiptUrl.startsWith("/expense-claims/receipts/")
                      ? "(private upload attached)"
                      : expenseForm.receiptUrl
                  }
                  onChange={(e) =>
                    setExpenseForm((v) => ({
                      ...v,
                      receiptUrl: e.target.value.startsWith("(") ? v.receiptUrl : e.target.value,
                      receiptAccessConfirmed: e.target.value.startsWith("/expense-claims/")
                        ? true
                        : v.receiptAccessConfirmed,
                    }))
                  }
                  required
                />
                {!expenseForm.receiptUrl.startsWith("/expense-claims/receipts/") && (
                  <label className="mt-3 flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                    <Checkbox
                      className="mt-0.5"
                      checked={expenseForm.receiptAccessConfirmed}
                      onCheckedChange={(checked) =>
                        setExpenseForm((value) => ({
                          ...value,
                          receiptAccessConfirmed: checked === true,
                        }))
                      }
                      required
                    />
                    <span>
                      I confirmed that Google Drive General access is set to
                      <strong> Anyone with the link</strong> and the Viewer role.
                    </span>
                  </label>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" name="intent" value="exit" disabled={saving}>
                {saving ? "Submitting..." : "Submit and exit"}
              </Button>
              <Button
                type="submit"
                name="intent"
                value="add-more"
                variant="outline"
                disabled={saving}
              >
                Submit and add more
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={certificateOpen} onOpenChange={setCertificateOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={submitCertificate}>
            <DialogHeader>
              <DialogTitle>Request HR document</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4 sm:grid-cols-2">
              {isHr && (
                <div className="sm:col-span-2">
                  <EmployeeSelect
                    employees={employees}
                    value={certificateForm.employeeId}
                    onChange={(employeeId) => setCertificateForm((v) => ({ ...v, employeeId }))}
                  />
                </div>
              )}
              <Field label="Document type">
                <Select
                  value={certificateForm.certificateType}
                  onValueChange={(certificateType) =>
                    setCertificateForm((v) => ({ ...v, certificateType }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[
                      "EMPLOYMENT",
                      "EXPERIENCE",
                      "SALARY",
                      "ADDRESS_PROOF",
                      "RELIEVING",
                      "OTHER",
                    ].map((v) => (
                      <SelectItem key={v} value={v}>
                        {label(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Delivery">
                <Select
                  value={certificateForm.deliveryMode}
                  onValueChange={(deliveryMode: "DIGITAL" | "PRINTED") =>
                    setCertificateForm((v) => ({ ...v, deliveryMode }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DIGITAL">Digital copy</SelectItem>
                    <SelectItem value="PRINTED">Printed copy</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Required by (optional)">
                <Input
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={certificateForm.requiredBy}
                  onChange={(e) =>
                    setCertificateForm((v) => ({ ...v, requiredBy: e.target.value }))
                  }
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Purpose">
                  <Textarea
                    rows={4}
                    minLength={5}
                    maxLength={3000}
                    placeholder="Example: Required for bank loan verification"
                    value={certificateForm.purpose}
                    onChange={(e) => setCertificateForm((v) => ({ ...v, purpose: e.target.value }))}
                    required
                  />
                  <p className="text-xs text-muted-foreground">At least 5 characters.</p>
                </Field>
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving ? "Submitting..." : "Send request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(review)} onOpenChange={(open) => !open && setReview(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update request</DialogTitle>
          </DialogHeader>
          {review && (
            <div className="space-y-4 py-2">
              <Field label="Status">
                <Select
                  value={review.status}
                  onValueChange={(status) => setReview((v) => (v ? { ...v, status } : v))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reviewOptions(review).map((v) => (
                      <SelectItem key={v} value={v}>
                        {label(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              {review.kind === "certificate" && (
                <Field label="Document link (required for digital Ready status)">
                  <Input
                    type="url"
                    placeholder="https://…"
                    value={review.documentUrl}
                    onChange={(e) =>
                      setReview((v) => (v ? { ...v, documentUrl: e.target.value } : v))
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Use a full link starting with https:// when marking a digital copy ready.
                  </p>
                </Field>
              )}
              <Field label="HR notes">
                <Textarea
                  rows={4}
                  maxLength={2000}
                  value={review.notes}
                  onChange={(e) => setReview((v) => (v ? { ...v, notes: e.target.value } : v))}
                />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => void saveReview()} disabled={saving}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save status"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SectionHeading({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <h2 className="text-lg font-semibold">{title}</h2>
      {action}
    </div>
  );
}
function EmptyPanel({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}
function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{text}</Label>
      {children}
    </div>
  );
}

function EmployeeSelect({
  employees,
  value,
  onChange,
}: {
  employees: User[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label="Employee">
      <Select value={value} onValueChange={onChange} required>
        <SelectTrigger>
          <SelectValue placeholder="Select an employee" />
        </SelectTrigger>
        <SelectContent>
          {employees.map((employee) => (
            <SelectItem key={employee.employeeId} value={employee.employeeId!}>
              {employee.name} · {employee.employeeCode}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
function RequestCard({
  title,
  employee,
  date,
  status,
  description,
  link,
  notes,
  action,
}: {
  title: string;
  employee?: string;
  date: string;
  status: string;
  description: string;
  link?: string;
  notes?: string;
  action?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="font-semibold">{title}</h3>
            {employee && <p className="text-sm text-muted-foreground">{employee}</p>}
            <p className="text-xs text-muted-foreground">{date}</p>
          </div>
          <StatusBadge status={status} />
        </div>
        <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6">{description}</p>
        {notes && (
          <div className="mt-3 rounded-md bg-muted/50 p-3 text-sm">
            <span className="font-medium">HR note: </span>
            {notes}
          </div>
        )}
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          {link && (
            <Button asChild size="sm" variant="outline">
              <a href={link} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open document
              </a>
            </Button>
          )}
          {action}
        </div>
      </CardContent>
    </Card>
  );
}
function ExpenseActions({
  row,
  onReview,
}: {
  row: ExpenseClaim;
  onReview: (value: {
    kind: "expense";
    id: string;
    status: string;
    currentStatus: string;
    notes: string;
    documentUrl: string;
  }) => void;
}) {
  if (["REJECTED", "PAID"].includes(row.status)) return null;
  return (
    <Button
      size="sm"
      onClick={() =>
        onReview({
          kind: "expense",
          id: row.id,
          currentStatus: row.status,
          status: row.status === "PENDING" ? "UNPAID" : "PAID",
          notes: row.reviewNotes ?? "",
          documentUrl: "",
        })
      }
    >
      Review
    </Button>
  );
}
function CertificateActions({
  row,
  onReview,
}: {
  row: CertificateRequest;
  onReview: (value: {
    kind: "certificate";
    id: string;
    status: string;
    currentStatus: string;
    notes: string;
    documentUrl: string;
  }) => void;
}) {
  if (["REJECTED", "COLLECTED"].includes(row.status)) return null;
  const next =
    row.status === "PENDING" ? "IN_PROGRESS" : row.status === "IN_PROGRESS" ? "READY" : "COLLECTED";
  return (
    <Button
      size="sm"
      onClick={() =>
        onReview({
          kind: "certificate",
          id: row.id,
          currentStatus: row.status,
          status: next,
          notes: row.hrNotes ?? "",
          documentUrl: row.documentUrl ?? "",
        })
      }
    >
      Review
    </Button>
  );
}
function reviewOptions(review: {
  kind: "expense" | "certificate";
  status: string;
  currentStatus: string;
}) {
  if (review.kind === "expense") {
    if (review.currentStatus === "PENDING") return ["UNPAID", "REJECTED"];
    if (review.currentStatus === "UNPAID") return ["PAID", "UNPAID", "REJECTED"];
    return [review.status];
  }
  if (review.currentStatus === "PENDING") return ["IN_PROGRESS", "REJECTED"];
  if (review.currentStatus === "IN_PROGRESS") return ["READY", "IN_PROGRESS", "REJECTED"];
  if (review.currentStatus === "READY") return ["COLLECTED", "READY", "REJECTED"];
  if (review.currentStatus === "COLLECTED") return ["COLLECTED"];
  if (review.currentStatus === "REJECTED") return ["REJECTED"];
  return ["IN_PROGRESS", "REJECTED"];
}
function label(value: string) {
  const professionalLabels: Record<string, string> = {
    EMPLOYMENT: "Employment verification letter",
    EXPERIENCE: "Experience letter",
    SALARY: "Salary certificate",
    ADDRESS_PROOF: "Address verification letter",
    RELIEVING: "Relieving letter",
  };
  if (professionalLabels[value]) return professionalLabels[value];
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}
