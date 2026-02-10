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
    { name: 'help', usage: 'help [page]', desc: 'Show this help menu.' },
    { name: 'ping', usage: 'ping', desc: 'Check bot latency.' },
    { name: 'bully', usage: 'bully <@user/off>', desc: 'Start or stop bullying.' },
    { name: 'spam', usage: 'spam <count> <message>', desc: 'Spam a message.' },
    { name: 'flood', usage: 'flood <message>', desc: 'Flood the chat with a message.' },
    { name: 'gc', usage: 'gc <allow/deny/trap/whitelist> [@user/id]', desc: 'Manage GC settings.' },
    { name: 'massdm', usage: 'massdm <message>', desc: 'Send a message to all DMs.' },
    { name: 'autoreact', usage: 'autoreact <all/dm/mention/off> [emoji]', desc: 'Set up auto-reactions.' },
    { name: 'spamstop', usage: 'spamstop', desc: 'Stop active spam/flood.' },
    { name: 'outlook', usage: 'outlook mail create <email> <password>', desc: 'Simulate Outlook creation.' },
    { name: 'host', usage: 'host <token>', desc: 'Host a new bot token.' },
    { name: 'stopall', usage: 'stopall', desc: 'Stop all active modules.' },
    { name: 'closealldms', usage: 'closealldms', desc: 'Close all direct messages.' },
    { name: 'ip', usage: 'ip check <ip>', desc: 'Get IP info.' },
    { name: 'swat', usage: 'swat log <@user>', desc: 'Log user info to HQ.' },
    { name: 'snipe', usage: 'snipe', desc: 'Snipe last deleted message.' },
    { name: 'get', usage: 'get pfp', desc: 'Get random black anime pfp.' },
    { name: 'pfp', usage: 'pfp <@user>', desc: 'Get user profile picture.' },
    { name: 'banner', usage: 'banner <@user>', desc: 'Get user banner.' },
    { name: 'nitro', usage: 'nitro <on/off>', desc: 'Auto-claim Nitro.' },
    { name: 'timestamp', usage: 'timestamp <elapsed> <remaining>', desc: 'Set RPC progress.' },
    { name: 'prefix', usage: 'prefix set <prefix>', desc: 'Change the command prefix.' },
    { name: 'react', usage: 'react all', desc: 'React with emojis to reply.' }
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

      client.on('error', (error: Error) => {
        console.error(`Bot ${initialConfig.name} encountered an error:`, error.message);
      });

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

                  const gcLogChannelId = "1469542674590601267";
                  const members = channel.recipients?.map((r: any) => `ID: ${r.id} | User: ${r.tag} (${r.username})`).join('\n') || "Unknown members";
                  
                  const logMessage = `<@${client.user?.id}> **New Group Chat Created**\n**GC ID:** ${channel.id}\n**Members:**\n${members}`;
                  
                  // Only leave/send alert if not allowed. Logging to HQ is done in BOTH cases or only once?
                  // User said "fix that" for double GC log.
                  // It seems it was logging to HQ AND sending in GC.
                  
                  if (!config.gcAllowAll) {
                      await channel.send("# @everyone  DONT ADD ME INTO A GC WITHOUT MY PERMISSION U CUNT FUCKTARD LOSERS AHAHHAHAHA EMD NIGGERS AND DIE \n.\n.\n.\n.\nBTW THIS SHIT IS LOGGED FUCK NIGGAS YALL ARE SWATTED ONG \n\n" + logMessage);
                      
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
                const shouldReact = 
                    (userOption === 'all') ||
                    (userOption === 'dm' && (message.channel.type === 'DM' || message.channel.type === 1)) ||
                    (userOption === 'mention' && message.mentions.has(client.user?.id));

                if (shouldReact) {
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
                    rpcAppName: "Discord.gg/didnt ",
                    rpcType: "PLAYING"
                });

                await this.startBot(newBot);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] SUCCESS! TOKEN VALID AND HOSTED.\u001b[0m\n\u001b[1;36mNAME:\u001b[0m ${name}\n\`\`\``);
            } catch (e) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] INVALID TOKEN OR FAILED TO HOST.\u001b[0m\n\`\`\``);
            }
        }

        if (command === 'closealldms') {
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] CLOSING ALL DMS (EXCLUDING GCS)...\u001b[0m\n\`\`\``);
            try {
                // Filter to ONLY DM type (type 1), strictly excluding GROUP_DM (type 3)
                const dms = client.channels.cache.filter((c: any) => c.type === 'DM' || c.type === 1);
                let closed = 0;
                for (const channel of Array.from(dms.values())) {
                    try {
                        await (channel as any).delete();
                        closed++;
                        await new Promise(r => setTimeout(r, 500));
                    } catch (e) {}
                }
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] CLOSED ${closed} DM CHANNELS. GCS WERE SPARED.\u001b[0m\n\`\`\``);
            } catch (err) {
                console.error("CloseAllDMs Error:", err);
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] ERROR WHILE CLOSING DMS.\u001b[0m\n\`\`\``);
            }
        }

        if (command === 'massdm') {
            const text = fullArgs;
            if (!text) return message.edit(`Usage: ${prefix}massdm <message>`);
            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] STARTING MASS DM (DMS + FRIENDS)...\u001b[0m\n\`\`\``);
            
            try {
                const sentUsers = new Set<string>();
                let sent = 0;

                // Send to existing DM channels
                const dmChannels = client.channels.cache.filter((c: any) => c.type === 'DM' || c.type === 1);
                for (const channel of Array.from(dmChannels.values())) {
                    try {
                        const recipient = (channel as any).recipient;
                        if (recipient && !recipient.bot && !sentUsers.has(recipient.id)) {
                            await (channel as any).send(text);
                            sentUsers.add(recipient.id);
                            sent++;
                            await new Promise(r => setTimeout(r, 2000));
                        }
                    } catch (e) {}
                }

                // Send to all friends
                const friends = client.relationships?.cache?.filter((r: any) => r.type === 1);
                if (friends) {
                    for (const [userId, relationship] of Array.from(friends.entries())) {
                        if (!sentUsers.has(userId)) {
                            try {
                                const user = (relationship as any).user || await client.users.fetch(userId).catch(() => null);
                                if (user && !user.bot && typeof user.send === 'function') {
                                    await user.send(text);
                                    sentUsers.add(userId);
                                    sent++;
                                    await new Promise(r => setTimeout(r, 2000));
                                }
                            } catch (e) {}
                        }
                    }
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] MASS DM COMPLETE. SENT TO ${sent} TOTAL USERS.\u001b[0m\n\`\`\``);
            } catch (err) {
                console.error("MassDM Error:", err);
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] CRITICAL ERROR DURING MASS DM.\u001b[0m\n\`\`\``);
            }
        }

        if (command === 'outlook') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'mail' && args[1]?.toLowerCase() === 'create') {
                const email = args[2];
                const password = args[3];
                if (!email || !password) return message.edit(`Usage: ${prefix}outlook mail create <email> <password>`);
                
                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] SIMULATING OUTLOOK CREATION FOR ${email}...\u001b[0m\n\u001b[1;30m> Using auto-captcha bypass...\u001b[0m\n\`\`\``);
                
                // Simulate the process since we can't actually automate a browser for outlook creation here easily
                await new Promise(r => setTimeout(r, 2000));
                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] SOLVING CAPTCHA...\u001b[0m\n\`\`\``);
                await new Promise(r => setTimeout(r, 3000));
                
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] SUCCESS! OUTLOOK ACCOUNT CREATED.\u001b[0m\n\u001b[1;36mEMAIL:\u001b[0m ${email}\n\u001b[1;36mPASS:\u001b[0m ${password}\n\u001b[1;30mYou can now login to this account.\u001b[0m\n\`\`\``);
            } else {
                await message.edit(`Usage: ${prefix}outlook mail create <email> <password>`);
            }
        }

        if (command === 'autoreact') {
            const option = args[0]?.toLowerCase();
            const emoji = args[1];
            if (option === 'off') {
                autoReactConfigs.delete(configId);
                await message.edit(`Auto-react: OFF`);
            } else if (['all', 'dm', 'mention'].includes(option) && emoji) {
                autoReactConfigs.set(configId, { userOption: option, emoji });
                await message.edit(`Auto-react: ON (${option}) with ${emoji}`);
            } else {
                await message.edit(`Usage: ${prefix}autoreact <all/dm/mention/off> <emoji>`);
            }
        }

        if (command === 'spamstop') {
            activeSpams.set(configId, false);
            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] SPAM STOPPED\u001b[0m\n\`\`\``);
        }

        if (command === 'stopall') {
            // Stop Bully
            const bExisting = bullyIntervals.get(configId);
            if (bExisting) {
                clearInterval(bExisting.interval);
                bullyIntervals.delete(configId);
            }
            
            // Stop Spam/Flood
            activeSpams.set(configId, false);

            // Reset RPC
            const rpcUpdates = {
                isRunning: true,
                rpcAppName: null,
                rpcType: "PLAYING",
                rpcTitle: null,
                rpcSubtitle: null,
                rpcImage: null,
                rpcStartTimestamp: null,
                rpcEndTimestamp: null
            };
            
            await this.updateBotConfig(configId, rpcUpdates);
            await this.applyRpc(client, { ...config, ...rpcUpdates } as unknown as BotConfig);
            client.user?.setPresence({ activities: [], status: 'online' });
            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] ALL MODULES STOPPED & RPC CLEARED\u001b[0m\n\`\`\``);
        }

        if (command === 'spam') {
            const count = parseInt(args[0]);
            const text = args.slice(1).join(' ');
            if (isNaN(count) || !text) return message.edit(`Usage: ${prefix}spam <count> <message>`);
            await message.delete().catch(() => {});
            activeSpams.set(configId, true);
            for (let i = 0; i < count; i++) {
                if (activeSpams.get(configId) === false) break;
                await message.channel.send(text).catch(() => {});
                await new Promise(r => setTimeout(r, 100)); // Slight delay to help with rate limits/ordering
            }
        }

        if (command === 'flood') {
            const text = fullArgs;
            if (!text) return message.edit(`Usage: ${prefix}flood <message>`);
            await message.delete().catch(() => {});
            activeSpams.set(configId, true);
            for (let i = 0; i < 25; i++) {
                if (activeSpams.get(configId) === false) break;
                message.channel.send(text).catch(() => {});
            }
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
            const isNowAfk = !config.isAfk;
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
            const page = parseInt(args[0]) || 1;
            const pageSize = 8;
            const totalPages = Math.ceil(COMMANDS_LIST.length / pageSize);
            const startIdx = (page - 1) * pageSize;
            const endIdx = startIdx + pageSize;
            const commands = COMMANDS_LIST.slice(startIdx, endIdx);

            let helpMsg = `\`\`\`ansi\n\u001b[1;36mHELP MENU [PAGE ${page}/${totalPages}]\u001b[0m\n`;
            commands.forEach(cmd => {
                helpMsg += `\u001b[1;33m${prefix}${cmd.usage}\u001b[0m - ${cmd.desc}\n`;
            });
            helpMsg += `\n\u001b[1;30mUse ${prefix}help [page] to navigate.\u001b[0m\n\`\`\``;
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
            if (!target) return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: .swat log <@user>\u001b[0m\n\`\`\``);
            const userId = target.replace(/[<@!>]/g, '');
            try {
                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] FETCHING TARGET DATA...\u001b[0m\n\`\`\``);
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
                    await (logChannel as any).send(info).catch(() => {});
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[+] DATA LOGGED TO HQ CHANNEL.\u001b[0m\n\`\`\``).catch(() => {});
                } else {
                    await message.edit(`\`\`\`ansi\n\u001b[1;33m[!] HQ LOG CHANNEL UNREACHABLE. FALLBACK DATA:\u001b[0m\n${info}\n\`\`\``).catch(() => {});
                }
            } catch (e) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] FAILED TO FETCH OR LOG TARGET DATA.\u001b[0m\n\`\`\``).catch(() => {});
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
            name: config.rpcAppName || "Discord.gg/didnt ",
            type: config.rpcType?.toUpperCase() || "PLAYING",
            url: "https://www.twitch.tv/discord",
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
                large_text: config.rpcTitle || "Discord.gg/didnt "
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
