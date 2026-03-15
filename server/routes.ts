import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { BotManager } from "./services/botManager";
import { z } from "zod";
import crypto from "crypto";

declare module "express-session" {
  interface SessionData {
    userId: number;
    isAdmin: boolean;
  }
}

const ADMIN_USERNAME = "peroxide000";
const ADMIN_PASSWORD = "moneyhungry";

// Auto-create an anonymous session for any visitor on first request
async function ensureSession(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    const username = `anon_${crypto.randomBytes(10).toString("hex")}`;
    const password = crypto.randomBytes(20).toString("hex");
    const user = await storage.createUser({ username, password });
    req.session.userId = user.id;
    await new Promise<void>((resolve) => req.session.save(() => resolve()));
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Auto-init session and return current user
  app.get("/api/auth/init", ensureSession, async (req, res) => {
    const user = await storage.getUser(req.session.userId!);
    res.json({ id: user!.id });
  });

  // --- Admin Routes ---
  app.post("/api/admin/auth", async (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      req.session.isAdmin = true;
      await new Promise<void>((resolve) => req.session.save(() => resolve()));
      return res.json({ success: true });
    }
    return res.status(401).json({ message: "Invalid credentials" });
  });

  app.get("/api/admin/data", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authorized" });
    }
    const users = await storage.getAllUsers();
    const bots = await storage.getAllBots();
    res.json({
      users: users.map(u => ({
        id: u.id,
        username: u.username,
        createdAt: u.createdAt,
        botCount: bots.filter(b => b.userId === u.id).length,
      })),
      totalBots: bots.length,
    });
  });

  app.get("/api/admin/bots", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authorized" });
    }
    const liveInfo = await BotManager.getConnectedBotsInfo();
    res.json(liveInfo);
  });

  app.post("/api/admin/bots/disconnect-all", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authorized" });
    }
    const allBots = await storage.getAllBots();
    await Promise.all(allBots.map(b => BotManager.stopBot(b.id)));
    await Promise.all(allBots.map(b => storage.updateBot(b.id, { isRunning: false })));
    res.json({ success: true, stopped: allBots.length });
  });

  app.delete("/api/admin/bots/:id", async (req, res) => {
    if (!req.session.isAdmin) {
      return res.status(401).json({ message: "Not authorized" });
    }
    const id = Number(req.params.id);
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    res.json({ success: true });
  });

  // --- Bot API Routes (auto-session) ---

  app.get(api.bots.list.path, ensureSession, async (req, res) => {
    const bots = await storage.getBots(req.session.userId!);
    res.json(bots);
  });

  app.get(api.bots.get.path, ensureSession, async (req, res) => {
    const bot = await storage.getBot(Number(req.params.id));
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    res.json(bot);
  });

  app.post(api.bots.create.path, ensureSession, async (req, res) => {
    try {
      const input = api.bots.create.input.parse(req.body);
      const bot = await storage.createBot(input, req.session.userId!);
      if (bot.isRunning) {
        BotManager.startBot(bot);
      }
      res.status(201).json(bot);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      throw err;
    }
  });

  app.put(api.bots.update.path, ensureSession, async (req, res) => {
    try {
      const input = api.bots.update.input.parse(req.body);
      const id = Number(req.params.id);
      const bot = await storage.getBot(id);

      if (!bot || bot.userId !== req.session.userId) {
        return res.status(404).json({ message: "Bot not found" });
      }

      const tokenChanged = input.token && input.token !== bot.token;
      const isRunningChanged =
        input.isRunning !== undefined && input.isRunning !== bot.isRunning;

      const updatedBot = await storage.updateBot(id, input);

      if (tokenChanged || isRunningChanged) {
        if (updatedBot.isRunning) {
          await BotManager.restartBot(updatedBot.id);
        } else {
          await BotManager.stopBot(updatedBot.id);
        }
      } else if (updatedBot.isRunning) {
        await BotManager.updateBotConfig(updatedBot.id, input);
      }

      res.json(updatedBot);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Update error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete(api.bots.delete.path, ensureSession, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    res.status(204).send();
  });

  app.post(api.bots.restart.path, ensureSession, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.restartBot(id);
    res.json({ success: true, message: "Bot restarted" });
  });

  app.post(api.bots.stop.path, ensureSession, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    res.json({ success: true, message: "Bot stopped" });
  });

  BotManager.startAll().catch(err =>
    console.error("Failed to start bots on boot:", err)
  );

  return httpServer;
}
