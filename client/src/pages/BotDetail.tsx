import { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { useBot, useUpdateBot, useBotAction } from "@/hooks/use-bots";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBotConfigSchema } from "@shared/schema";
import { CyberInput } from "@/components/CyberInput";
import { Loader2, ArrowLeft, Save, RefreshCw, Zap, Activity, Settings2, ChevronDown } from "lucide-react";
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

export default function BotDetail() {
  const [, params] = useRoute("/bot/:id");
  const id = Number(params?.id);
  const { toast } = useToast();

  const { data: bot, isLoading } = useBot(id);
  const updateBot = useUpdateBot();
  const botAction = useBotAction();

  const form = useForm({
    resolver: zodResolver(insertBotConfigSchema.omit({ id: true, lastSeen: true, token: true })),
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

            <Section title="Commands">
              <div className="space-y-1.5 font-mono text-xs text-muted-foreground">
                {[
                  ['.help', 'Show commands'],
                  ['.ping', 'Check latency'],
                  ['.rpc', 'Update status'],
                  ['.spam', 'Spam messages'],
                  ['.massdm', 'DM all users'],
                  ['.gc allow/deny', 'GC settings'],
                  ['.nitro on/off', 'Nitro sniper'],
                  ['.snipe', 'Snipe deleted msgs'],
                ].map(([cmd, desc]) => (
                  <div key={cmd} className="flex justify-between items-center py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-primary">{cmd}</span>
                    <span>{desc}</span>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        </div>
      </main>
    </div>
  );
}
