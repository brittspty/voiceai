import { CONSENT_SCOPE_VARIABLE, isConsentScope, type ConsentScope } from "./consent";

export function assertConsentScope(scope: string | null | undefined): asserts scope is ConsentScope {
  if (!isConsentScope(scope)) {
    throw new Error("Refusing to dial without a GoHighLevel consent scope");
  }
}

export function elevenLabsOutboundPayload(input: {
  agentId: string;
  agentPhoneNumberId: string;
  to: string;
  openingLine: string;
  consentScope: ConsentScope;
}) {
  assertConsentScope(input.consentScope);
  return {
    agent_id: input.agentId,
    agent_phone_number_id: input.agentPhoneNumberId,
    to_number: input.to,
    conversation_initiation_client_data: {
      dynamic_variables: {
        [CONSENT_SCOPE_VARIABLE]: input.consentScope,
      },
      conversation_config_override: {
        agent: { first_message: input.openingLine },
      },
    },
  };
}
