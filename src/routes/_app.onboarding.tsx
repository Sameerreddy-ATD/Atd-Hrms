import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardPen } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { EmployeePicker } from "@/components/common/EmployeePicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DateField } from "@/components/ui/date-field";
import { useAuth } from "@/lib/auth";
import {
  fileToPayload,
  isPeopleLeaderRole,
  isPeopleOpsRole,
  labelize,
  ONBOARDING_DOC_LABELS,
} from "@/lib/lifecycle";
import { employeesApi, lifecycleApi } from "@/services/api";
import type { User } from "@/types/domain";

export const Route = createFileRoute("/_app/onboarding")({ component: OnboardingPage });

function emptyForm(name = "") {
  return {
    fullName: name,
    fatherName: "",
    dateOfBirth: "",
    ageYears: "",
    presentAddress: "",
    presentCity: "",
    presentState: "",
    presentPincode: "",
    permanentAddress: "",
    permanentCity: "",
    permanentState: "",
    permanentPincode: "",
    panNumber: "",
  };
}

function formFromNho(row: Record<string, unknown> | undefined, fallbackName = "") {
  if (!row) return emptyForm(fallbackName);
  return {
    fullName: String(row.fullName || fallbackName || ""),
    fatherName: String(row.fatherName || ""),
    dateOfBirth: String(row.dateOfBirth || ""),
    ageYears: row.ageYears != null ? String(row.ageYears) : "",
    presentAddress: String(row.presentAddress || ""),
    presentCity: String(row.presentCity || ""),
    presentState: String(row.presentState || ""),
    presentPincode: String(row.presentPincode || ""),
    permanentAddress: String(row.permanentAddress || ""),
    permanentCity: String(row.permanentCity || ""),
    permanentState: String(row.permanentState || ""),
    permanentPincode: String(row.permanentPincode || ""),
    panNumber: String(row.panNumber || ""),
  };
}

function OnboardingPage() {
  const { user } = useAuth();
  const isHr = isPeopleOpsRole(user?.role);
  const canManage = isPeopleLeaderRole(user?.role);
  const [cases, setCases] = useState<Array<Record<string, unknown>>>([]);
  const [nho, setNho] = useState<Array<Record<string, unknown>>>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [employeeId, setEmployeeId] = useState(user?.employeeId ?? "");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm(user?.name ?? ""));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [caseRows, nhoRows, people] = await Promise.all([
        lifecycleApi.onboarding(),
        lifecycleApi.nho(),
        canManage ? employeesApi.list() : Promise.resolve([]),
      ]);
      setCases(caseRows);
      setNho(nhoRows);
      setEmployees(people);
      const targetId = employeeId || user?.employeeId || "";
      const mine = nhoRows.find((row) => row.employeeId === targetId) ?? nhoRows[0];
      if (mine && (!employeeId || mine.employeeId === targetId || isHr)) {
        if (!employeeId && mine.employeeId) setEmployeeId(String(mine.employeeId));
        setForm(formFromNho(mine, user?.name ?? ""));
      } else if (!mine && user?.name) {
        setForm(emptyForm(user.name));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load onboarding");
    } finally {
      setLoading(false);
    }
  }, [canManage, employeeId, isHr, user?.employeeId, user?.name]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedNho = useMemo(
    () => nho.find((row) => row.employeeId === (employeeId || user?.employeeId)) ?? nho[0],
    [employeeId, nho, user?.employeeId],
  );

  if (loading) return <LoadingState label="Loading onboarding" />;

  const hasWork = cases.length > 0 || nho.length > 0 || Boolean(user?.employeeId) || canManage;

  if (!hasWork) {
    return (
      <EmptyState
        icon={ClipboardPen}
        title="No onboarding yet"
        description="When HR starts your joining case, documents and the new-hire form appear here."
      />
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Hire"
        title="Onboarding"
        description={
          canManage
            ? "Start joining for a new hire, verify documents, then approve the new-hire form."
            : "Sign joining documents and submit your new-hire form."
        }
        actions={
          isHr ? (
            <div className="flex w-full flex-col gap-2 sm:flex-row">
              <EmployeePicker employees={employees} value={employeeId} onChange={setEmployeeId} />
              <Button
                className="h-11"
                disabled={!employeeId}
                onClick={async () => {
                  try {
                    await lifecycleApi.startOnboarding({ employeeId });
                    toast.success("Onboarding started — documents are ready to sign");
                    await load();
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Could not start onboarding",
                    );
                  }
                }}
              >
                Start onboarding
              </Button>
            </div>
          ) : null
        }
      />

      <Tabs defaultValue="documents">
        <TabsList className="mb-4 w-full flex-wrap justify-start">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="nho">New hire form</TabsTrigger>
        </TabsList>
        <TabsContent value="documents" className="space-y-3">
          {cases.length === 0 ? (
            <EmptyState
              icon={ClipboardPen}
              title="No onboarding cases"
              description={
                isHr
                  ? "Start onboarding after Talent links a candidate to an employee login."
                  : "HR has not opened your joining case yet."
              }
            />
          ) : (
            cases.map((row) => (
              <article key={String(row.id)} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{String(row.employeeName)}</p>
                    <p className="text-xs text-muted-foreground">{String(row.employeeCode)}</p>
                  </div>
                  <StatusBadge status={labelize(String(row.status))} />
                </div>
                <ul className="mt-3 space-y-2">
                  {(row.documents as Array<Record<string, unknown>> | undefined)?.map((doc) => (
                    <li key={String(doc.id)} className="rounded-lg border p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {ONBOARDING_DOC_LABELS[String(doc.docType)] ?? String(doc.docType)}
                        </p>
                        <StatusBadge status={labelize(String(doc.status))} />
                      </div>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        {["PENDING", "SENT", "REJECTED", "UPLOADED", "SIGNED"].includes(
                          String(doc.status),
                        ) ? (
                          <label className="inline-flex h-11 flex-1 cursor-pointer items-center justify-center rounded-md border text-sm">
                            Upload / sign
                            <input
                              type="file"
                              accept="application/pdf,image/*"
                              className="sr-only"
                              onChange={async (event) => {
                                const file = event.target.files?.[0];
                                if (!file) return;
                                try {
                                  await lifecycleApi.signOnboardingDoc(String(doc.id), {
                                    file: await fileToPayload(file),
                                  });
                                  toast.success("Document submitted");
                                  await load();
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error ? error.message : "Upload failed",
                                  );
                                }
                              }}
                            />
                          </label>
                        ) : null}
                        {doc.fileKey ? (
                          <Button
                            variant="outline"
                            className="h-11"
                            onClick={() =>
                              void lifecycleApi
                                .downloadFile(
                                  String(doc.fileKey),
                                  String(doc.fileName || "document"),
                                )
                                .catch((error) =>
                                  toast.error(
                                    error instanceof Error ? error.message : "Download failed",
                                  ),
                                )
                            }
                          >
                            Download
                          </Button>
                        ) : null}
                        {isHr && ["UPLOADED", "SIGNED"].includes(String(doc.status)) ? (
                          <>
                            <Button
                              variant="outline"
                              className="h-11"
                              onClick={async () => {
                                try {
                                  await lifecycleApi.verifyOnboardingDoc(String(doc.id), {
                                    approved: true,
                                  });
                                  toast.success("Verified");
                                  await load();
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error ? error.message : "Verify failed",
                                  );
                                }
                              }}
                            >
                              Verify
                            </Button>
                            <Button
                              variant="ghost"
                              className="h-11"
                              onClick={async () => {
                                try {
                                  await lifecycleApi.verifyOnboardingDoc(String(doc.id), {
                                    approved: false,
                                  });
                                  toast.message("Document rejected — ask the hire to re-upload");
                                  await load();
                                } catch (error) {
                                  toast.error(
                                    error instanceof Error ? error.message : "Reject failed",
                                  );
                                }
                              }}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
        </TabsContent>
        <TabsContent value="nho">
          <div className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2">
            {canManage ? (
              <div className="sm:col-span-2">
                <EmployeePicker
                  employees={employees}
                  value={employeeId}
                  onChange={(next) => {
                    setEmployeeId(next);
                    setForm(
                      formFromNho(
                        nho.find((row) => row.employeeId === next),
                        user?.name ?? "",
                      ),
                    );
                  }}
                  label="New hire"
                />
              </div>
            ) : null}
            {selectedNho ? (
              <div className="sm:col-span-2">
                <StatusBadge status={labelize(String(selectedNho.status))} />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Label>Full name</Label>
              <Input
                className="mt-1 h-11"
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              />
            </div>
            <div>
              <Label>Father name</Label>
              <Input
                className="mt-1 h-11"
                value={form.fatherName}
                onChange={(e) => setForm({ ...form, fatherName: e.target.value })}
              />
            </div>
            <div>
              <Label>Age</Label>
              <Input
                className="mt-1 h-11"
                type="number"
                value={form.ageYears}
                onChange={(e) => setForm({ ...form, ageYears: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Date of birth</Label>
              <DateField
                className="mt-1"
                value={form.dateOfBirth}
                onChange={(dateOfBirth) => setForm({ ...form, dateOfBirth })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Present address</Label>
              <Textarea
                className="mt-1"
                value={form.presentAddress}
                onChange={(e) => setForm({ ...form, presentAddress: e.target.value })}
              />
            </div>
            <Input
              placeholder="City"
              className="h-11"
              value={form.presentCity}
              onChange={(e) => setForm({ ...form, presentCity: e.target.value })}
            />
            <Input
              placeholder="State"
              className="h-11"
              value={form.presentState}
              onChange={(e) => setForm({ ...form, presentState: e.target.value })}
            />
            <Input
              placeholder="PIN"
              className="h-11"
              value={form.presentPincode}
              onChange={(e) => setForm({ ...form, presentPincode: e.target.value })}
            />
            <div className="sm:col-span-2">
              <Label>Permanent address</Label>
              <Textarea
                className="mt-1"
                value={form.permanentAddress}
                onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })}
              />
            </div>
            <Input
              placeholder="City"
              className="h-11"
              value={form.permanentCity}
              onChange={(e) => setForm({ ...form, permanentCity: e.target.value })}
            />
            <Input
              placeholder="State"
              className="h-11"
              value={form.permanentState}
              onChange={(e) => setForm({ ...form, permanentState: e.target.value })}
            />
            <Input
              placeholder="PIN"
              className="h-11"
              value={form.permanentPincode}
              onChange={(e) => setForm({ ...form, permanentPincode: e.target.value })}
            />
            <div>
              <Label>PAN</Label>
              <Input
                className="mt-1 h-11"
                value={form.panNumber}
                onChange={(e) => setForm({ ...form, panNumber: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row">
              <Button
                className="h-12 flex-1"
                onClick={async () => {
                  const target = employeeId || user?.employeeId;
                  if (!target) return toast.error("No employee profile on this login");
                  try {
                    await lifecycleApi.saveNho(target, {
                      ...form,
                      ageYears: form.ageYears ? Number(form.ageYears) : undefined,
                      submit: true,
                    });
                    toast.success("New-hire form submitted");
                    await load();
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not submit NHO");
                  }
                }}
              >
                Submit NHO form
              </Button>
              {isHr ? (
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={async () => {
                    const target =
                      employeeId ||
                      String(
                        nho.find((row) => row.employeeId === employeeId)?.employeeId ||
                          nho[0]?.employeeId ||
                          "",
                      );
                    if (!target) return toast.error("Select the new hire first");
                    try {
                      await lifecycleApi.verifyNho(target, { approved: true });
                      toast.success("NHO verified — employee is active");
                      await load();
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not verify NHO");
                    }
                  }}
                >
                  HR verify
                </Button>
              ) : null}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
