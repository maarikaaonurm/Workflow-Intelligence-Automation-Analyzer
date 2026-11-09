# Decision Log

## 2026-10-28 Environment conflicts with the master prompt
- The master prompt says "run locally"; project `CLAUDE.md` says no local database or local server, and the DB is reachable only through `DATABASE_URL` on Railway. Decision: follow `CLAUDE.md`. Migrations and seed run on Railway; DB-backed tests need a Railway-reachable test database. Pure logic is tested without a database.
- Node.js/npm are not installed on this machine, so `npm run build` (required before every push) cannot run yet. No application code is pushed until Node is available.

## 2026-11-09 Phase 2 campaign decisions
- **Statuses:** SCHEDULED and AWAITING_CLOSURE were dropped; EMPLOYEE_SUMMARY_PUBLISHED will be a flag later. Launching moves DRAFT to INITIAL_MAPPING, the start date moves it to ACTIVE, and the day after the end date opens REVIEW_WINDOW (all calendar-driven, applied lazily on load and audited). Start date = start of diary observation; employees do Initial Mapping between launch and start.
- **Active-campaign slot:** INITIAL_MAPPING, ACTIVE and REVIEW_WINDOW occupy it. Enforced by a partial unique index plus a transactional check.
- **Eligible observation days are weekdays (Mon-Fri)** in the participant's range (campaign start or late join date, to end or stop date), minus absent dates. Public holidays are not modelled yet.
- **Campaign dates use the Europe/Tallinn calendar day.**
- **CampaignHistory table not created:** end-date changes (old, new, actor, time) are stored in AuditLog and shown to participants from there.
- **Reopen** goes LOCKED/FINAL to REVIEW_WINDOW, Organization Admin only, reason of 5+ characters, audited.
- **Retention snapshot** is a placeholder default (12 months, delete) until Phase 9 adds organization retention settings.
- **Not yet verified against a real database:** services in `src/lib/services/campaigns.ts` are only type-checked; their rules live in tested pure functions or DB constraints.
