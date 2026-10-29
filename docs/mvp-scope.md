# MVP Scope and Phases

Status legend: [ ] not started, [~] in progress, [x] done and verified.

- [~] Phase 1 Foundation (code builds and unit tests pass; migration and seed not yet run against Railway): org, departments, users, roles, server-side authorization, dev login, demo accounts
- [ ] Phase 2 Campaigns: lifecycle state machine, participants, single active campaign, About This Analysis, absent days, reminders
- [ ] Phase 3 Initial Mapping: categories + guide, units, systems, sensitivity, baseline versions, own CSV/Excel import
- [ ] Phase 4 Activity Diary: manual, timer, Favorites, Log Again, Quick Add, meetings, markers, retrospective window, review window, confirm diary
- [ ] Phase 5 Deterministic analysis: frequency normalization, expected/observed, decomposition, coverage
- [ ] Phase 6 AI layer: provider interface, MockAIProvider, pseudonymization, Zod schemas, caching, versioning, fallback
- [ ] Phase 7 Groups and Opportunities: groups, review, score, matrix, current/future state, savings
- [ ] Phase 8 Dashboard and reports: dashboard, preliminary/final analysis, summaries, PDF, CSV/Excel
- [ ] Phase 9 Privacy and hardening: retention service, audit, security review, accessibility

Do not start a phase until the previous one builds, is tested and persists coherently. V1 extensions (Entra ID, Teams/Outlook, multi-department, etc.) are out of scope until the MVP works end-to-end.
