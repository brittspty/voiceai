import { clientConfig } from "./client-config";
import type { CallOutcomeName, TranscriptLine } from "./types";

export function buildTranscript(agentName: string, contactName: string, outcome: CallOutcomeName | string, companyName?: string): TranscriptLine[] {
  const company = companyName?.trim() || clientConfig().companyName;
  const named = contactName.startsWith("Test call") || contactName === "Unknown" ? "there" : contactName.split(" ")[0];
  if (outcome === "failed" || outcome === "no_answer") {
    return [
      {
        speaker: "agent",
        text: outcome === "no_answer" ? "No answer. The line rang out and no conversation took place." : "The call did not connect. No conversation took place.",
        atSec: 0,
      },
    ];
  }
  const lines: TranscriptLine[] = [
    { speaker: "agent", text: `Hi, this is ${agentName} with ${company}. Am I speaking with ${named}?`, atSec: 1 },
    { speaker: "contact", text: named === "there" ? "Yes, you've reached me." : `Yes, this is ${named}.`, atSec: 6 },
    {
      speaker: "agent",
      text: "Thanks for picking up. I can set a short introduction with an advisor. Would you like a time this week?",
      atSec: 12,
    },
  ];
  if (outcome === "booked") {
    lines.push(
      { speaker: "contact", text: "Yes. Tomorrow morning works if you have it.", atSec: 20 },
      { speaker: "agent", text: "You're booked. I'll put that on the advisor's calendar and we can let you go.", atSec: 28 },
    );
  } else if (outcome === "not_interested") {
    lines.push(
      { speaker: "contact", text: "No thanks, I'm not interested.", atSec: 20 },
      { speaker: "agent", text: "Understood. I won't keep you, and I'll note that today.", atSec: 26 },
    );
  } else if (outcome === "wrong_number") {
    lines.push({ speaker: "contact", text: "Wrong number. Please don't call again.", atSec: 8 });
  } else if (outcome === "voicemail") {
    return [{ speaker: "agent", text: `${agentName} left a short voicemail asking for a callback to schedule an introduction.`, atSec: 2 }];
  } else {
    lines.push(
      { speaker: "contact", text: "Now isn't a good time. Can someone call me back later?", atSec: 20 },
      { speaker: "agent", text: "Of course. I'll mark a callback request and we won't keep you.", atSec: 28 },
    );
  }
  return lines;
}
