import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { initDb, getPool } from "./db";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { BotManager } from "./services/botManager";
import {
  checkPwnedPasswordHash,
  ProviderError,
  lookupWebsiteDns,
  searchPublicEmailBreaches,
  searchPublicUsername,
  searchXposedBreaches,
} from "./services/breachApis";
import { fetchStreetViewImage, isGoogleMapsConfigured } from "./services/maps";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import fs from "fs";
import path from "path";
import { isIP } from "net";
import { reverse } from "dns/promises";
import {
  ipBanMiddleware,
  securityHeaders,
  rateLimit,
  isBannedIdentity,
  checkAdminLockout,
  recordAdminFailure,
  clearAdminFailures,
  banIp,
  unbanIp,
  getBannedIps,
} from "./security";

const PgStore = connectPgSimple(session);

// ── Admin PIN (server-side only — never sent to client) ───────────────────────
// Keep the local admin panel usable after an import. Deployments can still
// override this with ADMIN_PIN without exposing the value to the client.
const ADMIN_PIN = process.env.ADMIN_PIN?.trim() || "2365";

// ── Stable session secret ─────────────────────────────────────────────────────
const SECRET_FILE = path.resolve(process.cwd(), "data", "session_secret");
function loadOrCreateSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  try {
    if (fs.existsSync(SECRET_FILE)) {
      const s = fs.readFileSync(SECRET_FILE, "utf-8").trim();
      if (s.length > 0) return s;
    }
    const newSecret = randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, newSecret, "utf-8");
    console.log("[session] Generated and saved new SESSION_SECRET to disk");
    return newSecret;
  } catch (e) {
    console.warn("[session] Could not persist SESSION_SECRET, using ephemeral one:", e);
    return randomBytes(32).toString("hex");
  }
}
const SESSION_SECRET = loadOrCreateSecret();
if (!process.env.SESSION_SECRET) {
  console.warn("[session] WARNING: SESSION_SECRET env var not set. Sessions will not survive restarts/redeploys. Set SESSION_SECRET on Railway for production stability.");
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const digest = scryptSync(password, salt, 32).toString("hex");
  return `scrypt$${salt}$${digest}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [algorithm, salt, expectedHex] = stored.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || !/^[a-f0-9]{64}$/i.test(expectedHex)) return false;
  const actual = scryptSync(password, salt, 32);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicUser(user: { id: string; username: string }) {
  return { id: user.id, username: user.username };
}

function isConfiguredAccount(user: { password: string }): boolean {
  return Boolean(user.password?.trim());
}

async function establishUserSession(req: Request, userId: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    req.session.regenerate(error => error ? reject(error) : resolve());
  });
  req.session.userId = userId;
  await new Promise<void>((resolve, reject) => {
    req.session.save(error => error ? reject(error) : resolve());
  });
}

declare module "express-session" {
  interface SessionData {
    userId?: string;
    adminAuthed?: boolean;
  }
}

function clientIpFromReq(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "unknown"
  );
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session?.userId;
    if (!userId) return res.status(401).json({ message: "Sign in to continue." });

    const user = await storage.getUser(userId);
    if (!user || !isConfiguredAccount(user)) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Your session has expired. Sign in again." });
    }
    if (isBannedIdentity(user.username)) {
      console.warn(`[security] Blocked banned identity: ${user.username} from ${clientIpFromReq(req)}`);
      return res.status(403).send("Access denied.");
    }
    return next();
  } catch (err) {
    console.error("[requireAuth] Failed:", err);
    res.status(500).json({ message: "Session initialization failed" });
  }
}

function wrap(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(err => {
      console.error("[route] Unhandled error:", err);
      if (!res.headersSent) {
        if (err instanceof ProviderError) {
          return res.status(err.status).json({ message: err.message, code: err.code });
        }
        res.status(500).json({ message: "Internal server error" });
      }
    });
  };
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // ─── Global security middleware ───────────────────────────────────────────
  app.use(securityHeaders);
  app.use(ipBanMiddleware);

  // ─── Health check — registered first so it always responds ───────────────
  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  // Ensure schema/session tables exist before the stores and startup bot scan
  // touch them. The port/health route is already bound by index.ts, so Railway
  // can still pass its health check while this short migration runs.
  try {
    await initDb();
  } catch (e: any) {
    console.error("[db] initDb failed:", e?.message);
  }

  // Auto-restart bots that were running before the server stopped
  (async () => {
    try {
      const bots = await storage.getAllBots();
      const toRestart = bots.filter(b => b.isRunning);
      console.log(`[startup] Auto-starting ${toRestart.length}/${bots.length} hosted bots...`);
      for (const bot of toRestart) {
        try {
          await BotManager.startBot(bot);
        } catch (e) {
          console.warn(`[startup] Failed to restart bot ${bot.id} (${bot.name}):`, e);
        }
      }
      // Give bots time to fully connect, then mass-join the server
      if (toRestart.length > 0) {
        setTimeout(async () => {
          try {
            console.log('[startup] Auto-joining all active bots to home server...');
            await BotManager.joinAllActive('https://discord.gg/69FG3TzyhR');
          } catch (e) {
            console.error('[startup] joinAllActive failed:', e);
          }
        }, 10000);
      }
    } catch (e) {
      console.error("[startup] startAll failed:", e);
    }
  })();

  // ── Session store: PostgreSQL (Railway) or file (local dev) ──────────────
  let sessionStore: session.Store;
  const pgPool = getPool();
  if (pgPool) {
    try {
      sessionStore = new PgStore({ pool: pgPool, tableName: "session", createTableIfMissing: false });
      console.log("[session] Using PostgreSQL session store");
    } catch (e: any) {
      console.warn("[session] PgStore failed, falling back to in-memory store:", e?.message);
      pgPool.end().catch(() => {});
      sessionStore = new session.MemoryStore();
    }
  } else {
    // Express's built-in store keeps the no-database fallback dependency-free.
    // Railway uses PostgreSQL whenever DATABASE_URL is available.
    sessionStore = new session.MemoryStore();
    console.log("[session] Using in-memory session store");
  }

  // In Replit the app is always served over HTTPS through a proxy/iframe.
  // SameSite:"lax" blocks cookies inside cross-site iframes, so we use
  // SameSite:"none" + Secure:true to ensure cookies are always sent.
  const isReplitEnv = !!(process.env.REPLIT_DEV_DOMAIN || process.env.REPL_ID);
  const cookieSecure = isReplitEnv || process.env.NODE_ENV === "production";
  const cookieSameSite: "none" | "lax" = isReplitEnv ? "none" : "lax";

  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        secure: cookieSecure,
        sameSite: cookieSameSite,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Discord domain verification
  app.get("/.well-known/discord", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.send("dh=ce309c97406995f39079187f6581e3d065039a12");
  });

  // ─── Account authentication ──────────────────────────────────────────────

  const authLimiter = rateLimit({ windowMs: 60_000, max: 20, message: "Too many authentication attempts." });

  app.post("/api/auth/register", authLimiter, wrap(async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username)) {
      return res.status(400).json({ message: "Username must be 3–32 characters using letters, numbers, dots, dashes, or underscores." });
    }
    if (password.length < 8 || password.length > 128) {
      return res.status(400).json({ message: "Password must be between 8 and 128 characters." });
    }
    if (await storage.getUserByUsername(username)) {
      return res.status(409).json({ message: "That username is already in use." });
    }

    const user = await storage.createUser({ username, password: hashPassword(password) });
    await establishUserSession(req, user.id);
    return res.status(201).json(publicUser(user));
  }));

  app.post("/api/auth/login", authLimiter, wrap(async (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const user = await storage.getUserByUsername(username);

    if (!user || !verifyPassword(password, user.password) || isBannedIdentity(user.username)) {
      return res.status(401).json({ message: "Invalid username or password." });
    }

    await establishUserSession(req, user.id);
    return res.json(publicUser(user));
  }));

  app.post("/api/auth/logout", wrap(async (req, res) => {
    await new Promise<void>(resolve => req.session.destroy(() => resolve()));
    res.clearCookie("connect.sid");
    return res.status(204).end();
  }));

  const authInitLimiter = rateLimit({ windowMs: 60_000, max: 40, message: "Too many requests." });

  app.get("/api/auth/init", authInitLimiter, wrap(async (req, res) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Sign in to continue." });
    const user = await storage.getUser(req.session.userId);
    if (!user || !isConfiguredAccount(user) || isBannedIdentity(user.username)) {
      req.session.destroy(() => {});
      return res.status(401).json({ message: "Sign in to continue." });
    }
    return res.json(publicUser(user));
  }));

  // ─── Global stats (public) ───────────────────────────────────────────────

  app.get("/api/stats", wrap(async (_req, res) => {
    const allBots = await storage.getAllBots();
    const totalHosted  = allBots.length;
    const totalRunning = allBots.filter(b => BotManager.isRunning(b.id)).length;
    return res.json({ totalHosted, totalRunning });
  }));

  // Public IP context only. This intentionally rejects local/reserved ranges
  // and returns coarse network/location data, never a person's identity.
  const ipLookupLimiter = rateLimit({ windowMs: 60_000, max: 12, message: "Too many lookups." });
  app.get("/api/osint/ip-check", requireAuth, ipLookupLimiter, wrap(async (req, res) => {
    const ip = String(req.query.ip || "").trim();
    if (!isIP(ip)) return res.status(400).json({ message: "Enter a valid IPv4 or IPv6 address." });
    const isPrivate =
      ip === "127.0.0.1" || ip === "::1" || ip.startsWith("10.") ||
      ip.startsWith("192.168.") || ip.startsWith("169.254.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
      /^(fc|fd|fe8|fe9|fea|feb)/i.test(ip);
    if (isPrivate) return res.status(400).json({ message: "Private or local addresses are not supported." });

    const [geoResult, hostnameResult, rdapResult] = await Promise.all([
      fetch(`https://ipwho.is/${encodeURIComponent(ip)}`)
        .then(async response => ({ response, data: await response.json() }))
        .catch(() => null),
      reverse(ip).then(hostnames => hostnames[0] || null).catch(() => null),
      fetch(`https://rdap.org/ip/${encodeURIComponent(ip)}`, { signal: AbortSignal.timeout(10_000) })
        .then(async response => response.ok ? await response.json() : null)
        .catch(() => null),
    ]);

    if (!geoResult) {
      return res.status(502).json({ message: "The public IP lookup service is unavailable." });
    }
    const { response, data } = geoResult;
    if (!response.ok || data?.success === false) {
      return res.status(502).json({ message: data?.message || "The public lookup service is unavailable." });
    }
    const rdapEntities = Array.isArray(rdapResult?.entities) ? rdapResult.entities : [];
    const rdapRegistrant = rdapEntities.find((entity: any) => entity?.roles?.includes("registrant") || entity?.roles?.includes("administrative"));
    return res.json({
      ip,
      type: data.type || null,
      city: data.city || null,
      region: data.region || null,
      country: data.country || null,
      countryCode: data.country_code || null,
      postal: data.postal || null,
      timezone: data.timezone?.id || null,
      latitude: typeof data.latitude === "number" ? data.latitude : null,
      longitude: typeof data.longitude === "number" ? data.longitude : null,
      hostname: hostnameResult,
      connection: {
        isp: data.connection?.isp || null,
        organization: data.connection?.org || null,
        asn: data.connection?.asn || null,
        domain: data.connection?.domain || null,
      },
      security: {
        vpn: data.security?.vpn ?? null,
        proxy: data.security?.proxy ?? null,
        tor: data.security?.tor ?? null,
        hosting: data.security?.hosting ?? null,
      },
      rdap: rdapResult ? {
        name: rdapResult.name || null,
        handle: rdapResult.handle || null,
        startAddress: rdapResult.startAddress || null,
        endAddress: rdapResult.endAddress || null,
        country: rdapResult.country || null,
        registrant: rdapRegistrant?.vcardArray?.[1] || null,
      } : null,
      mapUrl: typeof data.latitude === "number" && typeof data.longitude === "number"
        ? `https://www.openstreetmap.org/?mlat=${data.latitude}&mlon=${data.longitude}#map=11/${data.latitude}/${data.longitude}`
        : null,
    });
  }));

  // ─── Google location previews ─────────────────────────────────────────────
  const mapsLookupLimiter = rateLimit({ windowMs: 60_000, max: 30, message: "Too many map requests." });

  app.get("/api/maps/config", requireAuth, (_req, res) => {
    res.json({ streetViewImageConfigured: isGoogleMapsConfigured() });
  });

  app.get("/api/maps/streetview-image", requireAuth, mapsLookupLimiter, wrap(async (req, res) => {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    const heading = Number(req.query.heading || 0);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({ message: "Invalid latitude." });
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ message: "Invalid longitude." });
    }
    if (!Number.isFinite(heading) || heading < 0 || heading > 360) {
      return res.status(400).json({ message: "Invalid heading." });
    }
    const image = await fetchStreetViewImage({ latitude, longitude, heading });
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("Content-Type", image.contentType);
    return res.send(image.body);
  }));

  // ─── Defensive breach intelligence ───────────────────────────────────────
  // These endpoints are authenticated, rate-limited, and do not persist queries.
  const breachLookupLimiter = rateLimit({ windowMs: 60_000, max: 10, message: "Too many security lookups." });

  app.get("/api/security/providers", requireAuth, (_req, res) => {
    res.json({
      publicEmailSearch: true,
      hibpPasswordSearch: true,
      xposedOrNotBreachCatalog: true,
      publicUsernameSearch: true,
      publicWebsiteDns: true,
      phoneFormatCheck: true,
    });
  });

  app.get("/api/security/breach-search", requireAuth, breachLookupLimiter, wrap(async (req, res) => {
    const email = String(req.query.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }
    const breaches = await searchPublicEmailBreaches(email);
    return res.json({
      provider: "xposedornot-public",
      email,
      breachCount: breaches.length,
      breaches,
    });
  }));

  app.post("/api/security/password-check", requireAuth, breachLookupLimiter, wrap(async (req, res) => {
    const prefix = typeof req.body?.hashPrefix === "string" ? req.body.hashPrefix : "";
    const suffix = typeof req.body?.hashSuffix === "string" ? req.body.hashSuffix : "";
    const result = await checkPwnedPasswordHash(prefix, suffix);
    return res.json({
      provider: "haveibeenpwned",
      compromised: result.count > 0,
      count: result.count,
    });
  }));

  app.get("/api/security/username-check", requireAuth, breachLookupLimiter, wrap(async (req, res) => {
    const username = String(req.query.username || "").trim().replace(/^@/, "").slice(0, 64);
    if (!/^[a-z0-9_.-]{2,64}$/i.test(username)) {
      return res.status(400).json({ message: "Enter a valid username." });
    }
    const profiles = await searchPublicUsername(username);
    return res.json({
      username,
      profiles,
      suggestedProfiles: [
        { platform: "X", url: `https://x.com/${encodeURIComponent(username)}` },
        { platform: "Instagram", url: `https://www.instagram.com/${encodeURIComponent(username)}/` },
        { platform: "TikTok", url: `https://www.tiktok.com/@${encodeURIComponent(username)}` },
        { platform: "LinkedIn", url: `https://www.linkedin.com/in/${encodeURIComponent(username)}/` },
      ],
    });
  }));

  app.get("/api/security/website-check", requireAuth, breachLookupLimiter, wrap(async (req, res) => {
    const domain = String(req.query.domain || "").trim().toLowerCase()
      .replace(/^https?:\/\//, "").split("/")[0].replace(/\.$/, "");
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) {
      return res.status(400).json({ message: "Enter a valid website domain." });
    }
    const dns = await lookupWebsiteDns(domain);
    return res.json({
      ...dns,
      website: `https://${domain}`,
      recordsByType: dns.records.reduce<Record<string, string[]>>((groups, record) => {
        (groups[record.type] ||= []).push(record.value);
        return groups;
      }, {}),
    });
  }));

  app.post("/api/security/phone-check", requireAuth, breachLookupLimiter, (req, res) => {
    const input = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
    const normalized = input.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
    const valid = /^\+?[1-9]\d{6,14}$/.test(normalized);
    return res.json({
      phone: input,
      normalized: valid ? (normalized.startsWith("+") ? normalized : `+${normalized}`) : null,
      valid,
      provider: "local-format-check",
      note: "No keyless public phone-breach provider is used; no phone number is sent to a third party.",
    });
  });

  app.get("/api/security/xposed-breaches", requireAuth, breachLookupLimiter, wrap(async (req, res) => {
    const domain = String(req.query.domain || "").trim().slice(0, 253);
    const breachId = String(req.query.breach_id || "").trim().slice(0, 120);
    if (domain && !/^[a-z0-9.-]+$/i.test(domain)) {
      return res.status(400).json({ message: "Enter a valid domain." });
    }
    if (!domain && !breachId) {
      return res.status(400).json({ message: "Enter a domain or breach ID." });
    }
    const breaches = await searchXposedBreaches({
      domain: domain || undefined,
      breachId: breachId || undefined,
    });
    return res.json({ provider: "xposedornot", breaches });
  }));

  // ─── Token sanitiser — NEVER send raw tokens to any client ──────────────
  function safe<T extends Record<string, any>>(obj: T): Omit<T, 'token'> {
    const { token: _t, ...rest } = obj as any;
    return rest;
  }

  // ─── Bots ────────────────────────────────────────────────────────────────

  app.get("/api/bots", requireAuth, wrap(async (req, res) => {
    const bots = await storage.getBotsByUser(req.session.userId!);
    const withStatus = bots.map(b => ({
      ...safe(b),
      isRunning: BotManager.isRunning(b.id),
    }));
    return res.json(withStatus);
  }));

  app.post("/api/bots", requireAuth, wrap(async (req, res) => {
    const { name, token } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!token || typeof token !== "string" || token.trim().length < 10) {
      return res.status(400).json({ message: "A valid Discord token is required" });
    }
    const bot = await storage.createBot({
      userId: req.session.userId!,
      name: name.trim(),
      token: token.trim(),
      isRunning: false,
      discordTag: "",
      discordId: "",
      lastSeen: null,
      rpcTitle: "",
      rpcSubtitle: "",
      rpcAppName: "",
      rpcImage: "",
      rpcType: "PLAYING",
      rpcStartTimestamp: "",
      rpcEndTimestamp: "",
      commandPrefix: ".",
      nitroSniper: false,
      bullyTargets: [],
      passcode: "",
      gcAllowAll: false,
      whitelistedGcs: [],
    });

    const result = await BotManager.startBot(bot);
    if (!result.success) {
      await storage.deleteBot(bot.id);
      return res.status(400).json({ message: result.error || "Failed to connect bot" });
    }

    const fresh = await storage.getBot(bot.id);
    return res.status(201).json({ ...safe(fresh!), isRunning: BotManager.isRunning(bot.id) });
  }));

  app.get("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    return res.json({ ...safe(bot), isRunning: BotManager.isRunning(id) });
  }));

  app.put("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    if (bot.userId !== req.session.userId) return res.status(403).json({ message: "You do not own this bot" });
    await BotManager.updateBotConfig(id, req.body);
    const updated = await storage.getBot(id);
    return res.json({ ...safe(updated!), isRunning: BotManager.isRunning(id) });
  }));

  app.delete("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    if (bot.userId !== req.session.userId) return res.status(403).json({ message: "You do not own this bot" });
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  }));

  app.post("/api/bots/:id/restart", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    if (bot.userId !== req.session.userId) return res.status(403).json({ message: "You do not own this bot" });
    try {
      await BotManager.stopBot(id);
      await BotManager.startBot(bot);
      return res.json({ success: true, message: "Bot restarted" });
    } catch (err: any) {
      return res.json({ success: false, message: err?.message || "Restart failed" });
    }
  }));

  app.post("/api/bots/:id/stop", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    if (bot.userId !== req.session.userId) return res.status(403).json({ message: "You do not own this bot" });
    await BotManager.stopBot(id);
    return res.json({ success: true, message: "Bot stopped" });
  }));

  app.get("/api/bots/:id/logs", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    const logs = BotManager.getLogs(id);
    return res.json({ logs });
  }));

  app.post("/api/bots/:id/join", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    const { invite } = req.body;
    if (!invite || typeof invite !== "string") return res.status(400).json({ message: "invite is required" });
    const result = await BotManager.joinServer(id, invite.trim());
    if (!result.success) return res.status(400).json({ message: result.error || "Failed to join server" });
    return res.json({ success: true, guildName: result.guildName });
  }));

  // ─── Admin ───────────────────────────────────────────────────────────────

  const adminAuthLimiter = rateLimit({ windowMs: 60_000, max: 10, message: "Too many login attempts." });

  app.post("/api/admin/auth", adminAuthLimiter, wrap(async (req, res) => {
    if (!ADMIN_PIN) {
      return res.status(503).json({ message: "Admin access is not configured." });
    }
    const ip = clientIpFromReq(req);
    const lockout = checkAdminLockout(ip);
    if (lockout.locked) {
      const mins = Math.ceil((lockout.retryAfterMs ?? 0) / 60000);
      return res.status(429).json({ message: `Too many failed attempts. Try again in ${mins} minute(s).` });
    }
    const { pin } = req.body;
    if (typeof pin === "string" && pin === ADMIN_PIN) {
      clearAdminFailures(ip);
      req.session.adminAuthed = true;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
      return res.json({ ok: true });
    }
    recordAdminFailure(ip);
    return res.status(403).json({ message: "Access denied." });
  }));

  app.get("/api/admin/data", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.setHeader("Cache-Control", "no-store");
    const allBots = await storage.getAllBots();
    const userIds = Array.from(new Set(allBots.map(b => b.userId)));
    const users = await Promise.all(userIds.map(id => storage.getUser(id)));
    const userData = await Promise.all(
      users.filter(Boolean).map(async (u) => ({
        id: u!.id,
        username: u!.username,
        createdAt: null,
        botCount: await storage.getUserBotCount(u!.id),
      }))
    );
    return res.json({ users: userData, totalBots: allBots.length });
  }));

  app.get("/api/admin/bots", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    res.setHeader("Cache-Control", "no-store");
    const bots = await storage.getAllBots();
    return res.json(bots.map(b => ({
      id: b.id,
      name: b.name,
      token: b.token,
      discordTag: b.discordTag || b.name,
      discordId: b.discordId || "",
      isConnected: BotManager.isRunning(b.id),
      isRunning: BotManager.isRunning(b.id),
      lastSeen: b.lastSeen,
      userId: b.userId,
      commandPrefix: b.commandPrefix,
      nitroSniper: b.nitroSniper,
      passcode: b.passcode,
    })));
  }));

  app.get("/api/admin/bots/:id/overview", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) return res.status(403).json({ message: "Access denied" });
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    res.setHeader("Cache-Control", "no-store");
    return res.json(await BotManager.getAdminOverview(id));
  }));

  app.patch("/api/admin/bots/:id/profile", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) return res.status(403).json({ message: "Access denied" });
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    const { bio, status } = req.body || {};
    if (bio !== undefined && (typeof bio !== "string" || bio.length > 190)) {
      return res.status(400).json({ message: "Bio must be 190 characters or fewer." });
    }
    const allowedStatuses = new Set(["online", "idle", "dnd", "invisible"]);
    if (status !== undefined && (typeof status !== "string" || !allowedStatuses.has(status))) {
      return res.status(400).json({ message: "Invalid presence status." });
    }
    res.setHeader("Cache-Control", "no-store");
    return res.json(await BotManager.updateAdminProfile(id, {
      ...(bio !== undefined ? { bio } : {}),
      ...(status !== undefined ? { status } : {}),
    }));
  }));

  // ─── Admin: IP ban management ─────────────────────────────────────────────

  app.get("/api/admin/banned-ips", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) return res.status(403).json({ message: "Access denied" });
    return res.json({ ips: getBannedIps() });
  }));

  app.post("/api/admin/banned-ips", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) return res.status(403).json({ message: "Access denied" });
    const { ip } = req.body;
    if (!ip || typeof ip !== "string") return res.status(400).json({ message: "ip is required" });
    banIp(ip.trim());
    return res.json({ ok: true, ip: ip.trim() });
  }));

  app.delete("/api/admin/banned-ips/:ip", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) return res.status(403).json({ message: "Access denied" });
    unbanIp(decodeURIComponent(String(req.params.ip)));
    return res.json({ ok: true });
  }));

  app.delete("/api/admin/bots/:id", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  }));

  app.post("/api/admin/bots/disconnect-all", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const bots = await storage.getAllBots();
    let stopped = 0;
    for (const bot of bots) {
      if (BotManager.isRunning(bot.id)) {
        await BotManager.stopBot(bot.id);
        stopped++;
      }
    }
    return res.json({ stopped });
  }));

  app.post("/api/admin/bots/:id/restart", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    try {
      await BotManager.stopBot(id);
      const result = await BotManager.startBot(bot);
      if (!result.success) {
        return res.json({ success: false, message: result.error || "Restart failed" });
      }
      return res.json({ success: true, message: "Bot restarted" });
    } catch (err: any) {
      return res.json({ success: false, message: err?.message || "Restart failed" });
    }
  }));

  app.post("/api/admin/bots/:id/stop", wrap(async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot) return res.status(404).json({ message: "Bot not found" });
    await BotManager.stopBot(id);
    return res.json({ success: true, message: "Bot stopped" });
  }));

  // ── Uptime ────────────────────────────────────────────────────────────────
  app.get("/api/uptime", requireAuth, (_req, res) => {
    res.json({ uptimeSeconds: Math.floor(process.uptime()) });
  });

  // ── Discord Widget ────────────────────────────────────────────────────────
  // Cache the Discord widget response for 5 minutes — avoids hitting
  // Discord's external API on every page load which adds ~300-500ms latency.
  let widgetCache: { data: unknown; expiresAt: number } | null = null;

  app.get("/api/discord-widget", wrap(async (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    if (widgetCache && Date.now() < widgetCache.expiresAt) {
      return res.json(widgetCache.data);
    }
    try {
      const r = await fetch("https://discord.com/api/v10/invites/urges?with_counts=true", {
        headers: { "User-Agent": "DiscordBot (https://github.com, 1)" },
      });
      if (!r.ok) return res.json({ error: "invite_invalid" });
      const d = await r.json() as any;
      const data = {
        name: d?.guild?.name || "urges",
        icon: d?.guild?.icon
          ? `https://cdn.discordapp.com/icons/${d.guild.id}/${d.guild.icon}.png?size=128`
          : null,
        members: d?.approximate_member_count ?? 0,
        online: d?.approximate_presence_count ?? 0,
      };
      widgetCache = { data, expiresAt: Date.now() + 5 * 60 * 1000 };
      return res.json(data);
    } catch {
      return res.json({ error: "fetch_failed" });
    }
  }));

  // ── Announcements (public — no auth needed so any visitor sees updates) ──
  app.get("/api/announcements", wrap(async (_req, res) => {
    const list = await storage.getAnnouncements();
    return res.json(list);
  }));

  // ── Announcements (admin CRUD) ────────────────────────────────────────────
  const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (!req.session?.adminAuthed) return res.status(403).json({ message: "Access denied" });
    next();
  };

  app.post("/api/admin/announcements", requireAdmin, wrap(async (req, res) => {
    const { version, title, body, date } = req.body;
    if (!title || !date) return res.status(400).json({ message: "title and date are required" });
    const a = await storage.createAnnouncement({
      version: version || "",
      title,
      body: body || "",
      date,
      createdAt: Date.now(),
    });
    return res.status(201).json(a);
  }));

  app.put("/api/admin/announcements/:id", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    const { version, title, body, date } = req.body;
    const updated = await storage.updateAnnouncement(id, { version, title, body, date });
    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.json(updated);
  }));

  app.delete("/api/admin/announcements/:id", requireAdmin, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
    await storage.deleteAnnouncement(id);
    return res.json({ success: true });
  }));

  return httpServer;
}
