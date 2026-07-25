import { useEffect, useMemo, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  detectPwaPlatform,
  dismissInstallPrompt,
  installInstructionCopy,
  isAppInstalled,
  isIosSafari,
  wasInstallDismissedRecently,
} from "@/lib/pwa-install";
import { cn } from "@/lib/utils";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallBanner({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [showSteps, setShowSteps] = useState(false);
  const platform = useMemo(() => detectPwaPlatform(), []);
  const copy = useMemo(() => installInstructionCopy(platform), [platform]);

  useEffect(() => {
    if (isAppInstalled() || wasInstallDismissedRecently()) return;

    function onBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);

    // iOS Safari never fires beforeinstallprompt — show guided install help.
    if (isIosSafari()) {
      setVisible(true);
      setShowSteps(true);
    } else if (platform === "mac" || platform === "windows" || platform === "android") {
      // Soft tip until Chrome/Edge provides a deferred prompt.
      const timer = window.setTimeout(() => {
        if (!isAppInstalled() && !wasInstallDismissedRecently()) setVisible(true);
      }, 1800);
      return () => {
        window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.clearTimeout(timer);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, [platform]);

  if (!visible || isAppInstalled()) return null;

  async function install() {
    if (!deferredPrompt) {
      setShowSteps(true);
      return;
    }
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (choice.outcome === "accepted") {
      setVisible(false);
    } else {
      setShowSteps(true);
    }
  }

  function dismiss() {
    dismissInstallPrompt();
    setVisible(false);
  }

  return (
    <aside
      className={cn(
        "mb-4 overflow-hidden rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-background to-background shadow-sm animate-in fade-in slide-in-from-top-2 duration-500",
        className,
      )}
      aria-label="Install application"
    >
      <div className="flex items-start gap-3 p-3.5 sm:p-4">
        <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Smartphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold tracking-tight text-foreground">{copy.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Install for faster attendance, leave, and alerts — works on Android, iPhone, Windows,
            and Mac.
          </p>
          {showSteps && (
            <ol className="mt-3 space-y-1.5 rounded-lg border bg-background/80 p-3 text-sm text-muted-foreground">
              {copy.steps.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="font-semibold text-primary">{index + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
              {platform === "ios" && (
                <li className="mt-2 flex items-center gap-2 text-xs text-foreground">
                  <Share className="h-3.5 w-3.5 text-primary" /> Look for the Share icon in Safari
                </li>
              )}
            </ol>
          )}
          <div className="mt-3 flex flex-col gap-2 min-[420px]:flex-row">
            <Button className="w-full min-[420px]:w-auto" onClick={() => void install()}>
              <Download className="mr-2 h-4 w-4" />
              {deferredPrompt ? "Install app" : "How to install"}
            </Button>
            <Button variant="ghost" className="w-full min-[420px]:w-auto" onClick={dismiss}>
              Not now
            </Button>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0"
          aria-label="Dismiss install tip"
          onClick={dismiss}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </aside>
  );
}
