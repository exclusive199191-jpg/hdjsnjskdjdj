# NETRUNNER_V1 - Discord Self-Bot Manager

## Overview

This is a full-stack web application for managing Discord self-bot instances. It provides a cyberpunk/hacker-themed dashboard where users can deploy, configure, and monitor multiple Discord self-bot accounts. Each bot supports Rich Presence (RPC) customization, AFK mode with auto-responses, Nitro sniping, and "bully target" lists. The app is called "NETRUNNER_V1" and has a terminal/cyber aesthetic throughout the UI.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router) with two main routes: Dashboard (`/`) and Bot Detail (`/bot/:id`)
- **State Management**: TanStack React Query for server state (fetching, caching, mutations)
- **Forms**: React Hook Form with Zod resolvers for validation
- **UI Components**: Shadcn/ui (new-york style) built on Radix UI primitives, heavily customized with a cyberpunk dark theme
- **Styling**: Tailwind CSS with CSS variables for theming. Custom neon green/purple color scheme. Custom fonts: JetBrains Mono (monospace), Orbitron (display headings), Rajdhani (body text)
- **Animations**: Framer Motion for transitions and terminal-style animations
- **Custom Components**: CyberButton, CyberInput, TerminalCard, BotStatusBadge — all styled with corner accents, neon glows, and a hacker aesthetic
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript, executed via `tsx` in development
- **API Pattern**: RESTful JSON API under `/api/` prefix. Routes defined in `server/routes.ts` with Zod validation
- **Route Definitions**: Shared route contracts in `shared/routes.ts` define method, path, input schema, and response schemas — used by both client and server
- **Bot Management**: `BotManager` service class (`server/services/botManager.ts`) manages Discord self-bot client instances in memory using `discord.js-selfbot-v13`. Bots auto-start on creation if `isRunning` is true. Supports RPC, AFK auto-reply, and self-message command handling (prefix: `.`)
- **Development**: Vite dev server with HMR proxied through Express. In production, static files served from `dist/public`
- **Build**: Custom build script using esbuild for server bundling and Vite for client bundling

### Data Storage
- **Storage**: File-based JSON persistence at `data/store.json` — survives server restarts without any database setup required
- **ORM**: Drizzle ORM schema defined in `shared/schema.ts` for type safety (not used for actual DB queries)
- **Schema Location**: `shared/schema.ts` — single source of truth for TypeScript types and Zod validation schemas
- **Storage Layer**: `server/storage.ts` implements `IStorage` interface with `FileStorage` class that reads/writes `data/store.json` atomically
- **Sessions**: File-based sessions stored in `data/sessions/` with a persisted secret in `data/session_secret` so sessions survive restarts
- **Bot Auto-start**: On server startup, all bots with `isRunning: true` are automatically reconnected to Discord
- **Bot Lifecycle**: `ready` event saves `discordTag`, `discordId`, and sets `isRunning: true`; `stopBot` sets `isRunning: false`

### Database Schema
Single table `bot_configs`:
- `id` (serial, PK)
- `token` (text, unique, required) — Discord user token
- `name` (text, default "Unknown")
- `isRunning` (boolean, default true)
- RPC fields: `rpcTitle`, `rpcSubtitle`, `rpcAppName`, `rpcImage`, `rpcType` (PLAYING/STREAMING/LISTENING/WATCHING)
- Presence: `presenceStatus` (online/idle/dnd/invisible), `statusMoverWords` (comma-separated cycling custom-status words; empty = disabled). The status mover runs at a fixed 5s cadence to stay within Discord's gateway rate limits, and is configured from the RPC dialog.
- Automation: `afkMessage`, `isAfk`, `nitroSniper`
- `bullyTargets` (text array) — list of Discord user IDs
- `lastSeen` (timestamp)

### API Endpoints
- `GET /api/bots` — List all bot configurations (requires user session)
- `GET /api/bots/:id` — Get single bot config (requires user session)
- `POST /api/bots` — Create new bot (auto-starts on creation)
- `PUT /api/bots/:id` — Update bot configuration
- `DELETE /api/bots/:id` — Delete bot
- `POST /api/bots/:id/stop` — Stop a bot instance
- `POST /api/bots/:id/restart` — Restart a bot instance
- `POST /api/admin/auth` — Admin login (PIN `2365` by default, or set the `ADMIN_PIN` environment variable)
- `GET /api/admin/bots` — Admin: list all bots across all users
- `GET /api/admin/data` — Admin: user and bot statistics
- `DELETE /api/admin/bots/:id` — Admin: delete any bot
- `POST /api/admin/bots/:id/restart` — Admin: restart any bot
- `POST /api/admin/bots/:id/stop` — Admin: stop any bot
- `POST /api/admin/bots/disconnect-all` — Admin: disconnect all running bots

## External Dependencies

- **PostgreSQL**: Primary database, connected via `DATABASE_URL` environment variable. Uses `pg` (node-postgres) connection pool
- **discord.js-selfbot-v13**: Discord self-bot library for connecting user accounts, setting Rich Presence, listening to messages. Clients are managed in-memory by `BotManager`
- **Shadcn/ui + Radix UI**: Full suite of accessible UI primitives (dialog, dropdown, tabs, switch, toast, etc.)
- **Drizzle ORM + Drizzle Kit**: Database ORM and migration tooling for PostgreSQL
- **TanStack React Query**: Client-side data fetching and cache management
- **Framer Motion**: Animation library for UI transitions
- **React Hook Form + Zod**: Form management and schema validation
- **Vite**: Frontend build tool and dev server with HMR
- **Google Fonts**: JetBrains Mono, Orbitron, Rajdhani, Geist Mono, DM Sans, Fira Code, Architects Daughter