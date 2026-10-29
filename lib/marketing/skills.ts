export type SkillOffer = {
  name: string;
  summary: string;
  source: string;
  sourceUrl: string;
  can: string[];
  cannot: string[];
  risk: "Low" | "Medium" | "High";
  riskReason: string;
};

export const OFFERED_SKILL: SkillOffer = {
  name: "Review reply drafts",
  summary: "Drafts a reply to each new review for a person to approve. It never posts on its own.",
  source: "Example help page, checked with this build",
  sourceUrl: "",
  can: ["Read new reviews", "Create draft replies an account manager must approve"],
  cannot: ["Post publicly", "Spend money", "Change budgets"],
  risk: "Low",
  riskReason: "Drafts only. A person still has to say yes.",
};

export function skillIsSafe(skill: SkillOffer) {
  const granted = skill.can.join(" ").toLowerCase();
  if (/budget|spend money|post publicly/.test(granted)) return false;
  if (!skill.source.trim()) return false;
  return skill.cannot.some((line) => /budget/i.test(line));
}
