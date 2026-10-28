# Architecture

## Stack
Next.js (App Router) + TypeScript + React + Tailwind CSS, PostgreSQL + Prisma, Zod, React Hook Form, Recharts, Vitest.

## Layering (no layer skipping)
UI -> route handlers / server actions (Zod validation) -> authorization -> services -> deterministic engine / AI service -> persistence (Prisma) -> audit.

- `src/lib/auth`: session + policy functions (`can(user, action, resource)`); called by every server entry point.
- `src/lib/services`: business rules and transactions (campaign launch/close/reopen, participant removal, group confirmation, final snapshot, retention).
- `src/lib/analysis`: pure, DB-free deterministic functions (expected/observed workload, decomposition, coverage, scoring, saving). Unit tested.
- `src/lib/ai`: provider-independent `AIProvider` interface, `MockAIProvider`, pseudonymizer, versioned Zod output schemas. UI never imports provider SDKs.
- `src/lib/audit`: audit writer, safe metadata only.
- `src/lib/i18n`: en + et message catalogs.
- `src/lib/notifications`: `NotificationService` interface (in-app only in MVP).

## Auth
MVP: dev/test login with demo accounts behind an env flag. Session abstraction is isolated so invitations, passwords and Microsoft Entra ID can be added later.

## Hosting
Railway, deployed from `main`. PostgreSQL via `DATABASE_URL` on Railway only. Migrations run with `prisma migrate deploy` in the Railway deploy step. See `decision-log.md` for the consequences of having no local database.
