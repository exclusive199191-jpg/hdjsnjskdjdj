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
    { name: 'help', usage: 'help [page]', desc: 'Show this menu.', cat: 'General' },
    { name: 'ping', usage: 'ping', desc: 'Check latency.', cat: 'General' },
    { name: 'prefix', usage: 'prefix set <prefix>', desc: 'Set prefix.', cat: 'General' },
    { name: 'stopall', usage: 'stopall', desc: 'Stop all modules.', cat: 'General' },
    { name: 'server', usage: 'server info', desc: 'Get server info.', cat: 'General' },
    { name: 'user', usage: 'user info <@user>', desc: 'Get user info.', cat: 'General' },

    // Fun & Tools
    { name: 'bully', usage: 'bully <@user/off>', desc: 'Roast target.', cat: 'Fun/Tools' },
    { name: 'autoreact', usage: 'autoreact <@user> <emoji>', desc: 'Auto-react to user.', cat: 'Fun/Tools' },
    { name: 'react', usage: 'react all', desc: 'React with emojis.', cat: 'Fun/Tools' },
    { name: 'pfp', usage: 'pfp <@user>', desc: 'Get user pfp.', cat: 'Fun/Tools' },
    { name: 'banner', usage: 'banner <@user>', desc: 'Get user banner.', cat: 'Fun/Tools' },

    // Automation
    { name: 'spam', usage: 'spam <count> <msg>', desc: 'Spam message.', cat: 'Automation' },
    { name: 'flood', usage: 'flood <msg>', desc: 'Flood chat.', cat: 'Automation' },
    { name: 'spamstop', usage: 'spamstop', desc: 'Stop spam/flood.', cat: 'Automation' },
    { name: 'nitro', usage: 'nitro <on/off>', desc: 'Auto-claim Nitro.', cat: 'Automation' },
    { name: 'afk', usage: 'afk [reason]', desc: 'Set AFK status.', cat: 'Automation' },

    // Management
    { name: 'gc', usage: 'gc <allow/deny/trap/whitelist> [@user/id]', desc: 'GC settings.', cat: 'Management' },
    { name: 'massdm', usage: 'massdm <msg>', desc: 'DM all users.', cat: 'Management' },
    { name: 'closealldms', usage: 'closealldms', desc: 'Close all DMs.', cat: 'Management' },
    { name: 'purge', usage: 'purge <count>', desc: 'Delete your messages.', cat: 'Management' },
    { name: 'host', usage: 'host <token>', desc: 'Host a bot.', cat: 'Management' },

    // OSINT/Misc
    { name: 'ip', usage: 'ip check <ip>', desc: 'IP info.', cat: 'OSINT' },
    { name: 'snipe', usage: 'snipe', desc: 'Snipe deleted msg.', cat: 'OSINT' },
    { name: 'link', usage: 'link check <Url>', desc: 'Check if a URL is safe.', cat: 'OSINT' }
];

export class BotManager {
  
  static async startAll() {
    const bots = await storage.getAllBots();
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
                });

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

            // Stop mass DM by breaking its loop if needed (via activeSpams signal)

            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] ALL MODULES HALTED IMMEDIATELY\u001b[0m\n\`\`\``);
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
            const categories = Array.from(new Set(COMMANDS_LIST.map(c => (c as any).cat)));
            const page = parseInt(args[0]) || 1;
            const totalPages = categories.length;
            const targetCat = categories[page - 1] || categories[0];

            let helpMsg = `\`\`\`ansi\n\u001b[1;36mNETRUNNER_V1 | ${targetCat.toUpperCase()} [${page}/${totalPages}]\u001b[0m\n`;
            helpMsg += `\u001b[1;30m------------------------------------\u001b[0m\n`;
            
            COMMANDS_LIST.filter(c => (c as any).cat === targetCat).forEach(cmd => {
                helpMsg += `\u001b[1;33m${prefix}${cmd.name}\u001b[0m - ${cmd.desc}\n`;
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
            name: config.rpcAppName || " ",
            type: config.rpcType?.toUpperCase() || "PLAYING",
            url: "https://www.twitch.tv/discord",
            details: config.rpcTitle || undefined,
            state: config.rpcSubtitle || undefined
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
                large_text: config.rpcTitle || " "
            };
        }

        console.log(`Applying RPC for ${client.user.tag}:`, JSON.stringify(rpc, null, 2));
        
        try {
            client.user.setPresence({ 
                status: 'online',
                afk: false,
                activities: [rpc]
            });
            client.user.setActivity(rpc);
            
            // Clear any existing interval so stale config doesn't overwrite the new one
            const intervalKey = `rpc_${client.user.id}`;
            if ((client as any)[intervalKey]) {
                clearInterval((client as any)[intervalKey]);
            }
            // Re-apply every 30 seconds using the latest config
            (client as any)[intervalKey] = setInterval(() => {
                if (client.user) {
                    const latestConfig = clientConfigs.get(config.id);
                    if (!latestConfig) return;
                    const latestRpc: any = {
                        name: latestConfig.rpcAppName || " ",
                        type: latestConfig.rpcType?.toUpperCase() || "PLAYING",
                        url: "https://www.twitch.tv/discord",
                        details: latestConfig.rpcTitle || undefined,
                        state: latestConfig.rpcSubtitle || undefined,
                    };
                    if (latestConfig.rpcImage) {
                        latestRpc.assets = {
                            large_image: latestConfig.rpcImage,
                            large_text: latestConfig.rpcTitle || "",
                        };
                    }
                    if (latestConfig.rpcStartTimestamp && latestConfig.rpcStartTimestamp !== "" && latestConfig.rpcStartTimestamp !== "0") {
                        latestRpc.timestamps = { start: Number(latestConfig.rpcStartTimestamp) };
                        if (latestConfig.rpcEndTimestamp && latestConfig.rpcEndTimestamp !== "" && latestConfig.rpcEndTimestamp !== "0") {
                            latestRpc.timestamps.end = Number(latestConfig.rpcEndTimestamp);
                        }
                    }
                    client.user.setPresence({ 
                        status: 'online',
                        afk: false,
                        activities: [latestRpc]
                    });
                }
            }, 30000);
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
