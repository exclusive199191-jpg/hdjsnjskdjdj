import re

with open('server/services/botManager.ts', 'r') as f:
    content = f.read()

# Find and replace the COMMANDS_LIST block
start = content.index('const COMMANDS_LIST = [')
end = content.index('];\n', start) + 3

new_list = """const COMMANDS_LIST = [
    // General
    { name: 'help',          desc: 'Show this menu.', cat: 'General' },
    { name: 'ping',          desc: 'Check latency.', cat: 'General' },
    { name: 'uptime',        desc: 'Show bot uptime.', cat: 'General' },
    { name: 'prefix',        desc: 'Set prefix.', cat: 'General' },
    { name: 'stopall',       desc: 'Stop all modules.', cat: 'General' },
    { name: 'time',          desc: 'Show current time.', cat: 'General' },
    { name: 'snowflake',     desc: 'Decode a snowflake ID.', cat: 'General' },
    { name: 'creationdate',  desc: 'Get creation date from ID.', cat: 'General' },
    { name: 'server',        desc: 'Get server info.', cat: 'General' },
    { name: 'user',          desc: 'Get user info.', cat: 'General' },
    { name: 'coin',          desc: 'Flip a coin.', cat: 'General' },
    { name: 'roll',          desc: 'Roll a die.', cat: 'General' },
    { name: '8ball',         desc: 'Ask the magic 8-ball.', cat: 'General' },
    { name: 'rps',           desc: 'Play rock-paper-scissors.', cat: 'General' },
    { name: 'choose',        desc: 'Pick from a list.', cat: 'General' },
    { name: 'fact',          desc: 'Random useless fact.', cat: 'General' },
    { name: 'joke',          desc: 'Random joke.', cat: 'General' },
    // Fun / Tools
    { name: 'bully',         desc: 'Spam insults at a user.', cat: 'Fun/Tools' },
    { name: 'bully off',     desc: 'Stop the bully loop.', cat: 'Fun/Tools' },
    { name: 'autoreact',     desc: "Auto-react to a user's messages.", cat: 'Fun/Tools' },
    { name: 'react all',     desc: 'React with 26+ emojis.', cat: 'Fun/Tools' },
    { name: 'pfp',           desc: "Get a user's profile picture.", cat: 'Fun/Tools' },
    { name: 'banner',        desc: "Get a user's banner.", cat: 'Fun/Tools' },
    { name: 'echo',          desc: 'Repeat text back.', cat: 'Fun/Tools' },
    { name: 'mock',          desc: 'MoCk TeXt.', cat: 'Fun/Tools' },
    { name: 'owo',           desc: 'owo-ify text.', cat: 'Fun/Tools' },
    { name: 'clap',          desc: 'Add claps between words.', cat: 'Fun/Tools' },
    { name: 'flip',          desc: 'Flip text upside down.', cat: 'Fun/Tools' },
    { name: 'zalgo',         desc: 'Corrupt text with zalgo.', cat: 'Fun/Tools' },
    { name: 'ship',          desc: 'Ship two users together.', cat: 'Fun/Tools' },
    { name: 'gayrate',       desc: 'Gay percentage joke.', cat: 'Fun/Tools' },
    { name: 'simprate',      desc: 'Simp meter joke.', cat: 'Fun/Tools' },
    { name: 'roast',         desc: 'Roast a user.', cat: 'Fun/Tools' },
    { name: 'compliment',    desc: 'Compliment a user.', cat: 'Fun/Tools' },
    { name: 'pickup',        desc: 'Send a pickup line.', cat: 'Fun/Tools' },
    { name: 'truth',         desc: 'Random truth question.', cat: 'Fun/Tools' },
    { name: 'dare',          desc: 'Random dare.', cat: 'Fun/Tools' },
    { name: 'wouldyourather', desc: 'Would you rather prompt.', cat: 'Fun/Tools' },
    // Automation
    { name: 'spam',          desc: 'Spam a message N times.', cat: 'Automation' },
    { name: 'flood',         desc: 'Flood a message continuously.', cat: 'Automation' },
    { name: 'spamstop',      desc: 'Stop spam or flood.', cat: 'Automation' },
    { name: 'nitro on',      desc: 'Enable nitro sniper.', cat: 'Automation' },
    { name: 'nitro off',     desc: 'Disable nitro sniper.', cat: 'Automation' },
    { name: 'afk',           desc: 'Toggle AFK mode.', cat: 'Automation' },
    // Management
    { name: 'gc allow',      desc: 'Allow all GC invites.', cat: 'Management' },
    { name: 'gc deny',       desc: 'Deny all GC invites.', cat: 'Management' },
    { name: 'gc trap',       desc: 'Trap a user in a GC.', cat: 'Management' },
    { name: 'gc whitelist',  desc: 'Whitelist a GC.', cat: 'Management' },
    { name: 'massdm',        desc: 'DM all friends and contacts.', cat: 'Management' },
    { name: 'closealldms',   desc: 'Close all DM channels.', cat: 'Management' },
    { name: 'purge',         desc: 'Delete your last N messages.', cat: 'Management' },
    { name: 'host',          desc: 'Host a new account by token.', cat: 'Management' },
    // OSINT
    { name: 'ip check',      desc: 'Look up an IP address.', cat: 'OSINT' },
    { name: 'snipe',         desc: 'Show last deleted message.', cat: 'OSINT' },
    { name: 'link check',    desc: 'Check if a URL is safe.', cat: 'OSINT' },
];
"""

content = content[:start] + new_list + content[end:]

with open('server/services/botManager.ts', 'w') as f:
    f.write(content)

print('Done')
