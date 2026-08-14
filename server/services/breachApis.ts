import { createHash } from "crypto";

const HIBP_BASE_URL = "https://haveibeenpwned.com/api/v3";
const PWNED_PASSWORDS_BASE_URL = "https://api.pwnedpasswords.com";
const XPOSED_BASE_URL = "https://api.xposedornot.com/v1";
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

export function isHibpEmailSearchConfigured(): boolean {
  return Boolean(process.env.HIBP_API_KEY?.trim());
}

export async function searchHibpEmail(email: string): Promise<BreachRecord[]> {
  const apiKey = process.env.HIBP_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderError(
      "HIBP email search is not configured. Add the HIBP_API_KEY secret to enable it.",
      503,
      "HIBP_API_KEY_REQUIRED",
    );
  }

  const url = `${HIBP_BASE_URL}/breachedaccount/${encodeURIComponent(email)}?truncateResponse=true`;
  const { response, data } = await fetchJson(url, {
    headers: {
      "hibp-api-key": apiKey,
    },
  });

  if (response.status === 404) return [];
  if (!response.ok) {
    const message = response.status === 401
      ? "HIBP rejected the configured API key."
      : response.status === 429
        ? "HIBP rate limit reached. Try again later."
        : getErrorMessage(data, `HIBP returned HTTP ${response.status}.`);
    throw new ProviderError(message, response.status === 429 ? 429 : 502, "HIBP_REQUEST_FAILED");
  }
  return Array.isArray(data) ? data as BreachRecord[] : [];
}

export async function listHibpBreaches(): Promise<BreachRecord[]> {
  const { response, data } = await fetchJson(`${HIBP_BASE_URL}/breaches`);
  if (!response.ok) {
    throw new ProviderError(
      getErrorMessage(data, `HIBP returned HTTP ${response.status}.`),
      502,
      "HIBP_REQUEST_FAILED",
    );
  }
  return Array.isArray(data) ? data as BreachRecord[] : [];
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