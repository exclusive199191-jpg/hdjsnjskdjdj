import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Eye,
  Globe2,
  KeyRound,
  Link2,
  Loader2,
  MailCheck,
  Phone,
  Search,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

type Breach = {
  Name?: string;
  Title?: string;
  Domain?: string;
  BreachDate?: string;
  PwnCount?: number;
  DataClasses?: string[];
};

type PublicProfile = {
  platform: string;
  username: string;
  profileUrl: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  website?: string;
  location?: string;
  company?: string;
  followers?: number;
  publicRepos?: number;
};

type EmailResult = { email: string; breachCount: number; breaches: Breach[] };
type UsernameResult = { username: string; profiles: PublicProfile[]; suggestedProfiles: Array<{ platform: string; url: string }> };
type WebsiteResult = { domain: string; website: string; records: Array<{ type: string; value: string; ttl?: number }>; recordsByType: Record<string, string[]> };
type PhoneResult = { phone: string; normalized: string | null; valid: boolean; note: string };

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
      tone === "success" && "border-emerald-300/20 bg-emerald-300/[0.06] text-emerald-100",
      tone === "muted" && "border-white/[0.08] bg-black/10 text-white/45",
    )}>
      {children}
    </div>
  );
}

function CheckHeader({ icon: Icon, title, description }: { icon: typeof Search; title: string; description: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 text-emerald-300" />
      <div>
        <h3 className="text-xs font-semibold">{title}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-white/35">{description}</p>
      </div>
    </div>
  );
}

export function SecurityExposurePanel() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [domain, setDomain] = useState("");
  const [phone, setPhone] = useState("");
  const [emailResult, setEmailResult] = useState<EmailResult | null>(null);
  const [passwordResult, setPasswordResult] = useState<{ compromised: boolean; count: number } | null>(null);
  const [usernameResult, setUsernameResult] = useState<UsernameResult | null>(null);
  const [websiteResult, setWebsiteResult] = useState<WebsiteResult | null>(null);
  const [phoneResult, setPhoneResult] = useState<PhoneResult | null>(null);

  const emailLookup = useMutation({
    mutationFn: async (value: string) => (await apiRequest("GET", `/api/security/breach-search?email=${encodeURIComponent(value)}`)).json() as Promise<EmailResult>,
    onSuccess: setEmailResult,
  });
  const passwordLookup = useMutation({
    mutationFn: async (value: string) => {
      const response = await apiRequest("POST", "/api/security/password-check", await sha1Parts(value));
      return response.json() as Promise<{ compromised: boolean; count: number }>;
    },
    onSuccess: result => { setPasswordResult(result); setPassword(""); },
  });
  const usernameLookup = useMutation({
    mutationFn: async (value: string) => (await apiRequest("GET", `/api/security/username-check?username=${encodeURIComponent(value)}`)).json() as Promise<UsernameResult>,
    onSuccess: setUsernameResult,
  });
  const websiteLookup = useMutation({
    mutationFn: async (value: string) => (await apiRequest("GET", `/api/security/website-check?domain=${encodeURIComponent(value)}`)).json() as Promise<WebsiteResult>,
    onSuccess: setWebsiteResult,
  });
  const phoneLookup = useMutation({
    mutationFn: async (value: string) => (await apiRequest("POST", "/api/security/phone-check", { phone: value })).json() as Promise<PhoneResult>,
    onSuccess: setPhoneResult,
  });

  const error = [emailLookup, passwordLookup, usernameLookup, websiteLookup, phoneLookup].find(item => item.isError)?.error as Error | undefined;

  return (
    <section className="relative overflow-hidden border border-emerald-300/15 bg-emerald-300/[0.025]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/70 to-transparent" />
      <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-emerald-300/25 bg-emerald-300/[0.08]">
            <ShieldCheck className="h-4 w-4 text-emerald-300" />
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300/75">Security desk</p>
            <h2 className="mt-1 text-sm font-semibold">Breach &amp; identity checks</h2>
            <p className="mt-1 max-w-2xl text-xs text-white/35">Public, rate-limited checks for an address or identity you own. Passwords are hashed in your browser and never sent.</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/25">
          <Eye className="h-3 w-3" /> no queries stored
        </span>
      </div>

      {error && <div className="px-5"><PanelMessage tone="danger">{error.message}</PanelMessage></div>}

      <div className="grid grid-cols-1 divide-y divide-white/[0.07] lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div className="space-y-6 p-5">
          <div>
            <CheckHeader icon={MailCheck} title="Email breach check" description="Uses XposedOrNot’s public email endpoint; no API key is required." />
            <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (email.trim()) emailLookup.mutate(email.trim().toLowerCase()); }}>
              <input type="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" autoComplete="email" className="min-w-0 flex-1 border border-white/10 bg-black/15 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-300/50" />
              <button type="submit" disabled={!email.trim() || emailLookup.isPending} className="h-9 px-3 bg-emerald-300 text-[11px] font-bold text-slate-950 hover:bg-emerald-200 disabled:opacity-40">
                {emailLookup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check"}
              </button>
            </form>
            {emailResult && (
              <PanelMessage tone={emailResult.breachCount ? "danger" : "success"}>
                <div className="flex items-center gap-2 font-semibold">
                  {emailResult.breachCount ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {emailResult.breachCount ? `${emailResult.breachCount} breach${emailResult.breachCount === 1 ? "" : "es"} found` : "No public breaches found"}
                </div>
                {!!emailResult.breaches.length && (
                  <div className="mt-3 space-y-2">
                    {emailResult.breaches.slice(0, 12).map((breach, index) => (
                      <div key={`${breach.Name || breach.Title}-${index}`} className="border border-red-200/15 bg-red-200/[0.04] p-2.5">
                        <p className="font-semibold text-red-100/90">{breach.Title || breach.Name || "Unnamed breach"}</p>
                        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-red-100/55">
                          {breach.Domain && <span>{breach.Domain}</span>}
                          {breach.BreachDate && <span>{breach.BreachDate}</span>}
                          {typeof breach.PwnCount === "number" && <span>{formatNumber(breach.PwnCount)} records</span>}
                        </div>
                        {!!breach.DataClasses?.length && <p className="mt-1 text-[10px] text-red-100/45">{breach.DataClasses.join(" · ")}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </PanelMessage>
            )}
          </div>

          <div className="border-t border-white/[0.07] pt-5">
            <CheckHeader icon={KeyRound} title="Password exposure" description="Only the first five SHA-1 characters leave the browser through a k-anonymous public range query." />
            <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (password) passwordLookup.mutate(password); }}>
              <input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Check a password" autoComplete="off" className="min-w-0 flex-1 border border-white/10 bg-black/15 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-300/50" />
              <button type="submit" disabled={!password || passwordLookup.isPending} className="h-9 px-3 bg-white/[0.08] text-[11px] font-bold text-white hover:bg-white/[0.14] disabled:opacity-40">
                {passwordLookup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check"}
              </button>
            </form>
            {passwordResult && <PanelMessage tone={passwordResult.compromised ? "danger" : "success"}>{passwordResult.compromised ? `Found ${formatNumber(passwordResult.count)} exposures — change this password.` : "This password was not found in the checked corpus."}</PanelMessage>}
          </div>

          <div className="border-t border-white/[0.07] pt-5">
            <CheckHeader icon={Phone} title="Phone format check" description="Normalizes a number locally. No keyless public phone-breach service is called." />
            <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (phone.trim()) phoneLookup.mutate(phone.trim()); }}>
              <input type="tel" value={phone} onChange={event => setPhone(event.target.value)} placeholder="+1 555 010 1234" autoComplete="tel" className="min-w-0 flex-1 border border-white/10 bg-black/15 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-300/50" />
              <button type="submit" disabled={!phone.trim() || phoneLookup.isPending} className="h-9 px-3 bg-white/[0.08] text-[11px] font-bold text-white hover:bg-white/[0.14] disabled:opacity-40">
                {phoneLookup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check"}
              </button>
            </form>
            {phoneResult && <PanelMessage tone={phoneResult.valid ? "success" : "danger"}>{phoneResult.valid ? <><strong>{phoneResult.normalized}</strong><br />{phoneResult.note}</> : "Enter a valid international phone number, for example +1 555 010 1234."}</PanelMessage>}
          </div>
        </div>

        <div className="space-y-6 p-5">
          <div>
            <CheckHeader icon={UserRound} title="Username & social discovery" description="Checks public GitHub and Reddit profiles, then provides direct links for other social platforms." />
            <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (username.trim()) usernameLookup.mutate(username.trim().replace(/^@/, "")); }}>
              <input value={username} onChange={event => setUsername(event.target.value)} placeholder="@username" autoComplete="off" className="min-w-0 flex-1 border border-white/10 bg-black/15 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-300/50" />
              <button type="submit" disabled={!username.trim() || usernameLookup.isPending} className="h-9 px-3 bg-white/[0.08] text-[11px] font-bold text-white hover:bg-white/[0.14] disabled:opacity-40">
                {usernameLookup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
              </button>
            </form>
            {usernameResult && (
              <div className="mt-4 space-y-2">
                {!usernameResult.profiles.length && <PanelMessage>No matching public GitHub or Reddit profile was returned.</PanelMessage>}
                {usernameResult.profiles.map(profile => (
                  <a key={profile.platform} href={profile.profileUrl} target="_blank" rel="noreferrer" className="block border border-white/[0.08] bg-black/10 p-3 transition-colors hover:border-emerald-300/30 hover:bg-white/[0.04]">
                    <div className="flex items-start gap-3">
                      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" /> : <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-300/10"><Link2 className="h-4 w-4 text-emerald-300" /></div>}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2"><p className="text-xs font-semibold">{profile.displayName || profile.username}</p><span className="text-[10px] text-emerald-300">{profile.platform} ↗</span></div>
                        <p className="mt-1 truncate text-[10px] text-white/35">@{profile.username}</p>
                        {profile.bio && <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-white/45">{profile.bio}</p>}
                        <div className="mt-2 flex flex-wrap gap-2 text-[9px] text-white/30">
                          {profile.location && <span>{profile.location}</span>}
                          {typeof profile.followers === "number" && <span>{formatNumber(profile.followers)} followers</span>}
                          {typeof profile.publicRepos === "number" && <span>{formatNumber(profile.publicRepos)} repos</span>}
                        </div>
                      </div>
                    </div>
                  </a>
                ))}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {usernameResult.suggestedProfiles.map(profile => <a key={profile.platform} href={profile.url} target="_blank" rel="noreferrer" className="border border-white/10 px-2 py-1 text-[10px] text-white/45 hover:border-emerald-300/30 hover:text-white">{profile.platform} ↗</a>)}
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-white/[0.07] pt-5">
            <CheckHeader icon={Globe2} title="Website & DNS report" description="Resolves public DNS records without fetching or executing anything from the submitted site." />
            <form className="mt-3 flex gap-2" onSubmit={event => { event.preventDefault(); if (domain.trim()) websiteLookup.mutate(domain.trim()); }}>
              <input value={domain} onChange={event => setDomain(event.target.value)} placeholder="example.com" autoComplete="url" className="min-w-0 flex-1 border border-white/10 bg-black/15 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-emerald-300/50" />
              <button type="submit" disabled={!domain.trim() || websiteLookup.isPending} className="h-9 px-3 bg-white/[0.08] text-[11px] font-bold text-white hover:bg-white/[0.14] disabled:opacity-40">
                {websiteLookup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Resolve"}
              </button>
            </form>
            {websiteResult && (
              <PanelMessage tone={websiteResult.records.length ? "success" : "muted"}>
                <a href={websiteResult.website} target="_blank" rel="noreferrer" className="font-semibold text-emerald-200 hover:underline">{websiteResult.domain} ↗</a>
                <div className="mt-3 space-y-2">
                  {websiteResult.records.length ? Object.entries(websiteResult.recordsByType).map(([type, values]) => <div key={type}><span className="mr-2 text-[10px] font-bold text-white/55">{type}</span><span className="break-all text-[10px] text-white/45">{values.join(" · ")}</span></div>) : <p>No public DNS records were returned.</p>}
                </div>
              </PanelMessage>
            )}
          </div>

          <PanelMessage><Database className="mr-1 inline h-3 w-3" /> Public checks are informational only. They do not identify a private person, reveal exact physical location, or store submitted values.</PanelMessage>
        </div>
      </div>
    </section>
  );
}