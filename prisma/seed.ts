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
    create: { organizationId: org.id, email: "admin@demo.example", firstName: "Anna", lastName: "Admin", name: "Anna Admin", isOrgAdmin: true },
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
        create: { organizationId: org.id, email: email(name), firstName: name.split(" ")[0], lastName: name.split(" ").slice(1).join(" "), name },
      });
      const existing = await db.departmentMembership.findFirst({ where: { userId: user.id, active: true } });
      if (!existing) {
        await db.departmentMembership.create({ data: { userId: user.id, departmentId: department.id, role } });
      }
    }
  }
  // Organization privilege, department role and campaign participation are independent.
  // Anna is an Organization Admin AND the Department Manager of Administration, so she can
  // administer the organization, manage the Administration campaign and, as a default
  // participant of that campaign, complete her own mapping and diary.
  const administration = await db.department.upsert({
    where: { organizationId_name: { organizationId: org.id, name: "Administration" } },
    update: {},
    create: { organizationId: org.id, name: "Administration" },
  });
  const anna = await db.user.findUniqueOrThrow({ where: { email: "admin@demo.example" } });
  const hasManager = await db.departmentMembership.findFirst({
    where: { departmentId: administration.id, active: true, role: "MANAGER" },
  });
  if (!hasManager && !(await db.departmentMembership.findFirst({ where: { userId: anna.id, active: true } }))) {
    await db.departmentMembership.create({ data: { userId: anna.id, departmentId: administration.id, role: "MANAGER" } });
  }
  const kadri = await db.user.upsert({
    where: { email: email("Kadri Mets") },
    update: {},
    create: { organizationId: org.id, email: email("Kadri Mets"), firstName: "Kadri", lastName: "Mets", name: "Kadri Mets" },
  });
  if (!(await db.departmentMembership.findFirst({ where: { userId: kadri.id, active: true } }))) {
    await db.departmentMembership.create({ data: { userId: kadri.id, departmentId: administration.id, role: "EMPLOYEE" } });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
