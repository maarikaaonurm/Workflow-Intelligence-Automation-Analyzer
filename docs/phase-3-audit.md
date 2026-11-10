# Phase 3 Audit: Initial Activity Mapping

Audit of the Phase 3 work that was already in the repository and on Railway, taken **before** the targeted changes, and what was done about each finding. Nothing was rebuilt from scratch; working code, migrations and data were kept.

Legend: COMPLETE, PARTIAL, MISSING, INCORRECT, NOT APPLICABLE (with justification).

## Summary

| State before | Rows | Matrix rows |
|---|---|---|
| COMPLETE | 6 | 4 (ownership), 5, 13, 14, 15, 16 |
| PARTIAL | 20 | 6, 7, 9, 11, 12, 17, 18, 19, 21, 22, 23, 24, 25, 27, 31, 32, 33, 36, 37, 38 |
| MISSING | 6 | 8, 20, 28, 29, 30, 34 |
| INCORRECT | 2 | 10 (mixed-language category cards), 26 (silent partial import) |
| NOT APPLICABLE | 2 | manager view of other participants' mapping content (row 4); translated system names (row 14) |

## Matrix

| # | Requirement | Before | Evidence / gap | Action and result |
|---|---|---|---|---|
| 4 | Ownership: a participant's own mapping only; manager, admin and non-participants cannot touch it | COMPLETE | `can(... "mapping:write")` + `loadOwnContext` in `services/mapping.ts`; tests in `services/mapping.test.ts`, `auth/policy.test.ts` | Kept. Extra tests: manager and admin cannot import, manager who participates imports into their own mapping only |
| 4 | Manager sees authorized mapping content for analysis | NOT APPLICABLE | The requirement says "may". Content-level access belongs to the Phase 5 analysis and the manager review; Phase 3 gives the manager readiness only (least privilege) | Documented; readiness view added (see 33) |
| 5 | About This Analysis acknowledged before mapping | COMPLETE | `acknowledgeAbout`, `errAcknowledgeFirst`; `dual-role.test.ts`, `mapping.test.ts` | Kept unchanged; not described as legal consent |
| 6 | Status Not Started / Draft / Completed, localized; neutral manager readiness | PARTIAL | Only Draft/Completed existed; manager saw "X / Y" | `mappingStatus()` with canonical `NOT_STARTED`, `DRAFT`, `COMPLETED`, localized labels; readiness table with status and completion date |
| 7 | Fields | PARTIAL | All listed fields existed except the optional clarification for recipient "Other"; no automation question, no substeps, no colleague names, no confidentiality flag (all correct) | Added `outputRecipientNote` (only valid for Other) in schema, form, import, versions |
| 8 | Progressive form; save draft, leave and return, edit, delete draft, review | MISSING (form was one long page) | `ActivityForm` rendered every field at once | Four sections: Activity basics, Workload estimate, How the activity is performed, Data and improvement context. Server validates; the form jumps to the first section with a problem. Each save is a draft; leaving with unsaved entries warns |
| 9 | Category selector uses canonical records; shows localized name, definition, belongs/does not belong, boundary examples; guide without losing data; inactive not selectable but visible in history | PARTIAL | Selector showed names only. Guide link already opened in a new tab (COMPLETE). Inactive handling COMPLETE | Selector shows the localized card for the chosen category; same `localizeCategory()` feeds guide, form and template, so no duplicated definitions |
| 10 | Category localization, whole card in one language, one canonical identity, fallback for admin categories | INCORRECT | Names were bilingual; definition and examples were English only, so Estonian cards were mixed | Added `definitionEt`, `belongsHereEt`, `notBelongsHereEt`, `boundaryExamplesEt` to the same record. Standard categories got Estonian content (idempotent upgrade, edited ones untouched). Admin form takes both languages. Fallback rule: a missing Estonian text shows the English text, per field |
| 11 | Frequency, occurrences, duration (minutes/hours), validation and high-value warnings; seasonality | PARTIAL | Canonical values and validation COMPLETE; duration entered in minutes only; no warnings for unusual values | Number plus minutes/hours, stored in minutes; non-blocking warnings (duration over 8 h, implausible occurrence counts) in preview and completion review |
| 12 | Output recipient with clarification for Other | PARTIAL | Enum existed | Clarification added; Unknown/Employee Themselves are never treated as evidence of waste |
| 13 | Volume, unit registry (bilingual), no per-unit metrics without both | COMPLETE | `VolumeUnit`, schema rule, DB CHECK | Kept |
| 14 | Systems, execution type, rule-based, judgement, exceptions, manual copying, information dependency | COMPLETE | `SystemReference`, enums, booleans | Kept. System names are product names, so they are not translated (NOT APPLICABLE) |
| 15 | Waiting, rework, sensitivity; No Sensitive Data exclusive in form, import and server | COMPLETE | Zod rule, form behaviour, DB CHECK | Kept; import test added for the combination |
| 16 | Improvement Opportunity flag and Employee Suggestion stored separately | COMPLETE | Own columns on the version | Kept |
| 17 | Review view for 20-40 activities; completion validates and confirms; stores participant, campaign, completedAt, baseline version, input-data version | PARTIAL | Plain list without systems; completion confirmation had no validation summary; no input-data version | Review table (name, category, frequency x count, duration, systems, status, source). Completion review validates every activity, blocks on errors, shows warnings. Stores `mappingBaselineHash` and `mappingBaselineActivityCount` |
| 18 | Immutable baseline; refinements distinguishable | PARTIAL | `InitialActivityVersion.isBaseline`, new version after completion (COMPLETE, tested). The UI did not show baseline vs current | Version history on the edit page: baseline, each refinement and which fields changed (names only) |
| 19 | Two alternatives shown: direct entry and template | PARTIAL | Buttons existed | Option A and Option B cards, with the template steps |
| 20 | Template follows interface language, localized file names and content | MISSING | English template, fixed file names | `algse_tegevuskaardistuse_mall.xlsx/.csv` for Estonian, `initial_activity_mapping_template.xlsx/.csv` for English; sheets, headings, instructions, help, dropdown values, categories, units all localized |
| 21 | Template structure, marks, examples, dropdowns, machine-readable version, version validation | PARTIAL | Two sheets, English, dropdowns, no version | Instructions / Activities / Reference Data plus a hidden `_meta` sheet (version 1.0, language); mandatory columns marked `*`; synthetic examples on the instructions sheet; the importer rejects missing or unsupported versions and offers the current template |
| 22 | Import completed template action, own mapping only, .xlsx and .csv | PARTIAL | Existed, English label | Estonian "Laadi täidetud mall üles" / English "Import completed template" |
| 23 | Staged flow, nothing written before confirmation | PARTIAL | Preview was in client state and wrote nothing (COMPLETE); there was no separate confirmation step | upload, preview, confirm (own step), then write. Test proves preview and cancel write nothing |
| 24 | Preview per row with Ready/Warning/Error and summary | PARTIAL | Errors and warnings listed; no category/frequency/volume/systems columns | Full preview table and summary counts |
| 25 | Validation incl. version, columns, controlled values, localized messages | PARTIAL | Most rules existed; values English only; no formula or plausibility checks | Localized values (Estonian or English labels, or codes) normalize to canonical values; row messages localized; formula-looking text refused |
| 26 | Import policy | INCORRECT | Rows with errors were skipped with only a small note; warnings needed no acceptance | Errors exclude the row; warnings need an explicit acceptance (re-checked on the server); all accepted rows are written in one transaction; the result states exactly what was and was not saved |
| 27 | Duplicate detection, no silent merge | PARTIAL | Same name only | Same normalized name (existing or in file) and same category plus description; warning only |
| 28 | Confirmation summary and result; source, template version/language, timestamp | MISSING | Redirect straight to the list | Confirmation step (counts, accepted warnings, excluded rows, duplicate warnings, effect on the existing mapping, Cancel / Back to Preview / Confirm) and a result page. Activities record `source = IMPORT` and the batch |
| 29 | Idempotency | MISSING | Double click or retry created duplicates | Idempotency key per preview (unique per participant) and a content hash: the same confirmation twice, or the same content again, imports once |
| 30 | Batch metadata | MISSING | None | `InitialMappingImportBatch`: counts, template version and language, sanitized file name, time |
| 31 | File security | PARTIAL | Size limit and extension | Content must match the extension (zip vs text, no NUL bytes, strict UTF-8), row bound, formulas never evaluated and refused, formula-neutralized text written into the template, sanitized file name, no macros (.xlsm rejected) |
| 32 | Estonian and English for all Phase 3 | PARTIAL | Template, category content and import wording were English | Completed; catalog tests |
| 33 | Manager readiness | PARTIAL | Count only | Table of participant, neutral status and completion date, no score or ordering by progress; a manager who participates also has their own mapping |
| 34 | Participant home | MISSING | None | Status card with Start / Continue / View for Employee, Department Manager and Admin + department participants |
| 35 | Migrations and data safety | n/a | | One additive migration (`20261115000000_phase3_completion`); no drops; existing data untouched |
| 36 | Audit | PARTIAL | Completion only | Mapping started, activity created/updated/deleted (field names only), import confirmed/failed (counts), mapping completed (with baseline hash) |
| 37 | Synthetic data | PARTIAL | No mapping data | "Load synthetic demo mapping data" (admin, idempotent): completed, draft and not-started participants, a manager who is also Organization Admin with their own mapping, direct and imported activities |
| 38 | Tests | PARTIAL | 87 service/pure tests for Phase 3 areas | 227 tests in total (see `testing.md`) |

## Preserved (not changed)

Railway deployment and PostgreSQL data; development login; Organization Admin privilege, department roles and membership history; Admin + Manager and Admin + Employee combinations; campaign lifecycle; participant Stop / Exclude / Restore and participation periods; About This Analysis; user and department management and transfer confirmation; i18n architecture; existing Activity Category records (only extended); existing audit history.

## Known limitations

- The transaction fake used in the tests does not run real SQL; unique indexes and CHECK constraints (including the idempotency key and the count check) are only exercised on Railway.
- Temporary upload handling is memory-only (see `privacy-and-retention.md`); there is no virus scanning.
- Duplicate detection is deterministic text matching, not semantic; AI-assisted detection is deliberately not used.
- The system list is not translated.
- The Estonian text of the instructions and standard category content has not had a native-speaker language review.
