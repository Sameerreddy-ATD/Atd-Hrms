import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Confirmations should read as a passing note, not a page-level banner.
 *
 * The compact surface itself is styled in styles.css — Tailwind's
 * `group-[.toaster]:` variants are wrapped in `:where()` and lose to sonner's
 * runtime stylesheet on source order. What stays here is the behaviour: colour
 * is carried by the icon alone rather than `richColors`, which paints the whole
 * card and makes a routine save look like an alert.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      style={
        {
          // Above dialogs (70) and nested select/popover portals (80).
          zIndex: 90,
          // Sonner sets --width inline at 356px, so a stylesheet rule cannot
          // reach it; the style prop is spread last and wins.
          "--width": "min(20rem, calc(100vw - 2rem))",
        } as React.CSSProperties
      }
      duration={2500}
      gap={8}
      icons={{
        success: <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />,
        error: <XCircle className="size-4 text-red-600 dark:text-red-400" />,
        warning: <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />,
        info: <Info className="size-4 text-sky-600 dark:text-sky-400" />,
      }}
      toastOptions={{
        classNames: {
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
