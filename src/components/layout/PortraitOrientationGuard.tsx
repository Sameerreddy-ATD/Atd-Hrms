import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Smartphone } from "lucide-react";

import { isPhoneLandscapeViewport, startPortraitOrientationLock } from "@/lib/screen-orientation";

/**
 * Phones stay portrait: API lock when available, full-screen prompt when the
 * OS/browser still flips to landscape (common when rotation lock is ignored).
 */
export function PortraitOrientationGuard() {
  const { t } = useTranslation();
  const [showLandscapePrompt, setShowLandscapePrompt] = useState(false);

  useEffect(() => startPortraitOrientationLock(), []);

  useEffect(() => {
    const sync = () => {
      // Re-evaluate phone vs tablet after fold/unfold or split-screen resize.
      setShowLandscapePrompt(isPhoneLandscapeViewport());
    };
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("orientationchange", sync);
    const mq = window.matchMedia("(orientation: landscape)");
    mq.addEventListener?.("change", sync);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("orientationchange", sync);
      mq.removeEventListener?.("change", sync);
    };
  }, []);

  if (!showLandscapePrompt) return null;

  return (
    <div
      className="portrait-orientation-guard"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="portrait-lock-title"
      aria-describedby="portrait-lock-desc"
    >
      <div className="portrait-orientation-guard__card">
        <Smartphone className="portrait-orientation-guard__icon" aria-hidden="true" />
        <h2 id="portrait-lock-title">{t("pages.shell.turnUpright")}</h2>
        <p id="portrait-lock-desc">{t("pages.shell.portraitRotate")}</p>
      </div>
    </div>
  );
}
