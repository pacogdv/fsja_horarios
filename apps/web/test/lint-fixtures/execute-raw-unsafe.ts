declare const prisma: { $executeRawUnsafe(sql: string): Promise<number> };

export function remove(id: string) {
  return prisma.$executeRawUnsafe(`DELETE FROM app_user WHERE id = ${id}`);
}
