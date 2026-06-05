import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  // Enable metrics to be gathered by the engine
  // This requires the 'metrics' preview feature or standard in newer versions
});

export default prisma;
