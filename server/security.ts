/**
 * security.ts — request-level security for the site.
 *
 * Features:
 *  1. IP ban list  (persistent, stored in data/banned_ips.json)
 *  2. Username/identity blocklist with leet-speak normalisation
 *  3. In-memory rate limiter (sliding window per IP)
 *  4. Admin login brute-force lockout
 *  5. Security response headers
 */

import type { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";

// ── 1. Persistent IP ban list ─────────────────────────────────────────────────

const BAN_FILE = path.resolve(process.cwd(), "data", "banned_ips.json");

function loadBannedIps(): Set<string> {
  try {
    if (fs.existsSync(BAN_FILE)) {
      const raw = fs.readFileSync(BAN_FILE, "utf-8");
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch { /* start fresh */ }
  return new Set();
}

function saveBannedIps(ips: Set<string>) {
  try {
    fs.mkdirSync(path.dirname(BAN_FILE), { recursive: true });
    fs.writeFileSync(BAN_FILE, JSON.stringify([...ips], null, 2), "utf-8");
  } catch (e) {
    console.error("[security] Failed to save banned IPs:", e);
  }
}

const bannedIps = loadBannedIps();

export function banIp(ip: string) {
  bannedIps.add(ip);
  saveBannedIps(bannedIps);
}

export function unbanIp(ip: string) {
  bannedIps.delete(ip);
  saveBannedIps(bannedIps);
}

export function getBannedIps(): string[] {
  return [...bannedIps];
}

function clientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

export function ipBanMiddleware(req: Request, res: Response, next: NextFunction) {
  const ip = clientIp(req);
  if (bannedIps.has(ip)) {
    return res.status(403).send("Access denied.");
  }
  next();
}

// ── 2. Username / identity blocklist ─────────────────────────────────────────
//
// Normalise the string (collapse leet-speak) then check for banned substrings.

const BANNED_NAMES: string[] = ["solluw", "s0lluw"];

function normaliseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/[@]/g, "a")
    .replace(/[^a-z]/g, "");
}

export function isBannedIdentity(name: string): boolean {
  const norm = normaliseName(name);
  return BANNED_NAMES.some(b => norm.includes(normaliseName(b)));
}

// ── 3. In-memory sliding-window rate limiter ──────────────────────────────────

interface WindowEntry {
  timestamps: number[];
}

const rateLimitWindows = new Map<string, WindowEntry>();

/**
 * Returns a middleware that allows at most `max` requests per `windowMs` per IP.
 * Exceeding the limit returns 429.
 */
export function rateLimit(opts: { windowMs: number; max: number; message?: string }) {
  const { windowMs, max, message = "Too many requests — slow down." } = opts;

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = clientIp(req);
    const now = Date.now();
    const cutoff = now - windowMs;

    let entry = rateLimitWindows.get(ip);
    if (!entry) {
      entry = { timestamps: [] };
      rateLimitWindows.set(ip, entry);
    }

    // Evict old timestamps
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);

    if (entry.timestamps.length >= max) {
      res.setHeader("Retry-After", Math.ceil(windowMs / 1000).toString());
      return res.status(429).json({ message });
    }

    entry.timestamps.push(now);
    next();
  };
}

// Cleanup stale entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000; // 1 hour
  for (const [ip, entry] of rateLimitWindows) {
    if (entry.timestamps.every(t => t < cutoff)) rateLimitWindows.delete(ip);
  }
}, 10 * 60 * 1000);

// ── 4. Admin login brute-force lockout ───────────────────────────────────────

interface LockoutEntry {
  failures: number;
  lockedUntil: number;
}

const adminLockouts = new Map<string, LockoutEntry>();

const MAX_ADMIN_FAILURES  = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function checkAdminLockout(ip: string): { locked: boolean; retryAfterMs?: number } {
  const entry = adminLockouts.get(ip);
  if (!entry) return { locked: false };
  if (Date.now() < entry.lockedUntil) {
    return { locked: true, retryAfterMs: entry.lockedUntil - Date.now() };
  }
  return { locked: false };
}

export function recordAdminFailure(ip: string) {
  const entry = adminLockouts.get(ip) || { failures: 0, lockedUntil: 0 };
  entry.failures += 1;
  if (entry.failures >= MAX_ADMIN_FAILURES) {
    entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
  }
  adminLockouts.set(ip, entry);
}

export function clearAdminFailures(ip: string) {
  adminLockouts.delete(ip);
}

// ── 5. Security response headers ──────────────────────────────────────────────

export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
}
