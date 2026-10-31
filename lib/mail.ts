export async function sendInviteEmail(input: { to: string; name: string; link: string }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!key || !from) return { sent: false as const };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: "You're invited to Specificity",
      text: `Hi ${input.name},\n\nSet your password to join the workspace:\n${input.link}\n\nThis link works for 7 days.\n`,
    }),
  });
  return { sent: res.ok };
}

export async function sendHandoffEmail(input: { toEmail: string | null; toName: string; subject: string; body: string }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  if (!key || !from || !input.toEmail) return { sent: false as const };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.toEmail],
      subject: input.subject,
      text: `${input.body}\n`,
    }),
  });
  return { sent: res.ok };
}
