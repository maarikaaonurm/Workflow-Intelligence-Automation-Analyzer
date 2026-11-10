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
Organization Admin (an organization-wide privilege), Department Manager (at most one active per department) and Employee (the two department roles). Every user has at most one active department membership, administrators included. All authorization is enforced server-side.

## Core journey
Department -> Campaign -> Initial Mapping -> Activity Diary -> Workload Analysis -> AI-assisted analysis -> Manager Review -> Dashboard -> Opportunities -> Final Analysis -> Report.

The full requirement list is the original master prompt; `mvp-scope.md` tracks what is built.

## Organization privilege, department role and campaign participation
These are three independent concepts (details in `authorization.md`):
- **Organization privilege** (Organization Admin) is organization-wide and independent of any department.
- **Department role** (Department Manager or Employee) applies in the user's one active department.
- **Campaign participation** is a separate relationship. A Department Manager is a default participant of their own department's campaign (managers do operational work too), and an Organization Admin who also belongs to a department can take part like any member. Privilege alone never makes anyone a participant.

One account can hold all three: for example Organization Admin + Accounting Department Manager + participant of the Accounting campaign. No second account or role switch is needed.

## Initial Activity Mapping (Phase 3)
A campaign participant (Employee, Department Manager, or an Organization Admin with a department who is a participant) describes their own recurring work as a baseline. Statuses: Not Started, Draft, Completed. The form is four short sections; there are two equal ways in: direct entry, or the standard template (Download -> complete -> import -> preview -> validate -> confirm). The Department Manager sees neutral readiness (status and completion date) only. Details: `phase-3-audit.md`.
