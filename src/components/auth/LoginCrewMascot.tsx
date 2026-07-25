import { useState } from "react";
import { cn } from "@/lib/utils";

export type LoginCrewMode = "idle" | "hiding" | "peeking";

/**
 * Anytime Diesel crew mascot for the sign-in screen.
 * Covers his eyes while a password is entered (privacy cue).
 */
export function LoginCrewMascot({
  mode = "idle",
  className,
}: {
  mode?: LoginCrewMode;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div
      className={cn("login-crew", `login-crew--${mode}`, className)}
      aria-hidden="true"
    >
      <div className="login-crew__stage">
        {!imageFailed ? (
          <img
            src="/login-crew-mascot.png"
            alt=""
            className="login-crew__photo"
            decoding="async"
            fetchPriority="high"
            draggable={false}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="login-crew__fallback">
            <img src="/atd-logo.png" alt="" className="login-crew__fallback-logo" />
          </div>
        )}

        <div className="login-crew__shade" />
        <div className="login-crew__lid login-crew__lid--left" />
        <div className="login-crew__lid login-crew__lid--right" />

        <div className="login-crew__hand login-crew__hand--left">
          <HandSvg />
        </div>
        <div className="login-crew__hand login-crew__hand--right">
          <HandSvg mirrored />
        </div>
      </div>
      <p className="login-crew__caption">
        {mode === "hiding"
          ? "Keeping your password private"
          : mode === "peeking"
            ? "Peeking carefully"
            : "Welcome to Anytime Diesel"}
      </p>
    </div>
  );
}

function HandSvg({ mirrored = false }: { mirrored?: boolean }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("login-crew__hand-svg", mirrored && "login-crew__hand-svg--mirrored")}
      role="presentation"
    >
      <ellipse cx="32" cy="34" rx="22" ry="18" fill="#f2c59b" />
      <ellipse cx="18" cy="22" rx="7" ry="10" fill="#f2c59b" transform="rotate(-28 18 22)" />
      <ellipse cx="28" cy="16" rx="6.5" ry="11" fill="#f2c59b" transform="rotate(-8 28 16)" />
      <ellipse cx="38" cy="16" rx="6.5" ry="11" fill="#f2c59b" transform="rotate(8 38 16)" />
      <ellipse cx="48" cy="22" rx="7" ry="10" fill="#f2c59b" transform="rotate(28 48 22)" />
      <ellipse cx="32" cy="40" rx="14" ry="10" fill="#e8b286" opacity="0.55" />
    </svg>
  );
}
