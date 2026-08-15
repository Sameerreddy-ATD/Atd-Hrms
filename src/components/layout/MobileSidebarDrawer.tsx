import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const EDGE_OPEN_PX = 24;
const OPEN_THRESHOLD = 0.32;
const CLOSE_THRESHOLD = 0.32;
const FLING_VELOCITY = 0.4; // px/ms
const PANEL_WIDTH_CSS = "18rem";

type PointerSession = {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastT: number;
  mode: "undecided" | "horizontal" | "vertical";
  origin: "edge" | "panel" | "overlay";
};

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Narrow-viewport sidebar drawer with finger-follow drag (web + Capacitor):
 * - swipe right from the left screen edge to open
 * - drag the open panel left / fling to close
 * - tap the dimmed overlay to close
 */
export function MobileSidebarDrawer({
  open,
  onOpenChange,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const sessionRef = React.useRef<PointerSession | null>(null);
  const dragXRef = React.useRef(0);
  const widthRef = React.useRef(288);
  const didDragRef = React.useRef(false);
  const [dragX, setDragX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [visible, setVisible] = React.useState(open);

  React.useEffect(() => setMounted(true), []);

  const measureWidth = React.useCallback(() => {
    const w = panelRef.current?.getBoundingClientRect().width;
    if (w && w > 0) widthRef.current = w;
    return widthRef.current;
  }, []);

  React.useEffect(() => {
    if (dragging) return;
    if (open) {
      setVisible(true);
      setDragX(0);
      dragXRef.current = 0;
      return;
    }
    const width = measureWidth();
    setDragX(-width);
    dragXRef.current = -width;
    if (prefersReducedMotion()) {
      setVisible(false);
      return;
    }
    const timer = window.setTimeout(() => setVisible(false), 280);
    return () => window.clearTimeout(timer);
  }, [open, dragging, measureWidth]);

  const applyDrag = React.useCallback((next: number) => {
    const width = widthRef.current;
    const clamped = Math.min(0, Math.max(-width, next));
    dragXRef.current = clamped;
    setDragX(clamped);
  }, []);

  const finishGesture = React.useCallback(
    (velocityX: number) => {
      const width = widthRef.current || measureWidth();
      const progress = 1 + dragXRef.current / width;
      let shouldOpen = open;

      if (velocityX > FLING_VELOCITY) shouldOpen = true;
      else if (velocityX < -FLING_VELOCITY) shouldOpen = false;
      else if (open) shouldOpen = progress > 1 - CLOSE_THRESHOLD;
      else shouldOpen = progress > OPEN_THRESHOLD;

      setDragging(false);
      sessionRef.current = null;
      applyDrag(shouldOpen ? 0 : -width);
      onOpenChange(shouldOpen);
      if (!shouldOpen && prefersReducedMotion()) setVisible(false);
    },
    [applyDrag, measureWidth, onOpenChange, open],
  );

  const begin = React.useCallback(
    (origin: PointerSession["origin"], event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (origin === "edge" && open) return;

      measureWidth();
      didDragRef.current = false;
      sessionRef.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastT: performance.now(),
        mode: "undecided",
        origin,
      };

      if (origin === "edge") {
        setVisible(true);
        applyDrag(-widthRef.current);
      }
    },
    [applyDrag, measureWidth, open],
  );

  const move = React.useCallback(
    (event: React.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.id !== event.pointerId) return;

      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      const now = performance.now();

      if (session.mode === "undecided") {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.2) {
          session.mode = "vertical";
          sessionRef.current = null;
          return;
        }
        if (session.origin === "edge" && dx < 6) return;
        if (session.origin === "panel" && dx > -6 && Math.abs(dx) < Math.abs(dy)) return;

        session.mode = "horizontal";
        didDragRef.current = true;
        setDragging(true);
        setVisible(true);
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }

      if (session.mode !== "horizontal") return;
      event.preventDefault();

      const width = widthRef.current;
      const next =
        session.origin === "edge"
          ? -width + Math.max(0, dx)
          : Math.min(0, dx); // panel/overlay: start from open (0)

      applyDrag(next);
      session.lastX = event.clientX;
      session.lastT = now;
    },
    [applyDrag],
  );

  const end = React.useCallback(
    (event: React.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.id !== event.pointerId) {
        return;
      }

      const dt = Math.max(1, performance.now() - session.lastT);
      const velocityX = (event.clientX - session.lastX) / dt;

      if (session.mode === "horizontal") {
        finishGesture(velocityX);
      } else if (session.origin === "overlay" && !didDragRef.current) {
        sessionRef.current = null;
        onOpenChange(false);
      } else if (session.origin === "edge" && !open) {
        sessionRef.current = null;
        applyDrag(-widthRef.current);
        setVisible(false);
      } else {
        sessionRef.current = null;
      }

      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [applyDrag, finishGesture, onOpenChange, open],
  );

  const width = widthRef.current || 288;
  const progress = Math.min(1, Math.max(0, 1 + dragX / width));
  const show = open || visible || dragging;

  if (!mounted) return null;

  return createPortal(
    <>
      {!open ? (
        <div
          aria-hidden
          className="atd-sidebar-edge-swipe fixed z-[45] md:hidden"
          style={{
            top: "calc(var(--atd-sat) + var(--atd-header-row))",
            bottom: "var(--atd-sab)",
            left: 0,
            width: EDGE_OPEN_PX,
            touchAction: "none",
          }}
          onPointerDown={(e) => begin("edge", e)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      ) : null}

      {show ? (
        <div
          role="presentation"
          className={cn(
            "atd-drawer-under-header fixed z-[50] md:hidden",
            dragging ? "atd-sidebar-drawer--dragging" : "atd-sidebar-drawer--settling",
          )}
          style={{
            opacity: progress,
            pointerEvents: open || dragging ? "auto" : "none",
            touchAction: "none",
          }}
          onPointerDown={(e) => {
            // Only the dimmed area (not the panel) should own overlay gestures.
            if (e.target === e.currentTarget || (e.target as HTMLElement).dataset.overlay === "true") {
              begin("overlay", e);
            }
          }}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <div data-overlay="true" className="absolute inset-0 bg-foreground/40" />
        </div>
      ) : null}

      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-hidden={!open && !dragging}
        data-sidebar="sidebar"
        data-mobile="true"
        className={cn(
          "atd-drawer-panel-under-header atd-sidebar-drawer-panel fixed left-0 z-[50] flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xl md:hidden",
          dragging ? "atd-sidebar-drawer--dragging" : "atd-sidebar-drawer--settling",
          className,
        )}
        style={{
          width: PANEL_WIDTH_CSS,
          maxWidth: "min(18rem, 92vw)",
          top: "calc(var(--atd-sat) + var(--atd-header-row))",
          height: "calc(100dvh - var(--atd-sat) - var(--atd-header-row) - var(--atd-sab))",
          transform: `translate3d(${show || dragging ? dragX : -width}px, 0, 0)`,
          visibility: show ? "visible" : "hidden",
          touchAction: "pan-y",
        }}
        onPointerDown={(e) => begin("panel", e)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      >
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-[1] w-4">
          <span className="absolute right-1.5 top-1/2 h-11 w-1 -translate-y-1/2 rounded-full bg-border/90" />
        </div>
        <div className="relative z-0 flex h-full min-h-0 w-full flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </>,
    document.body,
  );
}
