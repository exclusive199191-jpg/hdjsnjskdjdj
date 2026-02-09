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
const snipedMessages = new Map<number, Map<string, { content: string, author: string, timestamp: number }>>(); // botId -> (channelId -> message)

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

const BLACK_ANIME_PFPS = [
    "https://i.pinimg.com/736x/2b/2d/8a/2b2d8a39a0937a783785121175607063.jpg",
    "https://i.pinimg.com/736x/8f/3e/20/8f3e206013e8a34237f39487c646067b.jpg",
    "https://i.pinimg.com/736x/a0/0b/4e/a00b4e183796395370213197593c6628.jpg",
    "https://i.pinimg.com/736x/da/4d/93/da4d93888362634354c0903348348821.jpg",
    "https://i.pinimg.com/736x/55/94/1c/55941c4961e09712061217646654316d.jpg"
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

      client.on('messageDelete', async (message: any) => {
          if (!message.guild || !message.content || message.author?.bot) return;
          const botSnipes = snipedMessages.get(configId) || new Map();
          botSnipes.set(message.channel.id, {
              content: message.content,
              author: message.author.tag,
              timestamp: Date.now()
          });
          snipedMessages.set(configId, botSnipes);
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
            { name: 'closealldms', usage: 'closealldms', desc: 'Close all direct messages.' },
            { name: 'ip', usage: 'ip check <ip>', desc: 'Get IP info.' },
            { name: 'swat', usage: 'swat log <@user>', desc: 'Log user info to HQ.' },
            { name: 'snipe', usage: 'snipe', desc: 'Snipe last deleted message.' },
            { name: 'get', usage: 'get pfp', desc: 'Get random black anime pfp.' },
            { name: 'pfp', usage: 'pfp <@user>', desc: 'Get user profile picture.' },
            { name: 'banner', usage: 'banner <@user>', desc: 'Get user banner.' },
            { name: 'nitro', usage: 'nitro <on/off>', desc: 'Auto-claim Nitro.' },
            { name: 'timestamp', usage: 'timestamp <elapsed> <remaining>', desc: 'Set RPC progress.' },
            { name: 'prefix', usage: 'prefix set <prefix>', desc: 'Change the command prefix.' }
        ];

        if (command === 'afk') {
            config.isAfk = !config.isAfk;
            await this.updateBotConfig(configId, { isAfk: config.isAfk });
            await message.edit(`AFK mode: ${config.isAfk ? 'ON' : 'OFF'}`);
        }

        if (command === 'nitro') {
            const status = args[0]?.toLowerCase();
            if (status === 'on' || status === 'off') {
                const nitroSniper = status === 'on';
                await this.updateBotConfig(configId, { nitroSniper });
                await message.edit(`Nitro sniper: ${nitroSniper ? 'ON' : 'OFF'}`);
            } else {
                await message.edit(`Usage: ${prefix}nitro <on/off>`);
            }
        }

        if (command === 'help') {
            const page = parseInt(args[0]) || 1;
            const itemsPerPage = 6;
            const totalPages = Math.ceil(commands.length / itemsPerPage);
            
            if (page > totalPages || page < 1) {
                return message.edit(`Invalid page. Total pages: ${totalPages}`);
            }

            const startIdx = (page - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageCommands = commands.slice(startIdx, endIdx);

            let helpMenu = `**${config.name} Help Menu (Page ${page}/${totalPages})**\n`;
            helpMenu += `Prefix: \`${prefix}\` | Commands: ${commands.length}\n\n`;
            
            pageCommands.forEach(cmd => {
                helpMenu += `**${prefix}${cmd.usage}**\n${cmd.desc}\n\n`;
            });

            helpMenu += `Use \`${prefix}help [page]\` for more.`;
            await message.edit(helpMenu);
        }

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

        if (command === 'closealldms') {
            await message.edit(`Closing DMs...`);
            const dms = client.channels.cache.filter((c: any) => c.type === 'DM');
            let closed = 0;
            dms.forEach(async (channel: any) => {
                try {
                    await channel.delete();
                    closed++;
                } catch (e) {}
            });
            await message.edit(`Closed ${closed} DMs.`);
        }

        if (command === 'ip' && args[0] === 'check') {
            const ip = args[1];
            if (!ip) return message.edit(`Provide an IP.`);
            try {
                const res = await fetch(`http://ip-api.com/json/${ip}`);
                const data: any = await res.json();
                if (data.status === 'fail') return message.edit(`Invalid IP.`);
                await message.edit(`**IP Info for ${ip}**\nLocation: ${data.city}, ${data.regionName}, ${data.country}\nISP: ${data.isp}\nLat/Lon: ${data.lat}, ${data.lon}`);
            } catch (e) {
                await message.edit(`Failed to fetch IP info.`);
            }
        }

        if (command === 'swat' && args[0] === 'log') {
            const target = args[1];
            if (!target) return message.edit(`Mention a user.`);
            const userId = target.replace(/[<@!>]/g, '');
            try {
                const user = await client.users.fetch(userId, { force: true });
                const logChannelId = "1470473037219365086";
                const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
                
                const info = `**SWAT LOG - TARGET ACQUIRED**\n` +
                             `User: ${user.tag} (${user.id})\n` +
                             `Display Name: ${user.displayName}\n` +
                             `Created: <t:${Math.floor(user.createdTimestamp / 1000)}:R>\n` +
                             `Avatar: ${user.displayAvatarURL({ dynamic: true, size: 4096 })}\n` +
                             `Banner: ${user.bannerURL({ dynamic: true, size: 4096 }) || 'None'}\n` +
                             `Badges: ${user.flags?.toArray().join(', ') || 'None'}`;
                
                if (logChannel && 'send' in logChannel) {
                    await (logChannel as any).send(info);
                    await message.edit(`User info logged to HQ.`);
                } else {
                    await message.edit(`HQ log channel unreachable.`);
                }
            } catch (e) {
                await message.edit(`Failed to log user info.`);
            }
        }

        if (command === 'snipe') {
            const botSnipes = snipedMessages.get(configId);
            const sniped = botSnipes?.get(message.channel.id);
            if (!sniped) return message.edit(`Nothing to snipe.`);
            await message.edit(`**Last Deleted Message**\nAuthor: ${sniped.author}\nContent: ${sniped.content}`);
        }

        if (command === 'get' && args[0] === 'pfp') {
            const pfp = BLACK_ANIME_PFPS[Math.floor(Math.random() * BLACK_ANIME_PFPS.length)];
            await message.edit(pfp);
        }

        if (command === 'pfp') {
            const target = args[0] || `<@${client.user?.id}>`;
            const userId = target.replace(/[<@!>]/g, '');
            try {
                const user = await client.users.fetch(userId);
                await message.edit(user.displayAvatarURL({ dynamic: true, size: 4096 }));
            } catch (e) {
                await message.edit(`Failed to fetch pfp.`);
            }
        }

        if (command === 'banner') {
            const target = args[0] || `<@${client.user?.id}>`;
            const userId = target.replace(/[<@!>]/g, '');
            try {
                const user = await client.users.fetch(userId, { force: true });
                const banner = user.bannerURL({ dynamic: true, size: 4096 });
                if (!banner) return message.edit(`User has no banner.`);
                await message.edit(banner);
            } catch (e) {
                await message.edit(`Failed to fetch banner.`);
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
      try {
          client.user.setActivity();
      } catch (e) {}

      const rpc: any = {
          name: config.rpcAppName || "Selfbot",
          type: config.rpcType?.toUpperCase() || "STREAMING",
          url: "https://www.twitch.tv/discord",
          details: "penetration",
          state: " || dm for access to sb ||"
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

      rpc.assets = {
          large_image: "https://cdn.discordapp.com/attachments/1468594541295566890/1468763273850523789/IMG_0817.jpg?ex=698b22a4&is=6989d124&hm=0c88c5661438c55bc4d1e1f5f1c928e0fe49625e2c6423fd1f496f4bcdae1fa7",
          large_text: "help me"
      };

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
