import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
async function main() {
  const divisi = await prisma.divisi.findMany();
  console.log(JSON.stringify(divisi, null, 2));
}
main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
