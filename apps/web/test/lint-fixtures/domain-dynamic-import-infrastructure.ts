export function loadDatabase() {
  return import("@/infrastructure/db/prisma-client");
}
