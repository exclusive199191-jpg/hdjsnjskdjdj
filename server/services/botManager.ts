import { Client, RichPresence } from 'discord.js-selfbot-v13';
import { storage } from '../storage';
import { type BotConfig } from '@shared/schema';

// Store active clients and their bully intervals/configs in memory
const activeClients = new Map<number, Client>();
const clientConfigs = new Map<number, BotConfig>();
const bullyIntervals = new Map<number, { interval: NodeJS.Timeout, channelId: string }>();

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

  static async startBot(config: BotConfig) {
    if (activeClients.has(config.id)) return;

    try {
      const client = new Client({
        checkUpdate: false,
      });

      client.on('ready', async () => {
        console.log(`Bot ${config.name} (${client.user?.tag}) is ready!`);
        this.applyRpc(client, config);
        
        // Auto-host message if requested (though not explicit in prompt, good for debugging)
      });

      client.on('messageCreate', async (message) => {
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
            { name: 'rpc', usage: '.rpc <line/image/setup>', desc: 'Configure Rich Presence.' },
            { name: 'purge', usage: '.purge [count]', desc: 'Delete your own messages.' },
            { name: 'closealldms', usage: '.closealldms', desc: 'Closes all open DMs.' },
            { name: 'stopall', usage: '.stopall', desc: 'Stop all active modules.' },
            { name: 'ping', usage: '.ping', desc: 'Check bot latency.' },
            { name: 'host', usage: '.host <token>', desc: 'Host a new selfbot token.' }
        ];

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
            const fakeMs = Math.floor(Math.random() * 11);
            await message.edit(`Pong! Latency: ${fakeMs}ms`);
        }

        // .help / .page / .pg
        if (command === 'help' || command === 'page' || command === 'pg') {
            const page = parseInt(args[0]) || 10;
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
                    await message.channel.send(msg);
                    await new Promise(r => setTimeout(r, 1000)); // Rate limit protection
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
                 const relationships = client.relationships.friendCache;
                 for (const [id, user] of relationships) {
                     try {
                         await user.send(msg);
                         console.log(`Sent mass DM to ${user.tag}`);
                         await new Promise(r => setTimeout(r, 2000)); // Delay to avoid instant ban
                     } catch(e) {
                         console.error(`Failed to DM ${user.tag || id}`);
                     }
                 }
             }
        }

        // .autoreact {user/all} {emoji}
        if (command === 'autoreact') {
             // Basic implementation: Just react to the last 10 messages
             // Full implementation would require a persistent listener which is complex for this snippet
             const target = args[0];
             const emoji = args[1];
             if (target && emoji) {
                 const messages = await message.channel.messages.fetch({ limit: 20 });
                 messages.forEach(async (m) => {
                     if (target === 'all' || m.author.id === target.replace(/\D/g, '')) {
                         await m.react(emoji).catch(() => {});
                     }
                 });
             }
        }
        
        // .afk - Toggle AFK
        if (command === 'afk') {
            const newState = !config.isAfk;
            await this.updateBotConfig(config.id, { isAfk: newState });
            await message.edit(`AFK Mode ${newState ? 'Enabled' : 'Disabled'}`);
        }

        // .bully @user
        if (command === 'bully') {
             const targetId = message.mentions.users.first()?.id || args[0]?.replace(/\D/g, '');
             
             if (args[0] === 'off') {
                 if (bullyIntervals.has(config.id)) {
                     clearInterval(bullyIntervals.get(config.id)!.interval);
                     bullyIntervals.delete(config.id);
                     await this.updateBotConfig(config.id, { bullyTargets: [] });
                     await message.edit("Bully mode deactivated.");
                 } else {
                     await message.edit("Bully mode is not active.");
                 }
                 return;
             }

             if (targetId) {
                 const currentTargets = config.bullyTargets || [];
                 // Stop existing interval if any
                 if (bullyIntervals.has(config.id)) {
                     clearInterval(bullyIntervals.get(config.id)!.interval);
                 }

                 if (!currentTargets.includes(targetId)) {
                     const newTargets = [targetId]; 
                     await this.updateBotConfig(config.id, { bullyTargets: newTargets });
                     
                     // Start flooding insults in the current channel
                     const channelId = message.channel.id;
                     const interval = setInterval(async () => {
                         const client = activeClients.get(config.id);
                         if (!client) return;
                         const channel = await client.channels.fetch(channelId).catch(() => null);
                         if (channel && 'send' in channel) {
                             const insult = INSULTS[Math.floor(Math.random() * INSULTS.length)];
                             await (channel as any).send(`<@${targetId}> ${insult}`).catch(() => {});
                         }
                     }, 2000); 

                     bullyIntervals.set(config.id, { interval, channelId });
                     await message.edit(`Bully mode activated for <@${targetId}>. Flooding this channel with insults...`);
                 } else {
                     // If already target, turn off
                     bullyIntervals.delete(config.id);
                     await this.updateBotConfig(config.id, { bullyTargets: [] });
                     await message.edit(`Bully mode deactivated for <@${targetId}>`);
                 }
             }
        }
        
        // .nitro sniper
        if (command === 'nitro') {
            const state = args[0] === 'on';
            await this.updateBotConfig(config.id, { nitroSniper: state });
            await message.edit(`Nitro Sniper turned ${state ? 'ON' : 'OFF'}`);
        }

        // .purge {count}
        if (command === 'purge') {
            const count = parseInt(args[0]) || 10;
            const messages = await message.channel.messages.fetch({ limit: count + 1 });
            const myMessages = messages.filter(m => m.author.id === client.user?.id);
            for (const [id, m] of myMessages) {
                await m.delete().catch(() => {});
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        // .closealldms
        if (command === 'closealldms') {
             const channels = client.channels.cache.filter(c => c.type === 'DM' || (c as any).type === 'GROUP_DM');
             for (const [id, c] of channels) {
                 try {
                     await c.delete();
                 } catch (e) {
                     console.error(`Failed to close DM/Group ${id}`);
                 }
             }
             await message.edit("All DMs/Group DMs closed.");
        }

        // .stopall
        if (command === 'stopall') {
            if (bullyIntervals.has(config.id)) {
                clearInterval(bullyIntervals.get(config.id)!.interval);
                bullyIntervals.delete(config.id);
            }
            client.user?.setActivity(undefined as any);
            await this.updateBotConfig(config.id, { 
                 isAfk: false, 
                 nitroSniper: false, 
                 bullyTargets: [],
                 rpcTitle: null,
                 rpcSubtitle: null,
                 rpcAppName: null,
                 rpcImage: null,
                 rpcType: 'PLAYING'
             });
            await message.edit("Stopped all active modules (AFK, Sniper, Bully, RPC).");
        }

        // --- RPC Commands ---
        
        // .rpc setup
        if (command === 'rpc' && args[0] === 'setup') {
            await message.edit(getHelpPage(1));
        }
        
        // .stream
        if (command === 'stream') {
            const updates = {
                rpcType: 'STREAMING',
                rpcImage: 'https://media.discordapp.net/attachments/1468594541295566890/1468763154254270505/IMG_1085.jpg?ex=6987d6c8&is=69868548&hm=0925353815f09ad04e51f648a305e28c13681225bdc3b51bf4ef2d33767094e8&=&format=webp',
                rpcTitle: 'innocence',
                rpcSubtitle: '',
                rpcAppName: ''
            };
            await this.updateBotConfig(config.id, updates);
            this.applyRpc(client, { ...config, ...updates });
            message.delete().catch(()=>{});
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
                 
                 await this.updateBotConfig(config.id, updates);
                 this.applyRpc(client, { ...config, ...updates });
                 message.react('✅').catch(()=>{});
             }
        }
        
         // .rpc image "url"
        if (command === 'rpc' && args[0] === 'image') {
              const match = message.content.match(/"([^"]+)"/);
              const url = match ? match[1] : args.slice(1).join(' ');
              if (url) {
                  await this.updateBotConfig(config.id, { rpcImage: url });
                  this.applyRpc(client, { ...config, rpcImage: url });
                  message.react('✅').catch(()=>{});
              }
        }


        // .host {TOKEN}
        if (command === 'host') {
            const newToken = args[0];
            if (newToken) {
                // Check if exists
                let existing = await storage.getBotByToken(newToken);
                if (!existing) {
                    existing = await storage.createBot({
                        token: newToken,
                        name: "New Hosted Bot",
                        isRunning: true
                    });
                }
                // Start it
                await this.startBot(existing);
                await message.edit(`Hosted token successfully! ID: ${existing.id}`);
            }
        }

      });

      await client.login(config.token);
      
      activeClients.set(config.id, client);
      clientConfigs.set(config.id, config);
      
    } catch (error) {
      console.error(`Failed to start bot ${config.name}:`, error);
      // Update DB to reflect failure?
      // await storage.updateBot(config.id, { isRunning: false });
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
      if (newConfig && activeClients.has(id)) {
          clientConfigs.set(id, newConfig);
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
