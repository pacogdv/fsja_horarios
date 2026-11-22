import { prisma } from "@/infrastructure/db/prisma-client";

export default function Page() {
  return <p>{String(prisma)}</p>;
}
