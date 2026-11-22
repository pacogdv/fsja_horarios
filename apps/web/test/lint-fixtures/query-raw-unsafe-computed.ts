declare const prisma: Record<string, (sql: string) => Promise<unknown>>;

export function find(name: string) {
  return prisma["$queryRawUnsafe"]?.(`SELECT * FROM app_user WHERE name = ${name}`);
}
