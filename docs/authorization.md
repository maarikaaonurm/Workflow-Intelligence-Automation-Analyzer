# Authorization

Three independent concepts. None implies another.

```
Organization Privilege   !=   Department Role   !=   Campaign Participation
```

| Concept | Stored as | Meaning |
|---|---|---|
| Organization privilege | `User.isOrgAdmin` | Organization-wide administration: users, departments, reference data, reopening locked campaigns, creating campaigns for any department. Grants **no** department membership, **no** department management and **no** campaign participation. |
| Department role | `DepartmentMembership.role` (MANAGER or EMPLOYEE) on the user's single active membership | The user's role in their one department. A Department Manager manages that department's campaigns; the role is scoped to that department. |
| Campaign participation | `CampaignParticipant` (+ participation periods) | Whether a person takes part in one campaign (acknowledgement, mapping, diary). Independent of role and privilege. |

## Valid combinations

| Organization Admin | Department membership | Result |
|---|---|---|
| yes | none | Organization functions only. Not a participant of anything. |
| yes | Employee | Organization functions + own participant functions in that department. |
| yes | Department Manager | Organization functions + manage that department's campaign + own participant functions. |
| no | Employee | Own participant functions. |
| no | Department Manager | Manage that department's campaign + own participant functions. |

A user has at most one active department membership (history is kept). One user account is enough: nobody needs a second account or a role switch to take part in a campaign they also manage.

## The actor

`Actor = { id, organizationId, isOrgAdmin, departmentRole | null, departmentId | null }`, built on every request from the database (`getCurrentUser`). There is no single "role" field.

`can(actor, action, resource)` in `src/lib/auth/policy.ts` is the only decision point and is enforced in the services, never only in the UI.

| Action | Allowed when |
|---|---|
| `department:create`, `department:assignManager`, `user:manage`, `reference:manage`, `campaign:reopen`, `audit:view` | `isOrgAdmin` |
| `department:view`, `campaign:view` | `isOrgAdmin`, or a member of that department |
| `campaign:create` | `isOrgAdmin`, or the Department Manager of that department |
| `campaign:manage`, `analysis:view`, `opportunity:validate` | the Department Manager **of that department** (the admin privilege alone is not enough) |
| `campaign:acknowledge` | a member of that department in any role (the service also requires the user's own active CampaignParticipant record) |
| `mapping:write`, `diary:write`, `diary:confirm`, `diary:read` | a department member, for records they own, in their own department (`ownerId == actor.id`) |

Cross-organization access is always denied.

## Default campaign participants

When a campaign is created, the default participants are all eligible active department members, **including the Department Manager**: active memberships of the department whose user is active. An Organization Admin is included only through their own membership of that department. Privilege alone never creates a participant, and a membership in one department never creates participation in another department's campaign. The manager may remove anyone (including themselves) before launch; after launch the Stop / Exclude / Restore lifecycle applies to every participant alike.

## Navigation

Navigation shows every area the user may use (`capabilitiesOf`), grouped: **Organization** (Users, Departments, Reference data), **Management** (Campaigns), **My work** (My Initial Mapping, My campaign status). Navigation is convenience only; every action is authorized again on the server.

## Self-review safeguard

A manager who participates edits and confirms their own participant data like anyone else. Management and analysis views stay process-focused: no self-performance score, no ranking and no manager productivity measure is created. A manager validating a finding that involves their own activity goes through the normal review audit trail; nothing extra is inferred about them.

## Not implemented yet

`diary:write` and `diary:confirm` are defined and tested in the policy, but the Activity Diary itself is Phase 4. Granting or revoking the Organization Admin privilege has no UI: the privilege is set in the seed data.
