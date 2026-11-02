export const MISSING_TITLE = "We can't find that page";
export const MISSING_BODY = "The link may be old or typed wrong.";

export function missingPageHtml(signedIn: boolean) {
  const actions = signedIn
    ? `<a href="/" style="display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;background:#FF5800;color:#231F20;font-weight:600;text-decoration:none">Back to home</a>`
    : `<a href="/login" style="display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;background:#FF5800;color:#231F20;font-weight:600;text-decoration:none">Sign in</a> <a href="/" style="display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;border:1px solid #3A3435;color:#F4F1EF;text-decoration:none">Go to homepage</a>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${MISSING_TITLE}</title></head><body style="margin:0;min-height:100vh;background:#101012;color:#F4F1EF;font-family:Poppins,Segoe UI,sans-serif"><main style="min-height:100vh;display:grid;place-items:center;padding:16px"><section style="max-width:32rem;background:#231F20;border:1px solid #3A3435;border-radius:16px;padding:24px"><p style="margin:0;color:#9C9592">JAI</p><h1 style="margin:8px 0 0;font-size:1.5rem">${MISSING_TITLE}</h1><p style="margin:8px 0 0">${MISSING_BODY}</p><div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:16px">${actions}</div></section></main></body></html>`;
}
