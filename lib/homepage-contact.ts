import { prisma } from "./db";
import { publicHomepageEnabled, type Env } from "./public-routing";

export type ContactInput = {
  name?: string;
  email?: string;
  company?: string;
  message?: string;
};

export type ContactDraft = {
  name: string;
  email: string;
  company: string;
  message: string;
};

export type ContactStore = {
  create(data: ContactDraft): Promise<{ id: string }>;
};

export type ContactResult =
  | { status: 404 }
  | { status: 400; error: string }
  | { status: 200; id: string }
  | { status: 303; location: "/?contact=saved" | "/?contact=invalid" };

const defaultStore: ContactStore = {
  create(data) {
    return prisma.homepageContact.create({ data, select: { id: true } });
  },
};

export function contactDraft(input: ContactInput): { ok: true; value: ContactDraft } | { ok: false; error: string } {
  const name = (input.name || "").trim();
  const email = (input.email || "").trim().toLowerCase();
  const company = (input.company || "").trim();
  const message = (input.message || "").trim();
  if (!name || !email.includes("@") || email.startsWith("@") || email.endsWith("@") || email.includes(" ") || !message) {
    return { ok: false, error: "Enter your name, email, and a message." };
  }
  if (name.length > 120 || email.length > 200 || company.length > 160 || message.length > 4000) {
    return { ok: false, error: "That entry is too long." };
  }
  return { ok: true, value: { name, email, company, message } };
}

/** Writes one row. Does not send mail or call another service. */
export async function saveHomepageContact(input: ContactInput, store: ContactStore = defaultStore) {
  const draft = contactDraft(input);
  if (!draft.ok) return draft;
  const saved = await store.create(draft.value);
  return { ok: true as const, id: saved.id };
}

export function contactOriginAllowed(request: { headers: { get(name: string): string | null } }) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0]?.trim();
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function acceptHomepageContact(input: {
  fields: ContactInput;
  form?: boolean;
  env?: Env;
  store?: ContactStore;
  originAllowed?: boolean;
}): Promise<ContactResult> {
  const env = input.env ?? process.env;
  if (!publicHomepageEnabled(env)) return { status: 404 };
  if (input.originAllowed === false) return { status: 400, error: "That request was refused." };
  const saved = await saveHomepageContact(input.fields, input.store);
  if (!saved.ok) {
    if (input.form) return { status: 303, location: "/?contact=invalid" };
    return { status: 400, error: saved.error };
  }
  if (input.form) return { status: 303, location: "/?contact=saved" };
  return { status: 200, id: saved.id };
}
