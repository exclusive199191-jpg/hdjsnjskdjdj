import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface CyberButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  isLoading?: boolean;
}

export const CyberButton = forwardRef<HTMLButtonElement, CyberButtonProps>(
  ({ className, variant = "primary", isLoading, children, disabled, ...props }, ref) => {
    const variants = {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(34,197,94,0.5)] border-transparent",
      secondary: "bg-secondary/20 text-secondary hover:bg-secondary/30 border-secondary hover:shadow-[0_0_20px_rgba(147,51,234,0.3)]",
      destructive: "bg-destructive/20 text-destructive hover:bg-destructive/30 border-destructive hover:shadow-[0_0_20px_rgba(239,68,68,0.3)]",
      ghost: "bg-transparent text-muted-foreground hover:text-foreground hover:bg-white/5 border-transparent",
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={cn(
          "cyber-button relative inline-flex items-center justify-center px-6 py-3",
          "font-mono font-bold uppercase tracking-widest text-sm",
          "border transition-all duration-300 transform active:scale-95 disabled:opacity-50 disabled:pointer-events-none",
          variants[variant],
          className
        )}
        {...props}
      >
        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {children}
        {/* Decorative corner accents */}
        <span className="absolute top-0 left-0 w-2 h-2 border-t border-l border-current opacity-50" />
        <span className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-current opacity-50" />
      </button>
    );
  }
);

CyberButton.displayName = "CyberButton";
