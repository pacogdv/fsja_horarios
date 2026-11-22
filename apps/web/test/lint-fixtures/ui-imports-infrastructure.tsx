import { prisma } from "@/infrastructure/db/prisma-client";

export function Widget() {
  return <p>{String(prisma)}</p>;
}
