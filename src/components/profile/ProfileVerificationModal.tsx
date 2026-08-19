import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { profileApi } from "@/services/api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Check, X, ChevronRight, ChevronLeft, ShieldCheck } from "lucide-react";

type FieldStatus = "CORRECT" | "WRONG" | null;

interface FieldState {
  status: FieldStatus;
  correction: string;
}

interface FieldDef {
  key: string;
  labelKey: string;
  value: string | undefined | null;
  masked?: boolean;
  readonly?: boolean;
  required?: boolean;
  optional?: boolean;
  group?: "present" | "permanent";
  selectOptions?: Array<{ value: string; label: string }>;
}

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"] as const;

const MARITAL_OPTIONS = [
  { value: "SINGLE", label: "Single" },
  { value: "MARRIED", label: "Married" },
] as const;

const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
] as const;

const BANK_ACCOUNT_OPTIONS = [
  { value: "SAVINGS", label: "Savings" },
  { value: "CURRENT", label: "Current" },
  { value: "SALARY", label: "Salary" },
  { value: "NRE", label: "NRE" },
  { value: "NRO", label: "NRO" },
  { value: "OTHER", label: "Other" },
] as const;

function formatBankAccountType(value: string | undefined) {
  if (!value) return value;
  const found = BANK_ACCOUNT_OPTIONS.find((o) => o.value === value);
  return found?.label ?? value.replace(/_/g, " ");
}

const SECTIONS = ["identity", "employment", "banking", "statutory"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABEL_KEYS: Record<Section, string> = {
  identity: "pages.profileVerification.sectionIdentity",
  employment: "pages.profileVerification.sectionEmployment",
  banking: "pages.profileVerification.sectionBanking",
  statutory: "pages.profileVerification.sectionStatutory",
};

const PRESENT_KEYS = [
  "presentDoorNo",
  "presentFlatName",
  "presentStreetName",
  "presentCity",
  "presentState",
  "presentPincode",
] as const;

const PERMANENT_KEYS = [
  "permanentDoorNo",
  "permanentFlatName",
  "permanentStreetName",
  "permanentCity",
  "permanentState",
  "permanentPincode",
] as const;

function formatMarital(value: string | undefined) {
  if (value === "MARRIED") return "Married";
  if (value === "SINGLE") return "Single";
  return value;
}

function formatGender(value: string | undefined) {
  if (value === "FEMALE") return "Female";
  if (value === "MALE") return "Male";
  if (value === "PREFER_NOT_TO_SAY") return "Prefer not to say";
  return value;
}

function showHusbandName(user: Record<string, unknown>) {
  return user.gender === "FEMALE" && user.maritalStatus === "MARRIED";
}

function parentFieldKey(user: Record<string, unknown>) {
  return showHusbandName(user) ? "husbandName" : "fatherName";
}

function buildFields(user: Record<string, unknown>): Record<Section, FieldDef[]> {
  const v = (key: string) => {
    const val = user[key];
    if (val === null || val === undefined || val === "") return undefined;
    return String(val);
  };
  const masked = (key: string, last4Key: string) => {
    const l4 = v(last4Key);
    return l4 ? `••••${l4}` : v(key);
  };

  const companyEmail = v("companyEmail") ?? v("email");

  return {
    identity: [
      { key: "name", labelKey: "fieldFullName", value: v("name"), required: true },
      { key: "companyEmail", labelKey: "fieldCompanyEmail", value: companyEmail, readonly: true },
      { key: "personalEmail", labelKey: "fieldPersonalEmail", value: v("personalEmail"), required: true },
      { key: "phone", labelKey: "fieldPersonalNumber", value: v("phone"), required: true },
      { key: "companyPhone", labelKey: "fieldCompanyNumber", value: v("companyPhone"), optional: true },
      { key: "dateOfBirth", labelKey: "fieldDateOfBirth", value: v("dateOfBirth"), required: true },
      { key: "gender", labelKey: "fieldGender", value: formatGender(v("gender")), required: true, selectOptions: [...GENDER_OPTIONS] },
      {
        key: "bloodGroup",
        labelKey: "fieldBloodGroup",
        value: v("bloodGroup"),
        required: true,
        selectOptions: BLOOD_GROUPS.map((g) => ({ value: g, label: g })),
      },
      {
        key: "maritalStatus",
        labelKey: "fieldMaritalStatus",
        value: formatMarital(v("maritalStatus")),
        required: true,
        selectOptions: [...MARITAL_OPTIONS],
      },
      {
        key: parentFieldKey(user),
        labelKey: showHusbandName(user) ? "fieldHusbandName" : "fieldFatherName",
        value: v(parentFieldKey(user)),
        required: true,
      },
      { key: "presentDoorNo", labelKey: "fieldPresentDoorNo", value: v("presentDoorNo"), group: "present", required: true },
      { key: "presentFlatName", labelKey: "fieldPresentFlatName", value: v("presentFlatName"), group: "present", required: true },
      {
        key: "presentStreetName",
        labelKey: "fieldPresentStreetName",
        value: v("presentStreetName") ?? v("presentAddress"),
        group: "present",
        required: true,
      },
      { key: "presentCity", labelKey: "fieldPresentCity", value: v("presentCity"), group: "present", required: true },
      { key: "presentState", labelKey: "fieldPresentState", value: v("presentState"), group: "present", required: true },
      { key: "presentPincode", labelKey: "fieldPresentPincode", value: v("presentPincode"), group: "present", required: true },
      {
        key: "permanentDoorNo",
        labelKey: "fieldPermanentDoorNo",
        value: v("permanentDoorNo"),
        group: "permanent",
        required: true,
      },
      {
        key: "permanentFlatName",
        labelKey: "fieldPermanentFlatName",
        value: v("permanentFlatName"),
        group: "permanent",
        required: true,
      },
      {
        key: "permanentStreetName",
        labelKey: "fieldPermanentStreetName",
        value: v("permanentStreetName") ?? v("permanentAddress"),
        group: "permanent",
        required: true,
      },
      {
        key: "permanentCity",
        labelKey: "fieldPermanentCity",
        value: v("permanentCity"),
        group: "permanent",
        required: true,
      },
      {
        key: "permanentState",
        labelKey: "fieldPermanentState",
        value: v("permanentState"),
        group: "permanent",
        required: true,
      },
      {
        key: "permanentPincode",
        labelKey: "fieldPermanentPincode",
        value: v("permanentPincode"),
        group: "permanent",
        required: true,
      },
    ],
    employment: [
      { key: "employeeCode", labelKey: "fieldEmployeeCode", value: v("employeeCode"), readonly: true },
      { key: "designation", labelKey: "fieldDesignation", value: v("designation"), readonly: true },
      {
        key: "department",
        labelKey: "fieldDepartment",
        value: v("departmentName") ?? v("department"),
        readonly: true,
      },
      { key: "joiningDate", labelKey: "fieldJoiningDate", value: v("joiningDate"), readonly: true },
      { key: "employmentType", labelKey: "fieldEmploymentType", value: v("employmentType"), readonly: true },
      { key: "companyEntity", labelKey: "fieldCompanyEntity", value: v("companyEntity"), readonly: true },
    ],
    banking: [
      { key: "bankAccountHolderName", labelKey: "fieldBankAccountHolderName", value: v("bankAccountHolderName") },
      {
        key: "bankAccountType",
        labelKey: "fieldBankAccountType",
        value: formatBankAccountType(v("bankAccountType")),
        selectOptions: [...BANK_ACCOUNT_OPTIONS],
      },
      { key: "bankIfscCode", labelKey: "fieldBankIfscCode", value: v("bankIfscCode") },
      {
        key: "bankAccountNumber",
        labelKey: "fieldBankAccountNumber",
        value: masked("bankAccountNumber", "bankAccountNumberLast4"),
        masked: true,
      },
    ],
    statutory: [
      { key: "panNumber", labelKey: "fieldPanNumber", value: masked("panNumber", "panNumberLast4"), masked: true },
      {
        key: "aadhaarNumber",
        labelKey: "fieldAadhaarNumber",
        value: masked("aadhaarNumber", "aadhaarNumberLast4"),
        masked: true,
      },
      { key: "uanNumber", labelKey: "fieldUanNumber", value: masked("uanNumber", "uanNumberLast4"), masked: true },
    ],
  };
}

function presentValueForKey(
  key: (typeof PERMANENT_KEYS)[number],
  user: Record<string, unknown>,
  fieldStates: Record<string, FieldState>,
) {
  const presentKey = key.replace("permanent", "present") as (typeof PRESENT_KEYS)[number];
  const state = fieldStates[presentKey];
  if (state?.status === "WRONG" && state.correction.trim()) return state.correction.trim();
  const raw = user[presentKey];
  if (raw === null || raw === undefined || raw === "") {
    if (presentKey === "presentStreetName") {
      const legacy = user.presentAddress;
      return legacy ? String(legacy) : undefined;
    }
    return undefined;
  }
  return String(raw);
}

export function ProfileVerificationModal({
  open,
  onClose,
  onComplete,
}: {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [fieldStates, setFieldStates] = useState<Record<string, FieldState>>({});
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [permanentSameAsPresent, setPermanentSameAsPresent] = useState(false);
  const [correctionEditorOpen, setCorrectionEditorOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) {
      setStep(0);
      setFieldStates({});
      setConsent(false);
      setPermanentSameAsPresent(false);
      setCorrectionEditorOpen({});
      return;
    }
    if (user?.permanentSameAsPresent) {
      setPermanentSameAsPresent(true);
    }
  }, [open, user?.permanentSameAsPresent]);

  const allFields = useMemo(
    () => (user ? buildFields(user as unknown as Record<string, unknown>) : null),
    [user],
  );

  const currentSection = SECTIONS[step];
  const sectionFields = useMemo(() => {
    if (!allFields || !user) return [];
    const fields = allFields[currentSection];
    if (currentSection !== "identity") return fields;
    const parentKey = parentFieldKey(user as unknown as Record<string, unknown>);
    return fields.filter((field) => {
      if (field.key === "fatherName" || field.key === "husbandName") {
        return field.key === parentKey;
      }
      if (field.group === "permanent" && permanentSameAsPresent) return false;
      return true;
    });
  }, [allFields, currentSection, permanentSameAsPresent, user]);

  const markFieldCorrect = useCallback((key: string) => {
    setFieldStates((prev) => ({
      ...prev,
      [key]: { status: "CORRECT", correction: "" },
    }));
    setCorrectionEditorOpen((prev) => ({ ...prev, [key]: false }));
  }, []);

  const openWrongEditor = useCallback((key: string) => {
    setFieldStates((prev) => ({
      ...prev,
      [key]: { status: "WRONG", correction: prev[key]?.correction ?? "" },
    }));
    setCorrectionEditorOpen((prev) => ({ ...prev, [key]: true }));
  }, []);

  const handleWrongClick = useCallback(
    (key: string) => {
      const state = fieldStates[key];
      if (state?.status === "WRONG" && correctionEditorOpen[key]) {
        setCorrectionEditorOpen((prev) => ({ ...prev, [key]: false }));
        return;
      }
      if (state?.status === "WRONG" && !correctionEditorOpen[key]) {
        setCorrectionEditorOpen((prev) => ({ ...prev, [key]: true }));
        return;
      }
      openWrongEditor(key);
    },
    [correctionEditorOpen, fieldStates, openWrongEditor],
  );

  const setCorrection = useCallback((key: string, value: string, closeEditor = false) => {
    setFieldStates((prev) => ({
      ...prev,
      [key]: { status: "WRONG", correction: value },
    }));
    if (closeEditor && value.trim()) {
      setCorrectionEditorOpen((prev) => ({ ...prev, [key]: false }));
    }
  }, []);

  const closeCorrectionEditor = useCallback((key: string) => {
    setCorrectionEditorOpen((prev) => ({ ...prev, [key]: false }));
  }, []);

  const fieldNeedsMarking = useCallback(
    (field: FieldDef) => {
      if (field.optional && !field.value) return false;
      if (field.group === "permanent" && permanentSameAsPresent) return false;
      return true;
    },
    [permanentSameAsPresent],
  );

  const sectionComplete = useCallback(
    (section: Section) => {
      if (!allFields) return false;
      if (section === "identity" && permanentSameAsPresent) {
        const presentDone = allFields.identity
          .filter((f) => f.group === "present")
          .every((f) => {
            const state = fieldStates[f.key];
            if (!state?.status) return false;
            if (state.status === "WRONG" && !state.correction.trim()) return false;
            return true;
          });
        if (!presentDone) return false;
      }
      const fields = allFields[section].filter((f) => {
        if (section !== "identity") return fieldNeedsMarking(f);
        if (f.key === "fatherName" || f.key === "husbandName") {
          return user ? f.key === parentFieldKey(user as unknown as Record<string, unknown>) : false;
        }
        return fieldNeedsMarking(f);
      });
      return fields.every((f) => {
        const state = fieldStates[f.key];
        if (!state?.status) return false;
        if (state.status === "WRONG" && !state.correction.trim()) return false;
        return true;
      });
    },
    [allFields, fieldNeedsMarking, fieldStates, permanentSameAsPresent, user],
  );

  const allComplete = SECTIONS.every((s) => sectionComplete(s));

  const wrongCount = useMemo(
    () => Object.values(fieldStates).filter((s) => s.status === "WRONG").length,
    [fieldStates],
  );

  async function handleSubmit() {
    if (!allComplete || !consent || !allFields || !user) return;
    setSubmitting(true);
    try {
      const userRecord = user as unknown as Record<string, unknown>;
      const payloadFields = SECTIONS.flatMap((section) => {
        const sectionList = allFields[section].filter((f) => {
          if (section !== "identity") return true;
          if (f.key === "fatherName" || f.key === "husbandName") {
            return f.key === parentFieldKey(userRecord);
          }
          if (f.group === "permanent" && permanentSameAsPresent) return false;
          return true;
        });
        const rows = sectionList.map((f) => {
          const state = fieldStates[f.key];
          return {
            field: f.key,
            section,
            status: state?.status ?? ("CORRECT" as const),
            currentValue: f.value ?? undefined,
            suggestedValue: state?.status === "WRONG" ? state.correction : undefined,
          };
        });
        if (section === "identity" && permanentSameAsPresent) {
          rows.push({
            field: "permanentSameAsPresent",
            section: "identity" as const,
            status: "CORRECT" as const,
            currentValue: user.permanentSameAsPresent ? "true" : "false",
            suggestedValue: undefined,
          });
          for (const key of PERMANENT_KEYS) {
            rows.push({
              field: key,
              section: "identity" as const,
              status: "CORRECT" as const,
              currentValue: presentValueForKey(key, userRecord, fieldStates),
              suggestedValue: undefined,
            });
          }
        }
        return rows;
      });

      await profileApi.submitVerification(payloadFields);
      toast.success(t("pages.profileVerification.toastSuccess"));
      onComplete();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function renderFieldCard(field: FieldDef) {
    const state = fieldStates[field.key];
    const isEmpty = !field.value;
    const isCorrect = state?.status === "CORRECT";
    const isWrong = state?.status === "WRONG";
    const editorOpen = Boolean(isWrong && correctionEditorOpen[field.key]);
    const canMarkCorrect = !isEmpty || field.readonly;
    const correctionLabel =
      field.selectOptions?.find((o) => o.value === state?.correction)?.label ?? state?.correction;

    return (
      <div
        key={field.key}
        className={cn(
          "rounded-xl border p-3 transition-colors sm:col-span-1",
          field.group === "present" || field.group === "permanent" ? "sm:col-span-2 lg:col-span-1" : "",
          isCorrect
            ? "border-emerald-300 bg-emerald-50/50 dark:border-emerald-800 dark:bg-emerald-950/20"
            : isWrong
              ? "border-red-300 bg-red-50/50 dark:border-red-800 dark:bg-red-950/20"
              : "border-border bg-card",
        )}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">
            {t(`pages.profileVerification.${field.labelKey}`)}
            {field.required ? " *" : field.optional ? ` (${t("pages.profileVerification.optional")})` : ""}
          </p>
          {isCorrect && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
          {isWrong && <X className="h-3.5 w-3.5 shrink-0 text-red-600" />}
        </div>

        <p className={cn("mb-2 text-sm font-medium break-words", isEmpty && "italic text-muted-foreground")}>
          {isEmpty ? t("pages.profileVerification.notProvided") : field.value}
        </p>

        {isWrong && !editorOpen && state.correction.trim() ? (
          <p className="mb-2 text-xs font-medium text-red-700 dark:text-red-400">
            {t("pages.profileVerification.correctionValue", { value: correctionLabel })}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-1.5">
          {canMarkCorrect && (
            <Button
              type="button"
              size="sm"
              variant={isCorrect ? "default" : "outline"}
              className={cn("h-7 gap-1 text-xs", isCorrect && "bg-emerald-600 hover:bg-emerald-700")}
              onClick={() => markFieldCorrect(field.key)}
            >
              <Check className="h-3 w-3" />
              {t("pages.profileVerification.correct")}
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant={isWrong ? "default" : "outline"}
            className={cn("h-7 gap-1 text-xs", isWrong && "bg-red-600 hover:bg-red-700")}
            onClick={() => handleWrongClick(field.key)}
          >
            <X className="h-3 w-3" />
            {isEmpty ? t("pages.profileVerification.provideValue") : t("pages.profileVerification.wrong")}
          </Button>
        </div>

        {editorOpen && (
          <div className="mt-2">
            {field.selectOptions ? (
              <Select
                value={state?.correction || undefined}
                onValueChange={(value) => setCorrection(field.key, value, true)}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder={t("pages.profileVerification.selectValue")} />
                </SelectTrigger>
                <SelectContent>
                  {field.selectOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                placeholder={t("pages.profileVerification.enterCorrectValue")}
                value={state?.correction ?? ""}
                onChange={(e) => setCorrection(field.key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && state?.correction?.trim()) {
                    e.preventDefault();
                    closeCorrectionEditor(field.key);
                  }
                }}
                className="h-8 text-sm"
              />
            )}
          </div>
        )}
      </div>
    );
  }

  if (!user || !allFields) return null;

  const identityFields = sectionFields;
  const presentFields = identityFields.filter((f) => f.group === "present");
  const beforeAddressFields = identityFields.filter((f) => !f.group);
  const showAddressLayout = currentSection === "identity";

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="flex max-h-[95dvh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-h-[90dvh]">
        <DialogHeader className="shrink-0 border-b px-4 py-3 sm:px-6 sm:py-4">
          <DialogTitle className="text-base font-semibold sm:text-lg">
            {t("pages.profileVerification.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground sm:text-sm">
            {t("pages.profileVerification.subtitle")}
          </DialogDescription>
          <div className="mt-3 flex items-center gap-1">
            {SECTIONS.map((s, i) => (
              <div key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    "h-1.5 w-full rounded-full transition-colors",
                    i < step ? "bg-primary" : i === step ? "bg-primary/60" : "bg-muted",
                  )}
                />
                <span
                  className={cn(
                    "truncate text-[10px] sm:text-xs",
                    i === step ? "font-medium text-foreground" : "text-muted-foreground",
                  )}
                >
                  {t(SECTION_LABEL_KEYS[s])}
                </span>
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {showAddressLayout ? (
              <>
                {beforeAddressFields.map(renderFieldCard)}
                <div className="sm:col-span-2">
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    {t("pages.profileVerification.presentAddressHeading")}
                  </p>
                </div>
                {presentFields.map(renderFieldCard)}
                <div className="sm:col-span-2 space-y-3">
                  <p className="text-sm font-semibold text-foreground">
                    {t("pages.profileVerification.permanentAddressHeading")}
                  </p>
                  <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <Checkbox
                      id="same-as-present"
                      checked={permanentSameAsPresent}
                      onCheckedChange={(checked) => setPermanentSameAsPresent(checked === true)}
                      className="mt-0.5"
                    />
                    <label htmlFor="same-as-present" className="text-sm leading-5 text-foreground">
                      {t("pages.profileVerification.sameAsPresent")}
                    </label>
                  </div>
                  {permanentSameAsPresent && (
                    <p className="text-xs text-muted-foreground">
                      {t("pages.profileVerification.sameAsPresentHelp")}
                    </p>
                  )}
                </div>
                {!permanentSameAsPresent &&
                  identityFields.filter((f) => f.group === "permanent").map(renderFieldCard)}
              </>
            ) : (
              sectionFields.map(renderFieldCard)
            )}
          </div>

          {step === SECTIONS.length - 1 && allComplete && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/[0.03] p-3">
              <Checkbox
                id="profile-consent"
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-0.5"
              />
              <label htmlFor="profile-consent" className="text-xs leading-5 text-foreground sm:text-sm">
                {t("pages.profileVerification.consent")}
              </label>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t px-4 py-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {t("pages.profileVerification.stepOf", { current: step + 1, total: SECTIONS.length })}
              {wrongCount > 0 && (
                <span className="ml-2 text-red-600 dark:text-red-400">
                  {wrongCount} {t("pages.profileVerification.wrong").toLowerCase()}
                </span>
              )}
            </p>
            <div className="flex gap-2">
              {step > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={() => setStep(step - 1)}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                  {t("pages.profileVerification.back")}
                </Button>
              )}
              {step < SECTIONS.length - 1 ? (
                <Button
                  type="button"
                  size="sm"
                  disabled={!sectionComplete(currentSection)}
                  onClick={() => setStep(step + 1)}
                >
                  {t("pages.profileVerification.next")}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={!allComplete || !consent || submitting}
                  onClick={handleSubmit}
                  className="gap-1"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {t("pages.profileVerification.submit")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
