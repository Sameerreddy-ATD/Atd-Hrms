import { useEffect } from "react";
import { watchSystemTheme } from "@/lib/system-theme";

export function SystemThemeSync() {
  useEffect(() => watchSystemTheme(), []);
  return null;
}
