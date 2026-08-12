import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
import { formatDisplayDate } from "@/lib/india-date";
import { COMPANY_LABELS, PARENT_COMPANY_NAME, ROLE_LABELS, type User } from "@/types/domain";
import { employeesApi, usersApi } from "@/services/api";
import { Eye, EyeOff, Key, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/common/PasswordInput";
import { PasswordMatchHint } from "@/components/common/PasswordMatchHint";
import { EmergencyContactSection } from "@/components/profile/EmergencyContactSection";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, updateCurrentUser, changePassword } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [companyPhone, setCompanyPhone] = useState(user?.companyPhone ?? "");
  const [dob, setDob] = useState(user?.dateOfBirth ?? "");
  const [bankAccountHolderName, setBankAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfscCode, setBankIfscCode] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [uanNumber, setUanNumber] = useState("");
  const [employee, setEmployee] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  // Self change password states
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(["identity"]);

  useEffect(() => {
    (user?.employeeId ? employeesApi.get(user.employeeId) : Promise.resolve(null))
      .then((employeeDetails) => {
        setEmployee(employeeDetails);
        if (employeeDetails) {
          setCompanyPhone(employeeDetails.companyPhone ?? "");
          setBankAccountHolderName(employeeDetails.bankAccountHolderName ?? "");
          setBankAccountNumber(employeeDetails.bankAccountNumber ?? "");
          setBankIfscCode(employeeDetails.bankIfscCode ?? "");
          setPanNumber(employeeDetails.panNumber ?? "");
          setAadhaarNumber(employeeDetails.aadhaarNumber ?? "");
          setUanNumber(employeeDetails.uanNumber ?? "");
        }
      })
      .catch(() => {
        setEmployee(null);
      });
  }, [user?.employeeId]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone ?? "");
    setCompanyPhone(user.companyPhone ?? "");
    setDob(user.dateOfBirth ?? "");
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash !== "#emergency-contact") return;
    setOpenSections((current) =>
      current.includes("emergency-contact") ? current : [...current, "emergency-contact"],
    );
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById("emergency-contact")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [employee?.emergencyContact, user?.employeeId]);

  if (!user) return null;
  const canSaveDirectly = user.role === "developer_admin";
  const canEditEmergencyContact = canSaveDirectly || user.role === "hr";
  const profile = employee ?? user;
  const initials = user.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("");

  const rules = [
    { label: "At least 8 characters", ok: newPw.length >= 8 },
    { label: "Contains a number", ok: /\d/.test(newPw) },
    { label: "Contains uppercase letter", ok: /[A-Z]/.test(newPw) },
    { label: "Matches confirmation", ok: newPw.length > 0 && newPw === confirmPw },
  ];

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (!oldPw) {
      toast.error("Please enter your current password");
      return;
    }
    if (rules.some((r) => !r.ok)) {
      toast.error("Please meet all password requirements");
      return;
    }
    setPwSaving(true);
    try {
      await changePassword(oldPw, newPw);
      toast.success("Password changed successfully");
      setOldPw("");
      setNewPw("");
      setConfirmPw("");
    } catch (err) {
      toast.error((err as Error).message || "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="My Profile"
        description={
          canSaveDirectly
            ? "Developer Admin can update profile fields and emergency contact directly."
            : "Profile details are view-only. Ask Developer Admin to update employment or account fields. Emergency contact is shown below; HR or Developer Admin can update it. You can still change your own password."
        }
      />
      <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-5 text-center sm:p-6">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold">{user.name}</p>
                <p className="text-sm text-muted-foreground">{ROLE_LABELS[user.role]}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {profile.employeeCode ?? user.employeeId ?? "-"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-sm flex items-center gap-1.5">
                <Key className="h-4 w-4" /> Security
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="change-password" className="border-b-0">
                  <AccordionTrigger className="py-3 text-sm hover:no-underline">
                    Change password
                  </AccordionTrigger>
                  <AccordionContent>
                    <form onSubmit={handlePasswordChange} className="space-y-3.5">
                      <div className="space-y-1.5">
                        <Label htmlFor="current-pw">Current Password</Label>
                        <PasswordInput
                          id="current-pw"
                          value={oldPw}
                          onChange={(e) => setOldPw(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-pw">New Password</Label>
                        <PasswordInput
                          id="new-pw"
                          value={newPw}
                          onChange={(e) => setNewPw(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirm-pw">Confirm New Password</Label>
                        <PasswordInput
                          id="confirm-pw"
                          value={confirmPw}
                          onChange={(e) => setConfirmPw(e.target.value)}
                        />
                        <PasswordMatchHint password={newPw} confirm={confirmPw} />
                      </div>
                      <ul className="space-y-1 text-[11px]">
                        {rules.map((r) => (
                          <li
                            key={r.label}
                            className={
                              r.ok
                                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {r.ok ? "✓" : "○"} {r.label}
                          </li>
                        ))}
                      </ul>
                      <Button
                        type="submit"
                        disabled={pwSaving || !rules.every((r) => r.ok)}
                        className="w-full"
                      >
                        {pwSaving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                        Change Password
                      </Button>
                    </form>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit lg:col-span-2">
          <CardContent className="p-4 sm:p-6">
            <div className="mb-4 border-b pb-4">
              <h2 className="font-semibold">Personal and employment details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Open a section below to view your details.
              </p>
            </div>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canSaveDirectly) return;
                setSaving(true);
                try {
                  let updatedEmployee = employee;
                  let updatedProfile: User;
                  if (user.employeeId) {
                    updatedEmployee = await employeesApi.update(user.employeeId, {
                      name,
                      email,
                      phone: phone || undefined,
                      companyPhone: companyPhone || undefined,
                      dateOfBirth: dob || undefined,
                      bankAccountHolderName: bankAccountHolderName || undefined,
                      bankAccountNumber: bankAccountNumber || undefined,
                      bankIfscCode: bankIfscCode || undefined,
                      panNumber: panNumber || undefined,
                      aadhaarNumber: aadhaarNumber || undefined,
                      uanNumber: uanNumber || undefined,
                    });
                    setEmployee(updatedEmployee);
                    updatedProfile = { ...user, ...updatedEmployee };
                  } else {
                    updatedProfile = await usersApi.update(user.id, {
                      name,
                      email,
                      phone: phone || undefined,
                    });
                  }
                  updateCurrentUser(updatedProfile);
                  toast.success("Profile updated");
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
            >
              <Accordion
                type="multiple"
                value={openSections}
                onValueChange={setOpenSections}
                className="w-full"
              >
                <AccordionItem value="identity">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    Identity and contact
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Full name"
                        value={name}
                        onChange={setName}
                        editable={canSaveDirectly}
                      />
                      <Field label="Employee code" value={profile.employeeCode ?? "-"} />
                      <Field
                        label="Email"
                        value={email}
                        onChange={setEmail}
                        editable={canSaveDirectly}
                      />
                      <Field
                        label="Personal phone number"
                        value={phone}
                        onChange={setPhone}
                        editable={canSaveDirectly}
                      />
                      <Field
                        label="Company phone number"
                        value={canSaveDirectly ? companyPhone : companyPhone || "Not provided"}
                        onChange={setCompanyPhone}
                        editable={canSaveDirectly}
                      />
                      <Field
                        label="Date of Birth"
                        value={dob}
                        onChange={setDob}
                        editable={canSaveDirectly}
                        type="date"
                      />
                      <Field label="Gender" value={formatGender(profile.gender)} />
                      <Field label="Blood group" value={profile.bloodGroup ?? "Not provided"} />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="employment">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    Employment
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Employer company"
                        value={
                          profile.companyEntity
                            ? COMPANY_LABELS[profile.companyEntity]
                            : "Not assigned"
                        }
                      />
                      <Field label="Parent group" value={PARENT_COMPANY_NAME} />
                      <Field label="Role" value={ROLE_LABELS[user.role]} />
                      <Field
                        label="Employment type"
                        value={formatEmployment(profile.employmentType)}
                      />
                      <Field
                        label="Organization level"
                        value={formatOrganizationLevel(profile.organizationLevel)}
                      />
                      <Field label="Department" value={profile.department ?? "-"} />
                      <Field label="Designation" value={profile.designation ?? "-"} />
                      <Field
                        label="Reporting manager"
                        value={profile.managerName ?? "Not assigned"}
                      />
                      <Field
                        label="Joining date"
                        value={
                          profile.joiningDate ? formatDisplayDate(profile.joiningDate) : "-"
                        }
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="banking">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    Banking details
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field
                        label="Account holder name"
                        value={
                          canSaveDirectly
                            ? bankAccountHolderName
                            : bankAccountHolderName || "Not provided"
                        }
                        onChange={setBankAccountHolderName}
                        editable={canSaveDirectly}
                      />
                      <Field label="Account type" value={formatLabel(profile.bankAccountType)} />
                      {canSaveDirectly ? (
                        <Field
                          label="Account number"
                          value={bankAccountNumber}
                          onChange={setBankAccountNumber}
                          editable
                        />
                      ) : (
                        <SensitiveField label="Account number" value={bankAccountNumber} />
                      )}
                      <Field
                        label="IFSC code"
                        value={canSaveDirectly ? bankIfscCode : bankIfscCode || "Not provided"}
                        onChange={setBankIfscCode}
                        editable={canSaveDirectly}
                      />
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="statutory">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    Statutory details
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {canSaveDirectly ? (
                        <>
                          <Field label="PAN" value={panNumber} onChange={setPanNumber} editable />
                          <Field
                            label="Aadhaar number"
                            value={aadhaarNumber}
                            onChange={setAadhaarNumber}
                            editable
                          />
                          <Field
                            label="UAN number"
                            value={uanNumber}
                            onChange={setUanNumber}
                            editable
                          />
                        </>
                      ) : (
                        <>
                          <SensitiveField label="PAN" value={panNumber} />
                          <SensitiveField label="Aadhaar number" value={aadhaarNumber} />
                          <SensitiveField label="UAN number" value={uanNumber} />
                        </>
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>

                {user.employeeId && (
                  <AccordionItem value="emergency-contact" className="border-b-0">
                    <AccordionTrigger className="text-sm hover:no-underline">
                      Emergency contact
                    </AccordionTrigger>
                    <AccordionContent>
                      <p className="mb-3 text-xs text-muted-foreground">
                        {canEditEmergencyContact
                          ? "Used for workplace emergencies and the employee ID card."
                          : "View-only. Ask HR or Developer Admin to update these details."}
                      </p>
                      <EmergencyContactSection
                        employeeId={user.employeeId}
                        value={employee?.emergencyContact}
                        canEdit={canEditEmergencyContact}
                        hideHeader
                        onSaved={(next) =>
                          setEmployee((current) =>
                            current ? { ...current, emergencyContact: next } : current,
                          )
                        }
                      />
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>

              {canSaveDirectly && (
                <div className="mt-4 flex justify-end border-t border-border pt-4">
                  <Button type="submit" disabled={saving}>
                    Save profile
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Privacy and account access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              When employment ends, HR or Developer Admin offboards your login. Contact HR for
              privacy questions about your employee record.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Link to="/privacy" className="font-medium text-primary hover:underline">
                Privacy policy
              </Link>
              <Link to="/terms" className="font-medium text-primary hover:underline">
                Terms of use
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatGender(gender?: User["gender"]) {
  if (gender === "FEMALE") return "Female";
  if (gender === "MALE") return "Male";
  if (gender === "PREFER_NOT_TO_SAY") return "Prefer not to say";
  return "Not provided";
}

function formatEmployment(type?: User["employmentType"]) {
  if (type === "FULL_TIME") return "Full-time";
  if (type === "PART_TIME") return "Part-time";
  if (type === "INTERN") return "Intern";
  return "Not provided";
}

function formatOrganizationLevel(level?: User["organizationLevel"]) {
  if (!level) return "Not assigned";
  return level.charAt(0) + level.slice(1).toLowerCase();
}

function formatLabel(value?: string) {
  if (!value) return "Not provided";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SensitiveField({ label, value }: { label: string; value: string }) {
  const [revealed, setRevealed] = useState(false);
  const displayValue = !value
    ? "Not provided"
    : revealed
      ? value
      : `${"•".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
  return (
    <div className="min-w-0 rounded-md border bg-muted/20 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {value && (
          <button
            type="button"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => setRevealed((current) => !current)}
            aria-label={`${revealed ? "Hide" : "Show"} ${label}`}
          >
            {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <p className="mt-0.5 break-all text-sm font-medium text-foreground">{displayValue}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  editable = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  editable?: boolean;
  type?: string;
}) {
  const isDate = type === "date";
  return editable ? (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {isDate ? (
        <DateField value={value} onChange={(next) => onChange?.(next)} aria-label={label} />
      ) : (
        <Input type={type} value={value} onChange={(event) => onChange?.(event.target.value)} />
      )}
    </div>
  ) : (
    <div className="min-w-0 rounded-md border bg-muted/20 px-3 py-2.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-0.5 break-words text-sm font-medium text-foreground">
        {isDate ? formatDisplayDate(value) : value}
      </p>
    </div>
  );
}
