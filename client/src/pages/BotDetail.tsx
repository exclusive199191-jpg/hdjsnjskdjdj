import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { useBot, useUpdateBot, useBotAction } from "@/hooks/use-bots";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBotConfigSchema } from "@shared/schema";
import { CyberInput } from "@/components/CyberInput";
import { Loader2, ArrowLeft, Save, RefreshCw, Activity, Settings2, Terminal, ChevronRight } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

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
  // General
  { cat: "General", name: "help", usage: "help [page]", desc: "Show the command list. Use a page number to navigate categories." },
  { cat: "General", name: "ping", usage: "ping", desc: "Check the bot's current latency to Discord in milliseconds." },
  { cat: "General", name: "prefix", usage: "prefix set <new>", desc: "Change the command prefix. e.g. prefix set ! changes it to !." },
  { cat: "General", name: "stopall", usage: "stopall", desc: "Stop all running modules — spam, flood, bully loop, and rich presence." },
  { cat: "General", name: "server", usage: "server info", desc: "Display current server info: name, ID, owner, member count, creation date." },
  { cat: "General", name: "user", usage: "user info <@user>", desc: "Display user info: tag, ID, display name, account age, and badges." },
  // Fun / Tools
  { cat: "Fun/Tools", name: "bully", usage: "bully <@user>", desc: "Spam random insults at the mentioned user every 100ms." },
  { cat: "Fun/Tools", name: "bully off", usage: "bully off", desc: "Stop the active bully loop." },
  { cat: "Fun/Tools", name: "autoreact", usage: "autoreact <@user> <emoji>", desc: "Auto-react with an emoji to every message from the mentioned user." },
  { cat: "Fun/Tools", name: "react all", usage: "react all", desc: "Reply to a message then run this to react with 26+ different emojis." },
  { cat: "Fun/Tools", name: "pfp", usage: "pfp <@user>", desc: "Fetch and display the full-size profile picture URL of any user." },
  { cat: "Fun/Tools", name: "banner", usage: "banner <@user>", desc: "Fetch and display the full-size banner URL of any user (if they have one)." },
  // Automation
  { cat: "Automation", name: "spam", usage: "spam <count> <msg>", desc: "Send a message a specified number of times as fast as possible." },
  { cat: "Automation", name: "flood", usage: "flood <message>", desc: "Continuously send a message in the channel until spamstop is used." },
  { cat: "Automation", name: "spamstop", usage: "spamstop", desc: "Immediately stop any active spam or flood loop." },
  { cat: "Automation", name: "nitro on", usage: "nitro on", desc: "Enable the Nitro sniper — auto-claims any Nitro gift links." },
  { cat: "Automation", name: "nitro off", usage: "nitro off", desc: "Disable the Nitro sniper." },
  { cat: "Automation", name: "afk", usage: "afk [reason]", desc: "Toggle AFK mode on or off. Provide an optional reason shown when toggled on." },
  // Management
  { cat: "Management", name: "gc allow", usage: "gc allow", desc: "Allow all incoming group chat invites — bot will no longer leave GCs." },
  { cat: "Management", name: "gc deny", usage: "gc deny", desc: "Deny all incoming group chat invites — bot will leave any new GC." },
  { cat: "Management", name: "gc trap", usage: "gc trap <@user>", desc: "Trap a user in the current GC. If they leave, the bot re-invites them." },
  { cat: "Management", name: "gc whitelist", usage: "gc whitelist [ID]", desc: "Toggle a GC on the whitelist so it's never auto-left. Omit ID to use current GC." },
  { cat: "Management", name: "massdm", usage: "massdm <message>", desc: "Send a message to all friends and existing DM contacts as fast as possible." },
  { cat: "Management", name: "closealldms", usage: "closealldms", desc: "Close all open DM channels (does not affect group chats)." },
  { cat: "Management", name: "purge", usage: "purge <count>", desc: "Delete your last N messages in the current channel." },
  { cat: "Management", name: "host", usage: "host <token>", desc: "Validate and host a new Discord account. The token is verified before adding." },
  // OSINT
  { cat: "OSINT", name: "ip check", usage: "ip check <ip>", desc: "Look up location, ISP, and coordinates for any IP address." },
  { cat: "OSINT", name: "snipe", usage: "snipe", desc: "Show the most recently deleted message in the current channel." },
  { cat: "OSINT", name: "link check", usage: "link check <url>", desc: "Check whether a URL is safe or flagged as a phishing / token grabber link." },
];

const CATEGORIES = ["General", "Fun/Tools", "Automation", "Management", "OSINT"] as const;
const CAT_COLORS: Record<string, string> = {
  General: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  "Fun/Tools": "text-purple-400 bg-purple-400/10 border-purple-400/20",
  Automation: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  Management: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  OSINT: "text-red-400 bg-red-400/10 border-red-400/20",
};

function CommandsPanel({ prefix }: { prefix: string }) {
  const [activeTab, setActiveTab] = useState<string>("General");
  const filtered = COMMANDS.filter(c => c.cat === activeTab);

  return (
    <div className="bg-white/3 border border-white/8 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-white/8 flex items-center gap-2">
        <Terminal className="w-4 h-4 text-primary" />
        <h3 className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Command Reference</h3>
        <span className="ml-auto font-mono text-[10px] text-muted-foreground/50 bg-white/5 px-2 py-0.5 rounded">
          {COMMANDS.length} commands
        </span>
      </div>

      {/* Category tabs */}
      <div className="flex overflow-x-auto border-b border-white/8 scrollbar-none">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveTab(cat)}
            className={cn(
              "flex-shrink-0 px-4 py-2.5 font-mono text-[10px] uppercase tracking-widest transition-all whitespace-nowrap",
              activeTab === cat
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground hover:text-white"
            )}
          >
            {cat}
            <span className={cn(
              "ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold border",
              activeTab === cat ? "text-primary bg-primary/10 border-primary/20" : "text-muted-foreground/50 bg-white/3 border-white/10"
            )}>
              {COMMANDS.filter(c => c.cat === cat).length}
            </span>
          </button>
        ))}
      </div>

      {/* Commands list */}
      <div className="divide-y divide-white/5">
        {filtered.map((cmd, i) => (
          <motion.div
            key={cmd.name}
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className="flex items-start gap-3 px-5 py-3 hover:bg-white/3 transition-colors group"
          >
            <ChevronRight className="w-3 h-3 text-primary/40 mt-0.5 flex-shrink-0 group-hover:text-primary transition-colors" />
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <code className="text-xs font-mono font-bold text-primary">
                  {prefix}{cmd.usage}
                </code>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">{cmd.desc}</p>
            </div>
            <span className={cn(
              "flex-shrink-0 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border hidden sm:inline-flex",
              CAT_COLORS[cmd.cat]
            )}>
              {cmd.cat}
            </span>
          </motion.div>
        ))}
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
    resolver: zodResolver(insertBotConfigSchema.omit({ id: true, lastSeen: true, token: true } as any)),
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
        bullyTargets: bot.bullyTargets || [],
        passcode: bot.passcode || "",
        gcAllowAll: bot.gcAllowAll || false,
        whitelistedGcs: bot.whitelistedGcs || [],
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
