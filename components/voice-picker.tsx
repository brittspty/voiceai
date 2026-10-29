"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { publishVoice } from "@/lib/actions";

type Voice = { id: string; name: string; description: string };

export function VoicePicker({
  owner,
  voices,
  live,
  opening,
  agentName,
}: {
  owner: boolean;
  voices: readonly Voice[];
  live?: { voiceId: string; voiceName: string } | null;
  opening: string;
  agentName: string;
}) {
  const router = useRouter();
  const titleId = useId();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<Voice | null>(null);
  const chosen = voices.find((voice) => voice.id === pendingId) || null;
  const line = opening || `Hello, this is ${agentName}.`;

  async function makeLive(voice: Voice, previous: Voice | null) {
    setError(null);
    try {
      await publishVoice(voice.id, voice.name);
      setNotice(`Voice updated. ${agentName} now sounds like ${voice.name}.`);
      setUndo(previous);
      setPendingId(null);
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the voice.");
    }
  }

  function playLine() {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(line));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-card p-4">
        <div className="text-sm font-medium">{live ? `Live voice: ${live.voiceName}` : "No voice chosen"}</div>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
          {live ? `${agentName} uses this voice on new calls.` : "Pick how Avery sounds on calls."}
        </p>
        <button type="button" className="mt-3 h-9 rounded-full border border-line px-3 text-sm" onClick={playLine} title="Plays in your browser. It is not Avery's recorded voice.">
          Preview opening line
        </button>
      </div>
      {notice && (
        <p role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
          {notice}{" "}
          {undo && (
            <button type="button" className="font-medium underline" onClick={() => makeLive(undo, live ? { id: live.voiceId, name: live.voiceName, description: "" } : null)}>
              Undo
            </button>
          )}
        </p>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {voices.map((voice) => {
          const isLive = live?.voiceId === voice.id;
          return (
            <div key={voice.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{voice.name}</div>
                  <div className="text-sm text-zinc-600 dark:text-zinc-300">{voice.description}</div>
                </div>
                {isLive && <span className="rounded-full bg-success-soft px-2 py-0.5 text-xs text-success">Live</span>}
              </div>
              <p className="mt-3 text-xs text-muted">Opening line: {line}</p>
              <div className="mt-3 flex gap-2">
                <button type="button" className="h-9 rounded-full border border-line px-3 text-sm" onClick={playLine}>Play</button>
                {owner && !isLive && (
                  <button type="button" className="btn-brand h-9 rounded-full px-3 text-sm" onClick={() => { setPendingId(voice.id); setError(null); }}>
                    Use this voice
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {chosen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={() => setPendingId(null)}>
          <div role="alertdialog" aria-modal="true" aria-labelledby={titleId} className="w-full max-w-md rounded-2xl border border-line bg-card p-5 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
            <h2 id={titleId} className="text-lg font-semibold">Make {chosen.name} live for new calls?</h2>
            <p className="mt-2 text-sm leading-6 text-muted">{agentName} will use {chosen.name} on all new calls.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-10 rounded-full border border-line px-4 text-sm" onClick={() => setPendingId(null)}>Cancel</button>
              <button
                type="button"
                className="btn-brand h-10 rounded-full px-4 text-sm"
                onClick={() => makeLive(chosen, live ? { id: live.voiceId, name: live.voiceName, description: "" } : null)}
              >
                Use this voice
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
