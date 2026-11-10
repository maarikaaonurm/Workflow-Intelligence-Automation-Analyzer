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
