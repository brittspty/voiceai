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
            <button className="rounded-full border border-line bg-card px-3 py-1.5 text-sm">Retry all waiting now</button>
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

async function Calling({ offices, userCan }: { offices: { id: string; name: string; status: string }[]; userCan: boolean }) {
  const rows = await callingQueue();
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-card p-4 text-sm">
        {offices.map((office) => (
          <form key={office.id} className="flex items-center justify-between py-1" action={async () => { "use server"; await setOfficeStatus(office.id, office.status === "active" ? "paused" : "active"); }}>
            <span>{office.name} · {office.status}</span>
            {userCan && <button className="text-sm underline">{office.status === "active" ? "Pause" : "Resume"}</button>}
          </form>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Lead", "Phone", "Source", "Status", "Reason"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{maskPhone(row.phone)}</td>
                <td className="px-4 py-3">{row.source}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3 text-muted">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Agent({ owner, bundle }: { owner: boolean; bundle: Awaited<ReturnType<typeof getSettingsBundle>> }) {
  const draft = bundle.draftAgent;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <form className="space-y-3 rounded-xl border border-line bg-card p-4" action={async (formData) => {
        "use server";
        await saveAgentDraft({
          agentName: String(formData.get("agentName") || ""),
          openingLine: String(formData.get("openingLine") || ""),
          instructions: String(formData.get("instructions") || ""),
        });
      }}>
        <label className="block text-sm">Agent name<input name="agentName" defaultValue={bundle.org.agentName} disabled={!owner} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label className="block text-sm">Opening line<textarea name="openingLine" defaultValue={draft?.openingLine || ""} disabled={!owner} rows={3} className="mt-1 w-full rounded-lg border border-line p-2" /></label>
        <label className="block text-sm">Instructions<textarea name="instructions" defaultValue={draft?.instructions || ""} disabled={!owner} rows={10} className="mt-1 w-full rounded-lg border border-line p-2" /></label>
        {owner && <button className="rounded-full bg-ink px-3 py-1.5 text-sm text-white dark:bg-white dark:text-black">Save draft</button>}
        {!owner && <p className="text-sm text-muted">Only an owner can edit the agent.</p>}
      </form>
      <div className="rounded-xl border border-line bg-card p-4 text-sm">
        <h3 className="font-medium">Versions</h3>
        <ul className="mt-3 space-y-2">
          {bundle.agentVersions.map((version) => (
            <li key={version.id} className="flex items-center justify-between gap-2">
              <span>v{version.version} · {version.status}</span>
              {owner && version.status !== "published" && (
                <form action={async () => { "use server"; await publishAgent(version.id); }}><button className="underline">Publish</button></form>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Voice({ owner, live, opening }: { owner: boolean; live?: { voiceId: string; voiceName: string }; opening: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {VOICE_CATALOG.map((voice) => (
        <div key={voice.id} className="rounded-xl border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{voice.name}</div>
              <div className="text-sm text-muted">{voice.description}</div>
            </div>
            {live?.voiceId === voice.id && <span className="rounded-full bg-[#e7f6ee] px-2 py-0.5 text-xs text-[#187a42]">Live</span>}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-full border border-line px-3 py-1 text-sm" disabled>Play in the browser</button>
            {owner && (
              <form action={async () => { "use server"; await publishVoice(voice.id, voice.name); }}>
                <button className="rounded-full bg-ink px-3 py-1 text-sm text-white dark:bg-white dark:text-black">Make live</button>
              </form>
            )}
          </div>
          <p className="mt-2 text-xs text-muted">Preview line: {opening || "Publish an opening line first."}</p>
        </div>
      ))}
    </div>
  );
}

function Rules({ owner, policy, version }: { owner: boolean; policy: CallingPolicy; version?: number }) {
  return (
    <form className="max-w-xl space-y-3 rounded-xl border border-line bg-card p-4 text-sm" action={async (formData) => {
      "use server";
      const days = formData.getAll("days").map(Number);
      await publishRules({
        ...policy,
        windowStart: String(formData.get("windowStart") || policy.windowStart),
        windowEnd: String(formData.get("windowEnd") || policy.windowEnd),
        days,
        dailyCap: Number(formData.get("dailyCap") || policy.dailyCap),
        maxAttempts: Number(formData.get("maxAttempts") || policy.maxAttempts),
        retryBackoffMinutes: Number(formData.get("backoff") || policy.retryBackoffMinutes),
        requireConsent: formData.get("requireConsent") === "on",
        enforceDnc: formData.get("enforceDnc") === "on",
        enforceCallingHours: formData.get("enforceCallingHours") === "on",
        minConsent: String(formData.get("minConsent") || policy.minConsent) as CallingPolicy["minConsent"],
      });
    }}>
      <p className="text-muted">Published version {version ?? "\u2014"}.</p>
      <div className="grid grid-cols-2 gap-2">
        <label>Window start<input name="windowStart" type="time" defaultValue={policy.windowStart} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label>Window end<input name="windowEnd" type="time" defaultValue={policy.windowEnd} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label>Daily cap<input name="dailyCap" type="number" defaultValue={policy.dailyCap} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label>Max attempts<input name="maxAttempts" type="number" defaultValue={policy.maxAttempts} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label>Retry backoff (minutes)<input name="backoff" type="number" defaultValue={policy.retryBackoffMinutes} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label>Minimum consent
          <select name="minConsent" defaultValue={policy.minConsent} className="mt-1 h-9 w-full rounded-lg border border-line bg-transparent px-2">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-3">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
          <label key={day} className="flex items-center gap-1"><input type="checkbox" name="days" value={index} defaultChecked={policy.days.includes(index)} />{day}</label>
        ))}
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" name="requireConsent" defaultChecked={policy.requireConsent} /> Require consent</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="enforceDnc" defaultChecked={policy.enforceDnc} /> Enforce do-not-call</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="enforceCallingHours" defaultChecked={policy.enforceCallingHours} /> Enforce calling hours</label>
      {owner ? <button className="rounded-full bg-ink px-3 py-1.5 text-white dark:bg-white dark:text-black">Publish rules</button> : <p className="text-muted">Only an owner can publish rules.</p>}
    </form>
  );
}

function Offices({ offices, canWrite: allow }: { offices: Awaited<ReturnType<typeof getSettingsBundle>>["offices"]; canWrite: boolean }) {
  return (
    <div>
      {allow && (
        <form className="mb-4 flex flex-wrap gap-2" action={async (formData) => {
          "use server";
          await addOffice({
            name: String(formData.get("name") || ""),
            timezone: String(formData.get("timezone") || "America/New_York"),
            type: String(formData.get("type") || "office") as "office",
            calendarName: String(formData.get("calendar") || ""),
            advisor: String(formData.get("advisor") || "Karen"),
          });
        }}>
          <input name="name" placeholder="Office name" required className="h-9 rounded-lg border border-line px-2 text-sm" />
          <input name="timezone" defaultValue="America/New_York" className="h-9 rounded-lg border border-line px-2 text-sm" />
          <input name="calendar" placeholder="Calendar name" className="h-9 rounded-lg border border-line px-2 text-sm" />
          <input name="advisor" placeholder="Advisor" className="h-9 rounded-lg border border-line px-2 text-sm" />
          <select name="type" className="h-9 rounded-lg border border-line bg-card px-2 text-sm"><option value="office">Office</option><option value="virtual">Virtual</option></select>
          <button className="rounded-full bg-ink px-3 text-sm text-white dark:bg-white dark:text-black">Add office</button>
        </form>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Office", "Time zone", "Advisors", "Type", "Status", "Edit"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {offices.map((office) => (
              <tr key={office.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{office.name}</td>
                <td className="px-4 py-3">{office.timezone}</td>
                <td className="px-4 py-3">{office.advisors.map((a) => a.name).join(", ") || "\u2014"}</td>
                <td className="px-4 py-3 capitalize">{office.type}</td>
                <td className="px-4 py-3 capitalize">{office.status}</td>
                <td className="px-4 py-3">{allow && <form action={async () => { "use server"; await setOfficeStatus(office.id, office.status === "active" ? "paused" : "active"); }}><button className="underline">{office.status === "active" ? "Pause" : "Resume"}</button></form>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Users({ owner, user, users }: { owner: boolean; user: { id: string; role: string }; users: { id: string; name: string; email: string; role: string; totpEnabled: boolean; createdAt: Date }[] }) {
  return (
    <div className="space-y-4">
      <TotpSetup enabled={users.find((row) => row.id === user.id)?.totpEnabled || false} userId={user.id} />
      {owner && (
        <form className="flex flex-wrap gap-2" action={async (formData) => {
          "use server";
          await addUser({
            name: String(formData.get("name") || ""),
            email: String(formData.get("email") || ""),
            role: String(formData.get("role") || "viewer") as "viewer",
            password: String(formData.get("password") || ""),
          });
        }}>
          <input name="name" placeholder="Name" required className="h-9 rounded-lg border border-line px-2 text-sm" />
          <input name="email" type="email" placeholder="Email" required className="h-9 rounded-lg border border-line px-2 text-sm" />
          <input name="password" type="text" placeholder="Temporary password" required className="h-9 rounded-lg border border-line px-2 text-sm" />
          <select name="role" className="h-9 rounded-lg border border-line bg-card px-2 text-sm"><option value="viewer">Viewer</option><option value="admin">Admin</option><option value="owner">Owner</option></select>
          <button className="rounded-full bg-ink px-3 text-sm text-white dark:bg-white dark:text-black">Add user</button>
        </form>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Name", "Email", "Role", "Two-step sign-in", "Added"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3 capitalize">{row.role}</td>
                <td className="px-4 py-3">{row.totpEnabled ? "On" : "Off"}</td>
                <td className="px-4 py-3 text-muted">{formatDateTime(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Capabilities({ owner, bundle }: { owner: boolean; bundle: Awaited<ReturnType<typeof getSettingsBundle>> }) {
  const policy = bundle.policy.policy;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form className="space-y-3 rounded-xl border border-line bg-card p-4 text-sm" action={async (formData) => {
        "use server";
        await updateSwitches({
          requireConsent: formData.get("requireConsent") === "on",
          enforceDnc: formData.get("enforceDnc") === "on",
          enforceCallingHours: formData.get("enforceCallingHours") === "on",
          testMode: formData.get("testMode") === "on",
          scheduleEnabled: formData.get("scheduleEnabled") === "on",
        });
      }}>
        <h3 className="font-medium">Safety switches</h3>
        <label className="flex items-center gap-2"><input type="checkbox" name="requireConsent" defaultChecked={policy.requireConsent} /> Block calls without consent</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="enforceDnc" defaultChecked={policy.enforceDnc} /> Enforce do-not-call</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="enforceCallingHours" defaultChecked={policy.enforceCallingHours} /> Stay inside the local calling window</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="testMode" defaultChecked={bundle.org.testMode} /> Test mode</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="scheduleEnabled" defaultChecked={bundle.org.scheduleEnabled} /> Dial new GoHighLevel leads on a schedule</label>
        {owner ? <button className="rounded-full bg-ink px-3 py-1.5 text-white dark:bg-white dark:text-black">Save switches</button> : <p className="text-muted">Only an owner can change these.</p>}
      </form>
      <div className="rounded-xl border border-line bg-card p-4">
        <h3 className="font-medium">CRM field mapping</h3>
        <ul className="mt-3 space-y-2 text-sm">
          {bundle.mappings.map((mapping) => (
            <li key={mapping.id}>
              <form className="flex items-center gap-2" action={async (formData) => { "use server"; await saveMapping(mapping.id, String(formData.get("ghl") || mapping.ghlField), formData.get("enabled") === "on"); }}>
                <span className="w-24">{mapping.internalField}</span>
                <input name="ghl" defaultValue={mapping.ghlField} className="h-8 flex-1 rounded-md border border-line px-2" />
                <label className="text-xs"><input type="checkbox" name="enabled" defaultChecked={mapping.enabled} /> On</label>
                <button className="text-xs underline">Save</button>
              </form>
            </li>
          ))}
        </ul>
        <h3 className="mt-5 font-medium">Recent activity</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {bundle.activity.map((row) => <li key={row.id}>{row.actorName} · {row.action}</li>)}
        </ul>
      </div>
    </div>
  );
}

function Integrations({ checks }: { checks: { provider: string; label: string; detail: string; status: string; latencyMs: number | null; checkedAt: Date }[] }) {
  return (
    <div>
      <IntegrationsRefresh />
      <div className="grid gap-3">
        {checks.map((check) => (
          <div key={check.provider} className="flex items-center justify-between rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
            <div>
              <div className="flex items-center gap-2 font-medium"><span className={`h-2 w-2 rounded-full ${check.status === "healthy" ? "bg-[#22a06b]" : "bg-[#d14343]"}`} />{check.label}</div>
              <div className="text-sm text-muted">{check.detail}</div>
              <div className="mt-1 text-xs text-muted">{check.latencyMs != null ? `Answered in ${check.latencyMs} ms` : "Not checked"} · checked {formatDateTime(check.checkedAt)}</div>
            </div>
            <span className="rounded-full bg-[#e7f6ee] px-2 py-0.5 text-xs text-[#187a42]">{check.status === "healthy" ? "Healthy" : check.status}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 text-sm text-muted">
        <div>Webhook URLs</div>
        <ul className="mt-1 space-y-1 font-mono text-xs">
          <li>{appUrl()}/api/webhooks/ghl</li>
          <li>{appUrl()}/api/webhooks/elevenlabs</li>
          <li>{appUrl()}/api/webhooks/twilio</li>
        </ul>
      </div>
    </div>
  );
}

function IntegrationsRefresh() {
  return (
    <script dangerouslySetInnerHTML={{ __html: `setTimeout(()=>fetch('/api/integrations/check',{method:'POST'}).then(()=>location.reload()),30000)` }} />
  );
}

async function Activity({ searchParams }: { searchParams: SP }) {
  const data = await listActivity(searchParams);
  const pages = Math.max(1, Math.ceil(data.total / data.perPage));
  return (
    <div>
      <form className="mb-3"><input name="q" placeholder="Search the log" className="h-9 w-64 rounded-lg border border-line px-3 text-sm" /></form>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Time", "Who", "What happened", "What it touched"].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-muted">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3">{row.actorName}</td>
                <td className="px-4 py-3">{row.action}</td>
                <td className="px-4 py-3">{row.targetLabel || row.targetType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-sm text-muted">Page {data.page} of {pages}</div>
    </div>
  );
}

async function Failed() {
  const data = await listFailedJobs();
  const table = (rows: typeof data.incoming, title: string) => (
    <section className="mt-4">
      <h3 className="mb-2 font-medium">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Item", "Status", "Attempts", "Error", "When", "Actions"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-muted">Nothing waiting.</td></tr>}
            {rows.map((job) => (
              <tr key={job.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{job.type.replaceAll("_", " ")}</td>
                <td className="px-3 py-2">{job.status}</td>
                <td className="px-3 py-2">{job.attempts}/{job.maxAttempts}</td>
                <td className="px-3 py-2 text-muted">{job.lastError || "\u2014"}</td>
                <td className="px-3 py-2 text-muted">{formatDateTime(job.updatedAt)}</td>
                <td className="px-3 py-2">
                  <form className="inline" action={async () => { "use server"; await retryJob(job.id); }}><button className="underline">Retry</button></form>
                  <form className="ml-2 inline" action={async () => { "use server"; await discardJob(job.id); }}><button className="underline">Discard</button></form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
  return <div>{table(data.incoming, "Incoming events")}{table(data.crm, "CRM updates")}</div>;
}

function Production({ owner, bundle }: { owner: boolean; bundle: Awaited<ReturnType<typeof getSettingsBundle>> }) {
  const ready = bundle.readiness.filter((item) => item.ok).length;
  return (
    <div>
      <p className="mb-4 text-sm text-muted">{ready} of {bundle.readiness.length} checks pass. For a small pilot: switch off test mode, rotate the Twilio token, obtain a fresh ElevenLabs key privately, and turn the schedule on.</p>
      <ul className="space-y-2">
        {bundle.readiness.map((item) => (
          <li key={item.id} className="rounded-xl border border-line bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium"><span className={`h-2 w-2 rounded-full ${item.ok ? "bg-[#22a06b]" : "bg-[#d14343]"}`} />{item.label}</div>
            <p className="mt-1 text-sm text-muted">{item.hint}</p>
          </li>
        ))}
      </ul>
      {owner && (
        <form className="mt-4" action={async () => { "use server"; await updateSwitches({ requireConsent: bundle.policy.policy.requireConsent, enforceDnc: bundle.policy.policy.enforceDnc, enforceCallingHours: bundle.policy.policy.enforceCallingHours, testMode: !bundle.org.testMode, scheduleEnabled: bundle.org.scheduleEnabled }); }}>
          <button className="rounded-full border border-line px-3 py-1.5 text-sm">{bundle.org.testMode ? "Turn test mode off" : "Turn test mode back on"}</button>
        </form>
      )}
      <p className="mt-4 text-sm"><Link className="underline" href="/docs">Deployment notes</Link></p>
    </div>
  );
}
