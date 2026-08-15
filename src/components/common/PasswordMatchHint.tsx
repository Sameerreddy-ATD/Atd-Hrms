import { useTranslation } from "react-i18next";

export function PasswordMatchHint({ password, confirm }: { password: string; confirm: string }) {
  const { t } = useTranslation();
  if (!confirm) return null;
  const matches = password === confirm;
  return (
    <p
      className={`text-xs font-medium ${matches ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
    >
      {matches ? t("pages.authExtra.passwordsMatch") : t("pages.authExtra.passwordsMismatch")}
    </p>
  );
}
