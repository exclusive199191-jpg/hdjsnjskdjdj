import { cn } from "@/lib/utils";

export function BotStatusBadge({ isRunning }: { isRunning: boolean; isAfk?: boolean }) {
  if (!isRunning) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-destructive/10 border border-destructive/30 rounded text-xs font-mono text-destructive uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
        OFFLINE
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary/10 border border-primary/30 rounded text-xs font-mono text-primary uppercase">
      <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
      ONLINE
    </div>
  );
}
