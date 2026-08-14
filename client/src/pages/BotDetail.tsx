import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { useBot, useUpdateBot, useBotAction, BOT_NOT_FOUND, BOT_ACCESS_DENIED } from "@/hooks/use-bots";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBotConfigSchema } from "@shared/schema";
import { CyberInput } from "@/components/CyberInput";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2, ArrowLeft, Save, RefreshCw, Activity, Settings2, Terminal,
  ChevronDown, Search, Lock, Plus, X, Wifi, AlertTriangle, LogIn,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { R } from "@/lib/r";
import { motion, AnimatePresence } from "framer-motion";

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="bg-card/70 border border-white/8 rounded-2xl overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const COMMANDS = [
  // General
  { cat: "General",    usage: "help",                            desc: "Show command overview. Use help <number> to open a category." },
  { cat: "General",    usage: "uptime",                          desc: "Show how long the bot has been running." },
  { cat: "General",    usage: "ping",                            desc: "Show bot latency and WebSocket ping." },
  { cat: "General",    usage: "prefix set <new_prefix>",         desc: "Change the command prefix for this bot." },
  { cat: "General",    usage: "report server <guild_id>",        desc: "Report a server for every available reason (all categories)." },
  { cat: "General",    usage: "report msg",                      desc: "Reply to a message then use this to report it for every available reason." },
  { cat: "General",    usage: "copy full server",                desc: "Clone this server (roles, channels, perms), create invite, DM all members." },
  { cat: "General",    usage: "server emoji steal <guild_id>",   desc: "Steal all emojis from a guild and upload them to the current server." },
  { cat: "General",    usage: "server end <guild_id>",           desc: "Flood all speakable channels in a guild with images (2 rounds)." },
  { cat: "General",    usage: "server end stop",                 desc: "Cancel an in-progress server end flood." },
  { cat: "General",    usage: "gpt <question>",                  desc: "Ask an AI a question (keyless, via Pollinations)." },
  { cat: "General",    usage: "logs",                            desc: "Show the last 20 errors caught by this bot." },
  { cat: "General",    usage: "stopall",                         desc: "Stop all running automations (bully, autoreact, spam)." },
  // Automation
  { cat: "Automation", usage: "afk [reason]",                    desc: "Enable AFK mode with optional reason." },
  { cat: "Automation", usage: "unafk",                           desc: "Disable AFK mode." },
  { cat: "Automation", usage: "statusmover {w1,w2,w3}",          desc: "Cycle through words as your custom status every 2s." },
  { cat: "Automation", usage: "statusmover stop",                desc: "Stop the status mover." },
  { cat: "Automation", usage: "snipe [count]",                   desc: "Show the Nth last deleted message in this channel (default 1)." },
  { cat: "Automation", usage: "purge [count]",                   desc: "Delete your last N messages in this channel (default 10, max 100)." },
  { cat: "Automation", usage: "closealldms",                     desc: "Close all open DM channels." },
  { cat: "Automation", usage: "massdm <message>",                desc: "Send a DM to all friends." },
  { cat: "Automation", usage: "mock <@user>",                    desc: "Repeat everything a user says in mocking case." },
  { cat: "Automation", usage: "mock stop",                       desc: "Stop mocking." },
  { cat: "Automation", usage: "nitrosniper on/off",              desc: "Enable or disable the Nitro gift sniper." },
  { cat: "Automation", usage: "bully <@user>",                   desc: "Spam insults at a user at max speed (heading every 4th message)." },
  { cat: "Automation", usage: "bully stop",                      desc: "Stop bullying." },
  { cat: "Automation", usage: "spam <count> <message>",          desc: "Send a message N times rapidly." },
  { cat: "Automation", usage: "spam stop",                       desc: "Cancel an active spam." },
  { cat: "Automation", usage: "autoreact <@user> <emoji>",       desc: "Auto-react to every message from a user." },
  { cat: "Automation", usage: "autoreact stop",                  desc: "Stop auto-reacting." },
  { cat: "Automation", usage: "gc allowall on/off",              desc: "Allow or block all incoming group chats." },
  { cat: "Automation", usage: "gc whitelist add <gcId>",         desc: "Whitelist a GC so it is never auto-deleted." },
  { cat: "Automation", usage: "gc whitelist remove <gcId>",      desc: "Remove a GC from the whitelist." },
  { cat: "Automation", usage: "gc whitelist list",               desc: "List all whitelisted GC IDs." },
  // OSINT
  { cat: "OSINT",      usage: "username breach check <user>",    desc: "Search breach databases for a username." },
  { cat: "OSINT",      usage: "username leak check <user>",      desc: "Search leak databases for a username." },
  { cat: "OSINT",      usage: "members msgs <count>",            desc: "Show the last N messages sent in this server." },
  { cat: "OSINT",      usage: "history export <user> [count]",   desc: "Export 100–500 messages by a user from the current channel or group chat." },
  { cat: "OSINT",      usage: "osint user full dump <@user>",    desc: "Full OSINT dump on a Discord user." },
  { cat: "OSINT",      usage: "osint discord <id>",              desc: "Deep lookup on a Discord user ID (API + snowflake + breach DBs)." },
  { cat: "OSINT",      usage: "osint server full dump",          desc: "Full OSINT dump on the current server." },
  { cat: "OSINT",      usage: "osint token full dump <tok>",     desc: "Full OSINT dump on a Discord token." },
  // Find
  { cat: "Find",       usage: "ip check <addr>",                 desc: "Full IP lookup with location map." },
  { cat: "Find",       usage: "link check <url>",                desc: "Check if a URL is malicious — URLhaus DB + heuristic analysis." },
  { cat: "Find",       usage: "osint ip full report <addr>",     desc: "Comprehensive multi-source IP report with address." },
  { cat: "Find",       usage: "convert cords <coords>",          desc: "Reverse-geocode coordinates (DMS or decimal) to an address." },
  { cat: "Find",       usage: "who is <full name>",              desc: "Bio + family info via Wikidata." },
  { cat: "Find",       usage: "who lives <address>",             desc: "Public occupancy info: building type, businesses, notable figures." },
  { cat: "Find",       usage: "edr email <email>",               desc: "Full email dossier — breaches, social accounts, deliverability." },
  { cat: "Find",       usage: "edr phone <number>",              desc: "Full phone dossier — carrier, line type, fraud score, address." },
  { cat: "Find",       usage: "full report <inputs>",            desc: "Mega-report: pass IPs, phones, emails, Discord IDs, coords (comma-sep)." },
];

const CATEGORIES = ["General", "Automation", "OSINT", "Find"] as const;
const CAT_ACCENT: Record<string, string> = {
  General:    "text-cyan-400 border-cyan-400/20 bg-cyan-400/5",
  Automation: "text-yellow-400 border-yellow-400/20 bg-yellow-400/5",
  OSINT:      "text-red-400 border-red-400/20 bg-red-400/5",
  Find:       "text-violet-400 border-violet-400/20 bg-violet-400/5",
};
const CAT_ICON: Record<string, string> = {
  General:    "⚙",
  Automation: "⚡",
  OSINT:      "🔎",
  Find:       "📡",
};

function CommandsPanel({ prefix }: { prefix: string }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["General"]));

  const toggle = (cat: string) => setOpen(prev => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });

  const expandAll = () => setOpen(new Set(CATEGORIES));
  const collapseAll = () => setOpen(new Set());

  const q = search.toLowerCase().trim();
  const filtered = (cat: string) =>
    COMMANDS.filter(c => c.cat === cat && (!q || c.usage.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)));
  const totalShown = CATEGORIES.reduce((n, cat) => n + filtered(cat).length, 0);

  return (
    <div className="bg-card/70 border border-white/8 rounded-2xl overflow-hidden shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-primary flex-shrink-0" />
         <h3 className="text-sm font-semibold text-foreground">Command reference</h3>
         <span className="ml-1.5 text-[10px] text-primary/70 bg-primary/10 border border-primary/20 rounded-md px-1.5 py-0.5">{COMMANDS.length}</span>
        <div className="ml-auto flex items-center gap-1">
           <button onClick={expandAll} className="text-[10px] text-muted-foreground/60 hover:text-foreground px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">Expand</button>
           <button onClick={collapseAll} className="text-[10px] text-muted-foreground/60 hover:text-foreground px-2 py-1 rounded-lg hover:bg-white/5 transition-colors">Collapse</button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/8">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/40" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); if (e.target.value) setOpen(new Set(CATEGORIES)); }}
            placeholder="Search commands..."
            className="w-full bg-white/5 border border-white/8 rounded-md h-7 pl-7 pr-8 text-[11px] font-mono text-white placeholder:text-muted-foreground/30 outline-none focus:border-primary/40 transition-colors"
          />
          {search ? (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors">
              <X className="w-3 h-3" />
            </button>
          ) : null}
          {search && (
            <span className="absolute right-6 top-1/2 -translate-y-1/2 text-[9px] font-mono text-primary/50">{totalShown}</span>
          )}
        </div>
      </div>

      {/* Category pills */}
      {!search && (
        <div className="flex gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto">
          {CATEGORIES.map(cat => {
            const isOpen = open.has(cat);
            const count = COMMANDS.filter(c => c.cat === cat).length;
            return (
              <button
                key={cat}
                onClick={() => toggle(cat)}
                className={cn(
                  "flex items-center gap-1 h-6 px-2 rounded-md border font-mono text-[9px] font-bold whitespace-nowrap transition-all flex-shrink-0",
                  isOpen
                    ? cn(CAT_ACCENT[cat], "opacity-100")
                    : "border-white/8 text-muted-foreground/40 bg-transparent hover:border-white/15 hover:text-muted-foreground/60"
                )}
              >
                <span>{CAT_ICON[cat]}</span>
                <span>{cat}</span>
                <span className={cn("ml-0.5 opacity-60", isOpen ? "" : "")}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Commands list */}
      <div className="divide-y divide-white/5">
        {CATEGORIES.map(cat => {
          const cmds = filtered(cat);
          if (q && cmds.length === 0) return null;
          const isOpen = open.has(cat);
          const accentClasses = CAT_ACCENT[cat] || "";
          return (
            <div key={cat}>
              {/* Category header */}
              <button
                onClick={() => toggle(cat)}
                className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/3 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{CAT_ICON[cat]}</span>
                  <span className={cn("text-[10px] font-mono font-bold uppercase tracking-wider", accentClasses.split(" ")[0])}>
                    {cat}
                  </span>
                  <span className={cn(
                    "text-[9px] font-mono px-1.5 rounded border",
                    isOpen ? accentClasses : "text-muted-foreground/30 border-white/8"
                  )}>
                    {cmds.length}
                  </span>
                </div>
                <ChevronDown className={cn("w-3 h-3 text-muted-foreground/30 transition-transform duration-200", isOpen && "rotate-180")} />
              </button>

              {/* Commands */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.18, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="pb-2 pt-0.5">
                      {cmds.map((cmd, idx) => (
                        <div
                          key={cmd.usage}
                          className={cn(
                            "group px-4 py-2 hover:bg-white/4 transition-colors cursor-default",
                            idx !== cmds.length - 1 && "border-b border-white/3"
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <span className={cn(
                              "text-[9px] font-mono mt-0.5 flex-shrink-0 opacity-30 select-none",
                              accentClasses.split(" ")[0]
                            )}>›</span>
                            <div className="min-w-0 flex-1">
                              <code className={cn(
                                "text-[11px] font-mono break-all leading-snug",
                                accentClasses.split(" ")[0].replace("text-", "text-").replace("400", "300")
                              )}>
                                {prefix}{cmd.usage}
                              </code>
                              <p className="text-[10px] text-muted-foreground/50 mt-0.5 leading-snug">{cmd.desc}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 border-t border-white/5 flex items-center gap-1.5">
        <span className="text-[9px] font-mono text-muted-foreground/25">In Discord:</span>
        <code className="text-[9px] font-mono text-primary/40">{prefix}help &lt;1-5&gt;</code>
        <span className="text-[9px] font-mono text-muted-foreground/25">opens a category</span>
      </div>
    </div>
  );
}

function LogsPanel({ botId }: { botId: number }) {
  const { data } = useQuery<{ logs: Array<{ ts: number; msg: string }> }>({
    queryKey: [`/api/bots/${botId}/logs`],
    refetchInterval: 5000,
  });
  const logs = data?.logs || [];

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Error Logs</h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/40">live · {logs.length}</span>
      </div>
      <div className="max-h-48 overflow-y-auto">
        {logs.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] font-mono text-muted-foreground/30">No errors — all clear</p>
        ) : (
          <div className="divide-y divide-white/5">
            {logs.map((log, i) => (
              <div key={i} className="px-4 py-2">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[9px] font-mono text-muted-foreground/30">
                    {new Date(log.ts).toLocaleTimeString()}
                  </span>
                </div>
                <p className="text-[11px] font-mono text-red-400/80 break-all">{log.msg}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JoinServerPanel({ botId }: { botId: number }) {
  const [invite, setInvite] = useState("");
  const { toast } = useToast();

  const joinMut = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/bots/${botId}/join`, { invite: invite.trim() });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Joined!", description: `Successfully joined: ${data.guildName || "server"}` });
      setInvite("");
    },
    onError: (e: any) => {
      toast({ title: "Failed to join", description: e?.message || "Unknown error", variant: "destructive" });
    },
  });

  return (
    <Section title="Join Server" icon={<LogIn className="w-4 h-4" />}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground font-mono">Enter a Discord invite link or code to join a server with this bot account.</p>
        <div className="flex gap-2">
          <input
            value={invite}
            onChange={e => setInvite(e.target.value)}
            onKeyDown={e => e.key === "Enter" && invite.trim() && joinMut.mutate()}
            placeholder="discord.gg/abc123 or invite code"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg h-10 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-all"
            data-testid="input-join-invite"
          />
          <button
            onClick={() => joinMut.mutate()}
            disabled={!invite.trim() || joinMut.isPending}
            className="h-10 px-4 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-40 text-black text-xs font-bold font-mono flex items-center gap-1.5 transition-all"
            data-testid="button-join-server"
          >
            {joinMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5" />}
            Join
          </button>
        </div>
      </div>
    </Section>
  );
}

function BullyTargetsPanel({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [input, setInput] = useState("");

  const add = () => {
    const v = input.trim();
    if (!v || value.includes(v)) return;
    onChange([...value, v]);
    setInput("");
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground font-mono">Discord user IDs that will receive auto-bully messages.</p>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && add()}
          placeholder="Discord user ID..."
          className="flex-1 bg-white/5 border border-white/10 rounded-lg h-9 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 outline-none focus:border-primary/50 transition-all"
          data-testid="input-bully-target"
        />
        <button
          onClick={add}
          disabled={!input.trim()}
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white disabled:opacity-40 transition-all"
          data-testid="button-add-bully-target"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map(id => (
            <div key={id} className="flex items-center gap-1.5 h-7 px-2.5 rounded-md bg-red-500/10 border border-red-500/20 group">
              <span className="text-[11px] font-mono text-red-300">{id}</span>
              <button
                onClick={() => onChange(value.filter(v => v !== id))}
                className="text-red-400/40 hover:text-red-400 transition-colors"
                data-testid={`button-remove-bully-${id}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {value.length === 0 && (
        <p className="text-[11px] font-mono text-muted-foreground/30">No targets added</p>
      )}
    </div>
  );
}

export default function BotDetail() {
  const [, params] = useRoute<{ id: string }>(R.routeBot);
  const id = Number(params?.id);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: session } = useAuth();
  const { data: bot, isLoading } = useBot(id);
  const updateBot = useUpdateBot();
  const botAction = useBotAction();

  // Only the user who added this bot can edit it
  const isOwner = !!(session && bot && bot !== BOT_NOT_FOUND && bot !== BOT_ACCESS_DENIED && (bot as any).userId === session.id);

  const form = useForm({
    resolver: zodResolver(insertBotConfigSchema.omit({ id: true, lastSeen: true, token: true, userId: true } as any)),
    defaultValues: {
      name: "",
      rpcTitle: "",
      rpcSubtitle: "",
      rpcAppName: "",
      rpcImage: "",
      rpcType: "PLAYING",
      rpcStartTimestamp: "",
      rpcEndTimestamp: "",
      presenceStatus: "online",
      statusMoverWords: "",
      commandPrefix: ".",
      afkMessage: "",
      nitroSniper: false,
      isRunning: true,
      isAfk: false,
      bullyTargets: [] as string[],
      passcode: "",
      gcAllowAll: false,
      whitelistedGcs: [] as string[],
    }
  });

  useEffect(() => {
    if (bot && bot !== BOT_NOT_FOUND && bot !== BOT_ACCESS_DENIED) {
      form.reset({
        name: bot.name,
        rpcTitle: bot.rpcTitle || "",
        rpcSubtitle: bot.rpcSubtitle || "",
        rpcAppName: bot.rpcAppName || "",
        rpcImage: bot.rpcImage || "",
        rpcType: bot.rpcType || "PLAYING",
        rpcStartTimestamp: bot.rpcStartTimestamp || "",
        rpcEndTimestamp: bot.rpcEndTimestamp || "",
        presenceStatus: (bot as any).presenceStatus || "online",
        statusMoverWords: (bot as any).statusMoverWords || "",
        commandPrefix: bot.commandPrefix || ".",
        afkMessage: (bot as any).afkMessage || "",
        nitroSniper: bot.nitroSniper || false,
        isRunning: bot.isRunning || false,
        isAfk: (bot as any).isAfk || false,
        bullyTargets: ((bot.bullyTargets || []) as string[]),
        passcode: bot.passcode || "",
        gcAllowAll: bot.gcAllowAll || false,
        whitelistedGcs: ((bot.whitelistedGcs || []) as string[]),
      });
    }
  }, [bot, form]);

  const onSubmit = (data: any) => {
    updateBot.mutate({
      id,
      ...data,
      rpcStartTimestamp: data.rpcStartTimestamp ? String(data.rpcStartTimestamp) : "",
      rpcEndTimestamp: data.rpcEndTimestamp ? String(data.rpcEndTimestamp) : "",
    }, {
      onSuccess: () => toast({ title: "Saved!", description: "Bot configuration updated." }),
      onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (bot === BOT_ACCESS_DENIED) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black gap-4 p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-destructive/10 border border-destructive/30 flex items-center justify-center">
        <Lock className="w-7 h-7 text-destructive" />
      </div>
      <div>
        <h1 className="font-mono text-lg font-bold text-white mb-1">Access Denied</h1>
        <p className="text-sm text-muted-foreground font-mono">This instance belongs to another user.</p>
      </div>
      <Link href="/">
        <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-mono text-white hover:bg-white/10 transition-all">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </Link>
    </div>
  );

  if (!bot || bot === BOT_NOT_FOUND) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-black gap-4 p-6 text-center">
      <p className="text-muted-foreground font-mono">Bot not found</p>
      <Link href="/">
        <button className="flex items-center gap-2 h-9 px-4 rounded-lg bg-white/5 border border-white/10 text-sm font-mono text-white hover:bg-white/10 transition-all">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>
      </Link>
    </div>
  );

  const prefix = form.watch("commandPrefix") || ".";
  const bullyTargets = (form.watch("bullyTargets") as string[]) || [];

  return (
    <div className="ios-safe-bottom min-h-[100dvh] bg-black">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/90 backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Link href="/">
              <button className="w-9 h-9 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white flex items-center justify-center transition-all flex-shrink-0">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-white text-sm sm:text-base truncate">{bot.name}</h1>
                <span className={cn(
                  "w-2 h-2 rounded-full flex-shrink-0",
                  bot.isRunning ? "bg-primary shadow-[0_0_8px_rgba(34,197,94,0.8)]" : "bg-destructive/70"
                )} />
              </div>
              {bot.discordTag ? (
                <p className="text-xs text-primary/60 font-mono">@{bot.discordTag}</p>
              ) : (
                <p className="text-xs text-muted-foreground font-mono">ID #{bot.id.toString().padStart(4, '0')}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            {isOwner && (
              <>
                <button
                  onClick={() => botAction.mutate({ id, action: 'restart' }, {
                    onSuccess: () => { toast({ title: "Restarting…" }); qc.invalidateQueries({ queryKey: [R.apiBots, id] }); },
                    onError: (e: any) => toast({ title: "Restart failed", description: e?.message, variant: "destructive" }),
                  })}
                  disabled={botAction.isPending}
                  className="h-9 px-2 sm:px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white text-xs font-mono flex items-center gap-1.5 sm:gap-2 transition-all disabled:opacity-50"
                  data-testid="button-restart-bot"
                >
                  <RefreshCw className={cn("w-3.5 h-3.5", botAction.isPending && "animate-spin")} />
                  <span className="hidden sm:inline">Restart</span>
                </button>
                <button
                  onClick={form.handleSubmit(onSubmit)}
                  disabled={updateBot.isPending}
                  className="h-9 px-3 sm:px-4 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-black text-xs font-bold font-mono flex items-center gap-1.5 sm:gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
                  data-testid="button-save-bot"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Save Changes</span>
                  <span className="sm:hidden">Save</span>
                </button>
              </>
            )}
            {!isOwner && (
              <span className="h-9 px-3 rounded-lg border border-white/10 bg-white/5 text-muted-foreground text-xs font-mono flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> View Only
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">

            {/* Non-owner notice */}
            {!isOwner && (
              <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 text-yellow-400/80">
                <Lock className="w-4 h-4 shrink-0" />
                <p className="text-xs font-mono">This bot belongs to another user. You can view its status but cannot change any settings.</p>
              </div>
            )}

            {/* Rich Presence — owner only */}
            {isOwner && (
              <Section title="Rich Presence" icon={<Activity className="w-4 h-4" />}>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Activity Type</label>
                      <select
                        className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-3 font-mono text-sm text-white focus:border-primary/50 outline-none transition-all"
                        {...form.register("rpcType")}
                        data-testid="select-rpc-type"
                      >
                        <option value="PLAYING">PLAYING</option>
                        <option value="STREAMING">STREAMING</option>
                        <option value="LISTENING">LISTENING</option>
                        <option value="WATCHING">WATCHING</option>
                      </select>
                    </div>
                    <CyberInput label="App Name" placeholder="Application Name" {...form.register("rpcAppName")} data-testid="input-rpc-app-name" />
                  </div>
                  <CyberInput label="Title / Details" placeholder="Rich Presence Title" {...form.register("rpcTitle")} data-testid="input-rpc-title" />
                  <CyberInput label="Subtitle / State" placeholder="Rich Presence Subtitle" {...form.register("rpcSubtitle")} data-testid="input-rpc-subtitle" />
                  <CyberInput label="Large Image URL" placeholder="https://..." {...form.register("rpcImage")} data-testid="input-rpc-image" />
                   <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <CyberInput label="Start Timestamp (ms)" placeholder="1700000000000" {...form.register("rpcStartTimestamp")} />
                    <CyberInput label="End Timestamp (ms)" placeholder="1700000000000" {...form.register("rpcEndTimestamp")} />
                  </div>
                </div>
              </Section>
            )}

            {/* Bot Settings — owner only */}
            {isOwner && (
              <Section title="Bot Settings" icon={<Settings2 className="w-4 h-4" />}>
                <div className="space-y-4">
                  <CyberInput label="Command Prefix" placeholder="." {...form.register("commandPrefix")} data-testid="input-command-prefix" />

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Presence Status</label>
                      <select
                        className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-3 font-mono text-sm text-white focus:border-primary/50 outline-none transition-all"
                        {...form.register("presenceStatus")}
                        data-testid="select-presence-status"
                      >
                        <option value="online">Online</option>
                        <option value="idle">Idle</option>
                        <option value="dnd">Do Not Disturb</option>
                        <option value="invisible">Invisible</option>
                      </select>
                    </div>
                    <CyberInput
                      label="AFK Auto-Reply"
                      placeholder="Be right back..."
                      {...form.register("afkMessage")}
                      data-testid="input-afk-message"
                    />
                  </div>

                  <CyberInput
                    label="Status Mover Words (comma-separated)"
                    placeholder="coding, gaming, vibing"
                    {...form.register("statusMoverWords")}
                    data-testid="input-status-mover"
                  />
                  <p className="text-[11px] font-mono text-muted-foreground/40 -mt-2">Cycles through these words as your custom status every 5 seconds. Leave blank to disable.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center justify-between p-4 bg-white/3 rounded-lg border border-white/8">
                      <div>
                        <Label className="text-sm font-medium text-white">Nitro Sniper</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Auto-claim Nitro gifts</p>
                      </div>
                      <Switch
                        checked={form.watch("nitroSniper")}
                        onCheckedChange={(v) => form.setValue("nitroSniper", v)}
                        data-testid="switch-nitro-sniper"
                      />
                    </div>
                    <div className="flex items-center justify-between p-4 bg-white/3 rounded-lg border border-white/8">
                      <div>
                        <Label className="text-sm font-medium text-white">Allow All GCs</Label>
                        <p className="text-xs text-muted-foreground mt-0.5">Accept all group chat invites</p>
                      </div>
                      <Switch
                        checked={form.watch("gcAllowAll")}
                        onCheckedChange={(v) => form.setValue("gcAllowAll", v)}
                        data-testid="switch-gc-allow-all"
                      />
                    </div>
                  </div>
                </div>
              </Section>
            )}

            {/* Bully Targets — owner only */}
            {isOwner && (
              <Section title="Bully Targets" icon={<AlertTriangle className="w-4 h-4 text-red-400" />}>
                <BullyTargetsPanel
                  value={bullyTargets}
                  onChange={(v) => form.setValue("bullyTargets", v)}
                />
              </Section>
            )}

            {/* Join Server — owner only */}
            {isOwner && bot.isRunning && <JoinServerPanel botId={id} />}

            {/* Commands — always visible */}
            <CommandsPanel prefix={prefix} />
          </div>

          {/* Right column */}
          <div className="space-y-6">
            {/* Status */}
            <Section title="Status">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-mono">Connection</span>
                  <span className={cn(
                    "text-xs font-mono font-bold",
                    bot.isRunning ? "text-primary" : "text-destructive/80"
                  )}>
                    {bot.isRunning ? "ONLINE" : "OFFLINE"}
                  </span>
                </div>
                {bot.discordTag && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground font-mono">Account</span>
                    <span className="text-xs font-mono text-primary/80">@{bot.discordTag}</span>
                  </div>
                )}
                {bot.discordId && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground font-mono">Discord ID</span>
                    <span className="text-xs font-mono text-white/60 break-all text-right">{bot.discordId}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-mono">Bot ID</span>
                  <span className="text-xs font-mono text-white">#{bot.id}</span>
                </div>
                {isOwner && (
                  <div className="pt-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium text-white">Instance Active</Label>
                      <Switch
                        checked={form.watch("isRunning")}
                        onCheckedChange={(v) => form.setValue("isRunning", v)}
                        data-testid="switch-instance-active"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Toggle to start or stop this bot</p>
                  </div>
                )}
              </div>
            </Section>

            {/* Quick reference */}
            <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Quick Reference</h3>
              </div>
              <div className="p-5 space-y-1">
                {[
                  { cmd: "help",         label: "All commands" },
                  { cmd: "ping",         label: "Check latency" },
                  { cmd: "stopall",      label: "Stop everything" },
                  { cmd: "nitro on",     label: "Sniper on" },
                  { cmd: "afk",          label: "Toggle AFK" },
                  { cmd: "spam 5 hi",    label: "Spam 5×" },
                  { cmd: "massdm msg",   label: "DM all friends" },
                  { cmd: "snipe",        label: "Last deleted msg" },
                  { cmd: "purge 10",     label: "Delete 10 msgs" },
                  { cmd: "join <inv>",   label: "Join server" },
                  { cmd: "osint user @", label: "OSINT a user" },
                  { cmd: "full report",  label: "Full dossier" },
                ].map(({ cmd, label }) => (
                  <div key={cmd} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0 group">
                    <code className="text-xs font-mono text-primary group-hover:text-primary/80 transition-colors">
                      {prefix}{cmd}
                    </code>
                    <span className="text-xs text-muted-foreground">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live error logs */}
            <LogsPanel botId={id} />
          </div>
        </div>
      </main>
    </div>
  );
}
