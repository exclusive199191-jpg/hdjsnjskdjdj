import { useBots, useDeleteBot, useBotAction } from "@/hooks/use-bots";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { BotStatusBadge } from "@/components/BotStatusBadge";
import { RpcDialog } from "@/components/RpcDialog";
import { ThemeCustomizer } from "@/components/ThemeCustomizer";
import { useTheme } from "@/hooks/use-theme";
import { useQuery } from "@tanstack/react-query";
import {
  Loader2, Settings, Power, Trash2, Search, Zap, Bot,
  Shield, MessageSquare, Users, Clock, Globe, Database,
  Activity, ChevronRight, ExternalLink, ClipboardList, Send,
} from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { R } from "@/lib/r";
import React from "react";
import type { BotConfig } from "@shared/schema";

/* ── helpers ── */
function fmtUptime(s: number) {
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
function fmtNum(n: number | undefined) {
  if (n === undefined || n === null) return "—";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

/* ── stat row ── */
function StatRow({ icon: Icon, value, label, color = "text-white" }: {
  icon: React.ElementType; value: string; label: string; color?: string;
}) {
  return (
    <div className="flex items-center gap-4 px-5 py-4 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.05] transition-colors">
      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/15 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-primary/70" />
      </div>
      <div className="min-w-0">
        <p className={cn("text-2xl font-bold tracking-tight leading-none", color)}>{value}</p>
        <p className="text-[10px] font-mono text-white/30 uppercase tracking-widest mt-1">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: bots, isLoading } = useBots();
  const deleteBot = useDeleteBot();
  const botAction = useBotAction();
  const { currentBg } = useTheme();
  const [search, setSearch] = React.useState("");
  const [rpcBot, setRpcBot] = React.useState<BotConfig | null>(null);
  const [hoveredCard, setHoveredCard] = React.useState<number | null>(null);

  const { data: globalStats } = useQuery<{ totalHosted: number; totalRunning: number }>({
    queryKey: [R.apiStats],
    refetchInterval: 30000,
  });
  const { data: uptimeData } = useQuery<{ uptimeSeconds: number }>({
    queryKey: [R.apiUptime],
    refetchInterval: 60000,
  });
  const { data: widget } = useQuery<{ name: string; icon: string | null; members: number; online: number; error?: string }>({
    queryKey: [R.apiDiscordWidget],
    refetchInterval: 120000,
  });
  const { data: announcements } = useQuery<Array<{ id: number; version: string; title: string; body: string; date: string; createdAt: number }>>({
    queryKey: [R.apiAnnouncements],
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: currentBg.cssValue }}>
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
          <p className="font-mono text-primary/60 text-xs animate-pulse">LOADING INSTANCES...</p>
        </div>
      </div>
    );
  }

  const totalBots   = globalStats?.totalHosted  ?? 0;
  const activeBots  = globalStats?.totalRunning ?? 0;
  const filteredBots = bots?.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.id.toString().includes(search)
  );

  const CARD = "bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden";

  return (
    <div className="min-h-screen" style={{ backgroundColor: currentBg.cssValue }}>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-40 border-b backdrop-blur-xl px-4 sm:px-6 py-3"
        style={{ backgroundColor: `${currentBg.cssValue}e8`, borderBottomColor: "rgba(168,85,247,0.18)" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-display font-black text-sm tracking-tight text-white">bothost.host</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeCustomizer />
            <Link href={R.routeAccounts}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 text-primary/70 hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-colors text-xs font-mono">
                <Users className="w-3 h-3" /><span className="hidden sm:inline">Accounts</span>
              </button>
            </Link>
            <Link href={R.routeAdmin}>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-mono">
                <Shield className="w-3 h-3" /><span className="hidden sm:inline">Admin</span>
              </button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 space-y-8">

        {/* ── Page header ── */}
        <div>
          <p className="text-xs font-mono tracking-[0.2em] text-primary/60 uppercase mb-1">Control Panel</p>
          <h1 className="text-3xl sm:text-4xl font-display font-black text-white tracking-tight">Dashboard</h1>
          <p className="text-white/40 text-sm mt-1.5">Manage your selfbot connections and settings.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

          {/* ── Left col ── */}
          <div className="space-y-6">

            {/* Selfbot Status card */}
            <div className={CARD}>
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                <span className="font-semibold text-sm text-white">Selfbot Status</span>
                <span className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-semibold border",
                  activeBots > 0
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-white/5 border-white/15 text-white/40"
                )}>
                  <span className={cn("w-1.5 h-1.5 rounded-full", activeBots > 0 ? "bg-green-400 animate-pulse" : "bg-white/30")} />
                  {activeBots > 0 ? "Online" : "Offline"}
                </span>
              </div>
              <div className="p-4 space-y-2">
                <StatRow icon={Clock}       value={uptimeData ? fmtUptime(uptimeData.uptimeSeconds) : "—"} label="Uptime"           />
                <StatRow icon={Activity}    value={String(activeBots)}                                      label="Running"          color="text-green-400" />
                <StatRow icon={Bot}         value={String(totalBots)}                                       label="Hosted"           />
              </div>
            </div>

          </div>

          {/* ── Right col — hosted accounts ── */}
          <div className={cn(CARD, "flex flex-col")}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
              <span className="font-semibold text-sm text-white">Your Instances</span>
              <CreateBotDialog />
            </div>

            {/* Search */}
            {totalBots > 0 && (
              <div className="px-4 pt-4 pb-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-white/5 rounded-lg h-8 pl-9 pr-3 font-mono text-xs text-white placeholder:text-white/20 focus:ring-1 focus:ring-primary/20 outline-none"
                  />
                </div>
              </div>
            )}

            {/* Bot list */}
            <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-2 max-h-[520px]">
              {!totalBots ? (
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
                    <Bot className="w-6 h-6 text-white/20" />
                  </div>
                  <div>
                    <p className="text-sm text-white/50">No account hosted yet</p>
                    <p className="text-xs text-white/25 mt-1">Enter your token below to get started.</p>
                  </div>
                  <CreateBotDialog />
                </div>
              ) : (
                filteredBots?.map((bot, idx) => (
                  <motion.div
                    key={bot.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={cn(
                      "group rounded-xl border transition-all duration-200 overflow-hidden",
                      hoveredCard === bot.id
                        ? "border-primary/30 bg-primary/[0.04]"
                        : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]"
                    )}
                    onMouseEnter={() => setHoveredCard(bot.id)}
                    onMouseLeave={() => setHoveredCard(null)}
                  >
                    <div className="px-4 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-white truncate">{bot.name}</p>
                          <p className="text-xs font-mono text-white/35 mt-0.5 truncate">
                            {bot.discordTag ? `@${bot.discordTag}` : `ID #${bot.id.toString().padStart(4,"0")}`}
                          </p>
                        </div>
                        <BotStatusBadge isRunning={!!bot.isRunning} isAfk={false} />
                      </div>

                      <div className="flex items-center gap-1.5 mt-3">
                        <Link href={R.routeBot.replace(':id', String(bot.id))}>
                          <button className="flex-1 h-8 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-mono text-white/70 hover:text-white transition-all flex items-center justify-center gap-1.5">
                            <Settings className="w-3 h-3" /> Configure
                          </button>
                        </Link>
                        <button
                          onClick={() => setRpcBot(bot)}
                          className="h-8 px-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[11px] font-mono text-white/50 hover:text-white transition-all"
                          title="RPC"
                        >
                          RPC
                        </button>
                        <button
                          onClick={() => botAction.mutate({ id: bot.id, action: bot.isRunning ? "stop" : "restart" })}
                          title={bot.isRunning ? "Stop" : "Start"}
                          className={cn(
                            "w-8 h-8 rounded-lg border flex items-center justify-center transition-all shrink-0",
                            bot.isRunning
                              ? "border-red-500/20 bg-red-500/5 hover:bg-red-500/15 text-red-400"
                              : "border-primary/20 bg-primary/5 hover:bg-primary/15 text-primary"
                          )}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm("Delete this bot?")) deleteBot.mutate(bot.id); }}
                          title="Delete"
                          className="w-8 h-8 rounded-lg border border-white/8 bg-white/3 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 text-white/25 flex items-center justify-center transition-all shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>{/* end 2-col grid */}

        {/* ── Bottom row: Recent Updates + Dev Server + Community Server + csintduck ad ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* Recent Updates — first */}
          <div className={CARD}>
            <div className="flex items-center gap-2 px-5 py-4 border-b border-white/[0.06]">
              <ClipboardList className="w-4 h-4 text-primary/60" />
              <span className="font-semibold text-sm text-white">Recent Updates</span>
            </div>
            <div className="divide-y divide-white/[0.04] max-h-72 overflow-y-auto">
              {!announcements?.length ? (
                <div className="px-5 py-8 text-center text-xs text-white/25 font-mono">No updates yet</div>
              ) : (
                announcements.map(a => (
                  <div key={a.id} className="px-5 py-4">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      {a.version && (
                        <span className="text-xs font-bold text-primary font-mono">{a.version}</span>
                      )}
                      <span className="text-[10px] font-mono text-white/25 ml-auto shrink-0">{a.date}</span>
                    </div>
                    <p className="text-sm font-semibold text-white">{a.title}</p>
                    {a.body && <p className="text-xs text-white/40 mt-1 leading-relaxed">{a.body}</p>}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Discord Server Widget — second */}
          <div className={CARD}>
            <div className="px-5 py-4 border-b border-white/[0.06]">
              <span className="font-semibold text-sm text-white">Community Server</span>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3">
                {widget?.icon ? (
                  <img src={widget.icon} alt="" className="w-12 h-12 rounded-xl object-cover" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-[#5865F2]/20 border border-[#5865F2]/30 flex items-center justify-center text-xl">🐰</div>
                )}
                <div>
                  <p className="font-bold text-white text-base">{widget?.name ?? "offense"}</p>
                  <p className="text-xs text-white/35 font-mono">Join our community server</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-white/[0.04] rounded-xl p-3 text-center border border-white/[0.06]">
                  <p className="text-xl font-bold text-white">{widget?.members?.toLocaleString() ?? "—"}</p>
                  <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mt-0.5">Members</p>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3 text-center border border-white/[0.06]">
                  <p className="text-xl font-bold text-green-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400 mb-0.5 mr-0.5 align-middle" />
                    {widget?.online?.toLocaleString() ?? "—"}
                  </p>
                  <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mt-0.5">Online</p>
                </div>
                <div className="bg-white/[0.04] rounded-xl p-3 text-center border border-white/[0.06]">
                  <p className="text-xl font-bold text-white/50">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-white/30 mb-0.5 mr-0.5 align-middle" />
                    {widget && !widget.error ? ((widget.members ?? 0) - (widget.online ?? 0)).toLocaleString() : "—"}
                  </p>
                  <p className="text-[9px] font-mono text-white/30 uppercase tracking-widest mt-0.5">Offline</p>
                </div>
              </div>
              <a
                href="https://discord.gg/offense"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full h-11 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] text-white font-bold text-sm transition-colors"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.03.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                </svg>
                Join Server
              </a>
            </div>
          </div>

          {/* csintduck.cc Advertisement — third */}
          <div className={cn(CARD, "relative overflow-hidden border-cyan-500/20 flex flex-col")}>
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-blue-500/5 pointer-events-none" />
            <div className="px-5 py-4 border-b border-cyan-500/15 flex items-center justify-between relative z-10">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="font-semibold text-sm text-white tracking-tight">Featured Tool</span>
              </div>
              <span className="text-[9px] font-mono text-cyan-400/60 uppercase tracking-widest border border-cyan-500/20 px-2 py-0.5 rounded-full">Partner</span>
            </div>
            <div className="relative mx-4 mt-4 rounded-xl overflow-hidden border border-white/10 shadow-xl flex-shrink-0">
              <img src="/csintduck-preview.jpeg" alt="csintduck.cc dashboard preview" className="w-full h-28 object-cover object-top" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
              <div className="absolute bottom-2 left-3">
                <span className="text-[10px] font-mono text-white/50">Live Dashboard Preview</span>
              </div>
            </div>
            <div className="p-5 space-y-3 relative z-10 flex-1 flex flex-col justify-between">
              <div className="space-y-1.5">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-black text-base text-white tracking-tight">csintduck.cc</h3>
                  <span className="text-[9px] font-mono text-cyan-400/70 uppercase tracking-widest">Advanced OSINT</span>
                </div>
                <p className="text-xs text-white/45 leading-relaxed">
                  Professional-grade intelligence platform. Deep people search, breach data, social media scan, network intel, Telegram lookup &amp; more — built by Jax.
                </p>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono text-white/40">
                  <Send className="w-3 h-3 text-cyan-400/60 shrink-0" />
                  <span>Contact Jax:</span>
                  <a href="https://t.me/fancyjaxy" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 transition-colors font-semibold">@fancyjaxy</a>
                </div>
                <a href="https://csintduck.cc" target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full h-10 rounded-xl font-bold text-xs text-black transition-all bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 shadow-[0_0_20px_rgba(6,182,212,0.25)] hover:shadow-[0_0_28px_rgba(6,182,212,0.4)]">
                  <ExternalLink className="w-3.5 h-3.5" />
                  Visit csintduck.cc
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* ── Creator footer ── */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] overflow-hidden">
          {/* top accent line */}
          <div className="h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="px-6 py-6 flex flex-col sm:flex-row items-center sm:items-start gap-6">

            {/* Avatar + Telegram profile card */}
            <div className="flex-shrink-0">
              <div className="relative">
                {/* Telegram-style profile bubble */}
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/30 to-purple-600/30 border border-primary/25 flex items-center justify-center shadow-[0_0_24px_rgba(168,85,247,0.2)]">
                  <span className="text-3xl font-black text-primary select-none">K</span>
                </div>
                {/* online dot */}
                <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-black shadow" />
              </div>
            </div>

            {/* Identity block */}
            <div className="flex-1 text-center sm:text-left space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                <span className="text-white font-black text-lg tracking-tight">cursedbibles</span>
                <span className="text-[10px] font-mono text-primary/60 uppercase tracking-widest border border-primary/20 px-2 py-0.5 rounded-full w-fit mx-auto sm:mx-0">Site Developer</span>
              </div>
              <p className="text-xs text-white/45 leading-relaxed max-w-lg">
                Built and maintains <span className="text-white/70 font-semibold">bothost</span> — reach out if you need help, have a bug to report, or want a specific feature added. DMs are open.
              </p>

              {/* Contact pills */}
              <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-1">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#5865F2]/10 border border-[#5865F2]/25 text-[#7289da] text-xs font-mono font-semibold">
                  <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 fill-current" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.042.03.052a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/>
                  </svg>
                  cursedbibles
                </div>
              </div>
            </div>

            {/* Right — made with label */}
            <div className="hidden lg:flex flex-col items-end gap-1 flex-shrink-0">
              <span className="text-[10px] font-mono text-white/20 uppercase tracking-widest">Built by</span>
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-primary/20 border border-primary/30 flex items-center justify-center">
                  <Zap className="w-3 h-3 text-primary" />
                </div>
                <span className="text-sm font-black text-white/60 tracking-tight">bothost.host</span>
              </div>
            </div>
          </div>
          <div className="h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
          <div className="px-6 py-3 flex items-center justify-center">
            <p className="text-[10px] font-mono text-white/15">© 2025 bothost.host · All rights reserved</p>
          </div>
        </div>

      </main>

      {rpcBot && (
        <RpcDialog
          bot={rpcBot}
          open={!!rpcBot}
          onOpenChange={open => { if (!open) setRpcBot(null); }}
        />
      )}
    </div>
  );
}
