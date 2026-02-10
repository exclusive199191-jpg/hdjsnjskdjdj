import { pgTable, text, serial, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const botConfigs = pgTable("bot_configs", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  name: text("name").notNull().default("Unknown"),
  isRunning: boolean("is_running").default(true),
  
  // RPC Settings
  rpcTitle: text("rpc_title"),
  rpcSubtitle: text("rpc_subtitle"),
  rpcAppName: text("rpc_app_name"),
  rpcImage: text("rpc_image"),
  rpcType: text("rpc_type").default("PLAYING"), // PLAYING, STREAMING, LISTENING, WATCHING
  
  // RPC Timestamps (Unix milliseconds)
  rpcStartTimestamp: text("rpc_start_timestamp"),
  rpcEndTimestamp: text("rpc_end_timestamp"),
  
  // Prefix
  commandPrefix: text("command_prefix").default("."),
  
  // Automation Settings
  afkMessage: text("afk_message"),
  afkSince: text("afk_since"),
  isAfk: boolean("is_afk").default(false),
  nitroSniper: boolean("nitro_sniper").default(false),
  
  // Lists
  bullyTargets: text("bully_targets").array().default([]), // List of user IDs
  whitelistedGcs: text("whitelisted_gcs").array().default([]), // List of group chat IDs
  gcAllowAll: boolean("gc_allow_all").default(false),
  
  lastSeen: timestamp("last_seen").defaultNow(),
});

export const insertBotConfigSchema = createInsertSchema(botConfigs).omit({ 
  id: true, 
  lastSeen: true 
});

export type BotConfig = typeof botConfigs.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;
export type UpdateBotConfig = Partial<InsertBotConfig>;
