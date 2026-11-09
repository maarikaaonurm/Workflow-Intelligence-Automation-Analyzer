# Data Model (planned)

Normalized PostgreSQL via Prisma. The entity list follows the master prompt (section 134) and is refined as phases land.

## Key constraints
- One active DepartmentMembership per non-admin user (partial unique index).
- One active Department Manager per department (partial unique index).
- One active campaign per department (partial unique index on status + transactional check).
- Unique (campaign, user) participation; participant `joinedAt`, optional exclusion mode.
- Campaign start date immutable after launch; end-date changes audited.
- Initial mapping baselines are never overwritten (InitialActivityVersion).
- "No Sensitive Data" is mutually exclusive with other categories (Zod + service).
- Analysis inputs, AI runs and Final Analysis versions are immutable; reruns create new versions.
- Pseudonym map (Employee_NN to user) lives only in the database, per campaign.

Phase 1 tables: Organization, Department, User, DepartmentMembership, AuditLog.

Phase 2 tables: AnalysisCampaign, CampaignParticipant, CampaignParticipationPeriod (participation history, one open period max), CampaignParticipantExcludedDate, CampaignAcknowledgement, ReminderPreference. Campaign end-date history lives in AuditLog.

Phase 3 tables: ActivityCategory, VolumeUnit, SystemReference, InitialActivity, InitialActivityVersion (baseline flag, check constraints for duration, occurrence count, volume/unit pairing and sensitive-data exclusivity), plus `CampaignParticipant.mappingCompletedAt`.
