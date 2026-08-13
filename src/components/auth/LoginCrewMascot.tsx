import { useState } from "react";
import { cn } from "@/lib/utils";

export type LoginCrewMode = "idle" | "hiding" | "peeking";

/**
 * Anytime Diesel crew mascot for the sign-in screen.
 * Closes eyes while the password field is focused; opens again when focus leaves
 * (outside tap/click). Peeking mode is used when the password is shown.
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
              fetchPriority="low"
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
          </>
        ) : (
          <div className="login-crew__fallback">
            <img src="/atd-mark.png" alt="" className="login-crew__fallback-logo" />
          </div>
        )}
      </div>
      {mode !== "hiding" && (
        <p className="login-crew__caption">
          {mode === "peeking" ? "Password visible" : "Welcome to AnyTime Diesel Workforce"}
        </p>
      )}
    </div>
  );
}
