import { ACCESS_REQUEST_WINDOW_MS, recordPageAccessRequest } from "./access-request";
import { prisma } from "./db";
import { userAdminEnabled } from "./marketing/config";

const STAFF_ADMIN_ROLES = ["super_admin", "admin"] as const;

export async function pageAccessAlreadySent(userId: string, pageKey: string, now = new Date()) {
  const since = new Date(now.getTime() - ACCESS_REQUEST_WINDOW_MS);
  const existing = await prisma.pageAccessRequest.findFirst({
    where: { userId, pageKey, createdAt: { gte: since } },
    select: { id: true },
  });
  return Boolean(existing);
}

/** Stores the request and writes an in-app note for staff admins. Does not email or push. */
export async function savePageAccessRequest(input: { userId: string; userName: string; pageKey: string; pageLabel: string }) {
  const now = new Date();
  const since = new Date(now.getTime() - ACCESS_REQUEST_WINDOW_MS);
  const [existing, admins] = await Promise.all([
    prisma.pageAccessRequest.findFirst({
      where: { userId: input.userId, pageKey: input.pageKey, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.user.findMany({
      where: { role: { in: [...STAFF_ADMIN_ROLES] }, disabledAt: null },
      select: { id: true },
    }),
  ]);
  return recordPageAccessRequest({
    now,
    existingAt: existing?.createdAt ?? null,
    adminIds: admins.map((row) => row.id),
    create: async () => {
      await prisma.pageAccessRequest.create({
        data: { userId: input.userId, pageKey: input.pageKey, pageLabel: input.pageLabel },
      });
    },
    notify: async (adminIds) => {
      await prisma.staffNotification.createMany({
        data: adminIds.map((userId) => ({
          userId,
          kind: "page_access_request",
          title: "Access request",
          body: `${input.userName} asked for access to ${input.pageLabel}.`,
          href: userAdminEnabled() ? "/settings/people" : "/notifications",
          payload: { pageKey: input.pageKey, pageLabel: input.pageLabel, requesterId: input.userId },
        })),
      });
    },
  });
}
