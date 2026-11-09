# Testing

- Unit tests (Vitest) for pure analysis code: frequency normalization, expected/observed, decomposition, coverage, scoring, saving, double-count detection.
- Integration and authorization tests for services need a Postgres `DATABASE_URL`; they run against a Railway-reachable test database, not a local one.
- Critical acceptance tests: master prompt section 142.
- Gate before every push: `npm run build` (plus type check, lint, tests as they exist). Never report a test as passing unless it ran.

## Service tests with a fake database
`src/lib/services/participants.test.ts` runs `removeParticipant` and `restoreParticipant` against an in-memory stand-in for the Prisma transaction client. It covers authorization (Employee, other department's manager and Organization Admin are forbidden), locked and other closed states, already-active participants, inactive users, new-period creation, preserved history, audit events and a remove-then-restore sequence. It does not exercise real SQL constraints (such as the one-open-period index); those run on Railway.
