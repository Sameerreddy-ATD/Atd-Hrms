import { useState } from "react";
import type { ComponentProps } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type"> & {
  onVisibilityChange?: (visible: boolean) => void;
};

export function PasswordInput({
  className,
  onVisibilityChange,
  onFocus,
  onBlur,
  ...props
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  function setPasswordVisible(next: boolean) {
    setVisible(next);
    onVisibilityChange?.(next);
  }

  return (
    <div className="relative">
      <Input
        {...props}
        type={visible ? "text" : "password"}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn("pr-11", className)}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <button
        type="button"
        className={cn(
          "absolute inset-y-0 right-0 z-10 flex w-11 items-center justify-center rounded-r-md",
          "text-muted-foreground hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
          /* Pin inside the field; beat shell/button press transforms */
          "!transform-none hover:!transform-none active:!transform-none",
          "hover:bg-transparent active:bg-transparent",
          "sm:w-9",
        )}
        data-password-toggle=""
        onClick={() => setPasswordVisible(!visible)}
        onMouseDown={(event) => event.preventDefault()}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-4 w-4 shrink-0" /> : <Eye className="h-4 w-4 shrink-0" />}
      </button>
    </div>
  );
}
