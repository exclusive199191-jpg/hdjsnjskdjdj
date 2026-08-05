import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { initDb, getPool } from "./db";
import session from "express-session";
import FileStoreFactory from "session-file-store";
import connectPgSimple from "connect-pg-simple";
import { BotManager } from "./services/botManager";
import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
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

const FileStore = FileStoreFactory(session);
const PgStore = connectPgSimple(session);

// ── Admin PIN (server-side only — never sent to client) ───────────────────────
const ADMIN_PIN = process.env.ADMIN_PIN || "2364";

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
    // 1. Session cookie (preferred)
    if (req.session?.userId) {
      return next();
    }

    // 2. X-User-Id header fallback (used when cookies are blocked, e.g. Replit iframe)
    const headerUserId = req.headers["x-user-id"] as string | undefined;
    if (headerUserId) {
      try {
        const user = await storage.getUser(headerUserId);
        if (user) {
          // Block banned identities even if they have a stored session
          if (isBannedIdentity(user.username)) {
            console.warn(`[security] Blocked banned identity via header: ${user.username} from ${clientIpFromReq(req)}`);
            return res.status(403).send("Access denied.");
          }
          req.session.userId = user.id;
          req.session.save(() => {});
          return next();
        }
      } catch { /* DB unavailable, fall through */ }
    }

    // 3. Try to create a new DB user; if DB is down fall back to session ID
    try {
      const user = await storage.createUser({
        username: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        password: "",
      });
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    } catch {
      // DB unavailable — use the express session ID as a temporary identity
      req.session.userId = req.sessionID;
      req.session.save(() => {});
    }
    next();
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

  // Initialise DB tables in the background — never blocks route/static setup
  initDb().catch((e: any) =>
    console.error("[db] background initDb failed:", e?.message)
  );

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
      sessionStore = new PgStore({ pool: pgPool, tableName: "session", createTableIfMissing: true });
      console.log("[session] Using PostgreSQL session store");
    } catch (e: any) {
      console.warn("[session] PgStore failed, falling back to file store:", e?.message);
      pgPool.end().catch(() => {});
      const sessionsDir = path.resolve(process.cwd(), "data", "sessions");
      fs.mkdirSync(sessionsDir, { recursive: true });
      sessionStore = new FileStore({ path: sessionsDir, ttl: 7 * 24 * 60 * 60, retries: 0, logFn: () => {} });
    }
  } else {
    const sessionsDir = path.resolve(process.cwd(), "data", "sessions");
    fs.mkdirSync(sessionsDir, { recursive: true });
    sessionStore = new FileStore({
      path: sessionsDir,
      ttl: 7 * 24 * 60 * 60,
      retries: 0,
      logFn: () => {},
    });
    console.log("[session] Using file-based session store");
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

  // ─── Session (auto-create, no login required) ────────────────────────────

  const authInitLimiter = rateLimit({ windowMs: 60_000, max: 20, message: "Too many requests." });

  app.get("/api/auth/init", authInitLimiter, wrap(async (req, res) => {
    // Accept X-User-Id header as a persistent identity from localStorage
    const headerUserId = req.headers["x-user-id"] as string | undefined;
    if (headerUserId) {
      try {
        const user = await storage.getUser(headerUserId);
        if (user) {
          if (isBannedIdentity(user.username)) {
            console.warn(`[security] Blocked banned identity at init: ${user.username}`);
            return res.status(403).send("Access denied.");
          }
          req.session.userId = user.id;
          req.session.save(() => {});
          return res.json({ id: user.id });
        }
      } catch { /* DB unavailable, fall through */ }
    }

    if (!req.session.userId) {
      try {
        const user = await storage.createUser({
          username: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          password: "",
        });
        req.session.userId = user.id;
        await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
      } catch (e) {
        // DB unavailable — fall back to the express session ID so the frontend
        // can still load. The real DB user will be created on next successful connect.
        console.warn("[auth/init] DB unavailable, using sessionID as fallback:", (e as any)?.message);
        req.session.userId = req.sessionID;
        req.session.save(() => {});
      }
    }
    return res.json({ id: req.session.userId });
  }));

  // ─── Global stats (public) ───────────────────────────────────────────────

  app.get("/api/stats", wrap(async (_req, res) => {
    const allBots = await storage.getAllBots();
    const totalHosted  = allBots.length;
    const totalRunning = allBots.filter(b => BotManager.isRunning(b.id)).length;
    return res.json({ totalHosted, totalRunning });
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
    unbanIp(decodeURIComponent(req.params.ip));
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
