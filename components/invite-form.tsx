"use client";

import { useState } from "react";
import { inviteTeammate } from "@/lib/actions";

export function InviteForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 rounded-xl border border-line bg-card p-4 sm:grid-cols-2"
      action={async (formData) => {
        setError(null);
        setMessage(null);
        setLink("");
        try {
          const result = await inviteTeammate({
            name: String(formData.get("name") || ""),
            email: String(formData.get("email") || ""),
            role: String(formData.get("role") || "viewer") as "viewer",
          });
          setMessage(result.emailed ? `Invite emailed to ${String(formData.get("email") || "").trim()}.` : "Email isn't set up on this server yet. Copy this link and send it to them.");
          setLink(result.link);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : "Could not send the invite.");
        }
      }}
    >
      <label className="block text-sm">Name
        <input name="name" required autoComplete="name" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
      </label>
      <label className="block text-sm">Work email
        <input name="email" type="email" required autoComplete="email" className="mt-1 h-10 w-full rounded-lg border border-line px-3" />
      </label>
      <label className="block text-sm">Role
        <select name="role" className="mt-1 h-10 w-full rounded-lg border border-line bg-card px-2">
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
          <option value="owner">Owner</option>
        </select>
      </label>
      <div className="flex items-end">
        <button className="btn-brand h-10 rounded-full px-4 text-sm">Send invite</button>
      </div>
      {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
      {message && <p className="text-sm sm:col-span-2" role="status">{message}</p>}
      {link && <p className="break-all text-sm sm:col-span-2"><span className="text-muted">Invite link: </span>{link}</p>}
    </form>
  );
}
