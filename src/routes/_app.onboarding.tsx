import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
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
import { fileToPayload, isPeopleLeaderRole, isPeopleOpsRole, labelize, ONBOARDING_DOC_LABELS } from "@/lib/lifecycle";
import { employeesApi, lifecycleApi } from "@/services/api";
import type { User } from "@/types/domain";

export const Route = createFileRoute("/_app/onboarding")({ component: OnboardingPage });

function OnboardingPage() {
  const { user } = useAuth();
  const isHr = isPeopleOpsRole(user?.role);
  const canOpen = isPeopleLeaderRole(user?.role);
  const [cases, setCases] = useState<Array<Record<string, unknown>>>([]);
  const [nho, setNho] = useState<Array<Record<string, unknown>>>([]);
  const [employees, setEmployees] = useState<User[]>([]);
  const [employeeId, setEmployeeId] = useState(user?.employeeId ?? "");
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    fullName: user?.name ?? "",
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
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [caseRows, nhoRows, people] = await Promise.all([
        lifecycleApi.onboarding(),
        lifecycleApi.nho(),
        isHr ? employeesApi.list() : Promise.resolve([]),
      ]);
      setCases(caseRows);
      setNho(nhoRows);
      setEmployees(people);
      const targetId = employeeId || user?.employeeId;
      const mine = nhoRows.find((row) => row.employeeId === targetId) ?? nhoRows[0];
      if (mine) {
        setForm({
          fullName: String(mine.fullName || user?.name || ""),
          fatherName: String(mine.fatherName || ""),
          dateOfBirth: String(mine.dateOfBirth || ""),
          ageYears: mine.ageYears != null ? String(mine.ageYears) : "",
          presentAddress: String(mine.presentAddress || ""),
          presentCity: String(mine.presentCity || ""),
          presentState: String(mine.presentState || ""),
          presentPincode: String(mine.presentPincode || ""),
          permanentAddress: String(mine.permanentAddress || ""),
          permanentCity: String(mine.permanentCity || ""),
          permanentState: String(mine.permanentState || ""),
          permanentPincode: String(mine.permanentPincode || ""),
          panNumber: String(mine.panNumber || ""),
        });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load onboarding");
    } finally {
      setLoading(false);
    }
  }, [employeeId, isHr, user?.employeeId, user?.name]);

  useEffect(() => {
    if (canOpen) void load();
  }, [canOpen, load]);

  if (!canOpen) {
    return (
      <EmptyState
        icon={ClipboardPen}
        title="HR and managers only"
        description="Onboarding is run by People Ops. Ask HR if you need to complete joining documents."
      />
    );
  }

  if (loading) return <LoadingState label="Loading onboarding" />;

  return (
    <div>
      <PageHeader
        eyebrow="Hire"
        title="Onboarding"
        description="Pre-onboarding offer, document sign-off, then the new-hire form."
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
                    toast.error(error instanceof Error ? error.message : "Could not start onboarding");
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
            <EmptyState icon={ClipboardPen} title="No onboarding cases" description="HR starts onboarding after the offer is sent." />
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
                        <p className="text-sm font-medium">{ONBOARDING_DOC_LABELS[String(doc.docType)] ?? String(doc.docType)}</p>
                        <StatusBadge status={labelize(String(doc.status))} />
                      </div>
                      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <label className="inline-flex h-11 flex-1 items-center justify-center rounded-md border text-sm">
                          Upload / sign
                          <input
                            type="file"
                            accept="application/pdf,image/*"
                            className="sr-only"
                            onChange={async (event) => {
                              const file = event.target.files?.[0];
                              if (!file) return;
                              try {
                                await lifecycleApi.signOnboardingDoc(String(doc.id), { file: await fileToPayload(file) });
                                toast.success("Document submitted");
                                await load();
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "Upload failed");
                              }
                            }}
                          />
                        </label>
                        {doc.fileKey ? (
                          <Button
                            variant="outline"
                            className="h-11"
                            onClick={() =>
                              void lifecycleApi
                                .downloadFile(String(doc.fileKey), String(doc.fileName || "document"))
                                .catch((error) => toast.error(error instanceof Error ? error.message : "Download failed"))
                            }
                          >
                            Download
                          </Button>
                        ) : null}
                        {isHr ? (
                          <Button
                            variant="outline"
                            className="h-11"
                            onClick={async () => {
                              try {
                                await lifecycleApi.verifyOnboardingDoc(String(doc.id), { approved: true });
                                toast.success("Verified");
                                await load();
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : "Verify failed");
                              }
                            }}
                          >
                            Verify
                          </Button>
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
            {isHr ? (
              <div className="sm:col-span-2">
                <EmployeePicker
                  employees={employees}
                  value={employeeId}
                  onChange={(next) => {
                    setEmployeeId(next);
                    const mine = nho.find((row) => row.employeeId === next);
                    if (mine) {
                      setForm({
                        fullName: String(mine.fullName || ""),
                        fatherName: String(mine.fatherName || ""),
                        dateOfBirth: String(mine.dateOfBirth || ""),
                        ageYears: mine.ageYears != null ? String(mine.ageYears) : "",
                        presentAddress: String(mine.presentAddress || ""),
                        presentCity: String(mine.presentCity || ""),
                        presentState: String(mine.presentState || ""),
                        presentPincode: String(mine.presentPincode || ""),
                        permanentAddress: String(mine.permanentAddress || ""),
                        permanentCity: String(mine.permanentCity || ""),
                        permanentState: String(mine.permanentState || ""),
                        permanentPincode: String(mine.permanentPincode || ""),
                        panNumber: String(mine.panNumber || ""),
                      });
                    }
                  }}
                  label="New hire"
                />
              </div>
            ) : null}
            <div className="sm:col-span-2">
              <Label>Full name</Label>
              <Input className="mt-1 h-11" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div>
              <Label>Father name</Label>
              <Input className="mt-1 h-11" value={form.fatherName} onChange={(e) => setForm({ ...form, fatherName: e.target.value })} />
            </div>
            <div>
              <Label>Age</Label>
              <Input className="mt-1 h-11" type="number" value={form.ageYears} onChange={(e) => setForm({ ...form, ageYears: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Date of birth</Label>
              <DateField className="mt-1" value={form.dateOfBirth} onChange={(dateOfBirth) => setForm({ ...form, dateOfBirth })} />
            </div>
            <div className="sm:col-span-2">
              <Label>Present address</Label>
              <Textarea className="mt-1" value={form.presentAddress} onChange={(e) => setForm({ ...form, presentAddress: e.target.value })} />
            </div>
            <Input placeholder="City" className="h-11" value={form.presentCity} onChange={(e) => setForm({ ...form, presentCity: e.target.value })} />
            <Input placeholder="State" className="h-11" value={form.presentState} onChange={(e) => setForm({ ...form, presentState: e.target.value })} />
            <Input placeholder="PIN" className="h-11" value={form.presentPincode} onChange={(e) => setForm({ ...form, presentPincode: e.target.value })} />
            <div className="sm:col-span-2">
              <Label>Permanent address</Label>
              <Textarea className="mt-1" value={form.permanentAddress} onChange={(e) => setForm({ ...form, permanentAddress: e.target.value })} />
            </div>
            <Input placeholder="City" className="h-11" value={form.permanentCity} onChange={(e) => setForm({ ...form, permanentCity: e.target.value })} />
            <Input placeholder="State" className="h-11" value={form.permanentState} onChange={(e) => setForm({ ...form, permanentState: e.target.value })} />
            <Input placeholder="PIN" className="h-11" value={form.permanentPincode} onChange={(e) => setForm({ ...form, permanentPincode: e.target.value })} />
            <div>
              <Label>PAN</Label>
              <Input className="mt-1 h-11" value={form.panNumber} onChange={(e) => setForm({ ...form, panNumber: e.target.value })} />
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
                    const target = employeeId || String(nho.find((row) => row.employeeId === employeeId)?.employeeId || nho[0]?.employeeId || "");
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
