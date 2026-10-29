# Workflow-Intelligence-Automation-Analyzer
A web application designed to analyze the overall workflow of a department or workgroup. It helps visualize how employees actually spend their working time, identify overlapping and unnecessary activities, and discover opportunities to simplify, standardize, and automate processes.

## Deployment (Railway)

The app deploys automatically from `main`. There is no local database or local server.

1. Add a PostgreSQL service to the Railway project; Railway provides `DATABASE_URL`.
2. Set `SESSION_SECRET` (32+ random characters) and `ENABLE_DEV_LOGIN=true` (prototype demo login) on the web service.
3. Build command: `npm run build`. Start command: `npm start` (applies migrations with `prisma migrate deploy`, then starts Next.js).
4. Seed the synthetic demo data once: `railway run npm run db:seed`.

Checks before every push: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`. See `docs/`.
