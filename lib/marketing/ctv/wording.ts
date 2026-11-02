/** Staff see the dollar move. Clients never see money or the word budget. */
export function ctvRecommendationCopy(input: { staff: boolean; from: string; to: string; daily: number | null }) {
  if (!input.staff) {
    return "One audience is bringing more booked calls than another. Your Specificity team is reviewing it.";
  }
  const move = input.daily != null && Number.isFinite(input.daily)
    ? `Recommend: move $${input.daily}/day from ${input.from} to ${input.to}.`
    : `Recommend: move from ${input.from} to ${input.to}.`;
  return `${move} This needs your approval; Diver AI won't change budgets.`;
}

const CLIENT_MONEY = /budget|spend|cost|\$|\bbid\b/i;

export function ctvVisibleNote(note: string, staff: boolean) {
  if (staff || !CLIENT_MONEY.test(note)) return note;
  return "Your Specificity team is reviewing it.";
}
