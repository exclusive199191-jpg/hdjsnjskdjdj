import { useBots, useDeleteBot, useBotAction } from "@/hooks/use-bots";
import { CreateBotDialog } from "@/components/CreateBotDialog";
import { BotStatusBadge } from "@/components/BotStatusBadge";
import { Loader2, Settings, Power, Trash2, Search, Zap, Bot, Shield, X, Users, Terminal, RefreshCw, WifiOff } from "lucide-react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import React from "react";
import { useToast } from "@/hooks/use-toast";

interface AdminUser {
  id: number;
  username: string;
  createdAt: string | null;
  botCount: number;
}

interface AdminData {
  users: AdminUser[];
  totalBots: number;
}

interface LiveBotInfo {
  id: number;
  name: string;
  discordTag: string;
  discordId: string;
  isConnected: boolean;
  isRunning: boolean;
  lastSeen: string | null;
}

function AdminPanel({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [step, setStep] = React.useState<"login" | "data">("login");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [actionLoading, setActionLoading] = React.useState<string | null>(null);
  const [adminData, setAdminData] = React.useState<AdminData | null>(null);
  const [liveBots, setLiveBots] = React.useState<LiveBotInfo[]>([]);
  const [activeTab, setActiveTab] = React.useState<"bots" | "users">("bots");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        toast({ title: "Access Denied", description: "Invalid credentials", variant: "destructive" });
        setLoading(false);
        return;
      }
      const [dataRes, botsRes] = await Promise.all([
        fetch("/api/admin/data"),
        fetch("/api/admin/bots"),
      ]);
      const data: AdminData = await dataRes.json();
      const bots: LiveBotInfo[] = await botsRes.json();
      setAdminData(data);
      setLiveBots(bots);
      setStep("data");
    } catch {
      toast({ title: "Error", description: "Connection failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const refreshBots = async () => {
    const [botsRes, dataRes] = await Promise.all([
      fetch("/api/admin/bots"),
      fetch("/api/admin/data"),
    ]);
    if (botsRes.ok) setLiveBots(await botsRes.json());
    if (dataRes.ok) setAdminData(await dataRes.json());
  };

  const disconnectAll = async () => {
    if (!confirm("Disconnect ALL bots? This will stop every running account.")) return;
    setActionLoading("disconnect-all");
    try {
      const res = await fetch("/api/admin/bots/disconnect-all", { method: "POST" });
      const data = await res.json();
      toast({ title: "Disconnected", description: `Stopped ${data.stopped} bot(s).` });
      await refreshBots();
    } catch {
      toast({ title: "Error", description: "Failed to disconnect all", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const deleteBot = async (id: number, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setActionLoading(`delete-${id}`);
    try {
      await fetch(`/api/admin/bots/${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: `${name} has been removed.` });
      await refreshBots();
    } catch {
      toast({ title: "Error", description: "Failed to delete bot", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const connectedCount = liveBots.filter(b => b.isConnected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
      <div className="relative w-full sm:max-w-2xl bg-[#0a0a0a] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-[0_0_60px_rgba(34,197,94,0.08)] flex flex-col max-h-[92vh] sm:max-h-[85vh]">

        {/* Header — fixed */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-white/8 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="font-mono text-sm font-bold text-white tracking-widest uppercase">Admin Panel</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-white/10 hover:border-white/20 flex items-center justify-center text-muted-foreground hover:text-white transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {step === "login" ? (
            <form onSubmit={handleLogin} className="p-4 sm:p-6 space-y-4">
              <p className="text-xs text-muted-foreground font-mono">AUTHENTICATION REQUIRED</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-4 font-mono text-sm text-white placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                    placeholder="Enter username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="font-mono text-xs uppercase text-muted-foreground tracking-wider">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg h-11 px-4 font-mono text-sm text-white placeholder:text-muted-foreground/50 focus:border-primary/50 focus:ring-1 focus:ring-primary/20 outline-none transition-all"
                    placeholder="Enter password"
                    required
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-black text-sm font-bold font-mono flex items-center justify-center gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "AUTHENTICATE"}
              </button>
            </form>
          ) : (
            <div className="p-4 sm:p-6 space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                  <p className="text-[10px] sm:text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Users className="w-3 h-3" /> Users</p>
                  <p className="text-xl sm:text-2xl font-bold text-white mt-1">{adminData?.users.length || 0}</p>
                </div>
                <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                  <p className="text-[10px] sm:text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Terminal className="w-3 h-3" /> Total</p>
                  <p className="text-xl sm:text-2xl font-bold text-primary mt-1">{liveBots.length}</p>
                </div>
                <div className="bg-white/3 border border-white/8 rounded-xl p-3">
                  <p className="text-[10px] sm:text-xs font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1"><Bot className="w-3 h-3" /> Live</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-400 mt-1">{connectedCount}</p>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <button
                  onClick={disconnectAll}
                  disabled={actionLoading === "disconnect-all" || connectedCount === 0}
                  className="flex-1 h-9 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 disabled:opacity-40 text-xs font-mono font-bold flex items-center justify-center gap-1.5 transition-all"
                >
                  {actionLoading === "disconnect-all"
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <WifiOff className="w-3.5 h-3.5" />}
                  DISCONNECT ALL
                </button>
                <button
                  onClick={refreshBots}
                  className="w-9 h-9 rounded-lg bg-white/3 border border-white/8 text-muted-foreground hover:text-white flex items-center justify-center transition-all flex-shrink-0"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab("bots")}
                  className={cn(
                    "flex-1 h-9 rounded-lg text-xs font-mono font-bold transition-all",
                    activeTab === "bots"
                      ? "bg-primary/10 border border-primary/30 text-primary"
                      : "bg-white/3 border border-white/8 text-muted-foreground hover:text-white"
                  )}
                >
                  ACCOUNTS
                </button>
                <button
                  onClick={() => setActiveTab("users")}
                  className={cn(
                    "flex-1 h-9 rounded-lg text-xs font-mono font-bold transition-all",
                    activeTab === "users"
                      ? "bg-primary/10 border border-primary/30 text-primary"
                      : "bg-white/3 border border-white/8 text-muted-foreground hover:text-white"
                  )}
                >
                  SESSIONS
                </button>
              </div>

              {/* Bots list */}
              {activeTab === "bots" ? (
                <div className="space-y-2">
                  {liveBots.length === 0 ? (
                    <p className="text-xs text-muted-foreground font-mono text-center py-8">No bots registered yet</p>
                  ) : (
                    <div className="space-y-2">
                      {liveBots.map(b => (
                        <div key={b.id} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-3 py-3">
                          {/* Status dot */}
                          <span className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            b.isConnected ? "bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.8)]" : "bg-muted-foreground/40"
                          )} />

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-white truncate">{b.discordTag}</p>
                            <p className="text-[10px] font-mono text-muted-foreground truncate">
                              {b.isConnected ? "LIVE" : "OFFLINE"} · ID {b.discordId || `#${b.id}`}
                            </p>
                          </div>

                          {/* Status badge */}
                          <span className={cn(
                            "hidden sm:inline-flex text-[10px] font-mono font-bold px-2 py-0.5 rounded",
                            b.isConnected ? "text-green-400 bg-green-400/10" : "text-muted-foreground/50 bg-white/5"
                          )}>
                            #{b.id}
                          </span>

                          {/* Delete button */}
                          <button
                            onClick={() => deleteBot(b.id, b.discordTag)}
                            disabled={actionLoading === `delete-${b.id}`}
                            className="w-8 h-8 rounded-lg border border-white/8 bg-white/3 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-muted-foreground flex items-center justify-center transition-all flex-shrink-0 disabled:opacity-40"
                            title="Delete"
                          >
                            {actionLoading === `delete-${b.id}`
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {adminData?.users.map(u => (
                    <div key={u.id} className="flex items-center gap-3 bg-white/3 border border-white/8 rounded-xl px-3 py-3">
                      <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono text-white truncate">{u.username}</p>
                        <p className="text-[10px] font-mono text-muted-foreground">Session #{u.id}</p>
                      </div>
                      <span className={cn(
                        "text-xs font-mono font-bold px-2 py-0.5 rounded",
                        u.botCount > 0 ? "text-primary bg-primary/10" : "text-muted-foreground/50 bg-white/5"
                      )}>
                        {u.botCount} bot{u.botCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { data: bots, isLoading } = useBots();
  const deleteBot = useDeleteBot();
  const botAction = useBotAction();
  const [search, setSearch] = React.useState("");
  const [adminOpen, setAdminOpen] = React.useState(false);

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
      {adminOpen && <AdminPanel onClose={() => setAdminOpen(false)} />}

      {/* Top nav */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/90 backdrop-blur-xl px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display font-black text-base sm:text-lg tracking-tight text-white">bothost.host</span>
          </div>

          <button
            onClick={() => setAdminOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 px-3 py-2 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-primary/30 hover:bg-primary/5 transition-colors text-xs font-mono"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-display font-black text-white tracking-tight">
              Your Instances
            </h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              Manage your selfbot connections and RPC settings
            </p>
          </div>
          <CreateBotDialog />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-mono text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-2xl sm:text-3xl font-bold text-white mt-1">{bots?.length || 0}</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-mono text-muted-foreground uppercase tracking-wider">Online</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary mt-1">{activeCount}</p>
          </div>
          <div className="bg-white/3 border border-white/8 rounded-xl p-3 sm:p-5">
            <p className="text-[10px] sm:text-xs font-mono text-muted-foreground uppercase tracking-wider">Offline</p>
            <p className="text-2xl sm:text-3xl font-bold text-destructive/80 mt-1">{(bots?.length || 0) - activeCount}</p>
          </div>
        </div>

        {/* Search */}
        {(bots?.length || 0) > 0 && (
          <div className="relative w-full sm:max-w-sm">
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
            className="flex flex-col items-center justify-center py-16 sm:py-24 border border-dashed border-white/10 rounded-2xl text-center space-y-4"
          >
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Bot className="w-7 h-7 sm:w-8 sm:h-8 text-muted-foreground" />
            </div>
            <div>
              <p className="font-semibold text-white">No bots deployed yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add your first Discord selfbot token to get started</p>
            </div>
            <CreateBotDialog />
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {filteredBots?.map((bot, idx) => (
              <motion.div
                key={bot.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
              >
                <div className="group relative bg-white/3 hover:bg-white/5 border border-white/8 hover:border-primary/20 rounded-xl p-4 sm:p-5 transition-all duration-200 flex flex-col h-full">
                  <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
                    <BotStatusBadge isRunning={!!bot.isRunning} isAfk={false} />
                  </div>

                  <div className="flex-1 space-y-3 sm:space-y-4">
                    <div className="pr-16 sm:pr-20">
                      <h3 className="font-bold text-white text-sm sm:text-base truncate">{bot.name}</h3>
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

                  <div className="flex gap-2 mt-4 pt-3 sm:mt-5 sm:pt-4 border-t border-white/5">
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
