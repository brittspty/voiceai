export type QuizAnswers = {
  q1?: string;
  q2?: string;
  q3?: string;
  q4?: string;
};

/**
 * Qualitative read of the budget-leak quiz. There is no score.
 * q1: who picks the audience (p platform, a agency, u own lists)
 * q2/q3/q4: n / s / y
 */
export function quizRead(answers: QuizAnswers): string[] | null {
  const order = [answers.q1, answers.q2, answers.q3, answers.q4];
  if (order.some((value) => !value)) return null;
  const [who, bots, why, retarget] = order;
  const lines: string[] = [];
  if (who === "p") {
    lines.push("Your audience is chosen by the platform. That is where guesswork starts. Building it from verified people first is the biggest fix.");
  }
  if (who === "a") {
    lines.push("Ask your agency where the audience comes from. If the answer is platform targeting, you are paying for its guess.");
  }
  if (bots !== "y") {
    lines.push("You can't see bot traffic, so some of your spend may be going to clicks that were never people.");
  }
  if (why !== "y") {
    lines.push("Results change without a reason you can act on. You deserve plain-English reasons for every change.");
  }
  if (retarget !== "y") {
    lines.push("You lose people between channels. Retargeting the same audience everywhere keeps you in front of them.");
  }
  if (!lines.length) {
    lines.push("You are ahead of most. Jarvis can still help you test segments against each other and explain every move.");
  }
  return lines;
}
