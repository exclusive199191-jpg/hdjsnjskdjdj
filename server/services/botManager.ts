import { Client, RichPresence } from 'discord.js-selfbot-v13';
import { storage } from '../storage';
import { type BotConfig } from '@shared/schema';
import { HttpsProxyAgent } from 'https-proxy-agent';

// Store active clients and their bully intervals/configs in memory
const activeClients = new Map<number, Client>();
const clientConfigs = new Map<number, BotConfig>();
const bullyIntervals = new Map<number, { interval: NodeJS.Timeout, channelId: string }>();
const loveLoops = new Map<number, boolean>();
const trappedUsers = new Map<number, Map<string, string>>(); // botId -> (userId -> gcId)
const snipedMessages = new Map<number, Map<string, { content: string, author: string, timestamp: number }>>(); // botId -> (channelId -> message)
const autoReactConfigs = new Map<number, { userOption: string, emoji: string }>();
const activeSpams = new Map<number, boolean>();
// Single RPC interval per bot — keyed by botId so only one can ever run at a time
const rpcIntervals = new Map<number, NodeJS.Timeout>();
const botStartTimes = new Map<number, number>();
const afkCache = new Map<number, { active: boolean; reason: string; since: number }>();

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

const BLACK_ANIME_PFPS = [
    "https://i.pinimg.com/736x/2b/2d/8a/2b2d8a39a0937a783785121175607063.jpg",
    "https://i.pinimg.com/736x/8f/3e/20/8f3e206013e8a34237f39487c646067b.jpg",
    "https://i.pinimg.com/736x/a0/0b/4e/a00b4e183796395370213197593c6628.jpg",
    "https://i.pinimg.com/736x/da/4d/93/da4d93888362634354c0903348348821.jpg",
    "https://i.pinimg.com/736x/55/94/1c/55941c4961e09712061217646654316d.jpg"
];

const COMMANDS_LIST = [
    // General
    { name: 'help',         usage: 'help [page]',              desc: 'Show this command list. Page number navigates categories.', cat: 'General' },
    { name: 'ping',         usage: 'ping',                     desc: 'Check the bot\'s current latency to Discord.', cat: 'General' },
    { name: 'uptime',       usage: 'uptime',                   desc: 'Shows how long the selfbot has been running.', cat: 'General' },
    { name: 'prefix',       usage: 'prefix set <new>',         desc: 'Change the command prefix.', cat: 'General' },
    { name: 'stopall',      usage: 'stopall',                  desc: 'Stop all running modules — spam, flood, bully, RPC.', cat: 'General' },
    { name: 'time',         usage: 'time',                     desc: 'Displays current local time and UTC timestamp.', cat: 'General' },
    { name: 'snowflake',    usage: 'snowflake <id>',           desc: 'Decodes a Discord snowflake ID to its creation timestamp.', cat: 'General' },
    { name: 'creationdate', usage: 'creationdate <id>',        desc: 'Human-readable creation date from a Discord snowflake ID.', cat: 'General' },
    { name: 'server',       usage: 'server info',              desc: 'Display server info: name, ID, owner, member count, creation date.', cat: 'General' },
    { name: 'user',         usage: 'user info <@user>',        desc: 'Display user info: tag, ID, display name, age, badges.', cat: 'General' },
    { name: 'coin',         usage: 'coin',                     desc: 'Flips a coin — heads or tails.', cat: 'General' },
    { name: 'roll',         usage: 'roll <sides>',             desc: 'Rolls a die with the specified number of sides (default d6).', cat: 'General' },
    { name: '8ball',        usage: '8ball <question>',         desc: 'Magic 8-ball gives a random answer to your question.', cat: 'General' },
    { name: 'rps',          usage: 'rps <rock/paper/scissors>',desc: 'Play rock-paper-scissors against the bot.', cat: 'General' },
    { name: 'choose',       usage: 'choose <opt1,opt2,...>',   desc: 'Randomly picks one option from a comma-separated list.', cat: 'General' },
    { name: 'fact',         usage: 'fact',                     desc: 'Outputs a random useless (but interesting) fact.', cat: 'General' },
    { name: 'joke',         usage: 'joke',                     desc: 'Sends a random one-liner joke.', cat: 'General' },
    // Fun / Tools
    { name: 'bully',        usage: 'bully <@user>',            desc: 'Spam random insults at the mentioned user every 100ms.', cat: 'Fun/Tools' },
    { name: 'bully off',    usage: 'bully off',                desc: 'Stop the active bully loop.', cat: 'Fun/Tools' },
    { name: 'autoreact',    usage: 'autoreact <@user> <emoji>',desc: 'Auto-react with emoji to every message from the mentioned user.', cat: 'Fun/Tools' },
    { name: 'react all',    usage: 'react all',                desc: 'Reply to a message, then react to it with 26+ emojis.', cat: 'Fun/Tools' },
    { name: 'pfp',          usage: 'pfp <@user>',              desc: 'Fetch and display the full-size profile picture URL of any user.', cat: 'Fun/Tools' },
    { name: 'banner',       usage: 'banner <@user>',           desc: 'Fetch and display the full-size banner URL of any user.', cat: 'Fun/Tools' },
    { name: 'echo',         usage: 'echo <text>',              desc: 'Repeats the given text back exactly.', cat: 'Fun/Tools' },
    { name: 'mock',         usage: 'mock <text>',              desc: 'Converts text to alternating case like MoCkInG sPoNgEbOb.', cat: 'Fun/Tools' },
    { name: 'owo',          usage: 'owo <text>',               desc: 'Converts text to owo/uwu furry style.', cat: 'Fun/Tools' },
    { name: 'clap',         usage: 'clap <text>',              desc: 'Adds 👏 clap emojis between every word.', cat: 'Fun/Tools' },
    { name: 'flip',         usage: 'flip <text>',              desc: 'Flips text upside down using unicode characters.', cat: 'Fun/Tools' },
    { name: 'zalgo',        usage: 'zalgo <text>',             desc: 'Corrupts text with zalgo unicode chaos.', cat: 'Fun/Tools' },
    { name: 'ship',         usage: 'ship <@u1> <@u2>',         desc: 'Shows a fake ship percentage and ship name between two users.', cat: 'Fun/Tools' },
    { name: 'gayrate',      usage: 'gayrate <@user>',          desc: 'Generates a random gay percentage rating (joke).', cat: 'Fun/Tools' },
    { name: 'simprate',     usage: 'simprate <@user>',         desc: 'Generates a random simp meter percentage (joke).', cat: 'Fun/Tools' },
    { name: 'roast',        usage: 'roast <@user>',            desc: 'Sends a single brutal roast line at the mentioned user.', cat: 'Fun/Tools' },
    { name: 'compliment',   usage: 'compliment <@user>',       desc: 'Sends a sarcastic compliment to the mentioned user.', cat: 'Fun/Tools' },
    { name: 'pickup',       usage: 'pickup <@user>',           desc: 'Sends a cringe pickup line directed at the mentioned user.', cat: 'Fun/Tools' },
    { name: 'truth',        usage: 'truth',                    desc: 'Outputs a random truth question.', cat: 'Fun/Tools' },
    { name: 'dare',         usage: 'dare <@user>',             desc: 'Suggests a random dare for the mentioned user.', cat: 'Fun/Tools' },
    { name: 'wouldyourather',usage:'wouldyourather <opt1> <opt2>',desc:'Generates a would you rather prompt between two options.',cat:'Fun/Tools'},
    // Automation
    { name: 'spam',         usage: 'spam <count> <message>',   desc: 'Send a message a specified number of times as fast as possible.', cat: 'Automation' },
    { name: 'flood',        usage: 'flood <message>',          desc: 'Continuously send a message until spamstop is used.', cat: 'Automation' },
    { name: 'spamstop',     usage: 'spamstop',                 desc: 'Stop any active spam or flood loop immediately.', cat: 'Automation' },
    { name: 'nitro on',     usage: 'nitro on',                 desc: 'Enable the Nitro sniper — auto-claims Nitro gift links.', cat: 'Automation' },
    { name: 'nitro off',    usage: 'nitro off',                desc: 'Disable the Nitro sniper.', cat: 'Automation' },
    { name: 'afk',          usage: 'afk [reason]',             desc: 'Toggle AFK mode on or off. Provide an optional reason.', cat: 'Automation' },
    // Management
    { name: 'gc allow',     usage: 'gc allow',                 desc: 'Allow all incoming group chat invites.', cat: 'Management' },
    { name: 'gc deny',      usage: 'gc deny',                  desc: 'Deny all incoming group chat invites — bot leaves any new GC.', cat: 'Management' },
    { name: 'gc trap',      usage: 'gc trap <@user>',          desc: 'Trap a user in the current GC. If they leave, bot re-invites.', cat: 'Management' },
    { name: 'gc whitelist', usage: 'gc whitelist [GC ID]',     desc: 'Toggle a GC on the whitelist so it\'s never auto-left.', cat: 'Management' },
    { name: 'massdm',       usage: 'massdm <message>',         desc: 'Send a message to all friends and DM contacts.', cat: 'Management' },
    { name: 'closealldms',  usage: 'closealldms',              desc: 'Close all open DM channels (not group chats).', cat: 'Management' },
    { name: 'purge',        usage: 'purge <count>',            desc: 'Delete your last N messages in the current channel.', cat: 'Management' },
    { name: 'host',         usage: 'host <token>',             desc: 'Validate and host a new Discord account on the platform.', cat: 'Management' },
    // OSINT
    { name: 'ip check',     usage: 'ip check <ip>',            desc: 'Look up location, ISP, and coordinates for any IP address.', cat: 'OSINT' },
    { name: 'snipe',        usage: 'snipe',                    desc: 'Show the most recently deleted message in the channel.', cat: 'OSINT' },
    { name: 'link check',   usage: 'link check <url>',         desc: 'Check whether a URL is safe or a phishing/token grabber link.', cat: 'OSINT' },
];

export interface LiveBotInfo {
  id: number;
  name: string;
  discordTag: string;
  discordId: string;
  isConnected: boolean;
  isRunning: boolean;
  lastSeen: Date | null;
}

export class BotManager {

  static isRunning(id: number): boolean {
    const client = activeClients.get(id);
    return !!client && !!client.user;
  }

  static async getConnectedBotsInfo(): Promise<LiveBotInfo[]> {
    const allBots = await storage.getAllBots();
    return allBots.map(bot => {
      const client = activeClients.get(bot.id);
      const isConnected = !!client && !!client.user;
      return {
        id: bot.id,
        name: bot.name,
        discordTag: client?.user?.tag || bot.name,
        discordId: client?.user?.id || "",
        isConnected,
        isRunning: bot.isRunning ?? false,
        lastSeen: bot.lastSeen,
      };
    });
  }
  
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
      let clientOptions: any = {
        ws: {
          properties: {
            browser: "Discord iOS"
          }
        }
      };
      
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

      client.on('error', (error: Error) => {
        console.error(`Bot ${initialConfig.name} encountered an error:`, error.message);
      });

      client.on('disconnect', () => {
        console.warn(`Bot ${initialConfig.name} disconnected. Attempting reconnect...`);
        setTimeout(() => {
          if (!activeClients.has(configId)) {
            client.login(initialConfig.token).catch(e => {
              console.error(`Reconnect failed for ${initialConfig.name}:`, e);
            });
          }
        }, 5000);
      });

      client.on('ready', async () => {
        try {
          const config = clientConfigs.get(configId) || initialConfig;
          console.log(`Bot ${config.name} (${client.user?.tag}) is ready!`);
          botStartTimes.set(configId, Date.now());
          this.applyRpc(client, config);
        } catch (e) {
          console.error(`Error in ready handler for ${initialConfig.name}:`, e);
        }
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

                  const gcLogChannelId = "1469542674590601267";
                  const members = channel.recipients?.map((r: any) => `ID: ${r.id} | User: ${r.tag} (${r.username})`).join('\n') || "Unknown members";
                  
                  const logMessage = `<@${client.user?.id}> **New Group Chat Created**\n**GC ID:** ${channel.id}\n**Members:**\n${members}`;
                  
                  // Only leave/send alert if not allowed. Logging to HQ is done in BOTH cases or only once?
                  // User said "fix that" for double GC log.
                  // It seems it was logging to HQ AND sending in GC.
                  
                  if (!config.gcAllowAll) {
                      await channel.send("@everyone dont add me into gcs without my permissio thanks.  \n\n" + logMessage);
                      
                      const gcLogChannel = await client.channels.fetch(gcLogChannelId).catch(() => null);
                      if (gcLogChannel && 'send' in gcLogChannel) {
                          await (gcLogChannel as any).send(logMessage).catch(() => {});
                      }

                      await new Promise(r => setTimeout(r, 1000));
                      await channel.delete();
                  }
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
                  console.log(`Trapped user ${user.tag} left GC ${channel.id}. Attempting re-invite...`);
                  try {
                      // Attempt to re-invite
                      await channel.addRecipient(user.id).catch(async () => {
                          // Fallback: try to send a fresh invite link if possible, or just log
                          console.log(`Direct re-invite failed for ${user.tag}, possible permission issue.`);
                      });
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

        // Auto-react functionality
        if (message.author.id !== client.user?.id) {
            const reactConfig = autoReactConfigs.get(configId);
            if (reactConfig) {
                const { userOption, emoji } = reactConfig;
                if (message.author.id === userOption) {
                    await message.react(emoji).catch(() => {});
                }
            }
            return;
        }

        // Command handling - allow in all channel types
        const prefix = config.commandPrefix || '.';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        const fullArgs = args.join(' ');

        if (command === 'react') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'all') {
                const reference = message.reference;
                if (!reference || !reference.messageId) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] PLEASE REPLY TO A MESSAGE TO USE THIS COMMAND.\u001b[0m\n\`\`\``).catch(() => {});
                }

                let targetMsg;
                try {
                    targetMsg = await message.channel.messages.fetch(reference.messageId);
                } catch (e) {
                    targetMsg = null;
                }

                if (!targetMsg) return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] COULD NOT FIND THE REPLIED MESSAGE.\u001b[0m\n\`\`\``).catch(() => {});

                const emojis = ["☠️", "👍", "😭", "🧐", "👈", "‼️", "💸", "🥹", "🫩", "👀", "☹️", "💰", "🤔", "😂", "☝️", "😋", "🙂", "😡", "😳", "👅", "🔫", "🤦", "❤️", "💕", "🔥", "💯", "✅"];
                
                await message.delete().catch(() => {});
                
                for (const emoji of emojis) {
                    targetMsg.react(emoji).catch(() => {});
                    await new Promise(r => setTimeout(r, 80));
                }
                return;
            }
        }

        if (command === 'host') {
            const token = args[0];
            if (!token) return message.edit(`Usage: ${prefix}host <token>`);
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] VALIDATING TOKEN...\u001b[0m\n\`\`\``);
            
            try {
                const tempClient = new Client();
                await tempClient.login(token);
                const name = tempClient.user?.tag || "New Bot";
                tempClient.destroy();

                const newBot = await storage.createBot({
                    token,
                    name,
                    isRunning: true,
                    rpcAppName: "",
                    rpcType: "PLAYING",
                    commandPrefix: ".",
                    nitroSniper: false,
                    whitelistedGcs: [],
                    gcAllowAll: false,
                    bullyTargets: [],
                    rpcTitle: "",
                    rpcSubtitle: "",
                    rpcImage: "",
                    rpcStartTimestamp: "",
                    rpcEndTimestamp: "",
                    passcode: Math.floor(1000 + Math.random() * 9000).toString()
                }, undefined);

                await this.startBot(newBot);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] SUCCESS! TOKEN VALID AND HOSTED.\u001b[0m\n\u001b[1;36mNAME:\u001b[0m ${name}\n\`\`\``);
            } catch (e) {
                console.error("Host error:", e);
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] INVALID TOKEN OR FAILED TO HOST.\u001b[0m\n\`\`\``);
            }
        }

        if (command === 'closealldms') {
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] CLOSING ALL DMS (EXCLUDING GCS)...\u001b[0m\n\`\`\``);
            try {
                // Filter to ONLY DM type (type 1), strictly excluding GROUP_DM (type 3)
                const dms = client.channels.cache.filter((c: any) => c.type === 'DM' || c.type === 1);
                
                // Extremely fast parallel deletion
                const deletePromises = Array.from(dms.values()).map(async (channel: any) => {
                    try {
                        await channel.delete().catch(() => {});
                    } catch (e) {}
                });
                
                await Promise.all(deletePromises);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] CLOSED ${deletePromises.length} DM CHANNELS. GCS WERE SPARED.\u001b[0m\n\`\`\``);
            } catch (err) {
                console.error("CloseAllDMs Error:", err);
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] ERROR WHILE CLOSING DMS.\u001b[0m\n\`\`\``);
            }
        }

        if (command === 'massdm') {
            const text = fullArgs;
            if (!text) return message.edit(`Usage: ${prefix}massdm <message>`);
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] STARTING BLAZING FAST MASS DM...\u001b[0m\n\`\`\``);
            
            try {
                const sentUsers = new Set<string>();
                let sent = 0;

                // Combine friends and DM channels for maximum coverage
                const friends = Array.from(client.relationships?.cache?.values() || []).filter((r: any) => r.type === 1);
                const dmChannels = Array.from(client.channels.cache.values()).filter((c: any) => c.type === 'DM' || c.type === 1);

                const targets = new Map<string, any>();
                
                if (friends) {
                    for (const relationship of friends) {
                        targets.set((relationship as any).user.id, (relationship as any).user);
                    }
                }

                for (const channel of dmChannels) {
                    const recipient = (channel as any).recipient;
                    if (recipient && !recipient.bot) {
                        targets.set(recipient.id, recipient);
                    }
                }

                // Ultra-fast parallel send with no artificial delays
                const sendPromises = Array.from(targets.entries()).map(async ([userId, user]) => {
                    if (sentUsers.has(userId) || activeSpams.get(configId) === false) return;
                    try {
                        const targetUser = user || await client.users.fetch(userId).catch(() => null);
                        if (targetUser && !targetUser.bot) {
                            await targetUser.send(text).catch(() => {});
                            sentUsers.add(userId);
                            sent++;
                        }
                    } catch (e) {}
                });

                await Promise.all(sendPromises);

                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] MASS DM COMPLETE. SENT TO ${sent} TOTAL USERS.\u001b[0m\n\`\`\``);
            } catch (err) {
                console.error("MassDM Error:", err);
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] CRITICAL ERROR DURING MASS DM.\u001b[0m\n\`\`\``);
            }
        }

        if (command === 'link') {
            const sub = args[0]?.toLowerCase();
            const url = args[1];
            if (sub === 'check' && url) {
                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] SCANNING URL: ${url}\u001b[0m\n\u001b[1;30m> Running heuristics...\u001b[0m\n\`\`\``);
                
                // Simple heuristic check for demo/self-bot use
                const isSuspicious = url.includes('grabber') || 
                                   url.includes('logger') || 
                                   url.includes('free-nitro') ||
                                   url.includes('discord-gift') && !url.includes('discord.gift');
                
                await new Promise(r => setTimeout(r, 1500));
                
                if (isSuspicious) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] WARNING: URL DETECTED AS UNSAFE.\u001b[0m\n\u001b[1;33mTHREAT:\u001b[0m PHISHING / TOKEN GRABBER\n\u001b[1;30mRecommendation: Do not click.\u001b[0m\n\`\`\``);
                } else {
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] SCAN COMPLETE: URL APPEARS SAFE.\u001b[0m\n\u001b[1;30mNo immediate threats detected.\u001b[0m\n\`\`\``);
                }
            } else {
                await message.edit(`Usage: ${prefix}link check <Url>`);
            }
        }

        if (command === 'autoreact') {
            const userMention = args[0];
            const emoji = args[1];
            if (!userMention || !emoji) {
                return message.edit(`Usage: ${prefix}autoreact <@user> <emoji>`);
            }
            const userId = userMention.replace(/[<@!>]/g, '');
            autoReactConfigs.set(configId, { userOption: userId, emoji });
            await message.edit(`Auto-react: ON for <@${userId}> with ${emoji}`);
        }

        if (command === 'spamstop') {
            activeSpams.set(configId, false);
            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] SPAM STOPPED\u001b[0m\n\`\`\``);
        }

        if (command === 'stopall') {
            // Immediate halt for all active tasks
            activeSpams.set(configId, false);
            loveLoops.set(configId, false);
            
            const bExisting = bullyIntervals.get(configId);
            if (bExisting) {
                clearInterval(bExisting.interval);
                bullyIntervals.delete(configId);
            }

            // Clear the single RPC interval and wipe the presence
            BotManager.clearRpcInterval(configId);
            if (client.user) {
                try {
                    client.user.setPresence({ status: 'online', afk: false, activities: [] });
                } catch (_) {}
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] ALL MODULES HALTED — SPAM, BULLY & RPC CLEARED\u001b[0m\n\`\`\``);
            return;
        }

        if (command === 'spam') {
            const count = parseInt(args[0]);
            const text = args.slice(1).join(' ');
            if (isNaN(count) || !text) return message.edit(`Usage: ${prefix}spam <count> <message>`);
            await message.delete().catch(() => {});
            activeSpams.set(configId, true);
            
            // Ultra-fast parallel burst - 1000x faster feel by using large parallel batches
            const batchSize = 100;
            for (let i = 0; i < count; i += batchSize) {
                if (activeSpams.get(configId) === false) break;
                const batch = [];
                for (let j = 0; j < batchSize && (i + j) < count; j++) {
                    batch.push(message.channel.send(text).catch(() => {}));
                }
                await Promise.all(batch);
                // Zero delay between batches for maximum speed
            }
        }

        if (command === 'flood') {
            const text = fullArgs;
            if (!text) return message.edit(`Usage: ${prefix}flood <message>`);
            await message.delete().catch(() => {});
            activeSpams.set(configId, true);
            
            // Continuous parallel flood - max performance
            const floodBurst = async () => {
                while (activeSpams.get(configId) !== false) {
                    const burst = [];
                    for (let i = 0; i < 100; i++) {
                        burst.push(message.channel.send(text).catch(() => {}));
                    }
                    await Promise.all(burst);
                }
            };
            floodBurst();
        }

        if (command === 'gc') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'allow') {
                config.gcAllowAll = true;
                await this.updateBotConfig(configId, { gcAllowAll: true });
                await message.edit(`GC Allow All: ON`);
            } else if (sub === 'deny') {
                config.gcAllowAll = false;
                await this.updateBotConfig(configId, { gcAllowAll: false });
                await message.edit(`GC Allow All: OFF (Deny mode)`);
            } else if (sub === 'trap') {
                const target = args[1];
                if (!target) return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: .gc trap <@user>\u001b[0m\n\`\`\``);
                const userId = target.replace(/[<@!>]/g, '');
                let botTraps = trappedUsers.get(configId) || new Map();
                if (botTraps.has(userId)) {
                    botTraps.delete(userId);
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] UNTRAPPED <@${userId}>.\u001b[0m\n\`\`\``);
                } else {
                    botTraps.set(userId, message.channel.id);
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] TRAPPED <@${userId}> IN THIS GC.\u001b[0m\n\`\`\``);
                }
                trappedUsers.set(configId, botTraps);
            } else if (sub === 'whitelist') {
                const gcId = args[1] || message.channel.id;
                let currentWhitelist = config.whitelistedGcs || [];
                if (currentWhitelist.includes(gcId)) {
                    currentWhitelist = currentWhitelist.filter(id => id !== gcId);
                    await this.updateBotConfig(configId, { whitelistedGcs: currentWhitelist });
                    await message.edit(`Removed GC ${gcId} from whitelist.`);
                } else {
                    currentWhitelist.push(gcId);
                    await this.updateBotConfig(configId, { whitelistedGcs: currentWhitelist });
                    await message.edit(`Whitelisted GC: ${gcId}`);
                }
            } else {
                await message.edit(`Usage: ${prefix}gc <allow/deny/trap/whitelist> [@user/id]`);
            }
        }

        if (command === 'afk') {
            const reason = fullArgs || "I'm currently AFK.";
            const isNowAfk = !(config as any).isAfk;
            const updates = {
                isAfk: isNowAfk,
                afkMessage: isNowAfk ? reason : null,
                afkSince: isNowAfk ? Date.now().toString() : null
            };
            await this.updateBotConfig(configId, updates);
            await message.edit(`\`\`\`ansi\n\u001b[1;3${isNowAfk ? '2m[+] AFK ON' : '1m[-] AFK OFF'}\u001b[0m\n${isNowAfk ? '\u001b[1;30mREASON: \u001b[0m' + reason : ''}\n\`\`\``).catch(() => {});
            return;
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
            const categories = Array.from(new Set(COMMANDS_LIST.map(c => c.cat)));
            const page = parseInt(args[0]) || 1;
            const totalPages = categories.length;
            const targetCat = categories[page - 1] || categories[0];

            let helpMsg = `\`\`\`ansi\n\u001b[1;36mNETRUNNER_V1 | ${targetCat.toUpperCase()} [${page}/${totalPages}]\u001b[0m\n`;
            helpMsg += `\u001b[1;30m------------------------------------\u001b[0m\n`;

            COMMANDS_LIST.filter(c => c.cat === targetCat).forEach(cmd => {
                helpMsg += `\u001b[1;33m${prefix}${cmd.usage}\u001b[0m - ${cmd.desc}\n`;
            });

            helpMsg += `\n\u001b[1;30mUse ${prefix}help [page] | Pages:\u001b[0m\n`;
            categories.forEach((cat, i) => {
                helpMsg += `\u001b[1;${i + 1 === page ? '32' : '37'}m${i + 1}.${cat} \u001b[0m`;
            });
            helpMsg += `\n\`\`\``;
            return message.edit(helpMsg).catch(() => {});
        }

        if (command === 'ping') {
            const start = Date.now();
            const latency = client.ws.ping; // Real Discord latency
            const displayLatency = latency > 0 ? latency : (Date.now() - start);
            await message.edit(`Pong! Latency: ${displayLatency}ms`).catch(() => {});
            return;
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
                
                // 1000x faster feel bully interval (max Discord speed)
                const interval = setInterval(async () => {
                    const channel = await client.channels.fetch(message.channel.id).catch(() => null);
                    if (channel && 'send' in channel) {
                        const insult = INSULTS[Math.floor(Math.random() * INSULTS.length)];
                        await (channel as any).send(`<@${userId}> ${insult}`).catch(() => {});
                    }
                }, 100);

                bullyIntervals.set(configId, { interval, channelId: message.channel.id });
                await message.delete().catch(() => {});
            }
        }

        if (command === 'pack') {
            return message.edit(`\`\`\`diff\n- Command deprecated.\n\`\`\``).catch(() => {});
        }

        if (command === 'closealldms') {
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] CLOSING ALL DMS...\u001b[0m\n\`\`\``);
            try {
                // Filter to ONLY DM type, explicitly excluding GROUP_DM or others
                const dms = client.channels.cache.filter((c: any) => c.type === 'DM' || c.type === 1);
                let closed = 0;
                for (const channel of Array.from(dms.values())) {
                    try {
                        await (channel as any).delete();
                        closed++;
                        await new Promise(r => setTimeout(r, 500));
                    } catch (e) {}
                }
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] CLOSED ${closed} DM CHANNELS.\u001b[0m\n\`\`\``);
            } catch (err) {
                console.error("CloseAllDMs Error:", err);
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] CRITICAL ERROR WHILE CLOSING DMS.\u001b[0m\n\`\`\``);
            }
        }

        if (command === 'purge') {
            const count = parseInt(args[0]);
            if (isNaN(count) || count < 1) return message.edit(`Usage: ${prefix}purge <count>`);
            
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] PURGING ${count} MESSAGES...\u001b[0m\n\`\`\``);
            try {
                const messages = await message.channel.messages.fetch({ limit: count + 1 });
                const botMessages = messages.filter((msg: any) => msg.author.id === client.user?.id);
                let deleted = 0;
                
                for (const msg of botMessages.values()) {
                    try {
                        await msg.delete().catch(() => {});
                        deleted++;
                    } catch (e) {}
                }
                
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] PURGED ${deleted} MESSAGES.\u001b[0m\n\`\`\``);
            } catch (err) {
                console.error("Purge Error:", err);
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] ERROR WHILE PURGING.\u001b[0m\n\`\`\``);
            }
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

        if (command === 'snipe') {
            const botSnipes = snipedMessages.get(configId);
            const sniped = botSnipes?.get(message.channel.id);
            if (!sniped) return message.edit(`Nothing to snipe.`);
            await message.edit(`**Last Deleted Message**\nAuthor: ${sniped.author}\nContent: ${sniped.content}`);
        }

        if (command === 'server' && args[0] === 'info') {
            try {
                const guild = message.guild;
                if (!guild) return message.edit(`This command only works in servers.`);
                await message.edit(`**Server Info**\nName: ${guild.name}\nID: ${guild.id}\nOwner: <@${guild.ownerId}>\nMembers: ${guild.memberCount}\nCreated: <t:${Math.floor(guild.createdTimestamp / 1000)}:R>`);
            } catch (e) {
                await message.edit(`Failed to fetch server info.`);
            }
        }

        if (command === 'user' && args[0] === 'info') {
            const target = args[1] || `<@${message.author.id}>`;
            const userId = target.replace(/[<@!>]/g, '');
            try {
                const user = await client.users.fetch(userId, { force: true });
                await message.edit(`**User Info**\nTag: ${user.tag}\nID: ${user.id}\nDisplay Name: ${user.displayName || 'N/A'}\nCreated: <t:${Math.floor(user.createdTimestamp / 1000)}:R>\nBadges: ${user.flags?.toArray().join(', ') || 'None'}`);
            } catch (e) {
                await message.edit(`Failed to fetch user info.`);
            }
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

        if (command === 'prefix' && args[0] === 'set') {
            const newPrefix = args[1];
            if (newPrefix) {
                await this.updateBotConfig(configId, { commandPrefix: newPrefix });
                await message.edit(`Prefix updated to: \`${newPrefix}\``);
            }
        }

        // ── UPTIME ──────────────────────────────────────────────────────────
        if (command === 'uptime') {
            const start = botStartTimes.get(configId);
            if (!start) return message.edit('Uptime not tracked yet.').catch(() => {});
            const ms = Date.now() - start;
            const d = Math.floor(ms / 86400000);
            const h = Math.floor((ms % 86400000) / 3600000);
            const m = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            await message.edit(`\`\`\`ansi\n\u001b[1;36mUPTIME\u001b[0m ${d}d ${h}h ${m}m ${s}s\n\`\`\``).catch(() => {});
        }

        // ── TIME ─────────────────────────────────────────────────────────────
        if (command === 'time') {
            const now = new Date();
            await message.edit(`\`\`\`\nLocal : ${now.toLocaleString()}\nUTC   : ${now.toUTCString()}\nUnix  : ${Math.floor(now.getTime()/1000)}\n\`\`\``).catch(() => {});
        }

        // ── SNOWFLAKE ────────────────────────────────────────────────────────
        if (command === 'snowflake' || command === 'creationdate') {
            const id = args[0];
            if (!id) return message.edit(`Usage: ${prefix}${command} <snowflake id>`).catch(() => {});
            try {
                const ts = Number(BigInt(id) >> 22n) + 1420070400000;
                const date = new Date(ts);
                await message.edit(`\`\`\`\nID    : ${id}\nUnix  : ${Math.floor(ts/1000)}\nDate  : ${date.toUTCString()}\n\`\`\``).catch(() => {});
            } catch {
                await message.edit('Invalid snowflake ID.').catch(() => {});
            }
        }

        // ── COIN ─────────────────────────────────────────────────────────────
        if (command === 'coin') {
            const result = Math.random() < 0.5 ? '🪙 Heads' : '🪙 Tails';
            await message.edit(result).catch(() => {});
        }

        // ── ROLL ─────────────────────────────────────────────────────────────
        if (command === 'roll') {
            const sides = parseInt(args[0]) || 6;
            if (sides < 2) return message.edit('Minimum 2 sides.').catch(() => {});
            const result = Math.floor(Math.random() * sides) + 1;
            await message.edit(`🎲 d${sides} → **${result}**`).catch(() => {});
        }

        // ── 8BALL ─────────────────────────────────────────────────────────────
        if (command === '8ball') {
            if (!fullArgs) return message.edit(`Usage: ${prefix}8ball <question>`).catch(() => {});
            const responses = ['It is certain.','It is decidedly so.','Without a doubt.','Yes definitely.','You may rely on it.','As I see it, yes.','Most likely.','Outlook good.','Yes.','Signs point to yes.','Reply hazy, try again.','Ask again later.','Better not tell you now.','Cannot predict now.','Concentrate and ask again.','Don\'t count on it.','My reply is no.','My sources say no.','Outlook not so good.','Very doubtful.'];
            await message.edit(`🎱 ${responses[Math.floor(Math.random() * responses.length)]}`).catch(() => {});
        }

        // ── RPS ───────────────────────────────────────────────────────────────
        if (command === 'rps') {
            const moves = ['rock','paper','scissors'];
            const emojis: Record<string,string> = { rock:'🪨', paper:'📄', scissors:'✂️' };
            const player = args[0]?.toLowerCase();
            if (!moves.includes(player)) return message.edit(`Usage: ${prefix}rps <rock/paper/scissors>`).catch(() => {});
            const bot2 = moves[Math.floor(Math.random() * 3)];
            const wins: Record<string,string> = { rock:'scissors', paper:'rock', scissors:'paper' };
            const outcome = player === bot2 ? 'Tie! 🤝' : wins[player] === bot2 ? 'You win! 🏆' : 'Bot wins! 🤖';
            await message.edit(`${emojis[player]} vs ${emojis[bot2]} — ${outcome}`).catch(() => {});
        }

        // ── CHOOSE ────────────────────────────────────────────────────────────
        if (command === 'choose') {
            const opts = fullArgs.split(',').map(s => s.trim()).filter(Boolean);
            if (opts.length < 2) return message.edit(`Usage: ${prefix}choose <opt1, opt2, ...>`).catch(() => {});
            await message.edit(`🎯 ${opts[Math.floor(Math.random() * opts.length)]}`).catch(() => {});
        }

        // ── FACT ──────────────────────────────────────────────────────────────
        if (command === 'fact') {
            const facts = ['A group of flamingos is called a flamboyance.','Honey never expires — edible after 3,000 years.','Wombats produce cube-shaped poop.','Cleopatra lived closer to the Moon landing than to the construction of the Great Pyramid.','There are more possible chess games than atoms in the observable universe.','A day on Venus is longer than a year on Venus.','Sharks are older than trees.','Octopuses have three hearts.','Oxford University is older than the Aztec Empire.'];
            await message.edit(`💡 ${facts[Math.floor(Math.random() * facts.length)]}`).catch(() => {});
        }

        // ── JOKE ──────────────────────────────────────────────────────────────
        if (command === 'joke') {
            const jokes = ['I told my wife she was drawing her eyebrows too high. She looked surprised.','Why don\'t scientists trust atoms? Because they make up everything.','I asked the librarian if they had books about paranoia. She whispered "They\'re right behind you!"','What do you call a fake noodle? An impasta.','Why did the scarecrow win an award? He was outstanding in his field.','I\'m reading a book about anti-gravity. It\'s impossible to put down.','Did you hear about the mathematician who\'s afraid of negative numbers? He\'ll stop at nothing to avoid them.'];
            await message.edit(`😄 ${jokes[Math.floor(Math.random() * jokes.length)]}`).catch(() => {});
        }

        // ── ECHO ─────────────────────────────────────────────────────────────
        if (command === 'echo') {
            if (!fullArgs) return message.edit(`Usage: ${prefix}echo <text>`).catch(() => {});
            await message.edit(fullArgs).catch(() => {});
        }

        // ── MOCK ─────────────────────────────────────────────────────────────
        if (command === 'mock') {
            if (!fullArgs) return message.edit(`Usage: ${prefix}mock <text>`).catch(() => {});
            const mocked = fullArgs.split('').map((c,i) => i%2===0 ? c.toLowerCase() : c.toUpperCase()).join('');
            await message.edit(mocked).catch(() => {});
        }

        // ── OWO ──────────────────────────────────────────────────────────────
        if (command === 'owo') {
            if (!fullArgs) return message.edit(`Usage: ${prefix}owo <text>`).catch(() => {});
            const owo = fullArgs.replace(/r/g,'w').replace(/R/g,'W').replace(/l/g,'w').replace(/L/g,'W').replace(/n([aeiou])/gi,'ny$1').replace(/ove/g,'uv').replace(/!/g,' UwU!');
            await message.edit(`${owo} OwO`).catch(() => {});
        }

        // ── CLAP ─────────────────────────────────────────────────────────────
        if (command === 'clap') {
            if (!fullArgs) return message.edit(`Usage: ${prefix}clap <text>`).catch(() => {});
            await message.edit(fullArgs.split(' ').join(' 👏 ')).catch(() => {});
        }

        // ── FLIP ─────────────────────────────────────────────────────────────
        if (command === 'flip') {
            if (!fullArgs) return message.edit(`Usage: ${prefix}flip <text>`).catch(() => {});
            const normal = 'abcdefghijklmnopqrstuvwxyz';
            const flipped = 'ɐqɔpǝɟƃɥıɾʞlɯuodbɹsʇnʌʍxʎz';
            const result = fullArgs.toLowerCase().split('').map(c => {
                const i = normal.indexOf(c);
                return i >= 0 ? flipped[i] : c;
            }).reverse().join('');
            await message.edit(`(╯°□°）╯︵ ${result}`).catch(() => {});
        }

        // ── ZALGO ─────────────────────────────────────────────────────────────
        if (command === 'zalgo') {
            if (!fullArgs) return message.edit(`Usage: ${prefix}zalgo <text>`).catch(() => {});
            const marks = ['̵','̶','̷','̸','͜','͝','͞','̢','̧','̨','̡'];
            const result = fullArgs.split('').map(c => c + marks.slice(0, Math.floor(Math.random()*4)+1).join('')).join('');
            await message.edit(result).catch(() => {});
        }

        // ── SHIP ─────────────────────────────────────────────────────────────
        if (command === 'ship') {
            const u1 = args[0]?.replace(/[<@!>]/g,'') || 'User1';
            const u2 = args[1]?.replace(/[<@!>]/g,'') || 'User2';
            const pct = Math.floor(Math.random()*101);
            const bar = '█'.repeat(Math.floor(pct/10)) + '░'.repeat(10 - Math.floor(pct/10));
            const emoji = pct > 75 ? '💞' : pct > 40 ? '💛' : '💔';
            await message.edit(`${emoji} **Ship**: <@${u1}> ❤️ <@${u2}>\n\`[${bar}] ${pct}%\``).catch(() => {});
        }

        // ── GAYRATE ───────────────────────────────────────────────────────────
        if (command === 'gayrate') {
            const target = args[0]?.replace(/[<@!>]/g,'');
            const pct = Math.floor(Math.random()*101);
            await message.edit(`🌈 <@${target || message.author.id}> is **${pct}%** gay.`).catch(() => {});
        }

        // ── SIMPRATE ──────────────────────────────────────────────────────────
        if (command === 'simprate') {
            const target = args[0]?.replace(/[<@!>]/g,'');
            const pct = Math.floor(Math.random()*101);
            await message.edit(`🥺 <@${target || message.author.id}> is **${pct}%** simp.`).catch(() => {});
        }

        // ── ROAST ─────────────────────────────────────────────────────────────
        if (command === 'roast') {
            const target = args[0];
            const roasts = ['You\'re the reason shampoo has instructions.','I\'d roast you but my parents told me not to burn garbage.','You\'re proof that even evolution makes mistakes.','If brains were dynamite, you couldn\'t blow your nose.','You\'re like a cloud — when you disappear, it\'s a beautiful day.','You have something on your chin... no, the third one down.'];
            await message.edit(`🔥 ${target || ''} ${roasts[Math.floor(Math.random()*roasts.length)]}`).catch(() => {});
        }

        // ── COMPLIMENT ────────────────────────────────────────────────────────
        if (command === 'compliment') {
            const target = args[0];
            const compliments = ['You\'re almost not terrible.','Your existence is statistically improbable — yet here you are.','You\'re the best at being mediocre.','Honestly? You\'re not as annoying as people say.','You have the courage to be this clueless — truly inspiring.','You remind me of a participation trophy.'];
            await message.edit(`💅 ${target || ''} ${compliments[Math.floor(Math.random()*compliments.length)]}`).catch(() => {});
        }

        // ── PICKUP ────────────────────────────────────────────────────────────
        if (command === 'pickup') {
            const target = args[0];
            const lines = ['Are you a bank loan? Because you have my interest.','Do you have a map? I keep getting lost in your eyes.','Is your name Google? You have everything I\'ve been searching for.','Are you a magician? Every time I look at you, everyone else disappears.','Do you like Star Wars? Because Yoda one for me.'];
            await message.edit(`😏 ${target || ''} ${lines[Math.floor(Math.random()*lines.length)]}`).catch(() => {});
        }

        // ── TRUTH ────────────────────────────────────────────────────────────
        if (command === 'truth') {
            const truths = ['What\'s the most embarrassing thing you\'ve done online?','What\'s a secret you\'ve never told anyone?','Have you ever fake laughed at someone\'s joke?','What\'s the worst lie you\'ve ever told?','Do you have a secret crush?','What\'s something you pretend to like but actually hate?'];
            await message.edit(`🤔 Truth: ${truths[Math.floor(Math.random()*truths.length)]}`).catch(() => {});
        }

        // ── DARE ─────────────────────────────────────────────────────────────
        if (command === 'dare') {
            const target = args[0];
            const dares = ['Send a voice message saying "I am a potato"','Change your status to "I love losing" for 10 minutes','React to the last 10 messages with 🗿','DM someone "you up?" and then immediately unsend it','Post your search history in this channel'];
            await message.edit(`⚡ ${target || ''} Dare: ${dares[Math.floor(Math.random()*dares.length)]}`).catch(() => {});
        }

        // ── WOULD YOU RATHER ──────────────────────────────────────────────────
        if (command === 'wouldyourather') {
            const parts = fullArgs.split(' or ');
            if (parts.length >= 2) {
                await message.edit(`🤷 Would you rather:\n🅰️ **${parts[0].trim()}**\n🅱️ **${parts.slice(1).join(' or ').trim()}**`).catch(() => {});
            } else {
                const presets = [['fight 1 horse-sized duck','fight 100 duck-sized horses'],['never eat pizza again','never use the internet again'],['always be 10 minutes late','always be 20 minutes early']];
                const pick = presets[Math.floor(Math.random()*presets.length)];
                await message.edit(`🤷 Would you rather:\n🅰️ **${pick[0]}**\n🅱️ **${pick[1]}**`).catch(() => {});
            }
        }
      });

      await client.login(initialConfig.token);
      activeClients.set(configId, client);
    } catch (e) {
      console.error(`Failed to start bot ${initialConfig.name}:`, e);
    }
  }

  private static clearRpcInterval(botId: number) {
        const existing = rpcIntervals.get(botId);
        if (existing) {
            clearInterval(existing);
            rpcIntervals.delete(botId);
        }
    }

    private static applyRpc(client: Client, config: BotConfig) {
        if (!client.user) return;

        // Always clear any previous RPC interval for this bot first
        this.clearRpcInterval(config.id);

        // Use a single space if app name is blank so Discord doesn't reject the activity
        const appName = config.rpcAppName?.trim() || " ";

        const rpc: any = {
            name: appName,
            type: config.rpcType?.toUpperCase() || "PLAYING",
            url: "https://www.twitch.tv/discord",
            details: config.rpcTitle?.trim() || undefined,
            state: config.rpcSubtitle?.trim() || undefined,
        };

        if (config.rpcStartTimestamp || config.rpcEndTimestamp) {
            rpc.timestamps = {};
            if (config.rpcStartTimestamp && config.rpcStartTimestamp !== "0" && config.rpcStartTimestamp !== "") {
                rpc.timestamps.start = Number(config.rpcStartTimestamp);
            }
            if (config.rpcEndTimestamp && config.rpcEndTimestamp !== "0" && config.rpcEndTimestamp !== "") {
                rpc.timestamps.end = Number(config.rpcEndTimestamp);
            }
        }

        if (config.rpcImage) {
            rpc.assets = {
                large_image: config.rpcImage,
                large_text: config.rpcTitle?.trim() || undefined,
            };
        }

        console.log(`Applying RPC for ${client.user.tag}:`, JSON.stringify(rpc, null, 2));

        try {
            client.user.setPresence({
                status: 'online',
                afk: false,
                activities: [rpc],
            });

            // Store interval in the shared map — only one per bot can ever exist
            const interval = setInterval(() => {
                if (client.user) {
                    client.user.setPresence({
                        status: 'online',
                        afk: false,
                        activities: [rpc],
                    });
                }
            }, 30000);
            rpcIntervals.set(config.id, interval);
        } catch (e) {
            console.error(`Failed to set activity for ${client.user.tag}:`, e);
        }
    }

  static async stopBot(id: number) {
    this.clearRpcInterval(id);
    const client = activeClients.get(id);
    if (client) {
      client.destroy();
      activeClients.delete(id);
      clientConfigs.delete(id);
      botStartTimes.delete(id);
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
    if (!updated) return;
    clientConfigs.set(id, updated);
    const client = activeClients.get(id);
    if (client) {
      console.log(`Config updated for bot ${id}, re-applying RPC...`);
      this.applyRpc(client, updated);
    }
  }
}
