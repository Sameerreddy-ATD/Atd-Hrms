import { useState } from "react";
import { cn } from "@/lib/utils";

export type LoginCrewMode = "idle" | "hiding" | "peeking";

/**
 * Anytime Diesel crew mascot for the sign-in screen.
 * Swaps to a closed-eyes portrait while a password is entered.
 */
export function LoginCrewMascot({
  mode = "idle",
  className,
}: {
  mode?: LoginCrewMode;
  className?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const eyesClosed = mode === "hiding";
  const peeking = mode === "peeking";

  return (
    <div className={cn("login-crew", `login-crew--${mode}`, className)} aria-hidden="true">
      <div className="login-crew__stage">
        {!imageFailed ? (
          <>
            <img
              src="/login-crew-mascot.png"
              alt=""
              className={cn("login-crew__photo", eyesClosed && "login-crew__photo--hidden")}
              decoding="async"
              fetchPriority="high"
              draggable={false}
              onError={() => setImageFailed(true)}
            />
            <img
              src="/login-crew-mascot-closed.png"
              alt=""
              className={cn(
                "login-crew__photo login-crew__photo--closed",
                eyesClosed && "login-crew__photo--closed-visible",
                peeking && "login-crew__photo--peek",
              )}
              decoding="async"
              draggable={false}
              onError={() => setImageFailed(true)}
            />
            <div className="login-crew__hand login-crew__hand--left">
              <HandSvg />
            </div>
            <div className="login-crew__hand login-crew__hand--right">
              <HandSvg mirrored />
            </div>
          </>
        ) : (
          <div className="login-crew__fallback">
            <img src="/atd-logo.png" alt="" className="login-crew__fallback-logo" />
          </div>
        )}
      </div>
      <p className="login-crew__caption">
        {mode === "hiding"
          ? "Keeping your password private"
          : mode === "peeking"
            ? "Password visible"
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
      <ellipse cx="32" cy="34" rx="22" ry="18" fill="#e8a56a" />
      <ellipse cx="18" cy="22" rx="7" ry="10" fill="#e8a56a" transform="rotate(-28 18 22)" />
      <ellipse cx="28" cy="16" rx="6.5" ry="11" fill="#e8a56a" transform="rotate(-8 28 16)" />
      <ellipse cx="38" cy="16" rx="6.5" ry="11" fill="#e8a56a" transform="rotate(8 38 16)" />
      <ellipse cx="48" cy="22" rx="7" ry="10" fill="#e8a56a" transform="rotate(28 48 22)" />
      <ellipse cx="32" cy="40" rx="14" ry="10" fill="#d99255" opacity=".55" />
    </svg>
  );
}
