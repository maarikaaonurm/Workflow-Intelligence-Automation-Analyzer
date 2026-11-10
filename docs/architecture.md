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

## Authorization model
`Actor` carries `isOrgAdmin`, `departmentRole` and `departmentId` (no single role). `can()` is capability-based and pure; the services enforce it and additionally check the CampaignParticipant record for participant functions. Navigation is derived from `capabilitiesOf(actor)` (Organization / Management / My work). See `authorization.md`.

## Mapping and import modules (Phase 3)
- `lib/mapping/schema.ts` one Zod schema for the form, the import and the server; `form.ts` (form parsing, minutes/hours); `import.ts` (columns, localized value normalization, row validation, duplicate and plausibility warnings); `files.ts` (template building and reading, content checks, version check, formula neutralizing); `warnings.ts`, `baseline.ts` (content and baseline hashes), `present.ts` (localized category card, status, version diff).
- `services/mapping.ts` (ownership, versions, completion, import preview and confirmation, audit); `lib/demo/mapping-demo.ts` (idempotent synthetic data).
- `app/mapping/template/route.ts` serves the template in the interface language.

## Diary modules (Phase 4)
`lib/diary/schema.ts` (one Zod schema), `form.ts` (form parsing, minutes/hours, times), `rules.ts` (permissions per campaign state, date window, timer warning, parallel-work totals), `present.ts` (form values, Log Again), `services/diary.ts` (entries, timer, favorites, meetings, Quick Add, confirmation, reading). Pages under `app/diary/*`; forms `DiaryForm` and `QuickAddForm`. Authorization uses the policy actions `diary:write`, `diary:read`, `diary:confirm` for the actor's own records only.
