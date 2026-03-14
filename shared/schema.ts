import { pgTable, text, serial, boolean, jsonb, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;

export const botConfigs = pgTable("bot_configs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id),
  token: text("token").notNull().unique(),
  name: text("name").notNull().default("Unknown"),
  isRunning: boolean("is_running").default(true),
  
  // RPC Settings
  rpcTitle: text("rpc_title"),
  rpcSubtitle: text("rpc_subtitle"),
  rpcAppName: text("rpc_app_name"),
  rpcImage: text("rpc_image"),
  rpcType: text("rpc_type").default("PLAYING"),
  
  // RPC Timestamps (Unix milliseconds)
  rpcStartTimestamp: text("rpc_start_timestamp"),
  rpcEndTimestamp: text("rpc_end_timestamp"),
  
  // Prefix
  commandPrefix: text("command_prefix").default("."),
  
  // Automation Settings
  nitroSniper: boolean("nitro_sniper").default(false),
  
  // Lists
  bullyTargets: text("bully_targets").array().default([]),
  whitelistedGcs: text("whitelisted_gcs").array().default([]),
  gcAllowAll: boolean("gc_allow_all").default(false),
  
  lastSeen: timestamp("last_seen").defaultNow(),
  passcode: text("passcode").notNull().default(""),
});

export const insertBotConfigSchema = createInsertSchema(botConfigs).omit({ 
  id: true, 
  lastSeen: true,
  userId: true,
});

export type BotConfig = typeof botConfigs.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type UpdateBotConfig = Partial<InsertBotConfig>;
