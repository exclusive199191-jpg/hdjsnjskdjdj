import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ArrowLeft, BookOpen, Check, ChevronDown, CircleHelp, Clipboard,
  Command, ExternalLink, Search, ShieldCheck, Sparkles, Terminal,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { ThemeCustomizer } from "@/components/ThemeCustomizer";
import { COMMANDS, COMMAND_CATEGORIES, type CommandCategory } from "@/lib/commands";
import { R } from "@/lib/r";
import { cn } from "@/lib/utils";

const categoryTone: Record<CommandCategory, string> = {
  General: "text-sky-300 border-sky-300/20 bg-sky-300/[0.06]",
  Automation: "text-amber-300 border-amber-300/20 bg-amber-300/[0.06]",
  OSINT: "text-rose-300 border-rose-300/20 bg-rose-300/[0.06]",
  Find: "text-violet-300 border-violet-300/20 bg-violet-300/[0.06]",
};

function Rail() {
  return (
    <aside className="hidden xl:flex w-[76px] shrink-0 min-h-screen border-r border-white/[0.08] bg-[#090a0d] flex-col items-center py-5">
      <Link href="/" className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shadow-primary/15" aria-label="Back to dashboard">
        <span className="font-black text-sm">b</span>
      </Link>
      <div className="mt-12 flex flex-col items-center gap-3">
        <Link href="/" className="w-10 h-10 rounded-xl text-white/35 hover:text-white hover:bg-white/[0.05] flex items-center justify-center transition-colors" title="Overview">
          <Command className="w-4 h-4" />
        </Link>
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center" title="Support">
          <CircleHelp className="w-4 h-4" />
        </div>
      </div>
      <div className="mt-auto">
        <ShieldCheck className="w-4 h-4 text-white/20" />
      </div>
    </aside>
  );
}

export default function Support() {
  const { currentBg } = useTheme();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CommandCategory | "All">("All");
  const [open, setOpen] = useState<string | null>(COMMANDS[0]?.usage ?? null);
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return COMMANDS.filter(command => {
      const matchesCategory = category === "All" || command.category === category;
      const matchesQuery = !q || [command.usage, command.summary, command.details, command.example]
        .some(value => value.toLowerCase().includes(q));
      return matchesCategory && matchesQuery;
    });
  }, [category, query]);

  const copy = async (usage: string) => {
    await navigator.clipboard?.writeText(usage.startsWith(".") ? usage : `.${usage}`);
    setCopied(usage);
    window.setTimeout(() => setCopied(null), 1400);
  };

  return (
    <div className="min-h-screen flex text-white" style={{ backgroundColor: currentBg.cssValue }}>
      <Rail />
      <aside className="hidden md:flex w-[248px] shrink-0 min-h-screen border-r border-white/[0.08] bg-black/10 flex-col">
        <div className="h-[72px] px-5 flex items-center border-b border-white/[0.08]">
          <div>
            <p className="font-semibold tracking-tight">bothost</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-white/25 mt-1">Support desk</p>
          </div>
        </div>
        <div className="p-4">
          <Link href="/" className="flex items-center gap-2 text-xs text-white/45 hover:text-white transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to overview
          </Link>
        </div>
        <div className="px-5 pt-4 pb-2 text-[10px] uppercase tracking-[0.18em] text-white/25">Guide</div>
        <nav className="px-3 space-y-1">
          <a href="#start" className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-primary/10 text-primary text-sm">
            <Sparkles className="w-4 h-4" /> Start here
          </a>
          <a href="#commands" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/45 hover:bg-white/[0.04] hover:text-white text-sm transition-colors">
            <Terminal className="w-4 h-4" /> Commands
          </a>
          <a href="#privacy" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-white/45 hover:bg-white/[0.04] hover:text-white text-sm transition-colors">
            <ShieldCheck className="w-4 h-4" /> Safe operation
          </a>
        </nav>
        <div className="mt-auto p-4">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3">
            <p className="text-xs text-white/70">Need a quick answer?</p>
            <p className="text-[11px] leading-relaxed text-white/30 mt-1.5">Search the command index or use the examples on each row.</p>
          </div>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        <header className="h-[72px] border-b border-white/[0.08] flex items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2 text-sm">
            <BookOpen className="w-4 h-4 text-primary" />
            <span className="text-white/40">Workspace</span>
            <span className="text-white/20">/</span>
            <span className="text-white">Support</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeCustomizer />
            <Link href="/" className="md:hidden w-8 h-8 flex items-center justify-center rounded-lg border border-white/10 text-white/45">
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>
        </header>

        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 sm:py-12">
          <section id="start" className="max-w-3xl">
            <p className="text-[10px] uppercase tracking-[0.22em] text-primary/80 font-semibold">Support desk</p>
            <h1 className="mt-3 text-3xl sm:text-5xl font-semibold tracking-[-0.03em]">Everything you need to run bothost.</h1>
            <p className="mt-4 text-sm sm:text-base leading-7 text-white/45 max-w-2xl">
              Connect an account, open its workspace, then use the configured prefix in a channel the account can read.
              This guide covers the complete command surface and the common operating flow.
            </p>
          </section>

          <section className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-3">
            {[
              ["01", "Connect", "Add an account from the overview and wait for its status to turn online."],
              ["02", "Configure", "Open Configure to manage prefix, presence, automation and access settings."],
              ["03", "Command", "Run a command in an accessible channel. The default prefix is a period."],
            ].map(([number, title, body]) => (
              <div key={number} className="border border-white/[0.08] bg-white/[0.025] p-4">
                <span className="text-[10px] font-mono text-primary/70">{number}</span>
                <h2 className="mt-7 text-sm font-semibold">{title}</h2>
                <p className="mt-2 text-xs leading-5 text-white/35">{body}</p>
              </div>
            ))}
          </section>

          <section id="commands" className="mt-14">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-primary/80 font-semibold">Reference</p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">Command index</h2>
                <p className="mt-1 text-sm text-white/35">{COMMANDS.length} documented commands with examples.</p>
              </div>
              <div className="relative w-full sm:w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/25" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Search command or task"
                  className="w-full h-10 rounded-lg border border-white/10 bg-white/[0.04] pl-10 pr-3 text-sm text-white placeholder:text-white/25 outline-none focus:border-primary/50"
                />
              </div>
            </div>

            <div className="mt-6 flex gap-2 overflow-x-auto pb-1">
              {(["All", ...COMMAND_CATEGORIES] as const).map(item => (
                <button
                  key={item}
                  onClick={() => setCategory(item as CommandCategory | "All")}
                  className={cn(
                    "px-3 py-1.5 rounded-md border text-xs whitespace-nowrap transition-colors",
                    category === item ? "border-primary/40 bg-primary/10 text-primary" : "border-white/10 text-white/40 hover:text-white hover:bg-white/[0.04]"
                  )}
                >
                  {item}
                  {item !== "All" && <span className="ml-1.5 text-[10px] opacity-50">{COMMANDS.filter(command => command.category === item).length}</span>}
                </button>
              ))}
            </div>

            <div className="mt-3 border-t border-white/[0.08]">
              {filtered.map(command => {
                const isOpen = open === command.usage;
                return (
                  <div key={command.usage} className="border-b border-white/[0.08]">
                    <div className="flex items-center gap-3 py-4">
                      <span className={cn("hidden sm:inline-flex px-2 py-1 rounded border text-[9px] uppercase tracking-wider font-semibold", categoryTone[command.category])}>
                        {command.category}
                      </span>
                      <button onClick={() => setOpen(isOpen ? null : command.usage)} className="flex-1 min-w-0 text-left">
                        <code className="text-sm text-white/85 font-mono break-words">.{command.usage}</code>
                        <span className="block text-xs text-white/35 mt-1">{command.summary}</span>
                      </button>
                      <button onClick={() => copy(command.usage)} className="shrink-0 w-8 h-8 rounded-md border border-white/10 text-white/30 hover:text-white hover:bg-white/[0.04] flex items-center justify-center transition-colors" title="Copy command">
                        {copied === command.usage ? <Check className="w-3.5 h-3.5 text-primary" /> : <Clipboard className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => setOpen(isOpen ? null : command.usage)} className="shrink-0 text-white/25 hover:text-white transition-colors">
                        <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen && "rotate-180")} />
                      </button>
                    </div>
                    {isOpen && (
                      <div className="pb-5 sm:pl-[104px] pr-10 grid gap-3">
                        <p className="text-sm text-white/45 leading-6">{command.details}</p>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-white/[0.08] bg-black/20 px-3 py-2">
                          <code className="text-xs font-mono text-primary/80 break-all">{command.example}</code>
                          <button onClick={() => copy(command.example)} className="text-[10px] text-white/30 hover:text-white shrink-0">Copy</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {!filtered.length && <div className="py-16 text-center text-sm text-white/30">No commands match that search.</div>}
            </div>
          </section>

          <section id="privacy" className="mt-14 mb-10 border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-primary mt-0.5" />
              <div>
                <h2 className="text-sm font-semibold">Operate with permission</h2>
                <p className="mt-2 text-xs leading-6 text-white/40 max-w-2xl">
                  Only connect accounts you own or are authorized to operate. Use automation in spaces where you have consent,
                  keep exports limited to channels the account can already read, and never share credentials or private data.
                  Public context lookups are intentionally coarse and reject private or reserved IP ranges.
                </p>
                <a href="https://discord.com/terms" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 mt-4 text-xs text-primary hover:text-primary/80">
                  Review Discord policies <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}