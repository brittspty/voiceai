import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { readToken, SESSION_COOKIE } from "./session-token";
import type { Role } from "@prisma/client";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  totpEnabled: boolean;
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  const payload = await readToken(token);
  if (!payload || payload.kind !== "session") return null;
  const session = await prisma.session.findUnique({
    where: { id: payload.sid },
    include: { user: true },
  });
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
    totpEnabled: session.user.totpEnabled,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function canWrite(role: Role) {
  return role === "owner" || role === "admin";
}

export function isOwner(role: Role) {
  return role === "owner";
}
