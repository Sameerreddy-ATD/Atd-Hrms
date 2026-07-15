import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth";
import { ROLE_LABELS, type Branch, type User } from "@/mock/types";
import { branchesApi, employeesApi, usersApi } from "@/services/api";
import { Key, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/common/PasswordInput";
import { PasswordMatchHint } from "@/components/common/PasswordMatchHint";

export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { user, updateCurrentUser, changePassword } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [dob, setDob] = useState(user?.dateOfBirth ?? "");
  const [employee, setEmployee] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);

  // Self change password states
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwSaving, setPwSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      branchesApi.list(),
      user?.employeeId ? employeesApi.get(user.employeeId) : Promise.resolve(null),
    ])
      .then(([branchRows, employeeDetails]) => {
        setBranches(branchRows);
        setEmployee(employeeDetails);
      })
      .catch(() => {
        setBranches([]);
        setEmployee(null);
      });
  }, [user?.employeeId]);

  useEffect(() => {
    if (!user) return;
    setName(user.name);
    setEmail(user.email);
    setPhone(user.phone ?? "");
    setDob(user.dateOfBirth ?? "");
  }, [user]);

  if (!user) return null;
  const canSaveDirectly = user.role === "developer_admin";
  const profile = employee ?? user;
  const branchName =
    branches.find((b) => b.id === profile.homeBranchId)?.name ?? profile.homeBranchName ?? "-";
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
            ? "Update your account details directly."
            : "Your account and employment information."
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
              <Avatar className="h-20 w-20">
                <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-lg font-semibold">{user.name}</p>
                <p className="text-sm text-muted-foreground">{ROLE_LABELS[user.role]}</p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  {user.employeeId ?? "-"}
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
                              r.ok ? "text-emerald-600 font-medium" : "text-muted-foreground"
                            }
                          >
                            {r.ok ? "✓" : "○"} {r.label}
                          </li>
                        ))}
                      </ul>
                      <Button
                        type="submit"
                        disabled={pwSaving || !rules.every((r) => r.ok)}
                        className="w-full text-xs py-1.5"
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

        <Card className="lg:col-span-2 h-fit">
          <CardContent className="p-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!canSaveDirectly) return;
                setSaving(true);
                try {
                  const updatedAccount = await usersApi.update(user.id, {
                    name,
                    email,
                    phone: phone || undefined,
                  });
                  let updatedEmployee = employee;
                  if (user.employeeId) {
                    updatedEmployee = await employeesApi.update(user.employeeId, {
                      name,
                      email,
                      phone: phone || undefined,
                      dateOfBirth: dob || undefined,
                    });
                    setEmployee(updatedEmployee);
                  }
                  updateCurrentUser(
                    updatedEmployee ? { ...updatedAccount, ...updatedEmployee } : updatedAccount,
                  );
                  toast.success("Profile updated");
                } catch (err) {
                  toast.error((err as Error).message);
                } finally {
                  setSaving(false);
                }
              }}
              className="grid gap-4 sm:grid-cols-2"
            >
              <Field label="Full name" value={name} onChange={setName} editable={canSaveDirectly} />
              <Field label="Email" value={email} onChange={setEmail} editable={canSaveDirectly} />
              <Field label="Phone" value={phone} onChange={setPhone} editable={canSaveDirectly} />
              <Field
                label="Date of Birth"
                value={dob}
                onChange={setDob}
                editable={canSaveDirectly}
                type="date"
              />
              <Field label="Department" value={profile.department ?? "-"} />
              <Field label="Employee code" value={profile.employeeCode ?? "-"} />
              <Field label="Role" value={ROLE_LABELS[user.role]} />
              <Field label="Gender" value={formatGender(profile.gender)} />
              <Field label="Employment type" value={formatEmployment(profile.employmentType)} />
              <Field label="Designation" value={profile.designation ?? "-"} />
              <Field label="Reporting manager" value={profile.managerName ?? "Not assigned"} />
              <Field label="Joining date" value={profile.joiningDate ?? "-"} />
              <Field label="Home Branch" value={branchName} />
              <Field label="Attendance access" value="Biometric scanner and mobile location" />
              <Field
                label="Work assignment"
                value={profile.isFieldEmployee ? "Field and branch work" : "Branch-based work"}
              />
              <Field
                label="Account status"
                value={
                  user.suspensionStartsAt
                    ? `Suspension scheduled from ${new Date(user.suspensionStartsAt).toLocaleDateString("en-IN")}`
                    : user.active
                      ? "Active"
                      : "Inactive"
                }
              />
              {canSaveDirectly && (
                <div className="flex justify-end border-t border-border pt-4 sm:col-span-2">
                  <Button type="submit" disabled={saving}>
                    Save profile
                  </Button>
                </div>
              )}
            </form>
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
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(event) => onChange?.(event.target.value)}
        readOnly={!editable}
        className={editable ? "" : "bg-muted/50"}
      />
    </div>
  );
}
