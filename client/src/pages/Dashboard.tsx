import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Activity, ArrowUpRight, Bot, CheckCircle2, ChevronRight, Clock3,
  Command, ExternalLink, Globe2, LayoutDashboard, LifeBuoy, Loader2,
  Power, Search, Settings2, ShieldCheck, Trash2, UsersRound, X,
} from "lucide-react";
import { useBots, useBotAction, useDeleteBot } from "@/hooks/use-bots";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { BotStatusBadge } from "@/components/BotStatusBadge";
import { RpcDialog } from "@/components/RpcDialog";
import { ThemeCustomizer } from "@/components/ThemeCustomizer";
import { useTheme } from "@/hooks/use-theme";
import { apiRequest } from "@/lib/queryClient";
import { R } from "@/lib/r";
import { COMMANDS, COMMAND_CATEGORIES } from "@/lib/commands";
import { cn } from "@/lib/utils";
import type { BotConfig } from "@shared/schema";

function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function Rail() {
  return (
    <aside className="hidden xl:flex w-[76px] shrink-0 min-h-screen border-r border-white/[0.08] bg-[#090a0d] flex-col items-center py-5">
      <Link href="/" className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/15" aria-label="bothost overview">
        <span className="font-black text-sm">b</span>
      </Link>
      <div className="mt-12 flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center" title="Overview">
          <LayoutDashboard className="w-4 h-4" />
        </div>
        <Link href="/accounts" className="w-10 h-10 rounded-xl text-white/35 hover:text-white hover:bg-white/[0.05] flex items-center justify-center transition-colors" title="Accounts">
          <UsersRound className="w-4 h-4" />
        </Link>
        <Link href={R.routeSupport} className="w-10 h-10 rounded-xl text-white/35 hover:text-white hover:bg-white/[0.05] flex items-center justify-center transition-colors" title="Support">
          <LifeBuoy className="w-4 h-4" />
        </Link>
      </div>
      <div className="mt-auto flex flex-col gap-4 items-center">
        <Link href="/admin" className="w-10 h-10 rounded-xl text-white/25 hover:text-white hover:bg-white/[0.05] flex items-center justify-center transition-colors" title="Administration">
          <ShieldCheck className="w-4 h-4" />
        </Link>
      </div>
    </aside>
  );
}

function Metric({ label, value, detail, icon: Icon, tone = "text-white" }: {
  label: string; value: string; detail: string; icon: React.ElementType; tone?: string;
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

function PublicContextLookup() {
  const [ip, setIp] = useState("");
  const [result, setResult] = useState<any>(null);
  const lookup = useMutation({
    mutationFn: async (value: string) => {
      const response = await apiRequest("GET", `${R.apiOsintIpCheck}?ip=${encodeURIComponent(value)}`);
      return response.json();
    },
    onSuccess: setResult,
  });

  return (
    <section className="border border-white/[0.08] bg-white/[0.025]">
      <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.08]">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 border border-violet-300/20 bg-violet-300/[0.07] flex items-center justify-center">
            <Globe2 className="w-4 h-4 text-violet-300" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Public context lookup</h2>
            <p className="mt-1 text-xs text-white/35">Coarse location and network details for a public IP.</p>
          </div>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] text-white/25 uppercase tracking-wider">
          <ShieldCheck className="w-3 h-3" /> limited data
        </span>
      </div>
      <div className="p-5">
        <form className="flex flex-col sm:flex-row gap-2" onSubmit={event => {
          event.preventDefault();
          if (ip.trim()) lookup.mutate(ip.trim());
        }}>
          <input
            value={ip}
            onChange={event => setIp(event.target.value)}
            placeholder="Enter a public IP address"
            className="flex-1 h-10 border border-white/10 bg-black/15 px-3 text-sm font-mono text-white placeholder:text-white/25 outline-none focus:border-violet-300/50"
          />
          <button type="submit" disabled={!ip.trim() || lookup.isPending} className="h-10 px-4 bg-violet-300 text-slate-950 text-xs font-bold hover:bg-violet-200 disabled:opacity-40 transition-colors">
            {lookup.isPending ? "Checking…" : "Check address"}
          </button>
        </form>
        {lookup.isError && <p className="mt-3 text-xs text-red-300">{(lookup.error as Error).message}</p>}
        {result && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Address", result.ip],
              ["Location", [result.city, result.region, result.country].filter(Boolean).join(", ") || "—"],
              ["Network", result.connection || "—"],
              ["Timezone", result.timezone || "—"],
            ].map(([label, value]) => (
              <div key={label} className="border border-white/[0.07] bg-black/15 p-3">
                <p className="text-[9px] uppercase tracking-wider text-white/25">{label}</p>
                <p className="mt-1 text-xs text-white/70 break-words">{value}</p>
              </div>
            ))}
            {result.mapUrl && (
              <a href={result.mapUrl} target="_blank" rel="noreferrer" className="col-span-2 sm:col-span-4 flex items-center gap-2 text-xs text-violet-300 hover:text-violet-200 mt-1">
                Open approximate area in OpenStreetMap <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function AmbientCursorGlow() {
  const glowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!glow || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const move = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        glow.style.left = `${event.clientX}px`;
        glow.style.top = `${event.clientY}px`;
        glow.classList.add("is-visible");
      });
    };
    const leave = () => glow.classList.remove("is-visible");
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("blur", leave);
    document.documentElement.addEventListener("mouseleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("blur", leave);
      document.documentElement.removeEventListener("mouseleave", leave);
    };
  }, []);

  return <div ref={glowRef} className="cursor-ambient-glow" aria-hidden="true" />;
}

function OsintSection() {
  const osintCommands = COMMANDS.filter(command => command.category === "OSINT");
  return (
    <section className="relative overflow-hidden border border-primary/15 bg-primary/[0.025]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-white/[0.08] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-primary/25 bg-primary/[0.08]">
            <Globe2 className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/75">OSINT desk</p>
            <h2 className="mt-1 text-sm font-semibold">Public context &amp; intelligence</h2>
            <p className="mt-1 text-xs text-white/35">Authorized, coarse public lookups in one controlled workspace.</p>
          </div>
        </div>
        <Link href={R.routeSupport} className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80">
          View command docs <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 divide-y divide-white/[0.07] lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,.9fr)] lg:divide-x lg:divide-y-0">
        <div className="p-5"><PublicContextLookup /></div>
        <div>
          <div className="px-5 py-4 border-b border-white/[0.07]">
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/30">Discord OSINT commands</p>
            <p className="mt-1 text-xs text-white/35">{osintCommands.length} documented workflows available in support.</p>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {osintCommands.map(command => (
              <Link key={command.usage} href={R.routeSupport} className="group flex items-center justify-between gap-4 px-5 py-3 hover:bg-white/[0.035]">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] text-primary/85">{command.usage}</p>
                  <p className="mt-1 truncate text-[11px] text-white/35">{command.summary}</p>
                </div>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/20 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function AccountRow({ bot, onRpc }: { bot: BotConfig; onRpc: (bot: BotConfig) => void }) {
  const deleteBot = useDeleteBot();
  const action = useBotAction();
  return (
    <div className="group flex items-center gap-3 px-4 py-3 border-b border-white/[0.06] hover:bg-white/[0.03] transition-colors">
      <div className={cn("w-8 h-8 flex items-center justify-center border", bot.isRunning ? "border-primary/25 bg-primary/10" : "border-white/10 bg-white/[0.03]")}>
        <Bot className={cn("w-4 h-4", bot.isRunning ? "text-primary" : "text-white/30")} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate">{bot.name}</p>
          <BotStatusBadge isRunning={!!bot.isRunning} isAfk={false} />
        </div>
        <p className="text-[11px] font-mono text-white/30 truncate mt-0.5">{bot.discordTag ? `@${bot.discordTag}` : `Account ${String(bot.id).padStart(4, "0")}`}</p>
      </div>
      <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
        <Link href={R.routeBot.replace(":id", String(bot.id))} className="w-8 h-8 flex items-center justify-center border border-white/10 text-white/35 hover:text-white hover:bg-white/[0.05]">
          <Settings2 className="w-3.5 h-3.5" />
        </Link>
        <button onClick={() => onRpc(bot)} className="hidden sm:flex h-8 px-2 items-center border border-white/10 text-[10px] font-mono text-white/35 hover:text-white hover:bg-white/[0.05]">RPC</button>
        <button
          onClick={() => action.mutate({ id: bot.id, action: bot.isRunning ? "stop" : "restart" })}
          className={cn("w-8 h-8 flex items-center justify-center border", bot.isRunning ? "border-red-300/15 text-red-300/70 hover:bg-red-300/10" : "border-primary/20 text-primary hover:bg-primary/10")}
          title={bot.isRunning ? "Stop account" : "Start account"}
        >
          <Power className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => { if (confirm("Remove this account?")) deleteBot.mutate(bot.id); }} className="w-8 h-8 flex items-center justify-center border border-white/10 text-white/20 hover:text-red-300 hover:bg-red-300/10" title="Remove account">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { currentBg } = useTheme();
  const { data: bots, isLoading } = useBots();
  const [search, setSearch] = useState("");
  const [rpcBot, setRpcBot] = useState<BotConfig | null>(null);
  const { data: stats } = useQuery<{ totalHosted: number; totalRunning: number }>({ queryKey: [R.apiStats], refetchInterval: 30000 });
  const { data: uptime } = useQuery<{ uptimeSeconds: number }>({ queryKey: [R.apiUptime], refetchInterval: 60000 });
  const { data: announcements } = useQuery<Array<{ id: number; version: string; title: string; body: string; date: string }>>({ queryKey: [R.apiAnnouncements], refetchInterval: 60000 });
  const filtered = (bots || []).filter(bot => bot.name.toLowerCase().includes(search.toLowerCase()) || String(bot.id).includes(search));

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090a0d] text-white">
        <div className="flex items-center gap-3 text-sm text-white/45"><Loader2 className="w-4 h-4 text-primary animate-spin" /> Loading workspace</div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex bg-[#090a0d] text-white" style={{ backgroundColor: currentBg.cssValue }}>
      <AmbientCursorGlow />
      <Rail />
      <aside className="hidden md:flex w-[248px] shrink-0 min-h-screen border-r border-white/[0.08] bg-black/10 flex-col">
        <div className="h-[72px] px-5 flex items-center border-b border-white/[0.08]">
          <div>
            <p className="font-semibold tracking-tight">bothost</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/25 mt-1">Account workspace</p>
          </div>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-2 px-3 h-9 border border-white/10 bg-white/[0.025] text-xs text-white/30">
            <Search className="w-3.5 h-3.5" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find an account" className="w-full bg-transparent outline-none placeholder:text-white/25" />
            <span className="text-[9px] font-mono text-white/15">⌘K</span>
          </div>
        </div>
        <div className="px-5 pt-3 pb-2 text-[10px] uppercase tracking-[0.18em] text-white/25">Workspace</div>
        <nav className="px-3 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary text-sm"><LayoutDashboard className="w-4 h-4" /> Overview</div>
          <Link href="/accounts" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/45 hover:bg-white/[0.04] hover:text-white text-sm transition-colors"><UsersRound className="w-4 h-4" /> Accounts <span className="ml-auto text-[10px] text-white/20">{stats?.totalHosted ?? 0}</span></Link>
          <Link href={R.routeSupport} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/45 hover:bg-white/[0.04] hover:text-white text-sm transition-colors"><LifeBuoy className="w-4 h-4" /> Support</Link>
        </nav>
        <div className="px-5 pt-7 pb-2 text-[10px] uppercase tracking-[0.18em] text-white/25">Connected accounts</div>
        <div className="px-3 overflow-y-auto">
          {(bots || []).slice(0, 8).map(bot => (
            <Link key={bot.id} href={R.routeBot.replace(":id", String(bot.id))} className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.04] transition-colors">
              <span className={cn("w-1.5 h-1.5 rounded-full", bot.isRunning ? "bg-primary" : "bg-white/20")} />
              <span className="text-xs text-white/50 truncate">{bot.name}</span>
            </Link>
          ))}
          {!bots?.length && <p className="px-3 text-[11px] text-white/25">No accounts yet.</p>}
        </div>
        <div className="mt-auto p-4">
          <Link href={R.routeSupport} className="block border border-white/[0.08] bg-white/[0.025] p-3 hover:bg-white/[0.05] transition-colors">
            <div className="flex items-center justify-between"><span className="text-xs text-white/70">Support desk</span><ChevronRight className="w-3.5 h-3.5 text-white/25" /></div>
            <p className="text-[11px] leading-relaxed text-white/30 mt-1.5">Command docs and setup help.</p>
          </Link>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-[72px] border-b border-white/[0.08] flex items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/35">Workspace</span><span className="text-white/15">/</span><span>Overview</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeCustomizer />
            <span className="hidden sm:inline-flex items-center gap-2 text-xs text-white/35 border border-white/10 px-2.5 py-1.5"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Live</span>
          </div>
        </header>

        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-8 sm:py-10">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-primary/80 font-semibold">Workspace overview</p>
              <h1 className="mt-3 text-3xl sm:text-4xl font-semibold tracking-[-0.03em]">Operations overview</h1>
              <p className="mt-2 text-sm text-white/35">Monitor connected accounts and move quickly between tools.</p>
            </div>
            <CreateBotDialog />
          </div>

          <div className="mt-8 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Metric label="Uptime" value={uptime ? formatUptime(uptime.uptimeSeconds) : "—"} detail="workspace process" icon={Clock3} />
            <Metric label="Running" value={String(stats?.totalRunning ?? 0)} detail="connected now" icon={Activity} tone="text-primary" />
            <Metric label="Hosted" value={String(stats?.totalHosted ?? 0)} detail="saved accounts" icon={Bot} />
            <Metric label="Health" value="Nominal" detail="no active alerts" icon={CheckCircle2} tone="text-primary" />
          </div>

          <div className="mt-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)] gap-5">
            <section className="border border-white/[0.08] bg-white/[0.025]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                <div>
                  <h2 className="text-sm font-semibold">Connected accounts</h2>
                  <p className="text-xs text-white/30 mt-1">Select an account to open its workspace.</p>
                </div>
                <Link href="/accounts" className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1">View all <ArrowUpRight className="w-3 h-3" /></Link>
              </div>
              <div className="md:hidden p-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-2 h-9 border border-white/10 bg-black/15 px-3">
                  <Search className="w-3.5 h-3.5 text-white/25" />
                  <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Find an account" className="w-full bg-transparent outline-none text-xs placeholder:text-white/25" />
                </div>
              </div>
              {filtered.length ? filtered.map(bot => <AccountRow key={bot.id} bot={bot} onRpc={setRpcBot} />) : (
                <div className="py-16 px-6 text-center">
                  <Bot className="w-6 h-6 text-white/20 mx-auto" />
                  <p className="mt-3 text-sm text-white/45">{bots?.length ? "No accounts match that search." : "No account connected yet."}</p>
                  <p className="mt-1 text-xs text-white/25">{bots?.length ? "Try another name or account ID." : "Connect your first account to get started."}</p>
                  {!bots?.length && <div className="mt-5"><CreateBotDialog /></div>}
                </div>
              )}
            </section>

            <section className="border border-white/[0.08] bg-white/[0.025]">
              <div className="px-5 py-4 border-b border-white/[0.08]">
                <h2 className="text-sm font-semibold">Workspace notes</h2>
                <p className="text-xs text-white/30 mt-1">A few useful places to start.</p>
              </div>
              <div className="p-4 space-y-2">
                <Link href={R.routeSupport} className="flex items-start gap-3 p-3 border border-white/[0.07] hover:bg-white/[0.04] transition-colors">
                  <Command className="w-4 h-4 text-primary mt-0.5" />
                  <div><p className="text-xs text-white/75">Command reference</p><p className="text-[11px] text-white/30 mt-1">{COMMANDS.length} commands with examples</p></div>
                </Link>
                <Link href={R.routeSupport} className="flex items-start gap-3 p-3 border border-white/[0.07] hover:bg-white/[0.04] transition-colors">
                  <LifeBuoy className="w-4 h-4 text-violet-300 mt-0.5" />
                  <div><p className="text-xs text-white/75">How to use bothost</p><p className="text-[11px] text-white/30 mt-1">Setup, exports and troubleshooting</p></div>
                </Link>
                <div className="flex items-start gap-3 p-3 border border-white/[0.07]">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5" />
                  <div><p className="text-xs text-white/75">System status</p><p className="text-[11px] text-white/30 mt-1">All workspace services responding</p></div>
                </div>
              </div>
              <div className="px-5 pb-5">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-white/20"><span className="w-1.5 h-1.5 rounded-full bg-primary" /> Live workspace</div>
              </div>
            </section>
          </div>

          <div className="mt-5"><OsintSection /></div>

          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(280px,.65fr)] gap-5">
            <section className="border border-white/[0.08] bg-white/[0.025]">
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.08]">
                <div><h2 className="text-sm font-semibold">Command surface</h2><p className="text-xs text-white/30 mt-1">A quick look at the full account capability set.</p></div>
                <Link href={R.routeSupport} className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1">Open support <ArrowUpRight className="w-3 h-3" /></Link>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-white/[0.06]">
                {COMMAND_CATEGORIES.filter(category => category !== "OSINT").map(category => (
                  <Link key={category} href={R.routeSupport} className="bg-[#0b0c10] p-4 hover:bg-white/[0.04] transition-colors">
                    <div className="flex items-center justify-between"><span className="text-xs text-white/70">{category}</span><span className="text-[10px] font-mono text-white/25">{COMMANDS.filter(command => command.category === category).length}</span></div>
                    <p className="mt-3 text-[11px] text-white/30">{COMMANDS.find(command => command.category === category)?.summary}</p>
                  </Link>
                ))}
              </div>
            </section>
            <section className="border border-white/[0.08] bg-white/[0.025]">
              <div className="px-5 py-4 border-b border-white/[0.08] flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /><h2 className="text-sm font-semibold">Recent updates</h2></div>
              <div className="divide-y divide-white/[0.06]">
                {!announcements?.length ? <p className="px-5 py-8 text-xs text-white/25">No updates published yet.</p> : announcements.slice(0, 4).map(item => (
                  <div key={item.id} className="px-5 py-3"><div className="flex items-center justify-between gap-3"><p className="text-xs text-white/70">{item.title}</p><span className="text-[10px] text-white/25">{item.date}</span></div>{item.body && <p className="text-[11px] leading-relaxed text-white/30 mt-1">{item.body}</p>}</div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </main>
      {rpcBot && <RpcDialog bot={rpcBot} open={!!rpcBot} onOpenChange={open => { if (!open) setRpcBot(null); }} />}
    </div>
  );
}