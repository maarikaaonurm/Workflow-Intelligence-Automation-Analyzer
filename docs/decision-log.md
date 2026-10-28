# Decision Log

## 2026-10-28 Environment conflicts with the master prompt
- The master prompt says "run locally"; project `CLAUDE.md` says no local database or local server, and the DB is reachable only through `DATABASE_URL` on Railway. Decision: follow `CLAUDE.md`. Migrations and seed run on Railway; DB-backed tests need a Railway-reachable test database. Pure logic is tested without a database.
- Node.js/npm are not installed on this machine, so `npm run build` (required before every push) cannot run yet. No application code is pushed until Node is available.
