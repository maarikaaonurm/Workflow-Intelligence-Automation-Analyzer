# Privacy and Retention

- Synthetic data only; never real Meliva, patient, customer, employee or financial data.
- Employees see only their own diary. Managers see department activity data in drill-downs; dashboards are process-level.
- About This Analysis acknowledgement is informational, stored with text version and timestamp; it is not legal consent.
- Retention policy is snapshotted per campaign. After expiry: Delete Permanently or Anonymize and Retain (pseudonymization is not called anonymization).
- Retention is a callable service plus dev command; production scheduling to be documented (Railway cron).
- Audit log stores safe metadata only, no secrets or sensitive payloads.
- Employee Summary: anonymous, manager-published, no monetary figures.
