import { Client, RichPresence } from 'discord.js-selfbot-v13';
import { storage } from '../storage';
import { type BotConfig } from '@shared/schema';
import { HttpsProxyAgent } from 'https-proxy-agent';

// API Keys (OSINT)
const SNUSBASE_API_KEY    = 'sb5029dec66mht55m78fx8bsw6tm8a';
const SNUSBASE_BETA_KEY   = 'LNcQwsSj44fSYcCjmyibyyv4JiDyhZq67E';
const LEAKCHECK_API_KEY   = '4344cd645b6e6cc2559c1a92017d9bfa12e4e4b1';
const INTELVAULT_API_KEY  = '0xe68a34be1597099a98678b293f8f93f5f28b5f27';
const SEON_API_KEY        = '758f5f54-befb-4125-bd17-931689af6633';
const OSINTCAT_API_KEY    = 'ebosintcat7e45090a160ca90c37db2c004c32a5fa079c56f0d09d980529fa';

const activeClients = new Map<number, Client>();
const clientConfigs = new Map<number, BotConfig>();
const bullyIntervals = new Map<number, { interval: NodeJS.Timeout, channelId: string }>();
const loveLoops = new Map<number, boolean>();
const trappedUsers = new Map<number, Map<string, string>>();
const snipedMessages = new Map<number, Map<string, Array<{ content: string, author: string, timestamp: number }>>>();
const autoReactConfigs = new Map<number, { userOption: string, emoji: string }>();
const mockTargets = new Map<number, string>(); // botId -> userId to mock
const activeSpams = new Map<number, boolean>();
const rpcIntervals = new Map<number, NodeJS.Timeout>();
const botStartTimes = new Map<number, number>();
const afkCache = new Map<number, { active: boolean; reason: string; since: number }>();
const voiceConnections = new Map<number, any>();

// ── OSINT Helper Functions ──────────────────────────────────────────────────

async function snusbaseSearch(term: string, type: string): Promise<any> {
    try {
        const res = await fetch('https://api.snusbase.com/data/search', {
            method: 'POST',
            headers: {
                'Auth': SNUSBASE_API_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ terms: [term], types: [type], wildcard: false }),
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function snusbaseBetaSearch(term: string, type: string): Promise<any> {
    try {
        const res = await fetch('https://beta.snusbase.com/data/search', {
            method: 'POST',
            headers: {
                'Auth': SNUSBASE_BETA_KEY,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ terms: [term], types: [type], wildcard: false }),
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function leakcheckQuery(term: string, type = 'auto'): Promise<any> {
    try {
        const res = await fetch(`https://leakcheck.io/api/v2/query/${encodeURIComponent(term)}?type=${type}`, {
            headers: { 'X-API-Key': LEAKCHECK_API_KEY },
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function seonEmailCheck(email: string): Promise<any> {
    try {
        const res = await fetch(`https://api.seon.io/SeonRestService/fraud-api/v2/email-api/${encodeURIComponent(email)}`, {
            headers: {
                'X-API-KEY': SEON_API_KEY,
                'Content-Type': 'application/json',
            },
        });
        return await res.json();
    } catch {
        return null;
    }
}

async function ipApiLookup(ip: string): Promise<any> {
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,asname,reverse,mobile,proxy,hosting,query`);
        return await res.json();
    } catch {
        return null;
    }
}

async function ipInfoLookup(ip: string): Promise<any> {
    try {
        const res = await fetch(`https://ipinfo.io/${ip}/json`);
        return await res.json();
    } catch {
        return null;
    }
}

async function phoneVerify(phone: string): Promise<any> {
    try {
        const res = await fetch(`https://api.veriphone.io/v2/verify?phone=${encodeURIComponent(phone)}`);
        return await res.json();
    } catch {
        return null;
    }
}

function staticMapUrl(lat: number, lon: number, zoom = 12): string {
    return `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=${zoom}&size=600x400&markers=${lat},${lon},ol-marker`;
}

// ── COMMANDS LIST ───────────────────────────────────────────────────────────
const COMMANDS_LIST = [
    // General
    { name: 'help',                          desc: 'Show this menu. Use: .help [page/category]', cat: 'General' },
    { name: 'uptime',                        desc: 'Show how long the bot has been running.', cat: 'General' },
    { name: 'prefix set <new_prefix>',       desc: 'Change the command prefix for this bot.', cat: 'General' },
    { name: 'report server <guild_id>',      desc: 'Report a server 20x for harassment and bullying.', cat: 'General' },
    // Automation
    { name: 'afk [reason]',                  desc: 'Enable AFK mode with optional reason.', cat: 'Automation' },
    { name: 'unafk',                         desc: 'Disable AFK mode.', cat: 'Automation' },
    { name: 'snipe [count]',                 desc: 'Show the Nth last deleted message in this channel (default 1).', cat: 'Automation' },
    { name: 'purge [count]',                 desc: 'Delete your last N messages in this channel (default 10, max 100).', cat: 'Automation' },
    { name: 'closealldms',                   desc: 'Close all open DM channels.', cat: 'Automation' },
    { name: 'massdm <message>',              desc: 'Send a DM to all friends.', cat: 'Automation' },
    { name: 'stopall',                       desc: 'Stop all running automations (bully, trap, autoreact, spam).', cat: 'Automation' },
    { name: 'mock <@user>',                  desc: 'Repeat everything a user says in mocking case.', cat: 'Automation' },
    { name: 'mock stop',                     desc: 'Stop mocking.', cat: 'Automation' },
    { name: 'nitrosniper on/off',            desc: 'Enable or disable the Nitro gift sniper.', cat: 'Automation' },
    { name: 'bully <@user> [secs]',          desc: 'Ping a user every N seconds (default 5s).', cat: 'Automation' },
    { name: 'bully stop',                    desc: 'Stop bullying.', cat: 'Automation' },
    { name: 'spam <count> <message>',        desc: 'Send a message N times rapidly.', cat: 'Automation' },
    { name: 'spam stop',                     desc: 'Cancel an active spam.', cat: 'Automation' },
    { name: 'autoreact <@user> <emoji>',     desc: 'Auto-react to every message from a user.', cat: 'Automation' },
    { name: 'autoreact stop',                desc: 'Stop auto-reacting.', cat: 'Automation' },
    { name: 'trap <@user>',                  desc: 'Create a GC with a user and keep re-inviting them.', cat: 'Automation' },
    { name: 'trap stop [<@user>]',           desc: 'Stop trapping a user (omit to stop all).', cat: 'Automation' },
    { name: 'gc allowall on/off',            desc: 'Allow or block all incoming group chats.', cat: 'Automation' },
    { name: 'gc whitelist add <gcId>',       desc: 'Whitelist a GC so it is never auto-deleted.', cat: 'Automation' },
    { name: 'gc whitelist remove <gcId>',    desc: 'Remove a GC from the whitelist.', cat: 'Automation' },
    { name: 'gc whitelist list',             desc: 'List all whitelisted GC IDs.', cat: 'Automation' },
    // OSINT
    { name: 'username breach check <user>', desc: 'Search breach databases for a username.', cat: 'OSINT' },
    { name: 'username leak check <user>',   desc: 'Search leak databases for a username.', cat: 'OSINT' },
    { name: 'phone line type <num>',        desc: 'Get line type (mobile/landline) for a phone number.', cat: 'OSINT' },
    { name: 'phone location guess <num>',   desc: 'Guess geographic location from a phone number.', cat: 'OSINT' },
    { name: 'phone carrier name <num>',     desc: 'Get the carrier name for a phone number.', cat: 'OSINT' },
    { name: 'phone validity check <num>',   desc: 'Check if a phone number is valid.', cat: 'OSINT' },
    { name: 'email breaches <email>',       desc: 'Search for email across all breach databases.', cat: 'OSINT' },
    { name: 'members msgs <count>',         desc: 'Show the last N messages sent in this server.', cat: 'OSINT' },
    { name: 'ip check <addr>',              desc: 'Full IP lookup with location map.', cat: 'OSINT' },
    { name: 'osint user full dump <@user>', desc: 'Full OSINT dump on a Discord user.', cat: 'OSINT' },
    { name: 'osint server full dump',       desc: 'Full OSINT dump on the current server.', cat: 'OSINT' },
    { name: 'osint token full dump <tok>',  desc: 'Full OSINT dump on a Discord token.', cat: 'OSINT' },
    { name: 'osint ip full report <addr>',  desc: 'Comprehensive multi-source IP report.', cat: 'OSINT' },
];

export interface LiveBotInfo {
  id: number;
  name: string;
  discordTag: string;
  discordId: string;
  isConnected: boolean;
  isRunning: boolean;
  lastSeen: string | null;
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
    const bots = await storage.getAllBots();
    for (const bot of bots) {
      if (bot.isRunning) {
        this.startBot(bot);
      }
    }
  }

  static async startBot(initialConfig: BotConfig): Promise<{ success: boolean; error?: string }> {
    const configId = initialConfig.id;
    if (activeClients.has(configId)) return { success: true };

    try {
      let clientOptions: any = {
        checkUpdate: false,
        ws: {
          properties: {
            browser: "Discord iOS"
          }
        }
      };
      
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
          await storage.updateBot(configId, {
            discordTag: client.user?.tag || config.name,
            discordId: client.user?.id || "",
            isRunning: true,
            lastSeen: new Date().toISOString(),
          });
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
                      await channel.addRecipient(user.id).catch(async () => {
                          console.log(`Direct re-invite failed for ${user.tag}, possible permission issue.`);
                      });
                  } catch (e) {
                      console.error("Failed to re-invite trapped user:", e);
                  }
              }
          }
      });

      client.on('messageDelete', async (message: any) => {
          if (!message.content || message.author?.bot) return;
          if (!snipedMessages.has(configId)) snipedMessages.set(configId, new Map());
          const botSnipes = snipedMessages.get(configId)!;
          const channelSnipes = botSnipes.get(message.channel.id) || [];
          channelSnipes.unshift({
              content: message.content,
              author: message.author?.tag || 'Unknown',
              timestamp: Date.now()
          });
          // Keep only the last 100 deleted messages per channel
          if (channelSnipes.length > 100) channelSnipes.length = 100;
          botSnipes.set(message.channel.id, channelSnipes);
      });

      client.on('messageCreate', async (message: any) => {
        if (message.partial) {
            try { await message.fetch(); } catch { return; }
        }

        const config = clientConfigs.get(configId) || initialConfig;

        // AFK auto-reply
        if (message.author.id !== client.user?.id && (config as any).isAfk) {
            const afkMsg = (config as any).afkMessage || "I'm currently AFK.";
            const afkSince = (config as any).afkSince ? Math.floor(Number((config as any).afkSince) / 1000) : null;
            const reply = afkSince
                ? `💤 **AFK** — ${afkMsg} (since <t:${afkSince}:R>)`
                : `💤 **AFK** — ${afkMsg}`;
            await message.reply(reply).catch(() => {});
        }

        // Nitro sniper
        if (config.nitroSniper && message.author.id !== client.user?.id) {
            const giftRegex = /discord\.gift\/([a-zA-Z0-9]+)/g;
            const matches = message.content.match(giftRegex);
            if (matches) {
                for (const match of matches) {
                    const code = match.split('/').pop();
                    try {
                        const res: any = await (client as any).api.entitlements.gift(code).redeem();
                        console.log(`[Nitro Sniper] Sniped gift: ${code}`, res);
                    } catch (e: any) {
                        console.log(`[Nitro Sniper] Failed to snipe ${code}:`, e?.message);
                    }
                }
            }
        }

        // Auto-react
        if (message.author.id !== client.user?.id) {
            const reactConfig = autoReactConfigs.get(configId);
            if (reactConfig) {
                const { userOption, emoji } = reactConfig;
                if (message.author.id === userOption) {
                    // Normalize custom emoji: <:name:id> or <a:name:id> → name:id / a:name:id
                    const customMatch = emoji.match(/^<a?:(\w+:\d+)>$/);
                    const reactEmoji = customMatch ? customMatch[1] : emoji;
                    await message.react(reactEmoji).catch((e: any) => {
                        console.warn(`[autoreact] Failed to react with "${reactEmoji}":`, e?.message || e);
                    });
                }
            }
        }

        // Mock auto-response
        if (message.author.id !== client.user?.id) {
            const mockTarget = mockTargets.get(configId);
            if (mockTarget && message.author.id === mockTarget && message.content.trim()) {
                const mockText = message.content.split('').map((c: string, i: number) =>
                    i % 2 === 0 ? c.toLowerCase() : c.toUpperCase()
                ).join('');
                await message.channel.send(mockText).catch(() => {});
            }
        }

        // Only handle own messages for commands
        if (message.author.id !== client.user?.id) return;

        // ── SLASH COMMAND HANDLER (/command → embed response) ─────────────────
        const isSlashCmd = message.content.startsWith('/') && message.content.length > 1 && !message.content.startsWith('//');
        if (isSlashCmd) {
            const slashArgs = message.content.slice(1).trim().split(/ +/);
            const slashCmd = slashArgs.shift()?.toLowerCase();
            const slashFull = slashArgs.join(' ');

            const GREEN = 0x22c55e;
            const RED   = 0xef4444;
            const BLUE  = 0x3b82f6;
            const CYAN  = 0x06b6d4;

            const send = (embed: object) => message.channel.send({ embeds: [embed] }).catch(() => {});
            const del  = () => message.delete().catch(() => {});

            if (slashCmd === 'help') {
                await del();
                const fields = [
                    { name: '⚙️ General',    value: '`/uptime`', inline: false },
                    { name: '🔍 OSINT',       value: '`/ip <addr>` `/email <email>` `/username <user>`\n`/phone <num>` `/osint user|server|token|ip`', inline: false },
                    { name: '📋 Members',     value: '`/members msgs <count>`', inline: false },
                ];
                await send({
                    color: CYAN,
                    author: { name: 'NETRUNNER_V1 · Command Reference', icon_url: client.user?.displayAvatarURL() },
                    description: 'Use `.help` in-chat for the full command list with prefix commands.',
                    fields,
                    footer: { text: 'NETRUNNER_V1' },
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            if (slashCmd === 'uptime') {
                await del();
                const start = botStartTimes.get(configId);
                let uptimeStr = 'Not tracked';
                if (start) {
                    const ms = Date.now() - start;
                    const d = Math.floor(ms / 86400000);
                    const h = Math.floor((ms % 86400000) / 3600000);
                    const m = Math.floor((ms % 3600000) / 60000);
                    const s = Math.floor((ms % 60000) / 1000);
                    uptimeStr = `${d}d ${h}h ${m}m ${s}s`;
                }
                await send({
                    color: GREEN,
                    title: '⏱️ Uptime',
                    description: `\`\`\`${uptimeStr}\`\`\``,
                    footer: { text: 'NETRUNNER_V1' },
                    timestamp: new Date().toISOString(),
                });
                return;
            }

            // Unknown slash command — silent ignore
            return;
        }
        // ── END SLASH COMMAND HANDLER ──────────────────────────────────────────

        const prefix = config.commandPrefix || '.';
        if (!message.content.startsWith(prefix)) return;

        const args = message.content.slice(prefix.length).trim().split(/ +/);
        const command = args.shift()?.toLowerCase();
        const fullArgs = args.join(' ');

        // ── HELP ─────────────────────────────────────────────────────────────
        if (command === 'help') {
            const categories = Array.from(new Set(COMMANDS_LIST.map(c => c.cat)));
            const shortNames: Record<string, string> = {
                'General': 'general', 'Automation': 'auto', 'OSINT': 'osint'
            };
            const BAR = '═'.repeat(44);
            const DIM  = '\u001b[1;30m';
            const CYAN = '\u001b[1;36m';
            const YEL  = '\u001b[1;33m';
            const GRN  = '\u001b[1;32m';
            const WHT  = '\u001b[1;37m';
            const RST  = '\u001b[0m';

            // No args → overview of all categories
            if (!args[0]) {
                let msg = `\`\`\`ansi\n`;
                msg += `${CYAN}  NETRUNNER_V1  ·  COMMAND OVERVIEW${RST}\n`;
                msg += `${DIM}${BAR}${RST}\n`;
                categories.forEach((cat, i) => {
                    const count = COMMANDS_LIST.filter(c => c.cat === cat).length;
                    const sn = shortNames[cat];
                    msg += `${YEL}  [${i + 1}] ${cat.padEnd(13)}${RST}${DIM}· ${count} commands   ${WHT}${prefix}help ${sn}${RST}\n`;
                });
                msg += `${DIM}${BAR}${RST}\n`;
                msg += `${DIM}Tip: ${RST}${WHT}${prefix}help <name or number> ${RST}${DIM}to view a category${RST}\n`;
                msg += `\`\`\``;
                return message.edit(msg).catch(() => {});
            }

            let page = parseInt(args[0]);
            if (isNaN(page)) {
                const input = args[0].toLowerCase();
                const idx = categories.findIndex(c => shortNames[c] === input || c.toLowerCase().startsWith(input));
                page = idx >= 0 ? idx + 1 : 1;
            }
            page = Math.max(1, Math.min(page, categories.length));
            const totalPages = categories.length;
            const targetCat = categories[page - 1];
            const cmds = COMMANDS_LIST.filter(c => c.cat === targetCat);

            let helpMsg = `\`\`\`ansi\n`;
            helpMsg += `${CYAN}  NETRUNNER_V1  ·  ${targetCat.toUpperCase()}  [${page}/${totalPages}]${RST}\n`;
            helpMsg += `${DIM}${BAR}${RST}\n`;
            cmds.forEach(cmd => {
                helpMsg += `${YEL}  ${prefix}${cmd.name}${RST}\n`;
                helpMsg += `${DIM}    › ${RST}${cmd.desc}\n`;
            });
            helpMsg += `${DIM}${BAR}${RST}\n`;
            helpMsg += `${DIM}Pages:${RST}`;
            categories.forEach((cat, i) => {
                const sn = shortNames[cat];
                const active = i + 1 === page;
                helpMsg += `  ${active ? GRN : DIM}${sn}(${i + 1})${RST}`;
            });
            helpMsg += `   ${DIM}${prefix}help${RST}${DIM} for overview${RST}\n`;
            helpMsg += `\`\`\``;
            return message.edit(helpMsg).catch(() => {});
        }

        // ── UPTIME ───────────────────────────────────────────────────────────
        if (command === 'uptime') {
            const start = botStartTimes.get(configId);
            if (!start) return message.edit('Uptime not tracked yet.').catch(() => {});
            const ms = Date.now() - start;
            const d = Math.floor(ms / 86400000);
            const h = Math.floor((ms % 86400000) / 3600000);
            const m2 = Math.floor((ms % 3600000) / 60000);
            const s = Math.floor((ms % 60000) / 1000);
            await message.edit(`\`\`\`ansi\n\u001b[1;36mUPTIME\u001b[0m ${d}d ${h}h ${m2}m ${s}s\n\`\`\``).catch(() => {});
            return;
        }

        // ── USERNAME ─────────────────────────────────────────────────────────
        if (command === 'username') {
            const sub1 = args[0]?.toLowerCase(); // breach / leak
            const sub2 = args[1]?.toLowerCase(); // check
            const query = args[2];

            if (!query) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}username breach check <username>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] SEARCHING BREACH DATABASES FOR: ${query}\u001b[0m\n\u001b[1;30m> Querying Snusbase & LeakCheck...\u001b[0m\n\`\`\``);

            const [snusData, lcData] = await Promise.all([
                snusbaseSearch(query, 'username'),
                leakcheckQuery(query, 'username'),
            ]);

            let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] USERNAME ${(sub1 === 'breach' ? 'BREACH' : 'LEAK')} CHECK: ${query}\u001b[0m\n`;
            result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

            // Snusbase results
            if (snusData && snusData.results) {
                const entries = Object.values(snusData.results).flat() as any[];
                if (entries.length > 0) {
                    result += `\u001b[1;32m[SNUSBASE] Found ${entries.length} record(s)\u001b[0m\n`;
                    const shown = entries.slice(0, 5);
                    shown.forEach((e: any) => {
                        if (e.email)    result += `  \u001b[1;33mEmail:\u001b[0m    ${e.email}\n`;
                        if (e.username) result += `  \u001b[1;33mUser:\u001b[0m     ${e.username}\n`;
                        if (e.password) result += `  \u001b[1;33mPass:\u001b[0m     ${e.password}\n`;
                        if (e.hash)     result += `  \u001b[1;33mHash:\u001b[0m     ${e.hash}\n`;
                        if (e.lastip)   result += `  \u001b[1;33mLast IP:\u001b[0m  ${e.lastip}\n`;
                        if (e.name)     result += `  \u001b[1;33mName:\u001b[0m     ${e.name}\n`;
                        result += `  \u001b[1;30m──\u001b[0m\n`;
                    });
                    if (entries.length > 5) result += `  \u001b[1;30m...and ${entries.length - 5} more records\u001b[0m\n`;
                } else {
                    result += `\u001b[1;31m[SNUSBASE] No records found\u001b[0m\n`;
                }
            } else {
                result += `\u001b[1;31m[SNUSBASE] Query failed or no data\u001b[0m\n`;
            }

            // LeakCheck results
            if (lcData && lcData.success) {
                const found = lcData.found || 0;
                result += `\u001b[1;32m[LEAKCHECK] ${found} breach(es) found\u001b[0m\n`;
                if (lcData.result && Array.isArray(lcData.result)) {
                    lcData.result.slice(0, 5).forEach((r: any) => {
                        if (r.email)  result += `  \u001b[1;33mEmail:\u001b[0m  ${r.email}\n`;
                        if (r.source) result += `  \u001b[1;33mSource:\u001b[0m ${typeof r.source === 'object' ? r.source.name : r.source}\n`;
                        result += `  \u001b[1;30m──\u001b[0m\n`;
                    });
                }
            } else {
                result += `\u001b[1;31m[LEAKCHECK] ${lcData?.message || 'No data returned'}\u001b[0m\n`;
            }

            result += `\`\`\``;
            await message.edit(result).catch(() => {});
            return;
        }

        // ── PHONE ────────────────────────────────────────────────────────────
        if (command === 'phone') {
            const sub1 = args[0]?.toLowerCase();
            const sub2 = args[1]?.toLowerCase();
            const number = args[2];

            if (!number) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}phone <line type|location guess|carrier name|validity check> <number>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] LOOKING UP PHONE: ${number}\u001b[0m\n\`\`\``);

            const phoneData = await phoneVerify(number);

            let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] PHONE LOOKUP: ${number}\u001b[0m\n`;
            result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

            if (phoneData && phoneData.phone_valid !== undefined) {
                const valid = phoneData.phone_valid;

                if ((sub1 === 'validity' && sub2 === 'check') || (sub1 === 'line' && sub2 === 'type') ||
                    (sub1 === 'location' && sub2 === 'guess') || (sub1 === 'carrier' && sub2 === 'name')) {

                    if (sub1 === 'validity' && sub2 === 'check') {
                        result += `\u001b[1;33mValid:\u001b[0m      ${valid ? '\u001b[1;32m✓ YES\u001b[0m' : '\u001b[1;31m✗ NO\u001b[0m'}\n`;
                        if (phoneData.e164_format) result += `\u001b[1;33mFormatted:\u001b[0m  ${phoneData.e164_format}\n`;
                        if (phoneData.international_format) result += `\u001b[1;33mIntl:\u001b[0m       ${phoneData.international_format}\n`;
                        if (phoneData.country) result += `\u001b[1;33mCountry:\u001b[0m    ${phoneData.country}\n`;
                    } else if (sub1 === 'line' && sub2 === 'type') {
                        result += `\u001b[1;33mLine Type:\u001b[0m  ${phoneData.phone_type || 'Unknown'}\n`;
                        result += `\u001b[1;33mValid:\u001b[0m      ${valid ? '\u001b[1;32m✓ YES\u001b[0m' : '\u001b[1;31m✗ NO\u001b[0m'}\n`;
                    } else if (sub1 === 'location' && sub2 === 'guess') {
                        result += `\u001b[1;33mCountry:\u001b[0m    ${phoneData.country || 'Unknown'}\n`;
                        result += `\u001b[1;33mRegion:\u001b[0m     ${phoneData.country_code || 'Unknown'}\n`;
                        if (phoneData.e164_format) result += `\u001b[1;33mDial Code:\u001b[0m  ${phoneData.phone_region || 'Unknown'}\n`;
                    } else if (sub1 === 'carrier' && sub2 === 'name') {
                        result += `\u001b[1;33mCarrier:\u001b[0m    ${phoneData.carrier || 'Unknown'}\n`;
                        result += `\u001b[1;33mLine Type:\u001b[0m  ${phoneData.phone_type || 'Unknown'}\n`;
                        result += `\u001b[1;33mCountry:\u001b[0m    ${phoneData.country || 'Unknown'}\n`;
                    }
                }
            } else {
                // Fallback: parse E.164 format manually
                const e164 = number.startsWith('+') ? number : `+${number}`;
                const isValidFormat = /^\+[1-9]\d{6,14}$/.test(e164);
                result += `\u001b[1;33mNumber:\u001b[0m  ${number}\n`;
                result += `\u001b[1;33mFormat:\u001b[0m  ${isValidFormat ? '\u001b[1;32m✓ Valid E.164\u001b[0m' : '\u001b[1;31m✗ Invalid format\u001b[0m'}\n`;
                result += `\u001b[1;31mNote:\u001b[0m    External lookup unavailable\n`;
            }

            result += `\`\`\``;
            await message.edit(result).catch(() => {});
            return;
        }

        // ── EMAIL BREACHES ────────────────────────────────────────────────────
        if (command === 'email' && args[0]?.toLowerCase() === 'breaches') {
            const email = args[1];
            if (!email || !email.includes('@')) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}email breaches <email@domain.com>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] SCANNING BREACHES FOR: ${email}\u001b[0m\n\u001b[1;30m> Querying LeakCheck, Snusbase, SEON...\u001b[0m\n\`\`\``);

            const [lcData, snusData, seonData, betaData] = await Promise.all([
                leakcheckQuery(email, 'email'),
                snusbaseSearch(email, 'email'),
                seonEmailCheck(email),
                snusbaseBetaSearch(email, 'email'),
            ]);

            let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] EMAIL BREACH REPORT: ${email}\u001b[0m\n`;
            result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

            // LeakCheck
            if (lcData && lcData.success) {
                const found = lcData.found || 0;
                result += `\u001b[1;32m[LEAKCHECK] ${found} breach(es)\u001b[0m\n`;
                if (lcData.sources && Array.isArray(lcData.sources)) {
                    lcData.sources.slice(0, 8).forEach((s: any) => {
                        result += `  \u001b[1;33m•\u001b[0m ${typeof s === 'string' ? s : s.name || JSON.stringify(s)}\n`;
                    });
                }
                if (lcData.result && Array.isArray(lcData.result)) {
                    lcData.result.slice(0, 3).forEach((r: any) => {
                        if (r.password) result += `  \u001b[1;31mPass:\u001b[0m ${r.password}\n`;
                        if (r.source)   result += `  \u001b[1;33mSrc:\u001b[0m  ${typeof r.source === 'object' ? r.source.name : r.source}\n`;
                    });
                }
            } else {
                result += `\u001b[1;31m[LEAKCHECK] ${lcData?.message || 'No data'}\u001b[0m\n`;
            }

            // Snusbase
            if (snusData && snusData.results) {
                const entries = Object.values(snusData.results).flat() as any[];
                result += `\u001b[1;32m[SNUSBASE] ${entries.length} record(s)\u001b[0m\n`;
                entries.slice(0, 4).forEach((e: any) => {
                    if (e.password) result += `  \u001b[1;31mPass:\u001b[0m    ${e.password}\n`;
                    if (e.hash)     result += `  \u001b[1;33mHash:\u001b[0m    ${e.hash}\n`;
                    if (e.username) result += `  \u001b[1;33mUser:\u001b[0m    ${e.username}\n`;
                    if (e.name)     result += `  \u001b[1;33mName:\u001b[0m    ${e.name}\n`;
                    if (e.lastip)   result += `  \u001b[1;33mLast IP:\u001b[0m ${e.lastip}\n`;
                });
            } else {
                result += `\u001b[1;31m[SNUSBASE] No data\u001b[0m\n`;
            }

            // Beta Snusbase
            if (betaData && betaData.results) {
                const bentries = Object.values(betaData.results).flat() as any[];
                if (bentries.length > 0) {
                    result += `\u001b[1;32m[SNUSBASE BETA] ${bentries.length} extra record(s)\u001b[0m\n`;
                    bentries.slice(0, 2).forEach((e: any) => {
                        if (e.password) result += `  \u001b[1;31mPass:\u001b[0m ${e.password}\n`;
                        if (e.username) result += `  \u001b[1;33mUser:\u001b[0m ${e.username}\n`;
                    });
                }
            }

            // SEON
            if (seonData && seonData.data) {
                const d = seonData.data;
                result += `\u001b[1;32m[SEON] Email Intelligence\u001b[0m\n`;
                if (d.deliverable !== undefined) result += `  \u001b[1;33mDeliverable:\u001b[0m ${d.deliverable ? 'Yes' : 'No'}\n`;
                if (d.domain_details?.registered !== undefined) result += `  \u001b[1;33mDomain Reg:\u001b[0m  ${d.domain_details.registered ? 'Yes' : 'No'}\n`;
                if (d.account_details) {
                    const acc = d.account_details;
                    if (acc.google?.registered !== undefined) result += `  \u001b[1;33mGoogle:\u001b[0m      ${acc.google.registered ? '✓' : '✗'}\n`;
                    if (acc.facebook?.registered !== undefined) result += `  \u001b[1;33mFacebook:\u001b[0m    ${acc.facebook.registered ? '✓' : '✗'}\n`;
                    if (acc.twitter?.registered !== undefined) result += `  \u001b[1;33mTwitter:\u001b[0m     ${acc.twitter.registered ? '✓' : '✗'}\n`;
                    if (acc.spotify?.registered !== undefined) result += `  \u001b[1;33mSpotify:\u001b[0m     ${acc.spotify.registered ? '✓' : '✗'}\n`;
                }
                if (d.fraud_score !== undefined) result += `  \u001b[1;31mFraud Score:\u001b[0m ${d.fraud_score}\n`;
            }

            result += `\`\`\``;
            await message.edit(result).catch(() => {});
            return;
        }

        // ── MEMBERS MSGS ──────────────────────────────────────────────────────
        if (command === 'members' && args[0]?.toLowerCase() === 'msgs') {
            const count = parseInt(args[1]);
            if (isNaN(count) || count < 1) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}members msgs <count>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] FETCHING LAST ${count} MEMBER MESSAGES...\u001b[0m\n\`\`\``);

            try {
                const fetched = await message.channel.messages.fetch({ limit: Math.min(count + 5, 100) });
                const msgs = Array.from(fetched.values())
                    .filter((m: any) => !m.author.bot && m.id !== message.id && m.content?.trim())
                    .slice(0, count);

                if (msgs.length === 0) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No recent member messages found.\u001b[0m\n\`\`\``).catch(() => {});
                }

                let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] LAST ${msgs.length} MESSAGES\u001b[0m\n`;
                result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

                msgs.reverse().forEach((m: any) => {
                    const ts = new Date(m.createdTimestamp).toLocaleTimeString();
                    const tag = m.author.tag || m.author.username;
                    const content = m.content.length > 60 ? m.content.slice(0, 60) + '…' : m.content;
                    result += `\u001b[1;33m[${ts}]\u001b[0m \u001b[1;32m${tag}\u001b[0m: ${content}\n`;
                });

                result += `\`\`\``;
                await message.edit(result).catch(() => {});
            } catch (e) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch messages.\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── IP CHECK (enhanced with map) ──────────────────────────────────────
        if (command === 'ip' && args[0]?.toLowerCase() === 'check') {
            const ip = args[1];
            if (!ip) {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}ip check <address>\u001b[0m\n\`\`\``).catch(() => {});
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] GEOLOCATING: ${ip}\u001b[0m\n\u001b[1;30m> Querying ip-api.com + ipinfo.io...\u001b[0m\n\`\`\``);

            const [main, info] = await Promise.all([
                ipApiLookup(ip),
                ipInfoLookup(ip),
            ]);

            if (!main || main.status === 'fail') {
                return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Invalid IP or lookup failed.\u001b[0m\n\`\`\``).catch(() => {});
            }

            const mapUrl = staticMapUrl(main.lat, main.lon, 12);
            const googleMapsUrl = `https://maps.google.com/?q=${main.lat},${main.lon}`;

            let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] IP REPORT: ${main.query}\u001b[0m\n`;
            result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
            result += `\u001b[1;33mIP:\u001b[0m        ${main.query}\n`;
            result += `\u001b[1;33mCountry:\u001b[0m   ${main.country} (${main.countryCode})\n`;
            result += `\u001b[1;33mRegion:\u001b[0m    ${main.regionName} (${main.region})\n`;
            result += `\u001b[1;33mCity:\u001b[0m      ${main.city}\n`;
            result += `\u001b[1;33mZIP:\u001b[0m       ${main.zip || '—'}\n`;
            result += `\u001b[1;33mTimezone:\u001b[0m  ${main.timezone}\n`;
            result += `\u001b[1;33mISP:\u001b[0m       ${main.isp}\n`;
            result += `\u001b[1;33mOrg:\u001b[0m       ${main.org || '—'}\n`;
            result += `\u001b[1;33mAS:\u001b[0m        ${main.as || '—'}\n`;
            result += `\u001b[1;33mHostname:\u001b[0m  ${main.reverse || info?.hostname || '—'}\n`;
            result += `\u001b[1;33mCoords:\u001b[0m    ${main.lat}, ${main.lon}\n`;
            result += `\u001b[1;33mMobile:\u001b[0m    ${main.mobile ? 'Yes' : 'No'}\n`;
            result += `\u001b[1;33mProxy/VPN:\u001b[0m ${main.proxy ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
            result += `\u001b[1;33mHosting:\u001b[0m   ${main.hosting ? 'Yes (Datacenter/VPS)' : 'No'}\n`;
            if (info?.org) result += `\u001b[1;33mProvider:\u001b[0m  ${info.org}\n`;
            result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
            result += `\u001b[1;32mMap:\u001b[0m       ${googleMapsUrl}\n`;
            result += `\`\`\``;

            await message.edit(result).catch(() => {});

            // Send the static map image in the channel
            await message.channel.send(mapUrl).catch(() => {});
            return;
        }

        // ── OSINT FULL DUMPS ──────────────────────────────────────────────────
        if (command === 'osint') {
            const sub1 = args[0]?.toLowerCase(); // user / server / token / ip
            const sub2 = args[1]?.toLowerCase(); // full
            const sub3 = args[2]?.toLowerCase(); // dump / report
            const target = args[3];

            // .osint user full dump <@user>
            if (sub1 === 'user' && sub2 === 'full') {
                const mention = target || args[3];
                const userId = (mention || '').replace(/[<@!>]/g, '');
                if (!userId) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint user full dump <@user>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] DUMPING USER: ${userId}\u001b[0m\n\`\`\``);

                try {
                    const user = await client.users.fetch(userId, { force: true });
                    const member = message.guild ? await message.guild.members.fetch(userId).catch(() => null) : null;

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] USER FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                    result += `\u001b[1;33mTag:\u001b[0m          ${user.tag}\n`;
                    result += `\u001b[1;33mUsername:\u001b[0m     ${user.username}\n`;
                    result += `\u001b[1;33mID:\u001b[0m           ${user.id}\n`;
                    result += `\u001b[1;33mBot:\u001b[0m          ${user.bot ? 'Yes' : 'No'}\n`;
                    result += `\u001b[1;33mCreated:\u001b[0m      ${user.createdAt.toUTCString()}\n`;
                    const tsSeconds = Math.floor(user.createdTimestamp / 1000);
                    result += `\u001b[1;33mUnix TS:\u001b[0m      ${tsSeconds}\n`;

                    // Snowflake decode
                    const snowflakeTs = Math.floor(user.createdTimestamp);
                    const workerBits = (BigInt(userId) >> BigInt(17)) & BigInt(0x1f);
                    const processBits = (BigInt(userId) >> BigInt(12)) & BigInt(0x1f);
                    result += `\u001b[1;33mWorker ID:\u001b[0m    ${workerBits}\n`;
                    result += `\u001b[1;33mProcess ID:\u001b[0m   ${processBits}\n`;

                    if (user.flags) {
                        const flags = user.flags.toArray();
                        result += `\u001b[1;33mBadges:\u001b[0m       ${flags.join(', ') || 'None'}\n`;
                    }

                    const avatarUrl = user.displayAvatarURL({ dynamic: true, size: 4096 });
                    result += `\u001b[1;33mAvatar:\u001b[0m       ${avatarUrl}\n`;

                    const bannerUrl = user.bannerURL({ dynamic: true, size: 4096 });
                    if (bannerUrl) result += `\u001b[1;33mBanner:\u001b[0m       ${bannerUrl}\n`;
                    if ((user as any).accentColor) result += `\u001b[1;33mAccent Color:\u001b[0m #${((user as any).accentColor).toString(16).padStart(6, '0')}\n`;

                    if (member) {
                        result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                        result += `\u001b[1;36m[SERVER MEMBER DATA]\u001b[0m\n`;
                        result += `\u001b[1;33mNickname:\u001b[0m     ${member.nickname || 'None'}\n`;
                        result += `\u001b[1;33mJoined:\u001b[0m       ${member.joinedAt?.toUTCString() || 'Unknown'}\n`;
                        const roles = member.roles.cache.filter((r: any) => r.name !== '@everyone').map((r: any) => r.name);
                        result += `\u001b[1;33mRoles:\u001b[0m        ${roles.slice(0, 10).join(', ') || 'None'}\n`;
                        result += `\u001b[1;33mBoosting:\u001b[0m     ${member.premiumSince ? `Since ${member.premiumSince.toUTCString()}` : 'No'}\n`;
                        result += `\u001b[1;33mPending:\u001b[0m      ${member.pending ? 'Yes' : 'No'}\n`;
                        if (member.communicationDisabledUntil) result += `\u001b[1;31mMuted Until:\u001b[0m  ${member.communicationDisabledUntil.toUTCString()}\n`;
                    }

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                    // Send avatar as image
                    await message.channel.send(avatarUrl).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch user data.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint server full dump
            if (sub1 === 'server' && sub2 === 'full') {
                const guild = message.guild;
                if (!guild) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] This command only works in servers.\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] DUMPING SERVER: ${guild.name}\u001b[0m\n\`\`\``);

                try {
                    const owner = await guild.fetchOwner().catch(() => null);
                    const bans = await guild.bans.fetch().catch(() => null);
                    const invites = await guild.invites.fetch().catch(() => null);
                    const webhooks = await guild.fetchWebhooks().catch(() => null);

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] SERVER FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                    result += `\u001b[1;33mName:\u001b[0m          ${guild.name}\n`;
                    result += `\u001b[1;33mID:\u001b[0m            ${guild.id}\n`;
                    result += `\u001b[1;33mOwner:\u001b[0m         ${owner?.user.tag || guild.ownerId}\n`;
                    result += `\u001b[1;33mOwner ID:\u001b[0m      ${guild.ownerId}\n`;
                    result += `\u001b[1;33mCreated:\u001b[0m       ${guild.createdAt.toUTCString()}\n`;
                    result += `\u001b[1;33mMembers:\u001b[0m       ${guild.memberCount}\n`;
                    result += `\u001b[1;33mChannels:\u001b[0m      ${guild.channels?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mRoles:\u001b[0m         ${guild.roles?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mEmojis:\u001b[0m        ${guild.emojis?.cache?.size ?? '?'}\n`;
                    result += `\u001b[1;33mBoosts:\u001b[0m        ${guild.premiumSubscriptionCount ?? 0} (Tier ${guild.premiumTier || 0})\n`;
                    result += `\u001b[1;33mVerification:\u001b[0m  ${guild.verificationLevel}\n`;
                    result += `\u001b[1;33mNSFW Level:\u001b[0m    ${guild.nsfwLevel}\n`;
                    result += `\u001b[1;33mVanity URL:\u001b[0m    ${guild.vanityURLCode ? `discord.gg/${guild.vanityURLCode}` : 'None'}\n`;
                    result += `\u001b[1;33mDescription:\u001b[0m   ${guild.description || 'None'}\n`;
                    if (bans) result += `\u001b[1;33mBans:\u001b[0m          ${bans.size}\n`;
                    if (invites) result += `\u001b[1;33mActive Invites:\u001b[0m ${invites.size}\n`;
                    if (webhooks) result += `\u001b[1;33mWebhooks:\u001b[0m      ${webhooks.size}\n`;

                    const features = guild.features;
                    if (features.length > 0) {
                        result += `\u001b[1;33mFeatures:\u001b[0m      ${features.join(', ')}\n`;
                    }

                    const iconUrl = guild.iconURL({ dynamic: true, size: 4096 });
                    if (iconUrl) result += `\u001b[1;33mIcon:\u001b[0m          ${iconUrl}\n`;
                    const bannerUrl = guild.bannerURL({ dynamic: true, size: 4096 });
                    if (bannerUrl) result += `\u001b[1;33mBanner:\u001b[0m        ${bannerUrl}\n`;

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                    if (iconUrl) await message.channel.send(iconUrl).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to dump server data.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint token full dump <token>
            if (sub1 === 'token' && sub2 === 'full') {
                const token = target || args[3];
                if (!token) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint token full dump <token>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] ANALYZING TOKEN...\u001b[0m\n\`\`\``);

                try {
                    // Decode JWT-like token parts (Discord tokens are base64url encoded)
                    const parts = token.split('.');
                    let userId = '';
                    let decodedTs = '';
                    if (parts.length >= 2) {
                        try {
                            userId = Buffer.from(parts[0], 'base64').toString('utf8');
                            if (parts[1]) {
                                const tsBytes = Buffer.from(parts[1], 'base64');
                                if (tsBytes.length >= 4) {
                                    const tsNum = tsBytes.readUInt32BE(0);
                                    decodedTs = new Date((tsNum + 1293840000) * 1000).toUTCString();
                                }
                            }
                        } catch {}
                    }

                    // Validate against Discord API
                    const discordRes = await fetch('https://discord.com/api/v10/users/@me', {
                        headers: { Authorization: token }
                    });
                    const discordData: any = await discordRes.json();

                    let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] TOKEN FULL DUMP\u001b[0m\n`;
                    result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;

                    if (discordData.id) {
                        result += `\u001b[1;32m[+] TOKEN VALID\u001b[0m\n`;
                        result += `\u001b[1;33mUsername:\u001b[0m      ${discordData.username}${discordData.discriminator !== '0' ? '#' + discordData.discriminator : ''}\n`;
                        result += `\u001b[1;33mID:\u001b[0m            ${discordData.id}\n`;
                        result += `\u001b[1;33mEmail:\u001b[0m         ${discordData.email || 'Not accessible'}\n`;
                        result += `\u001b[1;33mPhone:\u001b[0m         ${discordData.phone || 'None'}\n`;
                        result += `\u001b[1;33mMFA Enabled:\u001b[0m   ${discordData.mfa_enabled ? 'Yes' : 'No'}\n`;
                        result += `\u001b[1;33mVerified:\u001b[0m      ${discordData.verified ? 'Yes' : 'No'}\n`;
                        result += `\u001b[1;33mNitro:\u001b[0m         ${discordData.premium_type === 2 ? 'Nitro Boost' : discordData.premium_type === 1 ? 'Classic' : 'None'}\n`;
                        result += `\u001b[1;33mLocale:\u001b[0m        ${discordData.locale || 'Unknown'}\n`;
                        if (discordData.avatar) {
                            result += `\u001b[1;33mAvatar:\u001b[0m        https://cdn.discordapp.com/avatars/${discordData.id}/${discordData.avatar}.png\n`;
                        }
                        // Fetch billing info
                        const billingRes = await fetch('https://discord.com/api/v10/users/@me/billing/payment-sources', {
                            headers: { Authorization: token }
                        });
                        const billingData: any = await billingRes.json().catch(() => null);
                        if (Array.isArray(billingData) && billingData.length > 0) {
                            result += `\u001b[1;31mPayment Methods: ${billingData.length}\u001b[0m\n`;
                            billingData.slice(0, 3).forEach((pm: any) => {
                                result += `  \u001b[1;33m• ${pm.type === 1 ? 'Card' : pm.type === 2 ? 'PayPal' : 'Other'}\u001b[0m`;
                                if (pm.billing_address?.country) result += ` (${pm.billing_address.country})`;
                                if (pm.last_4) result += ` ****${pm.last_4}`;
                                result += `\n`;
                            });
                        }
                        // Guild count
                        const guildsRes = await fetch('https://discord.com/api/v10/users/@me/guilds', {
                            headers: { Authorization: token }
                        });
                        const guildsData: any = await guildsRes.json().catch(() => null);
                        if (Array.isArray(guildsData)) {
                            result += `\u001b[1;33mGuilds:\u001b[0m        ${guildsData.length}\n`;
                        }
                    } else {
                        result += `\u001b[1;31m[!] TOKEN INVALID OR EXPIRED\u001b[0m\n`;
                        result += `\u001b[1;33mMessage:\u001b[0m ${discordData.message || 'Unknown error'}\n`;
                    }

                    if (userId) result += `\u001b[1;30mDecoded ID part: ${userId}\u001b[0m\n`;
                    if (decodedTs) result += `\u001b[1;30mToken issued ~: ${decodedTs}\u001b[0m\n`;

                    result += `\`\`\``;
                    await message.edit(result).catch(() => {});
                } catch (e) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Token analysis failed.\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            // .osint ip full report <ip>
            if (sub1 === 'ip' && sub2 === 'full') {
                const ip = target || args[3];
                if (!ip) {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}osint ip full report <ip>\u001b[0m\n\`\`\``).catch(() => {});
                }

                await message.edit(`\`\`\`ansi\n\u001b[1;34m[*] RUNNING FULL IP REPORT ON: ${ip}\u001b[0m\n\u001b[1;30m> Querying multiple sources...\u001b[0m\n\`\`\``);

                const [main, info] = await Promise.all([
                    ipApiLookup(ip),
                    ipInfoLookup(ip),
                ]);

                if (!main || main.status === 'fail') {
                    return message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Invalid IP or all lookups failed.\u001b[0m\n\`\`\``).catch(() => {});
                }

                const mapUrl = staticMapUrl(main.lat, main.lon, 11);
                const googleMapsUrl = `https://maps.google.com/?q=${main.lat},${main.lon}`;

                let result = `\`\`\`ansi\n\u001b[1;36m[NETRUNNER] FULL IP REPORT: ${main.query}\u001b[0m\n`;
                result += `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n`;
                result += `\u001b[1;36m[GEO]\u001b[0m\n`;
                result += `  \u001b[1;33mIP:\u001b[0m          ${main.query}\n`;
                result += `  \u001b[1;33mCountry:\u001b[0m     ${main.country} (${main.countryCode})\n`;
                result += `  \u001b[1;33mRegion:\u001b[0m      ${main.regionName} (${main.region})\n`;
                result += `  \u001b[1;33mCity:\u001b[0m        ${main.city}\n`;
                result += `  \u001b[1;33mPostcode:\u001b[0m    ${main.zip || '—'}\n`;
                result += `  \u001b[1;33mCoords:\u001b[0m      ${main.lat}, ${main.lon}\n`;
                result += `  \u001b[1;33mTimezone:\u001b[0m    ${main.timezone}\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[NETWORK]\u001b[0m\n`;
                result += `  \u001b[1;33mISP:\u001b[0m         ${main.isp}\n`;
                result += `  \u001b[1;33mOrg:\u001b[0m         ${main.org || '—'}\n`;
                result += `  \u001b[1;33mAS:\u001b[0m          ${main.as || '—'}\n`;
                result += `  \u001b[1;33mASName:\u001b[0m      ${main.asname || '—'}\n`;
                result += `  \u001b[1;33mHostname:\u001b[0m    ${main.reverse || info?.hostname || '—'}\n`;
                if (info?.org) result += `  \u001b[1;33mProvider:\u001b[0m    ${info.org}\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[FLAGS]\u001b[0m\n`;
                result += `  \u001b[1;33mMobile:\u001b[0m      ${main.mobile ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `  \u001b[1;33mProxy/VPN:\u001b[0m   ${main.proxy ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `  \u001b[1;33mHosting/DC:\u001b[0m  ${main.hosting ? '\u001b[1;31mYES\u001b[0m' : 'No'}\n`;
                result += `\u001b[1;30m──\u001b[0m\n`;
                result += `\u001b[1;36m[MAP]\u001b[0m\n`;
                result += `  ${googleMapsUrl}\n`;
                result += `\`\`\``;

                await message.edit(result).catch(() => {});
                // Send the map as image
                await message.channel.send(mapUrl).catch(() => {});
                return;
            }

            // Unknown osint subcommand
            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Unknown osint command. Use ${prefix}help osint\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── AFK ───────────────────────────────────────────────────────────────
        if (command === 'afk') {
            const reason = fullArgs.trim() || "I'm AFK right now.";
            const updated = { ...config, isAfk: true, afkMessage: reason, afkSince: Date.now() } as any;
            clientConfigs.set(configId, updated);
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] AFK mode enabled.\u001b[0m\n\u001b[1;33mReason:\u001b[0m ${reason}\n\`\`\``).catch(() => {});
            return;
        }

        // ── UNAFK ─────────────────────────────────────────────────────────────
        if (command === 'unafk') {
            const updated = { ...config, isAfk: false, afkMessage: '', afkSince: null } as any;
            clientConfigs.set(configId, updated);
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] AFK mode disabled.\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── SNIPE ─────────────────────────────────────────────────────────────
        if (command === 'snipe') {
            const requestedIndex = Math.max(1, parseInt(args[0]) || 1) - 1; // 0-based
            const channelSnipes = snipedMessages.get(configId)?.get(message.channel.id);
            if (!channelSnipes || channelSnipes.length === 0) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No recently deleted messages in this channel.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            if (requestedIndex >= channelSnipes.length) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Only ${channelSnipes.length} deleted message(s) cached in this channel.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const snipe = channelSnipes[requestedIndex];
            const ago = Math.floor((Date.now() - snipe.timestamp) / 1000);
            const label = requestedIndex === 0 ? 'Last Deleted' : `Deleted #${requestedIndex + 1}`;
            await message.edit(
                `\`\`\`ansi\n\u001b[1;36m[SNIPE] ${label}\u001b[0m\n` +
                `\u001b[1;30m${'─'.repeat(44)}\u001b[0m\n` +
                `\u001b[1;33mAuthor:\u001b[0m  ${snipe.author}\n` +
                `\u001b[1;33mContent:\u001b[0m ${snipe.content}\n` +
                `\u001b[1;33mDeleted:\u001b[0m ${ago}s ago\n` +
                `\`\`\``
            ).catch(() => {});
            return;
        }

        // ── BULLY ─────────────────────────────────────────────────────────────
        if (command === 'bully') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                const bi = bullyIntervals.get(configId);
                if (bi) { clearInterval(bi.interval); bullyIntervals.delete(configId); }
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Bully mode stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            const intervalSecs = Math.max(1, parseInt(args[1]) || 5);
            if (!userId) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}bully <@user> [interval_sec]\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const existing = bullyIntervals.get(configId);
            if (existing) clearInterval(existing.interval);
            const interval = setInterval(async () => {
                await message.channel.send(`<@${userId}>`).catch(() => {});
            }, intervalSecs * 1000);
            bullyIntervals.set(configId, { interval, channelId: message.channel.id });
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] Bullying <@${userId}> every ${intervalSecs}s.\u001b[0m\n` +
                `\u001b[1;30mUse ${prefix}bully stop to stop.\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── SPAM ──────────────────────────────────────────────────────────────
        if (command === 'spam') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                activeSpams.set(configId, false);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Spam stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const count = parseInt(args[0]);
            const spamMsg = args.slice(1).join(' ');
            if (isNaN(count) || count < 1 || !spamMsg) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}spam <count> <message>\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            activeSpams.set(configId, true);
            await message.delete().catch(() => {});
            for (let i = 0; i < Math.min(count, 50); i++) {
                if (!activeSpams.get(configId)) break;
                await message.channel.send(spamMsg).catch(() => {});
                await new Promise(r => setTimeout(r, 800));
            }
            activeSpams.set(configId, false);
            return;
        }

        // ── AUTOREACT ─────────────────────────────────────────────────────────
        if (command === 'autoreact') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                autoReactConfigs.delete(configId);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Auto-react disabled.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            const rawEmoji = args[1];
            if (!userId || !rawEmoji) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}autoreact <@user> <emoji> | ${prefix}autoreact stop\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            // Normalize custom emoji brackets so it's always stored as name:id
            const customMatch = rawEmoji.match(/^<a?:(\w+:\d+)>$/);
            const emoji = customMatch ? customMatch[1] : rawEmoji;
            autoReactConfigs.set(configId, { userOption: userId, emoji });
            await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Auto-reacting to <@${userId}> with ${rawEmoji}\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── TRAP ──────────────────────────────────────────────────────────────
        if (command === 'trap') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                const mention = args[1];
                const userId = mention?.replace(/[<@!>]/g, '');
                if (userId) {
                    trappedUsers.get(configId)?.delete(userId);
                } else {
                    trappedUsers.delete(configId);
                }
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Trap stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            if (!userId) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}trap <@user> | ${prefix}trap stop [<@user>]\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            try {
                const targetUser = await client.users.fetch(userId);
                const gc = await (client as any).user?.createGroupDM([userId]).catch(() => null);
                if (!gc) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to create GC with that user.\u001b[0m\n\`\`\``).catch(() => {});
                    return;
                }
                if (!trappedUsers.has(configId)) trappedUsers.set(configId, new Map());
                trappedUsers.get(configId)!.set(userId, gc.id);
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Trapped ${targetUser.tag} in GC.\u001b[0m\n` +
                    `\u001b[1;33mGC ID:\u001b[0m ${gc.id}\n` +
                    `\u001b[1;30mThey will be re-invited if they leave.\u001b[0m\n\`\`\``
                ).catch(() => {});
            } catch {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to trap user.\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── GC ────────────────────────────────────────────────────────────────
        if (command === 'gc') {
            const sub1 = args[0]?.toLowerCase();
            const sub2 = args[1]?.toLowerCase();
            const param = args[2];

            if (sub1 === 'allowall') {
                const enable = sub2 === 'on';
                await storage.updateBot(configId, { gcAllowAll: enable });
                clientConfigs.set(configId, { ...config, gcAllowAll: enable });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] GC Allow-All: ${enable ? 'ON' : 'OFF'}\u001b[0m\n\`\`\``
                ).catch(() => {});
                return;
            }

            if (sub1 === 'whitelist') {
                const currentWl: string[] = (config.whitelistedGcs as string[]) || [];
                if (sub2 === 'add' && param) {
                    if (!currentWl.includes(param)) currentWl.push(param);
                    await storage.updateBot(configId, { whitelistedGcs: currentWl });
                    clientConfigs.set(configId, { ...config, whitelistedGcs: currentWl });
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] GC ${param} whitelisted.\u001b[0m\n\`\`\``).catch(() => {});
                } else if (sub2 === 'remove' && param) {
                    const newWl = currentWl.filter(id => id !== param);
                    await storage.updateBot(configId, { whitelistedGcs: newWl });
                    clientConfigs.set(configId, { ...config, whitelistedGcs: newWl });
                    await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] GC ${param} removed from whitelist.\u001b[0m\n\`\`\``).catch(() => {});
                } else if (sub2 === 'list') {
                    const list = currentWl.length > 0 ? currentWl.join('\n  ') : 'None';
                    await message.edit(
                        `\`\`\`ansi\n\u001b[1;36m[GC Whitelist]\u001b[0m\n  ${list}\n\`\`\``
                    ).catch(() => {});
                } else {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}gc whitelist add/remove/list [gcId]\u001b[0m\n\`\`\``).catch(() => {});
                }
                return;
            }

            await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}gc allowall on/off | ${prefix}gc whitelist add/remove/list\u001b[0m\n\`\`\``).catch(() => {});
            return;
        }

        // ── PURGE ─────────────────────────────────────────────────────────────
        if (command === 'purge') {
            const count = Math.min(100, Math.max(1, parseInt(args[0]) || 10));
            await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Purging ${count} messages...\u001b[0m\n\`\`\``).catch(() => {});
            try {
                // Fetch a large batch and filter to messages by this user
                const fetched = await message.channel.messages.fetch({ limit: 100 }).catch(() => null);
                if (!fetched) {
                    await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Failed to fetch messages.\u001b[0m\n\`\`\``).catch(() => {});
                    return;
                }
                const ownMessages = [...fetched.values()]
                    .filter((m: any) => m.author.id === client.user?.id)
                    .slice(0, count);
                let deleted = 0;
                for (const m of ownMessages) {
                    await (m as any).delete().catch(() => {});
                    deleted++;
                    await new Promise(r => setTimeout(r, 400));
                }
                await message.channel.send(`\`\`\`ansi\n\u001b[1;32m[✓] Purged ${deleted} message(s).\u001b[0m\n\`\`\``).catch(() => {});
            } catch {
                await message.channel.send(`\`\`\`ansi\n\u001b[1;31m[!] Purge failed.\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

        // ── CLOSEALLDMS ────────────────────────────────────────────────────────
        if (command === 'closealldms') {
            await message.edit(`\`\`\`ansi\n\u001b[1;33m[~] Closing all DM channels...\u001b[0m\n\`\`\``).catch(() => {});
            // type 'DM' (1) = private DMs only — GROUP_DM (3) excluded intentionally
            const dmChannels = client.channels.cache.filter(
                (c: any) => c.type === 'DM' || c.type === 1
            );
            const toClose = [...dmChannels.values()];
            await Promise.allSettled(toClose.map((ch: any) => ch.delete().catch(() => {})));
            await message.channel.send(
                `\`\`\`ansi\n\u001b[1;32m[✓] Closed ${toClose.length} DM channel(s). GCs untouched.\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── MASSDM ────────────────────────────────────────────────────────────
        if (command === 'massdm') {
            const dmContent = fullArgs.trim();
            if (!dmContent) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}massdm <message>\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            // Type 1 = friend in discord.js-selfbot-v13 relationships cache
            const relationshipCache: Map<string, number> = (client as any).relationships?.cache ?? new Map();
            const friendIds: string[] = [];
            for (const [userId, type] of relationshipCache.entries()) {
                if (type === 1) friendIds.push(userId);
            }

            if (friendIds.length === 0) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] No friends found on this account.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }

            await message.edit(
                `\`\`\`ansi\n\u001b[1;33m[~] Blasting DMs to ${friendIds.length} friend(s)...\u001b[0m\n\`\`\``
            ).catch(() => {});

            let sent = 0, failed = 0;
            const BATCH = 5;

            for (let i = 0; i < friendIds.length; i += BATCH) {
                const batch = friendIds.slice(i, i + BATCH);
                const results = await Promise.allSettled(
                    batch.map(async (userId) => {
                        const user = await client.users.fetch(userId).catch(() => null);
                        if (!user) throw new Error('fetch_failed');
                        // Only send to private DMs — skip bots / GC-only users
                        const dm = await user.createDM().catch(() => null);
                        if (!dm) throw new Error('dm_open_failed');
                        await dm.send(dmContent);
                    })
                );
                for (const r of results) {
                    if (r.status === 'fulfilled') sent++;
                    else failed++;
                }
                // brief pause between batches to stay under rate limits
                if (i + BATCH < friendIds.length) {
                    await new Promise(r => setTimeout(r, 400));
                }
            }

            await message.channel.send(
                `\`\`\`ansi\n\u001b[1;32m[✓] Mass DM complete.\u001b[0m\n` +
                `\u001b[1;33mSent:\u001b[0m   ${sent}\n` +
                `\u001b[1;31mFailed:\u001b[0m ${failed}\n` +
                `\u001b[1;30mTotal: ${friendIds.length} friends — GCs excluded\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── STOPALL ────────────────────────────────────────────────────────────
        if (command === 'stopall') {
            // Stop bully
            const bi = bullyIntervals.get(configId);
            if (bi) { clearInterval(bi.interval); bullyIntervals.delete(configId); }
            // Stop spam
            activeSpams.set(configId, false);
            // Stop autoreact
            autoReactConfigs.delete(configId);
            // Stop trap
            trappedUsers.delete(configId);
            // Stop mock
            mockTargets.delete(configId);
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] All automations stopped.\u001b[0m\n` +
                `\u001b[1;30mBully · Spam · AutoReact · Trap · Mock\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── MOCK ──────────────────────────────────────────────────────────────
        if (command === 'mock') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'stop') {
                mockTargets.delete(configId);
                await message.edit(`\`\`\`ansi\n\u001b[1;32m[✓] Mock mode stopped.\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            const mention = args[0];
            const userId = mention?.replace(/[<@!>]/g, '');
            if (!userId) {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}mock <@user> | ${prefix}mock stop\u001b[0m\n\`\`\``).catch(() => {});
                return;
            }
            mockTargets.set(configId, userId);
            await message.edit(
                `\`\`\`ansi\n\u001b[1;32m[✓] Now mocking <@${userId}>.\u001b[0m\n` +
                `\u001b[1;30mEvery message they send will be echoed in mocking case.\u001b[0m\n\`\`\``
            ).catch(() => {});
            return;
        }

        // ── PREFIX ────────────────────────────────────────────────────────────
        if (command === 'prefix') {
            const sub = args[0]?.toLowerCase();
            const newPrefix = args[1];
            if (sub === 'set' && newPrefix) {
                await storage.updateBot(configId, { commandPrefix: newPrefix });
                clientConfigs.set(configId, { ...config, commandPrefix: newPrefix });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Prefix updated to: ${newPrefix}\u001b[0m\n\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}prefix set <new_prefix>\u001b[0m\n\`\`\``
                ).catch(() => {});
            }
            return;
        }

        // ── REPORT SERVER ─────────────────────────────────────────────────────
        if (command === 'report') {
            const sub = args[0]?.toLowerCase();
            const guildId = args[1];
            if (sub === 'server' && guildId) {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;33m[~] Reporting server ${guildId} — sending 20 reports...\u001b[0m\n\`\`\``
                ).catch(() => {});
                const token = (client as any).token;
                let success = 0;
                let failed = 0;
                for (let i = 0; i < 20; i++) {
                    try {
                        const res = await fetch('https://discord.com/api/v9/report', {
                            method: 'POST',
                            headers: {
                                'Authorization': token,
                                'Content-Type': 'application/json',
                                'User-Agent': 'Mozilla/5.0',
                            },
                            body: JSON.stringify({
                                guild_id: guildId,
                                channel_id: null,
                                message_id: null,
                                breadcrumbs: [
                                    { question_id: '1', response_id: '2' },
                                    { question_id: '2', response_id: '8' },
                                ],
                            }),
                        });
                        if (res.ok || res.status === 201 || res.status === 204) {
                            success++;
                        } else {
                            failed++;
                        }
                    } catch {
                        failed++;
                    }
                    await new Promise(r => setTimeout(r, 500));
                }
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Done. ${success}/20 reports sent for server ${guildId} (harassment & bullying).\u001b[0m${failed > 0 ? `\n\u001b[1;31m[!] ${failed} failed.\u001b[0m` : ''}\n\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}report server <guild_id>\u001b[0m\n\`\`\``
                ).catch(() => {});
            }
            return;
        }

        // ── NITROSNIPER ───────────────────────────────────────────────────────
        if (command === 'nitrosniper') {
            const sub = args[0]?.toLowerCase();
            if (sub === 'on' || sub === 'off') {
                const enable = sub === 'on';
                await storage.updateBot(configId, { nitroSniper: enable });
                clientConfigs.set(configId, { ...config, nitroSniper: enable });
                await message.edit(
                    `\`\`\`ansi\n\u001b[1;32m[✓] Nitro Sniper: ${enable ? 'ON' : 'OFF'}\u001b[0m\n\`\`\``
                ).catch(() => {});
            } else {
                await message.edit(`\`\`\`ansi\n\u001b[1;31m[!] Usage: ${prefix}nitrosniper on/off\u001b[0m\n\`\`\``).catch(() => {});
            }
            return;
        }

      });

      const LOGIN_TIMEOUT_MS = 20000;
      await Promise.race([
        client.login(initialConfig.token),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('LOGIN_TIMEOUT')), LOGIN_TIMEOUT_MS)
        ),
      ]);
      activeClients.set(configId, client);
      return { success: true };
    } catch (e: any) {
      console.error(`Failed to start bot ${initialConfig.name}:`, e);
      // Clean up any partial state
      try { activeClients.get(configId)?.destroy(); } catch {}
      activeClients.delete(configId);
      clientConfigs.delete(configId);
      await storage.updateBot(configId, { isRunning: false }).catch(() => {});
      const msg = e?.message || String(e);
      let friendly: string;
      if (msg.includes('TOKEN_INVALID') || msg.toLowerCase().includes('invalid token')) {
        friendly = 'Invalid Discord token — double-check and try again.';
      } else if (msg.includes('LOGIN_TIMEOUT')) {
        friendly = 'Connection timed out — Discord did not respond in time. Check if the token is correct and try again.';
      } else if (msg.toLowerCase().includes('disallowed intents') || msg.includes('4014')) {
        friendly = 'Privileged intents are not enabled for this token.';
      } else if (msg.toLowerCase().includes('rate limit') || msg.includes('429')) {
        friendly = 'Rate limited by Discord — please wait a moment and try again.';
      } else {
        friendly = `Failed to connect: ${msg}`;
      }
      return { success: false, error: friendly };
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

    this.clearRpcInterval(config.id);

    const details = config.rpcTitle?.trim();
    const state = config.rpcSubtitle?.trim();
    const appName = config.rpcAppName?.trim();
    const hasRpc = appName || (details && details.length >= 2) || (state && state.length >= 2);

    if (!hasRpc) {
        try {
            client.user.setPresence({ status: 'online', afk: false, activities: [] });
        } catch (_) {}
        return;
    }

    const typeMap: Record<string, number> = {
        PLAYING: 0,
        STREAMING: 1,
        LISTENING: 2,
        WATCHING: 3,
        COMPETING: 5,
    };
    const rpcTypeStr = (config.rpcType?.toUpperCase() || "PLAYING");
    const rpcTypeNum = typeMap[rpcTypeStr] ?? 0;

    // ── Progress bar / seek bar ────────────────────────────────────────────
    // Values stored are seconds (start = elapsed position, end = total duration).
    // We compute fixed absolute Unix ms timestamps ONCE so Discord's client
    // naturally advances the seek bar in real time without us having to touch it.
    const rawStart = config.rpcStartTimestamp?.trim();
    const rawEnd   = config.rpcEndTimestamp?.trim();
    const startSec = rawStart ? parseFloat(rawStart) : 0;
    const endSec   = rawEnd   ? parseFloat(rawEnd)   : 0;

    let fixedTimestamps: { start: number; end?: number } | null = null;
    if (endSec > 0) {
        const now = Date.now();
        // absoluteStart = when the track "began" based on elapsed position
        const absoluteStart = Math.floor(now - startSec * 1000);
        // absoluteEnd   = when the track will finish
        const absoluteEnd   = absoluteStart + Math.floor(endSec * 1000);
        fixedTimestamps = { start: absoluteStart, end: absoluteEnd };
        console.log(`[RPC] Seek bar for ${client.user.tag}: ${startSec}s / ${endSec}s → start=${absoluteStart} end=${absoluteEnd}`);
    } else if (startSec > 0) {
        // Only a start was given → show elapsed timer (no total / no bar)
        const absoluteStart = Math.floor(Date.now() - startSec * 1000);
        fixedTimestamps = { start: absoluteStart };
    }

    // Build the base activity object (used on every re-send)
    const rpc: any = {
        name: appName || "discord",
        type: rpcTypeNum,
    };

    // Streaming requires a URL to show the progress bar
    if (rpcTypeNum === 1) {
        rpc.url = "https://www.twitch.tv/discord";
    }

    if (details && details.length >= 2) rpc.details = details;
    if (state  && state.length  >= 2) rpc.state   = state;

    // Attach fixed timestamps — same object every re-send so the bar moves
    // naturally (Discord uses wall clock vs these fixed anchors)
    if (fixedTimestamps) {
        rpc.timestamps = fixedTimestamps;
    }

    if (config.rpcImage) {
        rpc.assets = {
            large_image: config.rpcImage,
            large_text: details || undefined,
        };
    }

    console.log(`[RPC] Applying for ${client.user.tag}:`, JSON.stringify(rpc));

    const applyPresence = () => {
        if (!client.user) return;
        try {
            client.user.setPresence({
                status: 'online',
                afk: false,
                activities: [rpc],
            });
        } catch (e) {
            console.error(`[RPC] Failed to set activity for ${client.user?.tag}:`, e);
        }
    };

    applyPresence();

    const interval = setInterval(applyPresence, 30000);
    rpcIntervals.set(config.id, interval);
  }

  static async stopBot(id: number) {
    this.clearRpcInterval(id);
    const vcConn = voiceConnections.get(id);
    if (vcConn) {
      try { vcConn.disconnect(); } catch {}
      voiceConnections.delete(id);
    }
    const client = activeClients.get(id);
    if (client) {
      client.destroy();
      activeClients.delete(id);
      clientConfigs.delete(id);
      botStartTimes.delete(id);
    }
    await storage.updateBot(id, { isRunning: false, lastSeen: new Date().toISOString() });
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

    const isCurrentlyRunning = activeClients.has(id);
    const wantsRunning = updates.isRunning;

    if (wantsRunning === true && !isCurrentlyRunning) {
      console.log(`[manager] Starting bot ${id} due to isRunning=true`);
      this.startBot(updated).catch(e => console.error(`[manager] Failed to start bot ${id}:`, e));
    } else if (wantsRunning === false && isCurrentlyRunning) {
      console.log(`[manager] Stopping bot ${id} due to isRunning=false`);
      this.stopBot(id).catch(e => console.error(`[manager] Failed to stop bot ${id}:`, e));
    } else {
      const client = activeClients.get(id);
      if (client) {
        console.log(`[manager] Config updated for bot ${id}, re-applying RPC...`);
        this.applyRpc(client, updated);
      }
    }
  }
}
