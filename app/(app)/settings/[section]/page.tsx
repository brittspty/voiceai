import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/shell";
import { TestConsole } from "@/components/test-console";
import { TotpSetup } from "@/components/totp-setup";
import { requireUser, isOwner, canWrite } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { maskPhone } from "@/lib/phone";
import { type SP } from "@/lib/params";
import { callingQueue, getSettingsBundle, listActivity, listFailedJobs } from "@/lib/queries";
import { VOICE_CATALOG, type CallingPolicy } from "@/lib/types";
import {
  addOffice,
  addUser,
  discardJob,
  publishAgent,
  publishRules,
  publishVoice,
  refreshIntegrations,
  retryAllJobs,
  retryJob,
  saveAgentDraft,
  saveMapping,
  setOfficeStatus,
  updateSwitches,
} from "@/lib/actions";

const TITLES: Record<string, [string, string]> = {
  calling: ["Call settings", "Who the agent will call, and the reason each lead is eligible or held back."],
  agent: ["Agent", "Instructions and the opening line. Only an owner can edit them, and publishing makes a new version."],
  voice: ["Voice", "Choose the voice the agent uses. Making one live publishes a version."],
  "calling-rules": ["Calling rules", "When the agent may dial, how many times, and which safety checks are on. Publishing replaces the live rules."],
  offices: ["Offices", "Timezone, calendar, and advisor routing for each office."],
  users: ["Users", "Who can sign in, and whether two-step sign-in is on."],
  capabilities: ["Capabilities", "Safety switches and the fields written back to GoHighLevel."],
  integrations: ["Integrations", "Connections to your CRM, voice provider, and phone carrier. Refreshes itself every 30 seconds, or check them all now."],
  activity: ["Activity log", "Every sign-in and every change, newest first."],
  "failed-jobs": ["Failed jobs", "Incoming events and CRM updates that failed after retries."],
  "test-console": ["Test console", "Place a test call through the real gate, dial, transcript, and CRM path. It counts against the daily cap."],
  production: ["Production ready", "What has to be true before the agent dials real leads. Test mode stays on until you turn it off."],
};

export default async function SettingsSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<SP> }) {
  const { section } = await params;
  const title = TITLES[section];
  if (!title) notFound();
  const user = await requireUser();
  const bundle = await getSettingsBundle();
  return (
    <div>
      <PageTitle
        title={title[0]}
        subtitle={title[1]}
        action={section === "integrations" ? (
          <form action={async () => { "use server"; await refreshIntegrations(); }}>
            <button className="rounded-full border border-line bg-card px-3 py-1.5 text-sm">↻ Run check now</button>
          </form>
        ) : section === "failed-jobs" ? (
          <form action={async () => { "use server"; await retryAllJobs(); }}>
            <button className="rounded-full border border-line bg-card px-3 py-1.5 text-sm">↻ Run check now</button>
          </form>
        ) : null}
      />
      {section === "calling" && <Calling userCan={canWrite(user.role)} offices={bundle.offices} />}
      {section === "agent" && <Agent owner={isOwner(user.role)} bundle={bundle} />}
      {section === "voice" && <Voice owner={isOwner(user.role)} live={bundle.voiceVersions.find((v) => v.status === "published")} opening={bundle.draftAgent?.openingLine || ""} />}
      {section === "calling-rules" && <Rules owner={isOwner(user.role)} policy={bundle.policy.policy} version={bundle.policy.version?.version} />}
      {section === "offices" && <Offices canWrite={canWrite(user.role)} offices={bundle.offices} />}
      {section === "users" && <Users owner={isOwner(user.role)} user={user} users={bundle.users} />}
      {section === "capabilities" && <Capabilities owner={isOwner(user.role)} bundle={bundle} />}
      {section === "integrations" && <Integrations checks={bundle.checks} />}
      {section === "activity" && <Activity searchParams={await searchParams} />}
      {section === "failed-jobs" && <Failed />}
      {section === "test-console" && (
        <TestConsole
          offices={bundle.offices.map((o) => ({ id: o.id, name: o.name }))}
          contacts={(await prisma.contact.findMany({ orderBy: { name: "asc" }, take: 30 })).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        />
      )}
      {section === "production" && <Production owner={isOwner(user.role)} bundle={bundle} />}
    </div>
  );
}
