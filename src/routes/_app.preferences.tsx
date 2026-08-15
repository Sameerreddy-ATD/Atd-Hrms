import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Languages, Moon, Sun } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTheme, setTheme, type Theme } from "@/lib/system-theme";
import {
  LOCALES,
  LOCALE_LABELS,
  setAppLocale,
  type AppLocale,
  getStoredLocale,
} from "@/i18n";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_app/preferences")({
  component: PreferencesPage,
});

function PreferencesPage() {
  const { t, i18n } = useTranslation();
  const [locale, setLocale] = useState<AppLocale>(getStoredLocale());
  const [theme, setActiveTheme] = useState<Theme>("light");

  useEffect(() => {
    setActiveTheme(getTheme());
    setLocale((i18n.language as AppLocale) === "te" ? "te" : "en");
  }, [i18n.language]);

  async function chooseLocale(next: AppLocale) {
    setLocale(next);
    await setAppLocale(next);
    toast.success(t("preferences.applied"));
  }

  function chooseTheme(next: Theme) {
    setTheme(next);
    setActiveTheme(next);
    toast.success(t("preferences.applied"));
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t("preferences.title")} description={t("preferences.subtitle")} />

      <Card>
        <CardHeader className="gap-1 border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-primary/10 p-2 text-primary">
              <Languages className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-base">{t("preferences.languageTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("preferences.languageHelp")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
          {LOCALES.map((code) => {
            const selected = locale === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => void chooseLocale(code)}
                className={cn(
                  "flex min-h-14 items-center justify-between rounded-xl border px-4 py-3 text-left transition-colors",
                  selected
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-muted",
                )}
              >
                <div>
                  <Label className="text-sm font-semibold">
                    {code === "en" ? t("preferences.english") : t("preferences.telugu")}
                  </Label>
                  <p className="text-xs text-muted-foreground">{LOCALE_LABELS[code]}</p>
                </div>
                <span
                  className={cn(
                    "grid h-5 w-5 place-items-center rounded-full border",
                    selected && "border-primary bg-primary text-primary-foreground",
                  )}
                >
                  {selected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1 border-b border-border/80 px-4 py-3.5 sm:px-5">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-primary/10 p-2 text-primary">
              {theme === "dark" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </span>
            <div>
              <CardTitle className="text-base">{t("preferences.themeTitle")}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{t("preferences.themeHelp")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 px-4 py-4 sm:grid-cols-2 sm:px-5">
          {(["light", "dark"] as Theme[]).map((mode) => {
            const selected = theme === mode;
            return (
              <Button
                key={mode}
                type="button"
                variant={selected ? "default" : "outline"}
                className="h-12 justify-start gap-3"
                onClick={() => chooseTheme(mode)}
              >
                {mode === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                {mode === "dark" ? t("preferences.dark") : t("preferences.light")}
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
