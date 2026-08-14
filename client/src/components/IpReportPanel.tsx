import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Globe2, Loader2, MapPinned, Network, Search, ShieldAlert } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

type IpReport = {
  ip: string;
  type: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  postal: string | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  hostname: string | null;
  connection: { isp: string | null; organization: string | null; asn: string | null; domain: string | null };
  security: { vpn: boolean | null; proxy: boolean | null; tor: boolean | null; hosting: boolean | null };
  rdap: { name: string | null; handle: string | null; startAddress: string | null; endAddress: string | null; country: string | null } | null;
  mapUrl: string | null;
};

function Value({ label, value }: { label: string; value: unknown }) {
  return <div className="min-w-0"><p className="text-[9px] uppercase tracking-[0.16em] text-white/25">{label}</p><p className="mt-1 break-words text-xs text-white/70">{value == null || value === "" ? "—" : String(value)}</p></div>;
}

export function IpReportPanel() {
  const [ip, setIp] = useState("");
  const [report, setReport] = useState<IpReport | null>(null);
  const lookup = useMutation({
    mutationFn: async (value: string) => (await apiRequest("GET", `/api/osint/ip-check?ip=${encodeURIComponent(value)}`)).json() as Promise<IpReport>,
    onSuccess: setReport,
  });

  return (
    <section className="border border-cyan-300/15 bg-cyan-300/[0.025]">
      <div className="flex flex-col gap-3 border-b border-white/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-cyan-300/25 bg-cyan-300/[0.08]"><Globe2 className="h-4 w-4 text-cyan-300" /></div>
          <div><p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300/75">Network desk</p><h2 className="mt-1 text-sm font-semibold">Public IP report</h2><p className="mt-1 text-xs text-white/35">Coarse geolocation, reverse DNS, network ownership, RDAP, and public security flags.</p></div>
        </div>
        <span className="text-[10px] text-white/25">iOS + desktop web</span>
      </div>
      <div className="p-5">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={event => { event.preventDefault(); if (ip.trim()) lookup.mutate(ip.trim()); }}>
          <input value={ip} onChange={event => setIp(event.target.value)} placeholder="8.8.8.8 or IPv6 address" inputMode="decimal" autoComplete="off" className="h-10 min-w-0 flex-1 border border-white/10 bg-black/15 px-3 text-xs text-white outline-none placeholder:text-white/25 focus:border-cyan-300/50" />
          <button type="submit" disabled={!ip.trim() || lookup.isPending} className="inline-flex h-10 items-center justify-center gap-2 bg-cyan-300 px-4 text-xs font-bold text-slate-950 hover:bg-cyan-200 disabled:opacity-40">
            {lookup.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />} Run report
          </button>
        </form>
        {lookup.isError && <div className="mt-4 border border-red-300/20 bg-red-300/[0.06] px-3 py-2.5 text-xs text-red-200">{(lookup.error as Error).message}</div>}
        {report && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-3 border border-white/[0.08] bg-black/10 p-4 sm:grid-cols-4">
              <Value label="IP address" value={report.ip} />
              <Value label="Type" value={report.type} />
              <Value label="Hostname" value={report.hostname} />
              <Value label="Timezone" value={report.timezone} />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="border border-white/[0.08] bg-black/10 p-4"><div className="mb-3 flex items-center gap-2 text-xs font-semibold"><MapPinned className="h-3.5 w-3.5 text-cyan-300" /> Approximate location</div><div className="grid grid-cols-2 gap-3"><Value label="City" value={report.city} /><Value label="Region" value={report.region} /><Value label="Country" value={report.countryCode ? `${report.country} (${report.countryCode})` : report.country} /><Value label="Postal" value={report.postal} /><Value label="Latitude" value={report.latitude} /><Value label="Longitude" value={report.longitude} /></div>{report.mapUrl && <a href={report.mapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-[10px] text-cyan-300 hover:underline">Open approximate map ↗</a>}</div>
              <div className="border border-white/[0.08] bg-black/10 p-4"><div className="mb-3 flex items-center gap-2 text-xs font-semibold"><Network className="h-3.5 w-3.5 text-cyan-300" /> Network ownership</div><div className="grid grid-cols-2 gap-3"><Value label="ISP" value={report.connection?.isp} /><Value label="Organization" value={report.connection?.organization} /><Value label="ASN" value={report.connection?.asn} /><Value label="Domain" value={report.connection?.domain} /><Value label="RDAP range" value={report.rdap ? `${report.rdap.startAddress || "—"} – ${report.rdap.endAddress || "—"}` : null} /><Value label="RDAP handle" value={report.rdap?.handle} /></div></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border border-white/[0.08] bg-black/10 p-3 text-[10px] text-white/55">
              <ShieldAlert className="h-3.5 w-3.5 text-cyan-300" /> Public flags:
              {Object.entries(report.security || {}).map(([key, value]) => <span key={key} className={value ? "border border-amber-300/25 bg-amber-300/10 px-2 py-1 text-amber-200" : "border border-white/10 px-2 py-1"}>{key}: {value == null ? "unknown" : value ? "yes" : "no"}</span>)}
              <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-emerald-300" />
            </div>
            <p className="text-[10px] leading-relaxed text-white/25">IP geolocation is approximate city/ISP-level context. It cannot reliably identify a person or provide an exact physical address.</p>
          </div>
        )}
      </div>
    </section>
  );
}