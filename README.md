# Workflow-Intelligence-Automation-Analyzer
A web application designed to analyze the overall workflow of a department or workgroup. It helps visualize how employees actually spend their working time, identify overlapping and unnecessary activities, and discover opportunities to simplify, standardize, and automate processes.

## Deployment (Railway)

The app deploys automatically from `main`. There is no local database or local server.

1. Add a PostgreSQL service to the Railway project; Railway provides `DATABASE_URL`.
2. Set `SESSION_SECRET` (32+ random characters) and `ENABLE_DEV_LOGIN=true` (prototype demo login) on the web service.
3. Build command: `npm run build`. Start command: `npm start` (applies migrations with `prisma migrate deploy`, optionally seeds, then starts Next.js).
4. Seed the synthetic demo data: set `SEED_ON_START=true` on the web service and redeploy. The idempotent seed runs during startup; look for "Seed complete." in the deploy logs, then remove the variable. Do not use the Railway console (no `npm` on its PATH) or `railway run` (it cannot reach the internal `DATABASE_URL` host).

Checks before every push: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. See `docs/`.

## Initial Activity Mapping template
Participants download the template in the current interface language (Estonian: `algse_tegevuskaardistuse_mall.xlsx` / `.csv`; English: `initial_activity_mapping_template.xlsx` / `.csv`), fill it in and import it from My Initial Mapping. Version 1.0; `.xlsx` and `.csv`, up to 1 MB and 200 rows. See `docs/phase-3-audit.md`.

## Synthetic demo mapping data
As an Organization Admin open Reference data and use "Load synthetic demo mapping data" (once; safe to repeat). It creates the department "Mapping Demo" with a campaign and example mappings. No environment variable is needed.
