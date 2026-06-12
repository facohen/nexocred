import { forwardRef } from "react";
import type { FieldError } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * RHF + Zod field. Spread `register(name)` directly — the ref is forwarded to
 * the underlying input so RHF can read the value.
 */
export const FormField = forwardRef<
  HTMLInputElement,
  {
    label: string;
    error?: FieldError;
    required?: boolean;
  } & React.InputHTMLAttributes<HTMLInputElement>
>(function FormField({ label, error, required, className, ...inputProps }, ref) {
  const id = inputProps.id ?? inputProps.name;
  return (
    <div className={cn("space-y-1", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label} {required && <span className="text-red-600">*</span>}
      </label>
      <Input id={id} ref={ref} aria-invalid={Boolean(error)} {...inputProps} />
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error.message}
        </p>
      )}
    </div>
  );
});
