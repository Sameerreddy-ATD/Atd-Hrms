import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

const EDGE_GUARD_PX = 28;
const DECIDE_PX = 12;
const NAV_RATIO = 0.22;
const NAV_MIN_PX = 72;
const FLING_VELOCITY = 0.45;

type Session = {
  id: number;
  startX: number;
  startY: number;
  lastX: number;
  lastT: number;
  mode: "undecided" | "horizontal" | "vertical";
};

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      "input, textarea, select, button, a, label, [contenteditable='true'], [role='dialog'], [data-no-page-swipe], [aria-roledescription='carousel'], [data-sidebar='sidebar']",
    ),
  );
}

function canScrollHorizontally(start: Element, dx: number) {
  let node: HTMLElement | null = start instanceof HTMLElement ? start : start.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    const overflowX = style.overflowX;
    if (
      (overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay") &&
      node.scrollWidth > node.clientWidth + 2
    ) {
      if (dx < 0 && node.scrollLeft < node.scrollWidth - node.clientWidth - 1) return true;
      if (dx > 0 && node.scrollLeft > 1) return true;
    }
    node = node.parentElement;
  }
  return false;
}

function matchPathIndex(paths: string[], pathname: string) {
  let best = -1;
  let bestLen = -1;
  for (let i = 0; i < paths.length; i++) {
    const to = paths[i]!;
    if (pathname === to || pathname.startsWith(`${to}/`)) {
      if (to.length > bestLen) {
        best = i;
        bestLen = to.length;
      }
    }
  }
  return best;
}

/**
 * Carousel-style drag / swipe between sidebar destinations (mouse + touch).
 * Drag left → next menu page, drag right → previous — same idea as dashboard cards.
 */
export function PageSwipeNavigator({
  paths,
  children,
  className,
}: {
  paths: string[];
  children: ReactNode;
  className?: string;
}) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { openMobile, isMobile } = useSidebar();
  const sessionRef = useRef<Session | null>(null);
  const [offsetX, setOffsetX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const widthRef = useRef(typeof window !== "undefined" ? window.innerWidth : 390);

  const index = useMemo(() => matchPathIndex(paths, pathname), [paths, pathname]);
  const canPrev = index > 0;
  const canNext = index >= 0 && index < paths.length - 1;

  useEffect(() => {
    setOffsetX(0);
    setDragging(false);
    sessionRef.current = null;
  }, [pathname]);

  const finish = useCallback(
    (dx: number, velocityX: number) => {
      setDragging(false);
      sessionRef.current = null;
      const width = widthRef.current || window.innerWidth;
      const distanceOk = Math.abs(dx) >= Math.max(NAV_MIN_PX, width * NAV_RATIO);
      const flingNext = velocityX < -FLING_VELOCITY;
      const flingPrev = velocityX > FLING_VELOCITY;

      let target: string | null = null;
      if ((flingNext || (distanceOk && dx < 0)) && canNext) {
        target = paths[index + 1] ?? null;
      } else if ((flingPrev || (distanceOk && dx > 0)) && canPrev) {
        target = paths[index - 1] ?? null;
      }

      setOffsetX(0);
      if (target) {
        void navigate({ to: target });
      }
    },
    [canNext, canPrev, index, navigate, paths],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (openMobile) return;
      if (paths.length < 2 || index < 0) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (isInteractiveTarget(event.target)) return;
      // Leave the left edge for the mobile menu drawer gesture.
      if (isMobile && event.clientX <= EDGE_GUARD_PX) return;

      widthRef.current = (event.currentTarget as HTMLElement).clientWidth || window.innerWidth;
      sessionRef.current = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastT: performance.now(),
        mode: "undecided",
      };
    },
    [index, isMobile, openMobile, paths.length],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.id !== event.pointerId) return;

      const dx = event.clientX - session.startX;
      const dy = event.clientY - session.startY;
      const now = performance.now();

      if (session.mode === "undecided") {
        if (Math.abs(dx) < DECIDE_PX && Math.abs(dy) < DECIDE_PX) return;
        if (Math.abs(dy) > Math.abs(dx) * 1.15) {
          session.mode = "vertical";
          sessionRef.current = null;
          return;
        }
        if (canScrollHorizontally(event.target as Element, dx)) {
          session.mode = "vertical";
          sessionRef.current = null;
          return;
        }
        if ((dx < 0 && !canNext) || (dx > 0 && !canPrev)) {
          session.mode = "vertical";
          sessionRef.current = null;
          return;
        }
        session.mode = "horizontal";
        setDragging(true);
        try {
          (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
      }

      if (session.mode !== "horizontal") return;
      event.preventDefault();

      const width = widthRef.current;
      let next = dx;
      if ((dx < 0 && !canNext) || (dx > 0 && !canPrev)) next = dx * 0.18;
      else next = Math.max(-width * 0.45, Math.min(width * 0.45, dx));
      setOffsetX(next);
      session.lastX = event.clientX;
      session.lastT = now;
    },
    [canNext, canPrev],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.id !== event.pointerId) return;

      if (session.mode === "horizontal") {
        const dt = Math.max(1, performance.now() - session.lastT);
        const velocityX = (event.clientX - session.lastX) / dt;
        finish(event.clientX - session.startX, velocityX);
      } else {
        sessionRef.current = null;
        setDragging(false);
        setOffsetX(0);
      }

      try {
        (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
    },
    [finish],
  );

  return (
    <div
      className={cn(
        "min-h-full min-w-0",
        dragging ? "atd-page-swipe--dragging cursor-grabbing select-none" : "atd-page-swipe--idle",
        className,
      )}
      style={{
        transform: offsetX ? `translate3d(${offsetX}px, 0, 0)` : undefined,
        touchAction: "pan-y",
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {children}
    </div>
  );
}
