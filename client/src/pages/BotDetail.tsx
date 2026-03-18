import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { useBot, useUpdateBot, useBotAction } from "@/hooks/use-bots";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBotConfigSchema } from "@shared/schema";
import { CyberInput } from "@/components/CyberInput";
import { Loader2, ArrowLeft, Save, RefreshCw, Activity, Settings2, Terminal, ChevronRight, ChevronDown, Search } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function Section({ title, children, icon }: { title: string; children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
        {icon && <span className="text-primary">{icon}</span>}
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const COMMANDS = [
  { cat: "General",    usage: "uptime",                  desc: "How long the bot has been running." },
  { cat: "General",    usage: "ping",                    desc: "Check Discord latency." },
  { cat: "General",    usage: "time",                    desc: "Current local + UTC time." },
  { cat: "General",    usage: "coin",                    desc: "Flip a coin." },
  { cat: "General",    usage: "roll <sides>",            desc: "Roll a die (default d6)." },
  { cat: "General",    usage: "8ball <question>",        desc: "Magic 8-ball answer." },
  { cat: "General",    usage: "rps <r/p/s>",             desc: "Rock paper scissors." },
  { cat: "General",    usage: "choose <a,b,...>",        desc: "Pick a random option." },
  { cat: "General",    usage: "fact",                    desc: "Random useless fact." },
  { cat: "General",    usage: "joke",                    desc: "Random one-liner joke." },
  { cat: "General",    usage: "snowflake <id>",          desc: "Decode a Discord snowflake ID." },
  { cat: "General",    usage: "creationdate <id>",       desc: "Creation date from snowflake." },
  { cat: "General",    usage: "server info",             desc: "Server name, ID, owner, members." },
  { cat: "General",    usage: "user info <@user>",       desc: "User tag, ID, badges, age." },
  { cat: "General",    usage: "prefix set <new>",        desc: "Change the command prefix." },
  { cat: "General",    usage: "stopall",                 desc: "Stop all active modules." },
  { cat: "Fun/Tools",  usage: "echo <text>",             desc: "Repeat text back." },
  { cat: "Fun/Tools",  usage: "mock <@user>",             desc: "Mock that user's last message in AlTeRnAtInG CaSe." },
  { cat: "Fun/Tools",  usage: "mock <text>",             desc: "AlTeRnAtInG CaSe on custom text." },
  { cat: "Fun/Tools",  usage: "owo <text>",              desc: "Convert to owo furry style." },
  { cat: "Fun/Tools",  usage: "clap <text>",             desc: "Add 👏 between words." },
  { cat: "Fun/Tools",  usage: "flip <text>",             desc: "Flip text upside down." },
  { cat: "Fun/Tools",  usage: "zalgo <text>",            desc: "Z̶a̸l̷g̶o̸ corrupt text." },
  { cat: "Fun/Tools",  usage: "ship <@u1> <@u2>",        desc: "Fake ship percentage." },
  { cat: "Fun/Tools",  usage: "gayrate <@user>",         desc: "Random gay % (joke)." },
  { cat: "Fun/Tools",  usage: "simprate <@user>",        desc: "Random simp % (joke)." },
  { cat: "Fun/Tools",  usage: "roast <@user>",           desc: "Send a brutal roast." },
  { cat: "Fun/Tools",  usage: "compliment <@user>",      desc: "Sarcastic compliment." },
  { cat: "Fun/Tools",  usage: "pickup <@user>",          desc: "Cringe pickup line." },
  { cat: "Fun/Tools",  usage: "truth",                   desc: "Random truth question." },
  { cat: "Fun/Tools",  usage: "dare <@user>",            desc: "Random dare suggestion." },
  { cat: "Fun/Tools",  usage: "wouldyourather <a> or <b>",desc:"Would you rather prompt." },
  { cat: "Fun/Tools",  usage: "pfp <@user>",             desc: "Full-size profile picture URL." },
  { cat: "Fun/Tools",  usage: "banner <@user>",          desc: "Full-size banner URL." },
  { cat: "Fun/Tools",  usage: "react all",               desc: "React with 26+ emojis (reply first)." },
  { cat: "Fun/Tools",  usage: "autoreact <@user> <emoji>",desc:"Auto-react to user's messages." },
  { cat: "Fun/Tools",  usage: "bully <@user>",           desc: "Spam insults at user every 100ms." },
  { cat: "Fun/Tools",  usage: "bully off",               desc: "Stop the bully loop." },
  { cat: "Automation", usage: "spam <count> <msg>",      desc: "Send message N times." },
  { cat: "Automation", usage: "flood <message>",         desc: "Continuously send until spamstop." },
  { cat: "Automation", usage: "spamstop",                desc: "Stop all spam/flood loops." },
  { cat: "Automation", usage: "nitro on",                desc: "Enable Nitro sniper." },
  { cat: "Automation", usage: "nitro off",               desc: "Disable Nitro sniper." },
  { cat: "Automation", usage: "afk [reason]",            desc: "Toggle AFK mode on/off." },
  { cat: "Management", usage: "massdm <message>",        desc: "DM all friends and contacts." },
  { cat: "Management", usage: "closealldms",             desc: "Close all DM channels." },
  { cat: "Management", usage: "purge <count>",           desc: "Delete your last N messages." },
  { cat: "Management", usage: "gc allow",                desc: "Allow all group chat invites." },
  { cat: "Management", usage: "gc deny",                 desc: "Deny all group chat invites." },
  { cat: "Management", usage: "gc trap <@user>",         desc: "Re-invite user if they leave." },
  { cat: "Management", usage: "gc whitelist [ID]",       desc: "Whitelist a GC from auto-leave." },
  { cat: "Management", usage: "host <token>",            desc: "Host a new Discord account." },
  { cat: "Management", usage: "joinvc <channel_id>",     desc: "Join a voice channel and farm stats." },
  { cat: "Management", usage: "leavevc",                 desc: "Leave the current voice channel." },
  { cat: "OSINT",      usage: "snipe",                   desc: "Show last deleted message." },
  { cat: "OSINT",      usage: "ip check <ip>",           desc: "IP location, ISP, coordinates." },
  { cat: "OSINT",      usage: "link check <url>",        desc: "Check if URL is a phishing link." },
];

const CATEGORIES = ["General", "Fun/Tools", "Automation", "Management", "OSINT"] as const;
const CAT_ACCENT: Record<string, string> = {
  General:    "text-blue-400 border-blue-400/20",
  "Fun/Tools":"text-purple-400 border-purple-400/20",
  Automation: "text-yellow-400 border-yellow-400/20",
  Management: "text-orange-400 border-orange-400/20",
  OSINT:      "text-red-400 border-red-400/20",
};

function CommandsPanel({ prefix }: { prefix: string }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["General"]));

  const toggle = (cat: string) => setOpen(prev => {
    const next = new Set(prev);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    return next;
  });

  const q = search.toLowerCase().trim();
  const filtered = (cat: string) =>
    COMMANDS.filter(c => c.cat === cat && (!q || c.usage.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q)));
  const totalShown = CATEGORIES.reduce((n, cat) => n + filtered(cat).length, 0);

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
        <Terminal className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <h3 className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">Commands</h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/40">{COMMANDS.length} total</span>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-white/8">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setOpen(new Set(CATEGORIES)); }}
            placeholder="Search commands..."
            className="w-full bg-white/5 border border-white/8 rounded-md h-7 pl-7 pr-3 text-[11px] font-mono text-white placeholder:text-muted-foreground/40 outline-none focus:border-primary/40 transition-colors"
          />
          {search && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] text-muted-foreground/40">{totalShown}</span>}
        </div>
      </div>

      {/* Accordion */}
      <div className="divide-y divide-white/5">
        {CATEGORIES.map(cat => {
          const cmds = filtered(cat);
          if (q && cmds.length === 0) return null;
          const isOpen = open.has(cat);
          return (
            <div key={cat}>
              <button
                onClick={() => toggle(cat)}
                className="w-full flex items-center justify-between px-4 py-2 hover:bg-white/3 transition-colors group"
              >
                <div className="flex items-center gap-2">
                  <span className={cn("text-[10px] font-mono font-bold uppercase tracking-wider", CAT_ACCENT[cat])}>{cat}</span>
                  <span className="text-[9px] text-muted-foreground/40 font-mono">{cmds.length}</span>
                </div>
                <ChevronDown className={cn("w-3 h-3 text-muted-foreground/40 transition-transform", isOpen && "rotate-180")} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="pb-1">
                      {cmds.map(cmd => (
                        <div
                          key={cmd.usage}
                          className="flex items-baseline justify-between gap-2 px-4 py-1 hover:bg-white/3 transition-colors"
                        >
                          <code className="text-[11px] font-mono text-primary flex-shrink-0 whitespace-nowrap">
                            {prefix}{cmd.usage}
                          </code>
                          <span className="text-[10px] text-muted-foreground/60 text-right truncate">{cmd.desc}</span>
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
    </div>
  );
}

export default function BotDetail() {
  const [, params] = useRoute("/bot/:id");
  const id = Number(params?.id);
  const { toast } = useToast();

  const { data: bot, isLoading } = useBot(id);
  const updateBot = useUpdateBot();
  const botAction = useBotAction();

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
      commandPrefix: ".",
      nitroSniper: false,
      isRunning: true,
      bullyTargets: [],
      passcode: "",
      gcAllowAll: false,
      whitelistedGcs: [],
    }
  });

  useEffect(() => {
    if (bot) {
      form.reset({
        name: bot.name,
        rpcTitle: bot.rpcTitle || "",
        rpcSubtitle: bot.rpcSubtitle || "",
        rpcAppName: bot.rpcAppName || "",
        rpcImage: bot.rpcImage || "",
        rpcType: bot.rpcType || "PLAYING",
        rpcStartTimestamp: bot.rpcStartTimestamp || "",
        rpcEndTimestamp: bot.rpcEndTimestamp || "",
        commandPrefix: bot.commandPrefix || ".",
        nitroSniper: bot.nitroSniper || false,
        isRunning: bot.isRunning || false,
        bullyTargets: (bot.bullyTargets as string[]) || [],
        passcode: bot.passcode || "",
        gcAllowAll: bot.gcAllowAll || false,
        whitelistedGcs: (bot.whitelistedGcs as string[]) || [],
      });
    }
  }, [bot, form]);

  const onSubmit = (data: any) => {
    const { passcode: _p, ...rest } = data;
    updateBot.mutate({
      id,
      ...rest,
      rpcStartTimestamp: data.rpcStartTimestamp ? String(data.rpcStartTimestamp) : "",
      rpcEndTimestamp: data.rpcEndTimestamp ? String(data.rpcEndTimestamp) : "",
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
    );
  }

  if (!bot) return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <p className="text-muted-foreground font-mono">Bot not found</p>
    </div>
  );

  const prefix = form.watch("commandPrefix") || ".";

  return (
    <div className="min-h-screen bg-black">
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
              <p className="text-xs text-muted-foreground font-mono">ID #{bot.id.toString().padStart(4, '0')}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
            <button
              onClick={() => botAction.mutate({ id, action: 'restart' })}
              disabled={botAction.isPending}
              className="h-9 px-2 sm:px-4 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-white text-xs font-mono flex items-center gap-1.5 sm:gap-2 transition-all disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", botAction.isPending && "animate-spin")} />
              <span className="hidden sm:inline">Restart</span>
            </button>
            <button
              onClick={form.handleSubmit(onSubmit)}
              disabled={updateBot.isPending}
              className="h-9 px-3 sm:px-4 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-black text-xs font-bold font-mono flex items-center gap-1.5 sm:gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              <Save className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Save Changes</span>
              <span className="sm:hidden">Save</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left column */}
          <div className="lg:col-span-2 space-y-6">
            <Section title="Rich Presence" icon={<Activity className="w-4 h-4" />}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Activity Type</label>
                    <select
                      className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-3 font-mono text-sm text-white focus:border-primary/50 outline-none transition-all"
                      {...form.register("rpcType")}
                    >
                      <option value="PLAYING">PLAYING</option>
                      <option value="STREAMING">STREAMING</option>
                      <option value="LISTENING">LISTENING</option>
                      <option value="WATCHING">WATCHING</option>
                    </select>
                  </div>
                  <CyberInput label="App Name" placeholder="Application Name" {...form.register("rpcAppName")} />
                </div>
                <CyberInput label="Title / Details" placeholder="Rich Presence Title" {...form.register("rpcTitle")} />
                <CyberInput label="Subtitle / State" placeholder="Rich Presence Subtitle" {...form.register("rpcSubtitle")} />
                <CyberInput label="Large Image URL" placeholder="https://..." {...form.register("rpcImage")} />
                <div className="grid grid-cols-2 gap-4">
                  <CyberInput label="Start Timestamp (ms)" placeholder="1700000000000" {...form.register("rpcStartTimestamp")} />
                  <CyberInput label="End Timestamp (ms)" placeholder="1700000000000" {...form.register("rpcEndTimestamp")} />
                </div>
              </div>
            </Section>

            <Section title="Bot Settings" icon={<Settings2 className="w-4 h-4" />}>
              <div className="space-y-4">
                <CyberInput label="Command Prefix" placeholder="." {...form.register("commandPrefix")} />
                <div className="flex items-center justify-between p-4 bg-white/3 rounded-lg border border-white/8">
                  <div>
                    <Label className="text-sm font-medium text-white">Nitro Sniper</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">Auto-claim Nitro gifts</p>
                  </div>
                  <Switch
                    checked={form.watch("nitroSniper")}
                    onCheckedChange={(v) => form.setValue("nitroSniper", v)}
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
                  />
                </div>
              </div>
            </Section>

            {/* Full command reference */}
            <CommandsPanel prefix={prefix} />
          </div>

          {/* Right column */}
          <div className="space-y-6">
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
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground font-mono">Bot ID</span>
                  <span className="text-xs font-mono text-white">#{bot.id}</span>
                </div>
                <div className="pt-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-white">Instance Active</Label>
                    <Switch
                      checked={form.watch("isRunning")}
                      onCheckedChange={(v) => form.setValue("isRunning", v)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Toggle to start or stop this bot</p>
                </div>
              </div>
            </Section>

            {/* Quick reference card */}
            <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-white/8">
                <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Quick Reference</h3>
              </div>
              <div className="p-5 space-y-1">
                {[
                  { cmd: "help", label: "All commands" },
                  { cmd: "ping", label: "Check latency" },
                  { cmd: "stopall", label: "Stop everything" },
                  { cmd: "nitro on", label: "Sniper on" },
                  { cmd: "spam 5 hi", label: "Spam 5x" },
                  { cmd: "massdm msg", label: "DM all friends" },
                  { cmd: "snipe", label: "Last deleted msg" },
                  { cmd: "purge 10", label: "Delete 10 msgs" },
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
          </div>
        </div>
      </main>
    </div>
  );
}
