import { createHash } from "crypto";

const PWNED_PASSWORDS_BASE_URL = "https://api.pwnedpasswords.com";
const XPOSED_BASE_URL = "https://api.xposedornot.com/v1";
const PUBLIC_EMAIL_BREACH_URL = "https://api.xposedornot.com/v1/check-email";
const USER_AGENT = "bothost-security-monitor/1.0";

export type BreachRecord = {
  Name?: string;
  Title?: string;
  Domain?: string;
  BreachDate?: string;
  AddedDate?: string;
  ModifiedDate?: string;
  PwnCount?: number;
  DataClasses?: string[];
  IsVerified?: boolean;
  IsSensitive?: boolean;
  [key: string]: unknown;
};

export type XposedBreach = {
  breachID?: string;
  breachedDate?: string;
  addedDate?: string;
  domain?: string;
  exposedData?: string[];
  exposedRecords?: number;
  exposureDescription?: string;
  industry?: string;
  logo?: string;
  passwordRisk?: string;
  referenceURL?: string;
  searchable?: boolean;
  sensitive?: boolean;
  verified?: boolean;
  [key: string]: unknown;
};

export type PublicProfile = {
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

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<{ response: Response; data: unknown }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/json",
        ...(init.headers || {}),
      },
    });
    const text = await response.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return { response, data };
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new ProviderError("The security provider timed out. Try again.", 504, "PROVIDER_TIMEOUT");
    }
    throw new ProviderError("The security provider is unavailable. Try again.", 502, "PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * XposedOrNot exposes a public email check endpoint that does not require an
 * API key. Keep this separate from the legacy HIBP implementation so the
 * dashboard never needs a provider secret just to check an address.
 */
export async function searchPublicEmailBreaches(email: string): Promise<BreachRecord[]> {
  const { response, data } = await fetchJson(`${PUBLIC_EMAIL_BREACH_URL}/${encodeURIComponent(email)}`);
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new ProviderError(
      getErrorMessage(data, `The public breach service returned HTTP ${response.status}.`),
      502,
      "PUBLIC_EMAIL_BREACH_REQUEST_FAILED",
    );
  }

  if (!data || typeof data !== "object") return [];
  const payload = data as Record<string, unknown>;
  const values = payload.breaches ?? payload.exposedBreaches ?? payload.Breaches;
  if (!Array.isArray(values)) return [];

  const normalized: BreachRecord[] = [];
  const visit = (entry: unknown) => {
    if (Array.isArray(entry)) {
      entry.forEach(visit);
    } else if (typeof entry === "string" && entry.trim()) {
      normalized.push({ Name: entry.trim(), Title: entry.trim() });
    } else if (entry && typeof entry === "object") {
      normalized.push(entry as BreachRecord);
    }
  };
  values.forEach(visit);
  return normalized;
}

async function fetchPublicJson(url: string, headers: Record<string, string> = {}) {
  return fetchJson(url, { headers });
}

export async function searchPublicUsername(username: string): Promise<PublicProfile[]> {
  const safeUsername = encodeURIComponent(username);
  const [github, reddit] = await Promise.allSettled([
    fetchPublicJson(`https://api.github.com/users/${safeUsername}`, {
      accept: "application/vnd.github+json",
    }),
    fetchPublicJson(`https://www.reddit.com/user/${safeUsername}/about.json`, {
      accept: "application/json",
    }),
  ]);

  const profiles: PublicProfile[] = [];

  if (github.status === "fulfilled" && github.value.response.ok && github.value.data && typeof github.value.data === "object") {
    const data = github.value.data as Record<string, unknown>;
    profiles.push({
      platform: "GitHub",
      username: String(data.login || username),
      profileUrl: String(data.html_url || `https://github.com/${safeUsername}`),
      displayName: typeof data.name === "string" ? data.name : undefined,
      bio: typeof data.bio === "string" ? data.bio : undefined,
      avatarUrl: typeof data.avatar_url === "string" ? data.avatar_url : undefined,
      website: typeof data.blog === "string" ? data.blog : undefined,
      location: typeof data.location === "string" ? data.location : undefined,
      company: typeof data.company === "string" ? data.company : undefined,
      followers: typeof data.followers === "number" ? data.followers : undefined,
      publicRepos: typeof data.public_repos === "number" ? data.public_repos : undefined,
    });
  }

  if (reddit.status === "fulfilled" && reddit.value.response.ok && reddit.value.data && typeof reddit.value.data === "object") {
    const payload = reddit.value.data as Record<string, any>;
    const data = payload.data && typeof payload.data === "object" ? payload.data : payload;
    if (data.name || data.id) {
      profiles.push({
        platform: "Reddit",
        username: String(data.name || username),
        profileUrl: `https://www.reddit.com/user/${encodeURIComponent(String(data.name || username))}/`,
        displayName: typeof data.subreddit?.title === "string" ? data.subreddit.title : undefined,
        bio: typeof data.subreddit?.public_description === "string" ? data.subreddit.public_description : undefined,
        avatarUrl: typeof data.icon_img === "string" ? data.icon_img : undefined,
      });
    }
  }

  return profiles;
}

export async function lookupWebsiteDns(domain: string): Promise<{
  domain: string;
  records: Array<{ type: string; value: string; ttl?: number }>;
}> {
  const recordTypes = ["A", "AAAA", "MX", "CNAME", "TXT"];
  const results = await Promise.allSettled(recordTypes.map(async (type) => {
    const { response, data } = await fetchPublicJson(
      `https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=${type}`,
    );
    if (!response.ok || !data || typeof data !== "object") return [];
    const answers = Array.isArray((data as { Answer?: unknown }).Answer)
      ? (data as { Answer: Array<{ type?: number; data?: string; TTL?: number }> }).Answer
      : [];
    return answers.map(answer => ({
      type,
      value: String(answer.data || ""),
      ttl: typeof answer.TTL === "number" ? answer.TTL : undefined,
    })).filter(answer => answer.value);
  }));

  return {
    domain,
    records: results.flatMap(result => result.status === "fulfilled" ? result.value : []),
  };
}

export async function checkPwnedPasswordHash(hashPrefix: string, hashSuffix: string): Promise<{ count: number }> {
  const prefix = hashPrefix.toUpperCase();
  const suffix = hashSuffix.toUpperCase();
  if (!/^[A-F0-9]{5}$/.test(prefix) || !/^[A-F0-9]{35}$/.test(suffix)) {
    throw new ProviderError("Invalid password hash format.", 400, "INVALID_HASH");
  }

  const { response, data } = await fetchJson(`${PWNED_PASSWORDS_BASE_URL}/range/${prefix}`, {
    headers: {
      "add-padding": "true",
    },
  });
  if (!response.ok) {
    throw new ProviderError(
      getErrorMessage(data, `HIBP returned HTTP ${response.status}.`),
      502,
      "HIBP_REQUEST_FAILED",
    );
  }

  const line = typeof data === "string"
    ? data.split(/\r?\n/).find(item => item.toUpperCase().startsWith(`${suffix}:`))
    : undefined;
  const count = line ? Number.parseInt(line.split(":")[1] || "0", 10) : 0;
  return { count: Number.isFinite(count) ? count : 0 };
}

export async function searchXposedBreaches(filters: { domain?: string; breachId?: string }): Promise<XposedBreach[]> {
  const params = new URLSearchParams();
  if (filters.domain) params.set("domain", filters.domain);
  if (filters.breachId) params.set("breach_id", filters.breachId);
  const query = params.toString();
  const { response, data } = await fetchJson(`${XPOSED_BASE_URL}/breaches${query ? `?${query}` : ""}`);
  if (!response.ok) {
    throw new ProviderError(
      getErrorMessage(data, `XposedOrNot returned HTTP ${response.status}.`),
      502,
      "XPOSED_REQUEST_FAILED",
    );
  }
  if (Array.isArray(data)) return data as XposedBreach[];
  if (data && typeof data === "object" && Array.isArray((data as { exposedBreaches?: unknown }).exposedBreaches)) {
    return (data as { exposedBreaches: XposedBreach[] }).exposedBreaches;
  }
  return [];
}

export function sha1PasswordParts(password: string): { prefix: string; suffix: string } {
  const digest = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}