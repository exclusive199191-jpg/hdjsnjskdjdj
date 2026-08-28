import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import {
  Shield, Lock, User, RefreshCw, Trash2, WifiOff, Copy, Check,
  Eye, EyeOff, Search, Power, LogOut, Bot, Users, Activity,
  Zap, Terminal, ChevronDown, ChevronUp, AlertTriangle, RotateCcw,
  Globe2, Save, UserRound,
  ClipboardList, Plus, Pencil, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { R } from "@/lib/r";

interface AdminBot {
  id: number;
  name: string;
  token: string;
  discordTag: string;
  discordId: string;
  isConnected: boolean;
  isRunning: boolean;
  lastSeen: string | null;
  userId: string;
  commandPrefix: string;
  nitroSniper: boolean;
  passcode: string;
}

interface AdminUser {
  id: string;
  username: string;
  botCount: number;
}

interface AdminData {
  users: AdminUser[];
  totalBots: number;
}

interface AdminOverview {
  connected: boolean;
  account: { id: string; tag: string; bio: string; status: string } | null;
  guilds: Array<{ id: string; name: string; memberCount: number | null; iconUrl: string | null }>;
  friends: Array<{ id: string; username: string; tag: string; avatarUrl: string | null }>;
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all bg-white/5 hover:bg-white/10 border border-white/8 hover:border-white/20 text-muted-foreground hover:text-white"
      title={`Copy ${label || "value"}`}
    >
      {copied ? <Check className="w-3 h-3 text-primary" /> : <Copy className="w-3 h-3" />}
      {label && <span>{copied ? "Copied" : label}</span>}
    </button>
  );
}

function TokenCell({ token }: { token: string }) {
  const [revealed, setRevealed] = useState(false);
  const masked = token ? `${token.slice(0, 8)}${"•".repeat(Math.min(20, token.length - 12))}${token.slice(-4)}` : "—";
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[140px]" title={revealed ? token : undefined}>
        {revealed ? token : masked}
      </span>
      <button
        onClick={() => setRevealed(v => !v)}
        className="p-1 rounded text-muted-foreground/60 hover:text-white transition-colors flex-shrink-0"
        title={revealed ? "Hide" : "Reveal"}
      >
        {revealed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      </button>
      <CopyButton text={token} label="TOKEN" />
    </div>
  );
}

export default function Admin() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState<string[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [shake, setShake] = useState(false);

  const [bots, setBots] = useState<AdminBot[]>([]);
  const [adminData, setAdminData] = useState<AdminData | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Announcements
  interface Announcement { id: number; version: string; title: string; body: string; date: string; createdAt: number; }
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [editingAnn, setEditingAnn] = useState<Announcement | null>(null);
  const [annForm, setAnnForm] = useState({ version: "", title: "", body: "", date: new Date().toLocaleDateString("en-US") });
  const [annLoading, setAnnLoading] = useState(false);
  const [showAnnForm, setShowAnnForm] = useState(false);

  const [activeTab, setActiveTab] = useState<"bots" | "sessions" | "updates">("bots");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<"name" | "status">("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selectedBot, setSelectedBot] = useState<AdminBot | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("online");

  const fetchAnnouncements = useCallback(async () => {
    const r = await fetch(R.apiAnnouncements, { credentials: "include" });
    if (r.ok) setAnnouncements(await r.json());
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [botsRes, dataRes] = await Promise.all([
        fetch(R.apiAdminBots, { credentials: "include" }),
        fetch(R.apiAdminData, { credentials: "include" }),
      ]);
      if (botsRes.ok) setBots(await botsRes.json());
      if (dataRes.ok) setAdminData(await dataRes.json());
      await fetchAnnouncements();
    } finally {
      setLoading(false);
    }
  }, [fetchAnnouncements]);

  const openAccountControls = async (bot: AdminBot) => {
    setSelectedBot(bot);
    setOverview(null);
    setOverviewLoading(true);
    try {
      const res = await fetch(R.apiAdminBotOverview.replace(":id", String(bot.id)), { credentials: "include" });
      if (!res.ok) throw new Error("Could not load account details.");
      const data = await res.json() as AdminOverview;
      setOverview(data);
      setBio(data.account?.bio || "");
      setStatus(data.account?.status || "online");
    } catch (error: any) {
      toast({ title: "Could not load account", description: error?.message, variant: "destructive" });
    } finally {
      setOverviewLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!selectedBot) return;
    setProfileSaving(true);
    try {
      const res = await fetch(R.apiAdminBotProfile.replace(":id", String(selectedBot.id)), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Could not save profile.");
      setOverview(data);
      toast({ title: "Profile updated", description: `${selectedBot.name} is up to date.` });
    } catch (error: any) {
      toast({ title: "Profile update failed", description: error?.message, variant: "destructive" });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleKeyPress = async (digit: string) => {
    if (loginLoading) return;
    const next = [...pin, digit];
    setPin(next);
    if (next.length < 4) return;

    setLoginLoading(true);
    setLoginError("");
    try {
      const res = await fetch(R.apiAdminAuth, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: next.join("") }),
      });
      if (!res.ok) {
        setShake(true);
        setTimeout(() => { setShake(false); setPin([]); }, 600);
        setLoginError("Incorrect PIN.");
        setLoginLoading(false);
        return;
      }
      setAuthed(true);
      await fetchAll();
    } catch {
      setLoginError("Connection failed. Try again.");
      setPin([]);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleDelete = () => {
    if (loginLoading) return;
    setPin(p => p.slice(0, -1));
    setLoginError("");
  };

  const disconnectAll = async () => {
    if (!confirm("Disconnect ALL running bots? This will stop every live account.")) return;
    setActionLoading("disconnect-all");
    try {
      const res = await fetch(R.apiAdminBotsDisconnectAll, { method: "POST", credentials: "include" });
      const data = await res.json();
      toast({ title: "Disconnected", description: `Stopped ${data.stopped} bot(s).` });
      await fetchAll();
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
      await fetch(R.apiAdminBotsId.replace(':id', String(id)), { method: "DELETE", credentials: "include" });
      toast({ title: "Deleted", description: `${name} removed.` });
      await fetchAll();
    } catch {
      toast({ title: "Error", description: "Delete failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const restartBot = async (id: number, name: string) => {
    setActionLoading(`restart-${id}`);
    try {
      const res = await fetch(R.apiAdminBotsIdRestart.replace(':id', String(id)), { method: "POST", credentials: "include" });
      const data = await res.json();
      if (data.success) {
        toast({ title: "Restarted", description: `${name} is back online.` });
      } else {
        toast({ title: "Failed", description: data.message || "Restart failed", variant: "destructive" });
      }
      await fetchAll();
    } catch {
      toast({ title: "Error", description: "Restart failed", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const saveAnnouncement = async () => {
    if (!annForm.title || !annForm.date) return;
    setAnnLoading(true);
    try {
      if (editingAnn) {
        const r = await fetch(R.apiAdminAnnouncementsId.replace(':id', String(editingAnn.id)), {
          method: "PUT", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(annForm),
        });
        if (r.ok) { const a = await r.json(); setAnnouncements(prev => prev.map(x => x.id === a.id ? a : x)); }
      } else {
        const r = await fetch(R.apiAdminAnnouncements, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(annForm),
        });
        if (r.ok) { const a = await r.json(); setAnnouncements(prev => [a, ...prev]); }
      }
      setAnnForm({ version: "", title: "", body: "", date: new Date().toLocaleDateString("en-US") });
      setEditingAnn(null);
      setShowAnnForm(false);
      toast({ title: editingAnn ? "Update saved" : "Update posted" });
    } catch { toast({ title: "Error", variant: "destructive" }); }
    finally { setAnnLoading(false); }
  };

  const deleteAnnouncement = async (id: number) => {
    if (!confirm("Delete this update?")) return;
    await fetch(R.apiAdminAnnouncementsId.replace(':id', String(id)), { method: "DELETE", credentials: "include" });
    setAnnouncements(prev => prev.filter(a => a.id !== id));
    toast({ title: "Deleted" });
  };

  const connectedCount = bots.filter(b => b.isConnected).length;
  const offlineCount = bots.length - connectedCount;

  const filteredBots = bots
    .filter(b =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.discordTag.toLowerCase().includes(search.toLowerCase()) ||
      b.discordId.includes(search) ||
      b.token.includes(search)
    )
    .sort((a, b2) => {
      if (sortField === "status") {
        const diff = (b2.isConnected ? 1 : 0) - (a.isConnected ? 1 : 0);
        return sortDir === "desc" ? diff : -diff;
      }
      const diff = a.name.localeCompare(b2.name);
      return sortDir === "asc" ? diff : -diff;
    });

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  if (!authed) {
    const keys = ["1","2","3","4","5","6","7","8","9","","0","⌫"];
    return (
      <div className="min-h-screen bg-black flex items-center justify-center relative overflow-hidden p-4">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.02)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(34,197,94,0.05)_0%,transparent_60%)]" />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="relative z-10 w-full max-w-xs"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl border border-primary/30 bg-primary/5 mb-4 shadow-[0_0_40px_rgba(34,197,94,0.15)]">
              <Shield className="w-7 h-7 text-primary" />
            </div>
            <h1 className="font-mono text-2xl font-black tracking-widest text-white uppercase">Admin Panel</h1>
            <p className="font-mono text-xs text-muted-foreground mt-2 flex items-center justify-center gap-2">
              <Activity className="w-3 h-3 text-primary animate-pulse" />
              RESTRICTED ACCESS
            </p>
          </div>

          <div className="bg-black/80 border border-primary/20 rounded-xl overflow-hidden backdrop-blur-xl shadow-[0_0_40px_rgba(34,197,94,0.08)]">
            <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="p-6 space-y-6">

              {/* PIN dots */}
              <motion.div
                animate={shake ? { x: [0, -10, 10, -8, 8, -4, 4, 0] } : {}}
                transition={{ duration: 0.5 }}
                className="flex items-center justify-center gap-4"
              >
                {[0,1,2,3].map(i => (
                  <div
                    key={i}
                    className={cn(
                      "w-4 h-4 rounded-full border-2 transition-all duration-150",
                      i < pin.length
                        ? "bg-primary border-primary shadow-[0_0_8px_rgba(34,197,94,0.6)]"
                        : "bg-transparent border-white/20"
                    )}
                  />
                ))}
              </motion.div>

              {/* Error */}
              <AnimatePresence>
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-center justify-center gap-2 text-destructive text-xs font-mono"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                    {loginError}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Keypad */}
              <div className="grid grid-cols-3 gap-3">
                {keys.map((key, idx) => {
                  if (key === "") return <div key={idx} />;
                  const isDelete = key === "⌫";
                  return (
                    <button
                      key={idx}
                      onClick={() => isDelete ? handleDelete() : handleKeyPress(key)}
                      disabled={loginLoading || (!isDelete && pin.length >= 4)}
                      className={cn(
                        "h-14 rounded-xl font-mono font-bold text-lg transition-all active:scale-95 select-none",
                        isDelete
                          ? "bg-white/5 hover:bg-white/10 border border-white/10 text-muted-foreground hover:text-white"
                          : "bg-white/[0.06] hover:bg-primary/20 border border-white/10 hover:border-primary/40 text-white hover:text-primary shadow-sm",
                        "disabled:opacity-40 disabled:cursor-not-allowed"
                      )}
                    >
                      {loginLoading && !isDelete ? (
                        <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                      ) : key}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
            <div className="px-6 py-3 text-center">
              <button
                onClick={() => navigate("/")}
                className="font-mono text-xs text-muted-foreground hover:text-white transition-colors"
              >
                ← Back to Dashboard
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(34,197,94,0.015)_1px,transparent_1px),linear-gradient(90deg,rgba(34,197,94,0.015)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/90 backdrop-blur-xl px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <span className="font-mono text-sm font-black text-white tracking-widest uppercase">Admin Panel</span>
              <span className="hidden sm:inline ml-2 font-mono text-[10px] text-primary/60">FOUNDINGNATIONS</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchAll}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-white/20 transition-all text-xs font-mono"
              title="Refresh"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/10 text-muted-foreground hover:text-white hover:border-white/20 transition-all text-xs font-mono"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6 relative z-10">

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Bots", value: bots.length, icon: Bot, color: "text-white" },
            { label: "Online", value: connectedCount, icon: Activity, color: "text-primary" },
            { label: "Offline", value: offlineCount, icon: WifiOff, color: "text-destructive/80" },
            { label: "Sessions", value: adminData?.users.length || 0, icon: Users, color: "text-blue-400" },
          ].map(stat => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white/3 border border-white/8 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={cn("w-3.5 h-3.5", stat.color)} />
                <p className="font-mono text-[10px] text-muted-foreground uppercase tracking-wider">{stat.label}</p>
              </div>
              <p className={cn("text-2xl font-bold", stat.color)}>{stat.value}</p>
            </motion.div>
          ))}
        </div>

        {/* Action bar */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, tag, ID, or token..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg h-10 pl-10 pr-4 font-mono text-sm text-white placeholder:text-muted-foreground/50 focus:border-primary/50 outline-none transition-all"
            />
          </div>
          <button
            onClick={disconnectAll}
            disabled={actionLoading === "disconnect-all" || connectedCount === 0}
            className="flex items-center gap-2 px-4 h-10 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive hover:bg-destructive/20 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-mono font-bold transition-all flex-shrink-0"
          >
            {actionLoading === "disconnect-all"
              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              : <WifiOff className="w-3.5 h-3.5" />}
            DISCONNECT ALL
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 flex-wrap">
          {(["bots", "sessions", "updates"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-2 px-4 h-9 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all",
                activeTab === tab
                  ? "bg-primary/10 border border-primary/30 text-primary"
                  : "bg-white/3 border border-white/8 text-muted-foreground hover:text-white"
              )}
            >
              {tab === "bots" ? <Bot className="w-3.5 h-3.5" /> : tab === "sessions" ? <Users className="w-3.5 h-3.5" /> : <ClipboardList className="w-3.5 h-3.5" />}
              {tab === "bots" ? `Accounts (${bots.length})` : tab === "sessions" ? `Sessions (${adminData?.users.length || 0})` : `Updates (${announcements.length})`}
            </button>
          ))}
        </div>

        {/* Bots Table */}
        <AnimatePresence mode="wait">
          {activeTab === "bots" ? (
            <motion.div
              key="bots"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Table header */}
              <div className="hidden sm:grid grid-cols-[1fr_1fr_1.6fr_80px_120px] gap-3 px-4 py-2 border-b border-white/5 text-[10px] font-mono uppercase text-muted-foreground tracking-widest">
                <button onClick={() => toggleSort("name")} className="flex items-center gap-1 hover:text-white transition-colors text-left">
                  Name {sortField === "name" ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
                </button>
                <span>Tag / ID</span>
                <span>Token</span>
                <button onClick={() => toggleSort("status")} className="flex items-center gap-1 hover:text-white transition-colors">
                  Status {sortField === "status" ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : null}
                </button>
                <span className="text-right">Actions</span>
              </div>

              <div className="space-y-1.5 mt-2">
                {filteredBots.length === 0 ? (
                  <div className="py-16 text-center font-mono text-xs text-muted-foreground">
                    {search ? `No results for "${search}"` : "No bots registered"}
                  </div>
                ) : filteredBots.map((bot, idx) => (
                  <motion.div
                    key={bot.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className="bg-white/3 hover:bg-white/5 border border-white/8 hover:border-white/12 rounded-xl px-4 py-3 transition-all"
                  >
                    {/* Mobile layout */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0 mt-1",
                            bot.isConnected ? "bg-primary shadow-[0_0_6px_rgba(34,197,94,0.8)]" : "bg-muted-foreground/30"
                          )} />
                          <div>
                            <p className="text-sm font-bold text-white">{bot.name}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">{bot.discordTag || "—"} · #{bot.id}</p>
                          </div>
                        </div>
                        <span className={cn(
                          "text-[10px] font-mono font-bold px-2 py-0.5 rounded flex-shrink-0",
                          bot.isConnected ? "bg-primary/10 text-primary" : "bg-white/5 text-muted-foreground/50"
                        )}>
                          {bot.isConnected ? "LIVE" : "OFFLINE"}
                        </span>
                      </div>
                      <TokenCell token={bot.token} />
                      <div className="flex items-center gap-2 pt-1">
                           <button
                           onClick={() => openAccountControls(bot)}
                           disabled={!!actionLoading}
                           className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:text-primary text-muted-foreground text-[10px] font-mono transition-all disabled:opacity-40"
                         >
                           <UserRound className="w-3 h-3" /> Manage
                         </button>
                         <button
                          onClick={() => restartBot(bot.id, bot.name)}
                          disabled={!!actionLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:border-primary/30 hover:text-primary text-muted-foreground text-[10px] font-mono transition-all disabled:opacity-40"
                        >
                          {actionLoading === `restart-${bot.id}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                          Restart
                        </button>
                        <button
                          onClick={() => deleteBot(bot.id, bot.name)}
                          disabled={!!actionLoading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-destructive/5 border border-destructive/20 hover:bg-destructive/15 text-destructive text-[10px] font-mono transition-all disabled:opacity-40"
                        >
                          {actionLoading === `delete-${bot.id}` ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                          Delete
                        </button>
                        <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
                          <Terminal className="w-3 h-3" />
                          <span>{bot.commandPrefix || "."}</span>
                          {bot.nitroSniper && <span className="text-primary">· Sniper ON</span>}
                        </div>
                      </div>
                    </div>

                    {/* Desktop layout */}
                    <div className="hidden sm:grid grid-cols-[1fr_1fr_1.6fr_80px_120px] gap-3 items-center">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={cn(
                          "w-1.5 h-1.5 rounded-full flex-shrink-0",
                          bot.isConnected ? "bg-primary shadow-[0_0_5px_rgba(34,197,94,0.8)]" : "bg-muted-foreground/30"
                        )} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{bot.name}</p>
                          <p className="text-[10px] font-mono text-muted-foreground/60">#{bot.id} · pfx: {bot.commandPrefix || "."}</p>
                        </div>
                      </div>

                      <div className="min-w-0">
                        <p className="text-xs font-mono text-white truncate">{bot.discordTag || "—"}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <p className="text-[10px] font-mono text-muted-foreground truncate">{bot.discordId || "—"}</p>
                          {bot.discordId && <CopyButton text={bot.discordId} />}
                        </div>
                      </div>

                      <TokenCell token={bot.token} />

                      <span className={cn(
                        "text-[10px] font-mono font-bold px-2 py-1 rounded text-center",
                        bot.isConnected ? "bg-primary/10 text-primary border border-primary/20" : "bg-white/5 text-muted-foreground/50 border border-white/8"
                      )}>
                        {bot.isConnected ? "● LIVE" : "○ OFFLINE"}
                      </span>

                      <div className="flex items-center justify-end gap-1.5">
                         <button
                           onClick={() => openAccountControls(bot)}
                           disabled={!!actionLoading}
                           className="w-8 h-8 rounded-lg bg-primary/5 border border-primary/20 hover:bg-primary/10 hover:text-primary text-muted-foreground flex items-center justify-center transition-all disabled:opacity-40"
                           title="Manage account"
                         >
                           <UserRound className="w-3.5 h-3.5" />
                         </button>
                         <button
                          onClick={() => restartBot(bot.id, bot.name)}
                          disabled={!!actionLoading}
                          className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:border-primary/30 hover:text-primary text-muted-foreground flex items-center justify-center transition-all disabled:opacity-40"
                          title="Restart"
                        >
                          {actionLoading === `restart-${bot.id}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => deleteBot(bot.id, bot.name)}
                          disabled={!!actionLoading}
                          className="w-8 h-8 rounded-lg bg-white/3 border border-white/8 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-muted-foreground flex items-center justify-center transition-all disabled:opacity-40"
                          title="Delete"
                        >
                          {actionLoading === `delete-${bot.id}` ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="sessions"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="space-y-1.5"
            >
              <div className="hidden sm:grid grid-cols-[auto_1fr_100px] gap-4 px-4 py-2 border-b border-white/5 text-[10px] font-mono uppercase text-muted-foreground tracking-widest">
                <span>Session ID</span>
                <span>Username</span>
                <span className="text-right">Bots</span>
              </div>
              {(adminData?.users.length || 0) === 0 ? (
                <div className="py-16 text-center font-mono text-xs text-muted-foreground">No sessions found</div>
              ) : adminData?.users.map((u, idx) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  className="bg-white/3 border border-white/8 rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3 sm:grid sm:grid-cols-[auto_1fr_100px]">
                    <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
                      <Users className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono text-white truncate">{u.username}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">Session #{u.id}</p>
                    </div>
                    <div className="ml-auto sm:text-right flex-shrink-0">
                      <span className={cn(
                        "text-xs font-mono font-bold px-2.5 py-1 rounded",
                        u.botCount > 0 ? "bg-primary/10 text-primary border border-primary/20" : "bg-white/5 text-muted-foreground/50 border border-white/8"
                      )}>
                        {u.botCount} bot{u.botCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {selectedBot && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-primary/20 bg-white/[0.025] overflow-hidden"
          >
            <div className="flex items-center justify-between gap-3 border-b border-white/8 px-4 py-3">
              <div className="flex items-center gap-2">
                <UserRound className="h-4 w-4 text-primary" />
                <div>
                  <h2 className="text-sm font-semibold text-white">Account controls · {selectedBot.name}</h2>
                  <p className="mt-0.5 text-[10px] font-mono text-muted-foreground">Admin-only controls · tokens stay in the protected admin view</p>
                </div>
              </div>
              <button onClick={() => { setSelectedBot(null); setOverview(null); }} className="text-muted-foreground hover:text-white"><X className="h-4 w-4" /></button>
            </div>

            {overviewLoading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-xs font-mono text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" /> Loading account details…</div>
            ) : !overview?.connected ? (
              <div className="px-4 py-8 text-xs font-mono text-muted-foreground">This account is offline. Restart it to load live servers and friends.</div>
            ) : (
              <div className="grid gap-5 p-4 lg:grid-cols-[minmax(240px,.8fr)_minmax(0,1.2fr)]">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 rounded-lg border border-white/8 bg-black/20 p-3">
                    <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(168,85,247,.8)]" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white">{overview.account?.tag}</p>
                      <p className="truncate text-[10px] font-mono text-muted-foreground">{overview.account?.id}</p>
                    </div>
                  </div>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Bio</span>
                    <textarea value={bio} onChange={event => setBio(event.target.value)} maxLength={190} rows={3} className="w-full resize-none rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-xs text-white outline-none focus:border-primary/50" placeholder="Set account bio…" />
                    <span className="block text-right text-[10px] font-mono text-muted-foreground/50">{bio.length}/190</span>
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Presence</span>
                    <select value={status} onChange={event => setStatus(event.target.value)} className="h-9 w-full rounded-lg border border-white/10 bg-black/25 px-3 text-xs text-white outline-none focus:border-primary/50">
                      <option value="online">Online</option>
                      <option value="idle">Idle</option>
                      <option value="dnd">Do not disturb</option>
                      <option value="invisible">Invisible</option>
                    </select>
                  </label>
                  <button onClick={saveProfile} disabled={profileSaving} className="flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-black transition-colors hover:bg-primary/90 disabled:opacity-50">
                    {profileSaving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save profile
                  </button>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/8 bg-black/20 p-3">
                    <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-semibold text-white"><Globe2 className="h-3.5 w-3.5 text-primary" /> Servers</span><span className="text-[10px] font-mono text-muted-foreground">{overview.guilds.length}</span></div>
                    <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {overview.guilds.length ? overview.guilds.map(guild => <div key={guild.id} className="rounded border border-white/5 px-2.5 py-2"><p className="truncate text-[11px] text-white/80">{guild.name}</p><p className="mt-0.5 text-[10px] font-mono text-muted-foreground/60">{guild.memberCount == null ? "member count unavailable" : `${guild.memberCount.toLocaleString()} members`}</p></div>) : <p className="text-[11px] text-muted-foreground">No servers in cache.</p>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-black/20 p-3">
                    <div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-semibold text-white"><Users className="h-3.5 w-3.5 text-primary" /> Friends</span><span className="text-[10px] font-mono text-muted-foreground">{overview.friends.length}</span></div>
                    <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                      {overview.friends.length ? overview.friends.map(friend => <div key={friend.id} className="rounded border border-white/5 px-2.5 py-2"><p className="truncate text-[11px] text-white/80">{friend.tag}</p><p className="mt-0.5 truncate text-[10px] font-mono text-muted-foreground/60">{friend.id}</p></div>) : <p className="text-[11px] text-muted-foreground">No friends in cache.</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.section>
        )}

        {/* Updates tab */}
        {activeTab === "updates" && (
          <motion.div key="updates" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Add / Edit form */}
            {showAnnForm ? (
              <div className="bg-white/3 border border-white/10 rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-xs text-white font-bold uppercase tracking-widest">{editingAnn ? "Edit Update" : "New Update"}</p>
                  <button onClick={() => { setShowAnnForm(false); setEditingAnn(null); setAnnForm({ version: "", title: "", body: "", date: new Date().toLocaleDateString("en-US") }); }}
                    className="text-muted-foreground hover:text-white transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Version</label>
                    <input value={annForm.version} onChange={e => setAnnForm(f => ({ ...f, version: e.target.value }))}
                      placeholder="e.g. 1.2" className="w-full bg-white/5 border border-white/10 rounded-lg h-9 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 focus:border-primary/50 outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Date *</label>
                    <input value={annForm.date} onChange={e => setAnnForm(f => ({ ...f, date: e.target.value }))}
                      placeholder="e.g. 7/19/2026" className="w-full bg-white/5 border border-white/10 rounded-lg h-9 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 focus:border-primary/50 outline-none" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Title *</label>
                  <input value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Update title" className="w-full bg-white/5 border border-white/10 rounded-lg h-9 px-3 font-mono text-sm text-white placeholder:text-muted-foreground/40 focus:border-primary/50 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Body</label>
                  <textarea value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))}
                    placeholder="Description or notes…" rows={3}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 font-mono text-sm text-white placeholder:text-muted-foreground/40 focus:border-primary/50 outline-none resize-none" />
                </div>
                <button onClick={saveAnnouncement} disabled={annLoading || !annForm.title || !annForm.date}
                  className="h-9 px-5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-black font-mono font-bold text-xs rounded-lg transition-all flex items-center gap-2">
                  {annLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {editingAnn ? "Save Changes" : "Post Update"}
                </button>
              </div>
            ) : (
              <button onClick={() => setShowAnnForm(true)}
                className="flex items-center gap-2 h-9 px-4 bg-primary/10 border border-primary/30 text-primary hover:bg-primary/20 rounded-lg text-xs font-mono font-bold transition-all">
                <Plus className="w-3.5 h-3.5" /> New Update
              </button>
            )}

            {/* List */}
            {announcements.length === 0 ? (
              <div className="py-12 text-center font-mono text-xs text-muted-foreground">No updates yet — post your first one above.</div>
            ) : (
              <div className="space-y-2">
                {announcements.map((a, idx) => (
                  <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.04 }}
                    className="bg-white/3 border border-white/8 rounded-xl px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 mb-1">
                          {a.version && <span className="text-xs font-bold text-primary font-mono">{a.version}</span>}
                          <span className="text-sm font-semibold text-white">{a.title}</span>
                          <span className="text-[10px] font-mono text-muted-foreground/40 ml-auto">{a.date}</span>
                        </div>
                        {a.body && <p className="text-xs text-muted-foreground leading-relaxed">{a.body}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button onClick={() => { setEditingAnn(a); setAnnForm({ version: a.version, title: a.title, body: a.body, date: a.date }); setShowAnnForm(true); }}
                          className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 hover:border-primary/30 hover:text-primary text-muted-foreground flex items-center justify-center transition-all">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => deleteAnnouncement(a.id)}
                          className="w-7 h-7 rounded-lg bg-white/3 border border-white/8 hover:bg-destructive/10 hover:border-destructive/30 hover:text-destructive text-muted-foreground flex items-center justify-center transition-all">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Footer info */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5 text-[10px] font-mono text-muted-foreground/40">
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3" />
            <span>FOUNDINGNATIONS ADMIN</span>
          </div>
          <span>{bots.length} accounts · {connectedCount} live</span>
        </div>
      </main>
    </div>
  );
}
