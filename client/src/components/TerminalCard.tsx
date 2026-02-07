import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Terminal } from "lucide-react";

interface TerminalCardProps {
  title: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
  headerColor?: "green" | "purple" | "red" | "default";
}

export function TerminalCard({ 
  title, 
  children, 
  className, 
  action,
  headerColor = "default" 
}: TerminalCardProps) {
  const headerColors = {
    green: "text-neon-green border-neon-green/30 bg-neon-green/5",
    purple: "text-neon-purple border-neon-purple/30 bg-neon-purple/5",
    red: "text-destructive border-destructive/30 bg-destructive/5",
    default: "text-muted-foreground border-border bg-card",
  };

  return (
    <div className={cn("cyber-card overflow-hidden rounded-sm", className)}>
      <div className={cn("flex items-center justify-between px-4 py-2 border-b", headerColors[headerColor])}>
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4" />
          <h3 className="font-display text-sm font-bold uppercase tracking-wider">
            {title}
          </h3>
        </div>
        {action}
      </div>
      <div className="p-4 relative">
        {/* Matrix-like background grid */}
        <div className="absolute inset-0 bg-grid-pattern opacity-[0.03] pointer-events-none" />
        <div className="relative z-10">
          {children}
        </div>
      </div>
    </div>
  );
}
