import { InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

interface CyberInputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const CyberInput = forwardRef<HTMLInputElement, CyberInputProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-2">
        {label && (
          <label className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
            {label}
          </label>
        )}
        <div className="relative group">
          <input
            ref={ref}
            className={cn(
              "flex h-12 w-full bg-background border border-input px-4 py-2",
              "font-mono text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium",
              "placeholder:text-muted-foreground/50",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "transition-all duration-300",
              error && "border-destructive focus-visible:ring-destructive",
              className
            )}
            {...props}
          />
          {/* Cyber accents */}
          <div className="absolute bottom-0 left-0 h-[1px] w-0 bg-primary transition-all duration-300 group-focus-within:w-full" />
        </div>
        {error && <p className="text-xs text-destructive font-mono">{error}</p>}
      </div>
    );
  }
);

CyberInput.displayName = "CyberInput";
