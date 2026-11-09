// Runs the idempotent synthetic-data seed during startup when SEED_ON_START=true.
// Needed because the Railway service console does not have npm on its PATH.
import { spawnSync } from "node:child_process";

if (process.env.SEED_ON_START !== "true") process.exit(0);

console.log("SEED_ON_START=true: seeding synthetic demo data...");
const result = spawnSync("npx", ["tsx", "prisma/seed.ts"], { stdio: "inherit", shell: true });
if (result.status !== 0) {
  // Do not take the app down over a failed seed; the error is in the deploy logs.
  console.error("Seed failed (see output above). Starting the app anyway.");
}
