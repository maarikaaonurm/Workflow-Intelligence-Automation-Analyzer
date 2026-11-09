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

## 2026-11-10 Phase 2 correction: participant restoration
- **Participation periods.** New table `CampaignParticipationPeriod`: active over [startDate, inactiveFrom), with start kind (INITIAL, LATE_JOIN, RESTORED), who started it, and for closed periods the removal mode, who ended it and when. `CampaignParticipant.status` stays as the current state. Removal closes the open period; restoration opens a new one. Periods are never deleted, so the interruption and the original removal mode stay visible. A partial unique index allows only one open period per participant.
- **Effective date** of a removal or restoration is today (Europe/Tallinn), but never before the campaign start. The removal date is the first inactive day (matches: active 11-09 to 11-15, stopped 11-16, restored 11-20).
- **Inactive gaps** never count as expected diary days, missing logging days or coverage days. Coverage now takes a list of periods.
- **Final Analysis inclusion:** an EXCLUDED participant contributes nothing; after restoration their data inside active periods is eligible again; data dated inside an inactive gap is never eligible (`analysisPeriods`, `isActiveOn`).
- **Allowed states:** removal and restoration in INITIAL_MAPPING, ACTIVE and REVIEW_WINDOW; never once LOCKED or later (admin reopen applies). In a draft, removal still deletes the row (no data exists).
- **Who:** only the department's Department Manager (`campaign:manage`). The Organization Admin cannot manage participants; the admin's campaign role is create and reopen. Say so if you want the admin to restore participants too.
- **Confirmation:** stop, exclude, restore, cancel and lock now go through a confirmation page that shows the effective date; the server actions refuse to run without `confirmed=yes`.
- **Migration** backfills one period per existing participant (from joinedAt, closed at the removal date for stopped/excluded ones), so campaigns created before it keep their state.

## 2026-11-11 Phase 3 Initial Mapping decisions
- **Baseline versioning.** Each activity has versions. While the participant's mapping is a draft, version 1 is edited in place. Completing the mapping marks every version 1 as the baseline (`isBaseline`). After that an edit adds version N+1 and never touches the baseline. Activities added after completion start as non-baseline version 1. Draft activities can be deleted only before completion.
- **Mapping is prerequisite-gated.** Writing requires: own data, an active participation, About This Analysis acknowledged, and the campaign in INITIAL_MAPPING or ACTIVE (calendar-corrected). Managers see only the completion count ("X / Y"), not the activities.
- **Value category is not captured in Phase 3.** It is a later AI/manager-validated classification (a fixed list in code, not a table).
- **Frequency and occurrences.** `occurrenceCount` is per frequency period; for AD_HOC it is per month. Duration is 1-1440 minutes per occurrence. Phase 5 turns this into expected workload.
- **Reference data.** Categories, volume units and systems are per organization. Standard items load from `ensureStandardReferenceData` (seed, or the Organization Admin button "Load standard reference data"; idempotent). Admins can add categories (standard or department-specific), units and systems and deactivate them; deactivated items stay on existing activities. Category definition text is stored once (not per language) and feeds the guide now and AI later.
- **Systems are a managed list**, not free text, so later analysis can compare systems reliably.
- **Import.** Excel (.xlsx) and CSV through one library (`exceljs`). Template columns are fixed (no column guessing). Parsing is pure and reuses the same Zod schema as the form. The preview reports row-level errors and duplicate-name warnings; only rows without errors are imported, and the server re-validates every row on confirm (the client is not trusted). Limits: 1 MB, 200 rows.
- **Not verified on Railway yet:** the migration, the Excel upload through a server action (body size limit raised to 2 MB), and the client-side form state handling.
