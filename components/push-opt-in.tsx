"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { VAPID_PUBLIC_KEY } from "@/lib/push/subscription";

type Prefs = {
  optedIn: boolean;
  quietStartHour: number;
  quietEndHour: number;
  urgentOutageBreaksQuiet: boolean;
  timeZone: string;
};

function keyBytes(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function registerBrowserPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false as const, error: "This browser cannot register a push subscription." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false as const, error: "Notification permission was not granted." };
  const registration = await navigator.serviceWorker.register("/push-sw.js");
  const ready = await navigator.serviceWorker.ready;
  const current = await ready.pushManager.getSubscription();
  const subscription = current || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
  return { ok: true as const, subscription: subscription.toJSON() };
}

export function PushOptInForm({ prefs, subscriptionStored }: { prefs: Prefs; subscriptionStored: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const optedIn = form.get("optedIn") === "on";
    setPending(true);
    setMessage("");
    try {
      let subscription: unknown = null;
      if (optedIn) {
        const registered = await registerBrowserPush();
        if (!registered.ok) {
          setMessage(registered.error);
          setPending(false);
          return;
        }
        subscription = registered.subscription;
      }
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          optedIn,
          quietStartHour: Number(form.get("quietStartHour")),
          quietEndHour: Number(form.get("quietEndHour")),
          urgentOutageBreaksQuiet: form.get("urgentOutageBreaksQuiet") === "on",
          timeZone: String(form.get("timeZone") || prefs.timeZone),
          subscription,
          clearSubscription: !optedIn,
        }),
      });
      if (!response.ok) {
        setMessage("Those settings were not saved.");
        return;
      }
      router.push("/notifications?saved=1");
      router.refresh();
    } catch {
      setMessage("Those settings were not saved.");
    } finally {
      setPending(false);
    }
  }
  return (
    <form className="mt-6 grid max-w-lg gap-4 rounded-xl border border-line p-4" method="post" action="/api/push" onSubmit={onSubmit}>
      <input type="hidden" name="timeZone" value={prefs.timeZone} />
      <label className="flex min-h-11 items-center gap-3">
        <input name="optedIn" type="checkbox" className="size-6" defaultChecked={prefs.optedIn} />
        Send me urgent alerts
      </label>
      <p className="text-sm text-muted">{subscriptionStored ? "A push subscription is stored for this account." : "Opting in registers this browser. Delivery still only logs would send."}</p>
      <label className="block">
        Quiet hours start
        <input name="quietStartHour" type="number" min={0} max={23} defaultValue={prefs.quietStartHour} className="mt-1 min-h-11 w-full rounded-lg border border-line px-3" aria-describedby="quiet-help" />
      </label>
      <label className="block">
        Quiet hours end
        <input name="quietEndHour" type="number" min={0} max={23} defaultValue={prefs.quietEndHour} className="mt-1 min-h-11 w-full rounded-lg border border-line px-3" />
      </label>
      <p id="quiet-help" className="text-sm text-muted">Default is 10 PM–7 AM. Decisions and notes are never pushed.</p>
      <label className="flex min-h-11 items-center gap-3">
        <input name="urgentOutageBreaksQuiet" type="checkbox" className="size-6" defaultChecked={prefs.urgentOutageBreaksQuiet} />
        Let urgent outage alerts through during quiet hours
      </label>
      {message && <p role="status">{message}</p>}
      <button className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-semibold text-on-brand" type="submit" disabled={pending}>Save notification settings</button>
    </form>
  );
}
