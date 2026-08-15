import * as React from "react";
import { CalendarIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  dateKeyToLocalDate,
  localDateToDateKey,
  maskDateInputText,
  parseDateInputText,
  toDateInputText,
} from "@/lib/india-date";

export type DateFieldProps = {
  /** YYYY-MM-DD, or "" when unset. */
  value: string;
  /** Receives YYYY-MM-DD, or "" when cleared. */
  onChange?: (value: string) => void;
  /** Earliest selectable day as YYYY-MM-DD. */
  min?: string;
  /** Latest selectable day as YYYY-MM-DD. */
  max?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
};

/**
 * Day-first date entry. The browser's native `<input type="date">` renders in the
 * user's locale (MM/DD/YYYY on US machines), so this keeps typing and the picker in
 * DD/MM/YYYY while the value stays YYYY-MM-DD for API payloads.
 */
const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  (
    {
      value,
      onChange,
      min,
      max,
      id,
      name,
      disabled,
      readOnly,
      required,
      placeholder = "DD/MM/YYYY",
      className,
      ...aria
    },
    ref,
  ) => {
    const [open, setOpen] = React.useState(false);
    const [text, setText] = React.useState(() => toDateInputText(value));

    React.useEffect(() => {
      // Leave half-typed input alone; only resync when the committed value moved elsewhere.
      setText((current) =>
        parseDateInputText(current) === (value || null) ? current : toDateInputText(value),
      );
    }, [value]);

    const inRange = React.useCallback(
      (dateKey: string) => (!min || dateKey >= min) && (!max || dateKey <= max),
      [min, max],
    );

    const commit = (next: string) => {
      if (next !== value) onChange?.(next);
    };

    const handleTyping = (raw: string) => {
      const masked = maskDateInputText(raw);
      setText(masked);
      if (masked === "") {
        commit("");
        return;
      }
      const dateKey = parseDateInputText(masked);
      if (dateKey && inRange(dateKey)) commit(dateKey);
    };

    const handleBlur = () => {
      if (text === "") return;
      const dateKey = parseDateInputText(text);
      // Incomplete or out-of-range entries snap back to the last accepted value.
      if (!dateKey || !inRange(dateKey)) setText(toDateInputText(value));
    };

    const selected = dateKeyToLocalDate(value);
    const interactive = !disabled && !readOnly;

    return (
      <div className={cn("relative", className)}>
        <Input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          value={text}
          disabled={disabled}
          readOnly={readOnly}
          required={required}
          maxLength={10}
          onChange={(event) => handleTyping(event.target.value)}
          onBlur={handleBlur}
          className={cn(interactive && "pr-10")}
          {...aria}
        />
        {interactive && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                tabIndex={-1}
                aria-label="Open calendar"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <CalendarIcon className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={selected}
                defaultMonth={selected ?? dateKeyToLocalDate(max) ?? dateKeyToLocalDate(min)}
                captionLayout="dropdown"
                startMonth={dateKeyToLocalDate(min) ?? new Date(1940, 0, 1)}
                endMonth={
                  dateKeyToLocalDate(max) ?? new Date(new Date().getFullYear() + 10, 11, 31)
                }
                disabled={[
                  ...(min ? [{ before: dateKeyToLocalDate(min)! }] : []),
                  ...(max ? [{ after: dateKeyToLocalDate(max)! }] : []),
                ]}
                onSelect={(date) => {
                  if (!date) return;
                  const dateKey = localDateToDateKey(date);
                  setText(toDateInputText(dateKey));
                  commit(dateKey);
                  setOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  },
);
DateField.displayName = "DateField";

export { DateField };
