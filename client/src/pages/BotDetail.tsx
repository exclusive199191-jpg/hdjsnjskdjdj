import { useEffect } from "react";
import { useRoute, Link } from "wouter";
import { useBot, useUpdateBot, useBotAction } from "@/hooks/use-bots";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertBotConfigSchema } from "@shared/schema";
import { TerminalCard } from "@/components/TerminalCard";
import { CyberButton } from "@/components/CyberButton";
import { CyberInput } from "@/components/CyberInput";
import { Loader2, ArrowLeft, Save, RefreshCw, Zap, Shield, Skull, Monitor } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export default function BotDetail() {
  const [, params] = useRoute("/bot/:id");
  const id = Number(params?.id);
  
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
      bullyTargets: []
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
        bullyTargets: bot.bullyTargets || []
      });
    }
  }, [bot, form]);

  const onSubmit = (data: any) => {
    // Convert timestamps to string to match schema
    // and handle potential numeric input from UI
    const submissionData = {
      ...data,
      rpcStartTimestamp: data.rpcStartTimestamp ? String(data.rpcStartTimestamp) : "",
      rpcEndTimestamp: data.rpcEndTimestamp ? String(data.rpcEndTimestamp) : "",
    };
    updateBot.mutate({ id, ...submissionData });
  };

  if (isLoading) {
     return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
      </div>
    );
  }

  if (!bot) return <div>Bot not found</div>;

  return (
    <div className="min-h-screen p-4 sm:p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/">
            <a className="p-2 border border-primary/20 rounded hover:bg-primary/10 text-primary transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </a>
          </Link>
          <div>
             <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
               {bot.name}
               <span className={`inline-block w-2 h-2 rounded-full ${bot.isRunning ? 'bg-primary shadow-[0_0_10px_#22c55e]' : 'bg-destructive shadow-[0_0_10px_#ef4444]'}`} />
             </h1>
          </div>
        </div>
        
        <div className="flex gap-2">
           <CyberButton variant="secondary" onClick={() => botAction.mutate({ id, action: 'restart' })} disabled={botAction.isPending}>
             <RefreshCw className={`w-4 h-4 mr-2 ${botAction.isPending ? 'animate-spin' : ''}`} />
             Reboot System
           </CyberButton>
           <CyberButton onClick={form.handleSubmit(onSubmit)} isLoading={updateBot.isPending}>
             <Save className="w-4 h-4 mr-2" />
             Save Config
           </CyberButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <TerminalCard title="Rich Presence Configuration" headerColor="purple">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-mono uppercase text-muted-foreground">Activity Type</Label>
                  <select className="w-full bg-background border border-input h-12 px-4 font-mono text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none" {...form.register("rpcType")}>
                    <option value="PLAYING">PLAYING</option>
                    <option value="STREAMING">STREAMING</option>
                    <option value="LISTENING">LISTENING</option>
                    <option value="WATCHING">WATCHING</option>
                  </select>
                </div>
                <CyberInput label="App Name" placeholder="Application Name" {...form.register("rpcAppName")} />
              </div>
              <CyberInput label="Main Title" placeholder="Rich Presence Title" {...form.register("rpcTitle")} />
              <CyberInput label="Subtitle (State)" placeholder="Rich Presence Subtitle" {...form.register("rpcSubtitle")} />
              <CyberInput label="Large Image URL" placeholder="https://..." {...form.register("rpcImage")} />
              <div className="grid grid-cols-2 gap-4">
                <CyberInput label="Start Timestamp (ms)" placeholder="1700000000000" {...form.register("rpcStartTimestamp")} />
                <CyberInput label="End Timestamp (ms)" placeholder="1700000000000" {...form.register("rpcEndTimestamp")} />
              </div>
            </div>
          </TerminalCard>

          <TerminalCard title="Command Configuration" headerColor="blue">
            <div className="space-y-4">
              <CyberInput label="Command Prefix" placeholder="." {...form.register("commandPrefix")} />
            </div>
          </TerminalCard>
        </div>

        <div className="space-y-6">
          <TerminalCard title="System Override" headerColor="red">
             <div className="space-y-4">
                <div className="p-4 border border-destructive/20 bg-destructive/5 rounded space-y-2">
                   <div className="flex items-center gap-2 text-destructive font-bold text-sm uppercase">
                     <Skull className="w-4 h-4" />
                     Bully Mode
                   </div>
                   <CyberInput label="Target IDs" placeholder="123456789" {...form.register("bullyTargets")} />
                </div>
             </div>
          </TerminalCard>
        </div>
      </div>
    </div>
  );
}
