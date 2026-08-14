export type CommandCategory = "General" | "Automation" | "OSINT" | "Find";

export type CommandDoc = {
  category: CommandCategory;
  usage: string;
  summary: string;
  details: string;
  example: string;
};

export const COMMAND_CATEGORIES: CommandCategory[] = ["General", "Automation", "OSINT", "Find"];

export const COMMANDS: CommandDoc[] = [
  { category: "General", usage: "help [category] [page]", summary: "Open the compact command menu.", details: "Use a category number or name to browse a smaller, paginated menu directly inside Discord.", example: ".help 2 1" },
  { category: "General", usage: "uptime", summary: "Show the current session uptime.", details: "Returns the time since this account connected to bothost.", example: ".uptime" },
  { category: "General", usage: "ping", summary: "Check gateway latency.", details: "Displays the account's current WebSocket and response latency.", example: ".ping" },
  { category: "General", usage: "prefix set <new_prefix>", summary: "Change the command prefix.", details: "Updates the prefix used by this account. Keep it to one or two readable characters.", example: ".prefix set !" },
  { category: "General", usage: "report server <guild_id>", summary: "Open a server report flow.", details: "Starts the available server report options for a guild you can access.", example: ".report server 123456789012345678" },
  { category: "General", usage: "report msg", summary: "Report a replied-to message.", details: "Reply to a message first, then run the command to open the report flow.", example: ".report msg" },
  { category: "General", usage: "copy full server", summary: "Copy the accessible server structure.", details: "Copies roles, channels, and permissions where the account has the required access.", example: ".copy full server" },
  { category: "General", usage: "server emoji steal <guild_id>", summary: "Copy accessible server emojis.", details: "Uploads available emojis from the selected guild to the current server when permissions allow.", example: ".server emoji steal 123456789012345678" },
  { category: "General", usage: "server end <guild_id>", summary: "Run the server-end automation.", details: "Use only in spaces you own or are explicitly authorized to test. It sends the configured automation payload to accessible channels.", example: ".server end 123456789012345678" },
  { category: "General", usage: "server end stop", summary: "Stop server-end automation.", details: "Cancels the active server-end task for this account.", example: ".server end stop" },
  { category: "General", usage: "gpt <question>", summary: "Ask the assistant a question.", details: "Sends a short question to the configured text assistant and returns the response.", example: ".gpt summarize this thread" },
  { category: "General", usage: "logs", summary: "Show recent bot errors.", details: "Displays the latest errors captured for this running account.", example: ".logs" },
  { category: "General", usage: "stopall", summary: "Stop active automations.", details: "Cancels supported running loops and repeat tasks for this account.", example: ".stopall" },

  { category: "Automation", usage: "afk [reason]", summary: "Enable AFK replies.", details: "Replies to direct messages, direct mentions, and replies to the account with the optional reason.", example: ".afk away for the afternoon" },
  { category: "Automation", usage: "unafk", summary: "Disable AFK mode.", details: "Stops the AFK auto-reply behavior immediately.", example: ".unafk" },
  { category: "Automation", usage: "statusmover {word1,word2}", summary: "Rotate custom status text.", details: "Cycles through the supplied status words until stopped.", example: ".statusmover {working,reviewing,offline}" },
  { category: "Automation", usage: "statusmover stop", summary: "Stop the status mover.", details: "Leaves the current status in place and cancels future rotation.", example: ".statusmover stop" },
  { category: "Automation", usage: "snipe [count]", summary: "Show deleted messages.", details: "Displays messages recently observed before deletion in the current channel.", example: ".snipe 3" },
  { category: "Automation", usage: "purge [count]", summary: "Remove recent own messages.", details: "Deletes your recent messages in the current channel, up to the supported limit.", example: ".purge 10" },
  { category: "Automation", usage: "closealldms", summary: "Close open DM channels.", details: "Closes the account's open direct-message channels where the API permits it.", example: ".closealldms" },
  { category: "Automation", usage: "massdm <message>", summary: "Send a message to friends.", details: "Use only for opted-in recipients. This action can send many messages quickly.", example: ".massdm I am online" },
  { category: "Automation", usage: "mock <@user>", summary: "Mirror a user's messages.", details: "Repeats messages from the selected user in alternating case until stopped.", example: ".mock @member" },
  { category: "Automation", usage: "mock stop", summary: "Stop message mirroring.", details: "Cancels the active mock target.", example: ".mock stop" },
  { category: "Automation", usage: "nitrosniper on/off", summary: "Toggle gift-link monitoring.", details: "Turns the configured gift-link monitor on or off for this account.", example: ".nitrosniper off" },
  { category: "Automation", usage: "bully <@user>", summary: "Start a target automation.", details: "Use only in a private test environment with explicit consent. Adds the selected target to the active automation.", example: ".bully @member" },
  { category: "Automation", usage: "bully stop", summary: "Stop target automation.", details: "Cancels the active target automation.", example: ".bully stop" },
  { category: "Automation", usage: "ab", summary: "Run the configured burst.", details: "Starts the account's configured burst behavior.", example: ".ab" },
  { category: "Automation", usage: "spam <count> <message>", summary: "Repeat a message.", details: "Sends a message the requested number of times. Keep counts low and use only with permission.", example: ".spam 3 test message" },
  { category: "Automation", usage: "spam stop", summary: "Cancel message repetition.", details: "Stops the current repeat task.", example: ".spam stop" },
  { category: "Automation", usage: "autoreact <@user> <emoji>", summary: "React to a user's messages.", details: "Adds a reaction rule for the selected user and emoji.", example: ".autoreact @member :eyes:" },
  { category: "Automation", usage: "autoreact stop", summary: "Stop reaction rules.", details: "Removes active auto-reaction behavior for the current account.", example: ".autoreact stop" },
  { category: "Automation", usage: "gc allowall on/off", summary: "Control group-chat handling.", details: "Allows or blocks incoming group chats according to the account configuration.", example: ".gc allowall off" },
  { category: "Automation", usage: "gc whitelist add <gc_id>", summary: "Protect a group chat.", details: "Adds a group-chat ID to the protected list.", example: ".gc whitelist add 123456789012345678" },
  { category: "Automation", usage: "gc whitelist remove <gc_id>", summary: "Remove a protected group chat.", details: "Removes a group-chat ID from the protected list.", example: ".gc whitelist remove 123456789012345678" },
  { category: "Automation", usage: "gc whitelist list", summary: "List protected group chats.", details: "Shows group-chat IDs currently on the allowlist.", example: ".gc whitelist list" },

  { category: "OSINT", usage: "username breach check <user>", summary: "Check public breach sources.", details: "Queries configured public/authorized data sources for a username. Results depend on provider availability.", example: ".username breach check example_user" },
  { category: "OSINT", usage: "username leak check <user>", summary: "Check public leak sources.", details: "Runs the configured username lookup providers and returns available matches.", example: ".username leak check example_user" },
  { category: "OSINT", usage: "members msgs <count>", summary: "Read recent accessible messages.", details: "Shows recent non-bot messages available in the current server context.", example: ".members msgs 25" },
  { category: "OSINT", usage: "history export <user> [count]", summary: "Export a user's channel history.", details: "Fetches 100–500 messages by the selected user from the current readable channel or group chat and attaches a TXT file.", example: ".history export @member 250" },
  { category: "OSINT", usage: "osint user full dump <@user>", summary: "Build a user profile report.", details: "Combines the public Discord profile data available to the account with the configured lookup sources.", example: ".osint user full dump @member" },
  { category: "OSINT", usage: "osint discord <id>", summary: "Inspect a Discord ID.", details: "Returns public profile, snowflake timing, and available provider context for the ID.", example: ".osint discord 123456789012345678" },
  { category: "OSINT", usage: "osint server full dump", summary: "Build a server report.", details: "Collects the accessible public server metadata and available channel/member context.", example: ".osint server full dump" },
  { category: "OSINT", usage: "osint token full dump <token>", summary: "Inspect a token string.", details: "This command is intentionally not recommended. Never use it on credentials you do not own or have explicit permission to test.", example: ".osint token full dump <token>" },

  { category: "Find", usage: "ip check <address>", summary: "Look up public IP context.", details: "Returns coarse public geolocation and network context plus a map link. Private and reserved ranges are rejected.", example: ".ip check 8.8.8.8" },
  { category: "Find", usage: "osint ip full report <address>", summary: "Build an IP report.", details: "Runs the configured public IP sources and returns the available coarse network context.", example: ".osint ip full report 8.8.8.8" },
  { category: "Find", usage: "convert cords <coordinates>", summary: "Reverse-geocode coordinates.", details: "Accepts decimal or DMS coordinates and returns a readable public location.", example: ".convert cords 51.4816, -3.1791" },
  { category: "Find", usage: "who is <full name>", summary: "Find public biography context.", details: "Uses public knowledge sources to return a concise biography when one exists.", example: ".who is Ada Lovelace" },
  { category: "Find", usage: "who lives <address>", summary: "Inspect public address context.", details: "Returns limited public place and business context. It is not a private-person identity tool.", example: ".who lives 10 Downing Street" },
  { category: "Find", usage: "edr email <email>", summary: "Check email context.", details: "Returns configured deliverability and public exposure signals. Do not use it to target people without permission.", example: ".edr email hello@example.com" },
  { category: "Find", usage: "edr phone <number>", summary: "Check phone context.", details: "Returns available carrier and line-type context from authorized providers.", example: ".edr phone +12025550123" },
  { category: "Find", usage: "full report <inputs>", summary: "Combine several public lookups.", details: "Pass comma-separated supported inputs to create one combined report.", example: ".full report 8.8.8.8, hello@example.com" },
  { category: "Find", usage: "link check <url>", summary: "Check a URL for risk signals.", details: "Runs URL validation and configured public reputation checks.", example: ".link check https://example.com" },
];