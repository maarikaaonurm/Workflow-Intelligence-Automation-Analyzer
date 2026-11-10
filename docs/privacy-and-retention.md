# Privacy and Retention

- Synthetic data only; never real Meliva, patient, customer, employee or financial data.
- Employees see only their own diary. Managers see department activity data in drill-downs; dashboards are process-level.
- About This Analysis acknowledgement is informational, stored with text version and timestamp; it is not legal consent.
- Retention policy is snapshotted per campaign. After expiry: Delete Permanently or Anonymize and Retain (pseudonymization is not called anonymization).
- Retention is a callable service plus dev command; production scheduling to be documented (Railway cron).
- Audit log stores safe metadata only, no secrets or sensitive payloads.
- Employee Summary: anonymous, manager-published, no monetary figures.

## Template uploads (Phase 3)
- The uploaded file is read from the request into memory, parsed, and discarded in the same request. It is not written to disk, to the database or to logs; there is no temporary file to clean up.
- The preview lives only in the participant's browser; nothing is saved until they confirm. Cancelling or leaving saves nothing.
- Stored about an import: counts, template version and language, a sanitized file name and a content hash. The audit log holds the same counts, never spreadsheet content or activity text.
- Activity descriptions can mention sensitive topics; participants classify sensitivity per activity, and the template instructions ask for no personal data of customers or colleagues.

## Activity Diary (Phase 4)
- A diary entry is readable and writable only by its owner. Someone else's entry looks like a missing page, so its existence is not revealed.
- The Department Manager sees: how many participants confirmed their diary, and per participant "recorded on X of Y eligible days". Never entries, notes, durations or titles. Coverage ignores absent days and inactive participation gaps and is not a score.
- Notes are optional and never required. Diary entries are not copied into the audit log; only confirmations are audited.
- Entries are the data the retention policy snapshot (12 months by default) applies to; the retention job itself is Phase 9.
