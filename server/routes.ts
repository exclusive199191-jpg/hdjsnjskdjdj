import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import MemoryStore from "memorystore";
import { BotManager } from "./services/botManager";

const MemStore = MemoryStore(session);

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    adminAuthed?: boolean;
  }
}

async function requireAuth(req: Request, res: Response, next: () => void) {
  if (!req.session?.userId) {
    const user = await storage.createUser({
      username: `session_${Date.now()}`,
      password: "",
    });
    req.session.userId = user.id;
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "netrunner-secret-key",
      resave: false,
      saveUninitialized: false,
      store: new MemStore({ checkPeriod: 86400000 }),
      cookie: { secure: false, maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  // Discord domain verification
  app.get("/.well-known/discord", (_req, res) => {
    res.setHeader("Content-Type", "text/plain");
    res.send("dh=15c0aab2b7489dac2bd89a507c7a0e5432af1cf3");
  });

  // ─── Session (auto-create, no login required) ────────────────────────────

  app.get("/api/auth/init", async (req, res) => {
    if (!req.session.userId) {
      const user = await storage.createUser({
        username: `session_${Date.now()}`,
        password: "",
      });
      req.session.userId = user.id;
    }
    return res.json({ id: req.session.userId });
  });

  // ─── Bots ────────────────────────────────────────────────────────────────

  app.get("/api/bots", requireAuth, async (req, res) => {
    const bots = await storage.getBotsByUser(req.session.userId!);
    const withStatus = bots.map(b => ({
      ...b,
      isRunning: BotManager.isRunning(b.id),
    }));
    return res.json(withStatus);
  });

  app.post("/api/bots", requireAuth, async (req, res) => {
    const { name, token } = req.body;
    if (!name || !token) {
      return res.status(400).json({ message: "Name and token are required" });
    }
    const bot = await storage.createBot({
      userId: req.session.userId!,
      name,
      token,
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
    try {
      await BotManager.startBot(bot);
    } catch {
      // Bot might fail to connect — that's ok, just log
    }
    return res.status(201).json(bot);
  });

  app.get("/api/bots/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    return res.json({ ...bot, isRunning: BotManager.isRunning(id) });
  });

  app.put("/api/bots/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.updateBotConfig(id, req.body);
    const updated = await storage.getBot(id);
    return res.json({ ...updated, isRunning: BotManager.isRunning(id) });
  });

  app.delete("/api/bots/:id", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  });

  app.post("/api/bots/:id/restart", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    try {
      await BotManager.stopBot(id);
      await BotManager.startBot(bot);
      return res.json({ success: true, message: "Bot restarted" });
    } catch (err: any) {
      return res.json({ success: false, message: err.message });
    }
  });

  app.post("/api/bots/:id/stop", requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    return res.json({ success: true, message: "Bot stopped" });
  });

  // ─── Admin ───────────────────────────────────────────────────────────────

  app.post("/api/admin/auth", (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      req.session.adminAuthed = true;
      return res.json({ ok: true });
    }
    return res.status(403).json({ message: "Access denied" });
  });

  app.get("/api/admin/data", async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const allBots = await storage.getAllBots();
    const userIds = [...new Set(allBots.map(b => b.userId))];
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
  });

  app.get("/api/admin/bots", async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const bots = await storage.getAllBots();
    return res.json(bots.map(b => ({
      id: b.id,
      name: b.name,
      discordTag: b.discordTag || b.name,
      discordId: b.discordId || "",
      isConnected: BotManager.isRunning(b.id),
      isRunning: BotManager.isRunning(b.id),
      lastSeen: b.lastSeen,
    })));
  });

  app.delete("/api/admin/bots/:id", async (req, res) => {
    if (!req.session?.adminAuthed) {
      return res.status(403).json({ message: "Access denied" });
    }
    const id = Number(req.params.id);
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    return res.status(204).send();
  });

  app.post("/api/admin/bots/disconnect-all", async (req, res) => {
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
  });

  return httpServer;
}
