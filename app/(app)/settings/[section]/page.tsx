import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ConfirmButton, ConfirmSubmitButton } from "@/components/confirm-dialog";
import { GoLivePanel } from "@/components/go-live-panel";
import { InviteForm } from "@/components/invite-form";
import { PageTitle } from "@/components/shell";
import { TestConsole } from "@/components/test-console";
import { TotpSetup } from "@/components/totp-setup";
import { VoicePicker } from "@/components/voice-picker";
import { requireUser, isOwner, canWrite, isSuperAdmin, canOpenOperatorSettings, OPERATOR_SETTINGS } from "@/lib/auth";
import { resolveBrandColor, resolveMark } from "@/lib/brand";
import { actorLabel, CONSENT_OPTIONS, humanFieldLabel, integrationKeyId, presentIntegration } from "@/lib/customer-copy";
import { prisma } from "@/lib/db";
import { publicHttpsBase } from "@/lib/env";
import { formatDateTime, timeAgo } from "@/lib/format";
import { maskPhone } from "@/lib/phone";
import { type SP } from "@/lib/params";
import { callingQueue, getSettingsBundle, listActivity, listFailedJobs } from "@/lib/queries";
import { VOICE_CATALOG, type CallingPolicy } from "@/lib/types";
import {
  addOffice,
  discardJob,
  publishAgent,
  publishRules,
  refreshIntegrations,
  saveWorkspace,
  retryAllJobs,
  retryJob,
  saveAgentDraft,
  saveMapping,
  setOfficeStatus,
  updateSwitches,
} from "@/lib/actions";

const TITLES: Record<string, [string, string]> = {
  calling: ["Call settings", "Who Avery will call, and why a lead is ready or waiting."],
  branding: ["Branding", "The color and mark for this workspace. Avery's script is on its own page."],
  agent: ["Avery's script", "The opening line and the instructions Avery follows. Publishing makes a new version."],
  voice: ["Avery's voice", "Choose how Avery sounds. Using a voice makes it the one on new calls."],
  "calling-rules": ["Calling rules", "When Avery may call, how often, and who counts as a yes. Publishing replaces the live rules."],
  offices: ["Locations", "Time zone, calendar, and who takes meetings for each location."],
  users: ["Team & security", "Who can sign in, and whether two-step sign-in is on."],
  capabilities: ["What Avery can do", "Safety switches live in Calling rules. Here you choose what gets written back to GoHighLevel."],
  integrations: ["Connections", "GoHighLevel, Avery's voice service, and your phone number. Check them whenever you want."],
  activity: ["Activity log", "Sign-ins and changes, newest first."],
  "failed-jobs": ["Failed jobs", "Updates that did not go through. Specificity support uses this page."],
  "test-console": ["Place a test call", "Call a test number through the same checks Avery uses. It counts against the daily cap."],
  production: ["Go-live checklist", "Finish these steps before Avery calls real leads. Test mode stays on until you go live."],
  "go-live": ["Go-live checklist", "Finish these steps before Avery calls real leads. Test mode stays on until you go live."],
};

export async function generateMetadata({ params }: { params: Promise<{ section: string }> }): Promise<Metadata> {
  const { section } = await params;
  return { title: TITLES[section]?.[0] || "Settings" };
}

export default async function SettingsSection({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<SP> }) {
  const rawSection = (await params).section;
  const section = rawSection === "go-live" ? "production" : rawSection;
  const title = TITLES[rawSection];
  if (!title) notFound();
  const user = await requireUser();
  if (user.role === "client_viewer") redirect("/marketing/client");
  if ((OPERATOR_SETTINGS as readonly string[]).includes(section) && !canOpenOperatorSettings(user.role)) redirect("/settings/calling");
  const bundle = await getSettingsBundle();
  return (
    <div>
      <PageTitle
        title={title[0]}
        subtitle={title[1]}
        action={section === "integrations" && canWrite(user.role) ? (
          <form action={async () => { "use server"; await refreshIntegrations(); }}>
            <button className="rounded-full border border-line bg-card px-3 py-1.5 text-sm">Check now</button>
          </form>
        ) : section === "failed-jobs" && canWrite(user.role) ? (
          <form action={async () => { "use server"; await retryAllJobs(); }}>
            <button className="rounded-full border border-line bg-card px-3 py-1.5 text-sm">Retry all waiting now</button>
          </form>
        ) : null}
      />
      {section === "calling" && <Calling userCan={canWrite(user.role)} offices={bundle.offices} testMode={bundle.org.testMode} />}
      {section === "branding" && <Branding owner={isOwner(user.role)} bundle={bundle} />}
      {section === "agent" && <Agent owner={isOwner(user.role)} bundle={bundle} />}
      {section === "voice" && <VoicePicker owner={isOwner(user.role)} voices={VOICE_CATALOG} live={bundle.voiceVersions.find((v) => v.status === "published")} opening={bundle.draftAgent?.openingLine || ""} agentName={bundle.org.agentName} />}
      {section === "calling-rules" && <Rules owner={isOwner(user.role)} policy={bundle.policy.policy} version={bundle.policy.version?.version} />}
      {section === "offices" && <Offices canWrite={canWrite(user.role)} offices={bundle.offices} timezone={bundle.org.timezone} agentName={bundle.org.agentName} />}
      {section === "users" && <Users owner={isOwner(user.role)} user={user} users={bundle.users} />}
      {section === "capabilities" && <Capabilities owner={isOwner(user.role)} canWrite={canWrite(user.role)} superAdmin={isSuperAdmin(user.role)} bundle={bundle} />}
      {section === "integrations" && <Integrations checks={bundle.checks} testMode={bundle.org.testMode} readiness={bundle.readiness} />}
      {section === "activity" && <Activity searchParams={await searchParams} />}
      {section === "failed-jobs" && <Failed canWrite={canWrite(user.role)} />}
      {section === "test-console" && (
        <TestConsole
          canWrite={canWrite(user.role)}
          offices={bundle.offices.map((o) => ({ id: o.id, name: o.name }))}
          contacts={(await prisma.contact.findMany({ orderBy: { name: "asc" }, take: 30 })).map((c) => ({ id: c.id, name: c.name, phone: c.phone }))}
        />
      )}
      {section === "production" && <Production owner={isOwner(user.role)} canAct={canWrite(user.role)} showAdmin={isSuperAdmin(user.role)} bundle={bundle} />}
    </div>
  );
}

async function Calling({ offices, userCan, testMode }: { offices: { id: string; name: string; status: string }[]; userCan: boolean; testMode: boolean }) {
  const rows = await callingQueue();
  return (
    <div className="space-y-4">
      {testMode && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Test mode is on. Avery is not calling real leads. <Link className="font-medium underline" href="/settings/production">Finish go-live setup →</Link>
        </p>
      )}
      <div className="rounded-xl border border-line bg-card p-4 text-sm">
        {offices.length === 0 && <p className="text-muted">No locations yet. Add a location so Avery uses the right hours and calendar.</p>}
        {offices.map((office) => (
          <div key={office.id} className="flex items-center justify-between gap-3 py-1">
            <span>{office.name} · {office.status === "paused" ? "Paused" : "Calling"}</span>
            {userCan && (
              <ConfirmButton
                label={office.status === "active" ? "Pause" : "Resume"}
                confirmLabel={office.status === "active" ? "Pause calls" : "Resume calls"}
                title={office.status === "active" ? `Pause calls for ${office.name}?` : `Resume calls for ${office.name}?`}
                body={office.status === "active" ? "Queued leads wait until you resume." : "Avery can call leads for this location again."}
                className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm"
                action={async () => { "use server"; await setOfficeStatus(office.id, office.status === "active" ? "paused" : "active"); }}
              />
            )}
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Lead", "Phone", "Source", "Status", "Reason"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center"><div className="font-medium">No leads yet</div><p className="mt-1 text-sm text-muted">New GoHighLevel leads appear here automatically.</p></td></tr>
            )}
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3">{row.name}</td>
                <td className="px-4 py-3">{maskPhone(row.phone)}</td>
                <td className="px-4 py-3">{row.source}</td>
                <td className="px-4 py-3">{row.status === "Eligible" ? "OK to call" : "Waiting"}</td>
                <td className="px-4 py-3 text-muted">{row.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Branding({ owner, bundle }: { owner: boolean; bundle: Awaited<ReturnType<typeof getSettingsBundle>> }) {
  return (
    <form className="max-w-xl space-y-3 rounded-xl border border-line bg-card p-4" action={async (formData) => {
      "use server";
      await saveWorkspace({
        name: String(formData.get("name") || ""),
        subtitle: String(formData.get("subtitle") || ""),
        timezone: String(formData.get("timezone") || ""),
        brandColor: String(formData.get("brandColor") || ""),
        logoUrl: String(formData.get("logoUrl") || ""),
        mark: String(formData.get("mark") || ""),
      });
    }}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm">Company name<input name="name" defaultValue={bundle.org.name} disabled={!owner} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label className="block text-sm">Subtitle<input name="subtitle" defaultValue={bundle.org.subtitle} disabled={!owner} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label className="block text-sm">Timezone<input name="timezone" defaultValue={bundle.org.timezone} disabled={!owner} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label className="block text-sm">Brand color<input name="brandColor" defaultValue={resolveBrandColor(bundle.org.brandColor)} disabled={!owner} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label className="block text-sm">Mark<input name="mark" defaultValue={resolveMark(bundle.org.mark)} maxLength={2} disabled={!owner} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label className="block text-sm">Logo URL<input name="logoUrl" defaultValue={bundle.org.logoUrl} placeholder="Leave blank for the Specificity logo" disabled={!owner} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
      </div>
      <p className="text-xs text-muted">Leave the logo blank to use the Specificity logo. The color stays the Specificity orange unless you set another one.</p>
      {owner ? <button className="btn-brand rounded-full px-3 py-1.5 text-sm">Save branding</button> : <p className="text-sm text-muted">Only an owner can edit branding.</p>}
    </form>
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
        {owner && <button className="btn-brand rounded-full px-3 py-1.5 text-sm">Save draft</button>}
        {!owner && <p className="text-sm text-muted">Only an owner can edit the agent.</p>}
      </form>
      <div className="rounded-xl border border-line bg-card p-4 text-sm">
        <h3 className="font-medium">Versions</h3>
        <ul className="mt-3 space-y-2">
          {bundle.agentVersions.map((version) => (
            <li key={version.id} className="flex items-center justify-between gap-2">
              <span>v{version.version} · {version.status}</span>
              {owner && version.status !== "published" && (
                <ConfirmButton
                  label="Publish script"
                  confirmLabel="Publish"
                  title="Publish Avery's script?"
                  body="Avery will use this version on new calls."
                  action={async () => { "use server"; await publishAgent(version.id); }}
                />
              )}
            </li>
          ))}
        </ul>
      </div>
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
      <p className="text-muted">Live version {version ?? "not published yet"}.</p>
      <div className="grid grid-cols-2 gap-2">
        <label>Calling hours start<input name="windowStart" type="time" defaultValue={policy.windowStart} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label>Calling hours end<input name="windowEnd" type="time" defaultValue={policy.windowEnd} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label>Most calls per day<input name="dailyCap" type="number" defaultValue={policy.dailyCap} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label>Most tries per lead<input name="maxAttempts" type="number" defaultValue={policy.maxAttempts} className="mt-1 h-9 w-full rounded-lg border border-line px-2" /></label>
        <label className="col-span-2">Wait before calling again (minutes)
          <input name="backoff" type="number" defaultValue={policy.retryBackoffMinutes} className="mt-1 h-9 w-full rounded-lg border border-line px-2" />
          <span className="mt-1 block text-xs text-muted">120 minutes is about 2 hours.</span>
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">Who Avery may call</legend>
        <div className="mt-2 space-y-2">
          {CONSENT_OPTIONS.map((option) => (
            <label key={option.value} className="flex gap-2 rounded-lg border border-line p-3">
              <input type="radio" name="minConsent" value={option.value} defaultChecked={policy.minConsent === option.value} className="mt-1" />
              <span>
                <span className="font-medium">{option.title}</span>
                {option.recommended && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-950">Recommended</span>}
                <span className="mt-1 block text-zinc-600 dark:text-zinc-300">{option.body}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-3">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, index) => (
          <label key={day} className="flex items-center gap-1"><input type="checkbox" name="days" value={index} defaultChecked={policy.days.includes(index)} />{day}</label>
        ))}
      </div>
      <label className="flex items-center gap-2"><input type="checkbox" name="requireConsent" defaultChecked={policy.requireConsent} /> Require consent</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="enforceDnc" defaultChecked={policy.enforceDnc} /> Enforce do-not-call</label>
      <label className="flex items-center gap-2"><input type="checkbox" name="enforceCallingHours" defaultChecked={policy.enforceCallingHours} /> Enforce calling hours</label>
      {owner ? (
        <ConfirmSubmitButton label="Publish rules" title="Publish these calling rules?" body="Avery will follow these hours, caps, and consent rules on new calls." className="btn-brand rounded-full px-3 py-1.5 text-sm" />
      ) : <p className="text-muted">Only an owner can publish rules.</p>}
    </form>
  );
}

function Offices({ offices, canWrite: allow, timezone, agentName }: { offices: Awaited<ReturnType<typeof getSettingsBundle>>["offices"]; canWrite: boolean; timezone: string; agentName: string }) {
  return (
    <div>
      {allow && (
        <form className="mb-4 flex flex-wrap gap-2" action={async (formData) => {
          "use server";
          await addOffice({
            name: String(formData.get("name") || ""),
            timezone: String(formData.get("timezone") || timezone),
            type: String(formData.get("type") || "office") as "office",
            calendarName: String(formData.get("calendar") || ""),
            advisor: String(formData.get("advisor") || agentName),
          });
        }}>
          <label className="text-sm">Location name<input name="name" placeholder="e.g., Downtown" required className="mt-1 block h-9 rounded-lg border border-line px-2 text-sm" /></label>
          <label className="text-sm">Time zone<input name="timezone" placeholder="e.g., America/Chicago" className="mt-1 block h-9 rounded-lg border border-line px-2 text-sm" /></label>
          <label className="text-sm">Calendar<input name="calendar" placeholder="e.g., Main calendar" className="mt-1 block h-9 rounded-lg border border-line px-2 text-sm" /></label>
          <label className="text-sm">Who takes meetings<input name="advisor" placeholder={`e.g., ${agentName}`} className="mt-1 block h-9 rounded-lg border border-line px-2 text-sm" /></label>
          <select name="type" className="h-9 rounded-lg border border-line bg-card px-2 text-sm"><option value="office">Office</option><option value="virtual">Virtual</option></select>
          <button className="btn-brand h-9 self-end rounded-full px-3 text-sm">Add location</button>
        </form>
      )}
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Location", "Time zone", "Who takes meetings", "Type", "Status", "Actions"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {offices.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center"><div className="font-medium">No locations yet</div><p className="mt-1 text-sm text-muted">Add a location so Avery uses the right hours and calendar.</p></td></tr>
            )}
            {offices.map((office) => (
              <tr key={office.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{office.name}</td>
                <td className="px-4 py-3">{office.timezone}</td>
                <td className="px-4 py-3">{office.advisors.map((a) => a.name).join(", ") || "Not set"}</td>
                <td className="px-4 py-3 capitalize">{office.type}</td>
                <td className="px-4 py-3">{office.status === "paused" ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-950">Paused</span> : "Calling"}</td>
                <td className="px-4 py-3">{allow && (
                  <ConfirmButton
                    label={office.status === "active" ? "Pause" : "Resume"}
                    confirmLabel={office.status === "active" ? "Pause calls" : "Resume calls"}
                    title={office.status === "active" ? `Pause calls for ${office.name}?` : `Resume calls for ${office.name}?`}
                    body={office.status === "active" ? "Queued leads wait until you resume." : "Avery can call leads for this location again."}
                    className="inline-flex h-9 items-center rounded-full border border-line px-3 text-sm"
                    action={async () => { "use server"; await setOfficeStatus(office.id, office.status === "active" ? "paused" : "active"); }}
                  />
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Users({ owner, user, users }: { owner: boolean; user: { id: string; role: string }; users: { id: string; name: string; email: string; role: string; totpEnabled: boolean; createdAt: Date }[] }) {
  const leadersOff = users.some((row) => (row.role === "owner" || row.role === "admin") && !row.totpEnabled);
  return (
    <div className="space-y-4">
      {leadersOff && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">Turn on two-step sign-in for every owner and admin before you go live.</p>
      )}
      <TotpSetup enabled={users.find((row) => row.id === user.id)?.totpEnabled || false} userId={user.id} />
      {owner && <InviteForm />}
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Name", "Email", "Role", "Two-step sign-in", "Added"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {users.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 font-medium">{row.name}</td>
                <td className="px-4 py-3">{row.email}</td>
                <td className="px-4 py-3 capitalize">{row.role}</td>
                <td className="px-4 py-3">{row.totpEnabled ? "On" : row.id === user.id ? "Off · use the setup above" : "Off"}</td>
                <td className="px-4 py-3 text-muted">{formatDateTime(row.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Capabilities({ owner, canWrite: allow, superAdmin, bundle }: { owner: boolean; canWrite: boolean; superAdmin: boolean; bundle: Awaited<ReturnType<typeof getSettingsBundle>> }) {
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
        <p className="text-zinc-600 dark:text-zinc-300">Consent, do-not-call, and calling hours are managed in <Link className="underline" href="/settings/calling-rules">Calling rules</Link>. Going live is on the <Link className="underline" href="/settings/production">go-live checklist</Link>.</p>
        {policy.requireConsent && <input type="hidden" name="requireConsent" value="on" />}
        {policy.enforceDnc && <input type="hidden" name="enforceDnc" value="on" />}
        {policy.enforceCallingHours && <input type="hidden" name="enforceCallingHours" value="on" />}
        {bundle.org.testMode && <input type="hidden" name="testMode" value="on" />}
        {owner ? (
          <>
            <label className="flex items-center gap-2"><input type="checkbox" name="scheduleEnabled" defaultChecked={bundle.org.scheduleEnabled} /> Call new GoHighLevel leads on a schedule</label>
            <button className="btn-brand rounded-full px-3 py-1.5 text-sm">Save switches</button>
          </>
        ) : <p className="text-muted">{allow ? "Only an owner can change these." : "You have view-only access."}</p>}
      </form>
      <div className="rounded-xl border border-line bg-card p-4">
        <h3 className="font-medium">Fields sent to GoHighLevel</h3>
        <ul className="mt-3 space-y-3 text-sm">
          {bundle.mappings.map((mapping) => (
            <li key={mapping.id}>
              {superAdmin ? (
                <form className="space-y-1" action={async (formData) => { "use server"; await saveMapping(mapping.id, String(formData.get("ghl") || mapping.ghlField), formData.get("enabled") === "on"); }}>
                  <div className="font-medium">{humanFieldLabel(mapping.internalField, mapping.ghlField)}</div>
                  <label className="block text-xs text-muted" htmlFor={`ghl-${mapping.id}`}>CRM key</label>
                  <div className="flex items-center gap-2">
                    <input id={`ghl-${mapping.id}`} name="ghl" defaultValue={mapping.ghlField} className="h-8 flex-1 rounded-md border border-line px-2" />
                    <label className="text-xs"><input type="checkbox" name="enabled" defaultChecked={mapping.enabled} /> On</label>
                    <button className="text-xs underline">Save</button>
                  </div>
                </form>
              ) : (
                <div>
                  <div className="font-medium">{humanFieldLabel(mapping.internalField, mapping.ghlField)}</div>
                  <div className="text-xs text-muted">{mapping.enabled ? "On" : "Off"} · Specificity manages the CRM key</div>
                </div>
              )}
            </li>
          ))}
        </ul>
        <h3 className="mt-5 font-medium">Recent activity</h3>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          {bundle.activity.filter((row) => row.action !== "Seeded the workspace").map((row) => <li key={row.id}>{actorLabel(row.actorName)} · {row.action}</li>)}
        </ul>
      </div>
    </div>
  );
}

function Integrations({
  checks,
  testMode,
  readiness,
}: {
  checks: { provider: string; label: string; detail: string; status: string; latencyMs: number | null; checkedAt: Date }[];
  testMode: boolean;
  readiness: { id: string; ok: boolean }[];
}) {
  const stale = checks.some((check) => presentIntegration({ ...check, testMode, keysReady: false }).stale);
  const toneClass = { gray: "bg-chip text-muted", green: "bg-success-soft text-success", red: "bg-danger-soft text-danger", amber: "bg-warning-soft text-warning" };
  const base = publicHttpsBase();
  return (
    <div>
      <IntegrationsRefresh stale={stale} />
      <div className="grid gap-3">
        {checks.map((check) => {
          const keysReady = readiness.find((item) => item.id === integrationKeyId(check.provider))?.ok ?? false;
          const shown = presentIntegration({ ...check, testMode, keysReady });
          return (
            <div key={check.provider} className="flex items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3 shadow-[var(--shadow)]">
              <div>
                <div className="font-medium">{check.label}</div>
                {shown.sentence !== shown.status && <div className="text-sm text-zinc-600 dark:text-zinc-300">{shown.sentence}</div>}
                <div className="mt-1 text-xs text-muted">{check.checkedAt ? `Checked ${timeAgo(check.checkedAt)}` : "Not checked yet"}</div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-xs ${toneClass[shown.tone]}`}>{shown.status}</span>
            </div>
          );
        })}
      </div>
      <details className="mt-4 text-sm text-muted">
        <summary>For Specificity support</summary>
        {base ? (
          <ul className="mt-2 space-y-1 font-mono text-xs">
            <li>{base}/api/webhooks/ghl</li>
            <li>{base}/api/webhooks/elevenlabs</li>
            <li>{base}/api/webhooks/twilio</li>
          </ul>
        ) : (
          <p className="mt-2">The public site address is not set yet.</p>
        )}
      </details>
    </div>
  );
}

function IntegrationsRefresh({ stale }: { stale: boolean }) {
  const script = stale
    ? `fetch('/api/integrations/check',{method:'POST'}).then(()=>location.reload())`
    : `setTimeout(()=>fetch('/api/integrations/check',{method:'POST'}).then(()=>location.reload()),30000)`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

async function Activity({ searchParams }: { searchParams: SP }) {
  const data = await listActivity(searchParams);
  const pages = Math.max(1, Math.ceil(data.total / data.perPage));
  return (
    <div>
      <form className="mb-3"><label className="text-sm">Search the log<input name="q" placeholder="Name or change" className="mt-1 block h-9 w-64 rounded-lg border border-line px-3 text-sm" /></label></form>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Time", "Who", "What happened", "What it touched"].map((h) => <th key={h} scope="col" className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {data.rows.filter((row) => row.action !== "Seeded the workspace").length === 0 && (
              <tr><td colSpan={4} className="px-4 py-10 text-center"><div className="font-medium">Nothing here yet</div><p className="mt-1 text-muted">Changes you and your team make will be listed here.</p></td></tr>
            )}
            {data.rows.filter((row) => row.action !== "Seeded the workspace").map((row) => (
              <tr key={row.id} className="border-b border-line last:border-0">
                <td className="px-4 py-3 text-muted">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3">{actorLabel(row.actorName)}</td>
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

function plainJob(type: string, error: string | null) {
  const inbound = type === "inbound_event";
  const text = (error || "").toLowerCase();
  const detail = text.includes("timeout") || text.includes("timed out")
    ? "The update took too long."
    : text.includes("webhook")
      ? "The connection didn't answer."
      : error || "Something went wrong. You can try again.";
  return {
    title: inbound ? "A new lead from GoHighLevel didn't arrive" : "A call note didn't save to your CRM",
    detail,
  };
}

async function Failed({ canWrite: allow }: { canWrite: boolean }) {
  const data = await listFailedJobs();
  const table = (rows: typeof data.incoming, title: string) => (
    <section className="mt-4">
      <h3 className="mb-2 font-medium">{title}</h3>
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-[11px] text-muted">{["Item", "Status", "Attempts", "Error", "When", "Actions"].map((h) => <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center"><div className="font-medium">No failed jobs</div><p className="mt-1 text-sm text-muted">Everything is running.</p></td></tr>}
            {rows.map((job) => (
              <tr key={job.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{plainJob(job.type, job.lastError).title}</td>
                <td className="px-3 py-2">{job.status}</td>
                <td className="px-3 py-2">{job.attempts}/{job.maxAttempts}</td>
                <td className="px-3 py-2 text-muted">{plainJob(job.type, job.lastError).detail}</td>
                <td className="px-3 py-2 text-muted">{formatDateTime(job.updatedAt)}</td>
                <td className="px-3 py-2">
                  {allow && (
                    <>
                      <form className="inline" action={async () => { "use server"; await retryJob(job.id); }}><button className="underline">Try again</button></form>
                      <ConfirmButton
                        label="Discard"
                        confirmLabel="Discard"
                        title="Discard this update?"
                        body="Avery will not try to send it again."
                        className="ml-2 text-sm underline"
                        action={async () => { "use server"; await discardJob(job.id); }}
                      />
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
  return <div>{table(data.incoming, "Updates from your CRM")}{table(data.crm, "Notes written back to GoHighLevel")}</div>;
}

function Production({ owner, canAct, showAdmin, bundle }: { owner: boolean; canAct: boolean; showAdmin: boolean; bundle: Awaited<ReturnType<typeof getSettingsBundle>> }) {
  const policy = bundle.policy.policy;
  return (
    <GoLivePanel
      owner={owner}
      canAct={canAct}
      showAdmin={showAdmin}
      testMode={bundle.org.testMode}
      items={bundle.readiness}
      cap={policy.dailyCap}
      windowLabel={`${policy.windowStart}–${policy.windowEnd}`}
      switches={{
        requireConsent: policy.requireConsent,
        enforceDnc: policy.enforceDnc,
        enforceCallingHours: policy.enforceCallingHours,
        scheduleEnabled: bundle.org.scheduleEnabled,
      }}
    />
  );
}
