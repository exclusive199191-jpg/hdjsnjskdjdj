import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useCreateBot } from "@/hooks/use-bots";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CyberInput } from "./CyberInput";
import { Plus, X, Zap, ChevronUp, ChevronDown, Monitor, Database, Apple, Copy, Check, Info } from "lucide-react";

const BOOKMARKLET = `javascript:void((function(){if(!location.host.includes('discord.com')){alert('Open this bookmark on discord.com/app');location.href='https://discord.com/app';return}var i=document.createElement('iframe');document.body.appendChild(i);var t=i.contentWindow.localStorage.getItem('token');i.remove();if(t){t=t.replace(/"/g,'');navigator.clipboard.writeText(t).then(function(){alert('Token copied!')}).catch(function(){prompt('Copy your token:',t)})}else{alert('Token not found \u2014 try Method 1 instead')}})())`;

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <code className="inline-block px-1.5 py-0.5 rounded bg-primary/15 border border-primary/25 text-primary font-mono text-[10px] leading-none">
      {children}
    </code>
  );
}

function TokenGuide() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(BOOKMARKLET).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border border-white/8 overflow-hidden">
      {/* Toggle header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-white/[0.03] hover:bg-white/[0.06] transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5 text-primary/70" />
          <span className="font-mono text-xs text-white/80 font-semibold">How to find your token manually</span>
        </div>
        {open ? (
          <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 space-y-5 bg-white/[0.015]">

          {/* Method 1 */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Monitor className="w-3.5 h-3.5 text-primary/70" />
              <span className="font-mono text-xs font-bold text-white">Method 1 — Network Tab</span>
            </div>
            <ol className="space-y-2 pl-1">
              {[
                <>Open Discord in your browser at <strong className="text-white">discord.com/app</strong></>,
                <>Press <Kbd>Ctrl+Shift+I</Kbd> (or <Kbd>F12</Kbd>) to open DevTools</>,
                <>Go to the <strong className="text-white">Network</strong> tab and type <Kbd>messages</Kbd> in the filter box</>,
                <>Open any Discord channel or DM to trigger a network request</>,
                <>Click any <Kbd>messages</Kbd> request and look at <strong className="text-white">Request Headers</strong> — the <Kbd>authorization</Kbd> value is your token</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[11px] text-white/60 leading-relaxed">
                  <span className="shrink-0 text-primary/50 font-mono font-bold mt-px">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="h-px bg-white/5" />

          {/* Method 2 */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Database className="w-3.5 h-3.5 text-primary/70" />
              <span className="font-mono text-xs font-bold text-white">Method 2 — Application Tab</span>
            </div>
            <ol className="space-y-2 pl-1">
              {[
                <>Open Discord at <strong className="text-white">discord.com/app</strong> with DevTools open (<Kbd>F12</Kbd>)</>,
                <>Go to the <strong className="text-white">Application</strong> tab (Chrome) or <strong className="text-white">Storage</strong> tab (Firefox)</>,
                <>Expand <strong className="text-white">Local Storage</strong> and click <Kbd>https://discord.com</Kbd></>,
                <>Find the key named <Kbd>token</Kbd> — the value (without quotes) is your token</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[11px] text-white/60 leading-relaxed">
                  <span className="shrink-0 text-primary/50 font-mono font-bold mt-px">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="h-px bg-white/5" />

          {/* iOS Bookmarklet */}
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Apple className="w-3.5 h-3.5 text-primary/70" />
              <span className="font-mono text-xs font-bold text-white">iOS — Safari Bookmarklet</span>
            </div>
            <ol className="space-y-2 pl-1 mb-3">
              {[
                <>Copy the bookmarklet code below</>,
                <>In Safari, bookmark any page, then edit the bookmark and replace the URL with the copied code</>,
                <>Navigate to <strong className="text-white">discord.com/app</strong> in Safari, then tap your new bookmark</>,
                <>Your token will be copied to the clipboard automatically</>,
              ].map((step, i) => (
                <li key={i} className="flex gap-2.5 text-[11px] text-white/60 leading-relaxed">
                  <span className="shrink-0 text-primary/50 font-mono font-bold mt-px">{i + 1}.</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            {/* Code block */}
            <div className="relative rounded-lg bg-black/60 border border-white/10 p-3 pr-16">
              <p className="font-mono text-[9px] text-white/50 leading-relaxed break-all select-all">
                {BOOKMARKLET}
              </p>
              <button
                type="button"
                onClick={copy}
                className="absolute top-2.5 right-2.5 flex items-center gap-1 px-2 py-1 rounded bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary font-mono text-[9px] transition-all"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 mt-3 text-[10px] text-white/40 font-mono">
              <Info className="w-3 h-3 shrink-0 mt-px text-primary/40" />
              <span>The Desktop app does not expose tokens readily — use discord.com in a browser for easiest retrieval.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const createSchema = z.object({
  token: z.string().min(10, "Token is required"),
  name: z.string().min(1, "Name is required").default("My Bot"),
});
type CreateFormValues = z.infer<typeof createSchema>;

export function CreateBotDialog() {
  const [open, setOpen] = useState(false);
  const createBot = useCreateBot();
  
  const form = useForm<CreateFormValues>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: "", token: "" }
  });

  const onSubmit = (data: CreateFormValues) => {
    createBot.mutate(
      { ...data, passcode: "", nitroSniper: false, bullyTargets: [], whitelistedGcs: [], gcAllowAll: false, commandPrefix: ".", rpcType: "PLAYING", isRunning: true },
      { onSuccess: () => { setOpen(false); form.reset(); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="h-10 px-4 bg-primary hover:bg-primary/90 text-black font-bold font-mono text-sm rounded-lg flex items-center gap-2 transition-all shadow-[0_0_15px_rgba(34,197,94,0.3)] hover:shadow-[0_0_25px_rgba(34,197,94,0.4)]">
          <Plus className="w-4 h-4" />
          Add Bot
        </button>
      </DialogTrigger>
      <DialogContent className="bg-black/95 border-white/10 sm:max-w-md p-0 overflow-hidden max-h-[90dvh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
        <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="px-6 py-5 flex items-center justify-between border-b border-white/8">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <DialogTitle className="font-mono text-sm uppercase tracking-widest text-white">
              Add New Bot
            </DialogTitle>
          </div>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 space-y-5">
          <CyberInput
            label="Display Name"
            placeholder="e.g. Main Account"
            {...form.register("name")}
            error={form.formState.errors.name?.message}
          />
          
          <CyberInput
            label="Discord Token"
            type="password"
            placeholder="Your user token"
            autoComplete="off"
            {...form.register("token")}
            error={form.formState.errors.token?.message}
          />

          <TokenGuide />

          <p className="text-xs text-muted-foreground font-mono bg-white/3 border border-white/8 rounded-lg p-3">
            Your token is stored securely and only visible to you. Never share it with anyone.
          </p>

          <button
            type="submit"
            disabled={createBot.isPending}
            className="w-full h-11 bg-primary hover:bg-primary/90 disabled:opacity-50 text-black font-bold font-mono text-sm rounded-lg flex items-center justify-center gap-2 transition-all"
          >
            {createBot.isPending ? "Connecting..." : "Connect Bot"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
