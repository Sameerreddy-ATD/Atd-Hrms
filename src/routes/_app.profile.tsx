import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { createPortal } from "react-dom";
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
  CreditCard,
  Eye,
  EyeOff,
  IdCard,
  KeyRound,
  Landmark,
  Loader2,
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
  const { t } = useTranslation();
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
  /** Mobile: which detail cards are expanded. Desktop cards stay open. */
  const [mobileOpen, setMobileOpen] = useState<string[]>(["identity"]);

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
    setMobileOpen((current) =>
      current.includes("emergency") ? current : [...current, "emergency"],
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

  async function handlePasswordChange() {
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

  const handleProfileSave = async (e: React.FormEvent) => {
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
  };

  const identityFields = (
    <FieldGrid>
      <Field label="Full name" value={name} onChange={setName} editable={canEditField("name")} />
      <Field label="Employee code" value={profile.employeeCode ?? "—"} />
      <Field label="Email" value={email} onChange={setEmail} editable={canSaveDirectly} />
      <Field
        label="Personal phone"
        value={phone}
        onChange={setPhone}
        editable={canEditField("phone")}
      />
      <Field
        label="Company phone"
        value={canEditField("companyPhone") ? companyPhone : companyPhone || "—"}
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
          <Label className="text-xs text-muted-foreground">Blood group</Label>
          <Select
            value={bloodGroup || "none"}
            onValueChange={(next) => setBloodGroup(next === "none" ? "" : next)}
          >
            <SelectTrigger className="h-11 md:h-9">
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
        <Field label="Blood group" value={bloodGroup || profile.bloodGroup || "—"} />
      )}
    </FieldGrid>
  );

  const employmentFields = (
    <FieldGrid>
      <Field
        label="Employer"
        value={profile.companyEntity ? COMPANY_LABELS[profile.companyEntity] : "—"}
      />
      <Field label="Parent group" value={PARENT_COMPANY_NAME} />
      <Field label="Role" value={ROLE_LABELS[user.role]} />
      <Field label="Employment type" value={formatEmployment(profile.employmentType)} />
      <Field
        label="Organization level"
        value={formatOrganizationLevel(profile.organizationLevel)}
      />
      <Field label="Department" value={profile.department ?? "—"} />
      <Field label="Designation" value={profile.designation ?? "—"} />
      <Field label="Reporting manager" value={profile.managerName ?? "—"} />
      <Field
        label="Joining date"
        value={profile.joiningDate ? formatDisplayDate(profile.joiningDate) : "—"}
      />
    </FieldGrid>
  );

  const bankingFields = (
    <FieldGrid>
      <Field
        label="Account holder"
        value={
          canEditField("bankAccountHolderName")
            ? bankAccountHolderName
            : bankAccountHolderName || "—"
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
        label="IFSC"
        value={canEditField("bankIfscCode") ? bankIfscCode : bankIfscCode || "—"}
        onChange={setBankIfscCode}
        editable={canEditField("bankIfscCode")}
      />
    </FieldGrid>
  );

  const statutoryFields = (
    <FieldGrid>
      {canEditField("panNumber") ? (
        <Field label="PAN" value={panNumber} onChange={setPanNumber} editable />
      ) : (
        <SensitiveField label="PAN" value={panNumber} />
      )}
      {canEditField("aadhaarNumber") ? (
        <Field label="Aadhaar" value={aadhaarNumber} onChange={setAadhaarNumber} editable />
      ) : (
        <SensitiveField label="Aadhaar" value={aadhaarNumber} />
      )}
      {canEditField("uanNumber") ? (
        <Field label="UAN" value={uanNumber} onChange={setUanNumber} editable />
      ) : (
        <SensitiveField label="UAN" value={uanNumber} />
      )}
    </FieldGrid>
  );

  const passwordFields = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="current-pw" className="text-xs text-muted-foreground">
          Current password
        </Label>
        <PasswordInput
          id="current-pw"
          value={oldPw}
          onChange={(e) => setOldPw(e.target.value)}
          autoComplete="current-password"
          className="h-11 md:h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-pw" className="text-xs text-muted-foreground">
          New password
        </Label>
        <PasswordInput
          id="new-pw"
          value={newPw}
          onChange={(e) => setNewPw(e.target.value)}
          autoComplete="new-password"
          className="h-11 md:h-9"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm-pw" className="text-xs text-muted-foreground">
          Confirm password
        </Label>
        <PasswordInput
          id="confirm-pw"
          value={confirmPw}
          onChange={(e) => setConfirmPw(e.target.value)}
          autoComplete="new-password"
          className="h-11 md:h-9"
        />
        <PasswordMatchHint password={newPw} confirm={confirmPw} />
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground sm:col-span-2">
        {rules.map((r) => (
          <li
            key={r.label}
            className={r.ok ? "font-medium text-emerald-600 dark:text-emerald-400" : ""}
          >
            {r.ok ? "✓" : "○"} {r.label}
          </li>
        ))}
      </ul>
      <div className="sm:col-span-2">
        <Button
          type="button"
          disabled={pwSaving || !rules.every((r) => r.ok)}
          className="h-11 w-full md:h-9 md:w-auto"
          onClick={() => void handlePasswordChange()}
        >
          {pwSaving && <Loader2 className="mr-2 size-4 animate-spin" />}
          Update password
        </Button>
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "w-full space-y-4 lg:space-y-5",
        canEditAnyProfileField
          ? "pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-[max(1.25rem,env(safe-area-inset-bottom))]"
          : "pb-[max(1.25rem,env(safe-area-inset-bottom))]",
      )}
    >
      <PageHeader
        title={t("profile.title")}
        description={
          canEditAnyProfileField || canEditEmergencyContact
            ? "Update the fields available to you. Employment details stay admin-controlled."
            : "Your workforce details. Change your password in the security card."
        }
        actions={
          <Button
            asChild
            variant="outline"
            className="h-11 w-full min-[420px]:h-9 min-[420px]:w-auto"
          >
            <Link to="/id-card">
              <IdCard className="mr-2 size-4" />
              ID card
            </Link>
          </Button>
        }
      />

      {/* Identity card — full width */}
      <Card className="border-border/70 shadow-sm">
        <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
          <Avatar className="mx-auto size-16 shrink-0 sm:mx-0 sm:size-[4.25rem]">
            <AvatarFallback className="bg-primary text-lg font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-center sm:text-left">
            <p className="truncate text-lg font-semibold tracking-tight sm:text-xl">{user.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {ROLE_LABELS[user.role]}
              {profile.designation ? ` · ${profile.designation}` : ""}
            </p>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {[
                profile.employeeCode,
                profile.department,
                profile.companyEntity ? COMPANY_LABELS[profile.companyEntity] : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </CardContent>
      </Card>

      <form
        id="profile-save-form"
        onSubmit={(e) => void handleProfileSave(e)}
        className="space-y-4 pb-[calc(5.5rem+var(--atd-sab))] lg:space-y-5 md:pb-0"
      >
        {/* Mobile: stacked expandable cards. Desktop: open cards in a wide grid. */}
        <div className="md:hidden">
          <Accordion
            type="multiple"
            value={mobileOpen}
            onValueChange={setMobileOpen}
            className="space-y-3"
          >
            <MobileSectionCard value="identity" icon={UserRound} title={t("profile.identity")}>
              {identityFields}
            </MobileSectionCard>
            <MobileSectionCard value="employment" icon={BriefcaseBusiness} title={t("profile.employment")}>
              {employmentFields}
            </MobileSectionCard>
            <MobileSectionCard value="banking" icon={Landmark} title={t("profile.banking")}>
              {bankingFields}
            </MobileSectionCard>
            <MobileSectionCard value="statutory" icon={CreditCard} title={t("profile.statutory")}>
              {statutoryFields}
            </MobileSectionCard>
            {user.employeeId && (
              <MobileSectionCard value="emergency" icon={ShieldAlert} title={t("profile.emergency")}>
                <p className="mb-3 text-xs text-muted-foreground">
                  {canEditEmergencyContact
                    ? "Used for workplace emergencies and the ID card."
                    : "View-only. Ask HR or Developer Admin to update."}
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
              </MobileSectionCard>
            )}
            <MobileSectionCard value="password" icon={KeyRound} title="Password">
              {passwordFields}
            </MobileSectionCard>
          </Accordion>
        </div>

        <div className="hidden gap-4 md:grid md:grid-cols-2 xl:gap-5">
          <DesktopSectionCard icon={UserRound} title={t("profile.identity")}>
            {identityFields}
          </DesktopSectionCard>
          <DesktopSectionCard icon={BriefcaseBusiness} title={t("profile.employment")}>
            {employmentFields}
          </DesktopSectionCard>
          <DesktopSectionCard icon={Landmark} title={t("profile.banking")}>
            {bankingFields}
          </DesktopSectionCard>
          <DesktopSectionCard icon={CreditCard} title={t("profile.statutory")}>
            {statutoryFields}
          </DesktopSectionCard>
          {user.employeeId && (
            <DesktopSectionCard
              icon={ShieldAlert}
              title={t("profile.emergency")}
              className="md:col-span-2"
            >
              <p className="mb-3 text-sm text-muted-foreground">
                {canEditEmergencyContact
                  ? "Used for workplace emergencies and the ID card."
                  : "View-only. Ask HR or Developer Admin to update."}
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
            </DesktopSectionCard>
          )}
          <DesktopSectionCard icon={KeyRound} title="Password">
            {passwordFields}
          </DesktopSectionCard>
          <Card className="border-border/70 shadow-sm">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-base">Privacy and access</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pb-4 text-sm text-muted-foreground">
              <p>
                Accounts are employer-provisioned. When employment ends, HR or Developer Admin
                offboards your login.
              </p>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <Link to="/privacy" className="font-medium text-primary hover:underline">
                  Privacy policy
                </Link>
                <Link to="/terms" className="font-medium text-primary hover:underline">
                  Terms of use
                </Link>
                <Link to="/account-deletion" className="font-medium text-primary hover:underline">
                  Request deletion
                </Link>
              </div>
              <Button asChild variant="outline" size="sm">
                <a href="mailto:hrms@anytimediesel.com?subject=Anytime%20Workforce%20account%20deletion%20request">
                  Email HR
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Mobile privacy card */}
        <Card className="border-border/70 shadow-sm md:hidden">
          <CardHeader className="pb-2 pt-4">
            <CardTitle className="text-base">Privacy and access</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pb-4 text-sm text-muted-foreground">
            <p>
              Accounts are employer-provisioned. When employment ends, HR or Developer Admin
              offboards your login.
            </p>
            <div className="flex flex-col gap-2">
              <Link
                to="/privacy"
                className="flex h-11 items-center rounded-lg border border-border/70 px-3 font-medium text-foreground"
              >
                Privacy policy
              </Link>
              <Link
                to="/terms"
                className="flex h-11 items-center rounded-lg border border-border/70 px-3 font-medium text-foreground"
              >
                Terms of use
              </Link>
              <Link
                to="/account-deletion"
                className="flex h-11 items-center rounded-lg border border-border/70 px-3 font-medium text-foreground"
              >
                Request deletion
              </Link>
            </div>
            <Button asChild variant="outline" className="h-11 w-full">
              <a href="mailto:hrms@anytimediesel.com?subject=Anytime%20Workforce%20account%20deletion%20request">
                Email HR
              </a>
            </Button>
          </CardContent>
        </Card>

        {canEditAnyProfileField && (
          <>
            {/* Desktop: stays in document flow at the end of the form. */}
            <div className="hidden border border-border/70 bg-card p-4 shadow-sm md:flex md:justify-end md:rounded-xl">
              <Button type="submit" disabled={saving} className="h-9 min-w-32">
                {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                {t("profile.save")}
              </Button>
            </div>
            {/*
              Mobile: portal to body so viewport `fixed` is never trapped by
              page-enter transforms / overflow ancestors (which pinned the bar
              mid-screen while scrolling).
            */}
            {typeof document !== "undefined" &&
              createPortal(
                <div
                  className={cn(
                    "fixed inset-x-0 bottom-0 z-[65] border-t border-border/70 bg-card/95 p-3 shadow-[0_-8px_24px_-18px_rgb(15_23_42/0.35)] backdrop-blur-sm md:hidden",
                    "pb-[max(0.75rem,var(--atd-sab))] pl-[max(0.75rem,var(--atd-sal))] pr-[max(0.75rem,var(--atd-sar))]",
                  )}
                >
                  <Button
                    type="submit"
                    form="profile-save-form"
                    disabled={saving}
                    className="h-11 w-full"
                  >
                    {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
                    {t("profile.save")}
                  </Button>
                </div>,
                document.body,
              )}
          </>
        )}
      </form>
    </div>
  );
}

function MobileSectionCard({
  value,
  icon: Icon,
  title,
  children,
}: {
  value: string;
  icon: typeof UserRound;
  title: string;
  children: ReactNode;
}) {
  return (
    <AccordionItem
      value={value}
      className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm data-[state=open]:shadow-md"
    >
      <AccordionTrigger
        className={cn(
          "px-4 py-3.5 hover:no-underline",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        )}
      >
        <span className="flex items-center gap-3 text-left">
          <span className="grid size-10 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
          <span className="text-sm font-semibold">{title}</span>
        </span>
      </AccordionTrigger>
      <AccordionContent className="border-t border-border/60 px-4 pb-4 pt-3">
        {children}
      </AccordionContent>
    </AccordionItem>
  );
}

function DesktopSectionCard({
  icon: Icon,
  title,
  children,
  className,
}: {
  icon: typeof UserRound;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/70 shadow-sm", className)}>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0 border-b border-border/60 px-5 py-4">
        <span className="grid size-9 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function formatGender(gender?: User["gender"]) {
  if (gender === "FEMALE") return "Female";
  if (gender === "MALE") return "Male";
  if (gender === "PREFER_NOT_TO_SAY") return "Prefer not to say";
  return "—";
}

function formatEmployment(type?: User["employmentType"]) {
  if (type === "FULL_TIME") return "Full-time";
  if (type === "PART_TIME") return "Part-time";
  if (type === "INTERN") return "Intern";
  return "—";
}

function formatOrganizationLevel(level?: User["organizationLevel"]) {
  if (!level) return "—";
  return level.charAt(0) + level.slice(1).toLowerCase();
}

function formatLabel(value?: string) {
  if (!value) return "—";
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function SensitiveField({ label, value }: { label: string; value: string }) {
  const [revealed, setRevealed] = useState(false);
  const displayValue = !value
    ? "—"
    : revealed
      ? value
      : `${"•".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value && (
          <button
            type="button"
            className="grid size-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:size-8"
            onClick={() => setRevealed((current) => !current)}
            aria-label={`${revealed ? "Hide" : "Show"} ${label}`}
          >
            {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </div>
      <p className="mt-1 break-all text-sm font-medium">{displayValue}</p>
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
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {isDate ? (
        <DateField value={value} onChange={(next) => onChange?.(next)} aria-label={label} />
      ) : (
        <Input
          type={type}
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          className="h-11 md:h-9"
        />
      )}
    </div>
  ) : (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 break-words text-sm font-medium">
        {isDate ? formatDisplayDate(value) : value}
      </p>
    </div>
  );
}
