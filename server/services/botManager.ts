import { Client, RichPresence, CustomStatus } from 'discord.js-selfbot-v13';
import { storage } from '../storage';
import { type BotConfig } from '@shared/schema';
import { HttpsProxyAgent } from 'https-proxy-agent';

// API Keys (OSINT) — loaded from environment secrets
const SNUSBASE_API_KEY    = process.env.SNUSBASE_API_KEY    || '';
const SNUSBASE_BETA_KEY   = process.env.SNUSBASE_BETA_KEY   || '';
const LEAKCHECK_API_KEY   = process.env.LEAKCHECK_API_KEY   || '';
const INTELVAULT_API_KEY  = process.env.INTELVAULT_API_KEY  || '';
const SEON_API_KEY        = process.env.SEON_API_KEY        || '';
const OSINTCAT_API_KEY    = process.env.OSINTCAT_API_KEY    || '';
const BREACHHUB_API_KEY   = process.env.BREACHHUB_API_KEY   || '';
const LUPERLY_API_KEY     = process.env.LUPERLY_API_KEY     || '';
const SWATTED_API_KEYS    = (process.env.SWATTED_API_KEYS || '').split(',').filter(Boolean);
const SWATTED_SECURITY_PHRASE = process.env.SWATTED_SECURITY_PHRASE || '';
const INTELBASE_API_KEY   = process.env.INTELBASE_API_KEY   || '';
const PARALLAX_API_KEY    = 'csd_424a5964e29bfef6e3d79912';

const activeClients = new Map<number, Client>();
const clientConfigs = new Map<number, BotConfig>();
const bullyIntervals = new Map<number, { running: boolean, channelId: string }>();
const loveLoops = new Map<number, boolean>();
const trappedUsers = new Map<number, Map<string, string>>();
const snipedMessages = new Map<number, Map<string, Array<{ content: string, author: string, timestamp: number }>>>();
const autoReactConfigs = new Map<number, { userOption: string, emojis: string[] }>();
const mockTargets = new Map<number, string>(); // botId -> userId to mock
const activeSpams = new Map<number, boolean>();
const abIntervals = new Map<number, { running: boolean }>();
const activeDmBlasts = new Map<number, boolean>();
const botErrorLogs = new Map<number, Array<{ ts: number; msg: string }>>();
const activeServerEnds = new Map<number, boolean>();
const activeSpamAlls = new Map<number, boolean>();
const rpcIntervals = new Map<number, NodeJS.Timeout>();
const statusMoverIntervals = new Map<number, { stop: () => void }>();
const STATUS_MOVER_INTERVAL_MS = 5000;
const botStartTimes = new Map<number, number>();
const websiteStatsIntervals = new Map<number, NodeJS.Timeout>();
const afkCache = new Map<number, { active: boolean; reason: string; since: number }>();
const voiceConnections = new Map<number, any>();

// ── OSINT Helper Functions ──────────────────────────────────────────────────

async function snusbaseSearch(term: string, type: string): Promise<any> {
    try {
        const res = await fetch('https://api.snusbase.com/data/search', {
            method: 'POST',
            headers: {
                'Auth': SNUSBASE_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ terms: [term], types: [type], wildcard: false }),
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function snusbaseBetaSearch(term: string, type: string): Promise<any> {
    try {
        const res = await fetch('https://beta.snusbase.com/data/search', {
            method: 'POST',
            headers: {
                'Auth': SNUSBASE_BETA_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ terms: [term], types: [type], wildcard: false }),
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function leakcheckQuery(term: string, type = 'auto'): Promise<any> {
    try {
        const res = await fetch(`https://leakcheck.io/api/v2/query/${encodeURIComponent(term)}?type=${type}`, {
            headers: { 'X-API-Key': LEAKCHECK_API_KEY },
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function seonEmailCheck(email: string): Promise<any> {
    try {
        const res = await fetch(`https://api.seon.io/SeonRestService/fraud-api/v2/email-api/${encodeURIComponent(email)}`, {
            headers: {
                'X-API-KEY': SEON_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function seonPhoneCheck(phone: string): Promise<any> {
    try {
        // SEON expects E.164 format with leading +
        const e164 = phone.startsWith('+') ? phone : `+${phone.replace(/^\+?/, '')}`;
        const res = await fetch(`https://api.seon.io/SeonRestService/fraud-api/v2/phone-api/${encodeURIComponent(e164)}`, {
            headers: {
                'X-API-KEY': SEON_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        return await res.json();
    } catch {
        return null;
    }
}

// Generic resilient OSINT helper — tries multiple endpoint patterns / auth styles
// in sequence, returns the first successful JSON response (or { raw: text } if it
// returned 200 but wasn't JSON). Each request times out fast so a wrong endpoint
// never stalls the report.
async function tryEndpoints(endpoints: { url: string; method?: string; headers?: any; body?: any }[]): Promise<any> {
    for (const ep of endpoints) {
        try {
            const ctrl = new AbortController();
            const timer = setTimeout(() => ctrl.abort(), 6000);
            const res = await fetch(ep.url, {
                method: ep.method || 'GET',
                headers: ep.headers,
                body: ep.body,
                signal: ctrl.signal,
            });
            clearTimeout(timer);
            if (!res.ok) continue;
            const text = await res.text();
            if (!text) continue;
            try { return JSON.parse(text); } catch { return { raw: text.slice(0, 4000) }; }
        } catch { /* try next */ }
    }
    return null;
}

async function breachhubQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    return tryEndpoints([
        { url: `https://api.breachhub.io/v1/search?q=${t}&type=${type}`, headers: { 'X-API-Key': BREACHHUB_API_KEY } },
        { url: `https://breachhub.io/api/v1/search?q=${t}`,              headers: { 'Authorization': `Bearer ${BREACHHUB_API_KEY}` } },
        { url: `https://breachhub.io/api/search`, method: 'POST',
          headers: { 'Authorization': `Bearer ${BREACHHUB_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type }) },
        { url: `https://api.breachhub.com/search?q=${t}`, headers: { 'X-API-Key': BREACHHUB_API_KEY } },
    ]);
}

async function luperlyQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    return tryEndpoints([
        { url: `https://luperly.vercel.app/api/search?q=${t}&type=${type}`, headers: { 'X-API-Key': LUPERLY_API_KEY } },
        { url: `https://luperly.vercel.app/api/lookup?q=${t}`,              headers: { 'Authorization': `Bearer ${LUPERLY_API_KEY}` } },
        { url: `https://luperly.vercel.app/api/v1/search`, method: 'POST',
          headers: { 'X-API-Key': LUPERLY_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type }) },
        { url: `https://luperly.vercel.app/api/${type}/${t}`, headers: { 'X-API-Key': LUPERLY_API_KEY } },
    ]);
}

async function swattedQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    // Rotate through the keys (use a different one each call to spread quota)
    const key = SWATTED_API_KEYS[Math.floor(Math.random() * SWATTED_API_KEYS.length)];
    const sec = SWATTED_SECURITY_PHRASE;
    return tryEndpoints([
        { url: `https://swatted.wtf/api/v1/search?q=${t}&type=${type}`, headers: { 'X-API-Key': key, 'X-Security-Phrase': sec } },
        { url: `https://swatted.wtf/api/lookup?q=${t}`,                 headers: { 'Authorization': `Bearer ${key}`, 'X-Security-Phrase': sec } },
        { url: `https://api.swatted.wtf/v1/search`, method: 'POST',
          headers: { 'X-API-Key': key, 'X-Security-Phrase': sec, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type, security_phrase: sec }) },
        { url: `https://swatted.wtf/api/${type}/${t}`, headers: { 'X-API-Key': key, 'X-Security-Phrase': sec } },
    ]);
}

async function intelvaultQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    return tryEndpoints([
        { url: `https://api.intelvault.io/v1/search?q=${t}&type=${type}`, headers: { 'X-API-Key': INTELVAULT_API_KEY } },
        { url: `https://intelvault.io/api/v1/search?q=${t}`,              headers: { 'Authorization': `Bearer ${INTELVAULT_API_KEY}` } },
        { url: `https://intelvault.io/api/search`, method: 'POST',
          headers: { 'Authorization': `Bearer ${INTELVAULT_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type }) },
        { url: `https://api.intelvault.io/lookup/${type}/${t}`, headers: { 'X-API-Key': INTELVAULT_API_KEY } },
    ]);
}

async function osintcatQuery(term: string, type: string): Promise<any> {
    const t = encodeURIComponent(term);
    return tryEndpoints([
        { url: `https://api.osintcat.com/v1/search?q=${t}&type=${type}`, headers: { 'X-API-Key': OSINTCAT_API_KEY } },
        { url: `https://osintcat.com/api/v1/search?q=${t}`,              headers: { 'Authorization': `Bearer ${OSINTCAT_API_KEY}` } },
        { url: `https://osintcat.com/api/search`, method: 'POST',
          headers: { 'Authorization': `Bearer ${OSINTCAT_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: term, type }) },
        { url: `https://api.osintcat.com/${type}/${t}`, headers: { 'X-API-Key': OSINTCAT_API_KEY } },
    ]);
}

// ── IntelBase — email account-discovery API ───────────────────────────────────
async function intelbaseEmailQuery(email: string): Promise<any> {
    if (!INTELBASE_API_KEY) return null;
    const t = encodeURIComponent(email);
    const headers: Record<string, string> = {
        'Authorization': `Bearer ${INTELBASE_API_KEY}`,
        'X-Api-Key': INTELBASE_API_KEY,
        'Content-Type': 'application/json',
    };
    const endpoints = [
        { url: `https://intelbase.is/api/v1/search/email?query=${t}`,   headers },
        { url: `https://intelbase.is/api/v1/email?query=${t}`,          headers },
        { url: `https://intelbase.is/api/email?email=${t}`,             headers },
        { url: `https://api.intelbase.is/v1/search?type=email&q=${t}`,  headers },
        { url: `https://intelbase.is/api/v1/lookup/email/${t}`,         headers },
    ];
    return tryEndpoints(endpoints);
}

async function parallaxQuery(query: string): Promise<any> {
    try {
        const res = await fetch('http://csintduck.cc/api/parallax/query', {
            method: 'POST',
            headers: {
                'X-API-Key': PARALLAX_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query }),
            signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Walk an arbitrary object/array, pulling out values keyed by names that look
// like the requested categories. Used to surface useful fields from APIs whose
// response schema we don't know in advance.
function harvestFields(data: any, into: { emails?: Set<string>; passwords?: Set<string>; usernames?: Set<string>; names?: Set<string>; phones?: Set<string>; ips?: Set<string>; addresses?: Set<string>; dobs?: Set<string>; sources?: Set<string> }, depth = 0): number {
    if (data == null || depth > 6) return 0;
    let count = 0;
    if (Array.isArray(data)) {
        for (const v of data) count += harvestFields(v, into, depth + 1);
        return count;
    }
    if (typeof data !== 'object') return 0;
    const addrParts: string[] = [];
    for (const [rawK, v] of Object.entries(data)) {
        const k = rawK.toLowerCase();
        if (v == null || v === '') continue;
        if (typeof v === 'object') { count += harvestFields(v, into, depth + 1); continue; }
        const str = String(v).trim();
        if (!str) continue;
        if (into.emails && /(^|_)e?mail$/.test(k))                        into.emails.add(str);
        else if (into.passwords && (k === 'password' || k === 'pass' || k === 'plaintext' || k === 'pwd')) into.passwords.add(str);
        else if (into.usernames && (k === 'username' || k === 'user' || k === 'login' || k === 'handle' || k === 'nick' || k === 'nickname')) into.usernames.add(str);
        else if (into.names && (k === 'name' || k === 'fullname' || k === 'full_name' || k === 'realname' || k === 'firstname' || k === 'first_name' || k === 'lastname' || k === 'last_name')) into.names.add(str);
        else if (into.phones && (k === 'phone' || k === 'phonenumber' || k === 'phone_number' || k === 'mobile' || k === 'tel')) into.phones.add(str);
        else if (into.ips && (k === 'ip' || k === 'lastip' || k === 'last_ip' || k === 'ipaddress' || k === 'ip_address')) into.ips.add(str);
        else if (into.dobs && (k === 'dob' || k === 'birthdate' || k === 'birthday' || k === 'date_of_birth')) into.dobs.add(str);
        else if (into.sources && (k === 'source' || k === 'database' || k === 'breach' || k === 'db' || k === 'leak')) into.sources.add(str);
        else if (k === 'address' || k === 'street' || k === 'address1' || k === 'addr') addrParts.push(str);
        else if (k === 'city' || k === 'town')           addrParts.push(str);
        else if (k === 'state' || k === 'region')        addrParts.push(str);
        else if (k === 'zip' || k === 'zipcode' || k === 'postal' || k === 'postalcode' || k === 'postcode') addrParts.push(str);
        else if (k === 'country')                        addrParts.push(str);
        count++;
    }
    if (into.addresses && addrParts.length) {
        const joined = addrParts.join(', ');
        if (joined.length > 4) into.addresses.add(joined);
    }
    return count;
}

// Pretty ANSI block summarising what Breachhub + Luperly + Swatted returned for
// a given term. Empty string if all three came back empty / unreachable, so it's
// safe to concatenate into any report.
async function extraOsintBlock(term: string, kind: 'email' | 'phone' | 'username' | 'ip' | 'discord'): Promise<string> {
    // Map our kinds to a "type" parameter many breach APIs accept
    const apiType = kind === 'discord' ? 'username' : kind;

    const isEmail = kind === 'email';
    const [bh, lu, sw, iv, oc, ib] = await Promise.all([
        breachhubQuery(term, apiType),
        luperlyQuery(term, apiType),
        swattedQuery(term, apiType),
        intelvaultQuery(term, apiType),
        osintcatQuery(term, apiType),
        isEmail ? intelbaseEmailQuery(term) : Promise.resolve(null),
    ]);

    const C = (n: number) => `\u001b[1;${n}m`;
    const CY = C(36), YE = C(33), RE = C(31), GY = C(30), MA = C(35), GR = C(32), RST = '\u001b[0m';
    const SUB = '─'.repeat(50);
    const head = (t: string) => `${CY}${SUB}${RST}\n${CY}[ ${t} ]${RST}\n`;

    const sources    = new Set<string>();
    const emails     = new Set<string>();
    const passwords  = new Set<string>();
    const usernames  = new Set<string>();
    const names      = new Set<string>();
    const phones     = new Set<string>();
    const ips        = new Set<string>();
    const addresses  = new Set<string>();
    const dobs       = new Set<string>();

    const buckets = { sources, emails, passwords, usernames, names, phones, ips, addresses, dobs };
    let totalFields = 0;
    if (bh) totalFields += harvestFields(bh, buckets);
    if (lu) totalFields += harvestFields(lu, buckets);
    if (sw) totalFields += harvestFields(sw, buckets);
    if (iv) totalFields += harvestFields(iv, buckets);
    if (oc) totalFields += harvestFields(oc, buckets);

    const reachable: string[] = [];
    if (bh) reachable.push('Breachhub');
    if (lu) reachable.push('Luperly');
    if (sw) reachable.push('Swatted.wtf');
    if (iv) reachable.push('IntelVault');
    if (oc) reachable.push('OSINTCat');
    if (ib) reachable.push('IntelBase');

    // ── IntelBase: extract registered services ────────────────────────────────
    let ibServicesBlock = '';
    if (ib && isEmail) {
        // IntelBase returns a list of services/accounts the email is registered on.
        // Response shape may vary; we try the common paths.
        const serviceList: string[] = [];
        const tryExtractServices = (data: any) => {
            if (!data) return;
            // Common shapes: { accounts: [...] }, { sites: [...] }, { services: [...] }, { results: [...] }
            const arr = data.accounts ?? data.sites ?? data.services ?? data.results ?? data.data ?? (Array.isArray(data) ? data : null);
            if (Array.isArray(arr)) {
                for (const item of arr) {
                    if (typeof item === 'string') { serviceList.push(item); continue; }
                    if (typeof item === 'object' && item) {
                        const name = item.name ?? item.site ?? item.service ?? item.platform ?? item.domain ?? item.source;
                        if (name) serviceList.push(String(name));
                    }
                }
            }
            // Flat key → bool/object shape: { facebook: true, twitter: { registered: true }, ... }
            if (typeof data === 'object' && !Array.isArray(data)) {
                for (const [k, v] of Object.entries<any>(data)) {
                    if (k === 'accounts' || k === 'sites' || k === 'services' || k === 'results' || k === 'data') continue;
                    if (v === true || (typeof v === 'object' && v?.registered)) serviceList.push(k);
                }
            }
        };
        tryExtractServices(ib);
        if (ib.data) tryExtractServices(ib.data);
        if (ib.results) tryExtractServices(ib.results);

        // Deduplicate and capitalise
        const unique = Array.from(new Set(serviceList.map(s => s.trim()).filter(Boolean)));
        if (unique.length > 0) {
            ibServicesBlock = head('INTELBASE · REGISTERED SERVICES');
            ibServicesBlock += `  ${YE}Found on ${unique.length} service(s):${RST}\n`;
            unique.forEach(s => { ibServicesBlock += `    ${GR}•${RST} ${s}\n`; });
        } else if (reachable.includes('IntelBase')) {
            ibServicesBlock = head('INTELBASE · REGISTERED SERVICES');
            ibServicesBlock += `  ${GY}— no registered accounts found —${RST}\n`;
        }
    }

    if (reachable.length === 0) return '';

    let r = head('EXTRA OSINT (Breachhub · Luperly · Swatted · IntelVault · OSINTCat · IntelBase)');
    r += `  ${YE}Reached:${RST}    ${reachable.join(', ')}\n`;
    r += `  ${YE}Fields:${RST}     ${totalFields}\n`;
    if (sources.size)   r += `  ${YE}Sources (${sources.size}):${RST} ${Array.from(sources).join(', ')}\n`;
    if (names.size)     r += `  ${YE}Names:${RST}      ${Array.from(names).join(', ')}\n`;
    if (usernames.size) r += `  ${YE}Usernames:${RST}  ${Array.from(usernames).join(', ')}\n`;
    if (emails.size)    r += `  ${YE}Emails:${RST}     ${Array.from(emails).join(', ')}\n`;
    if (phones.size)    r += `  ${YE}Phones:${RST}     ${Array.from(phones).join(', ')}\n`;
    if (ips.size)       r += `  ${YE}IPs:${RST}        ${Array.from(ips).join(', ')}\n`;
    if (dobs.size)      r += `  ${YE}DOB:${RST}        ${Array.from(dobs).join(', ')}\n`;
    if (addresses.size) {
        r += `  ${YE}Addresses:${RST}\n`;
        Array.from(addresses).forEach(a => r += `    ${MA}•${RST} ${a}\n`);
    }
    if (passwords.size) {
        r += `  ${YE}Passwords (${passwords.size}):${RST}\n`;
        Array.from(passwords).forEach(p => r += `    ${RE}•${RST} ${p}\n`);
    }
    if (totalFields === 0 && !ibServicesBlock) {
        r += `  ${GY}— sources reachable but no fields recovered for this query —${RST}\n`;
    }
    if (ibServicesBlock) r += ibServicesBlock;
    return r;
}

async function ipApiLookup(ip: string): Promise<any> {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query`);
        return await res.json();
    } catch {
        return null;
    }
}

async function ipInfoLookup(ip: string): Promise<any> {
    try {
        const res = await fetch(`https://ipinfo.io/${ip}/json`);
        return await res.json();
    } catch {
        return null;
    }
}

async function phoneVerify(phone: string): Promise<any> {
    try {
        const res = await fetch(`https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(phone)}`);
        return await res.json();
    } catch {
        return null;
    }
}

function staticMapUrl(lat: number, lon: number, zoom = 11): string {
    // Yandex static maps — keyless, returns a PNG, supports a pin marker.
    // pt=lon,lat,style ; "pm2rdl" = round red large pin.
    return `https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=${zoom}&size=600,400&l=map&pt=${lon},${lat},pm2rdl`;
}

async function nominatimReverse(lat: number, lon: number): Promise<any> {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'NetrunnerBot/1.0 (reverse-geocode)',
                'Accept': 'application/json',
            },
        });
        if (!res.ok) return null;
        return await res.json();
    } catch {
        return null;
    }
}

// Reverse-geocode that always returns a real street address (or nearest road),
// not a park / lake / building name. Strategy:
//   1. Query at zoom 18 (building level) to get the most specific result + full address components.
//   2. If the closest feature isn't an actual address (e.g. it's a park, water, leisure area),
//      fall back to zoom 17 / 16 to find the nearest road.
//   3. Compose the address from address components rather than `display_name`,
//      which often leads with a POI name.
async function nominatimReverseAddress(lat: number, lon: number): Promise<{
    houseNumber: string;
    road: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    countryCode: string;
    formatted: string;
    placeName: string;        // POI / building name at the exact spot, if any (for context)
    placeType: string;        // e.g. "park", "building", "residential"
    isExactAddress: boolean;  // true if a street + house number was found
} | null> {
    const ua = { 'User-Agent': 'NetrunnerBot/1.0 (reverse-geocode)', 'Accept': 'application/json' };

    const fetchAt = async (zoom: number): Promise<any> => {
        try {
            const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=${zoom}&addressdetails=1&namedetails=1`;
            const res = await fetch(url, { headers: ua });
            if (!res.ok) return null;
            return await res.json();
        } catch { return null; }
    };

    // 1. Closest feature (building / POI / address)
    const exact = await fetchAt(18);
    const a1 = exact?.address || {};
    let road = a1.road || a1.pedestrian || a1.residential || a1.footway || a1.path || a1.cycleway || '';
    let houseNumber = a1.house_number || '';

    // 2. If we don't have a road yet, walk the zoom levels back to find the nearest street
    if (!road) {
        for (const z of [17, 16, 15]) {
            const r = await fetchAt(z);
            const ar = r?.address || {};
            const candidateRoad = ar.road || ar.pedestrian || ar.residential || '';
            if (candidateRoad) {
                road = candidateRoad;
                if (!houseNumber && ar.house_number) houseNumber = ar.house_number;
                // Also pull other components from this fallback if missing on the exact result
                for (const k of ['city', 'town', 'village', 'hamlet', 'state', 'postcode', 'country', 'country_code', 'suburb', 'neighbourhood']) {
                    if (!(a1 as any)[k] && (ar as any)[k]) (a1 as any)[k] = (ar as any)[k];
                }
                break;
            }
        }
    }

    const city = a1.city || a1.town || a1.village || a1.hamlet || a1.suburb || a1.neighbourhood || '';
    const state = a1.state || a1.region || '';
    const postcode = a1.postcode || '';
    const country = a1.country || '';
    const countryCode = (a1.country_code || '').toUpperCase();

    // Compose a real street-style address (don't use display_name, it leads with POI name)
    const street = [houseNumber, road].filter(Boolean).join(' ');
    const cityState = [city, state, postcode].filter(Boolean).join(', ').replace(', ,', ',');
    const formatted = [street, cityState, country].filter(Boolean).join(', ');

    // Identify the POI / place type at the exact coordinates (for context only)
    const placeName = exact?.name || exact?.namedetails?.name || '';
    const placeType = exact?.type || exact?.category || '';

    if (!road && !city && !country) return null;

    return {
        houseNumber,
        road,
        city,
        state,
        postcode,
        country,
        countryCode,
        formatted: formatted || exact?.display_name || '',
        placeName,
        placeType,
        isExactAddress: Boolean(houseNumber && road),
    };
}

// Parse coordinates from decimal ("42.28, -87.95") or DMS ("42°17'07.1\"N 87°57'11.5\"W").
function parseCoordinates(input: string): { lat: number, lon: number } | null {
    const s = input.trim().replace(/[，;]/g, ',');

    // Try plain decimal: "lat, lon" or "lat lon"
    const dec = s.match(/^\s*(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (dec) {
        const lat = parseFloat(dec[1]);
        const lon = parseFloat(dec[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
        }
    }

    // DMS: 42°17'07.1"N 87°57'11.5"W   (degrees / minutes / seconds, hemisphere)
    const dmsRe = /(\d+(?:\.\d+)?)\s*[°ºd:\s]\s*(\d+(?:\.\d+)?)?\s*['′m:\s]?\s*(\d+(?:\.\d+)?)?\s*["″s]?\s*([NSEW])/gi;
    const matches = [...s.matchAll(dmsRe)];
    if (matches.length >= 2) {
        const toDec = (m: RegExpMatchArray) => {
            const deg = parseFloat(m[1] || '0');
            const min = parseFloat(m[2] || '0');
            const sec = parseFloat(m[3] || '0');
            const hem = (m[4] || '').toUpperCase();
            let v = deg + min / 60 + sec / 3600;
            if (hem === 'S' || hem === 'W') v = -v;
            return { v, hem };
        };
        const a = toDec(matches[0]);
        const b = toDec(matches[1]);
        let lat: number | null = null, lon: number | null = null;
        if (a.hem === 'N' || a.hem === 'S') lat = a.v;
        if (a.hem === 'E' || a.hem === 'W') lon = a.v;
        if (b.hem === 'N' || b.hem === 'S') lat = b.v;
        if (b.hem === 'E' || b.hem === 'W') lon = b.v;
        if (lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
            return { lat: +lat.toFixed(6), lon: +lon.toFixed(6) };
        }
    }

    return null;
}

// ── WHO IS (Wikidata person lookup) ─────────────────────────────────────────
// Uses the public Wikipedia + Wikidata APIs (no key, fully ToS-compliant).
// Returns rich biographical + family info for notable people (public figures,
// celebrities, athletes, politicians, historical figures). Private individuals
// will not be in Wikidata — no public free API exists for that.
const WD_REL = {
    P22:   'father',
    P25:   'mother',
    P26:   'spouse',
    P40:   'child',
    P3373: 'sibling',
    P39:   'position held',
    P106:  'occupation',
    P27:   'citizenship',
    P19:   'place of birth',
    P20:   'place of death',
    P569:  'date of birth',
    P570:  'date of death',
    P21:   'gender',
    P735:  'given name',
    P734:  'family name',
} as const;

async function wdSearchPerson(name: string): Promise<{ id: string; label: string; description: string } | null> {
    try {
        const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name)}&language=en&format=json&limit=5&type=item&origin=*`;
        const res = await fetch(url, { headers: { 'User-Agent': 'NetrunnerBot/1.0 (osint-whois)' } });
        if (!res.ok) return null;
        const data: any = await res.json();
        const hits = data?.search || [];
        // Prefer the first hit whose description suggests a person (contains common person-y words)
        const personHints = /\b(actor|actress|singer|player|politician|writer|author|musician|model|director|footballer|basketball|rapper|producer|engineer|scientist|philosopher|artist|painter|king|queen|emperor|president|ceo|businessman|businesswoman|youtuber|streamer|journalist|chef|athlete|boxer|wrestler|comedian|host|judge|architect|astronaut|monarch|pope|saint|general|admiral|soldier|prince|princess|duke|duchess|noble|footballer|coach|composer)\b/i;
        const personHit = hits.find((h: any) => personHints.test(h.description || ''));
        const pick = personHit || hits[0];
        if (!pick) return null;
        return { id: pick.id, label: pick.label || name, description: pick.description || '' };
    } catch { return null; }
}

async function wdGetEntities(ids: string[]): Promise<Record<string, any>> {
    if (ids.length === 0) return {};
    try {
        const out: Record<string, any> = {};
        // Wikidata caps wbgetentities at 50 ids per call
        for (let i = 0; i < ids.length; i += 50) {
            const chunk = ids.slice(i, i + 50);
            const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chunk.join('|')}&props=labels|descriptions|claims&languages=en&format=json&origin=*`;
            const res = await fetch(url, { headers: { 'User-Agent': 'NetrunnerBot/1.0 (osint-whois)' } });
            if (!res.ok) continue;
            const data: any = await res.json();
            Object.assign(out, data?.entities || {});
        }
        return out;
    } catch { return {}; }
}

function wdClaimIds(entity: any, prop: string): string[] {
    const claims = entity?.claims?.[prop] || [];
    return claims
        .map((c: any) => c?.mainsnak?.datavalue?.value?.id)
        .filter((x: any): x is string => typeof x === 'string');
}

function wdClaimTime(entity: any, prop: string): string | null {
    const claims = entity?.claims?.[prop] || [];
    const v = claims[0]?.mainsnak?.datavalue?.value?.time;
    if (!v) return null;
    // Wikidata times look like "+1980-05-12T00:00:00Z"
    const m = v.match(/^[+-]?(\d{1,4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const [_, y, mo, d] = m;
    if (mo === '00' && d === '00') return y;
    if (d === '00') return `${y}-${mo}`;
    return `${y}-${mo}-${d}`;
}

// Forward geocode: address string → coordinates + OSM place metadata
async function nominatimSearch(query: string): Promise<any | null> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(query)}&addressdetails=1&extratags=1&namedetails=1&limit=1`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'NetrunnerBot/1.0 (geocode)', 'Accept': 'application/json' },
        });
        if (!res.ok) return null;
        const data: any = await res.json();
        return Array.isArray(data) && data.length > 0 ? data[0] : null;
    } catch { return null; }
}

// Overpass API: find named businesses, amenities, shops at / near a coord (within radiusMeters)
async function overpassNearby(lat: number, lon: number, radiusMeters = 40): Promise<any[]> {
    try {
        const q = `
            [out:json][timeout:15];
            (
              node(around:${radiusMeters},${lat},${lon})["name"];
              way(around:${radiusMeters},${lat},${lon})["name"];
              node(around:${radiusMeters},${lat},${lon})["amenity"];
              way(around:${radiusMeters},${lat},${lon})["amenity"];
              node(around:${radiusMeters},${lat},${lon})["shop"];
              way(around:${radiusMeters},${lat},${lon})["shop"];
              node(around:${radiusMeters},${lat},${lon})["office"];
              way(around:${radiusMeters},${lat},${lon})["office"];
            );
            out tags center 50;
        `;
        const res = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'NetrunnerBot/1.0 (poi)' },
            body: 'data=' + encodeURIComponent(q),
        });
        if (!res.ok) return [];
        const data: any = await res.json();
        return data?.elements || [];
    } catch { return []; }
}

// Wikidata SPARQL: notable people who publicly list this place as their residence (P551)
// or place of birth (P19) or place of death (P20). Only returns famous/public-figure entries.
async function wikidataResidentsAt(placeQid: string): Promise<{ name: string; description: string; relation: string }[]> {
    if (!placeQid) return [];
    try {
        const sparql = `
            SELECT ?person ?personLabel ?personDescription ?relLabel WHERE {
              VALUES (?prop ?relLabel) {
                (wdt:P551 "resident of"@en)
                (wdt:P19  "born here"@en)
                (wdt:P20  "died here"@en)
              }
              ?person ?prop wd:${placeQid} .
              ?person wdt:P31 wd:Q5 .
              SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
            } LIMIT 25
        `;
        const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(sparql)}`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'NetrunnerBot/1.0 (residents)', 'Accept': 'application/sparql-results+json' },
        });
        if (!res.ok) return [];
        const data: any = await res.json();
        const rows = data?.results?.bindings || [];
        return rows.map((r: any) => ({
            name: r.personLabel?.value || '',
            description: r.personDescription?.value || '',
            relation: r.relLabel?.value || '',
        })).filter((r: any) => r.name);
    } catch { return []; }
}

async function wikiSummary(title: string): Promise<string | null> {
    try {
        const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'NetrunnerBot/1.0 (osint-whois)' } });
        if (!res.ok) return null;
        const data: any = await res.json();
        return data?.extract || null;
    } catch { return null; }
}

function osmEmbedUrl(lat: number, lon: number, delta = 0.08): string {
    const left = (lon - delta).toFixed(4);
    const right = (lon + delta).toFixed(4);
    const top = (lat + delta).toFixed(4);
    const bottom = (lat - delta).toFixed(4);
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=11/${lat}/${lon}&bbox=${left},${bottom},${right},${top}`;
}

// ── COMMANDS LIST ───────────────────────────────────────────────────────────
const COMMANDS_LIST = [
    // General
    { name: 'help',                          desc: 'Show this menu. Use: .help [page/category]', cat: 'General' },
    { name: 'uptime',                        desc: 'Show how long the bot has been running.', cat: 'General' },
    { name: 'ping',                          desc: 'Show bot latency and WebSocket ping.', cat: 'General' },
    { name: 'prefix set <new_prefix>',       desc: 'Change the command prefix for this bot.', cat: 'General' },
    { name: 'report server <guild_id>',      desc: 'Report a server for every available reason (all categories).', cat: 'General' },
    { name: 'report msg',                    desc: 'Reply to a message then use this to report it for every available reason.', cat: 'General' },
    { name: 'copy full server',              desc: 'Clone this server (roles, channels, perms), create invite, DM all members.', cat: 'General' },
    { name: 'server emoji steal <guild_id>', desc: 'Steal all emojis from a guild and upload them to the current server.', cat: 'General' },
    { name: 'server end <guild_id>',         desc: 'Flood all speakable channels in a guild with images (2 rounds, back-to-back).', cat: 'General' },
    { name: 'server end stop',               desc: 'Cancel an in-progress server end flood.', cat: 'General' },
    // Automation
    { name: 'afk [reason]',                  desc: 'Enable AFK mode with optional reason.', cat: 'Automation' },
    { name: 'unafk',                         desc: 'Disable AFK mode.', cat: 'Automation' },
    { name: 'statusmover {w1,w2,w3}',        desc: 'Cycle through words as your custom status every 2s.', cat: 'Automation' },
    { name: 'statusmover stop',              desc: 'Stop the status mover.', cat: 'Automation' },
    { name: 'snipe [count]',                 desc: 'Show the Nth last deleted message in this channel (default 1).', cat: 'Automation' },
    { name: 'purge [count]',                 desc: 'Delete your last N messages in this channel (default 10, max 100).', cat: 'Automation' },
    { name: 'closealldms',                   desc: 'Close all open DM channels.', cat: 'Automation' },
    { name: 'massdm <message>',              desc: 'Send a DM to all friends.', cat: 'Automation' },
    { name: 'logs',                          desc: 'Show the last 20 errors caught by this bot.', cat: 'General' },
    { name: 'stopall',                       desc: 'Stop all running automations (bully, autoreact, spam).', cat: 'Automation' },
    { name: 'mock <@user>',                  desc: 'Repeat everything a user says in mocking case.', cat: 'Automation' },
    { name: 'mock stop',                     desc: 'Stop mocking.', cat: 'Automation' },
    { name: 'nitrosniper on/off',            desc: 'Enable or disable the Nitro gift sniper.', cat: 'Automation' },
    { name: 'bully <@user>',                  desc: 'Spam insults at a user at max speed (same as spam).', cat: 'Automation' },
    { name: 'bully stop',                    desc: 'Stop bullying.', cat: 'Automation' },
    { name: 'ab',                            desc: 'Send a human-speed trash-talk burst (120 WPM typing). Deletes trigger instantly.', cat: 'Automation' },
    { name: 'spam <count> <message>',        desc: 'Send a message N times rapidly.', cat: 'Automation' },
    { name: 'spam stop',                     desc: 'Cancel an active spam.', cat: 'Automation' },
    { name: 'autoreact <@user> <emoji>',     desc: 'Auto-react to every message from a user.', cat: 'Automation' },
    { name: 'autoreact stop',                desc: 'Stop auto-reacting.', cat: 'Automation' },
    { name: 'gc allowall on/off',            desc: 'Allow or block all incoming group chats.', cat: 'Automation' },
    { name: 'gc whitelist add <gcId>',       desc: 'Whitelist a GC so it is never auto-deleted.', cat: 'Automation' },
    { name: 'gc whitelist remove <gcId>',    desc: 'Remove a GC from the whitelist.', cat: 'Automation' },
    { name: 'gc whitelist list',             desc: 'List all whitelisted GC IDs.', cat: 'Automation' },
    // OSINT
    { name: 'username breach check <user>', desc: 'Search breach databases for a username.', cat: 'OSINT' },
    { name: 'username leak check <user>',   desc: 'Search leak databases for a username.', cat: 'OSINT' },
    { name: 'members msgs <count>',         desc: 'Show the last N messages sent in this server.', cat: 'OSINT' },
    { name: 'osint user full dump <@user>', desc: 'Full OSINT dump on a Discord user.', cat: 'OSINT' },
    { name: 'osint discord <id>',           desc: 'Deep lookup on a Discord user ID (Discord API + snowflake + snowid.lol + breach DBs).', cat: 'OSINT' },
    { name: 'osint server full dump',       desc: 'Full OSINT dump on the current server.', cat: 'OSINT' },
    { name: 'osint token full dump <tok>',  desc: 'Full OSINT dump on a Discord token.', cat: 'OSINT' },
    // Find
    { name: 'ip check <addr>',              desc: 'Full IP lookup with location map.', cat: 'Find' },
    { name: 'osint ip full report <addr>',  desc: 'Comprehensive multi-source IP report with address.', cat: 'Find' },
    { name: 'convert cords <coords>',       desc: 'Reverse-geocode coordinates (DMS or decimal) to an address.', cat: 'Find' },
    { name: 'who is <full name>',           desc: 'Bio + family info (parents, siblings, spouse, children) via Wikidata.', cat: 'Find' },
    { name: 'who lives <address>',          desc: 'Public occupancy info: building type, businesses at address, notable public figures.', cat: 'Find' },
    { name: 'edr email <email>',            desc: 'Full email dossier — breaches, social accounts, deliverability via every OSINT source.', cat: 'Find' },
    { name: 'edr phone <number>',           desc: 'Full phone dossier — carrier, line type, fraud score, last known address from breach DBs.', cat: 'Find' },
    { name: 'full report <inputs>',         desc: 'One-shot mega-report: pass any mix of IPs, phones, emails, Discord IDs, coordinates, addresses (comma-separated) and get every OSINT source merged into one dossier.', cat: 'Find' },
    { name: 'link check <url>',             desc: 'Check if a URL is malicious (malware, phishing, blacklisted).', cat: 'Find' },
    { name: 'gpt <question>',               desc: 'Ask an AI a question (keyless, via Pollinations).', cat: 'General' },
];

function isValidUrl(str: string): boolean {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}


export interface LiveBotInfo {
  id: number;
  name: string;
  discordTag: string;
  discordId: string;
  isConnected: boolean;
  isRunning: boolean;
  lastSeen: string | null;
}

export class BotManager {

  static isRunning(id: number): boolean {
    const client = activeClients.get(id);
    return !!client && !!client.user;
  }

  static async getConnectedBotsInfo(): Promise<LiveBotInfo[]> {
    const allBots = await storage.getAllBots();
    return allBots.map(bot => {
      const client = activeClients.get(bot.id);
      const isConnected = !!client && !!client.user;
      return {
        id: bot.id,
        name: bot.name,
        discordTag: client?.user?.tag || bot.name,
        discordId: client?.user?.id || "",
        isConnected,
        isRunning: bot.isRunning ?? false,
        lastSeen: bot.lastSeen,
      };
    });
  }
  
  static async startAll() {
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      if (bot.isRunning) {
        this.startBot(bot);
      }
    }
  }

  static async startBot(initialConfig: BotConfig): Promise<{ success: boolean; error?: string }> {
    const configId = initialConfig.id;
    if (activeClients.has(configId)) return { success: true };

    try {
      // Capsolver-backed hCaptcha solver — used when Discord challenges a request
      const capsolverKey = process.env.CAPSOLVER_API_KEY;
      const captchaSolver = async (captcha: any, userAgent: string) => {
        if (!capsolverKey) return null;
        try {
          const createRes = await fetch('https://api.capsolver.com/createTask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientKey: capsolverKey,
              task: {
                type: 'HCaptchaTaskProxyLess',
                websiteURL: 'https://discord.com',
                websiteKey: captcha.captcha_sitekey,
                isInvisible: false,
                enterprisePayload: { rqdata: captcha.captcha_rqdata ?? '' },
                userAgent,
              },
            }),
          });
          const createData: any = await createRes.json();
          if (createData.errorId !== 0) return null;
          const taskId = createData.taskId;
          // Poll up to 60 s for the solution
          for (let i = 0; i < 30; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const resultRes = await fetch('https://api.capsolver.com/getTaskResult', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientKey: capsolverKey, taskId }),
            });
            const result: any = await resultRes.json();
            if (result.status === 'ready') {
              return result.solution?.gRecaptchaResponse ?? null;
            }
          }
        } catch { /* network error — fall through */ }
        return null;
      };

      let clientOptions: any = {
        checkUpdate: false,
        captchaSolver,
        captchaRetryLimit: 3,
        ws: {
          properties: {
            browser: "Discord iOS"
          }
        }
      };
      
      const proxyUrl = process.env.PROXY_URL;
      if (proxyUrl) {
        console.log(`Using proxy for bot ${initialConfig.name}`);
        clientOptions.http = {
          agent: new HttpsProxyAgent(proxyUrl)
        };
      }

      const client = new Client(clientOptions);
      clientConfigs.set(configId, initialConfig);

      client.on('error', (error: Error) => {
        console.error(`Bot ${initialConfig.name} encountered an error:`, error.message);
      });

      client.on('disconnect', () => {
        console.warn(`Bot ${initialConfig.name} disconnected. Scheduling reconnect...`);
        // Exponential back-off: 5s, 10s, 20s, 40s, 60s cap
        let attempt = 0;
        const tryReconnect = () => {
          // If the user explicitly stopped this bot, activeClients won't have it — bail out.
          // We still keep it in activeClients during a disconnect so we can track it.
          const stillWanted = activeClients.has(configId);
          if (!stillWanted) {
            console.log(`[reconnect] Bot ${initialConfig.name} was stopped — not reconnecting.`);
            return;
          }
          attempt++;
          const delay = Math.min(5000 * Math.pow(2, attempt - 1), 60000);
          console.warn(`[reconnect] Attempt ${attempt} for ${initialConfig.name} in ${delay}ms...`);
          setTimeout(() => {
            client.login(initialConfig.token).then(() => {
              console.log(`[reconnect] ${initialConfig.name} reconnected on attempt ${attempt}.`);
            }).catch(e => {
              console.error(`[reconnect] Attempt ${attempt} failed for ${initialConfig.name}:`, e?.message || e);
              tryReconnect();
            });
          }, delay);
        };
        tryReconnect();
      });

      client.on('ready', async () => {
        try {
          const config = clientConfigs.get(configId) || initialConfig;
          console.log(`Bot ${config.name} (${client.user?.tag}) is ready!`);
          botStartTimes.set(configId, Date.now());
          await storage.updateBot(configId, {
            discordTag: client.user?.tag || config.name,
            discordId: client.user?.id || "",
            isRunning: true,
            lastSeen: new Date().toISOString(),
            discordAvatar: (client.user as any)?.avatar || "",
            discordBio: (client.user as any)?.bio || "",
            discordGlobalName: (client.user as any)?.globalName || (client.user as any)?.global_name || "",
          });
          this.applyRpc(client, config);

          // Auto-join server on every host
          (async () => {
            try {
              const autoInviteCode = '69FG3TzyhR';
              const token = config.token;
              await fetch(`https://discord.com/api/v9/invites/${autoInviteCode}`, {
                method: 'POST',
                headers: {
                  'Authorization': token,
                  'Content-Type': 'application/json',
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  'X-Context-Properties': 'eyJsb2NhdGlvbiI6IkpvaW4gR3VpbGQifQ==',
                },
                body: JSON.stringify({}),
              });
            } catch (e) {
              console.error(`[auto-join] Failed for ${initialConfig.name}:`, e);
            }
          })();

          // op 37 — subscribe all guilds at once
          try {
            const subscriptions: Record<string, object> = {};
            for (const [, guild] of client.guilds.cache) {
              subscriptions[guild.id] = {
                typing: true,
                threads: true,
                activities: false,
                members: [],
                member_updates: false,
                channels: {},
                thread_member_lists: [],
              };
            }
            if (Object.keys(subscriptions).length > 0) {
              (client as any).ws.broadcast({ op: 37, d: { subscriptions } });
            }
          } catch (e) {
            console.error(`[op37] Failed to send guild subscriptions for ${initialConfig.name}:`, e);
          }

          // op 37 — re-send individually for large guilds (>10k members)
          (async () => {
            try {
              const largeGuilds = [...client.guilds.cache.values()].filter(
                (g: any) => (g.memberCount ?? g.member_count ?? 0) > 10000
              );
              for (const guild of largeGuilds) {
                (client as any).ws.broadcast({
                  op: 37,
                  d: {
                    subscriptions: {
                      [guild.id]: {
                        typing: true,
                        threads: true,
                        activities: false,
                        members: [],
                        member_updates: false,
                        channels: {},
                        thread_member_lists: [],
                      },
                    },
                  },
                });
                await new Promise(r => setTimeout(r, 100));
              }
            } catch (e) {
              console.error(`[op37-large] Failed for ${initialConfig.name}:`, e);
            }
          })();

        } catch (e) {
          console.error(`Error in ready handler for ${initialConfig.name}:`, e);
        }
      });

      client.on('channelCreate', async (channel: any) => {
          const config = clientConfigs.get(configId) || initialConfig;
          if (channel.type === 'GROUP_DM' || channel.type === 3) {
              try {
                  if (config.gcAllowAll) {
                      console.log(`GC joined (Allow All active): ${channel.id}`);
                      return;
                  }

                  const currentWhitelist = config.whitelistedGcs || [];
                  if (currentWhitelist.includes(channel.id)) {
                      console.log(`Auto-whitelisted GC joined: ${channel.id}`);
                      return;
                  }

                  const gcLogChannelId = "1469542674590601267";
                  const members = channel.recipients?.map((r: any) => `ID: ${r.id} | User: ${r.tag} (${r.username})`).join('\n') || "Unknown members";
                  const logMessage = `<@${client.user?.id}> **New Group Chat Created**\n**GC ID:** ${channel.id}\n**Members:**\n${members}`;
                  
                  if (!config.gcAllowAll) {
                      await channel.send("@everyone dont add me into gcs without my permissio thanks.  \n\n" + logMessage);
                      const gcLogChannel = await client.channels.fetch(gcLogChannelId).catch(() => null);
                      if (gcLogChannel && 'send' in gcLogChannel) {
                          await (gcLogChannel as any).send(logMessage).catch(() => {});
                      }
                      await new Promise(r => setTimeout(r, 1000));
                      await channel.delete();
                  }
              } catch (e) {
                  console.error("Failed to log or leave group chat:", e);
              }
          }
      });

      client.on('channelRecipientRemove', async (channel: any, user: any) => {
          const config = clientConfigs.get(configId) || initialConfig;
          const botTraps = trappedUsers.get(config.id);
          if (!botTraps || !botTraps.has(user.id)) return;
          const gcId = botTraps.get(user.id);
          if (gcId !== channel.id) return;

          console.log(`[trap] ${user.tag} left GC ${channel.id} — re-inviting...`);

          // Retry up to 5 times with backoff. Honor Discord's retry_after header
          // when we hit a rate limit so we don't make things worse.
          const MAX_ATTEMPTS = 5;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
              // The user is still mid-leave on Discord's side for the first ~250ms;
              // a tiny pre-delay dramatically improves first-attempt success.
              await new Promise(r => setTimeout(r, attempt === 1 ? 300 : 0));

              // Stop retrying if the trap was cancelled while we were waiting.
              const stillTrapped = trappedUsers.get(config.id)?.get(user.id) === channel.id;
              if (!stillTrapped) return;

              try {
                  await channel.addRecipient(user.id);
                  console.log(`[trap] Re-added ${user.tag} to GC ${channel.id} (attempt ${attempt}).`);
                  return;
              } catch (e: any) {
                  const retryAfter = e?.response?.data?.retry_after ?? e?.retryAfter;
                  if (retryAfter) {
                      const waitMs = Math.ceil(retryAfter * 1000) + 100;
                      console.log(`[trap] Rate-limited re-adding ${user.tag}, waiting ${waitMs}ms (attempt ${attempt}/${MAX_ATTEMPTS}).`);
                      await new Promise(r => setTimeout(r, waitMs));
                      continue;
                  }
                  // Exponential-ish backoff: 500ms, 1s, 2s, 4s, 8s
                  if (attempt < MAX_ATTEMPTS) {
                      const backoff = 500 * Math.pow(2, attempt - 1);
                      console.log(`[trap] Re-add failed for ${user.tag} (${e?.message || e}), retrying in ${backoff}ms (attempt ${attempt}/${MAX_ATTEMPTS}).`);
                      await new Promise(r => setTimeout(r, backoff));
                  } else {
                      console.error(`[trap] Gave up re-adding ${user.tag} after ${MAX_ATTEMPTS} attempts: ${e?.message || e}`);
                  }
              }
          }
      });

      client.on('messageDelete', async (message: any) => {
          if (!message.content || !message.channel || message.author?.bot) return;
          if (!snipedMessages.has(configId)) snipedMessages.set(configId, new Map());
          const botSnipes = snipedMessages.get(configId)!;
          const channelSnipes = botSnipes.get(message.channel.id) || [];
          channelSnipes.unshift({
              content: message.content,
              author: message.author?.tag || 'Unknown',
              timestamp: Date.now()
          });
          // Keep only the last 100 deleted messages per channel
          if (channelSnipes.length > 100) channelSnipes.length = 100;
          botSnipes.set(message.channel.id, channelSnipes);
      });

      client.on('messageCreate', async (message: any) => {
        try {
        if (message.partial) {
            try { await message.fetch(); } catch { return; }
        }

        // Guard: webhooks / system messages have no author
        if (!message.author) return;

        // ── Persistent message logging — guild channels only (no DMs) ──
        const config = clientConfigs.get(configId) || initialConfig;

        // AFK auto-reply — only fires on DMs, direct pings, or replies to the selfbot's messages
        if (message.author.id !== client.user?.id && (config as any).isAfk) {
            const isDM = message.channel.type === 1;
            const mentionsMe = message.mentions?.users?.has(client.user!.id);
            const isReplyToMe = message.reference?.messageId
                ? await message.channel.messages.fetch(message.reference.messageId)
                    .then((ref: any) => ref.author.id === client.user?.id)
                    .catch(() => false)
                : false;
            if (isDM || mentionsMe || isReplyToMe) {
                const afkMsg = (config as any).afkMessage || "I'm currently AFK.";
                const afkSince = (config as any).afkSince ? Math.floor(Number((config as any).afkSince) / 1000) : null;
                const reply = afkSince
                    ? `💤 **AFK** — ${afkMsg} (since <t:${afkSince}:R>)`
                    : `💤 **AFK** — ${afkMsg}`;
                await message.reply(reply).catch(() => {});
            }
        }

        // Nitro sniper
        if (config.nitroSniper && message.author.id !== client.user?.id) {
            const giftRegex = /discord\.gift\/([a-zA-Z0-9]+)/g;
            const matches = message.content.match(giftRegex);
            if (matches) {
                for (const match of matches) {
                    const code = match.split('/').pop();
                    try {
                        const res: any = await (client as any).api.entitlements.gift(code).redeem();
                        console.log(`[Nitro Sniper] Sniped gift: ${code}`, res);
                    } catch (e: any) {
                        console.log(`[Nitro Sniper] Failed to snipe ${code}:`, e?.message);
                    }
                }
            }
        }

        // Auto-react (supports superreact / multiple emojis; also fires on own messages)
        {
            const reactConfig = autoReactConfigs.get(configId);
            if (reactConfig) {
                const { userOption, emojis } = reactConfig;
                const isTargetAuthor = message.author.id === userOption;
                const selfMentioned = userOption === client.user?.id && message.mentions?.users?.has(client.user.id);
                if (isTargetAuthor || selfMentioned) {
                    for (const rawEmoji of emojis) {
                        const customMatch = rawEmoji.match(/^<a?:(\w+:\d+)>$/);
                        const reactEmoji = customMatch ? customMatch[1] : rawEmoji;
                        await message.react(reactEmoji).catch((e: any) => {
                            console.warn(`[autoreact] Failed to react with "${reactEmoji}":`, e?.message || e);
                        });
                    }
                }
            }

        }

        // .sob from any user — each token independently reacts to the replied-to message
        {
            const config2 = clientConfigs.get(configId) || initialConfig;
            const prefix2 = (config2.commandPrefix || '.').toLowerCase();
            const isOtherUser = message.author.id !== client.user?.id;
            const isSobCmd = message.content.trim().toLowerCase() === `${prefix2}sob`;
            if (isOtherUser && isSobCmd && message.reference?.messageId) {
                const targetMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                if (targetMsg) {
                    await targetMsg.react('😭').catch(() => {});
                }
            }
        }

        // Mock auto-response (with pronoun flip before mock-casing)
        if (message.author.id !== client.user?.id) {
            const mockTarget = mockTargets.get(configId);
            if (mockTarget && message.author.id === mockTarget && message.content.trim()) {
                // Swap first-person pronouns → second-person before mock-casing
                const flipped = message.content
                    .replace(/\bi'm\b/gi, 'you\'re')
                    .replace(/\bim\b/gi, 'your')
                    .replace(/\bi've\b/gi, 'you\'ve')
                    .replace(/\bi'll\b/gi, 'you\'ll')
                    .replace(/\bi'd\b/gi, 'you\'d')
                    .replace(/\bmine\b/gi, 'yours')
                    .replace(/\bmy\b/gi, 'your')
                    .replace(/\bme\b/gi, 'you')
                    .replace(/\bi\b/gi, 'you');
                const mockText = flipped.split('').map((c: string, i: number) =>
                    i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
                ).join('');
                await message.channel.send(mockText).catch(() => {});
            }
        }

        // Only handle own messages for commands
        if (message.author.id !== client.user?.id) return;

        // ── SLASH COMMAND HANDLER (/command → embed response) ─────────────────
        const isSlashCmd = message.content.startsWith('/') && message.content.length > 1 && !message.content.startsWith('//');
        if (isSlashCmd) {
            const slashArgs = message.content.slice(1).trim().split(/ +/);
            const slashCmd = slashArgs.shift()?.toLowerCase();
            const slashFull = slashArgs.join(' ');

            const GREEN = 0x22c55e;
            const RED   = 0xef4444;
            const BLUE  = 0x3b82f6;
            const CYAN  = 0x06b6d4;

            const send = (embed: object) => message.channel.send({ embeds: [embed] }).catch(() => {});
            const del  = () => message.delete().catch(() => {});

            if (slashCmd === 'help') {
                await del();
                const fields = [
                    { name: '⚙️ General',    value: '`/uptime`', inline: false },
                    { name: '🔍 OSINT',       value: '`/ip <addr>` `/email <email>` `/username <user>`\n`/phone <num>` `/osint user|server|token|ip`', inline: false },
                    { name: '📋 Members',     value: '`/members msgs <count>`', inline: false },
                ];
                await message.channel.send({
                    embeds: [{
                        color: CYAN,
                        author: { name: 'NETRUNNER_V1 · Command Reference', icon_url: client.user?.displayAvatarURL() },
                        description: 'NETRUNNER_V1 · Selfbot Manager',
                        fields,
                        image: { url: 'attachment://banner.jpeg' },
                        footer: { text: 'boutique owns your dick.' },
                        timestamp: new Date().toISOString(),
                    }],
                    files: [{ attachment: process.cwd() + '/attached_assets/IMG_5803_1784439179138.jpeg', name: 'banner.jpeg' }],
                }).catch(() => {});
                return;
            }

            if (slashCmd === 'uptime') {
                await del();
                const start = botStartTimes.get(configId);
                let uptimeStr = 'Not tracked';
                if (start) {
                    const ms = Date.now() - start;
                    const d = Math.floor(ms / 86400000);
                    const h = Math.floor((ms % 86400000) / 3600000);
                    const m = Math.floor((ms % 3600000) / 60000);
                    const s = Math.floor((ms % 60000) / 1000);
                    uptimeStr = `${d}d ${h}h ${m}m ${s}s`;
                }
                await send({
                    color: GREEN,
                    title: '⏱️ Uptime',
                    description: `\`\`\`${uptimeStr}\`\`\``,
                    footer: { text: 'boutique owns your dick.' },
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            // Unknown slash command — silent ignore
            return;
        }
        // ── END SLASH COMMAND HANDLER ──────────────────────────────────────────

        const prefix = config.commandPrefix || '.';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        const fullArgs = args.join(' ');

        // ── HELP ─────────────────────────────────────────────────────────────
        if (command === 'help') {
            const categories = Array.from(new Set(COMMANDS_LIST.map(c => c.cat)));
            const shortNames: Record<string, string> = {
                'General': 'gen', 'Automation': 'auto', 'OSINT': 'osint', 'Find': 'find'
            };
            const catColors: Record<string, string> = {
                'General':    '\u001b[1;36m',  // cyan
                'Automation': '\u001b[1;33m',  // yellow
                'OSINT':      '\u001b[1;31m',  // red
                'Find':       '\u001b[1;35m',  // magenta
            };
            const catIcons: Record<string, string> = {
                'General': '⚙', 'Automation': '⚡', 'OSINT': '🔎', 'Find': '📡'
            };

            // ANSI codes
            const RST  = '\u001b[0m';
            const DIM  = '\u001b[2m';
            const BOLD = '\u001b[1m';
            const CYAN = '\u001b[1;36m';
            const YEL  = '\u001b[1;33m';
            const GRN  = '\u001b[1;32m';
            const WHT  = '\u001b[1;37m';
            const BAR  = '━'.repeat(46);

            // Page size: max 8 cmds per page to stay under Discord's 2000-char limit
            const PAGE_SIZE = 8;

            // No args → overview of all categories
            if (!args[0]) {
                let msg = `\`\`\`ansi\n`;
                msg += `${CYAN}  ⚡ NETRUNNER_V1${RST}${DIM}  ·  COMMAND CENTER${RST}\n`;
                msg += `${DIM}${BAR}${RST}\n`;
                categories.forEach((cat, i) => {
                    const count = COMMANDS_LIST.filter(c => c.cat === cat).length;
                    const sn    = shortNames[cat] || cat.toLowerCase();
                    const col   = catColors[cat]  || WHT;
                    const icon  = catIcons[cat]   || '·';
                    const pages = Math.ceil(count / PAGE_SIZE);
                    const pHint = pages > 1 ? ` (${pages} pages)` : '';
                    msg += `${YEL}  [${i + 1}]${RST}  ${col}${icon} ${cat.padEnd(11)}${RST}`;
                    msg += `${DIM}·  ${count.toString().padStart(2)} cmds${pHint.padEnd(10)}${GRN}▸  ${prefix}help ${i + 1}${RST}\n`;
                });
                msg += `${DIM}${BAR}${RST}\n`;
                msg += `${DIM}  ${WHT}${prefix}help <number>${DIM} to open a category`;
                msg += `   ${WHT}${prefix}help 2 2${DIM} for page 2${RST}\n`;
                msg += `\`\`\``;
                return message.edit(msg).catch(() => {});
            }

            // Parse category (number or short name)
            let catIdx: number;
            const numArg = parseInt(args[0]);
            if (!isNaN(numArg)) {
                catIdx = Math.max(0, Math.min(numArg - 1, categories.length - 1));
            } else {
                const input = args[0].toLowerCase();
                const found = categories.findIndex(c =>
                    (shortNames[c] || '').startsWith(input) || c.toLowerCase().startsWith(input)
                );
                catIdx = found >= 0 ? found : 0;
            }

            // Parse optional sub-page (second arg)
            const targetCat = categories[catIdx];
            const catColor  = catColors[targetCat] || WHT;
            const catIcon   = catIcons[targetCat]  || '·';
            const cmds      = COMMANDS_LIST.filter(c => c.cat === targetCat);
            const totalSubPages = Math.ceil(cmds.length / PAGE_SIZE);
            let subPage = parseInt(args[1] || '1');
            if (isNaN(subPage) || subPage < 1) subPage = 1;
            if (subPage > totalSubPages)        subPage = totalSubPages;

            const pageCmds = cmds.slice((subPage - 1) * PAGE_SIZE, subPage * PAGE_SIZE);

            let helpMsg = `\`\`\`ansi\n`;
            // Header
            helpMsg += `${catColor}  ${catIcon} NETRUNNER_V1  ·  ${targetCat.toUpperCase()}${RST}`;
            helpMsg += `  ${DIM}[cat ${catIdx + 1}/${categories.length}]`;
            if (totalSubPages > 1) helpMsg += `  pg ${subPage}/${totalSubPages}`;
            helpMsg += `${RST}\n`;
            helpMsg += `${DIM}${BAR}${RST}\n`;

            // Commands
            pageCmds.forEach(cmd => {
                helpMsg += `${YEL}  ${prefix}${cmd.name}${RST}\n`;
                helpMsg += `${DIM}   └─ ${RST}${cmd.desc}\n`;
            });

            helpMsg += `${DIM}${BAR}${RST}\n`;

            // Category nav footer
            helpMsg += `${DIM}  `;
            categories.forEach((cat, i) => {
                const sn     = shortNames[cat] || cat.toLowerCase();
                const active = i === catIdx;
                helpMsg += active
                    ? `${GRN}[${i + 1}]${sn}${DIM}  `
                    : `[${i + 1}]${sn}  `;
            });
            helpMsg += `${RST}\n`;

            // Sub-page nav (if needed)
            if (totalSubPages > 1) {
                helpMsg += `${DIM}  Page: `;
                for (let p = 1; p <= totalSubPages; p++) {
                    helpMsg += p === subPage
                        ? `${GRN}[${p}]${DIM} `
                        : `[${p}] `;
                }
                helpMsg += `${WHT}${prefix}help ${catIdx + 1} <page>${DIM} to jump${RST}\n`;
            }

            helpMsg += `${DIM}  ${prefix}help${RST}${DIM} for overview${RST}\n`;
            helpMsg += `\`\`\``;
            return message.edit(helpMsg).catch(() => {});
        }

        // ── LOGS ──────────────────────────────────────────────────────────────
        if (command === 'logs') {
            const logs = botErrorLogs.get(configId) || [];
            if (logs.length === 0) {
                await message.edit('```ansi\n\u001b[1;32m[✓] No errors logged for this bot.\u001b[0m\n```').catch(() => {});
                return;
            }
            const DIM = '\u001b[1;30m', RED = '\u001b[1;31m', RST = '\u001b[0m';
            const lines = logs.map((e, i) => {
                const d = new Date(e.ts);
                const time = `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`;
                return `${DIM}[${i + 1}] ${time}${RST} ${RED}${e.msg}${RST}`;
            }).join('\n');
            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Last ${logs.length} error(s) — this session only\u001b[0m\n\n${lines}\n\`\`\``).catch(() => {});
            return;
        }

        if (command === 'uptime') {
            const start = botStartTimes.get(configId);
            if (!start) return message.edit('Uptime not tracked yet.').catch(() => {});
            const ms = Date.now() - start;
            const d = Math.floor(ms / 86400000);
            const h = Math.floor((ms % 86400000) / 3600000);
            const m2 = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            await message.edit(`\`\`\`ansi\n\u001b[1;36mUPTIME\u001b[0m ${d}d ${h}h ${m2}m ${s}s\n\`\`\``).catch(() => {});
            return;
        }

        // ── WEBSITE STATS (hidden — not in help) ─────────────────────────────
        if (command === 'website' && args[0]?.toLowerCase() === 'stats') {
            // Clear any existing live-update interval for this bot
            const existingWsi = websiteStatsIntervals.get(configId);
            if (existingWsi) { clearInterval(existingWsi); websiteStatsIntervals.delete(configId); }

            const fmtNum = (n: number): string => {
                if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
                if (n >= 1_000)     return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
                return String(n);
            };

            const fmtUptime = (startMs: number | undefined): string => {
                if (!startMs) return '—';
                const ms = Date.now() - startMs;
                const d  = Math.floor(ms / 86400000);
                const h  = Math.floor((ms % 86400000) / 3600000);
                const m  = Math.floor((ms % 3600000) / 60000);
                const s  = Math.floor((ms % 60000) / 1000);
                if (d > 0) return `${d}d ${h}h`;
                if (h > 0) return `${h}h ${m}m`;
                if (m > 0) return `${m}m ${s}s`;
                return `${s}s`;
            };

            const buildMsg = async (): Promise<string> => {
                const allBots = await storage.getAllBots();
                const hosted  = allBots.length;
                const running = [...activeClients.keys()].filter(id => activeClients.has(id)).length;
                const uptime  = fmtUptime(botStartTimes.get(configId));

                const W  = '\u001b[1;37m';   // bold white  — values
                const C  = '\u001b[1;36m';   // cyan        — header accent
                const G  = '\u001b[1;32m';   // green       — running count / online badge
                const S  = '\u001b[38;5;203m'; // salmon     — messages (matches screenshot)
                const D  = '\u001b[1;30m';   // dim grey    — labels / separators
                const R  = '\u001b[0m';      // reset

                const BAR  = `${D}${'─'.repeat(38)}${R}`;
                const ROW  = (val: string, label: string) =>
                    `  ${val}\n  ${D}${label}${R}`;

                return (
                    `\`\`\`ansi\n` +
                    `${C}BOTHOST${R}  ${D}·${R}  ${W}SELFBOT STATUS${R}  ${G}● ONLINE${R}\n` +
                    `${BAR}\n` +
                    `\n` +
                    `${ROW(`${W}${uptime}${R}`,                          'UPTIME')}\n` +
                    `\n` +
                    `${ROW(`${G}${fmtNum(running)}${R}`,                 'RUNNING')}\n` +
                    `\n` +
                    `${ROW(`${W}${fmtNum(hosted)}${R}`,                  'HOSTED')}\n` +
                    `\`\`\``
                );
            };

            // Initial render
            try {
                await message.edit(await buildMsg());
            } catch { return; }

            // Live-update every 5 seconds
            const interval = setInterval(async () => {
                try {
                    await message.edit(await buildMsg());
                } catch {
                    // Message deleted or no longer editable — stop updating
                    clearInterval(interval);
                    websiteStatsIntervals.delete(configId);
                }
            }, 5000);

            websiteStatsIntervals.set(configId, interval);
            return;
        }

        // ── PING ──────────────────────────────────────────────────────────────
        if (command === 'ping') {
            const t0 = Date.now();
            await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Pinging...\u001b[0m\n\`\`\``).catch(() => {});
            const apiLatency = Date.now() - t0;
            const wsLatency = Math.round((client as any).ws?.ping ?? -1);
            const DIM  = '\u001b[1;30m';
            const CYAN = '\u001b[1;36m';
            const GRN  = '\u001b[1;32m';
            const RST  = '\u001b[0m';
            await message.edit(
                `\`\`\`ansi\n` +
                `${CYAN}PING${RST}\n` +
                `${DIM}${'─'.repeat(28)}${RST}\n` +
                `${GRN}  API latency  ${RST}${DIM}·${RST} ${apiLatency}ms\n` +
                `${GRN}  WebSocket    ${RST}${DIM}·${RST} ${wsLatency >= 0 ? wsLatency + 'ms' : 'N/A'}\n` +
                `\`\`\``
            ).catch(() => {});
            return;
        }


        // ── USERNAME ─────────────────────────────────────────────────────────
        if (command === 'username') {
            const sub1 = args[0]?.toLowerCase(); // breach / leak
            const sub2 = args[1]?.toLowerCase(); // check
            const query = args[2];

            if (!query) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}username breach check <username>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] SEARCHING BREACH DATABASES FOR: ${query}\u001b[0m\n\u001b[1;30m> Querying Snusbase & LeakCheck...\u001b[0m\n\`\`\``);

            const [snusData, lcData] = await Promise.all([
                snusbaseSearch(query, 'username'),
                leakcheckQuery(query, 'username'),
            ]);

            let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] USERNAME ${(sub1 === 'breach' ? 'BREACH' : 'LEAK')} CHECK: ${query}\u001b[0m\n`;
            result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

            // Snusbase results
            if (snusData && snusData.results) {
                const entries = Object.values(snusData.results).flat() as any[];
                if (entries.length > 0) {
                    result += `\u001b[1;32m[SNUSBASE] Found ${entries.length} record(s)\u001b[0m\n`;
                    const shown = entries.slice(0, 5);
                    shown.forEach((e: any) => {
                        if (e.email)    result += `  \u001b[1;33mEmail:\u001b[0m    ${e.email}\n`;
                        if (e.username) result += `  \u001b[1;33mUser:\u001b[0m     ${e.username}\n`;
                        if (e.password) result += `  \u001b[1;33mPass:\u001b[0m     ${e.password}\n`;
                        if (e.hash)     result += `  \u001b[1;33mHash:\u001b[0m     ${e.hash}\n`;
                        if (e.lastip)   result += `  \u001b[1;33mLast IP:\u001b[0m  ${e.lastip}\n`;
                        if (e.name)     result += `  \u001b[1;33mName:\u001b[0m     ${e.name}\n`;
                        result += `  \u001b[1;30m──\u001b[0m\n`;
                    });
                    if (entries.length > 5) result += `  \u001b[1;30m...and ${entries.length - 5} more records\u001b[0m\n`;
                } else {
                    result += `\u001b[1;31m[SNUSBASE] No records found\u001b[0m\n`;
                }
            } else {
                result += `\u001b[1;31m[SNUSBASE] Query failed or no data\u001b[0m\n`;
            }

            // LeakCheck results
            if (lcData && lcData.success) {
                const found = lcData.found || 0;
                result += `\u001b[1;32m[LEAKCHECK] ${found} breach(es) found\u001b[0m\n`;
                if (lcData.result && Array.isArray(lcData.result)) {
                    lcData.result.slice(0, 5).forEach((r: any) => {
                        if (r.email)  result += `  \u001b[1;33mEmail:\u001b[0m  ${r.email}\n`;
                        if (r.source) result += `  \u001b[1;33mSource:\u001b[0m ${typeof r.source === 'object' ? r.source.name : r.source}\n`;
                        result += `  \u001b[1;30m──\u001b[0m\n`;
                    });
                }
            } else {
                result += `\u001b[1;31m[LEAKCHECK] ${lcData?.message || 'No data returned'}\u001b[0m\n`;
            }

            result += `\`\`\``;
            await message.edit(result).catch(() => {});
            return;
        }

        // ── EDR (Email/Phone Dossier Report) ─────────────────────────────────
        if (command === 'edr') {
            const sub = args[0]?.toLowerCase();
            const target = args.slice(1).join(' ').trim();

            if (sub !== 'email' && sub !== 'phone') {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage:\u001b[0m\n  ${prefix}edr email <email@domain.com>\n  ${prefix}edr phone <number>\n\`\`\``).catch(() => {});
            }

            // Helpers for nice boxed output
            const BAR = '═'.repeat(50);
            const SUB = '─'.repeat(50);
            const C  = (n: number) => `\u001b[1;${n}m`;
            const CY = C(36), YE = C(33), GR = C(32), RE = C(31), GY = C(30), WH = C(37), MA = C(35), RST = '\u001b[0m';
            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (k: string, v: string) => `  ${YE}${pad(k + ':', 14)}${RST} ${v}\n`;
            const head = (t: string) => `${CY}${SUB}${RST}\n${CY}[ ${t} ]${RST}\n`;

            // ─────────── EDR EMAIL ───────────
            if (sub === 'email') {
                const email = target;
                if (!email || !email.includes('@')) {
                    return message.edit(`\`\`\`ansi\n${RE}[!] Usage: ${prefix}edr email <email@domain.com>${RST}\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n${C(34)}[*] EDR · EMAIL DOSSIER: ${email}${RST}\n${GY}> Querying Snusbase + Snusbase Beta + LeakCheck + SEON + IntelBase...${RST}\n\`\`\``).catch(() => {});

                const [lcData, snusData, snusBeta, seonData, ibData] = await Promise.all([
                    leakcheckQuery(email, 'email'),
                    snusbaseSearch(email, 'email'),
                    snusbaseBetaSearch(email, 'email'),
                    seonEmailCheck(email),
                    intelbaseEmailQuery(email),
                ]);

                // Aggregate breach records into a unified list
                type Rec = { source: string; password?: string; hash?: string; username?: string; name?: string; ip?: string; phone?: string; address?: string; city?: string; state?: string; zip?: string; country?: string; dob?: string; db?: string };
                const records: Rec[] = [];
                const breachSources = new Set<string>();

                // Snusbase main
                if (snusData?.results) {
                    for (const [db, rows] of Object.entries<any>(snusData.results)) {
                        breachSources.add(db);
                        for (const e of (rows || [])) {
                            records.push({ source: 'Snusbase', db, password: e.password, hash: e.hash, username: e.username, name: e.name, ip: e.lastip || e.ip, phone: e.phone, address: e.address, city: e.city, state: e.state, zip: e.zip || e.zipcode, country: e.country, dob: e.dob || e.birthdate });
                        }
                    }
                }
                // Snusbase beta
                if (snusBeta?.results) {
                    for (const [db, rows] of Object.entries<any>(snusBeta.results)) {
                        breachSources.add(db);
                        for (const e of (rows || [])) {
                            records.push({ source: 'Snusbase Beta', db, password: e.password, hash: e.hash, username: e.username, name: e.name, ip: e.lastip || e.ip, phone: e.phone, address: e.address, city: e.city, state: e.state, zip: e.zip || e.zipcode, country: e.country, dob: e.dob || e.birthdate });
                        }
                    }
                }
                // LeakCheck
                if (lcData?.success && Array.isArray(lcData.result)) {
                    for (const e of lcData.result) {
                        const srcName = typeof e.source === 'object' ? e.source?.name : e.source;
                        if (srcName) breachSources.add(srcName);
                        records.push({ source: 'LeakCheck', db: srcName || '', password: e.password, hash: e.hash, username: e.username, name: e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : (e.name || e.username), phone: e.phone, address: e.address, city: e.city, state: e.state, zip: e.zip, country: e.country, dob: e.dob });
                    }
                }
                if (lcData?.sources && Array.isArray(lcData.sources)) {
                    for (const s of lcData.sources) breachSources.add(typeof s === 'string' ? s : s.name);
                }

                // Pull aggregated identity fields from records
                const usernames = Array.from(new Set(records.map(r => r.username).filter(Boolean))) as string[];
                const names     = Array.from(new Set(records.map(r => r.name).filter(Boolean))) as string[];
                const passwords = Array.from(new Set(records.map(r => r.password).filter(Boolean))) as string[];
                const ips       = Array.from(new Set(records.map(r => r.ip).filter(Boolean))) as string[];
                const phones    = Array.from(new Set(records.map(r => r.phone).filter(Boolean))) as string[];
                const addresses = Array.from(new Set(records.map(r => [r.address, r.city, r.state, r.zip, r.country].filter(Boolean).join(', ')).filter(s => s.length > 4))) as string[];
                const dobs      = Array.from(new Set(records.map(r => r.dob).filter(Boolean))) as string[];

                let r = `\`\`\`ansi\n`;
                r += `${CY}╔══════════════════════════════════════════════════╗${RST}\n`;
                r += `${CY}║              EDR · EMAIL DOSSIER                 ║${RST}\n`;
                r += `${CY}╚══════════════════════════════════════════════════╝${RST}\n`;
                r += `${WH}Target:${RST} ${email}\n`;
                r += `${GY}Sources queried: Snusbase · Snusbase Beta · LeakCheck · SEON · IntelBase${RST}\n`;

                // SUMMARY
                r += head('SUMMARY');
                r += row('Breaches',   `${breachSources.size}`);
                r += row('Records',    `${records.length}`);
                r += row('Passwords',  `${passwords.length}`);
                r += row('Usernames',  `${usernames.length}`);
                r += row('Names',      `${names.length}`);
                r += row('Phones',     `${phones.length}`);
                r += row('Addresses',  `${addresses.length}`);
                r += row('IPs',        `${ips.length}`);

                // IDENTITY (merged)
                r += head('IDENTITY (merged)');
                if (names.length)     r += row('Name(s)',    names.slice(0, 5).join(', '));
                if (usernames.length) r += row('Username(s)', usernames.slice(0, 8).join(', '));
                if (phones.length)    r += row('Phone(s)',   phones.slice(0, 5).join(', '));
                if (dobs.length)      r += row('DOB',        dobs.slice(0, 3).join(', '));
                if (addresses.length) r += row('Address',    addresses[0]);
                if (addresses.length > 1) {
                    addresses.slice(1, 4).forEach(a => r += `                 ${a}\n`);
                }
                if (ips.length)       r += row('Last IP',    ips.slice(0, 5).join(', '));
                if (!names.length && !usernames.length && !phones.length && !addresses.length && !ips.length) {
                    r += `  ${GY}— no identity fields recovered —${RST}\n`;
                }

                // CREDENTIALS
                r += head('CREDENTIALS');
                if (passwords.length === 0) {
                    r += `  ${GY}— no plaintext passwords recovered —${RST}\n`;
                } else {
                    passwords.slice(0, 12).forEach(p => r += `  ${RE}•${RST} ${p}\n`);
                    if (passwords.length > 12) r += `  ${GY}...and ${passwords.length - 12} more${RST}\n`;
                }

                // BREACH SOURCES
                r += head('BREACH SOURCES');
                if (breachSources.size === 0) {
                    r += `  ${GY}— none —${RST}\n`;
                } else {
                    Array.from(breachSources).slice(0, 25).forEach(s => r += `  ${MA}•${RST} ${s}\n`);
                    if (breachSources.size > 25) r += `  ${GY}...and ${breachSources.size - 25} more${RST}\n`;
                }

                // SEON intel
                if (seonData?.data) {
                    const d = seonData.data;
                    r += head('SEON · EMAIL INTEL');
                    if (d.deliverable !== undefined)            r += row('Deliverable',  d.deliverable ? `${GR}YES${RST}` : `${RE}NO${RST}`);
                    if (d.domain_details?.registered !== undefined) r += row('Domain reg',  d.domain_details.registered ? 'Yes' : 'No');
                    if (d.domain_details?.created)              r += row('Domain age',  String(d.domain_details.created));
                    if (d.domain_details?.disposable !== undefined) r += row('Disposable',  d.domain_details.disposable ? `${RE}YES${RST}` : 'No');
                    if (d.fraud_score !== undefined)            r += row('Fraud score', `${d.fraud_score}`);
                    if (d.account_details) {
                        const acc = d.account_details;
                        const accs: string[] = [];
                        for (const [k, v] of Object.entries<any>(acc)) {
                            if (v?.registered) accs.push(k);
                        }
                        if (accs.length) r += row('Registered',  accs.join(', '));
                    }
                    if (d.breach_details?.haveibeenpwned_listed !== undefined) {
                        r += row('HIBP listed', d.breach_details.haveibeenpwned_listed ? `${RE}YES${RST}` : 'No');
                    }
                }

                // IntelBase — registered services
                if (ibData) {
                    const ibServices: string[] = [];
                    const tryIb = (data: any) => {
                        if (!data) return;
                        const arr = data.accounts ?? data.sites ?? data.services ?? data.results ?? data.data ?? (Array.isArray(data) ? data : null);
                        if (Array.isArray(arr)) {
                            for (const item of arr) {
                                if (typeof item === 'string') { ibServices.push(item); continue; }
                                if (typeof item === 'object' && item) {
                                    const name = item.name ?? item.site ?? item.service ?? item.platform ?? item.domain ?? item.source;
                                    if (name) ibServices.push(String(name));
                                }
                            }
                        }
                        if (typeof data === 'object' && !Array.isArray(data)) {
                            for (const [k, v] of Object.entries<any>(data)) {
                                if (['accounts','sites','services','results','data'].includes(k)) continue;
                                if (v === true || (typeof v === 'object' && v?.registered)) ibServices.push(k);
                            }
                        }
                    };
                    tryIb(ibData); if (ibData.data) tryIb(ibData.data); if (ibData.results) tryIb(ibData.results);
                    const unique = Array.from(new Set(ibServices.map((s: string) => s.trim()).filter(Boolean)));
                    r += head('INTELBASE · REGISTERED SERVICES');
                    if (unique.length > 0) {
                        r += `  ${GR}Found on ${unique.length} service(s):${RST}\n`;
                        unique.forEach((s: string) => { r += `    ${GR}•${RST} ${s}\n`; });
                    } else {
                        r += `  ${GY}— no registered accounts found —${RST}\n`;
                    }
                }

                // Extra sources: Breachhub + Luperly + Swatted.wtf
                const extra = await extraOsintBlock(email, 'email');
                if (extra) r += extra;

                r += `${CY}${SUB}${RST}\n\`\`\``;

                // Discord caps messages at 2000 chars; split if needed
                const send = async (text: string) => {
                    if (text.length <= 1990) return message.edit(text).catch(() => {});
                    // Split — keep ANSI block wrapping
                    const lines = text.split('\n');
                    let buf = '```ansi\n';
                    let first = true;
                    for (const line of lines) {
                        if (line === '```ansi' || line === '```') continue;
                        if ((buf + line + '\n```').length > 1900) {
                            buf += '```';
                            if (first) { await message.edit(buf).catch(() => {}); first = false; }
                            else       { await message.channel.send(buf).catch(() => {}); }
                            buf = '```ansi\n';
                        }
                        buf += line + '\n';
                    }
                    buf += '```';
                    if (first) await message.edit(buf).catch(() => {});
                    else       await message.channel.send(buf).catch(() => {});
                };
                await send(r);
                return;
            }

            // ─────────── EDR PHONE ───────────
            if (sub === 'phone') {
                const number = target.replace(/[\s\-()]/g, '');
                if (!number || !/^\+?\d{6,15}$/.test(number)) {
                    return message.edit(`\`\`\`ansi\n${RE}[!] Usage: ${prefix}edr phone <+1XXXXXXXXXX>${RST}\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n${C(34)}[*] EDR · PHONE DOSSIER: ${number}${RST}\n${GY}> Querying Veriphone + SEON + Snusbase + Snusbase Beta + LeakCheck...${RST}\n\`\`\``).catch(() => {});

                // Search by phone in breach DBs (try with + and without)
                const phoneBare = number.replace(/^\+/, '');
                const phoneE164 = number.startsWith('+') ? number : `+${phoneBare}`;

                const [veri, seon, snusA, snusB, snusBetaA, snusBetaB, lc] = await Promise.all([
                    phoneVerify(phoneE164),
                    seonPhoneCheck(phoneE164),
                    snusbaseSearch(phoneBare, 'phone'),
                    snusbaseSearch(phoneE164, 'phone'),
                    snusbaseBetaSearch(phoneBare, 'phone'),
                    snusbaseBetaSearch(phoneE164, 'phone'),
                    leakcheckQuery(phoneBare, 'phone'),
                ]);

                // Aggregate breach records
                type Rec = { source: string; db?: string; email?: string; password?: string; username?: string; name?: string; ip?: string; address?: string; city?: string; state?: string; zip?: string; country?: string; dob?: string };
                const records: Rec[] = [];
                const breachSources = new Set<string>();

                const consumeSnus = (data: any, src: string) => {
                    if (!data?.results) return;
                    for (const [db, rows] of Object.entries<any>(data.results)) {
                        breachSources.add(db);
                        for (const e of (rows || [])) {
                            records.push({ source: src, db, email: e.email, password: e.password, username: e.username, name: e.name, ip: e.lastip || e.ip, address: e.address, city: e.city, state: e.state, zip: e.zip || e.zipcode, country: e.country, dob: e.dob || e.birthdate });
                        }
                    }
                };
                consumeSnus(snusA, 'Snusbase');
                consumeSnus(snusB, 'Snusbase');
                consumeSnus(snusBetaA, 'Snusbase Beta');
                consumeSnus(snusBetaB, 'Snusbase Beta');

                if (lc?.success && Array.isArray(lc.result)) {
                    for (const e of lc.result) {
                        const srcName = typeof e.source === 'object' ? e.source?.name : e.source;
                        if (srcName) breachSources.add(srcName);
                        records.push({ source: 'LeakCheck', db: srcName, email: e.email, password: e.password, username: e.username, name: e.first_name && e.last_name ? `${e.first_name} ${e.last_name}` : (e.name || ''), address: e.address, city: e.city, state: e.state, zip: e.zip, country: e.country, dob: e.dob });
                    }
                }

                const emails    = Array.from(new Set(records.map(x => x.email).filter(Boolean))) as string[];
                const usernames = Array.from(new Set(records.map(x => x.username).filter(Boolean))) as string[];
                const names     = Array.from(new Set(records.map(x => x.name).filter(Boolean))) as string[];
                const passwords = Array.from(new Set(records.map(x => x.password).filter(Boolean))) as string[];
                const ips       = Array.from(new Set(records.map(x => x.ip).filter(Boolean))) as string[];
                const dobs      = Array.from(new Set(records.map(x => x.dob).filter(Boolean))) as string[];
                // Build full-address strings
                const addressList = records
                    .map(x => ({
                        full: [x.address, x.city, x.state, x.zip, x.country].filter(Boolean).join(', '),
                        rec: x,
                    }))
                    .filter(a => a.full.length > 4);
                const uniqueAddrs = Array.from(new Set(addressList.map(a => a.full)));
                // "Last known address" — pick the longest/most complete
                const lastAddress = uniqueAddrs.sort((a, b) => b.length - a.length)[0] || '';

                let r = `\`\`\`ansi\n`;
                r += `${CY}╔══════════════════════════════════════════════════╗${RST}\n`;
                r += `${CY}║              EDR · PHONE DOSSIER                 ║${RST}\n`;
                r += `${CY}╚══════════════════════════════════════════════════╝${RST}\n`;
                r += `${WH}Target:${RST} ${phoneE164}\n`;
                r += `${GY}Sources: Veriphone · SEON · Snusbase · Snusbase Beta · LeakCheck${RST}\n`;

                // VALIDATION (Veriphone)
                r += head('VALIDATION');
                if (veri?.phone_valid !== undefined) {
                    r += row('Valid',     veri.phone_valid ? `${GR}YES${RST}` : `${RE}NO${RST}`);
                    if (veri.e164_format)          r += row('E.164',     veri.e164_format);
                    if (veri.international_format) r += row('Intl',      veri.international_format);
                    if (veri.country)              r += row('Country',   `${veri.country}${veri.country_code ? ` (${veri.country_code})` : ''}`);
                    if (veri.phone_region)         r += row('Region',    veri.phone_region);
                    if (veri.phone_type)           r += row('Line type', veri.phone_type);
                    if (veri.carrier)              r += row('Carrier',   veri.carrier);
                } else {
                    r += `  ${GY}— Veriphone unreachable —${RST}\n`;
                }

                // SEON phone intel
                if (seon?.data) {
                    const d = seon.data;
                    r += head('SEON · PHONE INTEL');
                    if (d.valid !== undefined)        r += row('Valid',       d.valid ? `${GR}YES${RST}` : `${RE}NO${RST}`);
                    if (d.type)                       r += row('Type',        d.type);
                    if (d.carrier)                    r += row('Carrier',     d.carrier);
                    if (d.country)                    r += row('Country',     d.country);
                    if (d.disposable !== undefined)   r += row('Disposable',  d.disposable ? `${RE}YES${RST}` : 'No');
                    if (d.score !== undefined)        r += row('Score',       `${d.score}`);
                    if (d.account_details) {
                        const accs: string[] = [];
                        for (const [k, v] of Object.entries<any>(d.account_details)) {
                            if (v?.registered) accs.push(k);
                        }
                        if (accs.length) r += row('Registered', accs.join(', '));
                    }
                }

                // LAST KNOWN ADDRESS
                r += head('LAST KNOWN ADDRESS');
                if (lastAddress) {
                    r += `  ${WH}${lastAddress}${RST}\n`;
                    if (uniqueAddrs.length > 1) {
                        r += `  ${GY}Other addresses on file:${RST}\n`;
                        uniqueAddrs.filter(a => a !== lastAddress).slice(0, 4).forEach(a => r += `    ${GY}•${RST} ${a}\n`);
                    }
                } else {
                    r += `  ${GY}— no address found in any breach record for this number —${RST}\n`;
                }

                // IDENTITY (merged from breach DBs)
                r += head('LINKED IDENTITY (from breach DBs)');
                if (names.length)     r += row('Name(s)',    names.slice(0, 5).join(', '));
                if (emails.length)    r += row('Email(s)',   emails.slice(0, 6).join(', '));
                if (usernames.length) r += row('Username(s)', usernames.slice(0, 6).join(', '));
                if (dobs.length)      r += row('DOB',        dobs.slice(0, 3).join(', '));
                if (ips.length)       r += row('Last IP(s)', ips.slice(0, 4).join(', '));
                if (!names.length && !emails.length && !usernames.length && !dobs.length && !ips.length) {
                    r += `  ${GY}— no linked identity records found —${RST}\n`;
                }

                // CREDENTIALS
                r += head('CREDENTIALS');
                if (passwords.length === 0) {
                    r += `  ${GY}— no plaintext passwords recovered —${RST}\n`;
                } else {
                    passwords.slice(0, 10).forEach(p => r += `  ${RE}•${RST} ${p}\n`);
                    if (passwords.length > 10) r += `  ${GY}...and ${passwords.length - 10} more${RST}\n`;
                }

                // BREACH SOURCES
                r += head('BREACH SOURCES');
                if (breachSources.size === 0) {
                    r += `  ${GY}— none —${RST}\n`;
                } else {
                    Array.from(breachSources).slice(0, 20).forEach(s => r += `  ${MA}•${RST} ${s}\n`);
                    if (breachSources.size > 20) r += `  ${GY}...and ${breachSources.size - 20} more${RST}\n`;
                }

                // SUMMARY
                r += head('SUMMARY');
                r += row('Breaches',  `${breachSources.size}`);
                r += row('Records',   `${records.length}`);
                r += row('Emails',    `${emails.length}`);
                r += row('Names',     `${names.length}`);
                r += row('Addresses', `${uniqueAddrs.length}`);
                r += row('Passwords', `${passwords.length}`);

                // Extra sources: Breachhub + Luperly + Swatted.wtf
                const extra = await extraOsintBlock(phoneE164, 'phone');
                if (extra) r += extra;

                r += `${CY}${SUB}${RST}\n\`\`\``;

                const send = async (text: string) => {
                    if (text.length <= 1990) return message.edit(text).catch(() => {});
                    const lines = text.split('\n');
                    let buf = '```ansi\n';
                    let first = true;
                    for (const line of lines) {
                        if (line === '```ansi' || line === '```') continue;
                        if ((buf + line + '\n```').length > 1900) {
                            buf += '```';
                            if (first) { await message.edit(buf).catch(() => {}); first = false; }
                            else       { await message.channel.send(buf).catch(() => {}); }
                            buf = '```ansi\n';
                        }
                        buf += line + '\n';
                    }
                    buf += '```';
                    if (first) await message.edit(buf).catch(() => {});
                    else       await message.channel.send(buf).catch(() => {});
                };
                await send(r);
                return;
            }
        }

        // ── FULL REPORT (multi-input mega-dossier) ───────────────────────────
        if (command === 'full' && args[0]?.toLowerCase() === 'report') {
            const raw = args.slice(1).join(' ').trim();
            if (!raw) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}full report <input1>, <input2>, ...\u001b[0m\n  Inputs: any mix of email, phone, IP, Discord ID, coordinates, address\n\`\`\``).catch(() => {});
            }

            const C = (n: number) => `\u001b[1;${n}m`;
            const CY = C(36), YE = C(33), GR = C(32), RE = C(31), GY = C(30), WH = C(37), MA = C(35), BL = C(34), RST = '\u001b[0m';
            const SUB = '─'.repeat(50);
            const padL = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row  = (k: string, v: string) => `  ${YE}${padL(k + ':', 14)}${RST} ${v}\n`;
            const head = (t: string) => `${CY}${SUB}${RST}\n${CY}[ ${t} ]${RST}\n`;

            // ── Tokenize and classify ────────────────────────────────────────
            type Kind = 'email' | 'ip' | 'discord' | 'phone' | 'coords' | 'address';
            const classifyOne = (v: string): Kind => {
                const t = v.trim();
                if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return 'email';
                if (/^(\d{1,3}\.){3}\d{1,3}$/.test(t)) return 'ip';
                if (/^[0-9a-fA-F:]+$/.test(t) && t.includes(':') && t.length >= 3) return 'ip'; // IPv6
                if (parseCoordinates(t)) return 'coords';
                const digits = t.replace(/[\s\-()+]/g, '');
                if (/^\d+$/.test(digits)) {
                    if (digits.length >= 17 && digits.length <= 20 && !t.startsWith('+')) return 'discord';
                    if (digits.length >= 7 && digits.length <= 15) return 'phone';
                    if (digits.length > 15) return 'discord';
                }
                return 'address';
            };

            // Split on commas, then merge logic
            const rawTokens = raw.split(',').map((s: string) => s.trim()).filter(Boolean);

            // Try to merge adjacent tokens that together form coords (e.g. "40.7128, -74.0060")
            const tokens: string[] = [];
            for (let i = 0; i < rawTokens.length; i++) {
                if (i + 1 < rawTokens.length) {
                    const merged = `${rawTokens[i]}, ${rawTokens[i + 1]}`;
                    if (parseCoordinates(merged)) {
                        tokens.push(merged);
                        i++;
                        continue;
                    }
                }
                tokens.push(rawTokens[i]);
            }

            // Merge adjacent address fragments (consecutive 'address'-classified tokens)
            const items: { kind: Kind; value: string }[] = [];
            let pendingAddr: string[] = [];
            const flushAddr = () => {
                if (pendingAddr.length) {
                    items.push({ kind: 'address', value: pendingAddr.join(', ') });
                    pendingAddr = [];
                }
            };
            for (const tk of tokens) {
                const k = classifyOne(tk);
                if (k === 'address') pendingAddr.push(tk);
                else { flushAddr(); items.push({ kind: k, value: tk }); }
            }
            flushAddr();

            if (items.length === 0) {
                return message.edit(`\`\`\`ansi\n${RE}[!] No valid inputs detected.${RST}\n\`\`\``).catch(() => {});
            }

            // Status banner
            const summary = items.map(i => `${i.kind}:${i.value.length > 30 ? i.value.slice(0, 27) + '...' : i.value}`).join(' | ');
            await message.edit(`\`\`\`ansi\n${BL}[*] FULL REPORT · ${items.length} input(s)${RST}\n${GY}> ${summary}${RST}\n${GY}> Querying every available OSINT source in parallel...${RST}\n\`\`\``).catch(() => {});

            // ── Per-kind builders ────────────────────────────────────────────
            const buildEmail = async (email: string): Promise<string> => {
                const [lc, sn, snB, seon] = await Promise.all([
                    leakcheckQuery(email, 'email'),
                    snusbaseSearch(email, 'email'),
                    snusbaseBetaSearch(email, 'email'),
                    seonEmailCheck(email),
                ]);
                const sources = new Set<string>();
                const passwords = new Set<string>();
                const usernames = new Set<string>();
                const names = new Set<string>();
                const phones = new Set<string>();
                const ips = new Set<string>();
                const addrs = new Set<string>();
                const dobs = new Set<string>();
                const records: { source: string; username?: string; email?: string; password?: string; hash?: string; ip?: string }[] = [];
                let recs = 0;
                const eat = (data: any) => {
                    if (!data?.results) return;
                    for (const [db, rows] of Object.entries<any>(data.results)) {
                        sources.add(db);
                        for (const e of (rows || [])) {
                            recs++;
                            if (e.password) passwords.add(e.password);
                            if (e.username) usernames.add(e.username);
                            if (e.name) names.add(e.name);
                            if (e.phone) phones.add(e.phone);
                            if (e.lastip || e.ip) ips.add(e.lastip || e.ip);
                            const a = [e.address, e.city, e.state, e.zip || e.zipcode, e.country].filter(Boolean).join(', ');
                            if (a.length > 4) addrs.add(a);
                            if (e.dob || e.birthdate) dobs.add(e.dob || e.birthdate);
                            records.push({ source: db, username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.lastip || e.ip });
                        }
                    }
                };
                eat(sn); eat(snB);
                if (lc?.success && Array.isArray(lc.result)) {
                    for (const e of lc.result) {
                        recs++;
                        const sn2 = typeof e.source === 'object' ? e.source?.name : e.source;
                        if (sn2) sources.add(sn2);
                        if (e.password) passwords.add(e.password);
                        if (e.username) usernames.add(e.username);
                        if (e.first_name && e.last_name) names.add(`${e.first_name} ${e.last_name}`);
                        else if (e.name) names.add(e.name);
                        if (e.phone) phones.add(e.phone);
                        const a = [e.address, e.city, e.state, e.zip, e.country].filter(Boolean).join(', ');
                        if (a.length > 4) addrs.add(a);
                        if (e.dob) dobs.add(e.dob);
                        records.push({ source: sn2 || 'LeakCheck', username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.ip });
                    }
                }

                let r = head(`EMAIL · ${email}`);
                r += row('Breaches',  `${sources.size}`);
                r += row('Records',   `${recs}`);
                if (names.size)     r += row('Name(s)',     Array.from(names).join(', '));
                if (usernames.size) r += row('Username(s)', Array.from(usernames).join(', '));
                if (phones.size)    r += row('Phone(s)',    Array.from(phones).join(', '));
                if (dobs.size)      r += row('DOB',         Array.from(dobs).join(', '));
                if (ips.size)       r += row('IP(s)',       Array.from(ips).join(', '));
                if (addrs.size) {
                    r += `  ${YE}Addresses:${RST}\n`;
                    Array.from(addrs).forEach(a => r += `    ${MA}•${RST} ${a}\n`);
                }
                if (passwords.size) {
                    r += `  ${YE}Passwords (unique):${RST}\n`;
                    Array.from(passwords).forEach(p => r += `    ${RE}•${RST} ${p}\n`);
                }
                if (sources.size) {
                    r += `  ${YE}Sources (${sources.size}):${RST} ${Array.from(sources).join(', ')}\n`;
                }
                // Per-record credential breakdown — what works for what
                if (records.length) {
                    r += `  ${YE}Credentials by source:${RST}\n`;
                    for (const rec of records) {
                        const id = rec.email || rec.username || '—';
                        const cred = rec.password ? rec.password : (rec.hash ? `<hash:${rec.hash.slice(0, 24)}${rec.hash.length > 24 ? '…' : ''}>` : `${GY}(no password)${RST}`);
                        const ipBit = rec.ip ? ` ${GY}[ip:${rec.ip}]${RST}` : '';
                        r += `    ${MA}•${RST} ${CY}[${rec.source}]${RST} ${id} :: ${RE}${cred}${RST}${ipBit}\n`;
                    }
                }
                if (seon?.data) {
                    const d = seon.data;
                    const bits: string[] = [];
                    if (d.deliverable !== undefined) bits.push(`deliverable=${d.deliverable ? 'Y' : 'N'}`);
                    if (d.fraud_score !== undefined) bits.push(`fraud=${d.fraud_score}`);
                    if (d.disposable !== undefined) bits.push(`disposable=${d.disposable ? 'Y' : 'N'}`);
                    if (bits.length) r += row('SEON', bits.join(' · '));
                    // Connected services / sites the email is registered on
                    if (d.account_details && typeof d.account_details === 'object') {
                        const services = Object.entries<any>(d.account_details)
                            .filter(([, v]) => v?.registered)
                            .map(([k, v]) => v?.name || k);
                        if (services.length) {
                            r += `  ${YE}Services:${RST}\n`;
                            services.slice(0, 18).forEach(s => r += `    ${MA}•${RST} ${s}\n`);
                            if (services.length > 18) r += `    ${GY}+${services.length - 18} more${RST}\n`;
                        }
                        // Per-service account creation dates (when SEON reports them)
                        const created = Object.entries<any>(d.account_details)
                            .filter(([, v]) => v?.registered && (v?.date || v?.created || v?.creation_date))
                            .map(([k, v]) => `${v?.name || k}=${v.date || v.created || v.creation_date}`);
                        if (created.length) r += row('Created', created.slice(0, 6).join(' · '));
                    }
                    if (d.domain_details) {
                        const dd = d.domain_details;
                        const dbits: string[] = [];
                        if (dd.created) dbits.push(`created=${dd.created}`);
                        if (dd.registrar_name) dbits.push(dd.registrar_name);
                        if (dd.tld) dbits.push(`tld=${dd.tld}`);
                        if (dbits.length) r += row('Domain', dbits.join(' · '));
                    }
                    if (d.breach_details?.breaches?.length) {
                        const list = d.breach_details.breaches.map((b: any) => b.name).filter(Boolean);
                        if (list.length) r += row('SEON breaches', list.slice(0, 8).join(', '));
                    }
                }
                r += await extraOsintBlock(email, 'email');
                return r;
            };

            const buildPhone = async (phoneRaw: string): Promise<string> => {
                const phoneBare = phoneRaw.replace(/[\s\-()+]/g, '');
                const phoneE164 = phoneRaw.startsWith('+') ? phoneRaw.replace(/[\s\-()]/g, '') : `+${phoneBare}`;
                const [veri, seon, snA, snB, sbA, sbB, lc] = await Promise.all([
                    phoneVerify(phoneE164),
                    seonPhoneCheck(phoneE164),
                    snusbaseSearch(phoneBare, 'phone'),
                    snusbaseSearch(phoneE164, 'phone'),
                    snusbaseBetaSearch(phoneBare, 'phone'),
                    snusbaseBetaSearch(phoneE164, 'phone'),
                    leakcheckQuery(phoneBare, 'phone'),
                ]);
                const sources = new Set<string>();
                const emails = new Set<string>();
                const passwords = new Set<string>();
                const usernames = new Set<string>();
                const names = new Set<string>();
                const ips = new Set<string>();
                const addrs = new Set<string>();
                const dobs = new Set<string>();
                const records: { source: string; username?: string; email?: string; password?: string; hash?: string; ip?: string; lastSeen?: string }[] = [];
                const nameCount = new Map<string, number>();
                const lastSeenAll: { source: string; ts: string }[] = [];
                let recs = 0;
                const pickLastSeen = (e: any): string | undefined => {
                    return e.last_seen || e.lastseen || e.last_login || e.lastlogin || e.last_active || e.lastactive
                         || e.last_ip_date || e.lastpinged || e.last_pinged || e.last_activity || e.last_seen_at;
                };
                const eat = (data: any) => {
                    if (!data?.results) return;
                    for (const [db, rows] of Object.entries<any>(data.results)) {
                        sources.add(db);
                        for (const e of (rows || [])) {
                            recs++;
                            if (e.email) emails.add(e.email);
                            if (e.password) passwords.add(e.password);
                            if (e.username) usernames.add(e.username);
                            if (e.name) { names.add(e.name); nameCount.set(e.name, (nameCount.get(e.name) || 0) + 1); }
                            if (e.lastip || e.ip) ips.add(e.lastip || e.ip);
                            const a = [e.address, e.city, e.state, e.zip || e.zipcode, e.country].filter(Boolean).join(', ');
                            if (a.length > 4) addrs.add(a);
                            if (e.dob || e.birthdate) dobs.add(e.dob || e.birthdate);
                            const ls = pickLastSeen(e);
                            if (ls) lastSeenAll.push({ source: db, ts: String(ls) });
                            records.push({ source: db, username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.lastip || e.ip, lastSeen: ls });
                        }
                    }
                };
                eat(snA); eat(snB); eat(sbA); eat(sbB);
                if (lc?.success && Array.isArray(lc.result)) {
                    for (const e of lc.result) {
                        recs++;
                        const sn = typeof e.source === 'object' ? e.source?.name : e.source;
                        if (sn) sources.add(sn);
                        if (e.email) emails.add(e.email);
                        if (e.password) passwords.add(e.password);
                        if (e.username) usernames.add(e.username);
                        const fullName = (e.first_name && e.last_name) ? `${e.first_name} ${e.last_name}` : e.name;
                        if (fullName) { names.add(fullName); nameCount.set(fullName, (nameCount.get(fullName) || 0) + 1); }
                        const a = [e.address, e.city, e.state, e.zip, e.country].filter(Boolean).join(', ');
                        if (a.length > 4) addrs.add(a);
                        if (e.dob) dobs.add(e.dob);
                        const ls = pickLastSeen(e);
                        if (ls) lastSeenAll.push({ source: sn || 'LeakCheck', ts: String(ls) });
                        records.push({ source: sn || 'LeakCheck', username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.ip, lastSeen: ls });
                    }
                }
                const lastAddr = Array.from(addrs).sort((a, b) => b.length - a.length)[0] || '';
                // Owner = most-seen name across all breach records
                const owner = Array.from(nameCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
                // Last pinged = newest parseable timestamp across records
                const lastPinged = lastSeenAll
                    .map(x => ({ ...x, ms: Date.parse(x.ts) }))
                    .filter(x => !isNaN(x.ms))
                    .sort((a, b) => b.ms - a.ms)[0];

                let r = head(`PHONE · ${phoneE164}`);
                if (veri?.phone_valid !== undefined) {
                    const bits: string[] = [];
                    bits.push(`valid=${veri.phone_valid ? 'Y' : 'N'}`);
                    if (veri.country) bits.push(veri.country);
                    if (veri.phone_type) bits.push(veri.phone_type);
                    if (veri.carrier) bits.push(veri.carrier);
                    r += row('Veriphone', bits.join(' · '));
                }
                if (seon?.data) {
                    const d = seon.data;
                    const bits: string[] = [];
                    if (d.valid !== undefined) bits.push(`valid=${d.valid ? 'Y' : 'N'}`);
                    if (d.type) bits.push(d.type);
                    if (d.carrier) bits.push(d.carrier);
                    if (d.country) bits.push(d.country);
                    if (d.score !== undefined) bits.push(`score=${d.score}`);
                    if (d.disposable !== undefined) bits.push(`disposable=${d.disposable ? 'Y' : 'N'}`);
                    if (bits.length) r += row('SEON', bits.join(' · '));
                    // Connected services for phone (SEON sometimes returns account_details for phones too)
                    if (d.account_details && typeof d.account_details === 'object') {
                        const services = Object.entries<any>(d.account_details)
                            .filter(([, v]) => v?.registered)
                            .map(([k, v]) => v?.name || k);
                        if (services.length) {
                            r += `  ${YE}Services (${services.length}):${RST}\n`;
                            services.forEach(s => r += `    ${MA}•${RST} ${s}\n`);
                        }
                        const created = Object.entries<any>(d.account_details)
                            .filter(([, v]) => v?.registered && (v?.date || v?.created || v?.creation_date))
                            .map(([k, v]) => `${v?.name || k}=${v.date || v.created || v.creation_date}`);
                        if (created.length) r += row('Created', created.join(' · '));
                    }
                }
                r += row('Owner',      owner || `${GY}unknown${RST}`);
                r += row('Connected',  lastAddr || `${GY}none${RST}`);
                if (lastPinged) r += row('Last pinged', `${lastPinged.ts} ${GY}(via ${lastPinged.source})${RST}`);
                else            r += row('Last pinged', `${GY}none recorded in any breach${RST}`);
                r += row('Breaches',   `${sources.size}`);
                r += row('Records',    `${recs}`);
                if (names.size)     r += row('Name(s)',    Array.from(names).join(', '));
                if (emails.size)    r += row('Email(s)',   Array.from(emails).join(', '));
                if (usernames.size) r += row('Username(s)', Array.from(usernames).join(', '));
                if (dobs.size)      r += row('DOB',        Array.from(dobs).join(', '));
                if (ips.size)       r += row('IP(s)',      Array.from(ips).join(', '));
                if (addrs.size > 1) {
                    r += `  ${YE}Other addrs:${RST}\n`;
                    Array.from(addrs).filter(a => a !== lastAddr).forEach(a => r += `    ${MA}•${RST} ${a}\n`);
                }
                if (passwords.size) {
                    r += `  ${YE}Passwords (unique):${RST}\n`;
                    Array.from(passwords).forEach(p => r += `    ${RE}•${RST} ${p}\n`);
                }
                if (sources.size) {
                    r += `  ${YE}Sources (${sources.size}):${RST} ${Array.from(sources).join(', ')}\n`;
                }
                if (records.length) {
                    r += `  ${YE}Credentials by source:${RST}\n`;
                    for (const rec of records) {
                        const id = rec.email || rec.username || '—';
                        const cred = rec.password ? rec.password : (rec.hash ? `<hash:${rec.hash.slice(0, 24)}${rec.hash.length > 24 ? '…' : ''}>` : `${GY}(no password)${RST}`);
                        const ipBit = rec.ip ? ` ${GY}[ip:${rec.ip}]${RST}` : '';
                        const seenBit = rec.lastSeen ? ` ${GY}[seen:${rec.lastSeen}]${RST}` : '';
                        r += `    ${MA}•${RST} ${CY}[${rec.source}]${RST} ${id} :: ${RE}${cred}${RST}${ipBit}${seenBit}\n`;
                    }
                }
                // Honest disclosure for things that look like they should be in OSINT but aren't.
                r += `  ${YE}911 / CAD calls:${RST} ${GY}not available — emergency-call records (date/time/transcript) are PSAP CAD/CDR data and are not exposed by any OSINT source. Requires subpoena / law-enforcement portal.${RST}\n`;
                r += await extraOsintBlock(phoneE164, 'phone');
                return r;
            };

            const buildIp = async (ip: string): Promise<string> => {
                const [api, info] = await Promise.all([ipApiLookup(ip), ipInfoLookup(ip)]);
                const lat = api?.lat ?? (info?.loc ? parseFloat(info.loc.split(',')[0]) : null);
                const lon = api?.lon ?? (info?.loc ? parseFloat(info.loc.split(',')[1]) : null);
                let geo: any = null;
                if (lat != null && lon != null) {
                    geo = await nominatimReverseAddress(lat, lon).catch(() => null);
                }
                let r = head(`IP · ${ip}`);
                if (api?.status === 'success') {
                    r += row('Country',  `${api.country}${api.countryCode ? ` (${api.countryCode})` : ''}`);
                    if (api.regionName) r += row('Region',   api.regionName);
                    if (api.city)       r += row('City',     api.city);
                    if (api.zip)        r += row('ZIP',      api.zip);
                    if (api.lat != null && api.lon != null) r += row('Coords', `${api.lat}, ${api.lon}`);
                    if (api.timezone)   r += row('Timezone', api.timezone);
                    if (api.isp)        r += row('ISP',      api.isp);
                    if (api.org)        r += row('Org',      api.org);
                    if (api.as)         r += row('ASN',      api.as);
                    if (api.reverse)    r += row('rDNS',     api.reverse);
                    const flags: string[] = [];
                    if (api.mobile)  flags.push(`${YE}mobile${RST}`);
                    if (api.proxy)   flags.push(`${RE}proxy/VPN${RST}`);
                    if (api.hosting) flags.push(`${RE}hosting${RST}`);
                    if (flags.length) r += row('Flags', flags.join(' · '));
                } else {
                    r += `  ${RE}ip-api: ${api?.message || 'failed'}${RST}\n`;
                }
                if (info && !info.bogon) {
                    if (info.hostname) r += row('Hostname', info.hostname);
                    if (info.org && info.org !== api?.org) r += row('IPInfo org', info.org);
                }
                if (geo?.address) r += row('Address',  geo.address);
                if (lat != null && lon != null) r += row('Map',  `https://www.google.com/maps?q=${lat},${lon}`);
                r += await extraOsintBlock(ip, 'ip');
                return r;
            };

            const buildCoords = async (s: string): Promise<string> => {
                const c = parseCoordinates(s)!;
                const geo = await nominatimReverseAddress(c.lat, c.lon).catch(() => null) as any;
                let r = head(`COORDS · ${c.lat}, ${c.lon}`);
                if (geo?.address) r += row('Address',  geo.address);
                if (geo?.road)    r += row('Road',     geo.road);
                if (geo?.city)    r += row('City',     geo.city);
                if (geo?.state)   r += row('State',    geo.state);
                if (geo?.country) r += row('Country',  geo.country);
                r += row('Map',      `https://www.google.com/maps?q=${c.lat},${c.lon}`);
                r += row('OSM',      `https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lon}#map=18/${c.lat}/${c.lon}`);
                return r;
            };

            const buildAddress = async (addr: string): Promise<string> => {
                const hit = await nominatimSearch(addr).catch(() => null);
                let r = head(`ADDRESS · ${addr}`);
                if (!hit) { r += `  ${GY}— address not found —${RST}\n`; return r; }
                const lat = parseFloat(hit.lat), lon = parseFloat(hit.lon);
                r += row('Resolved', hit.display_name || `${lat}, ${lon}`);
                if (hit.type)  r += row('Type',     `${hit.class || ''}/${hit.type}`);
                r += row('Coords',   `${lat}, ${lon}`);
                r += row('Map',      `https://www.google.com/maps?q=${lat},${lon}`);
                // Nearby Overpass features (best-effort, keep small)
                try {
                    const nearby = await overpassNearby(lat, lon, 60);
                    if (nearby && nearby.length) {
                        const named = nearby.filter((e: any) => e.tags?.name).slice(0, 5);
                        if (named.length) {
                            r += `  ${YE}Nearby:${RST}\n`;
                            named.forEach((e: any) => r += `    ${MA}•${RST} ${e.tags.name}${e.tags.amenity ? ` (${e.tags.amenity})` : ''}\n`);
                        }
                    }
                } catch (_) {}
                return r;
            };

            const buildDiscord = async (id: string): Promise<string> => {
                // Snowflake decode
                const DISCORD_EPOCH = 1420070400000n;
                let createdAt = 'Unknown', ageDays = 0;
                try {
                    const big = BigInt(id);
                    const ts = Number((big >> 22n) + DISCORD_EPOCH);
                    createdAt = new Date(ts).toUTCString();
                    ageDays = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
                } catch (_) {}
                let user: any = null;
                let userProfile: any = null;
                try { user = await client.users.fetch(id, { force: true }); } catch (_) {}
                // Try to grab the bio / about_me via the profile endpoint (selfbot)
                try { userProfile = await (user as any)?.fetchProfile?.(); } catch (_) {}
                // snowid.lol
                let snowid: any = null;
                try {
                    const resp = await fetch('https://snowid.lol/api/lookup', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ discordId: id, fast: true }),
                    });
                    try { snowid = JSON.parse(await resp.text()); } catch (_) {}
                } catch (_) {}
                // Breach DB queries
                const terms: string[] = [id];
                if (user?.username) {
                    terms.push(user.username);
                    if (user.discriminator && user.discriminator !== '0') terms.push(`${user.username}#${user.discriminator}`);
                }
                const queries: Promise<any>[] = [];
                for (const t of terms) {
                    queries.push(snusbaseSearch(t, 'username'));
                    queries.push(snusbaseBetaSearch(t, 'username'));
                    queries.push(leakcheckQuery(t, 'username'));
                }
                const all = await Promise.all(queries);
                const sources = new Set<string>();
                const emails = new Set<string>();
                const passwords = new Set<string>();
                const ips = new Set<string>();
                const aliases = new Set<string>();
                const records: { source: string; username?: string; email?: string; password?: string; hash?: string; ip?: string }[] = [];
                let recs = 0;
                for (let i = 0; i < all.length; i++) {
                    const data = all[i];
                    const isLc = (i % 3) === 2;
                    if (isLc) {
                        if (data?.success && Array.isArray(data.result)) {
                            for (const e of data.result) {
                                recs++;
                                const sn = typeof e.source === 'object' ? e.source?.name : e.source;
                                if (sn) sources.add(sn);
                                if (e.email) emails.add(e.email);
                                if (e.password) passwords.add(e.password);
                                if (e.username) aliases.add(e.username);
                                records.push({ source: sn || 'LeakCheck', username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.ip });
                            }
                        }
                    } else if (data?.results) {
                        for (const [db, rows] of Object.entries<any>(data.results)) {
                            sources.add(db);
                            for (const e of (rows || [])) {
                                recs++;
                                if (e.email) emails.add(e.email);
                                if (e.password) passwords.add(e.password);
                                if (e.lastip || e.ip) ips.add(e.lastip || e.ip);
                                if (e.username) aliases.add(e.username);
                                records.push({ source: db, username: e.username, email: e.email, password: e.password, hash: e.hash, ip: e.lastip || e.ip });
                            }
                        }
                    }
                }

                let r = head(`DISCORD · ${id}`);
                if (user) {
                    const flags = user.flags?.toArray().join(', ') || 'None';
                    r += row('Tag',       user.tag);
                    r += row('Username',  user.username);
                    r += row('Display',   user.displayName || user.globalName || user.username);
                    r += row('Bot',       user.bot ? 'Yes' : 'No');
                    r += row('Badges',    flags);
                    const bio = userProfile?.bio || userProfile?.user?.bio || (userProfile as any)?.user_profile?.bio || '';
                    if (bio) {
                        r += `  ${YE}Bio:${RST}\n`;
                        String(bio).split('\n').forEach(line => r += `    ${line}\n`);
                    }
                    const pronouns = userProfile?.pronouns || (userProfile as any)?.user_profile?.pronouns;
                    if (pronouns) r += row('Pronouns', String(pronouns));
                    if (userProfile?.connectedAccounts?.length || userProfile?.connected_accounts?.length) {
                        const conn = (userProfile.connectedAccounts || userProfile.connected_accounts || [])
                            .map((c: any) => `${c.type}:${c.name || c.id}${c.verified ? ' ✓' : ''}`);
                        if (conn.length) r += row('Connections', conn.join(', '));
                    }
                    if (user.avatar) r += row('Avatar', `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=512`);
                    if (user.banner) r += row('Banner', `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${user.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`);
                    if (user.accentColor) r += row('Accent', `#${user.accentColor.toString(16).padStart(6, '0')}`);
                } else {
                    r += `  ${RE}— user could not be fetched —${RST}\n`;
                }
                r += row('Created',  createdAt);
                r += row('Age',      `${ageDays} days`);
                if (snowid && !snowid.error) {
                    const entries = Object.entries(snowid).filter(([, v]) => v != null && v !== '' && typeof v !== 'object');
                    if (entries.length) {
                        r += `  ${YE}snowid.lol:${RST}\n`;
                        entries.forEach(([k, v]) => r += `    ${MA}•${RST} ${k}: ${v}\n`);
                    }
                }
                r += row('Breaches', `${sources.size}`);
                r += row('Records',  `${recs}`);
                if (emails.size)    r += row('Emails',   Array.from(emails).join(', '));
                if (aliases.size)   r += row('Aliases',  Array.from(aliases).join(', '));
                if (ips.size)       r += row('IPs',      Array.from(ips).join(', '));
                if (passwords.size) {
                    r += `  ${YE}Passwords (unique):${RST}\n`;
                    Array.from(passwords).forEach(p => r += `    ${RE}•${RST} ${p}\n`);
                }
                if (sources.size) {
                    r += `  ${YE}Sources (${sources.size}):${RST} ${Array.from(sources).join(', ')}\n`;
                }
                if (records.length) {
                    r += `  ${YE}Credentials by source:${RST}\n`;
                    for (const rec of records) {
                        const id2 = rec.email || rec.username || '—';
                        const cred = rec.password ? rec.password : (rec.hash ? `<hash:${rec.hash.slice(0, 24)}${rec.hash.length > 24 ? '…' : ''}>` : `${GY}(no password)${RST}`);
                        const ipBit = rec.ip ? ` ${GY}[ip:${rec.ip}]${RST}` : '';
                        r += `    ${MA}•${RST} ${CY}[${rec.source}]${RST} ${id2} :: ${RE}${cred}${RST}${ipBit}\n`;
                    }
                }
                r += await extraOsintBlock(id, 'discord');
                if (user?.username) r += await extraOsintBlock(user.username, 'username');

                // ── Parallax (csintduck.cc) ──────────────────────────────────
                const pxTerms: string[] = [id];
                if (user?.username) pxTerms.push(user.username);
                if (user?.discriminator && user.discriminator !== '0') pxTerms.push(`${user.username}#${user.discriminator}`);

                const pxAll = await Promise.all(pxTerms.map(q => parallaxQuery(q)));

                const pxEmails    = new Set<string>();
                const pxPasswords = new Set<string>();
                const pxUsernames = new Set<string>();
                const pxNames     = new Set<string>();
                const pxPhones    = new Set<string>();
                const pxIps       = new Set<string>();
                const pxSources   = new Set<string>();
                const pxAddresses = new Set<string>();
                const pxDobs      = new Set<string>();
                const pxMisc      = new Map<string, string>();
                let   pxRecords   = 0;
                let   pxReached   = false;

                const FR_SKIP = new Set(['query','status','code','message','error','success','ok','took','total','count','id']);
                function digestPx(obj: any, depth = 0): void {
                    if (!obj || depth > 6) return;
                    if (Array.isArray(obj)) { for (const v of obj) digestPx(v, depth + 1); return; }
                    if (typeof obj !== 'object') return;
                    for (const [rawK, val] of Object.entries(obj)) {
                        const k = rawK.toLowerCase().replace(/[\s_-]/g, '');
                        if (val == null || val === '') continue;
                        if (typeof val === 'object') { digestPx(val, depth + 1); continue; }
                        const s = String(val).trim();
                        if (!s || s === 'null' || s === 'undefined') continue;
                        if (/email/.test(k))                                                           { pxEmails.add(s);    pxRecords++; }
                        else if (k==='password'||k==='pass'||k==='plaintext'||k==='pwd')               { pxPasswords.add(s); pxRecords++; }
                        else if (/username|login|handle|nick/.test(k))                                 { pxUsernames.add(s); pxRecords++; }
                        else if (/^(name|fullname|realname|firstname|lastname)$/.test(k))              { pxNames.add(s);     pxRecords++; }
                        else if (/phone|mobile|tel/.test(k))                                           { pxPhones.add(s);    pxRecords++; }
                        else if (/^(ip|lastip|ipaddress)$/.test(k))                                   { pxIps.add(s);       pxRecords++; }
                        else if (/source|database|breach|leak/.test(k))                                { pxSources.add(s); }
                        else if (/dob|birthdate|birthday/.test(k))                                     { pxDobs.add(s);      pxRecords++; }
                        else if (/address|street|city|state|zip|postal|country/.test(k))               { pxAddresses.add(s); pxRecords++; }
                        else if (!FR_SKIP.has(k) && s.length < 120)                                    { pxMisc.set(rawK, s); }
                    }
                }

                for (const res of pxAll) {
                    if (res) { pxReached = true; digestPx(res); }
                }

                r += `${CY}${SUB}${RST}\n${CY}[ PARALLAX INTEL (csintduck.cc) ]${RST}\n`;
                if (!pxReached) {
                    r += `  ${GY}— service unreachable or returned no data —${RST}\n`;
                } else if (pxRecords === 0 && pxMisc.size === 0 && pxSources.size === 0) {
                    r += `  ${GY}— no records found for this target —${RST}\n`;
                } else {
                    if (pxSources.size)   r += `  ${YE}Sources (${pxSources.size}):${RST}  ${Array.from(pxSources).join(' · ')}\n`;
                    if (pxRecords > 0)    r += `  ${YE}Fields found:${RST} ${pxRecords}\n`;
                    if (pxNames.size) {
                        r += `\n  ${YE}Name(s):${RST}\n`;
                        Array.from(pxNames).slice(0, 5).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxUsernames.size) {
                        r += `  ${YE}Username(s):${RST}\n`;
                        Array.from(pxUsernames).slice(0, 6).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxEmails.size) {
                        r += `  ${YE}Email(s):${RST}\n`;
                        Array.from(pxEmails).slice(0, 6).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxPhones.size) {
                        r += `  ${YE}Phone(s):${RST}\n`;
                        Array.from(pxPhones).slice(0, 4).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxIps.size) {
                        r += `  ${YE}IP Address(es):${RST}\n`;
                        Array.from(pxIps).slice(0, 4).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxDobs.size) {
                        r += `  ${YE}Date of Birth:${RST}\n`;
                        Array.from(pxDobs).slice(0, 3).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxAddresses.size) {
                        r += `  ${YE}Address(es):${RST}\n`;
                        Array.from(pxAddresses).slice(0, 3).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxPasswords.size) {
                        r += `  ${YE}Password(s):${RST}\n`;
                        Array.from(pxPasswords).slice(0, 8).forEach(v => r += `    ${RE}•${RST} ${v}\n`);
                    }
                    if (pxMisc.size) {
                        r += `  ${YE}Additional Fields:${RST}\n`;
                        Array.from(pxMisc.entries()).slice(0, 10).forEach(([k, v]) => {
                            const label = k.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                            r += `    ${GY}${label}:${RST} ${v}\n`;
                        });
                    }
                }

                return r;
            };

            // ── Run all sections in parallel ─────────────────────────────────
            const sectionPromises = items.map(item => {
                switch (item.kind) {
                    case 'email':   return buildEmail(item.value);
                    case 'phone':   return buildPhone(item.value);
                    case 'ip':      return buildIp(item.value);
                    case 'coords':  return buildCoords(item.value);
                    case 'address': return buildAddress(item.value);
                    case 'discord': return buildDiscord(item.value);
                }
            });
            const sections = await Promise.all(sectionPromises);

            // ── Assemble final report ────────────────────────────────────────
            let out = `\`\`\`ansi\n`;
            out += `${CY}╔══════════════════════════════════════════════════╗${RST}\n`;
            out += `${CY}║                FULL OSINT REPORT                 ║${RST}\n`;
            out += `${CY}╚══════════════════════════════════════════════════╝${RST}\n`;
            out += `${WH}Inputs:${RST} ${items.length}\n`;
            items.forEach((i, idx) => {
                out += `  ${YE}${idx + 1}.${RST} ${GY}[${i.kind}]${RST} ${i.value}\n`;
            });
            out += sections.join('');
            out += `${CY}${SUB}${RST}\n\`\`\``;

            // Send with auto-split (each section in its own message if huge)
            const sendMulti = async (text: string) => {
                if (text.length <= 1990) {
                    return message.edit(text).catch(() => {});
                }
                const lines = text.split('\n');
                let buf = '```ansi\n';
                let first = true;
                for (const line of lines) {
                    if (line === '```ansi' || line === '```') continue;
                    if ((buf + line + '\n```').length > 1900) {
                        buf += '```';
                        if (first) { await message.edit(buf).catch(() => {}); first = false; }
                        else       { await message.channel.send(buf).catch(() => {}); }
                        buf = '```ansi\n';
                    }
                    buf += line + '\n';
                }
                buf += '```';
                if (first) await message.edit(buf).catch(() => {});
                else       await message.channel.send(buf).catch(() => {});
            };
            await sendMulti(out);

            // ── Also send a clean .txt download of the same report ──────────
            try {
                const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '').replace(/^```ansi\n?|```$/gm, '');
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                const header =
                    `FULL OSINT REPORT\n` +
                    `Generated: ${new Date().toUTCString()}\n` +
                    `Inputs (${items.length}):\n` +
                    items.map((i, idx) => `  ${idx + 1}. [${i.kind}] ${i.value}`).join('\n') +
                    `\n${'='.repeat(60)}\n\n`;
                const body = stripAnsi(sections.join(''));
                const fileBuffer = Buffer.from(header + body, 'utf-8');
                await message.channel.send({
                    content: `\`\`\`ansi\n${BL}[+] Full report attached as a downloadable file${RST}\n\`\`\``,
                    files: [{ attachment: fileBuffer, name: `full-report-${ts}.txt` }],
                }).catch(() => {});
            } catch (_) { /* file send is best-effort */ }
            return;
        }

        // ── MEMBERS MSGS ──────────────────────────────────────────────────────
        if (command === 'members' && args[0]?.toLowerCase() === 'msgs') {
            const count = parseInt(args[1]);
            if (isNaN(count) || count < 1) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}members msgs <count>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] FETCHING LAST ${count} MEMBER MESSAGES...\u001b[0m\n\`\`\``);

            try {
                const fetched = await message.channel.messages.fetch({ limit: Math.min(count + 5, 100) });
                const msgs = Array.from(fetched.values())
                    .filter((m: any) => !m.author.bot && m.id !== message.id && m.content?.trim())
                    .slice(0, count);

                if (msgs.length === 0) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No recent member messages found.\u001b[0m\n\`\`\``).catch(() => {});
                }

                let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] LAST ${msgs.length} MESSAGES\u001b[0m\n`;
                result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

                msgs.reverse().forEach((m: any) => {
                    const ts = new Date(m.createdTimestamp).toLocaleTimeString();
                    const tag = m.author.tag || m.author.username;
                    const content = m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content;
                    result += `\u001b[1;33m[${ts}]\u001b[0m \u001b[1;32m${tag}\u001b[0m: ${content}\n`;
                });

                result += `\`\`\``;
                await message.edit(result).catch(() => {});
            } catch (e) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch messages.\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── IP CHECK (enhanced with map) ──────────────────────────────────────
        // ── CONVERT CORDS (reverse geocode coordinates → address) ────────────
        if (command === 'convert' && args[0]?.toLowerCase() === 'cords') {
            const raw = args.slice(1).join(' ').trim();
            if (!raw) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}convert cords <coordinates>\u001b[0m\n\u001b[1;30mAccepts decimal (e.g. 42.2853, -87.9532) or DMS (e.g. 42°17'07.1"N 87°57'11.5"W).\u001b[0m\n\`\`\``).catch(() => {});
            }

            const parsed = parseCoordinates(raw);
            if (!parsed) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Could not parse coordinates: ${raw}\u001b[0m\n\u001b[1;30mTry: 42.2853, -87.9532  or  42°17'07.1"N 87°57'11.5"W\u001b[0m\n\`\`\``).catch(() => {});
            }

            const { lat, lon } = parsed;
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] Reverse geocoding ${lat}, ${lon}...\u001b[0m\n\`\`\``).catch(() => {});

            const addr = await nominatimReverseAddress(lat, lon);
            if (!addr) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Reverse geocoding failed or no result.\u001b[0m\n\`\`\``).catch(() => {});
            }

            const street = [addr.houseNumber, addr.road].filter(Boolean).join(' ') || (addr.road || '—');
            const mapUrl = staticMapUrl(lat, lon, 14);
            const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
            const osmUrl = osmEmbedUrl(lat, lon, 0.02);

            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (label: string, value: string) =>
                `  \u001b[1;33m${pad(label + ':', 12)}\u001b[0m ${value}\n`;

            let result = `\`\`\`ansi\n`;
            result += `\u001b[1;36m╔══════════════════════════════════════════════╗\u001b[0m\n`;
            result += `\u001b[1;36m║         NETRUNNER · COORD → ADDRESS          ║\u001b[0m\n`;
            result += `\u001b[1;36m╚══════════════════════════════════════════════╝\u001b[0m\n`;
            result += `\u001b[1;37mInput:\u001b[0m  ${raw}\n`;
            result += `\u001b[1;37mCoords:\u001b[0m ${lat}, ${lon}\n`;
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ ADDRESS ]\u001b[0m\n`;
            result += row('Address',  addr.formatted || '—');
            result += row('Street',   street);
            result += row('City',     addr.city || '—');
            result += row('Region',   addr.state || '—');
            result += row('Postcode', addr.postcode || '—');
            result += row('Country',  addr.country ? `${addr.country}${addr.countryCode ? ` (${addr.countryCode})` : ''}` : '—');
            if (!addr.isExactAddress) {
                result += `  \u001b[1;30m(no exact street number at these coords — showing nearest road)\u001b[0m\n`;
            }
            if (addr.placeName && addr.placeName !== addr.road) {
                result += row('Nearby',  `${addr.placeName}${addr.placeType ? ` (${addr.placeType})` : ''}`);
            }
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ MAP ]\u001b[0m\n`;
            result += `  \u001b[1;32mGoogle:\u001b[0m ${googleMapsUrl}\n`;
            result += `  \u001b[1;32mOSM:\u001b[0m    ${osmUrl}\n`;

            result += `\`\`\``;

            await message.edit(result).catch(() => {});
            await message.channel.send(mapUrl).catch(() => {});
            return;
        }

        // ── GPT — keyless AI chat via Pollinations.ai ────────────────────────
        if (command === 'gpt') {
            const question = args.join(' ').trim();
            if (!question) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}gpt <question>\u001b[0m\n\u001b[1;30mExample: ${prefix}gpt who won the 2022 world cup?\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] Asking AI...\u001b[0m\n\u001b[1;30m> ${question.slice(0, 100)}${question.length > 100 ? '...' : ''}\u001b[0m\n\`\`\``).catch(() => {});

            try {
                const resp = await fetch('https://text.pollinations.ai/openai', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: 'openai',
                        messages: [
                            { role: 'system', content: 'You are a helpful, concise assistant. Keep answers under 1500 characters when possible.' },
                            { role: 'user', content: question },
                        ],
                    }),
                });

                if (!resp.ok) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] AI request failed (${resp.status}).\u001b[0m\n\`\`\``).catch(() => {});
                }

                let answer = '';
                const ct = resp.headers.get('content-type') || '';
                if (ct.includes('application/json')) {
                    const data: any = await resp.json();
                    answer = data?.choices?.[0]?.message?.content || data?.response || JSON.stringify(data).slice(0, 1500);
                } else {
                    answer = await resp.text();
                }

                answer = (answer || '').trim();
                if (!answer) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] AI returned an empty response.\u001b[0m\n\`\`\``).catch(() => {});
                }

                // Discord message hard limit is 2000 chars. Reserve room for header + code fences.
                const MAX = 1850;
                if (answer.length <= MAX) {
                    await message.edit(`**🤖 GPT** — *${question.slice(0, 80)}${question.length > 80 ? '...' : ''}*\n\`\`\`\n${answer}\n\`\`\``).catch(() => {});
                } else {
                    // Split into chunks across multiple messages
                    const chunks: string[] = [];
                    let remaining = answer;
                    while (remaining.length > 0) {
                        chunks.push(remaining.slice(0, MAX));
                        remaining = remaining.slice(MAX);
                    }
                    await message.edit(`**🤖 GPT** — *${question.slice(0, 80)}${question.length > 80 ? '...' : ''}*\n\`\`\`\n${chunks[0]}\n\`\`\``).catch(() => {});
                    for (let i = 1; i < chunks.length; i++) {
                        await message.channel.send(`\`\`\`\n${chunks[i]}\n\`\`\``).catch(() => {});
                    }
                }
            } catch (e: any) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] AI request error: ${e?.message || 'unknown'}\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── WHO LIVES <address> — public-only occupancy info ─────────────────
        if (command === 'who' && args[0]?.toLowerCase() === 'lives') {
            // Allow `.who lives at 123 Main St` or `.who lives 123 Main St`
            const startIdx = args[1]?.toLowerCase() === 'at' ? 2 : 1;
            const address = args.slice(startIdx).join(' ').trim();
            if (!address) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}who lives <address>\u001b[0m\n\u001b[1;30mExample: ${prefix}who lives 1600 Pennsylvania Ave NW, Washington DC\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] WHO LIVES: ${address}\u001b[0m\n\u001b[1;30m> Searching public records (OSM + Wikidata)...\u001b[0m\n\`\`\``).catch(() => {});

            const place = await nominatimSearch(address);
            if (!place) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Address not found in OpenStreetMap.\u001b[0m\n\`\`\``).catch(() => {});
            }

            const lat = parseFloat(place.lat);
            const lon = parseFloat(place.lon);
            const a = place.address || {};
            const extratags = place.extratags || {};
            const buildingType = extratags.building || a.building || place.type || place.category || '';
            const placeName = place.namedetails?.name || place.name || '';
            const formatted = place.display_name || address;

            // Run lookups in parallel: nearby businesses + notable Wikidata residents
            const placeQid = (extratags['wikidata'] || place.extratags?.wikidata || '');
            const [pois, residents] = await Promise.all([
                overpassNearby(lat, lon, 30),
                wikidataResidentsAt(placeQid),
            ]);

            // Filter & dedupe POIs (keep ones with a name)
            const seen = new Set<string>();
            const businesses = pois
                .map((el: any) => {
                    const t = el.tags || {};
                    const nm = t.name;
                    if (!nm || seen.has(nm)) return null;
                    seen.add(nm);
                    const kind = t.amenity || t.shop || t.office || t.tourism || t.craft || t.leisure || t.building || '';
                    return { name: nm, kind };
                })
                .filter((x: any): x is { name: string; kind: string } => !!x)
                .slice(0, 15);

            const isResidential = /residential|apartments|house|detached|terrace|dormitory/i.test(buildingType);

            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (label: string, value: string) =>
                `  \u001b[1;33m${pad(label + ':', 14)}\u001b[0m ${value}\n`;

            let result = `\`\`\`ansi\n`;
            result += `\u001b[1;36m╔══════════════════════════════════════════════╗\u001b[0m\n`;
            result += `\u001b[1;36m║         NETRUNNER · WHO LIVES HERE           ║\u001b[0m\n`;
            result += `\u001b[1;36m╚══════════════════════════════════════════════╝\u001b[0m\n`;
            result += `\u001b[1;37mInput:\u001b[0m  ${address}\n`;
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;

            result += `\u001b[1;36m[ LOCATION ]\u001b[0m\n`;
            result += row('Address',  formatted);
            result += row('Coords',   `${lat}, ${lon}`);
            result += row('City',     a.city || a.town || a.village || a.hamlet || '—');
            result += row('Region',   a.state || a.region || '—');
            result += row('Country',  a.country || '—');

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ BUILDING ]\u001b[0m\n`;
            result += row('Type',     buildingType || 'unknown');
            result += row('Name',     placeName || '—');
            result += row('Use',      isResidential ? 'Residential' : (buildingType ? 'Non-residential' : 'Unknown'));

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ BUSINESSES / TENANTS AT THIS LOCATION ]\u001b[0m\n`;
            if (businesses.length === 0) {
                result += `  \u001b[1;30m— None registered in OpenStreetMap at this address —\u001b[0m\n`;
            } else {
                for (const b of businesses) {
                    result += `  • \u001b[1;37m${b.name}\u001b[0m${b.kind ? ` \u001b[1;30m(${b.kind})\u001b[0m` : ''}\n`;
                }
            }

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ NOTABLE PEOPLE LINKED TO THIS PLACE ]\u001b[0m\n`;
            if (residents.length === 0) {
                result += `  \u001b[1;30m— No public-figure entries link this place to a person —\u001b[0m\n`;
            } else {
                for (const r of residents.slice(0, 12)) {
                    result += `  • \u001b[1;37m${r.name}\u001b[0m \u001b[1;30m(${r.relation})\u001b[0m\n`;
                    if (r.description) result += `      ${r.description.slice(0, 70)}\n`;
                }
            }

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;30mNote: Names of private residents are not in any free public dataset.\u001b[0m\n`;
            result += `\u001b[1;30mThis report only shows publicly registered businesses and notable\u001b[0m\n`;
            result += `\u001b[1;30mpublic-figure connections (Wikipedia/Wikidata).\u001b[0m\n`;
            result += `\`\`\``;

            await message.edit(result).catch(() => {});
            return;
        }

        // ── WHO IS <full name> — biographical + family OSINT via Wikidata ────
        if (command === 'who' && args[0]?.toLowerCase() === 'is') {
            const name = args.slice(1).join(' ').trim();
            if (!name) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}who is <full name>\u001b[0m\n\u001b[1;30mExample: ${prefix}who is Elon Musk\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] WHO IS: ${name}\u001b[0m\n\u001b[1;30m> Searching Wikidata + Wikipedia...\u001b[0m\n\`\`\``).catch(() => {});

            const hit = await wdSearchPerson(name);
            if (!hit) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No public record found for "${name}".\u001b[0m\n\u001b[1;30mThis lookup only finds notable / public figures (no private-individual data exists in any free public API).\u001b[0m\n\`\`\``).catch(() => {});
            }

            const subj = (await wdGetEntities([hit.id]))[hit.id];
            if (!subj) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Could not load entity ${hit.id}.\u001b[0m\n\`\`\``).catch(() => {});
            }

            // Collect all related entity IDs we need labels for
            const fatherIds  = wdClaimIds(subj, 'P22');
            const motherIds  = wdClaimIds(subj, 'P25');
            const spouseIds  = wdClaimIds(subj, 'P26');
            const childIds   = wdClaimIds(subj, 'P40');
            const siblingIds = wdClaimIds(subj, 'P3373');
            const occIds     = wdClaimIds(subj, 'P106');
            const citIds     = wdClaimIds(subj, 'P27');
            const pobIds     = wdClaimIds(subj, 'P19');
            const podIds     = wdClaimIds(subj, 'P20');
            const genderIds  = wdClaimIds(subj, 'P21');

            const allIds = Array.from(new Set([
                ...fatherIds, ...motherIds, ...spouseIds, ...childIds, ...siblingIds,
                ...occIds, ...citIds, ...pobIds, ...podIds, ...genderIds,
            ]));
            const related = await wdGetEntities(allIds);
            const labelOf = (id: string) => related[id]?.labels?.en?.value || id;
            const descOf  = (id: string) => related[id]?.descriptions?.en?.value || '';

            const dob = wdClaimTime(subj, 'P569');
            const dod = wdClaimTime(subj, 'P570');

            // Pull a short bio summary from Wikipedia (use the Wikidata label as title)
            const bio = await wikiSummary(hit.label);
            const bioShort = bio ? bio.split('. ').slice(0, 2).join('. ') + (bio.includes('.') ? '.' : '') : '';

            const fmtList = (ids: string[], max = 10) => {
                if (ids.length === 0) return '—';
                const names = ids.slice(0, max).map(labelOf);
                const extra = ids.length > max ? ` (+${ids.length - max} more)` : '';
                return names.join(', ') + extra;
            };
            const fmtFamily = (ids: string[], max = 10) => {
                if (ids.length === 0) return '—';
                return ids.slice(0, max).map(id => {
                    const d = descOf(id);
                    return d ? `${labelOf(id)} (${d})` : labelOf(id);
                }).join('\n               ') + (ids.length > max ? `\n               (+${ids.length - max} more)` : '');
            };

            const wikidataUrl = `https://www.wikidata.org/wiki/${hit.id}`;
            const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(hit.label.replace(/ /g, '_'))}`;

            let result = `\`\`\`ansi\n`;
            result += `\u001b[1;36m╔══════════════════════════════════════════════╗\u001b[0m\n`;
            result += `\u001b[1;36m║          NETRUNNER · WHO IS REPORT           ║\u001b[0m\n`;
            result += `\u001b[1;36m╚══════════════════════════════════════════════╝\u001b[0m\n`;
            result += `\u001b[1;37mTarget:\u001b[0m ${hit.label}\n`;
            if (hit.description) result += `\u001b[1;30m${hit.description}\u001b[0m\n`;
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;

            result += `\u001b[1;36m[ IDENTITY ]\u001b[0m\n`;
            result += `  \u001b[1;33mName:\u001b[0m         ${hit.label}\n`;
            result += `  \u001b[1;33mGender:\u001b[0m       ${genderIds.length ? labelOf(genderIds[0]) : '—'}\n`;
            result += `  \u001b[1;33mOccupation:\u001b[0m   ${fmtList(occIds, 6)}\n`;
            result += `  \u001b[1;33mCitizenship:\u001b[0m  ${fmtList(citIds, 6)}\n`;
            result += `  \u001b[1;33mBorn:\u001b[0m         ${dob || '—'}${pobIds.length ? `, ${labelOf(pobIds[0])}` : ''}\n`;
            if (dod || podIds.length) {
                result += `  \u001b[1;33mDied:\u001b[0m         ${dod || '—'}${podIds.length ? `, ${labelOf(podIds[0])}` : ''}\n`;
            }

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ FAMILY ]\u001b[0m\n`;
            result += `  \u001b[1;33mFather:\u001b[0m       ${fmtFamily(fatherIds, 5)}\n`;
            result += `  \u001b[1;33mMother:\u001b[0m       ${fmtFamily(motherIds, 5)}\n`;
            result += `  \u001b[1;33mSpouse(s):\u001b[0m    ${fmtFamily(spouseIds, 8)}\n`;
            result += `  \u001b[1;33mChildren:\u001b[0m     ${fmtFamily(childIds, 15)}\n`;
            result += `  \u001b[1;33mSiblings:\u001b[0m     ${fmtFamily(siblingIds, 15)}\n`;

            if (bioShort) {
                result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
                result += `\u001b[1;36m[ BIO ]\u001b[0m\n`;
                // Wrap bio at ~72 chars per line for readability in Discord
                const words = bioShort.split(/\s+/);
                let line = '  ';
                for (const w of words) {
                    if ((line + w).length > 72) { result += line.trimEnd() + '\n'; line = '  '; }
                    line += w + ' ';
                }
                if (line.trim()) result += line.trimEnd() + '\n';
            }

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ SOURCES ]\u001b[0m\n`;
            result += `  \u001b[1;32mWikidata:\u001b[0m  ${wikidataUrl}\n`;
            result += `  \u001b[1;32mWikipedia:\u001b[0m ${wikiUrl}\n`;
            result += `\`\`\``;

            await message.edit(result).catch(() => {});
            return;
        }

        if (command === 'ip' && args[0]?.toLowerCase() === 'check') {
            const ip = args[1];
            if (!ip) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}ip check <address>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] GEOLOCATING: ${ip}\u001b[0m\n\u001b[1;30m> Querying ip-api.com + ipinfo.io...\u001b[0m\n\`\`\``);

            const [main, info] = await Promise.all([
                ipApiLookup(ip),
                ipInfoLookup(ip),
            ]);

            if (!main || main.status === 'fail') {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Invalid IP or lookup failed.\u001b[0m\n\`\`\``).catch(() => {});
            }

            const lat = Number(main.lat);
            const lon = Number(main.lon);
            const mapUrl = staticMapUrl(lat, lon, 11);
            const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
            const osmUrl = osmEmbedUrl(lat, lon);

            // Reverse-geocode to get the nearest street name at the (approximate) coords
            const geo = await nominatimReverse(lat, lon);
            const ga = geo?.address || {};
            const streetName = ga.road || ga.pedestrian || ga.footway || ga.path || '—';

            // ipinfo.io returns a "loc" string like "37.7749,-122.4194"; sometimes also a "postal"
            const infoLoc = info?.loc || `${lat},${lon}`;
            const infoPostal = info?.postal || main.zip || ga.postcode || '—';
            const infoCity = info?.city || main.city || '—';
            const infoRegion = info?.region || main.regionName || '—';
            const infoCountry = info?.country || main.countryCode || '—';

            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (label: string, value: string) =>
                `  \u001b[1;33m${pad(label + ':', 12)}\u001b[0m ${value}\n`;

            let result = `\`\`\`ansi\n`;
            result += `\u001b[1;36m╔══════════════════════════════════════════════╗\u001b[0m\n`;
            result += `\u001b[1;36m║          NETRUNNER · IP INTEL REPORT         ║\u001b[0m\n`;
            result += `\u001b[1;36m╚══════════════════════════════════════════════╝\u001b[0m\n`;
            result += `\u001b[1;37mTarget:\u001b[0m ${main.query}\n`;
            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;

            result += `\u001b[1;36m[ GEOLOCATION ]\u001b[0m\n`;
            result += row('Country',  `${main.country || infoCountry} (${main.countryCode || infoCountry})`);
            result += row('Region',   `${main.regionName || infoRegion}${main.region ? ` (${main.region})` : ''}`);
            result += row('City',     `${main.city || infoCity}`);
            result += row('Street',   `${streetName}`);
            result += row('Address',  `${geo?.display_name || '—'}`);
            result += row('Postcode', `${infoPostal}`);
            result += row('Coords',   `${lat}, ${lon}`);
            result += row('ipinfo',   `${infoLoc}`);
            result += row('Timezone', `${main.timezone || info?.timezone || '—'}`);
            result += `  \u001b[1;30m(approximate — IP geolocation is city/ISP-level, not a street address)\u001b[0m\n`;

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ NETWORK ]\u001b[0m\n`;
            result += row('ISP',      `${main.isp || '—'}`);
            result += row('Org',      `${main.org || info?.org || '—'}`);
            result += row('AS',       `${main.as || '—'}`);
            result += row('AS Name',  `${main.asname || '—'}`);
            result += row('Hostname', `${main.reverse || info?.hostname || '—'}`);

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ FLAGS ]\u001b[0m\n`;
            result += row('Mobile',     main.mobile  ? '\u001b[1;31mYES\u001b[0m' : 'No');
            result += row('Proxy/VPN',  main.proxy   ? '\u001b[1;31mYES\u001b[0m' : 'No');
            result += row('Hosting/DC', main.hosting ? '\u001b[1;31mYES (Datacenter/VPS)\u001b[0m' : 'No');
            if (info?.bogon) result += row('Bogon', '\u001b[1;31mYES (reserved/private range)\u001b[0m');
            if (info?.anycast) result += row('Anycast', '\u001b[1;33mYES\u001b[0m');

            result += `\u001b[1;30m${'─'.repeat(48)}\u001b[0m\n`;
            result += `\u001b[1;36m[ MAP ]\u001b[0m\n`;
            result += `  \u001b[1;32mGoogle:\u001b[0m ${googleMapsUrl}\n`;
            result += `  \u001b[1;32mOSM:\u001b[0m    ${osmUrl}\n`;

            result += `\`\`\``;

            await message.edit(result).catch(() => {});

            // Send a zoomed-out static map image with a pin, then the Google Maps link
            await message.channel.send(staticMapUrl(lat, lon, 11)).catch(() => {});
            await message.channel.send(`📍 ${googleMapsUrl}`).catch(() => {});
            return;
        }

        // ── LINK CHECK ───────────────────────────────────────────────────────
        if (command === 'link' && args[0]?.toLowerCase() === 'check') {
            const raw = args.slice(1).join(' ').trim();
            if (!raw) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}link check <url>\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            // Normalize — prepend https if bare domain given
            let urlToCheck = raw;
            if (!urlToCheck.startsWith('http://') && !urlToCheck.startsWith('https://')) {
                urlToCheck = 'https://' + urlToCheck;
            }
            let parsedHost = '';
            try { parsedHost = new URL(urlToCheck).hostname; } catch { /* ignore */ }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] SCANNING: ${urlToCheck}\u001b[0m\n\u001b[1;30m> Querying URLhaus + heuristics...\u001b[0m\n\`\`\``).catch(() => {});

            const CYAN = '\u001b[1;36m'; const GRN = '\u001b[1;32m'; const RED = '\u001b[1;31m';
            const YEL  = '\u001b[1;33m'; const WHT = '\u001b[1;37m'; const RST = '\u001b[0m';
            const DIM  = '\u001b[2m';
            const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
            const row = (label: string, value: string) => `  ${YEL}${pad(label + ':', 14)}${RST} ${value}\n`;

            // ── URLhaus check ──────────────────────────────────────────────
            let urlhausStatus = 'unknown';
            let urlhausThreat = '';
            let urlhausTags: string[] = [];
            let urlhausRef = '';
            try {
                const uhRes = await fetch('https://urlhaus-api.abuse.ch/v1/url/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: `url=${encodeURIComponent(urlToCheck)}`,
                }).then((r: any) => r.json()) as any;

                urlhausStatus = uhRes.query_status || 'is_unknown';
                urlhausThreat = uhRes.threat || '';
                urlhausTags   = Array.isArray(uhRes.tags) ? uhRes.tags : [];
                urlhausRef    = uhRes.urlhaus_reference || '';
            } catch { /* network error */ }

            // ── Heuristic checks ──────────────────────────────────────────
            const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click', '.pw', '.ru', '.su'];
            const phishingKeywords = ['login', 'verify', 'account', 'secure', 'update', 'confirm', 'paypal', 'bank', 'apple', 'microsoft', 'discord', 'steam', 'amazon'];
            const lowerUrl = urlToCheck.toLowerCase();
            const hasSuspTLD = suspiciousTLDs.some(t => parsedHost.endsWith(t));
            const hasPhishKw = phishingKeywords.some(k => lowerUrl.includes(k));
            const hasIPHost  = /^\d{1,3}(\.\d{1,3}){3}$/.test(parsedHost);
            const hasExcessiveSubs = (parsedHost.match(/\./g) || []).length > 3;
            const isHTTP = urlToCheck.startsWith('http://');
            const hasBase64 = /[A-Za-z0-9+/]{40,}={0,2}/.test(urlToCheck);
            const heuristicScore = [hasSuspTLD, hasPhishKw, hasIPHost, hasExcessiveSubs, isHTTP, hasBase64].filter(Boolean).length;

            // ── Verdict ───────────────────────────────────────────────────
            const isBlacklisted = urlhausStatus === 'blacklisted' || urlhausStatus === 'online';
            const isHigh = isBlacklisted || heuristicScore >= 3;
            const isMed  = !isHigh && (heuristicScore >= 2 || urlhausStatus === 'offline');
            const verdict = isHigh ? `${RED}⛔ MALICIOUS${RST}` : isMed ? `${YEL}⚠ SUSPICIOUS${RST}` : `${GRN}✓ CLEAN${RST}`;
            const verdictBanner = isHigh ? `${RED}║  !! THREAT DETECTED — DO NOT VISIT !!      ║${RST}`
                                : isMed  ? `${YEL}║  ⚠ SUSPICIOUS — PROCEED WITH CAUTION       ║${RST}`
                                         : `${GRN}║  ✓ NO KNOWN THREATS DETECTED                ║${RST}`;

            let out = `\`\`\`ansi\n`;
            out += `${CYAN}╔══════════════════════════════════════════════╗${RST}\n`;
            out += `${CYAN}║       NETRUNNER · LINK SAFETY REPORT         ║${RST}\n`;
            out += verdictBanner + '\n';
            out += `${CYAN}╚══════════════════════════════════════════════╝${RST}\n`;
            out += `${DIM}${'─'.repeat(48)}${RST}\n`;
            out += row('URL',    urlToCheck.length > 50 ? urlToCheck.slice(0, 47) + '...' : urlToCheck);
            out += row('Host',   parsedHost || '—');
            out += row('Verdict', verdict);
            out += `${DIM}${'─'.repeat(48)}${RST}\n`;
            out += `${CYAN}[ URLhaus Database ]${RST}\n`;
            out += row('Status',  urlhausStatus === 'is_unknown' ? `${DIM}Not in database${RST}`
                                : urlhausStatus === 'blacklisted' || urlhausStatus === 'online'
                                    ? `${RED}BLACKLISTED${RST}`
                                    : urlhausStatus === 'offline' ? `${YEL}Previously blacklisted (offline)${RST}` : urlhausStatus);
            if (urlhausThreat) out += row('Threat',  `${RED}${urlhausThreat}${RST}`);
            if (urlhausTags.length) out += row('Tags',    urlhausTags.join(', '));
            if (urlhausRef) out += row('Report',  urlhausRef);
            out += `${DIM}${'─'.repeat(48)}${RST}\n`;
            out += `${CYAN}[ Heuristic Analysis ]${RST}\n`;
            out += row('Risk Score', `${heuristicScore}/6 ${heuristicScore >= 3 ? RED : heuristicScore >= 2 ? YEL : GRN}${'█'.repeat(heuristicScore)}${'░'.repeat(6 - heuristicScore)}${RST}`);
            if (isHTTP)           out += `  ${YEL}• No HTTPS (insecure transport)${RST}\n`;
            if (hasIPHost)        out += `  ${YEL}• Hosted on bare IP address${RST}\n`;
            if (hasSuspTLD)       out += `  ${YEL}• Suspicious free/abused TLD${RST}\n`;
            if (hasPhishKw)       out += `  ${YEL}• Contains phishing keyword(s)${RST}\n`;
            if (hasExcessiveSubs) out += `  ${YEL}• Excessive subdomains${RST}\n`;
            if (hasBase64)        out += `  ${YEL}• Possible encoded payload in URL${RST}\n`;
            if (heuristicScore === 0 && urlhausStatus === 'is_unknown') out += `  ${GRN}• No suspicious patterns detected${RST}\n`;
            out += `\`\`\``;

            await message.edit(out).catch(() => {});
            return;
        }

        // ── OSINT FULL DUMPS ──────────────────────────────────────────────────
        if (command === 'osint') {
            const sub1 = args[0]?.toLowerCase(); // user / server / token / ip
            const sub2 = args[1]?.toLowerCase(); // full
            const sub3 = args[2]?.toLowerCase(); // dump / report
            const target = args[3];

            // .osint user full dump <@user>
            if (sub1 === 'user' && sub2 === 'full') {
                const mention = target || args[3];
                const userId = (mention || '').replace(/[<@!>]/g, '');
                if (!userId) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint user full dump <@user>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] DUMPING USER: ${userId}\u001b[0m\n\`\`\``);

                try {
                    const user = await client.users.fetch(userId, { force: true });
                    const member = message.guild ? await message.guild.members.fetch(userId).catch(() => null) : null;

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] USER FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                    result += `\u001b[1;33mTag:\u001b[0m          ${user.tag}\n`;
                    result += `\u001b[1;33mUsername:\u001b[0m     ${user.username}\n`;
                    result += `\u001b[1;33mID:\u001b[0m           ${user.id}\n`;
                    result += `\u001b[1;33mBot:\u001b[0m          ${user.bot ? 'Yes' : 'No'}\n`;
                    result += `\u001b[1;33mCreated:\u001b[0m      ${user.createdAt.toUTCString()}\n`;
                    const tsSeconds = Math.floor(user.createdTimestamp / 1000);
                    result += `\u001b[1;33mUnix TS:\u001b[0m      ${tsSeconds}\n`;

                    // Snowflake decode
                    const snowflakeTs = Math.floor(user.createdTimestamp);
                    const workerBits = (BigInt(userId) >> BigInt(17)) & BigInt(0x1f);
                    const processBits = (BigInt(userId) >> BigInt(12)) & BigInt(0x1f);
                    result += `\u001b[1;33mWorker ID:\u001b[0m    ${workerBits}\n`;
                    result += `\u001b[1;33mProcess ID:\u001b[0m   ${processBits}\n`;

                    if (user.flags) {
                        const flags = user.flags.toArray();
                        result += `\u001b[1;33mBadges:\u001b[0m       ${flags.join(', ') || 'None'}\n`;
                    }

                    const avatarUrl = user.displayAvatarURL({ dynamic: true, size: 4096 });
                    result += `\u001b[1;33mAvatar:\u001b[0m       ${avatarUrl}\n`;

                    const bannerUrl = user.bannerURL({ dynamic: true, size: 4096 });
                    if (bannerUrl) result += `\u001b[1;33mBanner:\u001b[0m       ${bannerUrl}\n`;
                    if ((user as any).accentColor) result += `\u001b[1;33mAccent Color:\u001b[0m #${((user as any).accentColor).toString(16).padStart(6, '0')}\n`;

                    if (member) {
                        result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                        result += `\u001b[1;36m[SERVER MEMBER DATA]\u001b[0m\n`;
                        result += `\u001b[1;33mNickname:\u001b[0m     ${member.nickname || 'None'}\n`;
                        result += `\u001b[1;33mJoined:\u001b[0m       ${member.joinedAt?.toUTCString() || 'Unknown'}\n`;
                        const roles = member.roles.cache.filter((r: any) => r.name !== '@everyone').map((r: any) => r.name);
                        result += `\u001b[1;33mRoles:\u001b[0m        ${roles.slice(0, 10).join(', ') || 'None'}\n`;
                        result += `\u001b[1;33mBoosting:\u001b[0m     ${member.premiumSince ? `Since ${member.premiumSince.toUTCString()}` : 'No'}\n`;
                        result += `\u001b[1;33mPending:\u001b[0m      ${member.pending ? 'Yes' : 'No'}\n`;
                        if (member.communicationDisabledUntil) result += `\u001b[1;31mMuted Until:\u001b[0m  ${member.communicationDisabledUntil.toUTCString()}\n`;
                    }

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                    // Send avatar as image
                    await message.channel.send(avatarUrl).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch user data.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint server full dump
            if (sub1 === 'server' && sub2 === 'full') {
                const guild = message.guild;
                if (!guild) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] This command only works in servers.\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] DUMPING SERVER: ${guild.name}\u001b[0m\n\`\`\``);

                try {
                    const owner = await guild.fetchOwner().catch(() => null);
                    const bans = await guild.bans.fetch().catch(() => null);
                    const invites = await guild.invites.fetch().catch(() => null);
                    const webhooks = await guild.fetchWebhooks().catch(() => null);

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] SERVER FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                    result += `\u001b[1;33mName:\u001b[0m          ${guild.name}\n`;
                    result += `\u001b[1;33mID:\u001b[0m            ${guild.id}\n`;
                    result += `\u001b[1;33mOwner:\u001b[0m         ${owner?.user.tag || guild.ownerId}\n`;
                    result += `\u001b[1;33mOwner ID:\u001b[0m      ${guild.ownerId}\n`;
                    result += `\u001b[1;33mCreated:\u001b[0m       ${guild.createdAt.toUTCString()}\n`;
                    result += `\u001b[1;33mMembers:\u001b[0m       ${guild.memberCount}\n`;
                    result += `\u001b[1;33mChannels:\u001b[0m      ${guild.channels?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mRoles:\u001b[0m         ${guild.roles?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mEmojis:\u001b[0m        ${guild.emojis?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mBoosts:\u001b[0m        ${guild.premiumSubscriptionCount ?? 0} (Tier ${guild.premiumTier || 0})\n`;
                    result += `\u001b[1;33mVerification:\u001b[0m  ${guild.verificationLevel}\n`;
                    result += `\u001b[1;33mNSFW Level:\u001b[0m    ${guild.nsfwLevel}\n`;
                    result += `\u001b[1;33mVanity URL:\u001b[0m    ${guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : 'None'}\n`;
                    result += `\u001b[1;33mDescription:\u001b[0m   ${guild.description || 'None'}\n`;
                    if (bans) result += `\u001b[1;33mBans:\u001b[0m          ${bans.size}\n`;
                    if (invites) result += `\u001b[1;33mActive Invites:\u001b[0m ${invites.size}\n`;
                    if (webhooks) result += `\u001b[1;33mWebhooks:\u001b[0m      ${webhooks.size}\n`;

                    const features = guild.features;
                    if (features.length > 0) {
                        result += `\u001b[1;33mFeatures:\u001b[0m      ${features.join(', ')}\n`;
                    }

                    const iconUrl = guild.iconURL({ dynamic: true, size: 4096 });
                    if (iconUrl) result += `\u001b[1;33mIcon:\u001b[0m          ${iconUrl}\n`;
                    const bannerUrl = guild.bannerURL({ dynamic: true, size: 4096 });
                    if (bannerUrl) result += `\u001b[1;33mBanner:\u001b[0m        ${bannerUrl}\n`;

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                    if (iconUrl) await message.channel.send(iconUrl).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to dump server data.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint token full dump <token>
            if (sub1 === 'token' && sub2 === 'full') {
                const token = target || args[3];
                if (!token) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint token full dump <token>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] ANALYZING TOKEN...\u001b[0m\n\`\`\``);

                try {
                    // Decode JWT-like token parts (Discord tokens are base64url encoded)
                    const parts = token.split('.');
                    let userId = '';
                    let decodedTs = '';
                    if (parts.length >= 2) {
                        try {
                            userId = Buffer.from(parts[0], 'base64').toString('utf8');
                            if (parts[1]) {
                                const tsBytes = Buffer.from(parts[1], 'base64');
                                if (tsBytes.length >= 4) {
                                    const tsNum = tsBytes.readUInt32BE(0);
                                    decodedTs = new Date((tsNum + 1293840000) * 1000).toUTCString();
                                }
                            }
                        } catch {}
                    }

                    // Validate against Discord API
                    const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
                        headers: { Authorization: token }
                    });
                    const discordData: any = await discordRes.json();

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] TOKEN FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

                    if (discordData.id) {
                        result += `\u001b[1;32m[+] TOKEN VALID\u001b[0m\n`;
                        result += `\u001b[1;33mUsername:\u001b[0m      ${discordData.username}${discordData.discriminator !== '0' ? '#' + discordData.discriminator : ''}\n`;
                        result += `\u001b[1;33mID:\u001b[0m            ${discordData.id}\n`;
                        result += `\u001b[1;33mEmail:\u001b[0m         ${discordData.email || 'Not accessible'}\n`;
                        result += `\u001b[1;33mPhone:\u001b[0m         ${discordData.phone || 'None'}\n`;
                        result += `\u001b[1;33mMFA Enabled:\u001b[0m   ${discordData.mfa_enabled ? 'Yes' : 'No'}\n`;
                        result += `\u001b[1;33mVerified:\u001b[0m      ${discordData.verified ? 'Yes' : 'No'}\n`;
                        result += `\u001b[1;33mNitro:\u001b[0m         ${discordData.premium_type === 2 ? 'Nitro Boost' : discordData.premium_type === 1 ? 'Classic' : 'None'}\n`;
                        result += `\u001b[1;33mLocale:\u001b[0m        ${discordData.locale || 'Unknown'}\n`;
                        if (discordData.avatar) {
                            result += `\u001b[1;33mAvatar:\u001b[0m        https://cdn.discordapp.com/avatars/${discordData.id}/${discordData.avatar}.png\n`;
                        }
                        // Fetch billing info
                        const billingRes = await fetch('https://discord.com/api/v10/users/@me/billing/payment-sources', {
                            headers: { Authorization: token }
                        });
                        const billingData: any = await billingRes.json().catch(() => null);
                        if (Array.isArray(billingData) && billingData.length > 0) {
                            result += `\u001b[1;31mPayment Methods: ${billingData.length}\u001b[0m\n`;
                            billingData.slice(0, 3).forEach((pm: any) => {
                                result += `  \u001b[1;33m• ${pm.type === 1 ? 'Card' : pm.type === 2 ? 'PayPal' : 'Other'}\u001b[0m`;
                                if (pm.billing_address?.country) result += ` (${pm.billing_address.country})`;
                                if (pm.last_4) result += ` ****${pm.last_4}`;
                                result += `\n`;
                            });
                        }
                        // Guild count
                        const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
                            headers: { Authorization: token }
                        });
                        const guildsData: any = await guildsRes.json().catch(() => null);
                        if (Array.isArray(guildsData)) {
                            result += `\u001b[1;33mGuilds:\u001b[0m        ${guildsData.length}\n`;
                        }
                    } else {
                        result += `\u001b[1;31m[!] TOKEN INVALID OR EXPIRED\u001b[0m\n`;
                        result += `\u001b[1;33mMessage:\u001b[0m ${discordData.message || 'Unknown error'}\n`;
                    }

                    if (userId) result += `\u001b[1;30mDecoded ID part: ${userId}\u001b[0m\n`;
                    if (decodedTs) result += `\u001b[1;30mToken issued ~: ${decodedTs}\u001b[0m\n`;

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Token analysis failed.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint ip full report <ip>
            if (sub1 === 'ip' && sub2 === 'full') {
                const ip = target || args[3];
                if (!ip) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint ip full report <ip>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] RUNNING FULL IP REPORT ON: ${ip}\u001b[0m\n\u001b[1;30m> Querying multiple sources...\u001b[0m\n\`\`\``);

                const [main, info] = await Promise.all([
                    ipApiLookup(ip),
                    ipInfoLookup(ip),
                ]);

                if (!main || main.status === 'fail') {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Invalid IP or all lookups failed.\u001b[0m\n\`\`\``).catch(() => {});
                }

                const lat = Number(main.lat);
                const lon = Number(main.lon);
                const mapUrl = staticMapUrl(lat, lon, 11);
                const googleMapsUrl = `https://maps.google.com/?q=${lat},${lon}`;

                // Reverse-geocode coords to a street-level address via OpenStreetMap (public, ToS-compliant)
                const geo = await nominatimReverse(lat, lon);
                const ga = geo?.address || {};
                const streetName = ga.road || ga.pedestrian || ga.footway || ga.path || '—';
                const houseNum   = ga.house_number || '';
                const streetLine = houseNum ? `${houseNum} ${streetName}` : streetName;
                const neighborhood = ga.neighbourhood || ga.suburb || ga.quarter || '—';

                let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] FULL IP REPORT: ${main.query}\u001b[0m\n`;
                result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                result += `\u001b[1;36m[GEO]\u001b[0m\n`;
                result += `  \u001b[1;33mIP:\u001b[0m          ${main.query}\n`;
                result += `  \u001b[1;33mCountry:\u001b[0m     ${main.country} (${main.countryCode})\n`;
                result += `  \u001b[1;33mRegion:\u001b[0m      ${main.regionName} (${main.region})\n`;
                result += `  \u001b[1;33mCity:\u001b[0m        ${main.city}\n`;
                result += `  \u001b[1;33mNeighborhood:\u001b[0m ${neighborhood}\n`;
                result += `  \u001b[1;33mStreet:\u001b[0m      ${streetLine}\n`;
                result += `  \u001b[1;33mAddress:\u001b[0m     ${geo?.display_name || '—'}\n`;
                result += `  \u001b[1;33mPostcode:\u001b[0m    ${main.zip || ga.postcode || '—'}\n`;
                result += `  \u001b[1;33mCoords:\u001b[0m      ${lat}, ${lon}\n`;
                result += `  \u001b[1;33mTimezone:\u001b[0m    ${main.timezone}\n`;
                result += `  \u001b[1;30m(approximate — IP geolocation is city/ISP-level, not exact)\u001b[0m\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[NETWORK]\u001b[0m\n`;
                result += `  \u001b[1;33mISP:\u001b[0m         ${main.isp}\n`;
                result += `  \u001b[1;33mOrg:\u001b[0m         ${main.org || '—'}\n`;
                result += `  \u001b[1;33mAS:\u001b[0m          ${main.as || '—'}\n`;
                result += `  \u001b[1;33mASName:\u001b[0m      ${main.asname || '—'}\n`;
                result += `  \u001b[1;33mHostname:\u001b[0m    ${main.reverse || info?.hostname || '—'}\n`;
                if (info?.org) result += `  \u001b[1;33mProvider:\u001b[0m    ${info.org}\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[FLAGS]\u001b[0m\n`;
                result += `  \u001b[1;33mMobile:\u001b[0m      ${main.mobile ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `  \u001b[1;33mProxy/VPN:\u001b[0m   ${main.proxy ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `  \u001b[1;33mHosting/DC:\u001b[0m  ${main.hosting ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[MAP]\u001b[0m\n`;
                result += `  ${googleMapsUrl}\n`;
                result += `\`\`\``;

                await message.edit(result).catch(() => {});
                // Send the Google Maps link so Discord embeds a preview
                await message.channel.send(`📍 ${googleMapsUrl}`).catch(() => {});
                return;
            }

            // osint discord <id> — multi-source Discord deep lookup
            if (args[0]?.toLowerCase() === 'discord' && args[1]) {
                // Accept both ".osint discord <id>" and legacy ".osint discord id <id>"
                const targetId = (args[1].toLowerCase() === 'id' ? args[2] : args[1])?.trim();
                if (!targetId || !/^\d{15,25}$/.test(targetId)) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint discord <discord_id>\u001b[0m\n\`\`\``).catch(() => {});
                }

                const C = (n: number) => `\u001b[1;${n}m`;
                const CY = C(36), YE = C(33), GR = C(32), RE = C(31), GY = C(30), WH = C(37), MA = C(35), RST = '\u001b[0m';
                const SUB = '─'.repeat(50);
                const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - s.length));
                const row = (k: string, v: string) => `  ${YE}${pad(k + ':', 14)}${RST} ${v}\n`;
                const head = (t: string) => `${CY}${SUB}${RST}\n${CY}[ ${t} ]${RST}\n`;

                await message.edit(`\`\`\`ansi\n${C(34)}[*] DISCORD OSINT: ${targetId}${RST}\n${GY}> Gathering everything — profile · guilds · messages · breaches · OSINT sources...${RST}\n\`\`\``).catch(() => {});

                // Snowflake decode
                const DISCORD_EPOCH = 1420070400000n;
                let createdAt = 'Unknown';
                let ageDays   = 0;
                try {
                    const bigId = BigInt(targetId);
                    const ts = Number((bigId >> 22n) + DISCORD_EPOCH);
                    createdAt = new Date(ts).toUTCString();
                    ageDays = Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
                } catch (_) {}

                // ── Phase 1: parallel fetches ────────────────────────────────
                // Fetch Discord user (force = bypass cache, includes banner/accent_color)
                let user: any = null;
                try { user = await client.users.fetch(targetId, { force: true }); } catch (_) {}

                // Discord profile endpoint — bio, pronouns, connected accounts, mutual guilds
                let profile: any = null;
                try {
                    const pr = await fetch(`https://discord.com/api/v9/users/${targetId}/profile?with_mutual_guilds=true&with_mutual_friends_count=true`, {
                        headers: { 'Authorization': client.token!, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                        signal: AbortSignal.timeout(8000),
                    });
                    if (pr.ok) profile = await pr.json().catch(() => null);
                } catch (_) {}

                // snowid.lol fast lookup (best-effort)
                let snowid: any = null;
                try {
                    const resp = await fetch('https://snowid.lol/api/lookup', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ discordId: targetId, fast: true }),
                        signal: AbortSignal.timeout(8000),
                    });
                    const raw = await resp.text();
                    try { snowid = JSON.parse(raw); } catch (_) {}
                } catch (_) {}

                // Determine search terms for breach DBs
                const searchTerms: { term: string; type: string }[] = [];
                searchTerms.push({ term: targetId, type: 'username' });
                if (user?.username) {
                    searchTerms.push({ term: user.username, type: 'username' });
                    if (user.discriminator && user.discriminator !== '0') {
                        searchTerms.push({ term: `${user.username}#${user.discriminator}`, type: 'username' });
                    }
                }

                // Fan out to breach DBs + parallax + extra osint all in parallel
                const breachQueries: Promise<{ src: string; data: any; term: string }>[] = [];
                for (const t of searchTerms) {
                    breachQueries.push(snusbaseSearch(t.term, t.type).then(d => ({ src: 'Snusbase',      data: d, term: t.term })));
                    breachQueries.push(snusbaseBetaSearch(t.term, t.type).then(d => ({ src: 'Snusbase Beta', data: d, term: t.term })));
                    breachQueries.push(leakcheckQuery(t.term, t.type).then(d => ({ src: 'LeakCheck',     data: d, term: t.term })));
                }

                // ── Phase 2: mutual server deep scan ────────────────────────
                interface MutualServerInfo {
                    guildName: string;
                    guildId: string;
                    nickname: string | null;
                    joinedAt: string | null;
                    roles: string[];
                    presence: string | null;
                    activity: string | null;
                }
                const mutualServers: MutualServerInfo[] = [];
                for (const [, guild] of client.guilds.cache) {
                    try {
                        const member: any = await (guild.members as any).fetch({ user: targetId, force: true }).catch(() => null);
                        if (!member) continue;
                        const presence = guild.presences?.cache?.get(targetId) as any;
                        const activityRaw = presence?.activities?.[0];
                        let activityStr: string | null = null;
                        if (activityRaw) {
                            if (activityRaw.type === 2 && activityRaw.name === 'Spotify') {
                                activityStr = `Listening to Spotify: ${activityRaw.state || ''} - ${activityRaw.details || ''}`;
                            } else if (activityRaw.type === 0) {
                                activityStr = `Playing: ${activityRaw.name}${activityRaw.details ? ` (${activityRaw.details})` : ''}`;
                            } else if (activityRaw.type === 1) {
                                activityStr = `Streaming: ${activityRaw.name}`;
                            } else if (activityRaw.type === 3) {
                                activityStr = `Watching: ${activityRaw.name}`;
                            } else if (activityRaw.type === 4) {
                                activityStr = `Status: ${activityRaw.state || activityRaw.name || ''}`;
                            } else {
                                activityStr = `${activityRaw.name || ''}`;
                            }
                        }
                        const topRoles = member.roles?.cache
                            ? Array.from(member.roles.cache.values() as any)
                                .filter((r: any) => r.name !== '@everyone')
                                .sort((a: any, b: any) => b.position - a.position)
                                .slice(0, 6)
                                .map((r: any) => r.name)
                            : [];
                        mutualServers.push({
                            guildName: guild.name,
                            guildId:   guild.id,
                            nickname:  member.nickname || null,
                            joinedAt:  member.joinedAt ? member.joinedAt.toUTCString() : null,
                            roles:     topRoles,
                            presence:  presence?.status || null,
                            activity:  activityStr,
                        });
                    } catch (_) {}
                }

                // ── Phase 3: recent message scan in mutual guilds ────────────
                interface RecentMsg { guildName: string; channel: string; content: string; ts: string; attachments: string[] }
                const recentMsgs: RecentMsg[] = [];
                for (const { guildName, guildId } of mutualServers.slice(0, 4)) {
                    const guild = client.guilds.cache.get(guildId);
                    if (!guild) continue;
                    let msgsFound = 0;
                    for (const [, ch] of guild.channels.cache) {
                        if ((ch as any).type !== 0) continue; // text channels only
                        try {
                            const fetched: any = await (ch as any).messages.fetch({ limit: 100 });
                            for (const [, msg] of fetched) {
                                const m: any = msg;
                                if (m.author?.id !== targetId) continue;
                                const attachs = m.attachments?.map((a: any) => a.url).slice(0, 2) || [];
                                recentMsgs.push({
                                    guildName,
                                    channel: (ch as any).name,
                                    content: (m.content || '[no text]').slice(0, 200),
                                    ts:      m.createdAt ? m.createdAt.toUTCString() : '',
                                    attachments: attachs,
                                });
                                msgsFound++;
                                if (recentMsgs.length >= 15) break;
                            }
                        } catch (_) {}
                        if (recentMsgs.length >= 15) break;
                    }
                }
                // Sort newest first
                recentMsgs.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());

                const breachResults = await Promise.all(breachQueries);

                // Aggregate
                const breachSources = new Set<string>();
                const emails    = new Set<string>();
                const passwords = new Set<string>();
                const ips       = new Set<string>();
                const altUsers  = new Set<string>();
                const names     = new Set<string>();
                let recordCount = 0;

                for (const { src, data } of breachResults) {
                    if (src === 'LeakCheck') {
                        if (data?.success && Array.isArray(data.result)) {
                            for (const e of data.result) {
                                recordCount++;
                                const sn = typeof e.source === 'object' ? e.source?.name : e.source;
                                if (sn) breachSources.add(sn);
                                if (e.email)    emails.add(e.email);
                                if (e.password) passwords.add(e.password);
                                if (e.username) altUsers.add(e.username);
                                if (e.first_name && e.last_name) names.add(`${e.first_name} ${e.last_name}`);
                                else if (e.name) names.add(e.name);
                            }
                        }
                    } else {
                        if (data?.results) {
                            for (const [db, rows] of Object.entries<any>(data.results)) {
                                breachSources.add(db);
                                for (const e of (rows || [])) {
                                    recordCount++;
                                    if (e.email)    emails.add(e.email);
                                    if (e.password) passwords.add(e.password);
                                    if (e.lastip || e.ip) ips.add(e.lastip || e.ip);
                                    if (e.username) altUsers.add(e.username);
                                    if (e.name)     names.add(e.name);
                                }
                            }
                        }
                    }
                }

                // Build avatar / banner URLs for later image sends
                const avatarUrl = user?.avatar
                    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=1024`
                    : null;
                const bannerUrl = user?.banner
                    ? `https://cdn.discordapp.com/banners/${user.id}/${user.banner}.${user.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`
                    : (profile?.user?.banner
                        ? `https://cdn.discordapp.com/banners/${targetId}/${profile.user.banner}.${profile.user.banner.startsWith('a_') ? 'gif' : 'png'}?size=1024`
                        : null);

                let r = `\`\`\`ansi\n`;
                r += `${CY}╔══════════════════════════════════════════════════╗${RST}\n`;
                r += `${CY}║              DISCORD ID · OSINT                  ║${RST}\n`;
                r += `${CY}╚══════════════════════════════════════════════════╝${RST}\n`;
                r += `${WH}Target ID:${RST} ${targetId}\n`;

                // ── DISCORD PROFILE ──────────────────────────────────────────
                r += head('DISCORD PROFILE');
                if (user) {
                    const flags  = user.flags?.toArray().join(', ') || 'None';
                    const profileUser = profile?.user || {};
                    const globalName  = user.globalName || profileUser.global_name || user.displayName || user.username;
                    r += row('Tag',         user.tag || `${user.username}#${user.discriminator}`);
                    r += row('Username',    user.username);
                    r += row('Display',     globalName);
                    if (user.discriminator && user.discriminator !== '0') r += row('Discrim', user.discriminator);
                    r += row('User ID',     user.id);
                    r += row('Bot',         user.bot ? `${YE}Yes${RST}` : 'No');
                    r += row('System',      user.system ? `${YE}Yes${RST}` : 'No');
                    r += row('Badges',      flags);
                    if (user.accentColor)   r += row('Accent Color', `#${user.accentColor.toString(16).padStart(6, '0')}`);
                    if (avatarUrl)          r += row('Avatar',       avatarUrl);
                    if (bannerUrl)          r += row('Banner',       bannerUrl);

                    // Bio / pronouns from profile endpoint
                    const bio = profile?.user_profile?.bio || profile?.user?.bio || profile?.bio || '';
                    if (bio) {
                        r += `\n  ${YE}Bio:${RST}\n`;
                        String(bio).split('\n').forEach((line: string) => r += `    ${GY}${line}${RST}\n`);
                    }
                    const pronouns = profile?.user_profile?.pronouns || profile?.user?.pronouns || '';
                    if (pronouns) r += row('Pronouns', pronouns);

                    // Nitro / premium
                    const premiumType = profile?.premium_type || profileUser.premium_type;
                    if (premiumType != null) {
                        const nitroMap: Record<number, string> = { 0: 'None', 1: 'Nitro Classic', 2: 'Nitro', 3: 'Nitro Basic' };
                        r += row('Nitro', nitroMap[premiumType] || `Type ${premiumType}`);
                    }
                    const premiumSince = profile?.premium_since || profileUser.premium_since;
                    if (premiumSince) r += row('Nitro Since', new Date(premiumSince).toUTCString());

                    // Legacy username (pomelo migration)
                    const legacyUsername = profileUser.legacy_username;
                    if (legacyUsername) r += row('Legacy Name', legacyUsername);
                } else {
                    r += `  ${RE}— user could not be fetched (private / blocked / invalid) —${RST}\n`;
                }

                // ── CONNECTED ACCOUNTS ───────────────────────────────────────
                const connectedAccounts: any[] = profile?.connected_accounts || profile?.user?.connected_accounts || [];
                if (connectedAccounts.length > 0) {
                    r += head('CONNECTED ACCOUNTS');
                    for (const acc of connectedAccounts) {
                        const verified = acc.verified ? `${GR}✓${RST}` : `${GY}unverified${RST}`;
                        r += `  ${MA}•${RST} ${YE}${acc.type?.toUpperCase() || 'UNKNOWN'}${RST} — ${acc.name || acc.id}  ${verified}\n`;
                        if (acc.id && acc.type) {
                            const links: Record<string, string> = {
                                twitter: `https://twitter.com/i/user/${acc.id}`,
                                github: `https://github.com/${acc.name}`,
                                twitch: `https://twitch.tv/${acc.name}`,
                                youtube: `https://youtube.com/channel/${acc.id}`,
                                reddit: `https://reddit.com/u/${acc.name}`,
                                spotify: `https://open.spotify.com/user/${acc.id}`,
                                steam: `https://steamcommunity.com/profiles/${acc.id}`,
                                xbox: `https://account.xbox.com/en-US/Profile?Gamertag=${acc.name}`,
                            };
                            const link = links[acc.type?.toLowerCase()];
                            if (link) r += `    ${GY}↳ ${link}${RST}\n`;
                        }
                    }
                }

                // ── SNOWFLAKE METADATA ───────────────────────────────────────
                r += head('SNOWFLAKE METADATA');
                r += row('Created',   createdAt);
                r += row('Age',       `${ageDays} days (${(ageDays / 365).toFixed(2)} yrs)`);
                try {
                    const bigId = BigInt(targetId);
                    r += row('Worker',    String((bigId >> 17n) & 0x1Fn));
                    r += row('Process',   String((bigId >> 12n) & 0x1Fn));
                    r += row('Increment', String(bigId & 0xFFFn));
                } catch (_) {}

                // ── MUTUAL SERVERS ───────────────────────────────────────────
                const profileMutualGuilds: any[] = profile?.mutual_guilds || [];
                r += head(`MUTUAL SERVERS (${mutualServers.length} found via cache · ${profileMutualGuilds.length} via API)`);
                if (mutualServers.length === 0 && profileMutualGuilds.length === 0) {
                    r += `  ${GY}— no mutual servers found —${RST}\n`;
                } else {
                    for (const s of mutualServers) {
                        r += `\n  ${CY}▸ ${s.guildName}${RST} ${GY}[${s.guildId}]${RST}\n`;
                        if (s.nickname)  r += `    ${YE}Nickname:${RST}  ${s.nickname}\n`;
                        if (s.joinedAt)  r += `    ${YE}Joined:${RST}    ${s.joinedAt}\n`;
                        if (s.presence)  r += `    ${YE}Status:${RST}    ${s.presence}\n`;
                        if (s.activity)  r += `    ${YE}Activity:${RST}  ${s.activity.slice(0, 100)}\n`;
                        if (s.roles.length) r += `    ${YE}Roles:${RST}     ${s.roles.join(', ')}\n`;
                    }
                    // API-side mutual guilds not in cache
                    const cacheIds = new Set(mutualServers.map(s => s.guildId));
                    const apiOnly  = profileMutualGuilds.filter((g: any) => !cacheIds.has(g.id));
                    if (apiOnly.length) {
                        r += `\n  ${GY}Additional from API (bot not in these):${RST}\n`;
                        apiOnly.slice(0, 5).forEach((g: any) => {
                            r += `    ${MA}•${RST} ${g.id}${g.nick ? ` (nick: ${g.nick})` : ''}\n`;
                        });
                    }
                }

                // ── RECENT MESSAGES ──────────────────────────────────────────
                r += head(`RECENT MESSAGES (${recentMsgs.length} found)`);
                if (recentMsgs.length === 0) {
                    r += `  ${GY}— no messages found in mutual servers —${RST}\n`;
                } else {
                    for (const msg of recentMsgs.slice(0, 15)) {
                        r += `\n  ${CY}▸ #${msg.channel}${RST} in ${GY}${msg.guildName}${RST}  ${GY}${msg.ts}${RST}\n`;
                        r += `    ${WH}${msg.content}${RST}\n`;
                        if (msg.attachments.length) {
                            msg.attachments.forEach((url: string) => r += `    ${MA}[attach] ${url}${RST}\n`);
                        }
                    }
                }

                // ── SNOWID.LOL ───────────────────────────────────────────────
                r += head('SNOWID.LOL');
                if (snowid && !snowid.error && Object.keys(snowid).length > 0) {
                    const entries = Object.entries(snowid)
                        .filter(([, v]) => v !== null && v !== undefined && v !== '' && typeof v !== 'object')
                        .slice(0, 20);
                    if (entries.length === 0) r += `  ${GY}— no extra fields —${RST}\n`;
                    else entries.forEach(([k, v]) => r += row(k, String(v)));
                } else if (snowid?.error) {
                    r += `  ${GY}${snowid.error}${RST}\n`;
                } else {
                    r += `  ${GY}— unreachable —${RST}\n`;
                }
                r += row('Profile',  `https://snowid.lol/?id=${targetId}`);

                // BREACH INTEL
                r += head('BREACH INTEL (Snusbase + Beta + LeakCheck)');
                r += row('Sources',   `${breachSources.size}`);
                r += row('Records',   `${recordCount}`);
                r += row('Emails',    `${emails.size}`);
                r += row('Passwords', `${passwords.size}`);
                r += row('IPs',       `${ips.size}`);
                r += row('Aliases',   `${altUsers.size}`);

                if (emails.size) {
                    r += `\n  ${YE}Emails:${RST}\n`;
                    Array.from(emails).slice(0, 6).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                }
                if (altUsers.size) {
                    r += `  ${YE}Aliases:${RST}\n`;
                    Array.from(altUsers).slice(0, 6).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                }
                if (names.size) {
                    r += `  ${YE}Names:${RST}\n`;
                    Array.from(names).slice(0, 4).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                }
                if (ips.size) {
                    r += `  ${YE}IPs:${RST}\n`;
                    Array.from(ips).slice(0, 4).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                }
                if (passwords.size) {
                    r += `  ${YE}Passwords:${RST}\n`;
                    Array.from(passwords).slice(0, 8).forEach(e => r += `    ${RE}•${RST} ${e}\n`);
                }
                if (breachSources.size) {
                    r += `  ${YE}Breach DBs:${RST}\n`;
                    Array.from(breachSources).slice(0, 12).forEach(e => r += `    ${MA}•${RST} ${e}\n`);
                    if (breachSources.size > 12) r += `    ${GY}...and ${breachSources.size - 12} more${RST}\n`;
                }

                // Extra sources: Breachhub + Luperly + Swatted.wtf
                // Try the discord ID first; if a username was resolved, also try that
                const extraId = await extraOsintBlock(targetId, 'discord');
                if (extraId) r += extraId;
                if (user?.username) {
                    const extraName = await extraOsintBlock(user.username, 'username');
                    if (extraName) r += extraName;
                }

                // ── PARALLAX (csintduck.cc) ──────────────────────────────────
                const parallaxQueries: string[] = [targetId];
                if (user?.username) parallaxQueries.push(user.username);
                if (user?.discriminator && user.discriminator !== '0') parallaxQueries.push(`${user.username}#${user.discriminator}`);

                const parallaxResults = await Promise.all(parallaxQueries.map(q => parallaxQuery(q)));

                // Merge all results across queries
                const pxEmails    = new Set<string>();
                const pxPasswords = new Set<string>();
                const pxUsernames = new Set<string>();
                const pxNames     = new Set<string>();
                const pxPhones    = new Set<string>();
                const pxIps       = new Set<string>();
                const pxSources   = new Set<string>();
                const pxAddresses = new Set<string>();
                const pxDobs      = new Set<string>();
                const pxMisc      = new Map<string, string>();
                let   pxRecords   = 0;
                let   pxReached   = false;

                const SKIP_KEYS = new Set(['query', 'status', 'code', 'message', 'error', 'success', 'ok', 'took', 'total', 'count', 'id']);

                function digestParallax(obj: any, depth = 0): void {
                    if (!obj || depth > 6) return;
                    if (Array.isArray(obj)) { for (const v of obj) digestParallax(v, depth + 1); return; }
                    if (typeof obj !== 'object') return;

                    for (const [rawK, val] of Object.entries(obj)) {
                        const k = rawK.toLowerCase().replace(/[\s_-]/g, '');
                        if (val == null || val === '') continue;

                        if (typeof val === 'object') { digestParallax(val, depth + 1); continue; }
                        const s = String(val).trim();
                        if (!s || s === 'null' || s === 'undefined') continue;

                        if (/email/.test(k))                                                          { pxEmails.add(s); pxRecords++; }
                        else if (k === 'password' || k === 'pass' || k === 'plaintext' || k === 'pwd') { pxPasswords.add(s); pxRecords++; }
                        else if (/username|login|handle|nick/.test(k))                                 { pxUsernames.add(s); pxRecords++; }
                        else if (/^(name|fullname|realname|firstname|lastname)$/.test(k))              { pxNames.add(s); pxRecords++; }
                        else if (/phone|mobile|tel/.test(k))                                           { pxPhones.add(s); pxRecords++; }
                        else if (/^(ip|lastip|ipaddress)$/.test(k))                                   { pxIps.add(s); pxRecords++; }
                        else if (/source|database|breach|leak/.test(k))                                { pxSources.add(s); }
                        else if (/dob|birthdate|birthday/.test(k))                                     { pxDobs.add(s); pxRecords++; }
                        else if (/address|street|city|state|zip|postal|country/.test(k))               { pxAddresses.add(s); pxRecords++; }
                        else if (!SKIP_KEYS.has(k) && s.length < 120)                                  { pxMisc.set(rawK, s); }
                    }
                }

                for (const res of parallaxResults) {
                    if (res) {
                        pxReached = true;
                        digestParallax(res);
                    }
                }

                r += head('PARALLAX INTEL (csintduck.cc)');
                if (!pxReached) {
                    r += `  ${GY}— service unreachable or returned no data —${RST}\n`;
                } else if (pxRecords === 0 && pxMisc.size === 0 && pxSources.size === 0) {
                    r += `  ${GY}— no records found for this target —${RST}\n`;
                } else {
                    if (pxSources.size)   r += `  ${YE}Sources (${pxSources.size}):${RST}  ${Array.from(pxSources).join(' · ')}\n`;
                    if (pxRecords > 0)    r += `  ${YE}Fields found:${RST} ${pxRecords}\n`;
                    if (pxNames.size) {
                        r += `\n  ${YE}Name(s):${RST}\n`;
                        Array.from(pxNames).slice(0, 5).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxUsernames.size) {
                        r += `  ${YE}Username(s):${RST}\n`;
                        Array.from(pxUsernames).slice(0, 6).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxEmails.size) {
                        r += `  ${YE}Email(s):${RST}\n`;
                        Array.from(pxEmails).slice(0, 6).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxPhones.size) {
                        r += `  ${YE}Phone(s):${RST}\n`;
                        Array.from(pxPhones).slice(0, 4).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxIps.size) {
                        r += `  ${YE}IP Address(es):${RST}\n`;
                        Array.from(pxIps).slice(0, 4).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxDobs.size) {
                        r += `  ${YE}Date of Birth:${RST}\n`;
                        Array.from(pxDobs).slice(0, 3).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxAddresses.size) {
                        r += `  ${YE}Address(es):${RST}\n`;
                        Array.from(pxAddresses).slice(0, 3).forEach(v => r += `    ${MA}•${RST} ${v}\n`);
                    }
                    if (pxPasswords.size) {
                        r += `  ${YE}Password(s):${RST}\n`;
                        Array.from(pxPasswords).slice(0, 8).forEach(v => r += `    ${RE}•${RST} ${v}\n`);
                    }
                    if (pxMisc.size) {
                        r += `  ${YE}Additional Fields:${RST}\n`;
                        Array.from(pxMisc.entries()).slice(0, 10).forEach(([k, v]) => {
                            const label = k.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                            r += `    ${GY}${label}:${RST} ${v}\n`;
                        });
                    }
                }

                r += `${CY}${SUB}${RST}\n\`\`\``;

                // ── Send text report (auto-split at 1900 chars) ──────────────
                const sendChunk = async (text: string) => {
                    if (text.length <= 1990) return message.edit(text).catch(() => {});
                    const lines = text.split('\n');
                    let buf = '```ansi\n';
                    let first = true;
                    for (const line of lines) {
                        if (line === '```ansi' || line === '```') continue;
                        if ((buf + line + '\n```').length > 1900) {
                            buf += '```';
                            if (first) { await message.edit(buf).catch(() => {}); first = false; }
                            else       { await message.channel.send(buf).catch(() => {}); }
                            buf = '```ansi\n';
                        }
                        buf += line + '\n';
                    }
                    buf += '```';
                    if (first) await message.edit(buf).catch(() => {});
                    else       await message.channel.send(buf).catch(() => {});
                };
                await sendChunk(r);

                // ── Post avatar as embedded image ────────────────────────────
                if (avatarUrl) {
                    await message.channel.send(`\`\`\`ansi\n${CY}[ AVATAR ]${RST}\n\`\`\``).catch(() => {});
                    await message.channel.send(avatarUrl).catch(() => {});
                }

                // ── Post banner as embedded image ────────────────────────────
                if (bannerUrl) {
                    await message.channel.send(`\`\`\`ansi\n${CY}[ BANNER ]${RST}\n\`\`\``).catch(() => {});
                    await message.channel.send(bannerUrl).catch(() => {});
                }

                // ── Post attachment images from recent messages ───────────────
                const attachImgs = recentMsgs.flatMap(m => m.attachments).filter(u => /\.(png|jpg|jpeg|gif|webp)/i.test(u)).slice(0, 4);
                if (attachImgs.length) {
                    await message.channel.send(`\`\`\`ansi\n${CY}[ ATTACHMENTS FROM RECENT MESSAGES ]${RST}\n\`\`\``).catch(() => {});
                    for (const img of attachImgs) {
                        await message.channel.send(img).catch(() => {});
                    }
                }

                return;
            }

            // Unknown osint subcommand
            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Unknown osint command. Use ${prefix}help osint\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }


        // ── AFK ───────────────────────────────────────────────────────────────
        if (command === 'afk') {
            // .afk off → same as .unafk
            if (args[0]?.toLowerCase() === 'off') {
                const updated = { ...config, isAfk: false, afkMessage: '', afkSince: null } as any;
                clientConfigs.set(configId, updated);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] You're not AFK anymore.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const reason = fullArgs.trim() || "I'm AFK right now.";
            const updated = { ...config, isAfk: true, afkMessage: reason, afkSince: Date.now() } as any;
            clientConfigs.set(configId, updated);
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] AFK mode enabled.\u001b[0m\n\u001b[1;33mReason:\u001b[0m ${reason}\n\`\`\``).catch(() => {});
            return;
        }

        // ── UNAFK ─────────────────────────────────────────────────────────────
        if (command === 'unafk') {
            const updated = { ...config, isAfk: false, afkMessage: '', afkSince: null } as any;
            clientConfigs.set(configId, updated);
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] You're not AFK anymore.\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── STATUSMOVER ───────────────────────────────────────────────────────
        if (command === 'statusmover') {
            const sub = fullArgs.trim().toLowerCase();

            // Stop
            if (sub === 'stop' || sub === '') {
                const existing = statusMoverIntervals.get(configId);
                if (existing) {
                    existing.stop();
                    statusMoverIntervals.delete(configId);
                    // Clear custom status
                    try { client.user?.setPresence({ status: 'online', afk: false, activities: [] }); } catch (_) {}
                }
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Status mover stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            // Parse {word1,word2,...} — allow with or without braces
            const raw = fullArgs.trim().replace(/^\{/, '').replace(/\}$/, '');
            const words = raw.split(',').map((w: string) => w.trim()).filter((w: string) => w.length > 0);

            if (words.length < 2) {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}statusmover {word1,word2,word3}\u001b[0m\n` +
                    `\u001b[1;30mProvide at least 2 words separated by commas.\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            // Clear any existing mover
            const old = statusMoverIntervals.get(configId);
            if (old) old.stop();

            // Use a self-rescheduling setTimeout chain (instead of setInterval) so:
            //   1. Each tick fully completes before the next is scheduled — no overlap.
            //   2. Errors never break the loop; we always reschedule.
            //   3. The cadence is gateway-friendly (Discord rate-limits presence updates,
            //      so a too-tight interval makes the gateway queue back up and the cycle
            //      appears to "lag" or stall — especially with many words).
            let index = 0;
            let stopped = false;
            let timer: NodeJS.Timeout | null = null;

            const tick = () => {
                if (stopped) return;
                try {
                    if (client.user) {
                        const cs = new CustomStatus(client).setState(words[index]);
                        client.user.setPresence({
                            status: 'online',
                            afk: false,
                            activities: [cs],
                        });
                        index = (index + 1) % words.length;
                    }
                } catch (e) {
                    console.error(`[StatusMover] setPresence failed:`, e);
                    // swallow — never let an error stop the cycle
                }
                if (!stopped) {
                    timer = setTimeout(tick, STATUS_MOVER_INTERVAL_MS);
                }
            };

            const controller = {
                stop: () => {
                    stopped = true;
                    if (timer) { clearTimeout(timer); timer = null; }
                },
            };
            statusMoverIntervals.set(configId, controller);
            tick();

            const seconds = Math.round(STATUS_MOVER_INTERVAL_MS / 1000);
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] Status mover started.\u001b[0m\n` +
                `\u001b[1;33mCycling:\u001b[0m ${words.join(' → ')}\n` +
                `\u001b[1;30mEvery ${seconds} seconds · Use ${prefix}statusmover stop to cancel\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── SNIPE ─────────────────────────────────────────────────────────────
        if (command === 'snipe') {
            const requestedIndex = Math.max(1, parseInt(args[0]) || 1) - 1; // 0-based
            const channelSnipes = snipedMessages.get(configId)?.get(message.channel.id);
            if (!channelSnipes || channelSnipes.length === 0) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No recently deleted messages in this channel.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            if (requestedIndex >= channelSnipes.length) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Only ${channelSnipes.length} deleted message(s) cached in this channel.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const snipe = channelSnipes[requestedIndex];
            const ago = Math.floor((Date.now() - snipe.timestamp) / 1000);
            const label = requestedIndex === 0 ? 'Last Deleted' : `Deleted #${requestedIndex + 1}`;
            await message.edit(
                `\`\`\`ansi\n\u001b[1;36m[SNIPE] ${label}\u001b[0m\n` +
                `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n` +
                `\u001b[1;33mAuthor:\u001b[0m  ${snipe.author}\n` +
                `\u001b[1;33mContent:\u001b[0m ${snipe.content}\n` +
                `\u001b[1;33mDeleted:\u001b[0m ${ago}s ago\n` +
                `\`\`\``
            ).catch(() => {});
            return;
        }

        // ── BULLY ─────────────────────────────────────────────────────────────
        if (command === 'bully') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                const bi = bullyIntervals.get(configId);
                if (bi) {
                    bi.running = false;
                    bullyIntervals.delete(configId);
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Bully stopped.\u001b[0m\n\`\`\``).catch(() => {});
                } else {
                    await message.edit(`\`\`\`ansi\n\u001b[1;33m[!] No active bully running.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '').trim();

            if (!userId || !/^\d{5,25}$/.test(userId)) {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}bully <@user|user_id>\u001b[0m\n` +
                    `\u001b[1;30mExample: ${prefix}bully @someone\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            // Resolve display name for confirmation
            let displayName = userId;
            try {
                const resolved = client.users.cache.get(userId) || await client.users.fetch(userId).catch(() => null);
                if (resolved) displayName = (resolved as any).tag || (resolved as any).username || userId;
            } catch (_) {}

            // Stop any existing bully first
            const existing = bullyIntervals.get(configId);
            if (existing) { existing.running = false; bullyIntervals.delete(configId); }

            // Capture the channel reference directly — most reliable approach
            const bullyChannel = message.channel as any;
            let failCount = 0;
            const MAX_FAILS = 5;

            const bullyMessages = [
                `<@${userId}> fuckass foid nigga`,
                `<@${userId}> ur a loser nigga`,
                `<@${userId}> fuck you bim ass nigga`,
                `<@${userId}> kys`,
                `<@${userId}> fucking retard ass foid doesnt know shit`,
                `<@${userId}> honestly js slit it nigga`,
                `<@${userId}> fuckass foid get off the internet`,
                `<@${userId}> ur genuinely a loser nigga 💀`,
                `<@${userId}> bim ass nigga nobody likes you`,
                `<@${userId}> kys no cap`,
                `<@${userId}> retard ass foid stay mad`,
                `<@${userId}> js slit it and log off nigga`,
                `<@${userId}> foid nigga combo lmaooo`,
                `<@${userId}> ur a loser bro kys`,
                `<@${userId}> fuck you fuckass`,
                `<@${userId}> biggest loser foid ive seen`,
                `<@${userId}> retard doesnt know shit as usual`,
                `<@${userId}> bim nigga sit down`,
                `<@${userId}> kys challenge 🙏`,
                `<@${userId}> foid stfu nobody asked`,
                `<@${userId}> ur a fuckass loser nigga fr`,
                `<@${userId}> honestly just slit it`,
                `<@${userId}> bim ass foid go cry`,
                `<@${userId}> fucking retard wake up`,
                `<@${userId}> loser nigga behavior`,
                `<@${userId}> ur so fucking dumb bro`,
                `<@${userId}> nobody wants you here nigga`,
                `<@${userId}> go outside and touch grass foid`,
                `<@${userId}> ur genuinely cooked 💀`,
                `<@${userId}> bro why are you even alive`,
                `<@${userId}> foid ass nigga log off`,
                `<@${userId}> ur the definition of a loser`,
                `<@${userId}> retard behavior on full display`,
                `<@${userId}> kys fr fr no jokes`,
                `<@${userId}> bim ass mf stfu`,
                `<@${userId}> ur a waste of space nigga`,
                `<@${userId}> fuckass keep crying`,
                `<@${userId}> nobody likes you at all fr`,
                `<@${userId}> genuine retard moment right here`,
                `<@${userId}> foid get off discord`,
                `<@${userId}> ur ugly and dumb combo`,
                `<@${userId}> loser on main 💀`,
                `<@${userId}> just slit it already nigga`,
                `<@${userId}> ur not built for this`,
                `<@${userId}> bim nigga in the chat lmao`,
                `<@${userId}> go kys and stream it`,
                `<@${userId}> foid energy detected 🚨`,
                `<@${userId}> ur so mid it hurts`,
                `<@${userId}> fucking idiot ass mf`,
                `<@${userId}> retard sit down nobody asked`,
                `<@${userId}> ur irrelevant nigga move`,
                `<@${userId}> bim ass foid crying again`,
                `<@${userId}> everyone here hates you fr`,
                `<@${userId}> ur a clown and a half`,
                `<@${userId}> loser behavior 24/7`,
                `<@${userId}> fuckass go touch grass`,
                `<@${userId}> nigga you peaked in 3rd grade`,
                `<@${userId}> ur mom shouldve swallowed`,
                `<@${userId}> kys speedrun any%`,
                `<@${userId}> bim ass nigga embarrassing`,
                `<@${userId}> foid shut your ass up`,
                `<@${userId}> retard ass take stfu`,
                `<@${userId}> ur a joke bro no cap`,
                `<@${userId}> nobody is scared of you nigga`,
                `<@${userId}> fuckass mf grow up`,
                `<@${userId}> loser detected 🗑️`,
                `<@${userId}> ur cooked beyond saving`,
                `<@${userId}> bim nigga stay losing`,
                `<@${userId}> foid go back to tiktok`,
                `<@${userId}> ur actually braindead`,
                `<@${userId}> kys and make it quick`,
                `<@${userId}> retard fr fr`,
                `<@${userId}> ur the weakest link nigga`,
                `<@${userId}> fuckass foid combo again 💀`,
                `<@${userId}> bim ass stay irrelevant`,
                `<@${userId}> nobody remembers ur name`,
                `<@${userId}> ur a walking L nigga`,
                `<@${userId}> foid ass behavior`,
                `<@${userId}> just log off forever`,
                `<@${userId}> ur genuinely pathetic bro`,
                `<@${userId}> retard ass mf cant think`,
                `<@${userId}> kys its not even funny`,
                `<@${userId}> bim nigga nobody cares`,
                `<@${userId}> foid get a life please`,
                `<@${userId}> ur so embarrassing 😭`,
                `<@${userId}> loser nigga all day`,
                `<@${userId}> fuckass die already`,
                `<@${userId}> ur nothing nigga`,
                `<@${userId}> bim ass foid pipe down`,
                `<@${userId}> retard moment every time`,
                `<@${userId}> ur a burden on everyone`,
                `<@${userId}> foid ass stfu fr`,
                `<@${userId}> kys on god`,
                `<@${userId}> nobody asked for ur opinion`,
                `<@${userId}> loser energy off the charts`,
                `<@${userId}> bim nigga pls log off`,
                `<@${userId}> fuckass go cry somewhere`,
                `<@${userId}> ur a waste nigga`,
                `<@${userId}> retard ass take the L`,
                `<@${userId}> foid detected 🚨 evacuate`,
                `<@${userId}> ur so fucking annoying`,
                `<@${userId}> kys challenge accepted?`,
                `<@${userId}> bim ass mf yapping again`,
                `<@${userId}> ur irrelevant log off`,
                `<@${userId}> foid ass nigga calm down`,
                `<@${userId}> loser mf cant win`,
                `<@${userId}> fuckass go outside`,
                `<@${userId}> retard ass no thoughts`,
                `<@${userId}> ur done nigga pack it up`,
                `<@${userId}> bim nigga take the L`,
                `<@${userId}> foid stfu and go cook`,
                `<@${userId}> ur legitimately braindead`,
                `<@${userId}> kys timer is ticking`,
                `<@${userId}> nobody wants to hear you`,
                `<@${userId}> loser ass fuckass combo`,
                `<@${userId}> bim ass foid 0 iq`,
                `<@${userId}> retard alert 🚨`,
                `<@${userId}> ur literally nothing`,
                `<@${userId}> foid go back to twitter`,
                `<@${userId}> kys with a smile 🙂`,
                `<@${userId}> bim nigga get a grip`,
                `<@${userId}> fuckass mf embarrassing`,
                `<@${userId}> loser 💀💀💀`,
                `<@${userId}> ur cooked nigga`,
                `<@${userId}> retard ass shut up`,
                `<@${userId}> foid no one cares`,
                `<@${userId}> bim ass delete ur account`,
                `<@${userId}> kys and dont come back`,
                `<@${userId}> ur genuinely a menace`,
                `<@${userId}> fuckass nobody tolerates you`,
                `<@${userId}> loser nigga on sight`,
                `<@${userId}> retard mf go sleep`,
                `<@${userId}> foid log off for good`,
                `<@${userId}> bim nigga ur cooked`,
                `<@${userId}> ur a stain on this server`,
                `<@${userId}> kys run it`,
                `<@${userId}> fuckass foid nobody likes you`,
                `<@${userId}> loser ass take notes`,
                `<@${userId}> retard 24/7 no breaks`,
                `<@${userId}> bim ass mf go away`,
                `<@${userId}> foid ur a clown`,
                `<@${userId}> ur just bad at existing`,
                `<@${userId}> kys already damn`,
                `<@${userId}> fuckass stay losing`,
                `<@${userId}> nigga ur so mid`,
                `<@${userId}> bim nigga get out`,
                `<@${userId}> retard ass foid combo 💀`,
                `<@${userId}> loser mf yapping`,
                `<@${userId}> foid ass go cry to ur mom`,
                `<@${userId}> ur the worst person here`,
                `<@${userId}> kys do it rn`,
                `<@${userId}> bim ass foid embarrassing`,
                `<@${userId}> fuckass shut the fuck up`,
                `<@${userId}> nigga nobody wants you`,
                `<@${userId}> retard go touch grass`,
                `<@${userId}> loser ass no life`,
                `<@${userId}> foid get off the server`,
                `<@${userId}> ur not wanted here nigga`,
                `<@${userId}> kys its giving`,
                `<@${userId}> bim nigga absolute L`,
                `<@${userId}> fuckass foid 0 braincells`,
                `<@${userId}> retard moment unlocked`,
                `<@${userId}> loser nigga main character fantasy`,
                `<@${userId}> foid cope harder`,
                `<@${userId}> ur actually done bro`,
                `<@${userId}> kys pls and ty`,
                `<@${userId}> bim ass nigga sit`,
                `<@${userId}> fuckass go delete urself`,
                `<@${userId}> retard tier take`,
                `<@${userId}> loser ass foid stfu`,
                `<@${userId}> ur so below average`,
                `<@${userId}> kys we wont miss you`,
                `<@${userId}> bim nigga get a job`,
                `<@${userId}> foid ur opinion is invalid`,
                `<@${userId}> fuckass nobody respects you`,
                `<@${userId}> retard mf log off`,
                `<@${userId}> loser nigga no achievements`,
                `<@${userId}> ur a living mistake`,
                `<@${userId}> kys speedrun`,
                `<@${userId}> bim ass foid go cry`,
                `<@${userId}> fuckass foid stop breathing`,
                `<@${userId}> retard ass nigga behave`,
                `<@${userId}> loser on a loser grind`,
                `<@${userId}> foid no thoughts head empty`,
                `<@${userId}> ur genuinely unbearable`,
                `<@${userId}> kys fr nobody stopping you`,
                `<@${userId}> bim nigga ur annoying`,
                `<@${userId}> fuckass stay mad`,
                `<@${userId}> retard foid tag team of L`,
                `<@${userId}> loser ass get off discord`,
                `<@${userId}> ur not it at all`,
                `<@${userId}> kys challenge world record`,
                `<@${userId}> bim ass mf nobody cares`,
                `<@${userId}> foid get a therapist`,
                `<@${userId}> fuckass ur pathetic`,
                `<@${userId}> retard behavior expected`,
                `<@${userId}> loser nigga take ur L`,
                `<@${userId}> ur irrelevant pls leave`,
                `<@${userId}> kys its giving courage`,
                `<@${userId}> bim nigga blocked and reported`,
                `<@${userId}> foid shut up nobody likes you`,
                `<@${userId}> fuckass go outside challenge`,
                `<@${userId}> retard ass foid needs help`,
                `<@${userId}> loser mf why are you here`,
                `<@${userId}> ur genuinely a problem`,
                `<@${userId}> kys anytime now`,
                `<@${userId}> bim ass sit down and stfu`,
                `<@${userId}> foid ur mid af`,
                `<@${userId}> fuckass mf delete this app`,
                `<@${userId}> retard nigga go home`,
                `<@${userId}> loser ass behavior smh`,
                `<@${userId}> ur nothing special nigga`,
                `<@${userId}> kys do the world a favour`,
                `<@${userId}> bim nigga nobody checks for you`,
                `<@${userId}> foid go make a sandwich`,
                `<@${userId}> fuckass ur so cooked rn`,
                `<@${userId}> retard mf close the tab`,
                `<@${userId}> loser nigga ur embarrassing`,
                `<@${userId}> ur done bro just done`,
                `<@${userId}> kys low key high key`,
                `<@${userId}> bim ass foid nobody rates you`,
                `<@${userId}> fuckass foid get therapy`,
                `<@${userId}> retard ass nigga go away`,
                `<@${userId}> loser on god no cap`,
                `<@${userId}> foid ur time is up`,
                `<@${userId}> ur so done it's crazy`,
                `<@${userId}> kys immediately`,
                `<@${userId}> bim nigga ur a joke`,
                `<@${userId}> fuckass stay irrelevant`,
                `<@${userId}> retard foid absolute zero`,
                `<@${userId}> loser ass nigga cope`,
                `<@${userId}> ur actually cooked no revive`,
                `<@${userId}> kys its giving main character`,
                `<@${userId}> bim ass mf ur washed`,
                `<@${userId}> foid nobody wants to hear you`,
                `<@${userId}> fuckass go delete ur account`,
                `<@${userId}> retard ass take the biggest L`,
                `<@${userId}> loser nigga go lay down`,
                `<@${userId}> ur the reason servers die`,
                `<@${userId}> kys on sight`,
                `<@${userId}> bim nigga ur washed up`,
                `<@${userId}> foid log off and dont return`,
                `<@${userId}> fuckass mf ur done`,
                `<@${userId}> retard ass no wins ever`,
                `<@${userId}> loser ass foid go cry irl`,
                `<@${userId}> ur genuinely the worst nigga`,
                `<@${userId}> fuckass mf nobody tolerates you`,
                `<@${userId}> retard foid log off for real`,
                `<@${userId}> bim nigga ur so embarrassing`,
                `<@${userId}> kys and take ur time`,
                `<@${userId}> foid nobody is coming to save you`,
                `<@${userId}> ur a certified loser nigga`,
                `<@${userId}> fuckass get a grip`,
                `<@${userId}> retard ass mf ur done`,
                `<@${userId}> loser nigga take the hint and leave`,
            ];

            // Homoglyph map — replaces letters with lookalike Unicode chars to bypass automod filters
            const homoglyphs: Record<string, string> = {
                'a': 'а', 'e': 'е', 'i': 'і', 'o': 'о', 'p': 'р', 'c': 'с',
                'A': 'А', 'E': 'Е', 'I': 'І', 'O': 'О', 'P': 'Р', 'C': 'С',
                'u': 'υ', 'n': 'ո', 'r': 'г', 'h': 'հ', 's': 'ѕ', 'x': 'х',
                'U': 'Ʋ', 'N': 'Ν', 'R': 'Ʀ', 'H': 'Η', 'S': 'Ѕ', 'X': 'Х',
                'k': 'κ', 'g': 'ɡ', 'd': 'ԁ', 'w': 'ԝ', 'b': 'Ь',
                'K': 'Κ', 'G': 'Ԍ', 'D': 'Ꭰ', 'W': 'Ԝ', 'B': 'В',
            };
            const symbolize = (text: string): string =>
                text.replace(/[a-zA-Z]/g, ch => homoglyphs[ch] ?? ch);

            let pingIdx = 0;
            const state = { running: true, channelId: bullyChannel.id };
            bullyIntervals.set(configId, state);

            // Self-rescheduling 16 ms loop — same cadence as spam
            const tick = async () => {
                if (!state.running) return;
                try {
                    if (typeof bullyChannel.send !== 'function') {
                        failCount++;
                    } else {
                        const raw = bullyMessages[pingIdx % bullyMessages.length];
                        // Pattern: "# {msg}" heading every 4th send (0, 4, 8...) then 3 regular
                        const toSend = (pingIdx % 4 === 0) ? `# ${raw}` : raw;
                        pingIdx++;
                        try {
                            await bullyChannel.send(toSend);
                            failCount = 0;
                        } catch (_filterErr) {
                            // Message likely blocked by automod — retry with homoglyphs
                            try {
                                await bullyChannel.send(symbolize(toSend));
                                failCount = 0;
                            } catch (_) {
                                failCount++;
                            }
                        }
                    }
                } catch (_) {
                    failCount++;
                }
                if (failCount >= MAX_FAILS) {
                    state.running = false;
                    bullyIntervals.delete(configId);
                    bullyChannel.send(`\`\`\`ansi\n\u001b[1;31m[!] Bully auto-stopped after ${MAX_FAILS} consecutive failures.\u001b[0m\n\`\`\``).catch(() => {});
                    return;
                }
                if (state.running) setTimeout(tick, 16);
            };
            setTimeout(tick, 0);

            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] Bullying ${displayName} at max speed\u001b[0m\n` +
                `\u001b[1;30mAuto-stops after ${MAX_FAILS} fails · ${prefix}bully stop to cancel\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── AB (human-speed trash-talk loop) ─────────────────────────────────
        if (command === 'ab') {
            const sub = args[0]?.toLowerCase();

            // ,ab stop — silently kill the loop
            if (sub === 'stop') {
                await message.delete().catch(() => {});
                const st = abIntervals.get(configId);
                if (st) { st.running = false; abIntervals.delete(configId); }
                return;
            }

            // Delete the trigger message silently so nothing shows in chat
            await message.delete().catch(() => {});

            const abLines = [
                'UR A DEGEN STFU',
                'WHORE SHUT UP',
                'RETARD LOG OFF',
                'FOID NOBODY WANTS U',
                'SLUT BE QUIET',
                'KYS IDIOT',
                'MOID GET OFF THE APP',
                'UR SLOW AS HELL RETARD',
                'DEGEN SHUT UR MOUTH',
                'WHORE STOP TALKING',
                'IDIOT LOG OFF',
                'FOID UR IRRELEVANT',
                'KYS SLUT',
                'MOID SHUT UP',
                'RETARD NOBODY ASKED',
                'UR A SLUT AND U KNOW IT',
                'DEGEN GET OUT',
                'WHORE NOBODY WANTS U HERE',
                'FOID STFU',
                'KYS RETARD',
                'IDIOT UR EMBARRASSING',
                'SLUT LOG OFF',
                'MOID UR SLOW',
                'DEGEN STOP TYPING',
                'RETARD SHUT IT',
                'WHORE UR NOTHING',
                'FOID LOG OFF ALREADY',
                'KYS DEGEN',
                'IDIOT NOBODY CARES',
                'SLUT UR IRRELEVANT',
                'MOID STFU',
                'RETARD GET OFF THE APP',
                'DEGEN UR ANNOYING',
                'WHORE SHUT UP ALREADY',
                'FOID KYS',
                'IDIOT STOP',
                'SLUT NOBODY ASKED U',
                'KYS MOID',
                'RETARD UR EMBARRASSING',
                'DEGEN LOG OFF',
                'WHORE UR SLOW',
                'FOID IDIOT SHUT UP',
                'MOID NOBODY WANTS U',
                'SLUT KYS',
                'RETARD STOP TALKING',
                'IDIOT UR A DEGEN',
                'FOID NOBODY ASKED',
                'KYS SLUT RETARD',
                'MOID UR IRRELEVANT',
                'WHORE LOG OFF',
                'SLUT SHUT UR MOUTH',
                'RETARD KYS',
                'IDIOT FOID LOG OFF',
                'DEGEN UR SLOW',
                'FOID SHUT IT',
                'MOID UR A DEGEN',
                'WHORE STOP',
                'KYS IDIOT RETARD',
                'SLUT GET OFF THE APP',
                'RETARD NOBODY WANTS U',
                'DEGEN KYS',
                'FOID UR EMBARRASSING',
                'IDIOT SHUT UP',
                'MOID LOG OFF',
                'WHORE NOBODY CARES',
                'SLUT UR NOTHING',
                'KYS FOID',
                'RETARD UR A SLUT',
                'DEGEN NOBODY ASKED',
                'FOID WHORE LOG OFF',
                'MOID STOP TALKING',
                'IDIOT KYS',
                'SLUT STFU',
                'WHORE UR IRRELEVANT',
                'RETARD DEGEN SHUT UP',
                'FOID UR SLOW',
                'KYS MOID RETARD',
                'DEGEN IDIOT LOG OFF',
                'MOID WHORE KYS',
                'SLUT NOBODY WANTS U HERE',
                'IDIOT UR EMBARRASSING URSELF',
                'FOID SLUT SHUT UP',
                'RETARD LOG OFF ALREADY',
                'WHORE KYS',
                'DEGEN UR A RETARD',
                'MOID FOID SHUT IT',
                'KYS SLUT IDIOT',
                'IDIOT NOBODY RATES U',
                'SLUT UR A DEGEN',
                'FOID STOP TALKING',
                'RETARD SHUT UP ALREADY',
                'WHORE UR NOTHING',
                'DEGEN FOID LOG OFF',
                'MOID KYS',
                'KYS RETARD SLUT',
                'IDIOT LOG OFF ALREADY',
                'SLUT WHORE SHUT UP',
                'FOID UR A RETARD',
                'RETARD NOBODY CARES',
                'DEGEN SLUT KYS',
                'WHORE IDIOT LOG OFF',
                'MOID UR EMBARRASSING',
                'FOID KYS RETARD',
                'KYS DEGEN WHORE',
                'IDIOT SLUT SHUT UP',
                'SLUT UR SLOW',
                'RETARD FOID STFU',
                'DEGEN UR IRRELEVANT',
                'WHORE MOID LOG OFF',
                'MOID SLUT KYS',
                'FOID UR NOTHING',
                'IDIOT RETARD LOG OFF',
                'KYS WHORE DEGEN',
                'SLUT STOP TYPING',
                'DEGEN SHUT IT',
                'RETARD UR A SLUT',
                'WHORE FOID SHUT UP',
                'MOID NOBODY ASKED',
                'FOID SLUT LOG OFF',
                'IDIOT KYS DEGEN',
                'KYS RETARD MOID',
                'SLUT UR EMBARRASSING',
                'DEGEN WHORE LOG OFF',
                'WHORE UR A DEGEN',
                'RETARD NOBODY WANTS U',
                'FOID IDIOT KYS',
                'MOID UR SLOW',
                'IDIOT SLUT LOG OFF',
                'KYS FOID RETARD',
                'DEGEN STOP',
                'SLUT MOID SHUT UP',
                'RETARD UR IRRELEVANT',
                'WHORE KYS SLUT',
                'FOID UR A DEGEN',
                'IDIOT NOBODY CARES',
                'MOID RETARD LOG OFF',
                'KYS DEGEN IDIOT',
                'DEGEN UR NOTHING',
                'SLUT SHUT IT',
                'WHORE RETARD KYS',
                'FOID MOID SHUT UP',
                'RETARD SLUT LOG OFF',
                'IDIOT UR SLOW',
                'MOID KYS WHORE',
                'KYS SLUT FOID',
                'DEGEN RETARD SHUT UP',
                'WHORE UR EMBARRASSING',
                'FOID LOG OFF RETARD',
                'SLUT UR A MOID',
                'MOID IDIOT KYS',
                'IDIOT DEGEN LOG OFF',
                'KYS MOID SLUT',
                'RETARD UR NOTHING',
                'WHORE FOID KYS',
                'FOID SHUT UP ALREADY',
                'DEGEN MOID LOG OFF',
                'SLUT NOBODY CARES',
                'IDIOT WHORE SHUT UP',
                'MOID UR A SLUT',
                'KYS RETARD FOID',
                'FOID UR SLOW AS HELL',
                'RETARD KYS WHORE',
                'DEGEN IDIOT SHUT IT',
                'WHORE SLUT LOG OFF',
                'MOID UR IRRELEVANT',
                'SLUT FOID KYS',
                'KYS DEGEN RETARD',
                'IDIOT UR A WHORE',
                'FOID MOID LOG OFF',
                'RETARD SHUT UP SLUT',
                'DEGEN UR EMBARRASSING URSELF',
                'WHORE NOBODY WANTED UR OPINION',
                'MOID SLUT SHUT UP',
                'KYS FOID IDIOT',
                'SLUT UR SLOW AS HELL',
                'IDIOT LOG OFF RETARD',
                'FOID WHORE KYS',
                'DEGEN NOBODY WANTS U',
                'MOID UR NOTHING',
                'RETARD SLUT KYS',
                'KYS WHORE MOID',
                'WHORE UR A RETARD',
                'FOID DEGEN SHUT IT',
                'IDIOT MOID LOG OFF',
                'SLUT KYS FOID',
                'DEGEN SHUT UP RETARD',
                'MOID UR EMBARRASSING',
                'KYS IDIOT WHORE',
                'RETARD FOID LOG OFF',
                'WHORE SHUT UP DEGEN',
                'FOID SLUT KYS',
                'IDIOT UR NOTHING',
                'MOID RETARD SHUT UP',
                'SLUT LOG OFF WHORE',
                'DEGEN UR SLOW',
                'KYS SLUT MOID',
                'FOID NOBODY CARES',
                'RETARD UR A DEGEN',
                'WHORE IDIOT KYS',
                'MOID FOID LOG OFF',
                'IDIOT SLUT SHUT IT',
                'KYS DEGEN FOID',
                'SLUT RETARD SHUT UP',
                'DEGEN LOG OFF MOID',
                'FOID UR EMBARRASSING',
                'WHORE KYS RETARD',
                'MOID IDIOT LOG OFF',
                'KYS SLUT DEGEN',
                'RETARD NOBODY ASKED U',
                'IDIOT FOID KYS',
                'SLUT UR A RETARD',
                'DEGEN WHORE SHUT IT',
                'FOID KYS MOID',
                'MOID UR A WHORE',
                'KYS RETARD IDIOT',
                'WHORE DEGEN LOG OFF',
                'SLUT UR NOTHING',
                'IDIOT MOID KYS',
                'FOID RETARD SHUT UP',
                'DEGEN KYS SLUT',
                'MOID WHORE SHUT IT',
                'KYS FOID SLUT',
                'RETARD UR EMBARRASSING',
                'WHORE IDIOT LOG OFF',
                'SLUT DEGEN KYS',
                'FOID UR A SLUT',
                'IDIOT RETARD SHUT IT',
                'MOID LOG OFF SLUT',
                'KYS WHORE IDIOT',
                'DEGEN FOID SHUT UP',
                'SLUT UR SLOW',
                'RETARD MOID KYS',
                'WHORE UR A SLUT',
                'IDIOT FOID SHUT UP',
                'KYS DEGEN MOID',
                'MOID UR NOTHING',
                'SLUT WHORE KYS',
                'DEGEN RETARD LOG OFF',
                'IDIOT SHUT UP SLUT',
                'FOID UR A WHORE',
                'KYS MOID FOID',
                'RETARD WHORE LOG OFF',
                'WHORE SLUT SHUT UP',
                'MOID DEGEN KYS',
                'SLUT IDIOT LOG OFF',
                'DEGEN UR A FOID',
                'FOID KYS SLUT',
                'KYS RETARD WHORE',
                'IDIOT LOG OFF DEGEN',
                'WHORE UR SLOW',
                'SLUT FOID SHUT IT',
                'DEGEN MOID SHUT UP',
                'FOID NOBODY WANTED U HERE',
                'KYS IDIOT SLUT',
                'RETARD UR A WHORE',
                'MOID KYS FOID',
                'WHORE RETARD LOG OFF',
                'IDIOT DEGEN KYS',
                'SLUT UR EMBARRASSING URSELF',
                'FOID MOID SHUT UP',
                'KYS SLUT RETARD',
                'DEGEN UR A SLUT',
                'MOID IDIOT SHUT IT',
                'RETARD FOID KYS',
                'WHORE DEGEN SHUT UP',
                'SLUT MOID LOG OFF',
                'IDIOT KYS FOID',
                'KYS RETARD DEGEN',
                'FOID UR A MOID',
                'DEGEN SLUT SHUT IT',
                'SLUT UR A FOID',
                'IDIOT WHORE LOG OFF',
                'KYS DEGEN SLUT',
                'RETARD MOID SHUT UP',
                'WHORE FOID LOG OFF',
                'DEGEN IDIOT SHUT UP',
                'MOID UR A FOID',
                'KYS WHORE SLUT',
                'SLUT RETARD LOG OFF',
                'IDIOT DEGEN SHUT IT',
                'FOID KYS IDIOT',
                'RETARD WHORE SHUT UP',
                'MOID SLUT LOG OFF',
                'KYS FOID MOID',
                'DEGEN UR A WHORE',
                'WHORE MOID KYS',
                'SLUT IDIOT SHUT UP',
                'FOID RETARD LOG OFF',
                'IDIOT SLUT KYS',
                'MOID DEGEN SHUT UP',
                'KYS RETARD SLUT',
                'DEGEN WHORE LOG OFF',
                'SLUT UR A IDIOT',
                'FOID SHUT UP MOID',
                'NIGGAS SPIT ON YOU UR A PURE FUCKING LOSER HE THOUGHT HE COULD STEP',
                'NIGGA IS SLOW THIS IS BAD WORTHLESS SLOW LOSER',
                'UR A FUCKING JR COPE MORE FAGGOT',
                'SIT THE FUCK DOWN SHUT THE FUCK UP',
                'YOU TRULY ARE WEAK AS FUCK U GET PICKED ON IN SCHOOL WEAK ASS NIGGA',
                'GARBAGE FUCKING AUTO BEEFING LOSER SHUT THE FUCK UP I WILL RIP UR EYEBALLS OUT U DORK',
                'FORGOTTEN CORPSE YOU WONT BEEF ME CUS YK UR FUCKING SHIT',
                'ALL U DO IS BARK WEAK ASS PUSSY UR SO MAD STUPID WEAK INCEL BITCH',
                'DIE RIGHT NOW GARBAGE ASS BITCH',
                'SHUT THE FUCK UP SHUT THE FUCK UP UR RETARDED',
                'SO FUCKING ASS COME THE FUCK BACK HERE NIGGA UR ASS AS FUCK',
                'FOCUS LOOL UR ASS SHITTY ASS LITTLE LOSER',
                'YOU TRULY ARE WEAK AS FUCK U GET PICKED ON IN SCHOOL U SHOULD DIE BITCH',
                'UR TYPING SLOW AS FUCK I CAN SEE IT LMFO',
                'BITCH HOW ARE U THAT ASS I JUST DROPPED UR FUCKING EGO WHORE UR PISSING ME OFF',
                'STOP STOPPING SHITTY ASS LOSER',
                'NIGGA IS UGLY AS FUCK UGLY LITTLE BITCH SHUT THE FUCK UP',
                'DOG SHIT ASS LITTLE FUCKING RETARD UR RETARDED',
                'I DONT OWE YOU SHIT TF UR HANDS OUT BITCH NIGGA',
                'DIE RIGHT NOW UGLY LITTLE FUCKING RETARD',
                'NIGGA COME HERE WEAK FUCKING LOSER SHUT THE FUCK UP UGLY FUCKING LOSER',
                'IRRELEVANT LOSER GOT BITCHED SUBMISSIVE LITTLE LOSER',
                'UR NOT GOOD GARBAGE ASS NIGGA',
                'FAGGOT BOY OUT OF WORDS FRYING U BITCH UR A FUCKING LOSER LAME ASS FUCKING DORK',
                'NIGGA IS UGLY AS FUCK UR NOT SPECIAL DONT GET EXCITED DUMB FAGGOT',
                'UR A LITTLE FAGGOT UR SO FUCKING ASS UR MY BITCH STOP CRYING AND FIGHT BACK',
                'RETARD IS BALD WEAK FUCK',
                'NIGGAS MY SON WEAK LOSER',
                'U WILL ALWAYS BE MY BITCH UR AN INFERIOR REJECT',
                'RU WEAK AS FUCK UR A DORK FUCKING LOSER',
                'I TOOK UR WORTHLESS FUCKING CORPSE AND SOUL BITCH ASS WHORE U KNOW UR PLACE',
                'NIGGA THIS ALL U CAN DO NIGGA UR UGLY AS FUCK',
                'UR MY BITCH THE FUCK COME HERE UGLY ASS CUCK U KNOW UR PLACE',
                'DIE RIGHT NOW UR A LOSER',
                'UR A FUCKING LOSER UR A DORK',
                'UGLY LITTLE RETARD FUCK STUPID LOW TIER CUCK',
                'ALL U DO IS BARK WEAK ASS PUSSY UR SO MAD UGLY PEDO',
                'SLOW DORK ASS LOSER FUCK COPE MORE FAGGOT',
                'UR A FUCKING JR RETARDED BITCHASS LOSER',
                'UR MY BITCH AND U DIED UR A PATHETIC FUCKING BITCH',
                'RETARDED ASS DWEEBSTER U SHOULD DIE BITCH',
                'STOP STOPPING FUCKING UGLY RETARD',
                'UR MY BITCH AND UR TOO SLOW UR A PROSTITUTE NIGGA HOLY SHIT UR ASS BITCH',
                'NIGGA IS UGLY AS FUCK UR MY FUCKING SON U FAILED EVERY GRADE AT SCHOOL UR RETARDED',
                'DUMB ASS LOSER UR FUCKING GARBAGE UR DIRTY AS FUCK',
                'UR A DUMBFOUNDED ASS LOSER HOW SAD AND PATHETIC',
                'DORK ASS NIGGA U STRUGGLE AGAINST ME UR AN INBRED SHITTY ASS LITTLE LOSER',
                'NIGGA IS ASS AS FUCK WHO THE FUCK ARE U',
                'SIT THE FUCK DOWN WHO THE FUCK ARE U',
                'ANXIOUS FUCKING WHORE DONT FADE AWAY',
                'UR A LITTLE FAGGOT UR SO FUCKING ASS UR MY BITCH ILL RIPP UR FUCKING EYEBALLS OUT',
                'UR TYPING SLOW AS FUCK SHITTY ASS LOSER',
                'NIGGA UR STRUGGLING AGAINST ME RIGHT NOW UR SHIT IS GOING OFF NIGGA DIED',
                'DOG SHIT QUEER SUBMISSIVE LITTLE LOSER',
                'SLOW ASS FUCK NIGGA UR HORRIBLE UR DIRTY AS FUCK',
                'UR SHITTY AS FUCK AND NOBODY FUCKING LIKES U SOFT ASS LITTLE RETARDED FUCKING WIMP',
                'UR FUCKING SLOW BITCH UGLY FUCK SHITTY ASS LITTLE BITCH',
                'UR TRASH AS FUCK WEAK QUEER',
                'ILL MAKE U FEEL PAIN UR WEAK AS FUCK',
                'WEAK ASS HOMELESS FAGGOT UR ASS AS FUCK AND MY BITCH',
                'RETARD IS BALD UR MY WHORE',
                'WHOREY LITTLE FUCKING CRINGE BITCH UR A FUCKING WHORE UR CRINGE UR A FUCKING LOSER SHUT THE FUCK UP',
                'RETARDED ASS NIGGA GOT HOED ILL RIPP UR FUCKING EYEBALLS OUT',
                'UR A LOWLIFE CUCK I HOED U AND SENT YOU TO UR GRAVE UR A FUCKING RETARD AND UR SLOW AS FUCK',
                'WEAK ASS CUCK NIGGA SLOW SLOBBER MOUTH',
                'LITTLE SHITCAN LOSER ASS LEECH WHO THE FUCK ARE U',
                'LOWTIER FAGGOT UR ASS AS FUCK AND MY BITCH',
                'BITCH HOW ARE U THAT ASS I JUST DROPPED UR FUCKING EGO WHORE',
                'JUST SHUT THE FUCK UP UR NOT SPECIAL DONT GET EXCITED DUMB FAGGOT',
                'SLUT UR A LOSER DONT BOTHER TYPING UGLY ASS RETARD',
                'RETARD IS BALD WEAK AND SHIT',
                'UGLY SLOW RETARDED SHITTY ASS BITCH FRIENDLESS LOSER',
                'WEAK ASS HOMELESS FAGGOT SHUT THE FUCK UP',
                'BOW DOWN AND PRAISE ME UR A FUCKING LOSER ASS NIGGA',
                'WEAK FUCKING ASS CUCK UGLY LITTLE FUCKING RETARD',
                'I DONT OWE YOU SHIT TF UR HANDS OUT BITCH NIGGA SHUT THE FUCK UP I WALK YOU LIKE A BITCH',
                'DORK ASS NIGGA NOBODY CLAIMS UR UGLY ANON ASS',
                'UR ASS AS FUCK SHUT THE FUCK UP HOE U SHOULD DIE BITCH',
                'YOU TRULY ARE WEAK AS FUCK U GET PICKED ON IN SCHOOL UR AN UGLY BITCH',
                'UR A FUCKING JR SORE ASS FAGGOT',
                'SHUT THE FUCK UP BITCH UR SHIT AS FUCK AND UR SLOW UR ASS AS FUCK AND MY BITCH',
                'ALL U DO IS BARK WEAK ASS PUSSY UR SO MAD U KNOW UR PLACE',
                'NIGGAS SPIT ON YOU UR A PURE FUCKING LOSER WEAK ASS UGLY ASS FUCKING JR SLOW FUCK',
                'UR A LITTLE FAGGOT UR SO FUCKING ASS UR MY BITCH WEAK ASS NIGGA',
                'YOU TRULY ARE WEAK AS FUCK U GET PICKED ON IN SCHOOL SUBMISSIVE LITTLE LOSER',
                'I DONT OWE YOU SHIT TF UR HANDS OUT BITCH NIGGA WEAK ASS NIGGA',
                'UR GARBAGE AS FUCK NIGGA HOLY SHIT UR ASS BITCH',
                'RETARDED ASS NIGGA GOT HOED PUSSY NIGGA',
                'SO FUCKING ASS COME THE FUCK BACK HERE NIGGA UR ASS AS FUCK WEAK FUCKING WHORE',
                'SLOW ASS FUCK NIGGA UR HORRIBLE UR A DORK',
                'UR MY BITCH THE FUCK COME HERE UGLY ASS CUCK RETHINK UR LIFE',
                'UR A LOWLIFE CUCK I HOED U AND SENT YOU TO UR GRAVE UR SO SHIT REJECT',
                'WHAT THE FUCK NIGGA PASSED AWAY UR AN INBRED SHITTY ASS LITTLE LOSER',
                'NIGGAS SPIT ON YOU UR A PURE FUCKING LOSER UR DIRTY AS FUCK',
                'UR FUCKING ASS UR A LOSER UR A NO NAME UR AN IMMIGRANT',
                'UR FUCKING SLOW LOSER UR A FUCKING RETARD AND UR SLOW AS FUCK FAGGOT ASS NIGGA',
                'UR ASS STFU',
                'UR A DORK LOG OFF',
                'STUPID ASS MOID',
                'UR A FUCKING LOSER NIGGA',
                'FUCK YOU POORON',
                'UR ASS GET OUT',
                'DORK SHUT UR MOUTH',
                'UR A LOSER NIGGA STFU',
                'POORON LOG OFF',
                'UR ASS AND U KNOW IT',
                'STUPID DORK SHUT UP',
                'FUCKING LOSER GET OUT',
                'UR A POORON RETARD',
                'DORK ASS MOID STFU',
                'UR A LOSER WHORE',
                'STUPID ASS FOID',
                'POORON NOBODY WANTS U',
                'UR A FUCKING DORK IDIOT',
                'LOSER NIGGA LOG OFF',
                'UR ASS DORK SHUT UP',
                'STUPID MOID GET OUT',
                'FUCKING POORON STFU',
                'UR A DORK SLUT',
                'LOSER ASS RETARD',
                'UR ASS NOBODY CARES',
                'DORK UR EMBARRASSING',
                'STUPID LOSER FOID',
                'POORON SHUT IT',
                'UR A FUCKING IDIOT DORK',
                'LOSER NIGGA NOBODY ASKED',
                'UR ASS MOID LOG OFF',
                'STUPID ASS WHORE',
                'FUCKING DORK KYS',
                'UR A POORON GET OUT',
                'LOSER RETARD SHUT UP',
                'UR A DORK AND A HALF',
                'STUPID FOID NOBODY WANTS U',
                'POORON UR SLOW AS HELL',
                'FUCKING LOSER DEGEN',
                'UR ASS SLUT LOG OFF',
                'DORK MOID SHUT UP',
                'UR A LOSER STFU',
                'STUPID ASS DEGEN KYS',
                'POORON RETARD LOG OFF',
                'UR A FUCKING DORK FOID',
                'LOSER WHORE SHUT IT',
                'UR ASS AND UR SLOW',
                'STUPID MOID UR IRRELEVANT',
                'FUCKING POORON LOG OFF',
                'UR A DORK NOBODY ASKED',
                'LOSER IDIOT SHUT UP',
                'UR ASS FOID KYS',
                'STUPID RETARD NOBODY WANTS U',
                'POORON UR EMBARRASSING',
                'FUCKING DORK SLUT',
                'UR A LOSER NIGGA GET OUT',
                'DORK ASS NOBODY CARES',
                'UR ASS RETARD STFU',
                'STUPID LOSER MOID LOG OFF',
                'POORON SHUT UP ALREADY',
                'UR A FUCKING WHORE DORK',
                'LOSER FOID LOG OFF',
                'UR ASS DEGEN KYS',
                'STUPID ASS IDIOT SHUT UP',
                'FUCKING POORON NOBODY ASKED',
                'UR A DORK UR SLOW',
                'LOSER SLUT GET OUT',
                'UR ASS MOID NOBODY WANTS U',
                'STUPID RETARD DORK STFU',
                'POORON UR NOTHING',
                'FUCKING LOSER LOG OFF',
                'UR A DORK FOID KYS',
                'DORK WHORE SHUT UP',
                'LOSER NIGGA UR IRRELEVANT',
                'UR ASS SLUT NOBODY CARES',
                'STUPID MOID DORK',
                'POORON RETARD KYS',
                'FUCKING DORK IDIOT LOG OFF',
                'UR A LOSER DEGEN',
                'DORK UR EMBARRASSING URSELF',
                'STUPID FOID SLUT STFU',
                'LOSER ASS SHUT IT',
                'UR A FUCKING POORON',
                'DORK MOID LOG OFF',
                'STUPID LOSER NOBODY WANTED U HERE',
                'POORON UR SLOW',
                'FUCKING RETARD DORK KYS',
                'UR ASS WHORE SHUT UP',
                'LOSER NIGGA STFU',
                'DORK ASS FOID LOG OFF',
                'STUPID POORON KYS',
                'UR A DORK NOBODY RATES U',
                'FUCKING MOID LOSER',
                'LOSER SLUT UR NOTHING',
                'UR ASS IDIOT LOG OFF',
                'STUPID DORK DEGEN KYS',
                'POORON WHORE SHUT UP',
                'FUCKING LOSER FOID STFU',
                'UR A DORK RETARD',
                'DORK NOBODY WANTS U',
                'LOSER ASS MOID KYS',
                'UR ASS SLUT SHUT IT',
                'STUPID POORON SHUT UP',
                'FUCKING DORK WHORE LOG OFF',
                'UR A LOSER IDIOT KYS',
            ];

            const abChannel = message.channel as any;

            // Stop any existing ab loop first
            const existingAb = abIntervals.get(configId);
            if (existingAb) { existingAb.running = false; }

            const abState = { running: true };
            abIntervals.set(configId, abState);

            // 230 WPM ≈ 19 chars/sec. Cap at 1 s.
            const typingDelay = (text: string): number => {
                const base = Math.min(Math.ceil(text.length / 19) * 1000, 1000);
                return Math.round(base * (0.75 + Math.random() * 0.35));
            };

            (async () => {
                while (abState.running) {
                    const line = abLines[Math.floor(Math.random() * abLines.length)];
                    const delay = typingDelay(line);

                    // Show typing indicator, refreshing every 8 s if needed
                    await abChannel.sendTyping().catch(() => {});
                    if (delay > 8000) {
                        await new Promise(r => setTimeout(r, 8000));
                        if (!abState.running) break;
                        await abChannel.sendTyping().catch(() => {});
                        await new Promise(r => setTimeout(r, delay - 8000));
                    } else {
                        await new Promise(r => setTimeout(r, delay));
                    }

                    if (!abState.running) break;
                    await abChannel.send(line).catch(() => {});

                    // Brief human pause between messages (400–900 ms)
                    await new Promise(r => setTimeout(r, 400 + Math.round(Math.random() * 500)));
                }
                abIntervals.delete(configId);
            })();
            return;
        }

        // ── SPAM ──────────────────────────────────────────────────────────────
        if (command === 'spam') {
            const sub = args[0]?.toLowerCase();

            if (sub === 'stop') {
                activeSpams.set(configId, false);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Spam stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const count = parseInt(args[0]);
            const spamMsg = args.slice(1).join(' ');
            if (isNaN(count) || count < 1 || !spamMsg) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}spam <count> <message>\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            activeSpams.set(configId, true);
            await message.delete().catch(() => {});
            for (let i = 0; i < Math.min(count, 500); i++) {
                if (!activeSpams.get(configId)) break;
                try {
                    await message.channel.send(spamMsg);
                } catch (e: any) {
                    // If rate-limited, wait exactly as long as Discord says then retry
                    const retryAfter = e?.response?.data?.retry_after ?? e?.retryAfter;
                    if (retryAfter) {
                        await new Promise(r => setTimeout(r, retryAfter * 1000 + 100));
                        await message.channel.send(spamMsg).catch(() => {});
                    }
                    // Any other error — skip this message and keep going
                }
                // 16ms baseline — 5x faster than the previous 80ms; discord.js's
                // internal channel rate-limit queue still throttles real send rate
                // to whatever Discord actually allows (we just push faster into it).
                await new Promise(r => setTimeout(r, 16));
            }
            activeSpams.set(configId, false);
            return;
        }

        // ── AUTOREACT ─────────────────────────────────────────────────────────
        if (command === 'autoreact') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                autoReactConfigs.delete(configId);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Auto-react disabled.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            // All remaining args after the mention are emojis (superreact support)
            const rawEmojis = args.slice(1);
            if (!userId || rawEmojis.length === 0) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}autoreact <@user> <emoji> [emoji2 ...] | ${prefix}autoreact stop\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            // Normalize each emoji: strip <:name:id> or <a:name:id> wrappers
            const emojis = rawEmojis.map((e: string) => {
                const m = e.match(/^<a?:(\w+:\d+)>$/);
                return m ? m[1] : e;
            });
            autoReactConfigs.set(configId, { userOption: userId, emojis });
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Auto-reacting to <@${userId}> with ${rawEmojis.join(' ')}\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }


        // ── GC ────────────────────────────────────────────────────────────────
        if (command === 'gc') {
            const sub1 = args[0]?.toLowerCase();
            const sub2 = args[1]?.toLowerCase();
            const param = args[2];

            if (sub1 === 'allowall') {
                const enable = sub2 === 'on';
                await storage.updateBot(configId, { gcAllowAll: enable });
                clientConfigs.set(configId, { ...config, gcAllowAll: enable });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] GC Allow-All: ${enable ? 'ON' : 'OFF'}\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            if (sub1 === 'whitelist') {
                const currentWl: string[] = (config.whitelistedGcs as string[]) || [];
                if (sub2 === 'add' && param) {
                    if (!currentWl.includes(param)) currentWl.push(param);
                    await storage.updateBot(configId, { whitelistedGcs: currentWl });
                    clientConfigs.set(configId, { ...config, whitelistedGcs: currentWl });
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] GC ${param} whitelisted.\u001b[0m\n\`\`\``).catch(() => {});
                } else if (sub2 === 'remove' && param) {
                    const newWl = currentWl.filter(id => id !== param);
                    await storage.updateBot(configId, { whitelistedGcs: newWl });
                    clientConfigs.set(configId, { ...config, whitelistedGcs: newWl });
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] GC ${param} removed from whitelist.\u001b[0m\n\`\`\``).catch(() => {});
                } else if (sub2 === 'list') {
                    const list = currentWl.length > 0 ? currentWl.join('\n  ') : 'None';
                    await message.edit(
                        `\`\`\`ansi\n\u001b[1;36m[GC Whitelist]\u001b[0m\n  ${list}\n\`\`\``
                    ).catch(() => {});
                } else {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}gc whitelist add/remove/list [gcId]\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}gc allowall on/off | ${prefix}gc whitelist add/remove/list\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── PURGE ─────────────────────────────────────────────────────────────
        if (command === 'purge') {
            const count = Math.min(1000, Math.max(1, parseInt(args[0]) || 10));
            await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Purging ${count} messages...\u001b[0m\n\`\`\``).catch(() => {});
            try {
                // Collect enough messages — fetch up to 100 at a time scrolling back
                let collected: any[] = [];
                let before: string | undefined;
                while (collected.length < count) {
                    const batch: any = await message.channel.messages
                        .fetch({ limit: 100, ...(before ? { before } : {}) })
                        .catch(() => null);
                    if (!batch || batch.size === 0) break;
                    const mine = [...batch.values()].filter(
                        (m: any) => m.author.id === client.user?.id
                    );
                    collected.push(...mine);
                    before = [...batch.values()].pop()?.id;
                    if (batch.size < 100) break;
                }
                const toDelete = collected.slice(0, count);

                // Delete in small concurrent batches to maximise speed without
                // hitting per-route rate limits (Discord allows ~1 delete/s for users)
                let deleted = 0;
                const BATCH = 3;
                for (let i = 0; i < toDelete.length; i += BATCH) {
                    const chunk = toDelete.slice(i, i + BATCH);
                    const results = await Promise.allSettled(
                        chunk.map((m: any) => m.delete())
                    );
                    deleted += results.filter(r => r.status === 'fulfilled').length;
                    // Respect rate limit: ~300ms between batches of 3 ≈ 10 deletes/s
                    if (i + BATCH < toDelete.length) {
                        await new Promise(r => setTimeout(r, 300));
                    }
                }
                await message.channel.send(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Purged ${deleted} message(s).\u001b[0m\n\`\`\``
                ).catch(() => {});
            } catch {
                await message.channel.send(
                    `\`\`\`ansi\n\u001b[1;31m[!] Purge failed.\u001b[0m\n\`\`\``
                ).catch(() => {});
            }
            return;
        }

        // ── CLOSEALLDMS ────────────────────────────────────────────────────────
        if (command === 'closealldms') {
            await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Closing all DM channels...\u001b[0m\n\`\`\``).catch(() => {});
            // type 'DM' (1) = private DMs only — GROUP_DM (3) excluded intentionally
            const dmChannels = client.channels.cache.filter(
                (c: any) => c.type === 'DM' || c.type === 1
            );
            const toClose = [...dmChannels.values()];
            await Promise.allSettled(toClose.map((ch: any) => ch.delete().catch(() => {})));
            await message.channel.send(
                `\`\`\`ansi\n\u001b[1;32m[✓] Closed ${toClose.length} DM channel(s). GCs untouched.\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── MASSDM ────────────────────────────────────────────────────────────
        if (command === 'massdm') {
            const dmContent = fullArgs.trim();
            if (!dmContent) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}massdm <message>\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            // Type 1 = friend in discord.js-selfbot-v13 relationships cache
            const relationshipCache: Map<string, number> = (client as any).relationships?.cache ?? new Map();
            const friendIds: string[] = [];
            for (const [userId, type] of relationshipCache.entries()) {
                if (type === 1) friendIds.push(userId);
            }

            if (friendIds.length === 0) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No friends found on this account.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            await message.edit(
                `\`\`\`ansi\n\u001b[1;33m[~] Blasting DMs to ${friendIds.length} friend(s)...\u001b[0m\n\`\`\``
            ).catch(() => {});

            let sent = 0, failed = 0;
            const BATCH = 5;

            for (let i = 0; i < friendIds.length; i += BATCH) {
                const batch = friendIds.slice(i, i + BATCH);
                const results = await Promise.allSettled(
                    batch.map(async (userId) => {
                        const user = await client.users.fetch(userId).catch(() => null);
                        if (!user) throw new Error('fetch_failed');
                        // Only send to private DMs — skip bots / GC-only users
                        const dm = await user.createDM().catch(() => null);
                        if (!dm) throw new Error('dm_open_failed');
                        await dm.send(dmContent);
                    })
                );
                for (const r of results) {
                    if (r.status === 'fulfilled') sent++;
                    else failed++;
                }
                // brief pause between batches to stay under rate limits
                if (i + BATCH < friendIds.length) {
                    await new Promise(r => setTimeout(r, 400));
                }
            }

            await message.channel.send(
                `\`\`\`ansi\n\u001b[1;32m[✓] Mass DM complete.\u001b[0m\n` +
                `\u001b[1;33mSent:\u001b[0m   ${sent}\n` +
                `\u001b[1;31mFailed:\u001b[0m ${failed}\n` +
                `\u001b[1;30mTotal: ${friendIds.length} friends — GCs excluded\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }


        // ── STOPALL ────────────────────────────────────────────────────────────
        if (command === 'stopall') {
            // Stop bully
            const bi = bullyIntervals.get(configId);
            if (bi) { bi.running = false; bullyIntervals.delete(configId); }
            // Stop ab
            const ab = abIntervals.get(configId);
            if (ab) { ab.running = false; abIntervals.delete(configId); }
            // Stop spam
            activeSpams.set(configId, false);
            activeSpamAlls.set(configId, false);
            // Stop autoreact
            autoReactConfigs.delete(configId);
            // Stop trap
            trappedUsers.delete(configId);
            // Stop mock
            mockTargets.delete(configId);
            // Stop status mover
            const smi = statusMoverIntervals.get(configId);
            if (smi) {
                smi.stop();
                statusMoverIntervals.delete(configId);
                try { client.user?.setPresence({ status: 'online', afk: false, activities: [] }); } catch (_) {}
            }
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] All automations stopped.\u001b[0m\n` +
                `\u001b[1;30mBully · Spam · AutoReact · Trap · Mock · StatusMover\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── MOCK ──────────────────────────────────────────────────────────────
        if (command === 'mock') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                mockTargets.delete(configId);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Mock mode stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            if (!userId) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}mock <@user> | ${prefix}mock stop\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            mockTargets.set(configId, userId);
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] Now mocking <@${userId}>.\u001b[0m\n` +
                `\u001b[1;30mEvery message they send will be echoed in mocking case.\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── PREFIX ────────────────────────────────────────────────────────────
        if (command === 'prefix') {
            const sub = args[0]?.toLowerCase();
            const newPrefix = args[1];
            if (sub === 'set' && newPrefix) {
                await storage.updateBot(configId, { commandPrefix: newPrefix });
                clientConfigs.set(configId, { ...config, commandPrefix: newPrefix });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Prefix updated to: ${newPrefix}\u001b[0m\n\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}prefix set <new_prefix>\u001b[0m\n\`\`\``
                ).catch(() => {});
            }
            return;
        }

        // ── REPORT SERVER / REPORT MSG ────────────────────────────────────────
        if (command === 'report') {
            const sub = args[0]?.toLowerCase();

            const token = (client as any).token;
            const rptHeaders: Record<string, string> = {
                'Authorization': token,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Discord-Locale': 'en-US',
                'X-Discord-Timezone': 'America/New_York',
            };

            // Walk to a specific leaf in the menu tree by keyword priority (visited set prevents cycles)
            const walkToLeaf = (nodes: Record<number, any>, rootId: number, keywords: string[]): number[] => {
                const path: number[] = [];
                const visited = new Set<number>();
                let cur: number = rootId;
                for (let depth = 0; depth < 20; depth++) {
                    if (visited.has(cur)) break;
                    visited.add(cur);
                    const node = nodes[cur];
                    if (!node) break;
                    path.push(cur);
                    if (node.button?.type === 'submit' || node.is_auto_submit) break;
                    const children: Array<{ name: string; target_node_id: number }> = node.children || [];
                    if (children.length === 0) break;
                    const match = children.find(c => keywords.some(kw => (c.name || '').toLowerCase().includes(kw)));
                    cur = match ? match.target_node_id : children[0].target_node_id;
                }
                return path;
            };

            // ── .report server <guild_id> ─────────────────────────────────────
            if (sub === 'server') {
                const guildId = args[1];
                if (!guildId) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}report server <guild_id>\u001b[0m\n\`\`\``).catch(() => {});
                    return;
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Fetching report menu for server ${guildId}...\u001b[0m\n\`\`\``).catch(() => {});

                let gorePath: number[] = [];
                let menuVariant = '3';
                try {
                    const menuRes = await fetch('https://discord.com/api/v9/reporting/menu/guild', { headers: rptHeaders });
                    if (menuRes.ok) {
                        const menu = await menuRes.json() as any;
                        menuVariant = String(menu.variant || '3');
                        gorePath = walkToLeaf(menu.nodes || {}, menu.root_node_id, ['gore', 'animal cruelty', 'violent shock', 'shock content', 'violent', 'graphic']);
                    }
                } catch { /* fall through to v1 */ }

                await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Sending 20 gore reports for server ${guildId}...\u001b[0m\n\`\`\``).catch(() => {});

                let success = 0; let failed = 0;
                await Promise.all(Array.from({ length: 20 }, async () => {
                    // Try v3 breadcrumb report first
                    if (gorePath.length > 0) {
                        try {
                            const res = await fetch('https://discord.com/api/v9/reporting/guild', {
                                method: 'POST', headers: rptHeaders,
                                body: JSON.stringify({ version: '1.0', variant: menuVariant, name: 'guild', language: 'en', breadcrumbs: gorePath, guild_id: guildId }),
                            });
                            if (res.status === 201 || res.ok) { success++; return; }
                        } catch { /* fall through */ }
                    }
                    // Fallback: v1 reason 8 = gore / violent content
                    try {
                        const res = await fetch('https://discord.com/api/v9/report', {
                            method: 'POST', headers: rptHeaders,
                            body: JSON.stringify({ guild_id: guildId, channel_id: null, message_id: null, reason: 8 }),
                        });
                        if (res.ok || res.status === 201 || res.status === 204) { success++; } else { failed++; }
                    } catch { failed++; }
                }));

                const failNote = failed > 0 ? `  \u001b[1;31m(${failed} failed)\u001b[0m` : '';
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] ${success}/20 gore reports sent for server ${guildId}.${failNote}\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            // ── .report msg (reply to a message) ─────────────────────────────
            if (sub === 'msg') {
                const ref = message.reference;
                if (!ref?.messageId) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Reply to the message you want to report, then type ${prefix}report msg\u001b[0m\n\`\`\``).catch(() => {});
                    return;
                }

                const targetMsgId  = ref.messageId;
                const targetChanId = ref.channelId || message.channel.id;
                const targetGId    = (message.guild?.id) ?? null;

                await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Fetching message report menu...\u001b[0m\n\`\`\``).catch(() => {});

                let msgGorePath: number[] = [];
                let msgMenuVariant = '3';
                try {
                    const menuRes = await fetch('https://discord.com/api/v9/reporting/menu/message', { headers: rptHeaders });
                    if (menuRes.ok) {
                        const menu = await menuRes.json() as any;
                        msgMenuVariant = String(menu.variant || '3');
                        msgGorePath = walkToLeaf(menu.nodes || {}, menu.root_node_id, ['gore', 'animal cruelty', 'violent shock', 'shock content', 'violent', 'graphic']);
                    }
                } catch { /* fall through to v1 */ }

                await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Sending 20 gore reports for message ${targetMsgId}...\u001b[0m\n\`\`\``).catch(() => {});

                let success = 0; let failed = 0;
                await Promise.all(Array.from({ length: 20 }, async () => {
                    if (msgGorePath.length > 0) {
                        try {
                            const res = await fetch('https://discord.com/api/v9/reporting/message', {
                                method: 'POST', headers: rptHeaders,
                                body: JSON.stringify({
                                    version: '1.0', variant: msgMenuVariant, name: 'message', language: 'en',
                                    breadcrumbs: msgGorePath, message_id: targetMsgId, channel_id: targetChanId,
                                    ...(targetGId ? { guild_id: targetGId } : {}),
                                }),
                            });
                            if (res.status === 201 || res.ok) { success++; return; }
                        } catch { /* fall through */ }
                    }
                    // Fallback: v1 reason 8 = gore
                    try {
                        const res = await fetch('https://discord.com/api/v9/report', {
                            method: 'POST', headers: rptHeaders,
                            body: JSON.stringify({ guild_id: targetGId, channel_id: targetChanId, message_id: targetMsgId, reason: 8 }),
                        });
                        if (res.ok || res.status === 201 || res.status === 204) { success++; } else { failed++; }
                    } catch { failed++; }
                }));

                const failNote = failed > 0 ? `  \u001b[1;31m(${failed} failed)\u001b[0m` : '';
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] ${success}/20 gore reports sent for message ${targetMsgId}.${failNote}\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            await message.edit(
                `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}report server <guild_id>  |  reply to a message + ${prefix}report msg\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── NITROSNIPER ───────────────────────────────────────────────────────
        if (command === 'nitrosniper') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'on' || sub === 'off') {
                const enable = sub === 'on';
                await storage.updateBot(configId, { nitroSniper: enable });
                clientConfigs.set(configId, { ...config, nitroSniper: enable });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Nitro Sniper: ${enable ? 'ON' : 'OFF'}\u001b[0m\n\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}nitrosniper on/off\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── COPY FULL SERVER ─────────────────────────────────────────────────
        if (command === 'copy' && args[0]?.toLowerCase() === 'full' && args[1]?.toLowerCase() === 'server') {
            if (!message.guild) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Must be used inside the server you want to copy.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const src = message.guild as any;
            await message.delete().catch(() => {});

            const GRN = '\u001b[1;32m', YEL = '\u001b[1;33m', RED = '\u001b[1;31m', DIM = '\u001b[1;30m', CYN = '\u001b[1;36m', RST = '\u001b[0m';
            const statusMsg = await message.channel.send(
                `\`\`\`ansi\n${YEL}[~] Initialising server copy...\u001b[0m\n\`\`\``
            ).catch(() => null) as any;
            const update = async (lines: string) => statusMsg?.edit(`\`\`\`ansi\n${lines}\n\`\`\``).catch(() => {});

            // ── Phase 1: fetch source data ──
            await update(`${CYN}[1/7]${RST} Fetching source guild data...`);
            await src.members.fetch({ limit: 1000 }).catch(() => {});
            await src.roles.fetch().catch(() => {});
            await src.channels.fetch().catch(() => {});

            // ── Phase 2: create new guild ──
            await update(`${CYN}[2/7]${RST} Creating new guild...`);
            let newGuild: any;
            try {
                newGuild = await client.guilds.create(`${src.name}`, {
                    icon: src.iconURL({ format: 'png' }) ?? undefined,
                });
            } catch (e: any) {
                await update(`${RED}[!] Failed to create guild: ${e?.message || e}${RST}`);
                return;
            }
            await new Promise(r => setTimeout(r, 3000));

            // ── Phase 3: clear default channels ──
            await update(`${CYN}[3/7]${RST} Clearing default channels...`);
            for (const ch of [...newGuild.channels.cache.values()]) {
                await (ch as any).delete().catch(() => {});
                await new Promise(r => setTimeout(r, 400));
            }

            // ── Phase 4: clone roles ──
            await update(`${CYN}[4/7]${RST} Cloning roles...`);
            const roleIdMap = new Map<string, string>();
            roleIdMap.set(src.id, newGuild.id); // @everyone → @everyone

            // Update @everyone perms first
            try {
                await newGuild.roles.everyone.edit({
                    permissions: src.roles.everyone.permissions.bitfield.toString(),
                });
            } catch { /* ignore */ }

            const srcRoles = [...src.roles.cache.values()]
                .filter((r: any) => r.id !== src.id && !r.managed)
                .sort((a: any, b: any) => a.position - b.position);

            for (const role of srcRoles) {
                try {
                    const nr = await newGuild.roles.create({
                        name: role.name,
                        color: role.color,
                        hoist: role.hoist,
                        mentionable: role.mentionable,
                        permissions: role.permissions.bitfield.toString(),
                    });
                    roleIdMap.set(role.id, nr.id);
                } catch { /* skip */ }
                await new Promise(r => setTimeout(r, 300));
            }

            // ── Phase 5: clone channels ──
            await update(`${CYN}[5/7]${RST} Cloning channels...`);
            const catIdMap = new Map<string, string>(); // old cat id → new cat id

            const mapOverwrites = (ch: any) => {
                if (!ch.permissionOverwrites?.cache) return [];
                return [...ch.permissionOverwrites.cache.values()].map((o: any) => ({
                    id: roleIdMap.get(o.id) ?? o.id,
                    type: o.type === 0 ? 'role' : 'member',
                    allow: o.allow.bitfield.toString(),
                    deny: o.deny.bitfield.toString(),
                }));
            };

            // Categories first
            const categories = [...src.channels.cache.values()]
                .filter((c: any) => c.type === 'GUILD_CATEGORY' || c.type === 4)
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

            for (const cat of categories) {
                try {
                    const nc = await newGuild.channels.create(cat.name, {
                        type: 'GUILD_CATEGORY',
                        permissionOverwrites: mapOverwrites(cat),
                    });
                    catIdMap.set(cat.id, nc.id);
                } catch { /* skip */ }
                await new Promise(r => setTimeout(r, 400));
            }

            // Non-category channels sorted by position
            const nonCats = [...src.channels.cache.values()]
                .filter((c: any) => c.type !== 'GUILD_CATEGORY' && c.type !== 4)
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

            for (const ch of nonCats) {
                const parentId = (ch as any).parentId ? catIdMap.get((ch as any).parentId) : undefined;
                const overwrites = mapOverwrites(ch);
                const t = ch.type;
                try {
                    if (t === 'GUILD_TEXT' || t === 0) {
                        await newGuild.channels.create(ch.name, {
                            type: 'GUILD_TEXT',
                            topic: (ch as any).topic ?? undefined,
                            nsfw: (ch as any).nsfw ?? false,
                            rateLimitPerUser: (ch as any).rateLimitPerUser ?? 0,
                            parent: parentId,
                            permissionOverwrites: overwrites,
                        });
                    } else if (t === 'GUILD_VOICE' || t === 2) {
                        await newGuild.channels.create(ch.name, {
                            type: 'GUILD_VOICE',
                            bitrate: (ch as any).bitrate ?? 64000,
                            userLimit: (ch as any).userLimit ?? 0,
                            parent: parentId,
                            permissionOverwrites: overwrites,
                        });
                    } else if (t === 'GUILD_ANNOUNCEMENT' || t === 5) {
                        await newGuild.channels.create(ch.name, {
                            type: 'GUILD_ANNOUNCEMENT',
                            topic: (ch as any).topic ?? undefined,
                            parent: parentId,
                            permissionOverwrites: overwrites,
                        });
                    } else if (t === 'GUILD_STAGE_VOICE' || t === 13) {
                        await newGuild.channels.create(ch.name, {
                            type: 'GUILD_STAGE_VOICE',
                            parent: parentId,
                            permissionOverwrites: overwrites,
                        });
                    }
                } catch { /* skip unsupported */ }
                await new Promise(r => setTimeout(r, 400));
            }

            // ── Phase 6: create invite ──
            await update(`${CYN}[6/7]${RST} Creating invite link...`);
            let inviteUrl = '';
            try {
                const firstText = [...newGuild.channels.cache.values()].find(
                    (c: any) => c.type === 'GUILD_TEXT' || c.type === 0
                ) as any;
                if (firstText) {
                    const inv = await firstText.createInvite({ maxAge: 0, maxUses: 0 });
                    inviteUrl = inv.url;
                }
            } catch { /* skip */ }

            // ── Phase 7: DM members + post bot OAuth links ──
            await update(`${CYN}[7/7]${RST} DMing members & posting bot invite links...`);
            const members = [...src.members.cache.values()].filter((m: any) => m.user.id !== client.user?.id);
            const bots = members.filter((m: any) => m.user.bot);
            const humans = members.filter((m: any) => !m.user.bot);

            // Post bot OAuth URLs to first channel of new guild
            if (bots.length > 0) {
                try {
                    const botCh = [...newGuild.channels.cache.values()].find(
                        (c: any) => c.type === 'GUILD_TEXT' || c.type === 0
                    ) as any;
                    if (botCh) {
                        const botLinks = bots.map((b: any) =>
                            `**${b.user.username}** → https://discord.com/oauth2/authorize?client_id=${b.user.id}&scope=bot&permissions=8`
                        ).join('\n');
                        await botCh.send(`**Bot invite links for cloned server:**\n${botLinks}`).catch(() => {});
                    }
                } catch { /* skip */ }
            }

            const summary = [
                `${GRN}[✓] Server clone complete!${RST}`,
                `${DIM}New server:${RST} ${newGuild.name}`,
                inviteUrl ? `${DIM}Invite:${RST}    ${inviteUrl}` : `${RED}No invite (no text channel accessible)${RST}`,
                `${DIM}Roles:${RST}     ${srcRoles.length} cloned`,
                `${DIM}Channels:${RST}  ${nonCats.length + categories.length} cloned`,
                `${DIM}Bots:${RST}      ${bots.length} OAuth links posted in server`,
            ].join('\n');
            await update(summary);
            return;
        }

        // ── SERVER EMOJI STEAL ───────────────────────────────────────────────
        if (command === 'server' && args[0]?.toLowerCase() === 'emoji' && args[1]?.toLowerCase() === 'steal') {
            const sourceGuildId = args[2];
            if (!sourceGuildId) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}server emoji steal <guild_id>\u001b[0m\n\`\`\``).catch(() => {});
            }
            if (!message.guild) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] This command can only be used inside a server.\u001b[0m\n\`\`\``).catch(() => {});
            }
            const targetGuild = message.guild;

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] Fetching emojis from guild ${sourceGuildId}...\u001b[0m\n\`\`\``).catch(() => {});

            let sourceGuild: any;
            try {
                sourceGuild = await client.guilds.fetch(sourceGuildId);
            } catch {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Could not fetch guild ${sourceGuildId}. Make sure the bot is in that server.\u001b[0m\n\`\`\``).catch(() => {});
            }

            // Fetch full emoji list from the source guild
            let emojis: any[];
            try {
                const fetched = await sourceGuild.emojis.fetch();
                emojis = Array.from(fetched.values());
            } catch {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch emojis from guild ${sourceGuildId}.\u001b[0m\n\`\`\``).catch(() => {});
            }

            if (emojis.length === 0) {
                return message.edit(`\`\`\`ansi\n\u001b[1;33m[!] That guild has no custom emojis.\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] Stealing ${emojis.length} emoji(s) from ${sourceGuild.name}...\u001b[0m\n\`\`\``).catch(() => {});

            let uploaded = 0;
            let failed = 0;
            const failedNames: string[] = [];

            for (const emoji of emojis) {
                try {
                    const url = emoji.url || `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}`;
                    await targetGuild.emojis.create(url, emoji.name);
                    uploaded++;
                    // Small delay to avoid rate limits
                    await new Promise(r => setTimeout(r, 500));
                } catch (e: any) {
                    failed++;
                    failedNames.push(emoji.name);
                    // If we hit the emoji limit, stop early
                    if (e?.message?.toLowerCase().includes('maximum') || e?.code === 30008) {
                        await message.edit(
                            `\`\`\`ansi\n\u001b[1;33m[!] Emoji limit reached in this server.\n` +
                            `\u001b[1;32m[✓] Uploaded: ${uploaded}  \u001b[1;31mFailed: ${failed}\u001b[0m\n\`\`\``
                        ).catch(() => {});
                        return;
                    }
                }
            }

            const DIM = '\u001b[1;30m';
            const GRN = '\u001b[1;32m';
            const RED = '\u001b[1;31m';
            const CYN = '\u001b[1;36m';
            const RST = '\u001b[0m';
            const BAR = '─'.repeat(44);

            let result = `\`\`\`ansi\n${CYN}[NETRUNNER] EMOJI STEAL COMPLETE${RST}\n`;
            result += `${DIM}${BAR}${RST}\n`;
            result += `${'\u001b[1;33m'}Source:${RST}   ${sourceGuild.name} (${sourceGuildId})\n`;
            result += `${'\u001b[1;33m'}Target:${RST}   ${targetGuild.name}\n`;
            result += `${DIM}${BAR}${RST}\n`;
            result += `${GRN}Uploaded: ${uploaded}${RST}   ${RED}Failed: ${failed}${RST}\n`;
            if (failedNames.length > 0) {
                result += `${DIM}Failed: ${failedNames.slice(0, 10).join(', ')}${failedNames.length > 10 ? ` +${failedNames.length - 10} more` : ''}${RST}\n`;
            }
            result += `\`\`\``;
            await message.edit(result).catch(() => {});
            return;
        }

        // ── .server end stop / .server end <guild_id> ────────────────────────
        if (command === 'server' && args[0]?.toLowerCase() === 'end') {
            // Stop handler — cancels an in-progress flood
            if (args[1]?.toLowerCase() === 'stop') {
                if (activeServerEnds.get(configId)) {
                    activeServerEnds.set(configId, false);
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Server end flood cancelled.\u001b[0m\n\`\`\``).catch(() => {});
                } else {
                    await message.edit(`\`\`\`ansi\n\u001b[1;33m[!] No active server end flood to stop.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            const targetGuildId = args[1];
            if (!targetGuildId) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}server end <guild_id>\u001b[0m\n\`\`\``).catch(() => {});
            }

            // Prevent double-running
            if (activeServerEnds.get(configId)) {
                return message.edit(`\`\`\`ansi\n\u001b[1;33m[!] A server end is already running. Use ${prefix}server end stop to cancel it.\u001b[0m\n\`\`\``).catch(() => {});
            }

            const SERVER_END_IMAGES = [
                'https://cdn.discordapp.com/attachments/1451044974333263965/1508725562401751070/IMG_4099.jpg?ex=6a1695ac&is=6a15442c&hm=d9d1db37cc4ded192674632547d9077eabdb30ae588bc389184a9462a026c677&',
                'https://cdn.discordapp.com/attachments/1454831216757837859/1459507750689050788/giphy_2.gif?ex=6a162b44&is=6a14d9c4&hm=cdd944231ac30a2a6259a62b8f4c87bdc444e43ec9dd37fe3e64b33da0a8bac1&',
                'https://cdn.discordapp.com/attachments/1451029239062200382/1451030395557646560/image.gif?ex=6a164f5d&is=6a14fddd&hm=73f99b6a797da6b9d459644e5bf7a1bb82eeb8cf89760bfc919dba036a71baa2&',
                'https://cdn.discordapp.com/attachments/1451044974333263965/1508725423150727270/IMG_4098.jpg?ex=6a16958b&is=6a15440b&hm=762269ca6d036c4db7edf848daeb8a612309ab0e94856c25cfb592de560a56a0&',
                'https://cdn.discordapp.com/attachments/1451044974333263965/1508725134167638047/IMG_4097.jpg?ex=6a169546&is=6a1543c6&hm=c77e43d03e7cb40bacc5fba53a8fbed49f0300b8cd0851f2d8c2d36c80c3e13a&',
            ];

            let targetGuild: any;
            try {
                targetGuild = await client.guilds.fetch(targetGuildId);
            } catch {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Could not fetch guild ${targetGuildId}. Make sure the bot is in that server.\u001b[0m\n\`\`\``).catch(() => {});
            }

            // Collect all text channels the bot can send messages in
            // ch.type is a STRING in discord.js-selfbot-v13 (e.g. 'GUILD_TEXT')
            const SENDABLE_TYPES = new Set([
                'GUILD_TEXT', 'GUILD_NEWS',
                'GUILD_NEWS_THREAD', 'GUILD_PUBLIC_THREAD', 'GUILD_PRIVATE_THREAD',
            ]);
            let channels: any[];
            try {
                const allChannels = await targetGuild.channels.fetch();
                channels = Array.from((allChannels as any).values()).filter((ch: any) => {
                    if (!ch) return false;
                    return SENDABLE_TYPES.has(ch.type);
                    // No permissionsFor check — member cache unreliable on selfbots;
                    // send errors are caught individually in floodChannel instead.
                });
            } catch {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch channels from guild ${targetGuildId}.\u001b[0m\n\`\`\``).catch(() => {});
            }

            if (channels.length === 0) {
                return message.edit(`\`\`\`ansi\n\u001b[1;33m[!] No speakable text channels found in that guild.\u001b[0m\n\`\`\``).catch(() => {});
            }

            // ── Fetch up to 200 random members for mass-pinging ──────────────────
            let pingBatches: string[] = [];
            let pingCount = 0;
            try {
                const memberCollection = await targetGuild.members.list({ limit: 1000 });
                let memberIds: string[] = Array.from((memberCollection as any).keys());
                // Fisher-Yates shuffle then take 200
                for (let i = memberIds.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [memberIds[i], memberIds[j]] = [memberIds[j], memberIds[i]];
                }
                memberIds = memberIds.slice(0, 200);
                pingCount = memberIds.length;
                // Discord 2000-char limit: each <@id> is ≤22 chars → 90 per message
                for (let i = 0; i < memberIds.length; i += 90) {
                    pingBatches.push(memberIds.slice(i, i + 90).map((id: string) => `<@${id}>`).join(' '));
                }
            } catch { /* member fetch failed — continue without pings */ }

            activeServerEnds.set(configId, true);

            await message.edit(
                `\`\`\`ansi\n\u001b[1;31m[NETRUNNER] SERVER END INITIATED\u001b[0m\n` +
                `\u001b[1;33mTarget:\u001b[0m ${targetGuild.name} (${targetGuildId})\n` +
                `\u001b[1;33mChannels:\u001b[0m ${channels.length}  \u001b[1;33mPinging:\u001b[0m ${pingCount} members\n` +
                `\u001b[1;33mStep 1/2:\u001b[0m Flooding + pinging all channels...\u001b[0m\n\`\`\``
            ).catch(() => {});

            // ── STEP 1: Flood channels — ping 200 members then 100 images each ────
            // Each send packs all 5 images as files → 20 sends × 5 images = 100 images
            // All sends fired in parallel (Promise.all) — no sequential awaiting, no delays

            const floodChannel = async (ch: any): Promise<{ sent: number; failed: number; name: string; stopped: boolean }> => {
                if (!activeServerEnds.get(configId)) return { sent: 0, failed: 0, name: ch.name || ch.id, stopped: true };

                // Fire pings + all 20 image packets simultaneously — no awaiting between
                const pingPromises  = pingBatches.map(batch => (ch.send(batch) as Promise<any>).catch(() => {}));
                const imagePromises = Array.from({ length: 20 }, () =>
                    (ch.send({ files: SERVER_END_IMAGES }) as Promise<any>)
                        .then(() => true)
                        .catch(() => false)
                );

                const [, imageResults] = await Promise.all([
                    Promise.all(pingPromises),
                    Promise.all(imagePromises),
                ]);

                const successCount = (imageResults as boolean[]).filter(Boolean).length;
                return {
                    sent:    successCount * SERVER_END_IMAGES.length,
                    failed:  (20 - successCount) * SERVER_END_IMAGES.length,
                    name:    ch.name || ch.id,
                    stopped: false,
                };
            };

            const startFlood = Date.now();

            // Fire all channels in parallel — each sends 100 images
            const floodResults = await Promise.allSettled(channels.map(ch => floodChannel(ch)));
            let r1Sent = 0; let r1Failed = 0; let r1ChannelsHit = 0;
            for (const r of floodResults) {
                if (r.status === 'fulfilled') {
                    r1Sent += r.value.sent;
                    r1Failed += r.value.failed;
                    if (r.value.sent > 0) r1ChannelsHit++;
                } else { r1Failed += SERVER_END_IMAGES.length * 20; }
            }

            const r2Sent = 0; const r2Failed = 0; const r2ChannelsHit = 0;

            const floodElapsed = ((Date.now() - startFlood) / 1000).toFixed(1);
            const wasStopped = !activeServerEnds.get(configId);

            // If stopped mid-flood, show partial summary and exit
            if (wasStopped) {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;33m[!] SERVER END CANCELLED\u001b[0m\n` +
                    `\u001b[1;33mGuild:\u001b[0m ${targetGuild.name}\n` +
                    `\u001b[1;33mImages sent:\u001b[0m ${r1Sent} across ${r1ChannelsHit} channels\n` +
                    `\u001b[1;33mElapsed:\u001b[0m ${floodElapsed}s\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            await message.edit(
                `\`\`\`ansi\n\u001b[1;31m[NETRUNNER] SERVER END — REPORTING\u001b[0m\n` +
                `\u001b[1;33mFlooded:\u001b[0m ${r1Sent} imgs across ${r1ChannelsHit}/${channels.length} channels\n` +
                `\u001b[1;33mStep 2/2:\u001b[0m Fetching report menu + sending all categories...\u001b[0m\n\`\`\``
            ).catch(() => {});

            // ── STEP 3: Report the server for ALL available categories ───────────
            const seToken = (client as any).token;
            const seHeaders: Record<string, string> = {
                'Authorization': seToken,
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'X-Discord-Locale': 'en-US',
                'X-Discord-Timezone': 'America/New_York',
            };

            // Walk to gore and sexual branches using the safe cycle-aware walker
            const seWalkToLeaf = (nodes: Record<number, any>, rootId: number, keywords: string[]): number[] => {
                const path: number[] = [];
                const visited = new Set<number>();
                let cur: number = rootId;
                for (let depth = 0; depth < 20; depth++) {
                    if (visited.has(cur)) break;
                    visited.add(cur);
                    const node = nodes[cur];
                    if (!node) break;
                    path.push(cur);
                    if (node.button?.type === 'submit' || node.is_auto_submit) break;
                    const children: Array<{ name: string; target_node_id: number }> = node.children || [];
                    if (children.length === 0) break;
                    const match = children.find(c => keywords.some(kw => (c.name || '').toLowerCase().includes(kw)));
                    cur = match ? match.target_node_id : children[0].target_node_id;
                }
                return path;
            };

            let seGorePath: number[] = [];
            let seSexualPath: number[] = [];
            let seMenuVariant = '3';
            try {
                const menuRes = await fetch('https://discord.com/api/v9/reporting/menu/guild', { headers: seHeaders });
                if (menuRes.ok) {
                    const menu = await menuRes.json() as any;
                    seMenuVariant = String(menu.variant || '3');
                    const nodes = menu.nodes || {};
                    const rootId = menu.root_node_id;
                    seGorePath   = seWalkToLeaf(nodes, rootId, ['gore', 'animal cruelty', 'violent shock', 'shock content', 'violent', 'graphic']);
                    seSexualPath = seWalkToLeaf(nodes, rootId, ['sexual', 'explicit', 'graphic sexual', 'unwanted sexual']);
                }
            } catch { /* fallback to v1 */ }

            // 20 gore + 20 sexual in parallel — all as fast as possible
            const seReport = async (breadcrumbs: number[], v1Reason: number): Promise<boolean> => {
                if (breadcrumbs.length > 0) {
                    try {
                        const res = await fetch('https://discord.com/api/v9/reporting/guild', {
                            method: 'POST', headers: seHeaders,
                            body: JSON.stringify({ version: '1.0', variant: seMenuVariant, name: 'guild', language: 'en', breadcrumbs, guild_id: targetGuildId }),
                        });
                        if (res.status === 201 || res.ok) return true;
                    } catch { /* fall through */ }
                }
                try {
                    const res = await fetch('https://discord.com/api/v9/report', {
                        method: 'POST', headers: seHeaders,
                        body: JSON.stringify({ guild_id: targetGuildId, channel_id: null, message_id: null, reason: v1Reason }),
                    });
                    return res.ok || res.status === 201 || res.status === 204;
                } catch { return false; }
            };

            const seResults = await Promise.all([
                ...Array.from({ length: 20 }, () => seReport(seGorePath, 8)),
                ...Array.from({ length: 20 }, () => seReport(seSexualPath, 5)),
            ]);

            const totalSuccess = seResults.filter(Boolean).length;
            const totalFailed  = 40 - totalSuccess;

            activeServerEnds.set(configId, false);

            const totalAttempted = channels.length * 100;

            const CYN = '\u001b[1;36m';
            const GRN = '\u001b[1;32m';
            const RED = '\u001b[1;31m';
            const YLW = '\u001b[1;33m';
            const DIM = '\u001b[1;30m';
            const RST = '\u001b[0m';
            const BAR = '─'.repeat(40);

            let summary = `\`\`\`ansi\n${CYN}╔══════════════════════════════════════╗${RST}\n`;
            summary += `${CYN}║     NETRUNNER — SERVER END REPORT    ║${RST}\n`;
            summary += `${CYN}╚══════════════════════════════════════╝${RST}\n`;
            summary += `${DIM}${BAR}${RST}\n`;
            summary += `${YLW}TARGET${RST}\n`;
            summary += `  Guild Name : ${targetGuild.name}\n`;
            summary += `  Guild ID   : ${targetGuildId}\n`;
            summary += `${DIM}${BAR}${RST}\n`;
            summary += `${YLW}FLOOD${RST}\n`;
            summary += `  Channels Found         : ${channels.length}\n`;
            summary += `  Channels Hit           : ${r1ChannelsHit}/${channels.length}\n`;
            summary += `  Members Pinged         : ${pingCount > 0 ? `${GRN}${pingCount}${RST}` : `${DIM}0 (fetch failed)${RST}`}\n`;
            summary += `  Images per Channel     : 100\n`;
            summary += `  Images Sent            : ${GRN}${r1Sent}${RST} / ${totalAttempted} attempted\n`;
            if (r1Failed > 0) summary += `  Images Failed          : ${RED}${r1Failed}${RST}\n`;
            summary += `  Flood Time             : ${floodElapsed}s\n`;
            summary += `${DIM}${BAR}${RST}\n`;
            summary += `${YLW}REPORTS${RST}\n`;
            summary += `  Gore / Violent Shock  : ${seResults.slice(0,20).filter(Boolean).length > 0 ? GRN : RED}${seResults.slice(0,20).filter(Boolean).length}/20${RST}\n`;
            summary += `  Explicit / Sexual      : ${seResults.slice(20).filter(Boolean).length > 0 ? GRN : RED}${seResults.slice(20).filter(Boolean).length}/20${RST}\n`;
            summary += `  Total Reports Sent     : ${totalSuccess > 0 ? GRN : RED}${totalSuccess}/40${RST}${totalFailed > 0 ? `  ${RED}(${totalFailed} failed)${RST}` : ''}\n`;
            summary += `${DIM}${BAR}${RST}\n`;
            summary += wasStopped
                ? `${YLW}[!] STOPPED EARLY BY USER${RST}\n`
                : `${GRN}[✓] OPERATION COMPLETE${RST}\n`;
            summary += `\`\`\``;

            await message.edit(summary).catch(() => {});
            return;
        }

        // ── .join <invite> ────────────────────────────────────────────────────
        if (command === 'join') {
            const inviteArg = args.join(' ').trim();
            if (!inviteArg) {
                await message.reply(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}join <invite_code_or_url>\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            await message.reply('```ansi\n\u001b[1;33m[~] Joining server...\u001b[0m\n```').catch(() => {});
            const result = await BotManager.joinServer(configId, inviteArg);
            if (result.success) {
                await message.reply(`\`\`\`ansi\n\u001b[1;32m[✓] Joined: ${result.guildName}\u001b[0m\n\`\`\``).catch(() => {});
            } else {
                await message.reply(`\`\`\`ansi\n\u001b[1;31m[✗] Failed: ${result.error}\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        } catch (e: any) {
            const errMsg = String(e?.message || e).slice(0, 120);
            console.error(`[messageCreate] Unhandled error in bot ${configId}:`, errMsg);
            if (!botErrorLogs.has(configId)) botErrorLogs.set(configId, []);
            const logs = botErrorLogs.get(configId)!;
            logs.unshift({ ts: Date.now(), msg: errMsg });
            if (logs.length > 50) logs.length = 50;
        }
      });

      const LOGIN_TIMEOUT_MS = 45000;
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          client.once('ready', () => resolve());
          client.once('error', (e: Error) => reject(e));
          client.login(initialConfig.token).catch(reject);
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), LOGIN_TIMEOUT_MS)
        ),
      ]);
      activeClients.set(configId, client);
      return { success: true };
    } catch (e: any) {
      console.error(`Failed to start bot ${initialConfig.name}:`, e);
      // Clean up any partial state
      try { activeClients.get(configId)?.destroy(); } catch {}
      activeClients.delete(configId);
      clientConfigs.delete(configId);
      const msg = e?.message || String(e);
      const isHardInvalid =
        msg.includes('TOKEN_INVALID') ||
        msg.toLowerCase().includes('invalid token') ||
        msg.includes('4004');
      // Only mark isRunning=false for genuinely invalid tokens.
      // Temporary failures (timeout, rate limit, network error) leave isRunning=true
      // so the bot auto-restarts next time the server boots.
      if (isHardInvalid) {
        await storage.updateBot(configId, { isRunning: false }).catch(() => {});
      } else {
        console.warn(`[manager] Temporary failure for bot ${initialConfig.name} — keeping isRunning=true so it retries on next restart.`);
      }
      let friendly: string;
      if (isHardInvalid) {
        friendly = 'Invalid Discord token — double-check and try again.';
      } else if (msg.includes('LOGIN_TIMEOUT')) {
        friendly = 'Connection timed out — Discord did not respond in time. Check if the token is correct and try again.';
      } else if (msg.toLowerCase().includes('disallowed intents') || msg.includes('4014')) {
        friendly = 'Privileged intents are not enabled for this token.';
      } else if (msg.toLowerCase().includes('rate limit') || msg.includes('429')) {
        friendly = 'Rate limited by Discord — please wait a moment and try again.';
      } else {
        friendly = `Failed to connect: ${msg}`;
      }
      return { success: false, error: friendly };
    }
  }

  private static clearRpcInterval(botId: number) {
    const existing = rpcIntervals.get(botId);
    if (existing) {
        clearInterval(existing);
        rpcIntervals.delete(botId);
    }
  }

  private static applyRpc(client: Client, config: BotConfig) {
    if (!client.user) return;

    this.clearRpcInterval(config.id);

    const details = config.rpcTitle?.trim();
    const state = config.rpcSubtitle?.trim();
    const appName = config.rpcAppName?.trim();
    const hasRpc = appName || (details && details.length >= 2) || (state && state.length >= 2);

    // Pre-resolve presence status & mover words so even an RPC-less bot still
    // gets its chosen status and (optional) cycling custom status applied.
    const allowedStatusEarly = new Set(['online', 'idle', 'dnd', 'invisible']);
    const earlyStatus = (allowedStatusEarly.has((config.presenceStatus || '').toLowerCase())
        ? (config.presenceStatus as string).toLowerCase()
        : 'online') as 'online' | 'idle' | 'dnd' | 'invisible';
    const earlyMoverWords = (config.statusMoverWords || '')
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0);

    if (!hasRpc) {
        // Cancel any prior mover for this bot before deciding what to do.
        const prevMover = statusMoverIntervals.get(config.id);
        if (prevMover) { prevMover.stop(); statusMoverIntervals.delete(config.id); }

        if (earlyMoverWords.length === 0) {
            try {
                client.user.setPresence({ status: earlyStatus, afk: false, activities: [] });
            } catch (_) {}
            return;
        }

        // No RPC, but mover is set: drive a cycling-custom-status loop on its own.
        let moverIdx = 0;
        const apply = () => {
            if (!client.user) return;
            try {
                const cs = new CustomStatus(client).setState(earlyMoverWords[moverIdx % earlyMoverWords.length]);
                client.user.setPresence({ status: earlyStatus, afk: false, activities: [cs] });
            } catch (e) {
                console.error(`[StatusMover] setPresence failed:`, e);
            }
        };
        apply();
        let stopped = false;
        let timer: NodeJS.Timeout | null = null;
        const tick = () => {
            if (stopped) return;
            moverIdx = (moverIdx + 1) % earlyMoverWords.length;
            apply();
            if (!stopped) timer = setTimeout(tick, STATUS_MOVER_INTERVAL_MS);
        };
        timer = setTimeout(tick, STATUS_MOVER_INTERVAL_MS);
        statusMoverIntervals.set(config.id, {
            stop: () => { stopped = true; if (timer) { clearTimeout(timer); timer = null; } },
        });
        return;
    }

    const typeMap: Record<string, number> = {
        PLAYING: 0,
        STREAMING: 1,
        LISTENING: 2,
        WATCHING: 3,
        COMPETING: 5,
    };
    const rpcTypeStr = (config.rpcType?.toUpperCase() || "PLAYING");
    const rpcTypeNum = typeMap[rpcTypeStr] ?? 0;

    // ── Progress bar / seek bar ────────────────────────────────────────────
    // Values stored are seconds (start = elapsed position, end = total duration).
    // We compute fixed absolute Unix ms timestamps ONCE so Discord's client
    // naturally advances the seek bar in real time without us having to touch it.
    const rawStart = config.rpcStartTimestamp?.trim();
    const rawEnd   = config.rpcEndTimestamp?.trim();
    const startSec = rawStart ? parseFloat(rawStart) : 0;
    const endSec   = rawEnd   ? parseFloat(rawEnd)   : 0;

    let fixedTimestamps: { start: number; end?: number } | null = null;
    if (endSec > 0) {
        const now = Date.now();
        // absoluteStart = when the track "began" based on elapsed position
        const absoluteStart = Math.floor(now - startSec * 1000);
        // absoluteEnd   = when the track will finish
        const absoluteEnd   = absoluteStart + Math.floor(endSec * 1000);
        fixedTimestamps = { start: absoluteStart, end: absoluteEnd };
        console.log(`[RPC] Seek bar for ${client.user.tag}: ${startSec}s / ${endSec}s → start=${absoluteStart} end=${absoluteEnd}`);
    } else if (startSec > 0) {
        // Only a start was given → show elapsed timer (no total / no bar)
        const absoluteStart = Math.floor(Date.now() - startSec * 1000);
        fixedTimestamps = { start: absoluteStart };
    }

    // Build a RichPresence using the class (needed for correct image/asset handling)
    const buildRpc = () => {
        const rpc = new RichPresence(client)
            .setName(appName || "discord")
            .setType(rpcTypeNum as any);

        // Streaming requires a URL
        if (rpcTypeNum === 1) {
            try { rpc.setURL("https://www.twitch.tv/discord"); } catch (_) {}
        }

        if (details && details.length >= 2) rpc.setDetails(details);
        if (state   && state.length   >= 2) rpc.setState(state);

        if (fixedTimestamps) {
            if (fixedTimestamps.start) rpc.setStartTimestamp(fixedTimestamps.start);
            if (fixedTimestamps.end)   rpc.setEndTimestamp(fixedTimestamps.end);
        }

        if (config.rpcImage) {
            rpc.setAssetsLargeImage(config.rpcImage);
            if (details) rpc.setAssetsLargeText(details);
        }

        return rpc;
    };

    console.log(`[RPC] Applying for ${client.user.tag}: name="${appName}" type=${rpcTypeNum} details="${details}" state="${state}" image="${config.rpcImage}"`);

    // Resolve mover words (comma-separated) from config — empty means no mover.
    const moverWords = (config.statusMoverWords || '')
        .split(',')
        .map(w => w.trim())
        .filter(w => w.length > 0);
    const hasMover = moverWords.length > 0;

    // Validate / normalize the configured presence status.
    const allowedStatus = new Set(['online', 'idle', 'dnd', 'invisible']);
    const status = (allowedStatus.has((config.presenceStatus || '').toLowerCase())
        ? (config.presenceStatus as string).toLowerCase()
        : 'online') as 'online' | 'idle' | 'dnd' | 'invisible';

    // Cancel any pre-existing status mover for this bot (chat command or prior RPC apply).
    const existingMover = statusMoverIntervals.get(config.id);
    if (existingMover) { existingMover.stop(); statusMoverIntervals.delete(config.id); }

    let moverIdx = 0;
    const applyPresence = () => {
        if (!client.user) return;
        try {
            const activities: any[] = [];
            // RPC activity (if configured).
            activities.push(buildRpc());
            // Cycling custom status (if mover words configured).
            if (hasMover) {
                const cs = new CustomStatus(client).setState(moverWords[moverIdx % moverWords.length]);
                activities.push(cs);
            }
            client.user.setPresence({
                status,
                afk: false,
                activities,
            });
        } catch (e) {
            console.error(`[RPC] Failed to set activity for ${client.user?.tag}:`, e);
        }
    };

    applyPresence();

    if (hasMover) {
        // Single self-rescheduling timer drives both the cycling custom status and
        // (implicitly) refreshes the RPC every tick — so we don't need the 30s RPC
        // interval clobbering our custom status.
        let stopped = false;
        let timer: NodeJS.Timeout | null = null;
        const tick = () => {
            if (stopped) return;
            moverIdx = (moverIdx + 1) % moverWords.length;
            applyPresence();
            if (!stopped) timer = setTimeout(tick, STATUS_MOVER_INTERVAL_MS);
        };
        timer = setTimeout(tick, STATUS_MOVER_INTERVAL_MS);
        statusMoverIntervals.set(config.id, {
            stop: () => { stopped = true; if (timer) { clearTimeout(timer); timer = null; } },
        });
    } else {
        const interval = setInterval(applyPresence, 30000);
        rpcIntervals.set(config.id, interval);
    }
  }

  static async stopBot(id: number) {
    this.clearRpcInterval(id);
    const smi = statusMoverIntervals.get(id);
    if (smi) { smi.stop(); statusMoverIntervals.delete(id); }
    const vcConn = voiceConnections.get(id);
    if (vcConn) {
      try { vcConn.disconnect(); } catch {}
      voiceConnections.delete(id);
    }
    const wsi = websiteStatsIntervals.get(id);
    if (wsi) { clearInterval(wsi); websiteStatsIntervals.delete(id); }
    const client = activeClients.get(id);
    if (client) {
      client.destroy();
      activeClients.delete(id);
      clientConfigs.delete(id);
      botStartTimes.delete(id);
    }
    await storage.updateBot(id, { isRunning: false, lastSeen: new Date().toISOString() });
  }

  static async restartBot(id: number) {
    const bot = await storage.getBot(id);
    await this.stopBot(id);
    if (bot) {
      await this.startBot(bot);
    }
  }

  static async updateBotConfig(id: number, updates: any) {
    const updated = await storage.updateBot(id, updates);
    if (!updated) return;
    clientConfigs.set(id, updated);

    const isCurrentlyRunning = activeClients.has(id);
    const wantsRunning = updates.isRunning;

    if (wantsRunning === true && !isCurrentlyRunning) {
      console.log(`[manager] Starting bot ${id} due to isRunning=true`);
      this.startBot(updated).catch(e => console.error(`[manager] Failed to start bot ${id}:`, e));
    } else if (wantsRunning === false && isCurrentlyRunning) {
      console.log(`[manager] Stopping bot ${id} due to isRunning=false`);
      this.stopBot(id).catch(e => console.error(`[manager] Failed to stop bot ${id}:`, e));
    } else {
      const client = activeClients.get(id);
      if (client) {
        console.log(`[manager] Config updated for bot ${id}, re-applying RPC...`);
        this.applyRpc(client, updated);
      }
    }
  }

  static getLogs(id: number): Array<{ ts: number; msg: string }> {
    return botErrorLogs.get(id) || [];
  }

  static addLog(id: number, msg: string) {
    if (!botErrorLogs.has(id)) botErrorLogs.set(id, []);
    const logs = botErrorLogs.get(id)!;
    logs.unshift({ ts: Date.now(), msg: String(msg).slice(0, 200) });
    if (logs.length > 50) logs.length = 50;
  }

  static async joinAllActive(invite: string): Promise<void> {
    const code = invite
      .replace(/https?:\/\/discord\.gg\//i, '')
      .replace(/https?:\/\/discord\.com\/invite\//i, '')
      .replace(/\?.*$/, '')
      .trim();
    for (const [id, client] of activeClients) {
      if (!client || !client.user) continue;
      try {
        await fetch(`https://discord.com/api/v9/invites/${code}`, {
          method: 'POST',
          headers: {
            'Authorization': (client as any).token || '',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'X-Context-Properties': 'eyJsb2NhdGlvbiI6IkpvaW4gR3VpbGQifQ==',
          },
          body: JSON.stringify({}),
        });
        this.addLog(id, `[auto-join] Sent join request for invite ${code}`);
      } catch (e: any) {
        this.addLog(id, `[auto-join] Error: ${e?.message || e}`);
      }
      // small delay between each to avoid rate limits
      await new Promise(r => setTimeout(r, 500));
    }
  }

  static async joinServer(id: number, invite: string): Promise<{ success: boolean; error?: string; guildName?: string }> {
    const client = activeClients.get(id);
    if (!client || !client.user) return { success: false, error: 'Bot is not connected' };

    const code = invite
      .replace(/https?:\/\/discord\.gg\//i, '')
      .replace(/https?:\/\/discord\.com\/invite\//i, '')
      .replace(/\?.*$/, '')
      .trim();

    if (!code) return { success: false, error: 'Invalid invite code' };

    try {
      const inv = await (client as any).fetchInvite(code);
      const guildName = inv?.guild?.name || code;
      await inv.accept();
      this.addLog(id, `[join] Joined server: ${guildName}`);
      return { success: true, guildName };
    } catch (e1: any) {
      try {
        const res = await fetch(`https://discord.com/api/v9/invites/${code}`, {
          method: 'POST',
          headers: {
            'Authorization': (client as any).token || '',
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'X-Super-Properties': Buffer.from(JSON.stringify({ os: 'Windows', browser: 'Chrome', device: '' })).toString('base64'),
          },
          body: JSON.stringify({}),
        });
        if (res.ok || res.status === 200) {
          const data = await res.json().catch(() => ({})) as any;
          const guildName = data?.guild?.name || code;
          this.addLog(id, `[join] Joined server via API: ${guildName}`);
          return { success: true, guildName };
        }
        const errBody = await res.json().catch(() => ({})) as any;
        const errMsg = errBody?.message || `HTTP ${res.status}`;
        this.addLog(id, `[join] Failed: ${errMsg}`);
        return { success: false, error: errMsg };
      } catch (e2: any) {
        const msg = e2?.message || 'Unknown error';
        this.addLog(id, `[join] Error: ${msg}`);
        return { success: false, error: msg };
      }
    }
  }
}
