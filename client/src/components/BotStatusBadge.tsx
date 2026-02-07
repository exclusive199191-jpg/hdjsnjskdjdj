import { cn } from "@/lib/utils";

export function BotStatusBadge({ isRunning, isAfk }: { isRunning: boolean; isAfk: boolean }) {
  if (!isRunning) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-destructive/10 border border-destructive/30 rounded text-xs font-mono text-destructive uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
        OFFLINE
      </div>
    );
  }

  if (isAfk) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs font-mono text-yellow-500 uppercase">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
        AFK MODE
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
