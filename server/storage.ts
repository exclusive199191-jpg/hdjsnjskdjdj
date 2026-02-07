import { db } from "./db";
import { botConfigs, type BotConfig, type InsertBotConfig, type UpdateBotConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

export interface IStorage {
  // Bot Configs
  getBots(): Promise<BotConfig[]>;
  getBot(id: number): Promise<BotConfig | undefined>;
  getBotByToken(token: string): Promise<BotConfig | undefined>;
  createBot(bot: InsertBotConfig): Promise<BotConfig>;
  updateBot(id: number, updates: UpdateBotConfig): Promise<BotConfig>;
  deleteBot(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getBots(): Promise<BotConfig[]> {
    return await db.select().from(botConfigs);
  }

  async getBot(id: number): Promise<BotConfig | undefined> {
    const [bot] = await db.select().from(botConfigs).where(eq(botConfigs.id, id));
    return bot;
  }

  async getBotByToken(token: string): Promise<BotConfig | undefined> {
    const [bot] = await db.select().from(botConfigs).where(eq(botConfigs.token, token));
    return bot;
  }

  async createBot(bot: InsertBotConfig): Promise<BotConfig> {
    const [newBot] = await db.insert(botConfigs).values(bot).returning();
    return newBot;
  }

  async updateBot(id: number, updates: UpdateBotConfig): Promise<BotConfig> {
    const [updated] = await db.update(botConfigs)
      .set(updates)
      .where(eq(botConfigs.id, id))
      .returning();
    return updated;
  }

  async deleteBot(id: number): Promise<void> {
    await db.delete(botConfigs).where(eq(botConfigs.id, id));
  }
}

export const storage = new DatabaseStorage();
