import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Command,
  LifeBuoy,
  Loader2,
  LayoutDashboard,
  LogOut,
  Power,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useBots, useBotAction, useDeleteBot } from "@/hooks/use-bots";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { RpcDialog } from "@/components/RpcDialog";
import { SecurityExposurePanel } from "@/components/SecurityExposurePanel";
import { IpReportPanel } from "@/components/IpReportPanel";
import { ThemeCustomizer } from "@/components/ThemeCustomizer";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { R } from "@/lib/r";
import { COMMANDS, COMMAND_CATEGORIES } from "@/lib/commands";
import { cn } from "@/lib/utils";
import type { BotConfig } from "@shared/schema";

const SNOWFLAKES = Array.from({ length: 56 }, (_, index) => ({
  left: `${(index * 47) % 101}%`,
  size: `${2 + (index % 4)}px`,
  duration: `${9 + (index % 10)}s`,
  delay: `${-(index % 14)}s`,
  opacity: 0.22 + (index % 6) * 0.08,
}));

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function StatCard({ label, value, detail, icon: Icon, tone = "text-white" }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  tone?: string;
}) {
  return (
    <div className="border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-[0.18em] text-white/30">{label}</span>
        <Icon className="w-3.5 h-3.5 text-primary/75" />
      </div>
      <p className={cn("mt-5 text-2xl font-semibold tracking-tight", tone)}>{value}</p>
      <p className="mt-1 text-[11px] text-white/30">{detail}</p>
    </div>
  );
}

function AccountRow({ bot, onRpc }: { bot: BotConfig; onRpc: (bot: BotConfig) => void }) {
  const action = useBotAction();
  const deleteBot = useDeleteBot();

  return (
    <div className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <span className={cn("h-2 w-2 shrink-0 rounded-full", bot.isRunning ? "bg-primary shadow-[0_0_10px_hsl(var(--primary)/.7)]" : "bg-white/20")} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{bot.name}</p>
          <p className="mt-0.5 truncate text-xs font-mono text-white/30">
            {bot.discordTag ? `@${bot.discordTag}` : `ID #${String(bot.id).padStart(4, "0")}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link href={R.routeBot.replace(":id", String(bot.id))} className="inline-flex h-8 items-center gap-1.5 border border-white/10 px-3 text-[11px] text-white/60 hover:bg-white/[0.05] hover:text-white">
          <Settings2 className="h-3.5 w-3.5" /> Configure
        </Link>
        <button onClick={() => onRpc(bot)} className="h-8 border border-white/10 px-3 text-[11px] text-white/50 hover:bg-white/[0.05] hover:text-white">
          RPC
        </button>
        <button
          onClick={() => action.mutate({ id: bot.id, action: bot.isRunning ? "stop" : "restart" })}
          disabled={action.isPending}
          className={cn("flex h-8 w-8 items-center justify-center border disabled:opacity-50", bot.isRunning ? "border-red-300/20 text-red-300/80 hover:bg-red-300/10" : "border-primary/20 text-primary hover:bg-primary/10")}
          title={bot.isRunning ? "Stop account" : "Start account"}
        >
          <Power className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => { if (window.confirm("Remove this account?")) deleteBot.mutate(bot.id); }}
          className="flex h-8 w-8 items-center justify-center border border-white/10 text-white/25 hover:border-red-300/20 hover:bg-red-300/10 hover:text-red-300"
          title="Remove account"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: user } = useAuth();
  const logout = useLogout();
  const { data: bots, isLoading } = useBots();
  const [search, setSearch] = useState("");
  const [rpcBot, setRpcBot] = useState<BotConfig | null>(null);
  const { data: stats } = useQuery<{ totalHosted: number; totalRunning: number }>({ queryKey: [R.apiStats], refetchInterval: 30000 });
  const { data: uptime } = useQuery<{ uptimeSeconds: number }>({ queryKey: [R.apiUptime], refetchInterval: 60000 });
  const { data: announcements } = useQuery<Array<{ id: number; title: string; body: string; date: string }>>({ queryKey: [R.apiAnnouncements], refetchInterval: 60000 });
  const accounts = (bots || []).filter(bot => bot.name.toLowerCase().includes(search.toLowerCase()) || String(bot.id).includes(search));

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08050f] text-white">
        <div className="flex items-center gap-3 text-sm text-white/45"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading workspace</div>
      </div>
    );
  }

  return (
    <div
      className="dashboard-shell ios-safe-bottom flex min-h-[100dvh] overflow-hidden bg-[#020104] text-white"
      style={{
        backgroundColor: "#020104",
        backgroundImage: "radial-gradient(circle at 12% 0%, rgba(124,58,237,0.14), transparent 32rem), radial-gradient(circle at 92% 75%, rgba(76,29,149,0.12), transparent 30rem)",
      }}
    >
      <div className="dashboard-snow" aria-hidden="true">
        {SNOWFLAKES.map((flake, index) => (
          <span
            key={index}
            className="snowflake"
            style={{
              left: flake.left,
              opacity: flake.opacity,
              ["--snow-size" as string]: flake.size,
              ["--snow-duration" as string]: flake.duration,
              ["--snow-delay" as string]: flake.delay,
            } as React.CSSProperties}
          />
        ))}
      </div>

      <aside className="hidden w-[248px] shrink-0 flex-col border-r border-white/[0.08] bg-black/35 md:flex">
        <div className="flex h-[72px] items-center border-b border-white/[0.08] px-5">
          <Link href="/" className="flex items-center gap-3" aria-label="bothost overview">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary font-black text-primary-foreground shadow-lg shadow-primary/20">b</span>
            <span>
              <span className="block text-sm font-semibold tracking-tight">bothost</span>
              <span className="mt-1 block text-[10px] uppercase tracking-[0.18em] text-white/25">Account workspace</span>
            </span>
          </Link>
        </div>
        <div className="p-4">
          <div className="flex h-9 items-center gap-2 border border-white/10 bg-white/[0.025] px-3 text-xs text-white/30">
            <Search className="h-3.5 w-3.5" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find an account" className="w-full bg-transparent outline-none placeholder:text-white/25" />
          </div>
        </div>
        <div className="px-5 pb-2 pt-3 text-[10px] uppercase tracking-[0.18em] text-white/25">Workspace</div>
        <nav className="space-y-1 px-3">
          <div className="flex items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-sm text-primary"><LayoutDashboard className="h-4 w-4" /> Overview</div>
          <Link href="/accounts" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white"><UsersRound className="h-4 w-4" /> Accounts <span className="ml-auto text-[10px] text-white/20">{stats?.totalHosted ?? 0}</span></Link>
          <Link href={R.routeSupport} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/45 transition-colors hover:bg-white/[0.04] hover:text-white"><LifeBuoy className="h-4 w-4" /> Support</Link>
           <Link href={R.routeAdmin} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/45 transition-colors hover:bg-violet-400/10 hover:text-violet-200"><ShieldCheck className="h-4 w-4" /> Admin panel</Link>
        </nav>
        <div className="px-5 pb-2 pt-7 text-[10px] uppercase tracking-[0.18em] text-white/25">Connected accounts</div>
        <div className="space-y-1 px-3">
          {(bots || []).slice(0, 8).map(bot => (
            <Link key={bot.id} href={R.routeBot.replace(":id", String(bot.id))} className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.04]">
              <span className={cn("h-1.5 w-1.5 rounded-full", bot.isRunning ? "bg-primary" : "bg-white/20")} />
              <span className="truncate text-xs text-white/50">{bot.name}</span>
            </Link>
          ))}
          {!bots?.length && <p className="px-3 text-[11px] text-white/25">No accounts yet.</p>}
        </div>
        <div className="mt-auto p-4">
          <Link href={R.routeSupport} className="block border border-white/[0.08] bg-white/[0.025] p-3 transition-colors hover:bg-white/[0.05]">
            <div className="flex items-center justify-between"><span className="text-xs text-white/70">Support desk</span><ChevronRight className="h-3.5 w-3.5 text-white/25" /></div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/30">Command docs and setup help.</p>
          </Link>
        </div>
      </aside>

      <main className="min-w-0 flex-1">
        <header className="flex h-[72px] items-center justify-between border-b border-white/[0.08] px-5 sm:px-8">
          <div className="flex items-center gap-2 text-sm"><span className="text-white/35">Workspace</span><span className="text-white/15">/</span><span>Overview</span></div>
          <div className="flex items-center gap-2">
            <Link href={R.routeAdmin} aria-label="Open admin panel" className="inline-flex items-center gap-2 border border-violet-400/25 bg-violet-500/10 px-2.5 py-1.5 text-xs text-violet-200 transition-colors hover:bg-violet-500/20">
              <ShieldCheck className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Admin</span>
            </Link>
            <ThemeCustomizer />
            <span className="hidden items-center gap-2 border border-white/10 px-2.5 py-1.5 text-xs text-white/35 sm:inline-flex"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" /> Live</span>
            <div className="flex items-center gap-2 border border-white/10 px-2.5 py-1.5">
              <UserRound className="h-3.5 w-3.5 text-primary/80" />
              <span className="max-w-[110px] truncate text-xs text-white/55">{user?.username || "Account"}</span>
              <button onClick={() => logout.mutate()} disabled={logout.isPending} title="Sign out" className="text-white/35 transition-colors hover:text-white disabled:opacity-40"><LogOut className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-6xl px-5 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:px-8 sm:py-10">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary/80">Workspace overview</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">Operations overview</h1>
              <p className="mt-2 text-sm text-white/35">Monitor connected accounts and move quickly between tools.</p>
            </div>
            <CreateBotDialog />
          </div>

          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Uptime" value={uptime ? formatUptime(uptime.uptimeSeconds) : "—"} detail="workspace process" icon={Clock3} />
            <StatCard label="Running" value={String(stats?.totalRunning ?? 0)} detail="connected now" icon={Activity} tone="text-primary" />
            <StatCard label="Hosted" value={String(stats?.totalHosted ?? 0)} detail="saved accounts" icon={Bot} />
            <StatCard label="Health" value="Nominal" detail="no active alerts" icon={CheckCircle2} tone="text-primary" />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
             <section className="border border-white/[0.08] bg-white/[0.025]">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
                <div><h2 className="text-sm font-semibold">Connected accounts</h2><p className="mt-1 text-xs text-white/30">Select an account to open its workspace.</p></div>
                <Link href="/accounts" className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80">View all <ArrowUpRight className="h-3 w-3" /></Link>
              </div>
              <div className="md:hidden border-b border-white/[0.06] p-4"><div className="flex h-9 items-center gap-2 border border-white/10 bg-black/15 px-3"><Search className="h-3.5 w-3.5 text-white/25" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find an account" className="w-full bg-transparent text-xs outline-none placeholder:text-white/25" /></div></div>
              {accounts.length ? accounts.map(bot => <AccountRow key={bot.id} bot={bot} onRpc={setRpcBot} />) : (
                <div className="px-6 py-16 text-center"><Bot className="mx-auto h-6 w-6 text-white/20" /><p className="mt-3 text-sm text-white/45">{bots?.length ? "No accounts match that search." : "No account connected yet."}</p><p className="mt-1 text-xs text-white/25">{bots?.length ? "Try another name or account ID." : "Connect your first account to get started."}</p>{!bots?.length && <div className="mt-5"><CreateBotDialog /></div>}</div>
              )}
            </section>

             <section className="border border-white/[0.08] bg-white/[0.025]">
              <div className="border-b border-white/[0.08] px-5 py-4"><h2 className="text-sm font-semibold">Workspace tools</h2><p className="mt-1 text-xs text-white/30">Everything available after connecting an account.</p></div>
               <div className="space-y-2 p-4">
                <Link href={R.routeSupport} className="flex items-start gap-3 border border-white/[0.07] p-3 transition-colors hover:bg-white/[0.04]"><Command className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-xs text-white/75">Command reference</p><p className="mt-1 text-[11px] text-white/30">{COMMANDS.length} commands with examples</p></div></Link>
                <Link href={R.routeSupport} className="flex items-start gap-3 border border-white/[0.07] p-3 transition-colors hover:bg-white/[0.04]"><LifeBuoy className="mt-0.5 h-4 w-4 text-violet-300" /><div><p className="text-xs text-white/75">Setup &amp; support</p><p className="mt-1 text-[11px] text-white/30">Account setup and troubleshooting</p></div></Link>
                <div className="flex items-start gap-3 border border-white/[0.07] p-3"><ShieldCheck className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-xs text-white/75">Private workspace</p><p className="mt-1 text-[11px] text-white/30">Your connected account data stays isolated.</p></div></div>
              </div>
            </section>
          </div>

          <div className="mt-5"><SecurityExposurePanel /></div>
          <div className="mt-5"><IpReportPanel /></div>

          <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.65fr)]">
            <section className="border border-white/[0.08] bg-white/[0.025]">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4"><div><h2 className="text-sm font-semibold">Command surface</h2><p className="mt-1 text-xs text-white/30">Browse the available command categories.</p></div><Link href={R.routeSupport} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80">Open support <ArrowUpRight className="h-3 w-3" /></Link></div>
              <div className="grid grid-cols-1 gap-px bg-white/[0.06] sm:grid-cols-2">
                {COMMAND_CATEGORIES.filter(category => category !== "OSINT").map(category => (
                  <Link key={category} href={R.routeSupport} className="bg-[#0b0c10] p-4 transition-colors hover:bg-white/[0.04]">
                    <div className="flex items-center justify-between"><span className="text-xs text-white/70">{category}</span><span className="text-[10px] font-mono text-white/25">{COMMANDS.filter(command => command.category === category).length}</span></div>
                    <p className="mt-3 text-[11px] text-white/30">{COMMANDS.find(command => command.category === category)?.summary}</p>
                  </Link>
                ))}
              </div>
            </section>
            <section className="border border-white/[0.08] bg-white/[0.025]">
              <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4"><Activity className="h-4 w-4 text-primary" /><h2 className="text-sm font-semibold">Recent updates</h2></div>
              <div className="divide-y divide-white/[0.06]">
                {!announcements?.length ? <p className="px-5 py-8 text-xs text-white/25">No updates published yet.</p> : announcements.slice(0, 4).map(item => <div key={item.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-xs text-white/70">{item.title}</p><span className="text-[10px] text-white/25">{item.date}</span></div>{item.body && <p className="mt-1 text-[11px] leading-relaxed text-white/30">{item.body}</p>}</div>)}
              </div>
            </section>
          </div>

          <footer className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/[0.08] py-5 text-xs text-white/30 sm:flex-row">
            <span>© 2025 bothost · All rights reserved</span>
            <a href="https://t.me/foundingnations" target="_blank" rel="noopener noreferrer" className="text-primary/80 hover:text-primary">@foundingnations</a>
          </footer>
        </div>
      </main>

      {rpcBot && <RpcDialog bot={rpcBot} open={!!rpcBot} onOpenChange={open => { if (!open) setRpcBot(null); }} />}
    </div>
  );
}