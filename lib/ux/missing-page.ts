export const MISSING_TITLE = "We can't find that page";
export const MISSING_BODY = "The link may be old or typed wrong.";

export function missingPageHtml(signedIn: boolean) {
  const actions = signedIn
    ? `<a href="/">Back to home</a>`
    : `<a href="/login">Sign in</a> <a href="/">Go to homepage</a>`;
  return `<!doctype html><html lang="en"><body><main><h1>${MISSING_TITLE}</h1><p>${MISSING_BODY}</p>${actions}</main></body></html>`;
}
