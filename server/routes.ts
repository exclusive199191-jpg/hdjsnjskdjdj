import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { BotManager } from "./services/botManager";
import { log } from "./index";
import { z } from "zod";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // --- API Routes ---

  app.get(api.bots.list.path, async (req, res) => {
    const bots = await storage.getBots();
    res.json(bots);
  });

  app.get(api.bots.get.path, async (req, res) => {
    const bot = await storage.getBot(Number(req.params.id));
    if (!bot) {
      return res.status(404).json({ message: 'Bot not found' });
    }
    res.json(bot);
  });

  app.post(api.bots.create.path, async (req, res) => {
    try {
      const input = api.bots.create.input.parse(req.body);
      const bot = await storage.createBot(input);
      // Auto-start
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

  app.put(api.bots.update.path, async (req, res) => {
      try {
        const input = api.bots.update.input.parse(req.body);
        const id = Number(req.params.id);
        const bot = await storage.getBot(id);
        
        if (!bot) {
            return res.status(404).json({ message: "Bot not found" });
        }

        // Check if token changed
        const tokenChanged = input.token && input.token !== bot.token;
        const isRunningChanged = input.isRunning !== undefined && input.isRunning !== bot.isRunning;

        const updatedBot = await storage.updateBot(id, input);
        
        // Handle BotManager updates
        if (tokenChanged || isRunningChanged) {
            if (updatedBot.isRunning) {
                await BotManager.restartBot(updatedBot.id);
            } else {
                await BotManager.stopBot(updatedBot.id);
            }
        } else if (updatedBot.isRunning) {
            // Just update config and re-apply RPC without full restart
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
  
  app.delete(api.bots.delete.path, async (req, res) => {
      const id = Number(req.params.id);
      await BotManager.stopBot(id);
      await storage.deleteBot(id);
      res.status(204).send();
  });

  app.post(api.bots.restart.path, async (req, res) => {
      const id = Number(req.params.id);
      await BotManager.restartBot(id);
      res.json({ success: true, message: "Bot restarted" });
  });

  app.post(api.bots.stop.path, async (req, res) => {
      const id = Number(req.params.id);
      await BotManager.stopBot(id);
      res.json({ success: true, message: "Bot stopped" });
  });

  // --- Seed / Init ---
  // Start existing bots
  BotManager.startAll().catch(err => console.error("Failed to start bots on boot:", err));

  // Handle initial bot setup from environment variable
  const bots = await storage.getBots();
  const userToken = process.env.USER_TOKEN;

  if (userToken) {
    const mainBot = bots.find(b => b.name === "Main User Account");
    if (!mainBot) {
      const bot = await storage.createBot({
        token: userToken,
        name: "Main User Account",
        isRunning: true,
        rpcAppName: "Selfbot",
        rpcType: "PLAYING"
      });
      log("Seeded main user account.", "init");
      BotManager.startBot(bot).catch(err => console.error("Failed to start seeded bot:", err));
    } else if (mainBot.token !== userToken) {
      const updatedBot = await storage.updateBot(mainBot.id, { token: userToken });
      log("Updated main user account token.", "init");
      if (updatedBot.isRunning) {
        BotManager.restartBot(updatedBot.id).catch(err => console.error("Failed to restart updated bot:", err));
      }
    }
  }

  return httpServer;
}
