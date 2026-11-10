# Testing

- Unit tests (Vitest) for pure analysis code: frequency normalization, expected/observed, decomposition, coverage, scoring, saving, double-count detection.
- Integration and authorization tests for services need a Postgres `DATABASE_URL`; they run against a Railway-reachable test database, not a local one.
- Critical acceptance tests: master prompt section 142.
- Gate before every push: `npm run build` (plus type check, lint, tests as they exist). Never report a test as passing unless it ran.

## Service tests with a fake database
`src/lib/services/participants.test.ts` runs `removeParticipant` and `restoreParticipant` against an in-memory stand-in for the Prisma transaction client. It covers authorization (Employee, other department's manager and Organization Admin are forbidden), locked and other closed states, already-active participants, inactive users, new-period creation, preserved history, audit events and a remove-then-restore sequence. It does not exercise real SQL constraints (such as the one-open-period index); those run on Railway.

`src/lib/services/mapping.test.ts` does the same for the mapping service: draft edits in place, new versions after completion with the baseline untouched, acknowledgement-first, manager and other-employee access denied, closed campaigns, unknown references and delete rules. `src/lib/mapping/mapping.test.ts` covers the input schema (sensitive-data exclusivity, volume/unit pairing), form parsing, the import parser (row errors, duplicate warnings, empty rows) and CSV/Excel reading including an Excel template round trip.

`src/lib/services/users.test.ts` uses an in-memory Prisma stand-in that also enforces the two membership unique indexes. It covers creating and editing users, authorization boundaries (manager, employee, other organization), department change with preserved history, role changes, manager replacement and the vacancy case, assigning a manager to a new department from any user, the campaign acknowledgement rule with participation left untouched, deactivation and reactivation with history, historical campaign records surviving deactivation, the Active / Inactive / All lists, and deactivated users being left out of new campaign participants.

`src/app/user-actions.test.ts` tests the server actions with mocked services: the transfer gate (no change without `confirmed=yes`, acknowledgement passed only when ticked, service refusals sent back to the confirmation page, unsafe return paths ignored), and creating a user from a department page (preset department, return to the department). `src/lib/membership/candidates.test.ts` tests candidate grouping (inactive users and administrators excluded, ordering). `users.test.ts` also covers the read-only change preview.

## Role-model tests (Correction 3)
`src/lib/auth/policy.test.ts` covers every combination (Organization Admin alone, Admin + Employee, Admin + Department Manager, Manager, Employee), manager scope, participant access limited to own records and own department, and capabilities. `users.test.ts` covers default campaign participants (manager included, admin without membership excluded, admin with membership included, no participation in another department, one membership and one manager still enforced for admins). `dual-role.test.ts` covers the About This Analysis acknowledgement for managers and admin combinations. `mapping.test.ts` covers a manager and an admin-manager mapping their own work. `participants.test.ts` shows Stop / Exclude / Restore still work for managers who participate. The Activity Diary (Phase 4) has no service yet: its policy actions are tested, its behaviour is not.

## Phase 3 completion tests
- `lib/mapping/mapping.test.ts`: schema (positive count and duration, exclusivity, recipient note), form parsing (hours to minutes), localized Estonian/English normalization to identical canonical values, validation, formula refusal, row statuses, duplicate and plausibility warnings, baseline hash, version diff, category localization and fallback.
- `lib/mapping/template-import.test.ts`: localized Excel and CSV templates (file names, sheets, headings, dropdown values, version), reading both languages, unsupported or missing version, missing column, type/size/content mismatch, formula cells, row limits, formula neutralizing, file name sanitizing.
- `lib/services/mapping.test.ts`: ownership, versions and baseline, audits without content, completion validation, preview before write, cancellation, confirmation, idempotency, repeated content, accepted warnings re-checked on the server, rollback on failure, managers and admins cannot import for others.
- `app/mapping/template/route.test.ts`: Estonian UI gets the Estonian .xlsx and .csv, English UI the English ones.
- `lib/i18n/phase3-localization.test.ts`: every Phase 3 text exists in Estonian and is not an English copy; standard category cards are complete in both languages.
- `lib/services/readiness.test.ts`: manager readiness (neutral), manager who participates, demo-data guard.
Not covered by automated tests: real SQL constraints, the browser behaviour of the stepped form and the upload form, and the first run of the demo-data loader against a real database.

## Phase 4 tests
- `lib/diary/diary.test.ts`: entry schema, form parsing, permissions per campaign state, date window and participation gaps, timer rules, parallel-work totals, reminders, Log Again.
- `lib/services/diary.test.ts` (in-memory Prisma stand-in, rollback on failure): manual / free-text / meeting entries, flags and markers, overlapping times accepted, retrospective window, end of observation, before start, own-diary-only authorization (manager, Admin + Manager, Admin with no department, other participants), Review Window corrections, locked campaign, Confirm My Diary (and its withdrawal), timer (one at a time, never auto-stops, stop then review then save, discard), favorites, Quick Add (valid rows saved, invalid rows reported), shared meetings (once per participant, never writes into another diary), reading my diary.
- `app/diary-actions.test.ts`: confirmation gates (delete, discard timer, confirm diary), stop timer saves nothing, form errors keep entries, quick add and meetings.
- `lib/services/readiness.test.ts`: manager coverage and confirmation count, no entries exposed.
- `lib/i18n/phase4-localization.test.ts`.
Not covered by automated tests: real SQL constraints, the browser behaviour of the forms (timer page, Quick Add rows), and the real clock.
