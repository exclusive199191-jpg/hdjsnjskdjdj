import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Database, Eye, KeyRound, Loader2, Search, ShieldCheck } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type HibpBreach = {
  Name?: string;
  Title?: string;
  Domain?: string;
  BreachDate?: string;
  PwnCount?: number;
  DataClasses?: string[];
};

type XposedBreach = {
  breachID?: string;
  domain?: string;
  breachedDate?: string;
  exposedData?: string[];
  exposedRecords?: number;
  exposureDescription?: string;
  industry?: string;
  logo?: string;
  referenceURL?: string;
  verified?: boolean;
};

async function sha1Parts(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  const hex = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
  return { hashPrefix: hex.slice(0, 5), hashSuffix: hex.slice(5) };
}

function formatNumber(value?: number) {
  return typeof value === "number" ? new Intl.NumberFormat().format(value) : "—";
}

function PanelMessage({ children, tone = "muted" }: { children: React.ReactNode; tone?: "muted" | "danger" | "success" }) {
  return (
    <div className={cn(
      "mt-4 border px-3 py-2.5 text-xs",
      tone === "danger" && "border-red-300/20 bg-red-300/[0.06] text-red-200",
      tone === "success" && "border-primary/20 bg-primary/[0.06] text-primary/90",
      tone === "muted" && "border-white/[0.08] bg-black/10 text-white/45",
    )}>
      {children}
    </div>
  );
}

export function SecurityExposurePanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [xposedQuery, setXposedQuery] = useState("");
  const [emailResult, setEmailResult] = useState<{ email: string; breachCount: number; breaches: HibpBreach[] } | null>(null);
  const [passwordResult, setPasswordResult] = useState<{ compromised: boolean; count: number } | null>(null);
  const [xposedResult, setXposedResult] = useState<XposedBreach[] | null>(null);

  const providers = useQuery<{
    hibpEmailSearch: boolean;
    hibpPasswordSearch: boolean;
    xposedOrNotBreachCatalog: boolean;
  }>({
    queryKey: ["/api/security/providers"],
    queryFn: async () => (await apiRequest("GET", "/api/security/providers")).json(),
  });

  const emailLookup = useMutation({
    mutationFn: async (value: string) => {
      const response = await apiRequest("GET", `/api/security/breach-search?email=${encodeURIComponent(value)}`);
      return response.json();
    },
    onSuccess: setEmailResult,
  });

  const passwordLookup = useMutation({
    mutationFn: async (value: string) => {
      const parts = await sha1Parts(value);
      const response = await apiRequest("POST", "/api/security/password-check", parts);
      return response.json();
    },
    onSuccess: (result) => {
      setPasswordResult(result);
      setPassword("");
    },
  });

  const xposedLookup = useMutation({
    mutationFn: async (value: string) => {
      const isDomain = value.includes(".") && !value.includes(" ");
      const query = new URLSearchParams(isDomain ? { domain: value } : { breach_id: value });
      const response = await apiRequest("GET", `/api/security/xposed-breaches?${query.toString()}`);
      return response.json() as Promise<{ breaches: XposedBreach[] }>;
    },
    onSuccess: (result) => setXposedResult(result.breaches),
  });

  return (
    <section className="relative overflow-hidden border border-emerald-300/15 bg-emerald-300/[0.025]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
      <div className="flex flex-col gap-3 px-5 py-4 border-b border-white/[0.08] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-emerald-300/25 bg-emerald-300/[0.08]">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/75">Security desk</p>
            <h2 className="mt-1 text-sm font-semibold">Exposure monitor</h2>
            <p className="mt-1 text-xs text-white/35">Check your email and passwords against public breach intelligence.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] text-white/25 uppercase tracking-wider">
          <Eye className="w-3 h-3" /> queries are not stored
        </span>
      </div>

      <div className="grid grid-cols-1 divide-y divide-white/[0.07] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div className="p-5 space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-emerald-300" />
              <h3 className="text-xs font-semibold">Email exposure</h3>
            </div>
            <p className="mt-1 text-[11px] text-white/35">Uses HIBP’s authenticated breach search. Only check an address you control.</p>
            <form className="mt-3 flex gap-2" onSubmit={event => {
              event.preventDefault();
              if (email.trim()) emailLookup.mutate(email.trim().toLowerCase());
            }}>
              <input
                type="email"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="you@example.com"
                className="min-w-0 flex-1 h-9 border border-white/10 bg-black/15 px-3 text-xs text-white placeholder:text-white/25 outline-none focus:border-emerald-300/50"
              />
              <button type="submit" disabled={!email.trim() || emailLookup.isPending || !providers.data?.hibpEmailSearch} className="h-9 px-3 bg-emerald-300 text-slate-950 text-[11px] font-bold hover:bg-emerald-200 disabled:opacity-40">
                {emailLookup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Check"}
              </button>
            </form>
            {!providers.isLoading && !providers.data?.hibpEmailSearch && (
              <PanelMessage>Set the <code className="text-emerald-200">HIBP_API_KEY</code> secret to enable email searches.</PanelMessage>
            )}
            {emailLookup.isError && <PanelMessage tone="danger">{(emailLookup.error as Error).message}</PanelMessage>}
            {emailResult && (
              <PanelMessage tone={emailResult.breachCount ? "danger" : "success"}>
                <div className="flex items-center gap-2 font-semibold">
                  {emailResult.breachCount ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  {emailResult.breachCount ? `${emailResult.breachCount} breach${emailResult.breachCount === 1 ? "" : "es"} found` : "No breaches found"}
                </div>
                {!!emailResult.breaches.length && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {emailResult.breaches.map(breach => <span key={breach.Name} className="border border-red-200/15 bg-red-200/[0.06] px-2 py-1 text-[10px]">{breach.Title || breach.Name || "Unnamed breach"}</span>)}
                  </div>
                )}
              </PanelMessage>
            )}
          </div>

          <div className="border-t border-white/[0.07] pt-5">
            <div className="flex items-center gap-2">
              <KeyRound className="w-3.5 h-3.5 text-emerald-300" />
              <h3 className="text-xs font-semibold">Password exposure</h3>
            </div>
            <p className="mt-1 text-[11px] text-white/35">The password is hashed in your browser; HIBP receives only the first five hash characters.</p>
            <form className="mt-3 flex gap-2" onSubmit={event => {
              event.preventDefault();
              if (password) passwordLookup.mutate(password);
            }}>
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="Enter a password to check"
                className="min-w-0 flex-1 h-9 border border-white/10 bg-black/15 px-3 text-xs text-white placeholder:text-white/25 outline-none focus:border-emerald-300/50"
              />
              <button type="submit" disabled={!password || passwordLookup.isPending} className="h-9 px-3 bg-white/[0.08] text-white text-[11px] font-bold hover:bg-white/[0.14] disabled:opacity-40">
                {passwordLookup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Check"}
              </button>
            </form>
            {passwordLookup.isError && <PanelMessage tone="danger">{(passwordLookup.error as Error).message}</PanelMessage>}
            {passwordResult && (
              <PanelMessage tone={passwordResult.compromised ? "danger" : "success"}>
                {passwordResult.compromised
                  ? `Found ${formatNumber(passwordResult.count)} exposures — change this password.`
                  : "This password was not found in the checked corpus."}
              </PanelMessage>
            )}
          </div>
        </div>

        <div className="p-5">
          <div className="flex items-center gap-2">
            <Database className="w-3.5 h-3.5 text-emerald-300" />
            <h3 className="text-xs font-semibold">Breach catalog</h3>
          </div>
          <p className="mt-1 text-[11px] text-white/35">Search XposedOrNot by domain or breach ID for verified incident context.</p>
          <form className="mt-3 flex gap-2" onSubmit={event => {
            event.preventDefault();
            if (xposedQuery.trim()) xposedLookup.mutate(xposedQuery.trim());
          }}>
            <input
              value={xposedQuery}
              onChange={event => setXposedQuery(event.target.value)}
              placeholder="example.com or breach ID"
              className="min-w-0 flex-1 h-9 border border-white/10 bg-black/15 px-3 text-xs text-white placeholder:text-white/25 outline-none focus:border-emerald-300/50"
            />
            <button type="submit" disabled={!xposedQuery.trim() || xposedLookup.isPending} className="h-9 px-3 bg-white/[0.08] text-white text-[11px] font-bold hover:bg-white/[0.14] disabled:opacity-40">
              {xposedLookup.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Search"}
            </button>
          </form>
          {xposedLookup.isError && <PanelMessage tone="danger">{(xposedLookup.error as Error).message}</PanelMessage>}
          {xposedResult && (
            <div className="mt-4 space-y-2">
              {!xposedResult.length && <PanelMessage tone="success">No matching catalog entries.</PanelMessage>}
              {xposedResult.slice(0, 8).map(breach => (
                <div key={breach.breachID} className="border border-white/[0.08] bg-black/10 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-white/80">{breach.breachID || "Unnamed breach"}</p>
                      <p className="mt-1 truncate text-[10px] text-white/35">{breach.domain || "Unknown domain"} · {breach.breachedDate || "Date unavailable"}</p>
                    </div>
                    {breach.verified && <span className="shrink-0 text-[9px] uppercase tracking-wider text-emerald-300">verified</span>}
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-white/40 line-clamp-2">{breach.exposureDescription || "No description provided."}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-white/35">
                    {typeof breach.exposedRecords === "number" && <span>{formatNumber(breach.exposedRecords)} records</span>}
                    {breach.industry && <span>· {breach.industry}</span>}
                    {breach.exposedData?.slice(0, 3).map(item => <span key={item} className="border border-white/10 px-1.5 py-0.5">{item}</span>)}
                  </div>
                </div>
              ))}
              {xposedResult.length > 8 && <p className="text-[10px] text-white/25">Showing 8 of {xposedResult.length} matches.</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}