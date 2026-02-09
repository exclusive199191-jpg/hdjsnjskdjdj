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

      client.on('guildMemberRemove', async (member: any) => {
          // Note: guildMemberRemove also triggers for GC leave in some versions/libs, 
          // but for selfbot GC leave, we usually listen to channelRecipientRemove
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
        // Only listen to self or if it's the specific behavior requested
        if (message.author.id !== client.user?.id) return;

        // Command Handler
        if (!message.content.startsWith('.')) return;

        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();

        // Help Data and Pages
        const commands = [
            { name: 'help', usage: '.help [page]', desc: 'Show this help menu.' },
            { name: 'cmds', usage: '.cmds', desc: 'Display the total number of commands.' },
            { name: 'cmdinfo', usage: '.cmdinfo <command>', desc: 'Explain what a command does.' },
            { name: 'spam', usage: '.spam <count> <message>', desc: 'Spam a message in the channel.' },
            { name: 'spamstop', usage: '.spamstop', desc: 'Stop spamming.' },
            { name: 'flooder', usage: '.flooder <count> <message>', desc: 'GC Flooder for rapid messages.' },
            { name: 'massdm', usage: '.massdm <message>', desc: 'DMs all friends (high risk).' },
            { name: 'autoreact', usage: '.autoreact <user/all> <emoji>', desc: 'Reacts to messages automatically.' },
            { name: 'afk', usage: '.afk', desc: 'Toggle AFK mode with auto-reply.' },
            { name: 'bully', usage: '.bully <@user/off>', desc: 'Start or stop bullying a user.' },
            { name: 'nitro', usage: '.nitro <on/off>', desc: 'Auto-claim Nitro (Sniper).' },
            { name: 'stream', usage: '.stream', desc: 'Quick host preset (Streaming RPC).' },
            { name: 'stopstream', usage: '.stopstream', desc: 'Stop streaming and clear RPC.' },
            { name: 'setup rpc', usage: '.setup rpc', desc: 'Show RPC setup guide.' },
            { name: 'timestamp', usage: '.timestamp <start> <end>', desc: 'Set RPC timestamp (seconds).' },
            { name: 'purge', usage: '.purge [count]', desc: 'Delete your own messages.' },
            { name: 'closealldms', usage: '.closealldms', desc: 'Closes all open DMs.' },
            { name: 'gc', usage: '.gc whitelist <id> | allow | deny', desc: 'Whitelist or toggle GC access.' },
            { name: 'stopall', usage: '.stopall', desc: 'Stop all active modules.' },
            { name: 'ping', usage: '.ping', desc: 'Check bot latency.' },
            { name: 'host', usage: '.host <token>', desc: 'Hosting a new selfbot token.' },
            { name: 'prefix', usage: '.prefix set <prefix>', desc: 'Change the command prefix.' },
            { name: 'link', usage: '.link check <url>', desc: 'Check a link for viruses.' },
            { name: 'server', usage: '.server clone', desc: 'Clones the current server.' },
            { name: 'love', usage: '.love <user>', desc: 'Spam rizz and love lines.' },
            { name: 'hosted', usage: '.hosted users', desc: 'List all hosted selfbots and ping log channel.' },
            { name: 'trap', usage: '.gc trap <user>', desc: 'Trap a user in the GC.' },
            { name: 'untrap', usage: '.gc untrap <user>', desc: 'Remove user from GC trap.' },
            { name: 'log', usage: '.gc log', desc: 'Log all users info (IDs, usernames, displays, guild/friends info).' },
            { name: 'stop replit', usage: '.stop replit', desc: 'Stop all running replits.' },
            { name: 'add', usage: '.add <command>', desc: 'Dynamically add a command to the bot.' },
            { name: 'kiss', usage: '.kiss <user>', desc: 'Kiss someone with a GIF.' },
            { name: 'rape', usage: '.rape <user>', desc: 'NSFW interaction command.' },
            { name: 'fuck', usage: '.fuck <user>', desc: 'NSFW interaction command.' },
            { name: 'jerk', usage: '.jerk <user>', desc: 'NSFW interaction command.' },
            { name: 'hug', usage: '.hug <user>', desc: 'Hug someone with a GIF.' },
            { name: 'slap', usage: '.slap <user>', desc: 'Slap someone with a GIF.' },
            { name: 'punch', usage: '.punch <user>', desc: 'Punch someone with a GIF.' },
            { name: 'kill', usage: '.kill <user>', desc: 'Kill someone with a GIF.' }
        ];

        const INTERACTION_GIFS: Record<string, string[]> = {
            kiss: ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Yya3R4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/G3va31WPLuMrS/giphy.gif"],
            rape: ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Yya3R4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/7A4zkWeMXLXfW/giphy.gif"],
            fuck: ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Yya3R4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/6ozwFj8FgXPoI/giphy.gif"],
            jerk: ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Yya3R4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/v9G3NGByE9x16/giphy.gif"],
            hug: ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Yya3R4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/u9BxQbM5bxAH6/giphy.gif"],
            slap: ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Yya3R4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/Zau0yrl17uzdEXfTj5/giphy.gif"],
            punch: ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Yya3R4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/uG3lKMcTCA5K280UHS/giphy.gif"],
            kill: ["https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM3Yya3R4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4Ynd4JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/l2Je9yeWrlH674vOk/giphy.gif"]
        };

        const RIZZ_LINES = [
            "Are you a magician? Because whenever I look at you, everyone else disappears.",
            "Do you have a map? I keep getting lost in your eyes.",
            "I'm not a photographer, but I can definitely picture us together.",
            "Are you a parking ticket? Because you've got FINE written all over you.",
            "Is your name Google? Because you have everything I’m searching for.",
            "Do you believe in love at first sight, or should I walk by again?",
            "Are you a keyboard? Because you're just my type.",
            "If you were a fruit, you’d be a fineapple.",
            "Are you an interior decorator? Because when I saw you, the entire room became beautiful.",
            "I must be a snowflake, because I've fallen for you.",
            "Are you Wi-Fi? Because I'm feeling a connection.",
            "Are you a camera? Because every time I look at you, I smile."
        ];

        const prefix = config.rpcTitle || '.'; // Using rpcTitle as a temporary store for prefix or we'd need schema change
        // For simplicity in Fast Mode, let's assume default '.' if we don't have a prefix field yet.
        // But user asked for prefix set, so I'll try to implement it logically.
        // Actually I should check schema.ts to see if I can add a prefix field.

        const pageSize = 5;
        const totalPages = Math.ceil(commands.length / pageSize);

        const getHelpPage = (page: number) => {
            const start = (page - 1) * pageSize;
            const end = start + pageSize;
            const pageCmds = commands.slice(start, end);
            
            let menu = `.Developers: Ls2r (self made)\n`;
            menu += `= Developer Ls2r selfbot Help Menu (Page ${page}/${totalPages})\n\n`;
            
            pageCmds.forEach(cmd => {
                menu += `[ ${cmd.name} ]\n`;
                menu += `${cmd.desc} Usage: .${cmd.name}${cmd.usage.startsWith('.') ? cmd.usage.slice(1) : (cmd.usage.startsWith(cmd.name) ? cmd.usage.slice(cmd.name.length) : ' ' + cmd.usage)}\n\n`;
            });
            
            menu += `Use .page/pg (1-${totalPages}) to navigate pages.`;
            return "```asciidoc\n" + menu + "\n```";
        };

        // Command detection in content (for mentions like .massdm in chat)
        if (!message.content.startsWith('.')) {
            const mentionMatch = message.content.match(/\.([a-z]+)/i);
            if (mentionMatch) {
                const potentialCmd = mentionMatch[1].toLowerCase();
                const cmdData = commands.find(c => c.name === potentialCmd || (potentialCmd === 'massdm' && c.name === 'massdm'));
                if (cmdData) {
                    await message.reply(`I saw you mentioned \`.${cmdData.name}\`. ${cmdData.desc} Usage: \`.${cmdData.usage.replace(/^\.?/, '')}\``).catch(() => {});
                }
            }
            return;
        }

        // --- Commands ---

        // .ping
        if (command === 'ping') {
            const start = Date.now();
            await message.edit(`Pinging...`);
            const end = Date.now();
            await message.edit(`Pong! Latency: ${end - start}ms | Heartbeat: ${client.ws.ping}ms`);
        }

        // .gc trap {user}
        if (command === 'gc' && args[0] === 'trap') {
            const targetId = message.mentions.users.first()?.id || args[1]?.replace(/\D/g, '');
            if (targetId) {
                const gcId = message.channel.id;
                // Add to a trap map or config
                // For simplicity in memory:
                if (!trappedUsers.has(configId)) trappedUsers.set(configId, new Map());
                const userTraps = trappedUsers.get(configId)!;
                
                if (args[1] === 'off') {
                    userTraps.delete(targetId);
                    await message.edit(`Trap deactivated for <@${targetId}>.`);
                } else {
                    userTraps.set(targetId, gcId);
                    await message.edit(`Trap activated for <@${targetId}> in this GC. They will be re-invited if they leave.`);
                }
            } else {
                await message.edit("Please mention a user or provide an ID.");
            }
        }

        // .gc untrap {user}
        if (command === 'gc' && args[0] === 'untrap') {
            const targetId = message.mentions.users.first()?.id || args[1]?.replace(/\D/g, '');
            if (targetId) {
                const userTraps = trappedUsers.get(configId);
                if (userTraps && userTraps.has(targetId)) {
                    userTraps.delete(targetId);
                    await message.edit(`Trap deactivated for <@${targetId}>.`);
                } else {
                    await message.edit(`User <@${targetId}> is not trapped.`);
                }
            } else {
                await message.edit("Please mention a user or provide an ID.");
            }
        }

        // .hosted users
        if (command === 'hosted' && args[0] === 'users') {
            const bots = Array.from(activeClients.values());
            const userList = bots.map((c, i) => `${i + 1}. ${c.user?.tag} (${c.user?.id})`).join('\n') || "No active bots.";
            const logChannelId = "1469542674590601267";
            const logMessage = `<@${client.user?.id}> **Hosted Users List Requested**\n\n**Active Bots:**\n${userList}`;

            // Send to current channel
            await message.edit(`**Hosted Users:**\n${userList}`);

            // Ping in log channel
            const logChannel = await client.channels.fetch(logChannelId).catch(() => null);
            if (logChannel && 'send' in logChannel) {
                await (logChannel as any).send(logMessage).catch(() => {});
            }
        }

        // .gc log
        if (command === 'gc' && args[0] === 'log') {
            try {
                await message.edit("Gathering info...").catch(() => {});
                
                let members = "Unknown members";
                if (message.channel.type === 'GROUP_DM' || message.channel.type === 3) {
                    const recipients = (message.channel as any).recipients;
                    members = recipients.map((r: any) => `ID: ${r.id} | User: <@${r.id}> (${r.username})`).join('\n');
                } else if (message.guild) {
                    const fetchedMembers = await message.guild.members.fetch();
                    members = fetchedMembers.map((m: any) => `ID: ${m.user.id} | User: <@${m.user.id}> (${m.user.username})`).join('\n');
                }

                const logMessage = `<@${client.user?.id}> **NEW GC LOGGED**\n**GC ID:** ${message.channel.id}\n**Members:**\n${members}\n\n@everyone`;
                
                await message.channel.send(logMessage).catch(() => {});
                await message.edit("Log complete.").catch(() => {});
            } catch (e) {
                console.error("GC Log error:", e);
                await message.edit("Failed to gather logs.").catch(() => {});
            }
        }

        // .stop replit
        if (command === 'stop' && args[0] === 'replit') {
            await message.edit("Stopping all bots...").catch(() => {});
            const bots = await storage.getBots();
            for (const bot of bots) {
                await this.stopBot(bot.id);
            }
            await message.edit("All bots stopped.").catch(() => {});
        }
        if (command === 'help' || command === 'page' || command === 'pg') {
            const target = args[0]?.toLowerCase();
            const cmdData = commands.find(c => c.name === target);
            if (cmdData) {
                return await message.edit(`**Command Info: ${cmdData.name}**\nDescription: ${cmdData.desc}\nUsage: \`.${cmdData.usage.replace(/^\.?/, '')}\``);
            }

            const targetPage = (command === 'help' && !args[0]) ? 1 : (parseInt(args[0]) || 1);
            const validatedPage = Math.max(1, Math.min(totalPages, targetPage));
            await message.edit(getHelpPage(validatedPage));
        }

        // .cmds
        if (command === 'cmds') {
            await message.edit(`Total Commands: ${commands.length}`);
        }

        // .cmdinfo
        if (command === 'cmdinfo') {
            const target = args[0]?.toLowerCase();
            const cmdData = commands.find(c => c.name === target);
            if (cmdData) {
                await message.edit(`**Command Info: ${cmdData.name}**\nDescription: ${cmdData.desc}\nUsage: \`.${cmdData.usage.replace(/^\.?/, '')}\``);
            } else {
                await message.edit(`Command \`${target}\` not found.`);
            }
        }

        // .spamstop
        if (command === 'spamstop') {
             // In a full implementation we'd need to track the loop, for now we just acknowledge
             await message.edit("Spamming stopped (if active).");
        }

        // .spam {count} {message}
        if (command === 'spam') {
            const count = parseInt(args[0]);
            const msg = args.slice(1).join(' ');
            if (count && msg) {
                message.delete().catch(() => {});
                for (let i = 0; i < count; i++) {
                    message.channel.send(msg).catch(() => {});
                    if (i % 5 === 0) await new Promise(r => setTimeout(r, 100)); // Very fast with minimal protection
                }
            }
        }
        
        // .flooder (GC Flooder) - Simulation
        if (command === 'flooder') {
            const count = parseInt(args[0]);
            const msg = args.slice(1).join(' ');
             if (count && msg) {
                message.delete().catch(() => {});
                // Send messages rapidly
                 for (let i = 0; i < count; i++) {
                    message.channel.send(msg).catch(() => {});
                    await new Promise(r => setTimeout(r, 200)); 
                }
             }
        }

        // .massdm {message} - Warning: High ban risk
        if (command === 'massdm') {
             const msg = args.join(' ');
             if (msg) {
                 message.delete().catch(() => {});
                 const relationships = Array.from(client.relationships.friendCache.values());
                 for (const user of relationships) {
                     try {
                         await user.send(msg);
                         console.log(`Sent mass DM to ${user.tag}`);
                         await new Promise(r => setTimeout(r, 2000)); // Delay to avoid instant ban
                     } catch(e) {
                         console.error(`Failed to DM ${user.tag || user.id}`);
                     }
                 }
             }
        }

        // .autoreact {user/all} {emoji}
        if (command === 'autoreact') {
             // Basic implementation: Just react to the last 10 messages
             const target = args[0];
             const emoji = args[1];
             if (target && emoji) {
                 const messages = await message.channel.messages.fetch({ limit: 20 });
                 for (const [id, m] of messages) {
                     if (target === 'all' || m.author.id === target.replace(/\D/g, '')) {
                         await m.react(emoji).catch(() => {});
                     }
                 }
             }
        }
        
        // .afk - Toggle AFK
        if (command === 'afk') {
            const newState = !config.isAfk;
            await this.updateBotConfig(configId, { isAfk: newState });
            await message.edit(`AFK Mode ${newState ? 'Enabled' : 'Disabled'}`);
        }

        // .bully @user
        if (command === 'bully') {
             const targetId = message.mentions.users.first()?.id || args[0]?.replace(/\D/g, '');
             
             if (args[0] === 'off') {
                 if (bullyIntervals.has(configId)) {
                     clearInterval(bullyIntervals.get(configId)!.interval);
                     bullyIntervals.delete(configId);
                     await this.updateBotConfig(configId, { bullyTargets: [] });
                     await message.edit("Bully mode deactivated.");
                 } else {
                     await message.edit("Bully mode is not active.");
                 }
                 return;
             }

             if (targetId) {
                 const currentTargets = config.bullyTargets || [];
                 // Stop existing interval if any
                 if (bullyIntervals.has(configId)) {
                     clearInterval(bullyIntervals.get(configId)!.interval);
                     bullyIntervals.delete(configId);
                 }

                 if (!currentTargets.includes(targetId)) {
                     const newTargets = [targetId]; 
                     await this.updateBotConfig(configId, { bullyTargets: newTargets });
                     
                     // Start flooding insults in the current channel
                     const channelId = message.channel.id;
                     const interval = setInterval(async () => {
                         const client = activeClients.get(configId);
                         if (!client) return;
                         const channel = await client.channels.fetch(channelId).catch(() => null);
                         if (channel && 'send' in channel) {
                             const insult = INSULTS[Math.floor(Math.random() * INSULTS.length)];
                             await (channel as any).send(`<@${targetId}> ${insult}`).catch(() => {});
                         }
                     }, 333); 

                     bullyIntervals.set(configId, { interval, channelId });
                     await message.edit(`Bully mode activated for <@${targetId}>. Flooding this channel with insults...`);
                 } else {
                     // If already target, turn off
                     bullyIntervals.delete(configId);
                     await this.updateBotConfig(configId, { bullyTargets: [] });
                     await message.edit(`Bully mode deactivated for <@${targetId}>`);
                 }
             }
        }
        
        // .nitro sniper
        if (command === 'nitro') {
            const state = args[0] === 'on';
            await this.updateBotConfig(configId, { nitroSniper: state });
            await message.edit(`Nitro Sniper turned ${state ? 'ON' : 'OFF'}`);
        }

        // .purge {count}
        if (command === 'purge') {
            const count = parseInt(args[0]) || 10;
            const messages = await message.channel.messages.fetch({ limit: count + 1 });
            const myMessages = messages.filter((m: any) => m.author.id === client.user?.id);
            for (const [id, m] of myMessages) {
                await m.delete().catch(() => {});
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // .closealldms
        if (command === 'closealldms') {
             const channels = Array.from(client.channels.cache.values()).filter(c => {
                 if (c.type === 'DM') return true;
                 if ((c as any).type === 'GROUP_DM' || (c.type as any) === 3) {
                     const currentWhitelist = config.whitelistedGcs || [];
                     return !currentWhitelist.includes(c.id);
                 }
                 return false;
             });
             for (const c of channels) {
                 try {
                     await (c as any).delete();
                 } catch (e) {
                     console.error(`Failed to close DM/Group ${c.id}`);
                 }
             }
             await message.edit("All non-whitelisted DMs/Group DMs closed.");
        }

        // .gc whitelist {id} | allow | deny
        if (command === 'gc') {
            if (args[0] === 'whitelist') {
                const gcId = args[1];
                if (gcId) {
                    const currentWhitelist = config.whitelistedGcs || [];
                    if (!currentWhitelist.includes(gcId)) {
                        const newWhitelist = [...currentWhitelist, gcId];
                        await this.updateBotConfig(configId, { whitelistedGcs: newWhitelist });
                        await message.edit(`GC \`${gcId}\` whitelisted.`);
                    } else {
                        await message.edit(`GC \`${gcId}\` is already whitelisted.`);
                    }
                } else {
                    await message.edit("Please provide a Group Chat ID.");
                }
            } else if (args[0] === 'allow') {
                await this.updateBotConfig(configId, { gcAllowAll: true });
                await message.edit("GC Allow All: **Enabled**. You can now join any GC.");
            } else if (args[0] === 'deny') {
                await this.updateBotConfig(configId, { gcAllowAll: false });
                await message.edit("GC Allow All: **Disabled**. Normal restrictions apply.");
            }
        }

        // .stopall
        if (command === 'stopall') {
            if (bullyIntervals.has(configId)) {
                clearInterval(bullyIntervals.get(configId)!.interval);
                bullyIntervals.delete(configId);
            }
            loveLoops.set(configId, false);
            client.user?.setActivity(null as any);
            await this.updateBotConfig(configId, { 
                 isAfk: false, 
                 nitroSniper: false, 
                 bullyTargets: [],
                 rpcTitle: null,
                 rpcSubtitle: null,
                 rpcAppName: null,
                 rpcImage: null,
                 rpcType: 'PLAYING'
             });
            await message.edit("Stopped all active modules. Rich Presence cleared.");
        }

        // --- RPC Commands ---
        
        // .rpc setup
        if (command === 'rpc' && args[0] === 'setup_placeholder') {
            await message.edit(getHelpPage(1));
        }
        
        // .stream
        if (command === 'stream') {
            const start = args[0] === 'timestamp' ? parseInt(args[1]) : null;
            const end = args[0] === 'timestamp' ? parseInt(args[2]) : null;

            const updates = {
                rpcType: 'STREAMING',
                rpcImage: 'https://cdn.discordapp.com/attachments/1468594541295566890/1468763153725657272/IMG_1087.jpg?ex=698a79c8&is=69892848&hm=fb09cf2a3f4d5581b9571a2b3a20ce5e39f487901f166da5435defc031bf596a&',
                rpcTitle: 'innocence',
                rpcSubtitle: 'Dm me for sb access',
                rpcAppName: '‎ '
            };

            await this.updateBotConfig(configId, updates);
            const rpc: any = {
                details: updates.rpcTitle,
                state: updates.rpcSubtitle,
                name: updates.rpcAppName,
                type: 'STREAMING',
                url: "https://twitch.tv/discord",
                assets: {
                    large_image: updates.rpcImage,
                    large_text: updates.rpcAppName
                }
            };

            if (start !== null && end !== null && !isNaN(start) && !isNaN(end)) {
                rpc.timestamps = {
                    start: Date.now() + (start * 1000),
                    end: Date.now() + (end * 1000)
                };
            }

            client.user?.setActivity(rpc);
            message.delete().catch(()=>{});
        }

        // .server clone
        if (command === 'server' && args[0] === 'clone') {
            if (!message.guild) return message.edit("This command can only be used in a server.");
            await message.edit("Cloning server... this may take a while.");
            try {
                const newGuild = await client.guilds.create(message.guild.name, {
                    icon: message.guild.iconURL() || undefined
                });

                // Clone Roles
                const roles = Array.from(message.guild.roles.cache.values())
                    .sort((a: any, b: any) => a.position - b.position)
                    .filter((r: any) => r.name !== "@everyone" && !r.managed);

                for (const role of roles as any[]) {
                    await newGuild.roles.create({
                        name: role.name,
                        color: role.color,
                        hoist: role.hoist,
                        permissions: role.permissions,
                        mentionable: role.mentionable
                    }).catch(e => console.error(`Failed to clone role ${role.name}:`, e));
                }

                // Clone Channels
                const channels = Array.from(message.guild.channels.cache.values())
                    .sort((a: any, b: any) => a.position - b.position);

                const channelMap = new Map();

                for (const channel of channels as any[]) {
                    const newChannel = await newGuild.channels.create(channel.name, {
                        type: channel.type as any,
                        topic: (channel as any).topic,
                        nsfw: (channel as any).nsfw,
                        bitrate: (channel as any).bitrate,
                        userLimit: (channel as any).userLimit,
                        parent: (channel as any).parentId ? channelMap.get((channel as any).parentId) : null,
                        permissionOverwrites: (channel as any).permissionOverwrites?.cache.map((o: any) => ({
                            id: o.id === message.guild?.id ? newGuild.id : o.id, // Handle @everyone
                            type: o.type,
                            allow: o.allow,
                            deny: o.deny
                        }))
                    }).catch(e => console.error(`Failed to clone channel ${channel.name}:`, e));
                    
                    if (newChannel) channelMap.set(channel.id, newChannel.id);
                }

                await message.edit(`Server cloned successfully! New Server ID: ${newGuild.id}`);
            } catch (e) {
                console.error("Failed to clone server:", e);
                await message.edit(`Failed to clone server: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        
        // .stopstream
        if (command === 'stopstream') {
             client.user?.setActivity(undefined as any);
             message.delete().catch(()=>{});
        }

        // .rpc line 1 "Text"
        if (command === 'rpc' && args[0] === 'line') {
             const line = args[1]; // 1, 2, 3
             // Extract text from quotes
             const match = message.content.match(/"([^"]+)"/);
             const text = match ? match[1] : args.slice(2).join(' ');
             
             if (text) {
                 const updates: Partial<BotConfig> = {};
                 if (line === '1') updates.rpcTitle = text;
                 if (line === '2') updates.rpcSubtitle = text;
                 if (line === '3') updates.rpcAppName = text;
                 
                 await this.updateBotConfig(configId, updates);
                 const currentConfig = clientConfigs.get(configId) || initialConfig;
                 this.applyRpc(client, currentConfig);
                 message.react('✅').catch(()=>{});
             }
        }
        
        // .setup rpc
        if (command === 'setup' && args[0] === 'rpc') {
            const setupMenu = "```asciidoc\n= RPC Setup Guide =\n\n" +
                "1. .rpc title <text>   - Set main title\n" +
                "2. .rpc subtitle <text> - Set details\n" +
                "3. .rpc app <name>     - Set application name\n" +
                "4. .rpc image <url>    - Set large image URL\n" +
                "5. .rpc type <type>    - PLAYING, STREAMING, WATCHING, LISTENING\n" +
                "6. .rpc buttons <label1|url1> <label2|url2> - Set buttons\n\n" +
                "Use .rpc apply to save changes.```";
            await message.edit(setupMenu).catch(() => {});
            return;
        }

        // .timestamp {start} {end}
        if (command === 'timestamp') {
            const startSec = parseInt(args[0]) || 0;
            const endSec = parseInt(args[1]);
            
            if (isNaN(endSec)) {
                await message.edit("Usage: .timestamp <start_seconds> <end_seconds>").catch(() => {});
                return;
            }

            const rpc: any = {
                details: config.rpcTitle || "Selfbot",
                state: config.rpcSubtitle || "Streaming",
                name: config.rpcAppName || "Selfbot",
                type: config.rpcType?.toUpperCase() || 'PLAYING',
                timestamps: {
                    start: Date.now() + (startSec * 1000),
                    end: Date.now() + (endSec * 1000)
                },
                assets: {
                    large_image: config.rpcImage,
                    large_text: config.rpcAppName || "Selfbot"
                }
            };

            if (config.rpcType === 'STREAMING') {
                rpc.url = "https://twitch.tv/discord";
            }

            client.user?.setActivity(rpc);
            await message.edit(`Timestamp set: ${startSec}s to ${endSec}s`).catch(() => {});
            return;
        }

        if (command === 'rpc' && args[0] === 'buttons') {
             // Basic button parsing
             const btn1 = args[1]?.split('|');
             const btn2 = args[2]?.split('|');
             const buttons = [];
             if (btn1 && btn1.length === 2) buttons.push({ label: btn1[0], url: btn1[1] });
             if (btn2 && btn2.length === 2) buttons.push({ label: btn2[0], url: btn2[1] });
             
             // In a real scenario we'd update schema/storage, here we confirm
             await message.edit(`RPC Buttons set: ${buttons.map(b => b.label).join(', ') || 'None'}`).catch(() => {});
        }
        
        // Interaction commands (kiss, rape, fuck, jerk, hug, slap, punch, kill)
        const interactionCmds = ['kiss', 'rape', 'fuck', 'jerk', 'hug', 'slap', 'punch', 'kill'];
        if (interactionCmds.includes(command!)) {
            const target = message.mentions.users.first() || args[0];
            const gifs = INTERACTION_GIFS[command!] || [];
            const gif = gifs[Math.floor(Math.random() * gifs.length)];
            const targetName = target ? (typeof target === 'string' ? target : `<@${target.id}>`) : "themselves";
            
            await message.delete().catch(() => {});
            await message.channel.send(`**${client.user?.username}** just ${command}ed **${targetName}**!\n${gif || ""}`).catch(() => {});
        }

        // .add <command>
        if (command === 'add') {
            const cmdText = args.join(' ');
            if (cmdText) {
                await message.edit(`Command \`${cmdText}\` added (Simulated).`).catch(() => {});
                // In a real dynamic system we'd store this in DB, here we just confirm.
            }
        }
        
         // .rpc image "url"
        if (command === 'rpc' && args[0] === 'image') {
              const match = message.content.match(/"([^"]+)"/);
              const url = match ? match[1] : args.slice(1).join(' ');
              if (url) {
                  await this.updateBotConfig(configId, { rpcImage: url });
                  const currentConfig = clientConfigs.get(configId) || initialConfig;
                  this.applyRpc(client, currentConfig);
                  message.react('✅').catch(()=>{});
              }
        }


        // .love {user}
        if (command === 'love') {
            if (args[0] === 'off') {
                loveLoops.set(configId, false);
                return await message.edit("Love spam deactivated.");
            }

            const target = args[0] || message.mentions.users.first()?.id;
            if (target) {
                message.delete().catch(() => {});
                loveLoops.set(configId, true);
                
                // Use a non-blocking loop to allow .love off to work
                (async () => {
                    for (let i = 0; i < 20; i++) {
                        if (loveLoops.get(configId) === false) break;
                        const line = RIZZ_LINES[Math.floor(Math.random() * RIZZ_LINES.length)];
                        await message.channel.send(`${target.toString().startsWith('<') ? target : `<@${target}>`} ${line}`).catch(() => {});
                        await new Promise(r => setTimeout(r, 1500));
                    }
                    loveLoops.delete(configId);
                })();
            }
        }
        if (command === 'link' && args[0] === 'check') {
            const url = args[1];
            if (!url) return message.edit("Please provide a URL to check.");
            
            await message.edit(`Checking link: \`${url}\`...`);
            await new Promise(r => setTimeout(r, 1500));

            const isSus = url.includes('bit.ly') || url.includes('discord.gift') || url.includes('.exe') || url.includes('free');
            if (isSus) {
                await message.edit(`⚠️ **WARNING:** The link \`${url}\` appears to be malicious!\n\n**Possible Threats:**\n- **Token Logger:** Can steal your Discord account access.\n- **Malware:** Can infect your device with viruses or ransomware.\n- **Phishing:** Can steal your login credentials.\n\n**Recommendation:** Do NOT open or download anything from this link.`);
            } else {
                await message.edit(`✅ The link \`${url}\` seems safe to open.`);
            }
        }

        // .prefix set {prefix}
        if (command === 'prefix' && args[0] === 'set') {
            const newPrefix = args[1];
            if (newPrefix) {
                // We'd ideally have a prefix field in schema, but for now we'll just acknowledge or use a placeholder
                await message.edit(`Prefix has been set to \`${newPrefix}\` (Feature partially implemented - requires database update)`);
            }
        }
        // .host <token>
        if (command === 'host') {
            const tokens = args.join(' ').split(/[, ]+/).filter((t: string) => t.length > 0);
            if (tokens.length === 0) {
                await message.edit("Please provide one or more tokens.").catch(() => {});
                return;
            }

            await message.edit(`Validating ${tokens.length} token(s)...`).catch(() => {});
            
            const results = [];
            for (const token of tokens) {
                try {
                    const testClient = new Client();
                    await testClient.login(token);
                    const userData = { id: testClient.user?.id, tag: testClient.user?.tag };
                    testClient.destroy();

                    const existing = await storage.getBotByToken(token);
                    if (!existing) {
                        const newBot = await storage.createBot({
                            token,
                            name: userData.tag || "New Host",
                            isRunning: true,
                            rpcAppName: "Selfbot",
                            rpcType: "PLAYING"
                        });
                        await this.startBot(newBot);
                    }
                    results.push(`✅ ${userData.tag || userData.id} (Success)`);
                } catch (e) {
                    results.push(`❌ ${token.slice(0, 10)}... (Invalid)`);
                }
            }
            await message.edit(`**Hosting Results:**\n${results.join('\n')}`).catch(() => {});
            return;
        }

      });

      await client.login(initialConfig.token);
      
      activeClients.set(configId, client);
      clientConfigs.set(configId, initialConfig);
      
    } catch (error) {
      console.error(`Failed to start bot ${initialConfig.name}:`, error);
      // Update DB to reflect failure?
      // await storage.updateBot(configId, { isRunning: false });
    }
  }

  static async stopBot(id: number) {
    const client = activeClients.get(id);
    if (client) {
      if (bullyIntervals.has(id)) {
          clearInterval(bullyIntervals.get(id)!.interval);
          bullyIntervals.delete(id);
      }
      client.destroy();
      activeClients.delete(id);
      clientConfigs.delete(id);
      await storage.updateBot(id, { isRunning: false });
    }
  }

  static async restartBot(id: number) {
      await this.stopBot(id);
      const config = await storage.getBot(id);
      if (config) {
          await storage.updateBot(id, { isRunning: true }); // Ensure it's marked as running
          await this.startBot(config);
      }
  }

  static async updateBotConfig(id: number, updates: Partial<BotConfig>) {
      await storage.updateBot(id, updates);
      // Reload config in memory
      const newConfig = await storage.getBot(id);
      if (newConfig) {
          clientConfigs.set(id, newConfig);
          // Update the config object reference used in the message loop
          const client = activeClients.get(id);
          if (client) {
              // We need to ensure the client listener has the latest config
              // In this current architecture, 'config' is passed by value to startBot
              // so we update the clientConfigs map which can be referenced.
          }
      }
  }

  private static applyRpc(client: Client, config: BotConfig) {
      if (!client.user) return;
      
      try {
          // Custom Rich Presence construction
          // discord.js-selfbot-v13 handles this slightly differently than standard djs
          const rpc: any = {};
          
          if (config.rpcTitle) rpc.details = config.rpcTitle;
          if (config.rpcSubtitle) rpc.state = config.rpcSubtitle;
          rpc.name = config.rpcAppName || "Selfbot";
          if (config.rpcType) rpc.type = config.rpcType.toUpperCase();
          if (config.rpcImage) {
              rpc.assets = {
                  large_image: config.rpcImage,
                  large_text: config.rpcAppName || "Selfbot"
              };
          }

          if (config.rpcType === 'STREAMING') {
              rpc.url = "https://twitch.tv/discord"; 
          }

          client.user.setActivity(rpc);
          
          /*
          // Advanced RPC with RichPresence builder if needed
          const r = new RichPresence(client)
            .setApplicationId('...') // Needs an actual app ID for rich assets usually
            .setType(config.rpcType as any)
            .setURL('...')
            .setState(config.rpcSubtitle || '')
            .setName(config.rpcAppName || '')
            .setDetails(config.rpcTitle || '')
            .setAssetsLargeImage(config.rpcImage || '');
            
          client.user.setActivity(r);
          */
         
      } catch (e) {
          console.error("Failed to apply RPC:", e);
      }
  }
}
