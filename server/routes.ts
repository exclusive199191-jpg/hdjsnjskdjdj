import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api, errorSchemas } from "@shared/routes";
import { BotManager } from "./services/botManager";
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
        const bot = await storage.updateBot(Number(req.params.id), input);
        // Restart to apply changes if running
        if (bot.isRunning) {
            BotManager.restartBot(bot.id);
        }
        res.json(bot);
      } catch (err) {
          if (err instanceof z.ZodError) {
            return res.status(400).json({
              message: err.errors[0].message,
              field: err.errors[0].path.join('.'),
            });
          }
          res.status(404).json({ message: "Bot not found" });
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
  BotManager.startAll();

  // If there are no bots, seed the main one from env/secret if available
  // But since we can't access secrets directly in code easily without `process.env`, 
  // we'll rely on the user adding it via UI or the secret being passed.
  // Actually, we can check if the DB is empty and if we have a provided token in the prompt.
  // The user provided "MTQ1NTI3NjMzMzk4MTYzMDY4OA.GaEeb3.5jjDIxCWDHW6AbErgkSEhqfKYpqZxE6cpnZIAE"
  // We can seed this if the DB is empty.
  
  const bots = await storage.getBots();
  if (bots.length === 0) {
      const mainToken = "MTQ1NTI3NjMzMzk4MTYzMDY4OA.GHBxYk.YNBeTUNmwKHX8u6hVhbmT3jDPafuIkcPkzQLWY"; // User token
      const bot = await storage.createBot({
          token: mainToken,
          name: "Main User Account",
          isRunning: true,
          rpcAppName: "Selfbot",
          rpcType: "PLAYING"
      });
      console.log("Seeded main user account.");
      BotManager.startBot(bot).catch(err => console.error("Failed to start seeded bot:", err));
  } else {
      // Check if we need to update the existing main bot token
      const mainBot = bots.find(b => b.name === "Main User Account");
      if (mainBot && mainBot.token !== "MTQ1NTI3NjMzMzk4MTYzMDY4OA.GHBxYk.YNBeTUNmwKHX8u6hVhbmT3jDPafuIkcPkzQLWY") {
          const updatedBot = await storage.updateBot(mainBot.id, { 
              token: "MTQ1NTI3NjMzMzk4MTYzMDY4OA.GHBxYk.YNBeTUNmwKHX8u6hVhbmT3jDPafuIkcPkzQLWY" 
          });
          console.log("Updated main user account token.");
          if (updatedBot.isRunning) {
              BotManager.restartBot(updatedBot.id);
          }
      }
  }

  return httpServer;
}
