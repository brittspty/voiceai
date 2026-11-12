/**
 * Homepage call-to-action labels. Rename these two strings and every button
 * and sentence that uses them follows. Jason owns the wording.
 */
export const BOOK_DEMO_LABEL = "Book a demo";
/** Homepage Book a demo form. The id is on the contact form. */
export const BOOK_DEMO_ANCHOR = "#contact" as const;
/** Same form, addressed from another page such as /demo/login. */
export const BOOK_DEMO_PATH = `/${BOOK_DEMO_ANCHOR}` as const;
export const TRY_DEMO_LABEL = "Try the demo";
/** Secondary line under the contact form. Same action as Try the demo. */
export const TRY_DEMO_FIRST_LABEL = "Or try the demo first";
/** Nav, hero, and footer link to the agency waitlist section. */
export const AGENCY_WAITLIST_LABEL = "Agency waitlist";
export const AGENCY_WAITLIST_HREF = "#agency-waitlist";
