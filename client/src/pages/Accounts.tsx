import { useBots } from "@/hooks/use-bots";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowLeft, Zap, Wifi, WifiOff, User, FileText, AtSign } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BotConfig } from "@shared/schema";

const EDGE_GLOW = "0 0 0 1px rgba(168,85,247,0.35), 0 0 12px rgba(168,85,247,0.15)";
const EDGE_GLOW_HOVER = "0 0 0 1px rgba(168,85,247,0.65), 0 0 22px rgba(168,85,247,0.3)";

function avatarUrl(bot: BotConfig): string | null {
  if (bot.discordId && bot.discordAvatar) {
    const ext = bot.discordAvatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${bot.discordId}/${bot.discordAvatar}.${ext}?size=128`;
  }
  if (bot.discordId) {
    // Default Discord avatar based on discriminator/ID
    const idx = Number(BigInt(bot.discordId) >> 22n) % 6;
    return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
  }
  return null;
}

function ProfileCard({ bot }: { bot: BotConfig }) {
  const avatar = avatarUrl(bot);
  const displayName = bot.discordGlobalName || (bot.discordTag ? bot.discordTag.split("#")[0] : bot.name);
  const tag = bot.discordTag || "Not connected";
  const bio = bot.discordBio?.trim() || null;
  const isOnline = bot.isRunning;

  return (
    <Link href={`/bot/${bot.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ y: -2, boxShadow: EDGE_GLOW_HOVER }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 group bg-white/[0.03]"
        style={{ boxShadow: EDGE_GLOW }}
        data-testid={`card-account-${bot.id}`}
      >
        {/* Banner */}
        <div
          className="h-20 relative"
          style={{
            background: isOnline
              ? "linear-gradient(135deg, rgba(168,85,247,0.25) 0%, rgba(6,182,212,0.15) 100%)"
              : "linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
          }}
        >
          <div className="absolute inset-0 opacity-20"
            style={{ backgroundImage: "radial-gradient(circle at 20% 50%, rgba(168,85,247,0.4) 0%, transparent 60%)" }}
          />
          {/* Status badge */}
          <div className={cn(
            "absolute top-3 right-3 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-mono font-bold border",
            isOnline
              ? "bg-green-500/10 border-green-500/30 text-green-400"
              : "bg-white/5 border-white/10 text-muted-foreground"
          )}>
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isOnline ? "ONLINE" : "OFFLINE"}
          </div>
        </div>

        {/* Avatar */}
        <div className="px-5 pb-5">
          <div className="relative -mt-10 mb-3 w-fit">
            {avatar ? (
              <img
                src={avatar}
                alt={displayName}
                className="w-16 h-16 rounded-full border-4 border-[#0a0a0a] object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            ) : (
              <div className="w-16 h-16 rounded-full border-4 border-[#0a0a0a] bg-primary/10 flex items-center justify-center">
                <User className="w-7 h-7 text-primary/60" />
              </div>
            )}
            <div className={cn(
              "absolute bottom-1 right-1 w-4 h-4 rounded-full border-2 border-[#0a0a0a]",
              isOnline ? "bg-green-500" : "bg-zinc-600"
            )} />
          </div>

          {/* Name & tag */}
          <div className="space-y-0.5 mb-3">
            <h3 className="font-bold text-white text-base leading-tight group-hover:text-primary transition-colors truncate">
              {displayName}
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <AtSign className="w-3 h-3 shrink-0" />
              <span className="truncate">{tag}</span>
            </div>
            {bot.discordId && (
              <p className="text-[10px] font-mono text-white/20 truncate">ID: {bot.discordId}</p>
            )}
          </div>

          {/* Bio */}
          {bio ? (
            <div className="flex items-start gap-2 bg-white/[0.03] rounded-lg p-3 border border-white/5">
              <FileText className="w-3 h-3 text-muted-foreground/50 mt-0.5 shrink-0" />
              <p className="text-xs text-white/60 leading-relaxed line-clamp-3">{bio}</p>
            </div>
          ) : (
            <div className="flex items-center gap-2 bg-white/[0.02] rounded-lg p-3 border border-dashed border-white/5">
              <FileText className="w-3 h-3 text-muted-foreground/20 shrink-0" />
              <p className="text-xs text-white/20 italic">No bio set</p>
            </div>
          )}

          {/* Footer hint */}
          <p className="text-[10px] font-mono text-muted-foreground/30 mt-3 group-hover:text-primary/40 transition-colors text-right">
            VIEW SETTINGS →
          </p>
        </div>
      </motion.div>
    </Link>
  );
}

export default function Accounts() {
  const { data: bots, isLoading } = useBots();
  const online = bots?.filter(b => b.isRunning).length ?? 0;

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      {/* Header */}
      <header
        className="sticky top-0 z-40 border-b backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4"
        style={{
          backgroundColor: "#0a0a0ae6",
          borderBottomColor: "rgba(168,85,247,0.2)",
          boxShadow: "0 1px 0 rgba(168,85,247,0.1)",
        }}
      >
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/">
              <button className="w-8 h-8 rounded-lg border border-white/10 flex items-center justify-center text-muted-foreground hover:text-white hover:border-primary/40 transition-all">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="font-mono font-bold text-white text-sm tracking-tight">LINKED ACCOUNTS</span>
              {bots && (
                <span className="text-[10px] font-mono text-primary/50 border border-primary/20 rounded px-1.5 py-0.5">
                  {online}/{bots.length} ONLINE
                </span>
              )}
            </div>
          </div>
          <Link href="/">
            <button className="text-xs font-mono text-muted-foreground hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-white/5 hover:border-primary/20">
              ← Dashboard
            </button>
          </Link>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Page heading */}
        <div>
          <h1 className="text-xl font-display font-black text-white tracking-tight">Linked Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All Discord accounts connected to foundingnations. Click a card to manage settings.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center space-y-3">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
              <p className="text-xs font-mono text-muted-foreground animate-pulse">LOADING ACCOUNTS...</p>
            </div>
          </div>
        ) : !bots?.length ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-24 rounded-xl border border-dashed border-purple-500/20 space-y-4"
            style={{ boxShadow: EDGE_GLOW }}
          >
            <div className="w-14 h-14 rounded-full bg-primary/5 border border-primary/10 flex items-center justify-center">
              <User className="w-6 h-6 text-muted-foreground/30" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-mono text-muted-foreground">No accounts linked yet</p>
              <p className="text-xs font-mono text-muted-foreground/40">Add a Discord token from the dashboard to get started</p>
            </div>
            <Link href="/">
              <button className="h-9 px-5 bg-primary hover:bg-primary/90 text-black font-mono font-bold text-xs rounded-lg transition-all">
                + Add Bot
              </button>
            </Link>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {bots.map((bot, i) => (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <ProfileCard bot={bot} />
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
