import { prisma } from "@/infrastructure/db/prisma-client";

export function createContainer() {
  return { prisma };
}
