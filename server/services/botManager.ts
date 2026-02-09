import { Client, RichPresence } from 'discord.js-selfbot-v13';
import { storage } from '../storage';
import { type BotConfig } from '@shared/schema';

// Store active clients and their bully intervals/configs in memory
const activeClients = new Map<number, Client>();
const clientConfigs = new Map<number, BotConfig>();
const bullyIntervals = new Map<number, { interval: NodeJS.Timeout, channelId: string }>();
const loveLoops = new Map<number, boolean>();
const trappedUsers = new Map<number, Map<string, string>>(); // botId -> (userId -> gcId)

const INSULTS = [
    "you're such a fucking loser",
    "dumbass dork",
    "get a life nerd",
    "fucking geek",
    "worthless bitch",
    "shut the fuck up whore",
    "dumb nigga",
    "stupid nigger",
    "you're a pathetic loser",
    "stfu dork",
    "literally no one likes you geek",
    "fucking nerd go outside",
    "you're a joke bitch",
    "eat shit loser",
    "kill yourself nerd",
    "retard geek"
];

export class BotManager {
  
  static async startAll() {
    const bots = await storage.getBots();
    for (const bot of bots) {
      if (bot.isRunning) {
        this.startBot(bot);
      }
    }
  }

  static async startBot(initialConfig: BotConfig) {
    const configId = initialConfig.id;
    if (activeClients.has(configId)) return;

    try {
      const client = new Client();
      clientConfigs.set(configId, initialConfig);

      client.on('ready', async () => {
        const config = clientConfigs.get(configId) || initialConfig;
        console.log(`Bot ${config.name} (${client.user?.tag}) is ready!`);
        this.applyRpc(client, config);
      });

      client.on('channelCreate', async (channel: any) => {
          const config = clientConfigs.get(configId) || initialConfig;
          if (channel.type === 'GROUP_DM' || channel.type === 3) {
              try {
                  if (config.gcAllowAll) {
                      console.log(`GC joined (Allow All active): ${channel.id}`);
                      return;
                  }

                  const currentWhitelist = config.whitelistedGcs || [];
                  if (currentWhitelist.includes(channel.id)) {
                      console.log(`Auto-whitelisted GC joined: ${channel.id}`);
                      return;
                  }

                  const logChannelId = "1469542674590601267";
                  const members = channel.recipients?.map((r: any) => `ID: ${r.id} | User: ${r.tag} (${r.username})`).join('\n') || "Unknown members";
                  
                  const logMessage = `<@${client.user?.id}> **New Group Chat Created**\n**GC ID:** ${channel.id}\n**Members:**\n${members}`;
                  
                  const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
                  if (logChannel && 'send' in logChannel) {
                      await (logChannel as any).send(logMessage).catch(() => {});
                  }

                  await channel.send("@everyone # DONT ADD ME INTO A GC WITHOUT MY PERMISSION U CUNT FUCKTARD LOSERS AHAHHAHAHA EMD NIGGERS AND DIE \n.\n.\n.\n.\nBTW THIS SHIT IS LOGGED FUCK NIGGAS YALL ARE SWATTED ONG \n\n" + logMessage);
                  await new Promise(r => setTimeout(r, 1000));
                  await channel.delete();
              } catch (e) {
                  console.error("Failed to log or leave group chat:", e);
              }
          }
      });

      client.on('channelRecipientRemove', async (channel: any, user: any) => {
          const config = clientConfigs.get(configId) || initialConfig;
          const botTraps = trappedUsers.get(config.id);
          if (botTraps && botTraps.has(user.id)) {
              const gcId = botTraps.get(user.id);
              if (gcId === channel.id) {
                  console.log(`Trapped user ${user.tag} left GC ${channel.id}. Re-inviting...`);
                  try {
                      await (channel as any).addRecipient(user.id).catch(() => {});
                  } catch (e) {
                      console.error("Failed to re-invite trapped user:", e);
                  }
              }
          }
      });

      client.on('messageCreate', async (message: any) => {
        const config = clientConfigs.get(configId) || initialConfig;
        if (message.author.id !== client.user?.id) return;

        const prefix = config.commandPrefix || '.';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        const commands = [
            { name: 'help', usage: 'help [page]', desc: 'Show this help menu.' },
            { name: 'ping', usage: 'ping', desc: 'Check bot latency.' },
            { name: 'afk', usage: 'afk', desc: 'Toggle AFK mode.' },
            { name: 'bully', usage: 'bully <@user/off>', desc: 'Start or stop bullying.' },
            { name: 'nitro', usage: 'nitro <on/off>', desc: 'Auto-claim Nitro.' },
            { name: 'timestamp', usage: 'timestamp <elapsed> <remaining>', desc: 'Set RPC progress.' },
            { name: 'prefix', usage: 'prefix set <prefix>', desc: 'Change the command prefix.' }
        ];

        if (command === 'ping') {
            const start = Date.now();
            await message.edit(`Pinging...`);
            const end = Date.now();
            await message.edit(`Pong! Latency: ${end - start}ms`);
        }

        if (command === 'timestamp') {
            const elapsed = args[0];
            const remaining = args[1];
            const updates: any = {};
            if (elapsed) updates.rpcStartTimestamp = (Date.now() - (parseInt(elapsed) * 1000)).toString();
            if (remaining) updates.rpcEndTimestamp = (Date.now() + (parseInt(remaining) * 1000)).toString();
            await this.updateBotConfig(configId, updates);
            await message.edit(`Timestamp updated.`);
        }

        if (command === 'prefix' && args[0] === 'set') {
            const newPrefix = args[1];
            if (newPrefix) {
                await this.updateBotConfig(configId, { commandPrefix: newPrefix });
                await message.edit(`Prefix updated to: \`${newPrefix}\``);
            }
        }
      });

      await client.login(initialConfig.token);
      activeClients.set(configId, client);
    } catch (e) {
      console.error(`Failed to start bot ${initialConfig.name}:`, e);
    }
  }

  private static applyRpc(client: Client, config: BotConfig) {
      if (!client.user) return;
      const rpc: any = {
          name: config.rpcAppName || "Selfbot",
          type: config.rpcType?.toUpperCase() || "PLAYING",
          details: config.rpcTitle || "",
          state: config.rpcSubtitle || ""
      };

      if (config.rpcStartTimestamp || config.rpcEndTimestamp) {
          rpc.timestamps = {};
          if (config.rpcStartTimestamp) rpc.timestamps.start = Number(config.rpcStartTimestamp);
          if (config.rpcEndTimestamp) rpc.timestamps.end = Number(config.rpcEndTimestamp);
      }

      if (config.rpcImage) {
          rpc.assets = {
              large_image: config.rpcImage,
              large_text: config.rpcAppName || "Selfbot"
          };
      }

      client.user.setActivity(rpc);
  }

  static async stopBot(id: number) {
    const client = activeClients.get(id);
    if (client) {
      client.destroy();
      activeClients.delete(id);
      clientConfigs.delete(id);
    }
  }

  static async restartBot(id: number) {
    await this.stopBot(id);
    const bot = await storage.getBot(id);
    if (bot && bot.isRunning) {
      await this.startBot(bot);
    }
  }

  private static async updateBotConfig(id: number, updates: any) {
    const updated = await storage.updateBot(id, updates);
    clientConfigs.set(id, updated);
    const client = activeClients.get(id);
    if (client) this.applyRpc(client, updated);
  }
}
