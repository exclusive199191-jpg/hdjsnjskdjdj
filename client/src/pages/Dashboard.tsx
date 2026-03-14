import { useBots, useDeleteBot, useBotAction } from "@/hooks/use-bots";
import { useAuth, useLogout } from "@/hooks/use-auth";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { BotStatusBadge } from "@/components/BotStatusBadge";
import { Loader2, Settings, Power, Trash2, Cpu, Activity, Search, LogOut, Zap, Plus, Bot } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";

export default function Dashboard() {
  const { data: user } = useAuth();
  const logout = useLogout();
  const { data: bots, isLoading } = useBots();
  const deleteBot = useDeleteBot();
  const botAction = useBotAction();
  const [search, setSearch] = React.useState("");

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="text-center space-y-3">
          <Loader2 className="w-10 h-10 text-primary animate-spin mx-auto" />
          <p className="font-mono text-primary/60 text-xs animate-pulse">LOADING INSTANCES...</p>
        </div>
      </div>
    );
  }

  const filteredBots = bots?.filter(b =>
    b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.id.toString().includes(search)
  );

  const activeCount = bots?.filter(b => b.isRunning).length || 0;

  return (
    <div className="min-h-screen bg-black">
      {/* Top nav */}
      <header className="sticky top-0 z-50 border-b border-white/5 bg-black/90 backdrop-blur-xl px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display font-black text-lg tracking-tight text-white">NETRUNNER</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
              <span className="w-2 h-2 rounded-full bg-primary shadow-[0_0_6px_rgba(34,197,94,0.8)] animate-pulse" />
              <span className="font-mono text-xs text-muted-foreground">{user?.username}</span>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-white/20 transition-colors text-xs font-mono"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-black text-white tracking-tight">
              Your Instances
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Manage your selfbot connections and RPC settings
            </p>
          </div>
          <CreateBotDialog />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="bg-white/3 border border-white/8 rounded-xl p-5">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Total Bots</p>
            <p className="text-3xl font-bold text-white mt-1">{bots?.length || 0}</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-xl p-5">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Online</p>
            <p className="text-3xl font-bold text-primary mt-1">{activeCount}</p>
          </div>
          <div className="hidden sm:block bg-white/3 border border-white/8 rounded-xl p-5">
            <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Offline</p>
            <p className="text-3xl font-bold text-destructive/80 mt-1">{(bots?.length || 0) - activeCount}</p>
          </div>
        </div>

        {/* Search */}
        {(bots?.length || 0) > 0 && (
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search bots..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg h-10 pl-10 pr-4 font-mono text-sm text-white placeholder:text-muted-foreground focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
          </div>
        )}

        {/* Bot grid */}
        {!bots?.length ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-24 border border-dashed border-white/10 rounded-2xl text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Bot className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-white">No bots deployed yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first Discord selfbot token to get started</p>
            </div>
            <CreateBotDialog />
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBots?.map((bot, idx) => (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
              >
                <div className="group relative bg-white/3 hover:bg-white/5 border border-white/8 hover:border-primary/20 rounded-xl p-5 transition-all duration-200 flex flex-col h-full">
                  {/* Online indicator */}
                  <div className="absolute top-4 right-4">
                    <BotStatusBadge isRunning={!!bot.isRunning} isAfk={false} />
                  </div>

                  <div className="flex-1 space-y-4">
                    <div className="pr-20">
                      <h3 className="font-bold text-white text-base truncate">{bot.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">ID #{bot.id.toString().padStart(4, '0')}</p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-mono">Activity</span>
                        <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">{bot.rpcType || 'PLAYING'}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-mono">Sniper</span>
                        <span className={cn("font-mono", bot.nitroSniper ? "text-primary" : "text-muted-foreground/50")}>
                          {bot.nitroSniper ? "ON" : "OFF"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-muted-foreground font-mono">Prefix</span>
                        <span className="text-white font-mono bg-white/5 px-2 py-0.5 rounded">{bot.commandPrefix || '.'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5 pt-4 border-t border-white/5">
                    <Link href={`/bot/${bot.id}`} className="flex-1">
                      <button className="w-full h-9 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg text-xs font-mono text-white transition-all flex items-center justify-center gap-1.5">
                        <Settings className="w-3.5 h-3.5" />
                        Configure
                      </button>
                    </Link>

                    <button
                      onClick={() => botAction.mutate({ id: bot.id, action: bot.isRunning ? 'stop' : 'restart' })}
                      title={bot.isRunning ? "Stop" : "Start"}
                      className={cn(
                        "w-9 h-9 rounded-lg border flex items-center justify-center transition-all",
                        bot.isRunning
                          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/15 text-destructive"
                          : "border-primary/20 bg-primary/5 hover:bg-primary/15 text-primary"
                      )}
                    >
                      <Power className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => { if (confirm("Delete this bot?")) deleteBot.mutate(bot.id); }}
                      title="Delete"
                      className="w-9 h-9 rounded-lg border border-white/8 bg-white/3 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-muted-foreground flex items-center justify-center transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
