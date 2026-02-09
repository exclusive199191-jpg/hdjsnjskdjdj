import { Client, RichPresence } from 'discord.js-selfbot-v13';
import { storage } from '../storage';
import { type BotConfig } from '@shared/schema';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Store active clients and their bully intervals/configs in memory
const activeClients = new Map<number, Client>();
const clientConfigs = new Map<number, BotConfig>();
const bullyIntervals = new Map<number, { interval: NodeJS.Timeout, channelId: string }>();
const packIntervals = new Map<number, { interval: NodeJS.Timeout, channelId: string }>();
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

const PACK_INSULTS = [
    "you're such a fucking pathetic waste of oxygen, literally no one in your life actually likes you and they all talk shit behind your back because you're a socially retarded geek who spends all day rotting on discord. i hope you realize how worthless you are and just end it already because the world would be a much better place without your disgusting presence dragging everyone else down with your incompetence and sheer stupidity.",
    "shut the fuck up you absolute subhuman bottom feeder, your mother must be so disappointed that she raised such a failure of a human being who can't even hold a basic conversation without sounding like a total moron. you're a literal stain on society and every time you speak it's just a reminder of why forced sterilization should be a thing for people with your level of genetic inferiority and brain damage.",
    "you are the definition of a walking L, a literal npc who has never had an original thought in their entire life and just follows whatever trend they see because they're too fucking stupid to think for themselves. i'm actually surprised you even know how to use a keyboard given that your brain is probably the size of a pea and filled with nothing but pure garbage and failure. go jump off a bridge and save us all the trouble of having to look at your ugly ass face.",
    "imagine being such a fucking loser that you actually think people care about what you have to say when in reality everyone just pities you for how sad and lonely your life must be. you're a fucking joke, a punchline that isn't even funny, just depressing and pathetic. i've seen roadkill with more charisma and value than you'll ever have in your entire miserable existence you absolute piece of shit.",
    "listen here you little fucking cockroach, you're nothing but a nuisance that needs to be crushed under the weight of your own failures and insecurities. you're a literal nobody, a speck of dust in the grand scheme of things that won't even be remembered the second you're gone. so do us all a favor and speed up the process by disappearing forever and never showing your disgusting face on the internet again."
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
      let clientOptions: any = {};
      
      // Use proxy if provided in environment variables
      const proxyUrl = process.env.PROXY_URL;
      if (proxyUrl) {
        console.log(`Using proxy for bot ${initialConfig.name}`);
        clientOptions.http = {
          agent: new HttpsProxyAgent(proxyUrl)
        };
      }

      const client = new Client(clientOptions);
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
            { name: 'pack', usage: 'pack <@user/off>', desc: 'Flood chat with heavy roasts.' },
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

        if (command === 'bully') {
            const target = args[0];
            if (target === 'off') {
                const existing = bullyIntervals.get(configId);
                if (existing) {
                    clearInterval(existing.interval);
                    bullyIntervals.delete(configId);
                    await message.edit(`Stopped bullying.`);
                }
            } else if (target) {
                const userId = target.replace(/[<@!>]/g, '');
                if (bullyIntervals.has(configId)) {
                    clearInterval(bullyIntervals.get(configId)!.interval);
                }
                
                const interval = setInterval(async () => {
                    const channel = await client.channels.fetch(message.channel.id).catch(() => null);
                    if (channel && 'send' in channel) {
                        const insult = INSULTS[Math.floor(Math.random() * INSULTS.length)];
                        await (channel as any).send(`<@${userId}> ${insult}`).catch(() => {});
                    }
                }, 1500);

                bullyIntervals.set(configId, { interval, channelId: message.channel.id });
                await message.delete().catch(() => {});
            }
        }

        if (command === 'pack') {
            const target = args[0];
            if (target === 'off') {
                const existing = packIntervals.get(configId);
                if (existing) {
                    clearInterval(existing.interval);
                    packIntervals.delete(configId);
                    await message.edit(`Stopped packing.`);
                }
            } else if (target) {
                const userId = target.replace(/[<@!>]/g, '');
                if (packIntervals.has(configId)) {
                    clearInterval(packIntervals.get(configId)!.interval);
                }
                
                const interval = setInterval(async () => {
                    const channel = await client.channels.fetch(message.channel.id).catch(() => null);
                    if (channel && 'send' in channel) {
                        const roast = PACK_INSULTS[Math.floor(Math.random() * PACK_INSULTS.length)];
                        // Multiple parallel sends for faster flooding
                        for (let i = 0; i < 3; i++) {
                            (channel as any).send(`<@${userId}>\n\n${roast}`).catch(() => {});
                        }
                    }
                }, 200); // Reduced interval to 200ms for faster purging/packing

                packIntervals.set(configId, { interval, channelId: message.channel.id });
                await message.delete().catch(() => {});
            }
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
      
      // Clear previous activity first
      client.user.setActivity(null);

      const rpc: any = {
          name: config.rpcAppName || "Selfbot",
          type: config.rpcType?.toUpperCase() || "PLAYING",
          details: config.rpcTitle || "",
          state: config.rpcSubtitle || ""
      };

      if (config.rpcStartTimestamp || config.rpcEndTimestamp) {
          rpc.timestamps = {};
          if (config.rpcStartTimestamp && config.rpcStartTimestamp !== "0") {
              rpc.timestamps.start = Number(config.rpcStartTimestamp);
          }
          if (config.rpcEndTimestamp && config.rpcEndTimestamp !== "0") {
              rpc.timestamps.end = Number(config.rpcEndTimestamp);
          }
      }

      if (config.rpcImage) {
          rpc.assets = {
              large_image: config.rpcImage,
              large_text: config.rpcAppName || "Selfbot"
          };
      }

      console.log(`Applying RPC for ${client.user.tag}:`, JSON.stringify(rpc, null, 2));
      
      try {
          client.user.setActivity(rpc);
          // Set presence to online and ensure activity is broadcast
          client.user.setPresence({ 
              status: 'online',
              activities: [rpc]
          });
      } catch (e) {
          console.error(`Failed to set activity for ${client.user.tag}:`, e);
      }
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

  static async updateBotConfig(id: number, updates: any) {
    const updated = await storage.updateBot(id, updates);
    clientConfigs.set(id, updated);
    const client = activeClients.get(id);
    if (client) {
      console.log(`Config updated for bot ${id}, re-applying RPC...`);
      this.applyRpc(client, updated);
    }
  }
}
