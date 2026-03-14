import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { BotManager } from "./services/botManager";
import { log } from "./index";
import { z } from "zod";

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- Auth Routes ---

  app.post("/api/auth/register", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }
      if (username.length < 3) {
        return res.status(400).json({ message: "Username must be at least 3 characters" });
      }
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }

      const existing = await storage.getUserByUsername(username);
      if (existing) {
        return res.status(400).json({ message: "Username already taken" });
      }

      const user = await storage.createUser({ username, password });
      req.session.userId = user.id;
      res.status(201).json({ id: user.id, username: user.username });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password required" });
      }

      const user = await storage.verifyUserPassword(username, password);
      if (!user) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      req.session.userId = user.id;
      res.json({ id: user.id, username: user.username });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ message: "Login failed" });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    res.json({ id: user.id, username: user.username });
  });

  // --- Bot API Routes (protected) ---

  app.get(api.bots.list.path, requireAuth, async (req, res) => {
    const bots = await storage.getBots(req.session.userId!);
    res.json(bots);
  });

  app.get(api.bots.get.path, requireAuth, async (req, res) => {
    const bot = await storage.getBot(Number(req.params.id));
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: 'Bot not found' });
    }
    res.json(bot);
  });

  app.post(api.bots.create.path, requireAuth, async (req, res) => {
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
          field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.put(api.bots.update.path, requireAuth, async (req, res) => {
    try {
      const input = api.bots.update.input.parse(req.body);
      const id = Number(req.params.id);
      const bot = await storage.getBot(id);
      
      if (!bot || bot.userId !== req.session.userId) {
        return res.status(404).json({ message: "Bot not found" });
      }

      const tokenChanged = input.token && input.token !== bot.token;
      const isRunningChanged = input.isRunning !== undefined && input.isRunning !== bot.isRunning;

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
          field: err.errors[0].path.join('.'),
        });
      }
      console.error("Update error:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
  
  app.delete(api.bots.delete.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    await storage.deleteBot(id);
    res.status(204).send();
  });

  app.post(api.bots.restart.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.restartBot(id);
    res.json({ success: true, message: "Bot restarted" });
  });

  app.post(api.bots.stop.path, requireAuth, async (req, res) => {
    const id = Number(req.params.id);
    const bot = await storage.getBot(id);
    if (!bot || bot.userId !== req.session.userId) {
      return res.status(404).json({ message: "Bot not found" });
    }
    await BotManager.stopBot(id);
    res.json({ success: true, message: "Bot stopped" });
  });

  // Start ALL bots (including legacy ones without userId)
  BotManager.startAll().catch(err => console.error("Failed to start bots on boot:", err));

  return httpServer;
}
