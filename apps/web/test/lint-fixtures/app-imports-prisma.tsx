import { PrismaClient } from "@prisma/client";

export default function Page() {
  return <p>{String(PrismaClient)}</p>;
}
