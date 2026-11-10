# Testing

- Unit tests (Vitest) for pure analysis code: frequency normalization, expected/observed, decomposition, coverage, scoring, saving, double-count detection.
- Integration and authorization tests for services need a Postgres `DATABASE_URL`; they run against a Railway-reachable test database, not a local one.
- Critical acceptance tests: master prompt section 142.
- Gate before every push: `npm run build` (plus type check, lint, tests as they exist). Never report a test as passing unless it ran.

## Service tests with a fake database
`src/lib/services/participants.test.ts` runs `removeParticipant` and `restoreParticipant` against an in-memory stand-in for the Prisma transaction client. It covers authorization (Employee, other department's manager and Organization Admin are forbidden), locked and other closed states, already-active participants, inactive users, new-period creation, preserved history, audit events and a remove-then-restore sequence. It does not exercise real SQL constraints (such as the one-open-period index); those run on Railway.

`src/lib/services/mapping.test.ts` does the same for the mapping service: draft edits in place, new versions after completion with the baseline untouched, acknowledgement-first, manager and other-employee access denied, closed campaigns, unknown references and delete rules. `src/lib/mapping/mapping.test.ts` covers the input schema (sensitive-data exclusivity, volume/unit pairing), form parsing, the import parser (row errors, duplicate warnings, empty rows) and CSV/Excel reading including an Excel template round trip.

`src/lib/services/users.test.ts` uses an in-memory Prisma stand-in that also enforces the two membership unique indexes. It covers creating and editing users, authorization boundaries (manager, employee, other organization), department change with preserved history, role changes, manager replacement and the vacancy case, assigning a manager to a new department from any user, the campaign acknowledgement rule with participation left untouched, deactivation and reactivation with history, historical campaign records surviving deactivation, the Active / Inactive / All lists, and deactivated users being left out of new campaign participants.
