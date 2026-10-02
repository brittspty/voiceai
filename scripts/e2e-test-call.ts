import { prisma } from "../lib/db";
import { enqueue } from "../lib/queue";

async function main() {
  const office = await prisma.office.findFirst({ where: { type: "virtual" } });
if (!office) throw new Error("no office");
const contact = await prisma.contact.create({
  data: {
    name: "Demo lead",
    phone: "+19195550100",
    consent: "high",
    consentAt: new Date(),
    source: "Test console",
    officeId: office.id,
    timezone: "America/New_York",
  },
});
const call = await prisma.call.create({
  data: {
    contactId: contact.id,
    officeId: office.id,
    status: "queued",
    consent: "high",
    isTest: true,
    direction: "outbound",
    timeline: [{ at: new Date().toISOString(), label: "Test call queued" }],
  },
});
await enqueue({
  type: "dial",
  callId: call.id,
  contactId: contact.id,
  payload: { callId: call.id, simulatedOutcome: "callback_requested" },
});
console.log(call.id);
await prisma.$disconnect();
}
main();
