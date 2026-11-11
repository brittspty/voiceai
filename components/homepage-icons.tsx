import { CLUSTER_LEFT, CLUSTER_RIGHT, MARKS, NET_RULE_INNER, type MarkName } from "@/components/homepage-marks";

export function Mark({ name, size }: { name: MarkName; size: number }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MARKS[name] }} />
  );
}

export function IconPlate({ name, size = 48 }: { name: MarkName; size?: number }) {
  return (
    <div className="ico-set" aria-hidden="true">
      <Mark name={name} size={size} />
    </div>
  );
}

export function FaqMark() {
  return (
    <svg className="faq-mark" viewBox="0 0 24 24" width={28} height={28} fill="none" aria-hidden="true" dangerouslySetInnerHTML={{ __html: MARKS["faq-mark"] }} />
  );
}

export function NetRule() {
  return (
    <div className="net-rule draw-in" aria-hidden="true">
      <svg
        className="draw-stroke"
        viewBox="0 0 1440 24"
        fill="none"
        strokeWidth={1.2}
        strokeLinecap="square"
        strokeLinejoin="round"
        preserveAspectRatio="xMidYMid meet"
        dangerouslySetInnerHTML={{ __html: NET_RULE_INNER }}
      />
    </div>
  );
}

export function NetCluster({ side }: { side: "left" | "right" }) {
  const left = side === "left";
  return (
    <svg
      className={left ? "net-cluster net-cluster-left draw-stroke" : "net-cluster draw-stroke"}
      viewBox="0 0 72 56"
      fill="none"
      strokeWidth={1.2}
      strokeLinecap="square"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: left ? CLUSTER_LEFT : CLUSTER_RIGHT }}
    />
  );
}
