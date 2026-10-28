# Product Requirements

**Workflow Intelligence & Automation Analyzer** analyzes activities, workflows and process patterns in a department. It never evaluates employees.

## Goals
- Show what work is actually performed and how much time it takes.
- Compare expected workload (Initial Activity Mapping) with observed workload (Activity Diary).
- Find duplication, repetitive manual work, waiting, rework, fragmentation, excessive control, standardization and automation opportunities.
- Estimate manager-validated time savings.

## Non-negotiable principles
1. Analyze workflows, not people: no rankings, scores, leaderboards, benchmarking or inference of motivation/competence/emotion. Names appear only in authorized drill-downs.
2. Human in the loop: AI suggests; the Department Manager confirms, modifies, rejects or marks "Needs Further Review". AI output never silently becomes fact.
3. AI optional: all deterministic features work when the AI provider is down ("AI analysis is temporarily unavailable. Deterministic analysis is still available.").
4. AI data minimization: only pseudonyms (Employee_01...) are sent; no names or emails.
5. Explainability: findings carry evidence, reasoning, confidence (High/Medium/Low), assumptions, missing info, origin and review status. Otherwise: Insufficient Data / Needs Further Review / Unexplained Difference.
6. LEAN-inspired, not an official LEAN assessment.
7. Synthetic data only. English default UI plus Estonian via the same i18n structure.

## Roles
Organization Admin (org-wide), Department Manager (exactly one active per department), Employee. Non-admin users belong to exactly one department. All authorization is enforced server-side.

## Core journey
Department -> Campaign -> Initial Mapping -> Activity Diary -> Workload Analysis -> AI-assisted analysis -> Manager Review -> Dashboard -> Opportunities -> Final Analysis -> Report.

The full requirement list is the original master prompt; `mvp-scope.md` tracks what is built.
