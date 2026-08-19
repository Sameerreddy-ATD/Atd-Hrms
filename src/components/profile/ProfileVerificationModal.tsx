import { useCallback, useMemo, useState } from "react";
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
}

const SECTIONS = ["identity", "employment", "banking", "statutory"] as const;
type Section = (typeof SECTIONS)[number];

const SECTION_LABEL_KEYS: Record<Section, string> = {
  identity: "pages.profileVerification.sectionIdentity",
  employment: "pages.profileVerification.sectionEmployment",
  banking: "pages.profileVerification.sectionBanking",
  statutory: "pages.profileVerification.sectionStatutory",
};

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

  return {
    identity: [
      { key: "name", labelKey: "fieldName", value: v("name") },
      { key: "email", labelKey: "fieldEmail", value: v("email") },
      { key: "phone", labelKey: "fieldPhone", value: v("phone") },
      { key: "companyPhone", labelKey: "fieldCompanyPhone", value: v("companyPhone") },
      { key: "dateOfBirth", labelKey: "fieldDateOfBirth", value: v("dateOfBirth") },
      { key: "gender", labelKey: "fieldGender", value: v("gender") },
      { key: "bloodGroup", labelKey: "fieldBloodGroup", value: v("bloodGroup") },
      { key: "fatherName", labelKey: "fieldFatherName", value: v("fatherName") },
      { key: "presentAddress", labelKey: "fieldPresentAddress", value: v("presentAddress") },
      { key: "presentCity", labelKey: "fieldPresentCity", value: v("presentCity") },
      { key: "presentState", labelKey: "fieldPresentState", value: v("presentState") },
      { key: "presentPincode", labelKey: "fieldPresentPincode", value: v("presentPincode") },
      { key: "permanentAddress", labelKey: "fieldPermanentAddress", value: v("permanentAddress") },
      { key: "permanentCity", labelKey: "fieldPermanentCity", value: v("permanentCity") },
      { key: "permanentState", labelKey: "fieldPermanentState", value: v("permanentState") },
      { key: "permanentPincode", labelKey: "fieldPermanentPincode", value: v("permanentPincode") },
    ],
    employment: [
      { key: "employeeCode", labelKey: "fieldEmployeeCode", value: v("employeeCode"), readonly: true },
      { key: "designation", labelKey: "fieldDesignation", value: v("designation"), readonly: true },
      { key: "department", labelKey: "fieldDepartment", value: v("department"), readonly: true },
      { key: "joiningDate", labelKey: "fieldJoiningDate", value: v("joiningDate"), readonly: true },
      { key: "employmentType", labelKey: "fieldEmploymentType", value: v("employmentType"), readonly: true },
      { key: "companyEntity", labelKey: "fieldCompanyEntity", value: v("companyEntity"), readonly: true },
    ],
    banking: [
      { key: "bankAccountHolderName", labelKey: "fieldBankAccountHolderName", value: v("bankAccountHolderName") },
      { key: "bankAccountType", labelKey: "fieldBankAccountType", value: v("bankAccountType") },
      { key: "bankIfscCode", labelKey: "fieldBankIfscCode", value: v("bankIfscCode") },
      { key: "bankAccountNumber", labelKey: "fieldBankAccountNumber", value: masked("bankAccountNumber", "bankAccountNumberLast4"), masked: true },
    ],
    statutory: [
      { key: "panNumber", labelKey: "fieldPanNumber", value: masked("panNumber", "panNumberLast4"), masked: true },
      { key: "aadhaarNumber", labelKey: "fieldAadhaarNumber", value: masked("aadhaarNumber", "aadhaarNumberLast4"), masked: true },
      { key: "uanNumber", labelKey: "fieldUanNumber", value: masked("uanNumber", "uanNumberLast4"), masked: true },
    ],
  };
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

  const allFields = useMemo(
    () => (user ? buildFields(user as unknown as Record<string, unknown>) : null),
    [user],
  );

  const currentSection = SECTIONS[step];
  const sectionFields = allFields?.[currentSection] ?? [];

  const markField = useCallback((key: string, status: FieldStatus) => {
    setFieldStates((prev) => ({
      ...prev,
      [key]: { status, correction: prev[key]?.correction ?? "" },
    }));
  }, []);

  const setCorrection = useCallback((key: string, value: string) => {
    setFieldStates((prev) => ({
      ...prev,
      [key]: { ...prev[key], status: prev[key]?.status ?? "WRONG", correction: value },
    }));
  }, []);

  const sectionComplete = useCallback(
    (section: Section) => {
      const fields = allFields?.[section] ?? [];
      return fields.every((f) => {
        const state = fieldStates[f.key];
        if (!state?.status) return false;
        if (state.status === "WRONG" && !f.value && !state.correction.trim()) return false;
        if (state.status === "WRONG" && !state.correction.trim()) return false;
        return true;
      });
    },
    [allFields, fieldStates],
  );

  const allComplete = SECTIONS.every((s) => sectionComplete(s));

  const wrongCount = useMemo(
    () => Object.values(fieldStates).filter((s) => s.status === "WRONG").length,
    [fieldStates],
  );

  async function handleSubmit() {
    if (!allComplete || !consent || !allFields) return;
    setSubmitting(true);
    try {
      const fields = SECTIONS.flatMap((section) =>
        allFields[section].map((f) => {
          const state = fieldStates[f.key];
          return {
            field: f.key,
            section,
            status: state?.status ?? ("CORRECT" as const),
            currentValue: f.value ?? undefined,
            suggestedValue: state?.status === "WRONG" ? state.correction : undefined,
          };
        }),
      );
      await profileApi.submitVerification(fields);
      toast.success(t("pages.profileVerification.toastSuccess"));
      onComplete();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!user || !allFields) return null;

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
          {/* Progress */}
          <div className="mt-3 flex items-center gap-1">
            {SECTIONS.map((s, i) => (
              <div key={s} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className={cn(
                    "h-1.5 w-full rounded-full transition-colors",
                    i < step
                      ? "bg-primary"
                      : i === step
                        ? "bg-primary/60"
                        : "bg-muted",
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

        {/* Scrollable field list */}
        <div className="flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {sectionFields.map((field) => {
              const state = fieldStates[field.key];
              const isEmpty = !field.value;
              const isCorrect = state?.status === "CORRECT";
              const isWrong = state?.status === "WRONG";

              return (
                <div
                  key={field.key}
                  className={cn(
                    "rounded-xl border p-3 transition-colors",
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
                    </p>
                    {isCorrect && <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                    {isWrong && <X className="h-3.5 w-3.5 shrink-0 text-red-600" />}
                  </div>

                  <p className={cn("mb-2 text-sm font-medium break-words", isEmpty && "italic text-muted-foreground")}>
                    {isEmpty ? t("pages.profileVerification.notProvided") : field.value}
                  </p>

                  {/* Correct / Wrong buttons */}
                  <div className="flex gap-1.5">
                    {(!isEmpty || field.readonly) && (
                      <Button
                        type="button"
                        size="sm"
                        variant={isCorrect ? "default" : "outline"}
                        className={cn("h-7 gap-1 text-xs", isCorrect && "bg-emerald-600 hover:bg-emerald-700")}
                        onClick={() => markField(field.key, "CORRECT")}
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
                      onClick={() => markField(field.key, "WRONG")}
                    >
                      <X className="h-3 w-3" />
                      {isEmpty
                        ? t("pages.profileVerification.provideValue")
                        : t("pages.profileVerification.wrong")}
                    </Button>
                  </div>

                  {/* Correction input */}
                  {isWrong && (
                    <div className="mt-2">
                      <Input
                        placeholder={t("pages.profileVerification.enterCorrectValue")}
                        value={state.correction}
                        onChange={(e) => setCorrection(field.key, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Consent checkbox on final step */}
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

        {/* Footer */}
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
