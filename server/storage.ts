import { db } from "./db";
import { botConfigs, users, type BotConfig, type InsertBotConfig, type UpdateBotConfig, type User, type InsertUser } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(":");
    crypto.scrypt(password, salt, 64, (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString("hex"));
    });
  });
}

export interface IStorage {
  // Users
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  verifyUserPassword(username: string, password: string): Promise<User | null>;

  // Bot Configs
  getBots(userId: number): Promise<BotConfig[]>;
  getAllBots(): Promise<BotConfig[]>;
  getBot(id: number): Promise<BotConfig | undefined>;
  getBotByToken(token: string): Promise<BotConfig | undefined>;
  createBot(bot: InsertBotConfig, userId: number): Promise<BotConfig>;
  updateBot(id: number, updates: UpdateBotConfig): Promise<BotConfig>;
  deleteBot(id: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const hashed = await hashPassword(user.password);
    const [newUser] = await db.insert(users).values({ ...user, password: hashed }).returning();
    return newUser;
  }

  async verifyUserPassword(username: string, password: string): Promise<User | null> {
    const user = await this.getUserByUsername(username);
    if (!user) return null;
    const valid = await verifyPassword(password, user.password);
    return valid ? user : null;
  }

  async getBots(userId: number): Promise<BotConfig[]> {
    return await db.select().from(botConfigs).where(eq(botConfigs.userId, userId));
  }

  async getAllBots(): Promise<BotConfig[]> {
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

  async createBot(bot: InsertBotConfig, userId: number): Promise<BotConfig> {
    const [newBot] = await db.insert(botConfigs).values({
      ...bot,
      userId,
      passcode: bot.passcode || ""
    }).returning();
    return newBot;
  }

  async updateBot(id: number, updates: UpdateBotConfig): Promise<BotConfig> {
    const [updated] = await db.update(botConfigs)
      .set({ ...updates, lastSeen: new Date() })
      .where(eq(botConfigs.id, id))
      .returning();
    
    if (!updated) {
      throw new Error(`Bot with ID ${id} not found`);
    }
    return updated;
  }

  async deleteBot(id: number): Promise<void> {
    await db.delete(botConfigs).where(eq(botConfigs.id, id));
  }
}

export const storage = new DatabaseStorage();
