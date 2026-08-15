import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

const EDGE_ZONE_PX = 28;
const DIRECTION_SLOP_PX = 8;
const OPEN_COMMIT = 0.35;
const CLOSE_COMMIT = 0.5;
const FLING_PX_PER_MS = 0.3;
const VELOCITY_WINDOW_MS = 90;
const PANEL_WIDTH_CSS = "18rem";

/** Critically damped so the panel lands without wobbling. */
const SPRING_K = 420;
const SPRING_C = 2 * Math.sqrt(SPRING_K);
const MAX_FRAME_S = 0.064;
const SUB_STEP_S = 1 / 240;
const REST_PX = 0.4;
const REST_VELOCITY = 24;

type Origin = "edge" | "panel" | "overlay";

type Session = {
  id: number;
  startX: number;
  startY: number;
  baseX: number;
  axis: "undecided" | "horizontal" | "vertical";
  origin: Origin;
  samples: Array<{ x: number; t: number }>;
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
 *
 * The panel position lives in refs and is written straight to `style.transform`,
 * so a drag never re-renders React. Releases hand the remaining distance to a
 * spring seeded with the fling velocity, which is what makes an interrupted
 * drag feel continuous instead of snapping.
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
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const sessionRef = React.useRef<Session | null>(null);
  const widthRef = React.useRef(288);
  const xRef = React.useRef(-288);
  const velocityRef = React.useRef(0);
  const targetRef = React.useRef(-288);
  const rafRef = React.useRef<number | null>(null);
  const lastFrameRef = React.useRef(0);
  const draggingRef = React.useRef(false);
  const openRef = React.useRef(open);
  const [mounted, setMounted] = React.useState(false);

  openRef.current = open;

  const measureWidth = React.useCallback(() => {
    const measured = panelRef.current?.getBoundingClientRect().width;
    if (measured && measured > 0) widthRef.current = measured;
    return widthRef.current;
  }, []);

  const paint = React.useCallback(() => {
    const width = widthRef.current;
    const x = xRef.current;
    const progress = Math.min(1, Math.max(0, 1 + x / width));
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    const live = draggingRef.current || progress > 0.001;

    if (panel) {
      panel.style.transform = `translate3d(${x}px, 0, 0)`;
      panel.style.visibility = live ? "visible" : "hidden";
      panel.style.pointerEvents = live ? "auto" : "none";
    }
    if (overlay) {
      overlay.style.opacity = String(progress);
      overlay.style.pointerEvents = live ? "auto" : "none";
    }
  }, []);

  const stopAnimation = React.useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const step = React.useCallback(
    (now: number) => {
      const elapsed = Math.min(MAX_FRAME_S, (now - lastFrameRef.current) / 1000);
      lastFrameRef.current = now;

      const target = targetRef.current;
      let x = xRef.current;
      let v = velocityRef.current;
      let remaining = elapsed;

      while (remaining > 0) {
        const h = Math.min(remaining, SUB_STEP_S);
        remaining -= h;
        v += (-SPRING_K * (x - target) - SPRING_C * v) * h;
        x += v * h;
      }

      xRef.current = x;
      velocityRef.current = v;

      if (Math.abs(x - target) < REST_PX && Math.abs(v) < REST_VELOCITY) {
        xRef.current = target;
        velocityRef.current = 0;
        rafRef.current = null;
        paint();
        return;
      }

      paint();
      rafRef.current = requestAnimationFrame(step);
    },
    [paint],
  );

  const animateTo = React.useCallback(
    (target: number, velocityPxPerSec?: number) => {
      targetRef.current = target;
      if (typeof velocityPxPerSec === "number") velocityRef.current = velocityPxPerSec;

      if (prefersReducedMotion()) {
        stopAnimation();
        xRef.current = target;
        velocityRef.current = 0;
        paint();
        return;
      }

      if (rafRef.current == null) {
        lastFrameRef.current = performance.now();
        rafRef.current = requestAnimationFrame(step);
      }
    },
    [paint, step, stopAnimation],
  );

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!mounted) return;
    const width = measureWidth();
    xRef.current = openRef.current ? 0 : -width;
    targetRef.current = xRef.current;
    paint();
  }, [measureWidth, mounted, paint]);

  React.useEffect(() => {
    if (!mounted) return;
    const onResize = () => {
      const previous = widthRef.current;
      const width = measureWidth();
      if (width === previous) return;
      if (!draggingRef.current && rafRef.current == null) {
        xRef.current = openRef.current ? 0 : -width;
        targetRef.current = xRef.current;
      }
      paint();
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [measureWidth, mounted, paint]);

  React.useEffect(() => {
    if (!mounted || draggingRef.current) return;
    const target = open ? 0 : -measureWidth();
    if (targetRef.current === target && rafRef.current == null) {
      paint();
      return;
    }
    animateTo(target);
  }, [animateTo, measureWidth, mounted, open, paint]);

  React.useEffect(() => stopAnimation, [stopAnimation]);

  const clampX = React.useCallback((value: number) => {
    return Math.min(0, Math.max(-widthRef.current, value));
  }, []);

  const begin = React.useCallback(
    (origin: Origin, event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (origin === "edge" && open) return;

      measureWidth();
      stopAnimation();
      velocityRef.current = 0;

      sessionRef.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: origin === "edge" ? -widthRef.current : xRef.current,
        axis: "undecided",
        origin,
        samples: [{ x: event.clientX, t: event.timeStamp || performance.now() }],
      };
    },
    [measureWidth, open, stopAnimation],
  );

  const move = React.useCallback(
    (event: React.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.id !== event.pointerId) return;

      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;

      if (session.axis === "undecided") {
        if (Math.abs(dx) < DIRECTION_SLOP_PX && Math.abs(dy) < DIRECTION_SLOP_PX) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          sessionRef.current = null;
          return;
        }
        if (session.origin === "edge" && dx <= 0) return;
        if (session.origin === "panel" && dx >= 0) return;

        session.axis = "horizontal";
        draggingRef.current = true;
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          /* pointer capture is best effort */
        }
      }

      if (session.axis !== "horizontal") return;
      if (event.cancelable) event.preventDefault();

      const now = event.timeStamp || performance.now();
      session.samples.push({ x: event.clientX, t: now });
      while (session.samples.length > 2 && now - session.samples[0].t > VELOCITY_WINDOW_MS) {
        session.samples.shift();
      }

      xRef.current = clampX(session.baseX + dx);
      paint();
    },
    [clampX, paint],
  );

  const end = React.useCallback(
    (event: React.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.id !== event.pointerId) return;
      sessionRef.current = null;

      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {
        /* pointer capture is best effort */
      }

      if (session.axis !== "horizontal") {
        if (session.origin === "overlay") onOpenChange(false);
        return;
      }

      draggingRef.current = false;

      const first = session.samples[0];
      const last = session.samples[session.samples.length - 1];
      const span = last.t - first.t;
      const velocity = span > 0 ? (last.x - first.x) / span : 0;

      const width = widthRef.current;
      const progress = 1 + xRef.current / width;
      let shouldOpen: boolean;

      if (velocity > FLING_PX_PER_MS) shouldOpen = true;
      else if (velocity < -FLING_PX_PER_MS) shouldOpen = false;
      else shouldOpen = open ? progress > CLOSE_COMMIT : progress > OPEN_COMMIT;

      animateTo(shouldOpen ? 0 : -width, velocity * 1000);
      if (shouldOpen !== open) onOpenChange(shouldOpen);
    },
    [animateTo, onOpenChange, open],
  );

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
            width: EDGE_ZONE_PX,
            touchAction: "none",
          }}
          onPointerDown={(event) => begin("edge", event)}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        />
      ) : null}

      <div
        ref={overlayRef}
        role="presentation"
        aria-hidden
        className="atd-drawer-under-header atd-sidebar-scrim fixed z-[50] md:hidden"
        style={{ opacity: 0, pointerEvents: "none", touchAction: "none" }}
        onPointerDown={(event) => begin("overlay", event)}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal={open}
        aria-hidden={!open}
        data-sidebar="sidebar"
        data-mobile="true"
        className={cn(
          "atd-drawer-panel-under-header atd-sidebar-drawer-panel fixed left-0 z-[50] flex flex-col border-r border-sidebar-border text-sidebar-foreground shadow-xl md:hidden",
          className,
        )}
        style={{
          width: PANEL_WIDTH_CSS,
          maxWidth: "min(18rem, 92vw)",
          top: "calc(var(--atd-sat) + var(--atd-header-row))",
          height: "calc(100dvh - var(--atd-sat) - var(--atd-header-row) - var(--atd-sab))",
          transform: "translate3d(-100%, 0, 0)",
          visibility: "hidden",
          touchAction: "pan-y",
        }}
        onPointerDown={(event) => begin("panel", event)}
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
