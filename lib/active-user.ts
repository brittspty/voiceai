import { prisma } from "./db";

/** Case-insensitive. A disabled account is treated as missing so the reply does not reveal it. */
export async function findActiveUserByEmail(email: string) {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, disabledAt: null },
    select: { email: true },
  });
  return user ? { email: user.email } : null;
}
