import { forSpendViewer } from "../spend-access";
import { releaseCtvAttribution, type CtvAttributionPage } from "./attribution";
import { releaseCtvChannel, type CtvChannelPage, type CtvSurface } from "./channel";
import { ctvHttpDecision, ctvPayloadForViewer, type CtvView } from "./report";

/**
 * Staff CTV API body. Client owners and client viewers are refused.
 * Staff without cost access, and every attached channel or attribution page, lose spend and derived rates.
 */
export function answerCtvRequest(input: {
  enabled: boolean;
  kind: string;
  seesCost: boolean;
  role?: string;
  view: CtvView;
  channel?: CtvChannelPage | null;
  attribution?: CtvAttributionPage | null;
}) {
  const decision = ctvHttpDecision({ enabled: input.enabled, kind: input.kind, seesCost: input.seesCost });
  if (decision.status === 404) return { status: 404 as const, body: { error: "CTV attribution is turned off." } };
  if (decision.status === 403 || !decision.audience) return { status: 403 as const, body: { error: "CTV attribution is staff only." } };
  const channel = input.channel ? releaseCtvChannel(input.channel, decision.audience) : undefined;
  const attribution = input.attribution ? releaseCtvAttribution(input.attribution, decision.audience) : undefined;
  const body = forSpendViewer(
    {
      ...ctvPayloadForViewer(input.view, decision.audience),
      ...(channel ? { ctvChannel: channel } : {}),
      ...(attribution ? { ctvAttribution: attribution } : {}),
    },
    { role: input.role, kind: input.kind },
  );
  return { status: 200 as const, body };
}

export function releaseCtvSurface<T>(value: T, surface: CtvSurface) {
  return releaseCtvChannel(value, surface);
}
