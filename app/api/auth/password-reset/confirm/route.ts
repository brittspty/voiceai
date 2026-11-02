import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { findActiveUserByEmail } from "@/lib/active-user";
import { prisma } from "@/lib/db";
import { confirmPasswordReset } from "@/lib/password-reset";
import { passwordResetStore } from "@/lib/password-reset-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { token?: string; password?: string };
  const result = await confirmPasswordReset({
    token: body.token || "",
    password: body.password || "",
    findUser: findActiveUserByEmail,
    store: passwordResetStore,
    hashPassword: (password) => bcrypt.hash(password, 10),
    savePassword: async (email, passwordHash) => {
      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" }, disabledAt: null },
      });
      if (!user) throw new Error("This reset link is no longer valid. Ask for a new one.");
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
      await audit({ id: user.id, name: user.name }, "Reset a password", { type: "user", id: user.id, label: user.email });
    },
    revokeSessions: async (email) => {
      const user = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      if (!user) return;
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.passwordReset.updateMany({ where: { email, usedAt: null }, data: { usedAt: new Date() } });
    },
  });
  if (result.status === 404) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (result.status === 400) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
