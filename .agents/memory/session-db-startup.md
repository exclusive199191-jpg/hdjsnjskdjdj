---
name: Session and schema startup ordering
description: PostgreSQL-backed deployments need schema migration to finish before session-store initialization.
---

Run the app's schema initialization before constructing a PostgreSQL session store. Both the app schema and the session table are created by startup migration, so letting `connect-pg-simple` race with that migration can produce false "relation already exists" errors and temporary fallback identities.

**Why:** Concurrent `CREATE TABLE IF NOT EXISTS` paths were observed during a Railway-style restart, causing session initialization errors even though the database was healthy.

**How to apply:** Keep session-table ownership in the shared migration and disable the session adapter's own table creation when the migration runs first.