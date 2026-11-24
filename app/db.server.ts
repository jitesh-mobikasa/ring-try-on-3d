import { PrismaClient } from "@prisma/client";

// Re-use one client across hot reloads in development (otherwise each reload opens new DB connections)
const prisma = globalThis.prismaGlobal ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalThis.prismaGlobal = prisma;

export default prisma;
