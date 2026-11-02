import { prisma } from "../db";
import { createPrismaP1LogStore } from "./p1-log-store";

export const p1LogStore = createPrismaP1LogStore(prisma);
