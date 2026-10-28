# Testing

- Unit tests (Vitest) for pure analysis code: frequency normalization, expected/observed, decomposition, coverage, scoring, saving, double-count detection.
- Integration and authorization tests for services need a Postgres `DATABASE_URL`; they run against a Railway-reachable test database, not a local one.
- Critical acceptance tests: master prompt section 142.
- Gate before every push: `npm run build` (plus type check, lint, tests as they exist). Never report a test as passing unless it ran.
