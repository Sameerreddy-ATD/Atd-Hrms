import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";
import {
  COMPANY_LABELS,
  PARENT_COMPANY_NAME,
  ROLE_LABELS,
  type ProfileSelfEditFieldKey,
  type ProfileSelfEditPolicy,
  type User,
} from "@/types/domain";
import { employeesApi, profileSelfEditApi, usersApi } from "@/services/api";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BriefcaseBusiness,
  Building2,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Landmark,
  Loader2,
  PencilLine,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { PasswordInput } from "@/components/common/PasswordInput";
import { PasswordMatchHint } from "@/components/common/PasswordMatchHint";
import { EmergencyContactSection } from "@/components/profile/EmergencyContactSection";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

function ProfilePage() {
  const { user, updateCurrentUser, changePassword } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [companyPhone, setCompanyPhone] = useState(user?.companyPhone ?? "");
  const [dob, setDob] = useState(user?.dateOfBirth ?? "");
  const [bloodGroup, setBloodGroup] = useState("");
  const [bankAccountHolderName, setBankAccountHolderName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankIfscCode, setBankIfscCode] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [aadhaarNumber, setAadhaarNumber] = useState("");
  const [uanNumber, setUanNumber] = useState("");
  const [employee, setEmployee] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [selfEditPolicy, setSelfEditPolicy] = useState<ProfileSelfEditPolicy | null>(null);

  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(["identity"]);
  const [securityOpen, setSecurityOpen] = useState<string>("");

  useEffect(() => {
    void profileSelfEditApi
      .get()
      .then(setSelfEditPolicy)
      .catch(() => setSelfEditPolicy(null));
  }, []);

  useEffect(() => {
    (user?.employeeId ? employeesApi.get(user.employeeId) : Promise.resolve(null))
      .then((employeeDetails) => {
        setEmployee(employeeDetails);
        if (employeeDetails) {
          setCompanyPhone(employeeDetails.companyPhone ?? "");
          setBloodGroup(employeeDetails.bloodGroup ?? "");
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
  const selfEditEnabled = Boolean(selfEditPolicy?.enabled);
  const allowedSelfFields = new Set(selfEditPolicy?.allowedFields ?? []);
  const canEditField = (field: ProfileSelfEditFieldKey) =>
    canSaveDirectly || (selfEditEnabled && allowedSelfFields.has(field));
  const canEditAnyProfileField =
    canSaveDirectly ||
    (selfEditEnabled && [...allowedSelfFields].some((field) => field !== "emergencyContact"));
  const canEditEmergencyContact =
    canSaveDirectly || user.role === "hr" || canEditField("emergencyContact");
  const profile = employee ?? user;
  const initials = user.name
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
      setSecurityOpen("");
    } catch (err) {
      toast.error((err as Error).message || "Failed to change password");
    } finally {
      setPwSaving(false);
    }
  }

  async function handleProfileSave(e: React.FormEvent) {
    e.preventDefault();
    if (!canEditAnyProfileField) return;
    setSaving(true);
    try {
      let updatedEmployee = employee;
      let updatedProfile: User;
      if (user.employeeId) {
        const patch: Record<string, string | undefined> = {};
        if (canEditField("name")) patch.name = name;
        if (canSaveDirectly) patch.email = email;
        if (canEditField("phone")) patch.phone = phone || undefined;
        if (canEditField("companyPhone")) patch.companyPhone = companyPhone || undefined;
        if (canEditField("dateOfBirth")) patch.dateOfBirth = dob || undefined;
        if (canEditField("bloodGroup")) patch.bloodGroup = bloodGroup || undefined;
        if (canEditField("bankAccountHolderName")) {
          patch.bankAccountHolderName = bankAccountHolderName || undefined;
        }
        if (canEditField("bankAccountNumber")) {
          patch.bankAccountNumber = bankAccountNumber || undefined;
        }
        if (canEditField("bankIfscCode")) patch.bankIfscCode = bankIfscCode || undefined;
        if (canEditField("panNumber")) patch.panNumber = panNumber || undefined;
        if (canEditField("aadhaarNumber")) patch.aadhaarNumber = aadhaarNumber || undefined;
        if (canEditField("uanNumber")) patch.uanNumber = uanNumber || undefined;

        if (Object.keys(patch).length === 0) {
          toast.error("No editable fields to save");
          return;
        }

        updatedEmployee = await employeesApi.update(user.employeeId, patch);
        setEmployee(updatedEmployee);
        updatedProfile = { ...user, ...updatedEmployee };
      } else if (canSaveDirectly) {
        updatedProfile = await usersApi.update(user.id, {
          name,
          email,
          phone: phone || undefined,
        });
      } else {
        toast.error("No employee record is linked to this login");
        return;
      }
      updateCurrentUser(updatedProfile);
      toast.success("Profile updated");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const metaBits = [
    profile.designation,
    profile.department,
    profile.employeeCode ?? user.employeeId,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:space-y-5">
      <PageHeader
        className="mb-0 border-border/50 pb-3 sm:mb-0 sm:pb-4"
        title="My Profile"
        description={
          canSaveDirectly
            ? "Update your details and emergency contact directly."
            : canEditAnyProfileField || canEditEmergencyContact
              ? "Edit the fields your organization has enabled. Employment data stays admin-controlled."
              : "View your workforce identity. Ask Developer Admin if you need a field unlocked."
        }
      />

      {/* Identity badge — compact hero inspired by ID-card / iOS Settings header */}
      <section className="aw-enter relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_55%),linear-gradient(180deg,color-mix(in_oklab,var(--muted)_55%,transparent),transparent)]"
        />
        <div className="relative flex flex-col items-center gap-4 p-5 text-center sm:flex-row sm:items-center sm:gap-5 sm:p-6 sm:text-left">
          <Avatar className="size-20 border-2 border-background shadow-md ring-1 ring-border/80 sm:size-[4.5rem]">
            <AvatarFallback className="bg-primary text-lg font-semibold tracking-wide text-primary-foreground sm:text-xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
              <h2 className="truncate text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {user.name}
              </h2>
              {canEditAnyProfileField && (
                <Badge
                  variant="outline"
                  className="border-primary/25 bg-primary/8 text-[10px] font-semibold uppercase tracking-wide text-primary"
                >
                  <PencilLine className="mr-1 size-3" />
                  Editing on
                </Badge>
              )}
            </div>
            <p className="text-sm font-medium text-muted-foreground">
              {ROLE_LABELS[user.role]}
              {profile.companyEntity ? ` · ${COMPANY_LABELS[profile.companyEntity]}` : ""}
            </p>
            {metaBits.length > 0 && (
              <div className="flex flex-wrap items-center justify-center gap-1.5 sm:justify-start">
                {metaBits.map((bit) => (
                  <span
                    key={bit}
                    className="rounded-md border border-border/70 bg-background/80 px-2 py-0.5 font-mono text-[11px] text-muted-foreground"
                  >
                    {bit}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[10.5rem]">
            <Button asChild variant="outline" className="h-11 w-full justify-between sm:h-10">
              <Link to="/id-card">
                <span className="inline-flex items-center gap-2">
                  <IdCard className="size-4" />
                  ID card
                </span>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full justify-between sm:h-10"
              onClick={() => {
                setSecurityOpen("change-password");
                window.requestAnimationFrame(() => {
                  document
                    .getElementById("profile-security")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                });
              }}
            >
              <span className="inline-flex items-center gap-2">
                <KeyRound className="size-4" />
                Password
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardHeader className="space-y-1 border-b border-border/60 bg-muted/25 px-4 py-3.5 sm:px-5">
            <CardTitle className="text-base">Personal details</CardTitle>
            <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
              {canEditAnyProfileField
                ? "Open a section to review or update the fields available to you."
                : "Open a section to review your saved workforce details."}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <form onSubmit={(e) => void handleProfileSave(e)}>
              <Accordion
                type="multiple"
                value={openSections}
                onValueChange={setOpenSections}
                className="w-full"
              >
                <ProfileSection
                  value="identity"
                  icon={UserRound}
                  title="Identity and contact"
                  hint="Name, phones, date of birth"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Full name"
                      value={name}
                      onChange={setName}
                      editable={canEditField("name")}
                    />
                    <Field label="Employee code" value={profile.employeeCode ?? "-"} />
                    <Field
                      label="Email"
                      value={email}
                      onChange={setEmail}
                      editable={canSaveDirectly}
                    />
                    <Field
                      label="Personal phone"
                      value={phone}
                      onChange={setPhone}
                      editable={canEditField("phone")}
                    />
                    <Field
                      label="Company phone"
                      value={
                        canEditField("companyPhone")
                          ? companyPhone
                          : companyPhone || "Not provided"
                      }
                      onChange={setCompanyPhone}
                      editable={canEditField("companyPhone")}
                    />
                    <Field
                      label="Date of birth"
                      value={dob}
                      onChange={setDob}
                      editable={canEditField("dateOfBirth")}
                      type="date"
                    />
                    <Field label="Gender" value={formatGender(profile.gender)} />
                    {canEditField("bloodGroup") ? (
                      <div className="space-y-1.5">
                        <Label>Blood group</Label>
                        <Select
                          value={bloodGroup || "none"}
                          onValueChange={(next) => setBloodGroup(next === "none" ? "" : next)}
                        >
                          <SelectTrigger className="h-11 sm:h-9">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Not provided</SelectItem>
                            {BLOOD_GROUPS.map((group) => (
                              <SelectItem key={group} value={group}>
                                {group}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <Field
                        label="Blood group"
                        value={bloodGroup || profile.bloodGroup || "Not provided"}
                      />
                    )}
                  </div>
                </ProfileSection>

                <ProfileSection
                  value="employment"
                  icon={BriefcaseBusiness}
                  title="Employment"
                  hint="Company, role, reporting line"
                >
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
                </ProfileSection>

                <ProfileSection
                  value="banking"
                  icon={Landmark}
                  title="Banking"
                  hint="Account holder, IFSC, account number"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Account holder name"
                      value={
                        canEditField("bankAccountHolderName")
                          ? bankAccountHolderName
                          : bankAccountHolderName || "Not provided"
                      }
                      onChange={setBankAccountHolderName}
                      editable={canEditField("bankAccountHolderName")}
                    />
                    <Field label="Account type" value={formatLabel(profile.bankAccountType)} />
                    {canEditField("bankAccountNumber") ? (
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
                      value={
                        canEditField("bankIfscCode")
                          ? bankIfscCode
                          : bankIfscCode || "Not provided"
                      }
                      onChange={setBankIfscCode}
                      editable={canEditField("bankIfscCode")}
                    />
                  </div>
                </ProfileSection>

                <ProfileSection
                  value="statutory"
                  icon={CreditCard}
                  title="Statutory"
                  hint="PAN, Aadhaar, UAN"
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    {canEditField("panNumber") ? (
                      <Field label="PAN" value={panNumber} onChange={setPanNumber} editable />
                    ) : (
                      <SensitiveField label="PAN" value={panNumber} />
                    )}
                    {canEditField("aadhaarNumber") ? (
                      <Field
                        label="Aadhaar number"
                        value={aadhaarNumber}
                        onChange={setAadhaarNumber}
                        editable
                      />
                    ) : (
                      <SensitiveField label="Aadhaar number" value={aadhaarNumber} />
                    )}
                    {canEditField("uanNumber") ? (
                      <Field
                        label="UAN number"
                        value={uanNumber}
                        onChange={setUanNumber}
                        editable
                      />
                    ) : (
                      <SensitiveField label="UAN number" value={uanNumber} />
                    )}
                  </div>
                </ProfileSection>

                {user.employeeId && (
                  <ProfileSection
                    value="emergency-contact"
                    icon={ShieldAlert}
                    title="Emergency contact"
                    hint="Used on the employee ID card"
                    last
                  >
                    <p className="mb-3 text-xs text-muted-foreground">
                      {canEditEmergencyContact
                        ? "Keep this current for workplace emergencies."
                        : "View-only. Ask HR or Developer Admin to update it, or enable it in System Settings."}
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
                  </ProfileSection>
                )}
              </Accordion>

              {canEditAnyProfileField && (
                <div
                  className={cn(
                    "border-t border-border/70 bg-card/95 p-4 backdrop-blur-sm",
                    "sticky bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 shadow-[0_-8px_24px_rgba(15,23,42,0.06)]",
                    "md:static md:shadow-none md:backdrop-blur-none",
                  )}
                >
                  <Button type="submit" disabled={saving} className="h-11 w-full md:ml-auto md:flex md:w-auto md:min-w-40">
                    {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                    Save profile
                  </Button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <aside className="space-y-4">
          <Card id="profile-security" className="scroll-mt-24 border-border/70 shadow-sm">
            <CardHeader className="space-y-1 border-b border-border/60 bg-muted/25 px-4 py-3.5">
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4 text-primary" />
                Security
              </CardTitle>
              <p className="text-xs text-muted-foreground">Change the password for this login.</p>
            </CardHeader>
            <CardContent className="p-0">
              <Accordion
                type="single"
                collapsible
                value={securityOpen}
                onValueChange={setSecurityOpen}
              >
                <AccordionItem value="change-password" className="border-0">
                  <AccordionTrigger
                    className={cn(
                      "px-4 py-3.5 text-sm font-semibold hover:no-underline",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                  >
                    Change password
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <form onSubmit={handlePasswordChange} className="space-y-3.5">
                      <div className="space-y-1.5">
                        <Label htmlFor="current-pw">Current password</Label>
                        <PasswordInput
                          id="current-pw"
                          value={oldPw}
                          onChange={(e) => setOldPw(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="new-pw">New password</Label>
                        <PasswordInput
                          id="new-pw"
                          value={newPw}
                          onChange={(e) => setNewPw(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="confirm-pw">Confirm new password</Label>
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
                                ? "font-medium text-emerald-600 dark:text-emerald-400"
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
                        className="h-11 w-full"
                      >
                        {pwSaving && <Loader2 className="mr-2 size-3.5 animate-spin" />}
                        Update password
                      </Button>
                    </form>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>

          <Card className="border-border/70 shadow-sm">
            <CardHeader className="space-y-1 pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="size-4 text-muted-foreground" />
                Privacy and access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p className="leading-relaxed">
                Accounts are employer-provisioned. When employment ends, HR or Developer Admin
                offboards your login. You can request deletion of personal app data.
              </p>
              <div className="flex flex-col gap-1">
                <Link
                  to="/privacy"
                  className="inline-flex h-11 items-center justify-between rounded-md border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                >
                  Privacy policy
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
                <Link
                  to="/terms"
                  className="inline-flex h-11 items-center justify-between rounded-md border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                >
                  Terms of use
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
                <Link
                  to="/account-deletion"
                  className="inline-flex h-11 items-center justify-between rounded-md border border-border/70 px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50"
                >
                  Request account deletion
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </div>
              <Button asChild variant="outline" className="h-11 w-full">
                <a href="mailto:hrms@anytimediesel.com?subject=Anytime%20Workforce%20account%20deletion%20request">
                  Email HR
                </a>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ProfileSection({
  value,
  icon: Icon,
  title,
  hint,
  children,
  last = false,
}: {
  value: string;
  icon: typeof UserRound;
  title: string;
  hint: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <AccordionItem
      value={value}
      className={cn(
        "border-border/60",
        last && "border-b-0",
        "data-[state=open]:bg-muted/20",
      )}
    >
      <AccordionTrigger
        className={cn(
          "group gap-3 px-4 py-3.5 hover:no-underline sm:px-5",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "data-[state=open]:bg-primary/[0.04] data-[state=open]:shadow-[inset_3px_0_0_var(--primary)]",
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span
            className={cn(
              "grid size-10 shrink-0 place-items-center rounded-xl border border-border/70 bg-background text-muted-foreground transition-colors",
              "group-data-[state=open]:border-primary/25 group-data-[state=open]:bg-primary/10 group-data-[state=open]:text-primary",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-foreground">{title}</span>
            <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{hint}</span>
          </span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 sm:px-5">
        <div className="rounded-xl border border-border/60 bg-background/80 p-3 sm:p-4">{children}</div>
      </AccordionContent>
    </AccordionItem>
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
    <div className="min-w-0 rounded-xl border border-border/70 bg-muted/25 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        {value && (
          <button
            type="button"
            className="grid size-9 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onClick={() => setRevealed((current) => !current)}
            aria-label={`${revealed ? "Hide" : "Show"} ${label}`}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      <p className="mt-1 break-all text-sm font-semibold text-foreground">{displayValue}</p>
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
        <Input
          type={type}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className="h-11 sm:h-9"
        />
      )}
    </div>
  ) : (
    <div className="min-w-0 rounded-xl border border-border/70 bg-muted/25 px-3 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words text-sm font-semibold text-foreground">
        {isDate ? formatDisplayDate(value) : value}
      </p>
    </div>
  );
}
