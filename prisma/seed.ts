// Synthetic demo data only. All names, companies and emails are fictional.
import { PrismaClient, type DepartmentRole } from "@prisma/client";
import { ensureStandardReferenceData } from "../src/lib/reference/standard";

const db = new PrismaClient();

const ORG_NAME = "Northwind Demo Group";

const accounting = {
  name: "Accounting",
  manager: "Marta Kask",
  employees: [
    "Jaan Tamm", "Liis Mägi", "Peeter Saar", "Kati Rebane",
    "Toomas Lepik", "Mari Kuusk", "Andres Ilves", "Helen Pärn",
  ],
};
const otherDepartments = [
  { name: "Credit Management", manager: "Rain Oja", employees: ["Eva Sepp", "Karl Vaher"] },
  { name: "HR", manager: "Sirje Luik", employees: ["Taavi Kivi"] },
];

function email(name: string): string {
  const ascii = name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return `${ascii.replace(/\s+/g, ".")}@demo.example`;
}

async function main() {
  let org = await db.organization.findFirst({ where: { name: ORG_NAME } });
  if (!org) org = await db.organization.create({ data: { name: ORG_NAME } });

  await ensureStandardReferenceData(db, org.id);

  await db.user.upsert({
    where: { email: "admin@demo.example" },
    update: {},
    create: { organizationId: org.id, email: "admin@demo.example", name: "Anna Admin", isOrgAdmin: true },
  });

  for (const dept of [accounting, ...otherDepartments]) {
    const department = await db.department.upsert({
      where: { organizationId_name: { organizationId: org.id, name: dept.name } },
      update: {},
      create: { organizationId: org.id, name: dept.name },
    });
    const people: [string, DepartmentRole][] = [
      [dept.manager, "MANAGER"],
      ...dept.employees.map((n): [string, DepartmentRole] => [n, "EMPLOYEE"]),
    ];
    for (const [name, role] of people) {
      const user = await db.user.upsert({
        where: { email: email(name) },
        update: {},
        create: { organizationId: org.id, email: email(name), name },
      });
      const existing = await db.departmentMembership.findFirst({ where: { userId: user.id, active: true } });
      if (!existing) {
        await db.departmentMembership.create({ data: { userId: user.id, departmentId: department.id, role } });
      }
    }
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
