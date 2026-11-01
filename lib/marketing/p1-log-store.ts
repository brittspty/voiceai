import { randomBytes } from "node:crypto";
import type { DecisionLogEntry } from "./audience-p1/decide";
import {
  normalizeDelivery,
  normalizeSchedule,
  scheduleCreatedAt,
  type DeliveryLog,
  type ScheduleRow,
} from "./reports/p1/schedule";
import type { ReportAnnotation } from "./reports/types";
import { isolatedWhere } from "./workspace";

export type P1LogStore = {
  listNotes(workspaceId: string): Promise<ReportAnnotation[]>;
  insertNote(workspaceId: string, note: ReportAnnotation): Promise<void>;
  listSchedules(workspaceId: string): Promise<ScheduleRow[]>;
  insertSchedule(workspaceId: string, row: ScheduleRow): Promise<void>;
  listDeliveries(workspaceId: string): Promise<DeliveryLog[]>;
  insertDelivery(workspaceId: string, row: DeliveryLog): Promise<void>;
  listDecisions(workspaceId: string): Promise<DecisionLogEntry[]>;
  insertDecision(workspaceId: string, row: DecisionLogEntry): Promise<void>;
};

type NoteRecord = { workspaceId: string; note: ReportAnnotation };
type ScheduleRecord = { workspaceId: string; row: ScheduleRow; createdAt: number };
type DeliveryRecord = { workspaceId: string; row: DeliveryLog };
type DecisionRecord = { workspaceId: string; row: DecisionLogEntry };

export type P1LogTables = {
  notes: NoteRecord[];
  schedules: ScheduleRecord[];
  deliveries: DeliveryRecord[];
  decisions: DecisionRecord[];
};

export function createP1LogTables(): P1LogTables {
  return { notes: [], schedules: [], deliveries: [], decisions: [] };
}

function time(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date(0);
  return parsed;
}

function steps(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function decisionFrom(row: { at: string; who: string; testId: string; action: string; manualSteps: string[] }): DecisionLogEntry | null {
  if (row.action !== "scale" && row.action !== "cut") return null;
  return {
    at: row.at,
    who: row.who,
    testId: row.testId,
    action: row.action,
    campaignWrite: false,
    adAccountWrite: false,
    manualSteps: [...row.manualSteps],
    message: "logged only",
  };
}

/** Process-local stand-in for the tables. A second store on the same tables is a restart. */
export function memoryP1LogStore(tables: P1LogTables): P1LogStore {
  return {
    async listNotes(workspaceId) {
      const where = isolatedWhere(workspaceId);
      return tables.notes
        .filter((row) => row.workspaceId === where.workspaceId)
        .map((row) => ({ ...row.note }))
        .sort((a, b) => time(a.loggedAt || "") - time(b.loggedAt || ""));
    },
    async insertNote(workspaceId, note) {
      const where = isolatedWhere(workspaceId);
      tables.notes.push({ workspaceId: where.workspaceId, note: { ...note } });
    },
    async listSchedules(workspaceId) {
      const where = isolatedWhere(workspaceId);
      return tables.schedules
        .filter((row) => row.workspaceId === where.workspaceId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((row) => normalizeSchedule(row.row));
    },
    async insertSchedule(workspaceId, row) {
      const where = isolatedWhere(workspaceId);
      const normalized = normalizeSchedule(row);
      const existing = tables.schedules.find((item) => item.workspaceId === where.workspaceId && item.row.id === normalized.id);
      if (existing) return;
      tables.schedules.push({ workspaceId: where.workspaceId, row: normalized, createdAt: scheduleCreatedAt(normalized.id).getTime() });
    },
    async listDeliveries(workspaceId) {
      const where = isolatedWhere(workspaceId);
      return tables.deliveries
        .filter((row) => row.workspaceId === where.workspaceId)
        .map((row) => normalizeDelivery(row.row))
        .sort((a, b) => time(b.at) - time(a.at));
    },
    async insertDelivery(workspaceId, row) {
      const where = isolatedWhere(workspaceId);
      tables.deliveries.push({ workspaceId: where.workspaceId, row: normalizeDelivery(row) });
    },
    async listDecisions(workspaceId) {
      const where = isolatedWhere(workspaceId);
      return tables.decisions
        .filter((row) => row.workspaceId === where.workspaceId)
        .map((row) => decisionFrom(row.row))
        .filter((row): row is DecisionLogEntry => Boolean(row))
        .sort((a, b) => time(b.at) - time(a.at));
    },
    async insertDecision(workspaceId, row) {
      const where = isolatedWhere(workspaceId);
      const normalized = decisionFrom(row);
      if (!normalized) return;
      tables.decisions.push({ workspaceId: where.workspaceId, row: { ...normalized, manualSteps: [...normalized.manualSteps] } });
    },
  };
}

type NoteRow = {
  id: string;
  workspaceId: string;
  seriesId: string;
  noteDate: string;
  label: string;
  body: string;
  clientBody: string;
  authorName: string;
  loggedAt: Date;
};

type ScheduleDb = {
  workspaceId: string;
  id: string;
  name: string;
  cadence: string;
  audience: string;
  moneyInCopy: string;
  exampleData: boolean;
  createdAt: Date;
};

type DeliveryDb = {
  id: string;
  workspaceId: string;
  scheduleId: string;
  at: Date;
  audience: string;
  moneyInCopy: string;
  message: string;
  sent: boolean;
  email: boolean;
  sms: boolean;
  push: boolean;
};

type DecisionInsert = {
  id: string;
  workspaceId: string;
  at: Date;
  who: string;
  testId: string;
  action: string;
  campaignWrite: false;
  adAccountWrite: false;
  manualSteps: string[];
  message: "logged only";
};

type DecisionDb = Omit<DecisionInsert, "manualSteps" | "campaignWrite" | "adAccountWrite" | "message"> & {
  campaignWrite: boolean;
  adAccountWrite: boolean;
  manualSteps: unknown;
  message: string;
};

export type P1Prisma = {
  reportChartNote: {
    findMany(args: { where: { workspaceId: string } }): Promise<NoteRow[]>;
    create(args: { data: NoteRow }): Promise<NoteRow>;
  };
  reportSchedule: {
    findMany(args: { where: { workspaceId: string } }): Promise<ScheduleDb[]>;
    upsert(args: { where: { workspaceId_id: { workspaceId: string; id: string } }; create: ScheduleDb; update: { exampleData: true } }): Promise<ScheduleDb>;
  };
  reportScheduleDelivery: {
    findMany(args: { where: { workspaceId: string } }): Promise<DeliveryDb[]>;
    create(args: { data: DeliveryDb }): Promise<DeliveryDb>;
  };
  audienceScaleCutLog: {
    findMany(args: { where: { workspaceId: string } }): Promise<DecisionDb[]>;
    create(args: { data: DecisionInsert }): Promise<DecisionDb>;
  };
};

function rowId() {
  return randomBytes(12).toString("hex");
}

function noteFrom(row: NoteRow): ReportAnnotation {
  return {
    date: row.noteDate,
    seriesId: row.seriesId,
    label: row.label,
    body: row.body,
    clientBody: row.clientBody,
    authorName: row.authorName,
    loggedAt: row.loggedAt.toISOString(),
  };
}

function scheduleFrom(row: ScheduleDb): ScheduleRow {
  return normalizeSchedule({
    id: row.id,
    name: row.name,
    cadence: "Weekly",
    audience: row.audience === "staff" ? "staff" : "client",
    moneyInCopy: row.moneyInCopy === "NO" ? "NO" : "YES",
    exampleData: true,
  });
}

function deliveryFrom(row: DeliveryDb): DeliveryLog {
  return normalizeDelivery({
    at: row.at.toISOString(),
    scheduleId: row.scheduleId,
    audience: row.audience === "staff" ? "staff" : "client",
    moneyInCopy: row.moneyInCopy === "NO" ? "NO" : "YES",
    message: "would send",
    sent: false,
    email: false,
    sms: false,
    push: false,
  });
}

/** Maps the four new tables. Callers pass the Prisma client after generate. */
export function createPrismaP1LogStore(client: P1Prisma): P1LogStore {
  return {
    async listNotes(workspaceId) {
      const where = isolatedWhere(workspaceId);
      const rows = await client.reportChartNote.findMany({ where });
      return rows
        .map(noteFrom)
        .sort((a, b) => time(a.loggedAt || "") - time(b.loggedAt || ""));
    },
    async insertNote(workspaceId, note) {
      const where = isolatedWhere(workspaceId);
      await client.reportChartNote.create({
        data: {
          id: rowId(),
          workspaceId: where.workspaceId,
          seriesId: note.seriesId,
          noteDate: note.date,
          label: note.label,
          body: note.body,
          clientBody: note.clientBody || note.body,
          authorName: note.authorName || "",
          loggedAt: asDate(note.loggedAt || ""),
        },
      });
    },
    async listSchedules(workspaceId) {
      const where = isolatedWhere(workspaceId);
      const rows = await client.reportSchedule.findMany({ where });
      return rows
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map(scheduleFrom);
    },
    async insertSchedule(workspaceId, row) {
      const where = isolatedWhere(workspaceId);
      const normalized = normalizeSchedule(row);
      await client.reportSchedule.upsert({
        where: { workspaceId_id: { workspaceId: where.workspaceId, id: normalized.id } },
        create: {
          workspaceId: where.workspaceId,
          id: normalized.id,
          name: normalized.name,
          cadence: normalized.cadence,
          audience: normalized.audience,
          moneyInCopy: normalized.moneyInCopy,
          exampleData: true,
          createdAt: scheduleCreatedAt(normalized.id),
        },
        update: { exampleData: true },
      });
    },
    async listDeliveries(workspaceId) {
      const where = isolatedWhere(workspaceId);
      const rows = await client.reportScheduleDelivery.findMany({ where });
      return rows.map(deliveryFrom).sort((a, b) => time(b.at) - time(a.at));
    },
    async insertDelivery(workspaceId, row) {
      const where = isolatedWhere(workspaceId);
      const normalized = normalizeDelivery(row);
      await client.reportScheduleDelivery.create({
        data: {
          id: rowId(),
          workspaceId: where.workspaceId,
          scheduleId: normalized.scheduleId,
          at: asDate(normalized.at),
          audience: normalized.audience,
          moneyInCopy: normalized.moneyInCopy,
          message: "would send",
          sent: false,
          email: false,
          sms: false,
          push: false,
        },
      });
    },
    async listDecisions(workspaceId) {
      const where = isolatedWhere(workspaceId);
      const rows = await client.audienceScaleCutLog.findMany({ where });
      return rows
        .map((row) => decisionFrom({
          at: row.at.toISOString(),
          who: row.who,
          testId: row.testId,
          action: row.action,
          manualSteps: steps(row.manualSteps),
        }))
        .filter((row): row is DecisionLogEntry => Boolean(row))
        .sort((a, b) => time(b.at) - time(a.at));
    },
    async insertDecision(workspaceId, row) {
      const where = isolatedWhere(workspaceId);
      const normalized = decisionFrom(row);
      if (!normalized) return;
      await client.audienceScaleCutLog.create({
        data: {
          id: rowId(),
          workspaceId: where.workspaceId,
          at: asDate(normalized.at),
          who: normalized.who,
          testId: normalized.testId,
          action: normalized.action,
          campaignWrite: false,
          adAccountWrite: false,
          manualSteps: normalized.manualSteps,
          message: "logged only",
        },
      });
    },
  };
}
