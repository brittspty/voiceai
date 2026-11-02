import { SENSITIVE_CAPTURE_ATTRIBUTE, sensitiveCaptureClass } from "@/lib/analytics/capture";

type Tag = "span" | "div" | "td" | "article";

/** Blocks this subtree in session replay. Use around spend, names, emails, phones, and audience data. */
export function Sensitive({ as, className, children }: { as?: Tag; className?: string; children: React.ReactNode }) {
  const TagName = as ?? "span";
  return (
    <TagName className={sensitiveCaptureClass(className)} {...{ [SENSITIVE_CAPTURE_ATTRIBUTE]: "" }}>
      {children}
    </TagName>
  );
}
