import { useBots, useDeleteBot, useBotAction } from "@/hooks/use-bots";
import { TerminalCard } from "@/components/TerminalCard";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { BotStatusBadge } from "@/components/BotStatusBadge";
import { CyberButton } from "@/components/CyberButton";
import { Loader2, Settings, Power, Trash2, Cpu, Activity } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { data: bots, isLoading } = useBots();
  const deleteBot = useDeleteBot();
  const botAction = useBotAction();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
          <p className="font-mono text-primary animate-pulse">ESTABLISHING UPLINK...</p>
        </div>
      </div>
    );
  }

  const activeCount = bots?.filter(b => b.isRunning).length || 0;

  return (
    <div className="min-h-screen p-4 sm:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-primary/20 pb-6">
        <div>
          <h1 className="text-4xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-200">
            NETRUNNER_V1
          </h1>
          <p className="font-mono text-muted-foreground mt-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            SYSTEM STATUS: <span className="text-primary">OPERATIONAL</span>
          </p>
        </div>
        <CreateBotDialog />
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <TerminalCard title="Network Load" headerColor="purple">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-mono font-bold text-white">{bots?.length || 0}</p>
              <p className="text-xs text-muted-foreground uppercase">Total Nodes</p>
            </div>
            <Cpu className="w-8 h-8 text-neon-purple opacity-50" />
          </div>
        </TerminalCard>
        
        <TerminalCard title="Active Uplinks" headerColor="green">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-3xl font-mono font-bold text-white">{activeCount}</p>
              <p className="text-xs text-muted-foreground uppercase">Online</p>
            </div>
            <Activity className="w-8 h-8 text-neon-green opacity-50" />
          </div>
        </TerminalCard>

        <TerminalCard title="System Log" className="md:col-span-1">
           <div className="h-12 overflow-hidden font-mono text-xs text-muted-foreground space-y-1">
             <p className="text-primary/70">{`> Initializing dashboard components... OK`}</p>
             <p className="text-primary/70">{`> Fetching bot configurations... DONE`}</p>
             <p className="animate-pulse">{`> Awaiting user input_`}</p>
           </div>
        </TerminalCard>
      </div>

      {/* Bot List */}
      <section className="space-y-4">
        <h2 className="text-xl font-display text-white border-l-4 border-primary pl-4">Deployed Instances</h2>
        
        {bots?.length === 0 ? (
          <div className="text-center py-20 border border-dashed border-muted rounded-lg bg-card/20">
            <Cpu className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <p className="font-mono text-muted-foreground">NO INSTANCES DETECTED</p>
            <p className="text-sm text-muted-foreground/50">Deploy a new bot to begin operations</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bots?.map((bot, idx) => (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
              >
                <TerminalCard 
                  title={`ID: ${bot.id.toString().padStart(4, '0')}`} 
                  headerColor={bot.isRunning ? "green" : "red"}
                  className="h-full flex flex-col"
                >
                  <div className="flex-1 space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-bold text-white text-lg">{bot.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[200px]">
                          Token: ••••••••••••
                        </p>
                      </div>
                      <BotStatusBadge isRunning={!!bot.isRunning} isAfk={!!bot.isAfk} />
                    </div>

                    <div className="space-y-2 pt-4 border-t border-white/5">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-mono">RPC Status</span>
                        <span className="text-white font-mono">{bot.rpcType}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground font-mono">Sniper</span>
                        <span className={bot.nitroSniper ? "text-primary" : "text-muted-foreground"}>
                          {bot.nitroSniper ? "ACTIVE" : "DISABLED"}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-6 pt-4 border-t border-white/5">
                    <Link href={`/bot/${bot.id}`} className="flex-1">
                       <CyberButton variant="secondary" className="w-full text-xs h-9">
                         <Settings className="w-3 h-3 mr-2" />
                         Config
                       </CyberButton>
                    </Link>
                    
                    <button 
                      onClick={() => botAction.mutate({ 
                        id: bot.id, 
                        action: bot.isRunning ? 'stop' : 'restart' 
                      })}
                      className={cn(
                        "p-2 rounded border transition-colors",
                        bot.isRunning 
                          ? "border-destructive/30 hover:bg-destructive/20 text-destructive"
                          : "border-primary/30 hover:bg-primary/20 text-primary"
                      )}
                      title={bot.isRunning ? "Stop Instance" : "Start Instance"}
                    >
                      <Power className="w-4 h-4" />
                    </button>

                    <button 
                      onClick={() => {
                        if (confirm("Terminate this instance permanently?")) {
                          deleteBot.mutate(bot.id);
                        }
                      }}
                      className="p-2 rounded border border-muted hover:bg-destructive/20 hover:border-destructive/50 hover:text-destructive text-muted-foreground transition-colors"
                      title="Delete Instance"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </TerminalCard>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
